"""Pont entre outils MCP et noeuds PyFlowGraph.

L'idée tient en une phrase : **un noeud du graphe est un appel d'outil MCP**.

PyFlowGraph génère ses pins d'entrée et de sortie en lisant la signature et les
annotations de type de la fonction du noeud. Il suffit donc d'émettre une
fonction correctement annotée qui appelle l'outil — les pins, leurs types et
leurs couleurs viennent gratuitement.

Conséquence pour l'utilisateur : il assemble des boîtes à l'écran, l'agent
exécute le graphe sans interface, et le même fichier `.md` sert aux deux.

Le format émis ici est celui de PyFlowGraph (« FlowSpec ») :

    ## Node: <titre> (ID: <uuid>)
    <description>
    ### Metadata
    ```json
    {...}
    ```
    ### Logic
    ```python
    @node_entry
    def ...
    ```

Choix de conception : on écrit le Markdown nous-mêmes plutôt que d'importer le
gestionnaire de PyFlowGraph, parce que son paquet `data` tire PySide6 par son
`__init__`. Mais la fidélité du format n'est pas supposée — les tests relisent
notre sortie AVEC le parseur de PyFlowGraph, qui sert d'oracle.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field

# Types Python que PyFlowGraph colore nativement. Tout le reste passe en `str`,
# ce qui reste exécutable — un pin mal typé se voit, un pin absent bloque.
TYPES_CONNUS = ('int', 'str', 'float', 'bool', 'list', 'dict')

# Palette par famille d'outil, pour que le graphe se lise d'un coup d'oeil.
COULEURS = {
    'estimation': {'title': '#0d6efd', 'body': '#0a58ca'},
    'vm': {'title': '#6f42c1', 'body': '#59359a'},
    'graphe': {'title': '#198754', 'body': '#146c43'},
    'defaut': {'title': '#495057', 'body': '#343a40'},
}

_IDENTIFIANT_INVALIDE = re.compile(r'\W|^(?=\d)')


class ErreurPont(ValueError):
    """Un outil ne peut pas être transformé en noeud."""


@dataclass(frozen=True)
class Parametre:
    """Une entrée de l'outil, qui deviendra un pin d'entrée."""

    nom: str
    type_python: str = 'str'
    defaut: str | None = None

    def annotation(self) -> str:
        t = self.type_python if self.type_python in TYPES_CONNUS else 'str'
        return f'{nom_python(self.nom)}: {t}' + (
            f' = {self.defaut}' if self.defaut is not None else ''
        )


@dataclass(frozen=True)
class OutilMCP:
    """Description minimale d'un outil, suffisante pour émettre un noeud."""

    nom: str
    description: str = ''
    parametres: tuple[Parametre, ...] = ()
    type_retour: str = 'str'
    famille: str = 'defaut'
    identifiant: str = field(default='')

    def uuid(self) -> str:
        return self.identifiant or f'mcp-{self.nom.replace("_", "-")}'


def nom_python(brut: str) -> str:
    """Rend un nom utilisable comme identifiant Python.

    Les noms d'outils MCP peuvent contenir des points ou des tirets ; une
    signature invalide ferait échouer le noeud à l'exécution, pas au chargement,
    donc le problème se verrait tard.
    """
    nettoye = _IDENTIFIANT_INVALIDE.sub('_', brut)
    if not nettoye:
        raise ErreurPont(f'Nom inutilisable : {brut!r}.')
    return nettoye


def code_du_noeud(outil: OutilMCP) -> str:
    """Émet la fonction Python du noeud.

    C'est elle que PyFlowGraph analyse pour créer les pins. Le corps délègue au
    serveur MCP : le graphe ne réimplémente aucune logique métier, il l'appelle.
    """
    fonction = nom_python(outil.nom)
    signature = ', '.join(p.annotation() for p in outil.parametres)
    retour = outil.type_retour if outil.type_retour in TYPES_CONNUS else 'str'

    arguments = ', '.join(f'{p.nom!r}: {nom_python(p.nom)}' for p in outil.parametres)
    resume = outil.description.strip().replace('\n', ' ') or f'Appelle {outil.nom}.'

    return (
        'from gobby_vm.pont import appeler_outil\n'
        '\n'
        '\n'
        '@node_entry\n'
        f'def {fonction}({signature}) -> {retour}:\n'
        f'    """{resume}"""\n'
        f'    return appeler_outil({outil.nom!r}, {{{arguments}}})\n'
    )


