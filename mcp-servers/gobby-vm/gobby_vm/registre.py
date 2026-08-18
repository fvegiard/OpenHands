"""Registre des outils appelables depuis un noeud de graphe.

Le corps d'un noeud généré appelle `pont.appeler_outil(nom, arguments)`, qui
délègue ici. Séparer les deux permet d'exécuter un graphe dans un processus où
le serveur MCP complet n'est pas monté — utile pour tester un graphe sans
démarrer toute la machinerie.
"""

from __future__ import annotations

from collections.abc import Callable

_OUTILS: dict[str, Callable[..., object]] = {}


class OutilInconnu(KeyError):
    """Le graphe référence un outil qui n'est pas enregistré."""


def enregistrer(nom: str, fonction: Callable[..., object]) -> None:
    _OUTILS[nom] = fonction


def resoudre(nom: str) -> Callable[..., object]:
    """Retrouve un outil, ou explique clairement ce qui manque.

    Un graphe peut être écrit avant que l'outil existe ; le message doit donc
    dire quoi enregistrer, pas seulement que ça a échoué.
    """
    try:
        return _OUTILS[nom]
    except KeyError:
        connus = ', '.join(sorted(_OUTILS)) or 'aucun'
        raise OutilInconnu(
            f'Outil {nom!r} non enregistré. Outils disponibles : {connus}. '
            f'Enregistrer avec registre.enregistrer({nom!r}, fonction).'
        ) from None


def enregistres() -> tuple[str, ...]:
    return tuple(sorted(_OUTILS))


def vider() -> None:
    """Remet le registre à zéro. Réservé aux tests."""
    _OUTILS.clear()
