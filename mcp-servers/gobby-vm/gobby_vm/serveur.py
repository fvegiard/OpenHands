"""Serveur MCP unifié : dispatch d'agents autonomes et composition visuelle.

Ce que ça donne, concrètement : tu demandes un graphe de tes outils, tu obtiens
un fichier `.md` que tu ouvres dans l'éditeur visuel pour assembler des boîtes,
et l'agent l'exécute ensuite sans interface.

La boucle se referme ici : `graphe_depuis_outils` interroge le serveur sur ses
PROPRES outils et les transforme en noeuds. Aucune liste à tenir à jour — tout
outil ajouté devient un noeud disponible au prochain appel.

Suit le patron de `openhands/integrations/claude_desktop/mcp_stdio.py` :
fabrique `build_server()` exposée pour les tests, journalisation sur stderr
parce que stdout porte le protocole MCP, puis `run(transport='stdio')`.
"""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastmcp import FastMCP

from gobby_vm import registre
from gobby_vm.dispatch import (
    ErreurDispatch,
    OptionsDispatch,
    dispatcher,
    lister_agents,
    statut,
    url_vue,
)
from gobby_vm.pont import (
    OutilMCP,
    Parametre,
    chainer,
    vers_markdown,
)
from gobby_vm.pont import (
    graphe_depuis_outils as construire_graphe,
)

logger = logging.getLogger('gobby-vm')

# JSON Schema -> annotation Python que PyFlowGraph sait colorer.
TYPES_JSON = {
    'string': 'str',
    'integer': 'int',
    'number': 'float',
    'boolean': 'bool',
    'array': 'list',
    'object': 'dict',
}

# Outils qui ne deviennent pas des noeuds : mettre « fabrique un graphe » dans
# un graphe n'apporte rien et encombre le canevas.
NON_NOEUDS = frozenset({'graphe_depuis_outils', 'graphe_lire', 'vm_vue'})


@dataclass(frozen=True)
class ConfigServeur:
    """Réglages du serveur, tous surchargés par l'environnement."""

    repertoire_graphes: Path = Path.home() / '.gobby' / 'graphes'
    binaire_claude: str = 'claude'
    mode_permission_defaut: str = 'acceptEdits'

    @classmethod
    def depuis_env(cls, env: dict[str, str] | None = None) -> ConfigServeur:
        e = env if env is not None else dict(os.environ)
        return cls(
            repertoire_graphes=Path(
                e.get('GOBBY_VM_GRAPHES', str(cls.repertoire_graphes))
            ),
            binaire_claude=e.get('GOBBY_VM_CLAUDE', 'claude'),
            mode_permission_defaut=e.get('GOBBY_VM_MODE', 'acceptEdits'),
        )


def famille_de(nom: str) -> str:
    """Déduit la famille d'un outil de son préfixe, pour la couleur du noeud."""
    return nom.split('_', 1)[0] if '_' in nom else 'defaut'


def parametres_depuis_schema(schema: dict[str, Any] | None) -> tuple[Parametre, ...]:
    """Traduit le schéma JSON d'un outil en pins d'entrée.

    Un paramètre optionnel reçoit une valeur par défaut dans la signature
    générée, sinon le noeud exigerait un pin branché pour chaque champ
    facultatif — inutilisable à l'écran.
    """
    if not schema:
        return ()

    proprietes = schema.get('properties') or {}
    requis = set(schema.get('required') or ())

    parametres: list[Parametre] = []
    for nom, definition in proprietes.items():
        if not isinstance(definition, dict):
            continue
        type_json = definition.get('type')
        if isinstance(type_json, list):  # ex. ["string", "null"]
            type_json = next((t for t in type_json if t != 'null'), 'string')
        type_python = TYPES_JSON.get(str(type_json), 'str')

        defaut = None
        if nom not in requis:
            brut = definition.get('default')
            defaut = (
                repr(brut) if isinstance(brut, str | int | float | bool) else 'None'
            )

        parametres.append(Parametre(nom=nom, type_python=type_python, defaut=defaut))
    return tuple(parametres)