def appeler_outil(nom: str, arguments: dict[str, object]) -> str:
    """Point d'entrée appelé depuis le corps d'un noeud à l'exécution.

    Résolu au moment de l'appel et non à l'import, pour qu'un graphe reste
    lisible et modifiable même là où le serveur n'est pas monté.
    """
    from gobby_vm.registre import resoudre  # noqa: PLC0415

    return resoudre(nom)(**arguments)


def noeud_depuis_outil(
    outil: OutilMCP,
    position: tuple[float, float] = (0.0, 0.0),
    taille: tuple[float, float] = (340.0, 260.0),
) -> dict[str, object]:
    """Construit le dictionnaire d'un noeud, prêt à être sérialisé."""
    return {
        'uuid': outil.uuid(),
        'title': outil.nom,
        'description': outil.description.strip(),
        'pos': [position[0], position[1]],
        'size': [taille[0], taille[1]],
        'code': code_du_noeud(outil),
        'colors': COULEURS.get(outil.famille, COULEURS['defaut']),
        'gui_state': {},
        'is_reroute': False,
    }


def graphe_depuis_outils(
    outils: list[OutilMCP],
    titre: str = 'Graphe MCP',
    description: str = '',
    espacement: float = 400.0,
) -> dict[str, object]:
    """Un graphe complet, un noeud par outil, sans connexions.

    Les noeuds sont posés en ligne pour être visibles d'emblée : un graphe dont
    tous les noeuds sont empilés en (0,0) paraît vide à l'ouverture.
    """
    noeuds = [
        noeud_depuis_outil(outil, position=(index * espacement, 0.0))
        for index, outil in enumerate(outils)
    ]
    return {
        'graph_title': titre,
        'graph_description': description,
        'nodes': noeuds,
        'groups': [],
        'connections': [],
    }


def _bloc_json(donnees: object) -> str:
    return '```json\n' + json.dumps(donnees, indent=2, ensure_ascii=False) + '\n```\n'


def _noeud_en_markdown(noeud: dict[str, object]) -> str:
    metadonnees = {c: v for c, v in noeud.items() if c != 'code'}
    parties = [f'## Node: {noeud["title"]} (ID: {noeud["uuid"]})\n']
    description = str(noeud.get('description') or '').strip()
    if description:
        parties.append(f'\n{description}\n')
    parties.append('\n### Metadata\n\n')
    parties.append(_bloc_json(metadonnees))
    parties.append('\n### Logic\n\n')
    parties.append('```python\n' + str(noeud.get('code', '')).rstrip() + '\n```\n')
    return ''.join(parties)


def vers_markdown(graphe: dict[str, object]) -> str:
    """Sérialise au format FlowSpec, celui que l'éditeur visuel sait ouvrir."""
    parties = [f'# {graphe.get("graph_title", "Graphe MCP")}\n\n']
    description = str(graphe.get('graph_description') or '').strip()
    if description:
        parties.append(f'{description}\n\n')

    # Un graphe malformé ne doit pas planter la sérialisation : on ignore ce
    # qui n'a pas la bonne forme plutôt que de lever au milieu du fichier.
    noeuds = graphe.get('nodes', [])
    if isinstance(noeuds, list):
        for noeud in noeuds:
            if isinstance(noeud, dict):
                parties.append(_noeud_en_markdown(noeud))
                parties.append('\n')

    parties.append('## Connections\n\n')
    parties.append(_bloc_json(graphe.get('connections', [])))
    return ''.join(parties)


def connecter(
    source: str,
    pin_sortie: str,
    cible: str,
    pin_entree: str,
) -> dict[str, str]:
    """Un lien entre deux noeuds, au format attendu par PyFlowGraph."""
    return {
        'start_node_uuid': source,
        'start_pin_name': pin_sortie,
        'end_node_uuid': cible,
        'end_pin_name': pin_entree,
    }


def chainer(uuids: list[str]) -> list[dict[str, str]]:
    """Relie les noeuds en séquence par leurs pins d'exécution.

    C'est le câblage le plus courant — « fais ceci, puis cela » — et celui que
    l'utilisateur attend par défaut quand il aligne des boîtes.
    """
    return [
        connecter(uuids[i], 'exec_out', uuids[i + 1], 'exec_in')
        for i in range(len(uuids) - 1)
    ]


def nouvel_uuid() -> str:
    return str(uuid.uuid4())
