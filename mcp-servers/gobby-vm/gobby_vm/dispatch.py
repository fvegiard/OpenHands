"""Dispatch de sessions Claude Code autonomes, et suivi de leur avancement.

Le CLI fait déjà le gros du travail : `claude --bg` démarre une session en
arrière-plan et rend la main immédiatement, et `claude agents --json` liste les
sessions sans exiger de TTY. Il n'y a donc pas de gestionnaire de tâches à
écrire — seulement à envelopper proprement.

Toutes les options utilisées ici ont été relevées dans l'aide du binaire
installé, pas dans la documentation :

    --bg                    démarre en arrière-plan et retourne immédiatement
    -p / --print            non interactif
    --session-id <uuid>     identifiant choisi d'avance, donc suivi déterministe
    --permission-mode       acceptEdits | auto | bypassPermissions | manual
                            | dontAsk | plan
    --mcp-config <configs>  serveurs MCP fournis à la session dispatchée
    --append-system-prompt  la persona
    --add-dir <dirs>        répertoires supplémentaires accessibles
    agents --json [--all]   sessions actives (--all inclut les terminées)

Le point important du `--session-id` : l'identifiant existe AVANT que l'agent
démarre, donc `statut()` et `livrable()` sont interrogeables dès la seconde qui
suit le dispatch, sans course.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from dataclasses import dataclass, field

# Relevés dans `claude --help`. Toute autre valeur est refusée avant de lancer
# un sous-processus, pour que l'erreur soit lisible plutôt qu'un exit code nu.
MODES_PERMISSION = (
    'acceptEdits',
    'auto',
    'bypassPermissions',
    'manual',
    'dontAsk',
    'plan',
)

DEFAUT_BINAIRE = 'claude'


class ErreurDispatch(RuntimeError):
    """Le dispatch n'a pas pu être préparé ou exécuté."""


@dataclass(frozen=True)
class Dispatch:
    """Une session autonome lancée, identifiée avant même son démarrage."""

    session_id: str
    commande: tuple[str, ...]
    vue: str | None = None

    def en_dict(self) -> dict[str, object]:
        return {
            'session_id': self.session_id,
            'commande': list(self.commande),
            'vue': self.vue,
        }


@dataclass(frozen=True)
class OptionsDispatch:
    """Ce qu'on laisse choisir à l'appelant."""

    mode_permission: str = 'acceptEdits'
    modele: str | None = None
    persona: str | None = None
    agent: str | None = None
    repertoires: tuple[str, ...] = ()
    mcp_configs: tuple[str, ...] = ()
    binaire: str = DEFAUT_BINAIRE
    extra: tuple[str, ...] = field(default=())


def nouvel_identifiant() -> str:
    """Un UUID frappé d'avance : le suivi ne dépend pas du démarrage."""
    return str(uuid.uuid4())


def construire_commande(
    tache: str,
    session_id: str,
    options: OptionsDispatch | None = None,
) -> tuple[str, ...]:
    """Assemble la ligne de commande. Fonction pure, donc testable sans exécuter.

    Séparer la construction de l'exécution est ce qui permet de vérifier la
    commande sans lancer d'agent — et de la montrer à l'utilisateur avant de la
    lancer.
    """
    opts = options or OptionsDispatch()

    if not tache.strip():
        raise ErreurDispatch('La tâche est vide.')

    if opts.mode_permission not in MODES_PERMISSION:
        attendus = ', '.join(MODES_PERMISSION)
        raise ErreurDispatch(
            f'Mode de permission inconnu : {opts.mode_permission!r}. '
            f'Valeurs acceptées : {attendus}.'
        )

    cmd: list[str] = [
        opts.binaire,
        '--bg',
        '--print',
        '--session-id',
        session_id,
        '--permission-mode',
        opts.mode_permission,
    ]

    if opts.modele:
        cmd += ['--model', opts.modele]
    if opts.agent:
        cmd += ['--agent', opts.agent]
    if opts.persona:
        cmd += ['--append-system-prompt', opts.persona]
    for repertoire in opts.repertoires:
        cmd += ['--add-dir', repertoire]
    for config in opts.mcp_configs:
        cmd += ['--mcp-config', config]
    cmd += list(opts.extra)

    # La tâche en dernier : c'est l'argument positionnel `prompt`.
    cmd.append(tache)
    return tuple(cmd)