def build_server(config: ConfigServeur | None = None) -> FastMCP[Any]:
    """Fabrique le serveur. Exposée pour les tests, qui l'appellent en processus."""
    cfg = config or ConfigServeur.depuis_env()
    mcp: FastMCP[Any] = FastMCP('gobby-vm')

    @mcp.tool()
    async def vm_dispatcher(
        tache: str,
        mode_permission: str = '',
        modele: str = '',
        persona: str = '',
        repertoires: list[str] | None = None,
        mcp_configs: list[str] | None = None,
    ) -> dict[str, Any]:
        """Lance une session Claude Code autonome et rend la main immédiatement.

        La session travaille seule et livre quand elle a terminé. L'identifiant
        retourné est interrogeable tout de suite avec vm_statut.
        """
        options = OptionsDispatch(
            mode_permission=mode_permission or cfg.mode_permission_defaut,
            modele=modele or None,
            persona=persona or None,
            repertoires=tuple(repertoires or ()),
            mcp_configs=tuple(mcp_configs or ()),
            binaire=cfg.binaire_claude,
        )
        envoi = dispatcher(tache, options)
        return envoi.en_dict()

    @mcp.tool()
    async def vm_statut(session_id: str) -> dict[str, Any]:
        """État d'une session autonome lancée par vm_dispatcher."""
        return statut(session_id, binaire=cfg.binaire_claude)

    @mcp.tool()
    async def vm_sessions() -> list[dict[str, Any]]:
        """Toutes les sessions connues, actives et terminées."""
        return lister_agents(binaire=cfg.binaire_claude)

    @mcp.tool()
    async def vm_vue() -> dict[str, Any]:
        """Adresse noVNC pour regarder la machine travailler."""
        adresse = url_vue()
        return {
            'vue': adresse,
            'note': (
                'Définir GOBBY_VM_VNC_HOST pour activer la vue.'
                if adresse is None
                else 'Ouvrir cette adresse dans un navigateur.'
            ),
        }

    @mcp.tool()
    async def graphe_depuis_outils(
        titre: str = 'Graphe MCP',
        outils: list[str] | None = None,
        chainer_en_sequence: bool = True,
        nom_fichier: str = '',
    ) -> dict[str, Any]:
        """Fabrique un graphe visuel à partir des outils de ce serveur.

        Chaque outil devient un noeud dont les pins viennent de sa signature.
        Écrit un fichier .md ouvrable dans l'éditeur PyFlowGraph.
        """
        # FastMCP expose une séquence, pas un dict : on indexe par nom.
        disponibles = {outil.name: outil for outil in await mcp.list_tools()}

        choisis = [
            nom
            for nom in (outils or sorted(disponibles))
            if nom in disponibles and nom not in NON_NOEUDS
        ]
        if not choisis:
            connus = ', '.join(sorted(set(disponibles) - NON_NOEUDS))
            raise ValueError(f'Aucun outil retenu. Disponibles : {connus}.')

        descriptions: list[OutilMCP] = []
        for nom in choisis:
            outil = disponibles[nom]
            schema = getattr(outil, 'parameters', None)
            descriptions.append(
                OutilMCP(
                    nom=nom,
                    description=(getattr(outil, 'description', '') or '').strip(),
                    parametres=parametres_depuis_schema(schema),
                    famille=famille_de(nom),
                )
            )

        graphe = construire_graphe(descriptions, titre=titre)
        if chainer_en_sequence:
            graphe['connections'] = chainer([o.uuid() for o in descriptions])

        markdown = vers_markdown(graphe)

        cfg.repertoire_graphes.mkdir(parents=True, exist_ok=True)
        fichier = cfg.repertoire_graphes / (
            nom_fichier or f'{titre.lower().replace(" ", "_")}.md'
        )
        fichier.write_text(markdown, encoding='utf-8')

        return {
            'fichier': str(fichier),
            'noeuds': [o.nom for o in descriptions],
            'connexions': len(graphe['connections']),  # type: ignore[arg-type]
        }

    @mcp.tool()
    async def graphe_lire(chemin: str) -> str:
        """Contenu d'un graphe déjà écrit."""
        fichier = Path(chemin)
        if not fichier.exists():
            raise ValueError(f'Graphe introuvable : {chemin}')
        return fichier.read_text(encoding='utf-8')

    return mcp


async def enregistrer_outils_pour_graphes(mcp: FastMCP[Any]) -> None:
    """Rend les outils du serveur appelables depuis le corps d'un noeud.

    Sans ça, un graphe exécuté hors du serveur trouverait un registre vide.
    """
    for outil in await mcp.list_tools():
        fonction = getattr(outil, 'fn', None)
        if callable(fonction):
            registre.enregistrer(outil.name, fonction)


def main() -> None:
    """Point d'entrée stdio."""
    logging.basicConfig(
        level=os.environ.get('GOBBY_VM_LOG', 'INFO').upper(),
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        # stdout est réservé au protocole MCP : y écrire corrompt le flux.
        stream=sys.stderr,
    )
    try:
        build_server().run(transport='stdio')
    except ErreurDispatch as err:
        logger.error('Démarrage impossible : %s', err)
        raise


if __name__ == '__main__':
    main()