def url_vue(env: dict[str, str] | None = None) -> str | None:
    """Adresse noVNC pour regarder la VM travailler.

    Rien n'est deviné : si l'hôte n'est pas configuré, on retourne None plutôt
    qu'une URL plausible mais fausse.
    """
    e = env if env is not None else dict(os.environ)
    hote = e.get('GOBBY_VM_VNC_HOST')
    if not hote:
        return None
    port = e.get('GOBBY_VM_VNC_PORT', '6080')
    chemin = e.get('GOBBY_VM_VNC_PATH', '/vnc.html')
    return f'http://{hote}:{port}{chemin}'


def _executer(cmd: tuple[str, ...], timeout: float) -> subprocess.CompletedProcess[str]:
    if shutil.which(cmd[0]) is None:
        raise ErreurDispatch(
            f'Binaire introuvable : {cmd[0]!r}. Installer Claude Code, ou passer '
            f'un chemin explicite via OptionsDispatch(binaire=...).'
        )
    try:
        return subprocess.run(  # noqa: S603
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as err:
        raise ErreurDispatch(f'Délai dépassé après {timeout} s : {cmd[0]}.') from err


def dispatcher(
    tache: str,
    options: OptionsDispatch | None = None,
    *,
    session_id: str | None = None,
    timeout: float = 60.0,
    env: dict[str, str] | None = None,
) -> Dispatch:
    """Lance une session autonome et rend la main tout de suite."""
    sid = session_id or nouvel_identifiant()
    cmd = construire_commande(tache, sid, options)

    resultat = _executer(cmd, timeout)
    if resultat.returncode != 0:
        detail = (resultat.stderr or resultat.stdout or '').strip()
        raise ErreurDispatch(
            f'Le dispatch a échoué (code {resultat.returncode}). {detail}'
        )

    return Dispatch(session_id=sid, commande=cmd, vue=url_vue(env))


def analyser_agents(sortie: str) -> list[dict[str, object]]:
    """Interprète la sortie de `claude agents --json`.

    Tolérant au bruit : le CLI peut préfixer des lignes de journal avant le
    JSON, donc on repart du premier crochet ouvrant plutôt que de supposer que
    la sortie est du JSON pur.
    """
    texte = sortie.strip()
    if not texte:
        return []

    debut = texte.find('[')
    if debut == -1:
        raise ErreurDispatch(f'Sortie inattendue de `agents --json` : {texte[:200]!r}')

    try:
        # On découpe à partir du premier crochet, donc le décodage rend une
        # liste ou lève : inutile de revérifier le type ensuite.
        donnees = json.loads(texte[debut:])
    except json.JSONDecodeError as err:
        raise ErreurDispatch(
            f'JSON illisible depuis `agents --json` : {texte[debut : debut + 200]!r}'
        ) from err

    return [element for element in donnees if isinstance(element, dict)]


def lister_agents(
    *,
    inclure_terminees: bool = True,
    cwd: str | None = None,
    binaire: str = DEFAUT_BINAIRE,
    timeout: float = 30.0,
) -> list[dict[str, object]]:
    """Toutes les sessions connues du CLI."""
    cmd: list[str] = [binaire, 'agents', '--json']
    if inclure_terminees:
        cmd.append('--all')
    if cwd:
        cmd += ['--cwd', cwd]

    resultat = _executer(tuple(cmd), timeout)
    if resultat.returncode != 0:
        detail = (resultat.stderr or '').strip()
        raise ErreurDispatch(f'`agents --json` a échoué : {detail}')
    return analyser_agents(resultat.stdout)


def _identifiant_de(agent: dict[str, object]) -> str | None:
    """Retrouve l'identifiant quelle que soit la clé utilisée par le CLI.

    Le schéma de `agents --json` n'est pas un contrat public ; on accepte donc
    plusieurs noms plutôt que de casser au premier renommage.
    """
    for cle in ('session_id', 'sessionId', 'id', 'uuid'):
        valeur = agent.get(cle)
        if isinstance(valeur, str) and valeur:
            return valeur
    return None


def statut(session_id: str, **kwargs: object) -> dict[str, object]:
    """État d'une session dispatchée.

    Retourne toujours un dict : une session inconnue n'est pas une erreur, elle
    peut simplement ne pas encore être apparue dans la liste.
    """
    agents = lister_agents(**kwargs)  # type: ignore[arg-type]
    for agent in agents:
        if _identifiant_de(agent) == session_id:
            return {'session_id': session_id, 'trouve': True, 'agent': agent}
    return {
        'session_id': session_id,
        'trouve': False,
        'agent': None,
        'note': (
            'Session absente de `claude agents --json`. Elle vient peut-être '
            "d'être lancée, ou elle a été purgée."
        ),
    }
