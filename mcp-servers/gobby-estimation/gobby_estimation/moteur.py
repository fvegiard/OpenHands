"""Calcul des lignes et des chapitres — l'enchaînement imprimé par ACCEO.

Le sommaire de chapitre du rapport S-1695 enchaîne exactement ceci :

    Sous-total  →  × Facteur de m-d  →  Total ajusté  →  × Mult Bloc  →  Total

Deux règles gouvernent quel facteur touche quoi :

* le **facteur de m-d** est un facteur de PRODUCTIVITÉ : il multiplie les
  heures et rien d'autre. Un électricien plus lent ne fait pas monter le prix
  du fil ;
* le **Mult Bloc** est une répétition PHYSIQUE : répéter quatorze fois un
  étage répète son matériel autant que ses heures, donc il multiplie les trois
  axes.

Aucune quantification n'a lieu ici. La pleine précision court de la ligne
jusqu'au grand total ; l'arrondi appartient à l'impression (`formatage`).
C'est ce qui explique le résidu de 0,03 $ observé sur S-1695 entre la somme
des extensions imprimées et le total publié.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from gobby_estimation.decimales import UN, ZERO
from gobby_estimation.modeles import (
    Axe,
    Chapitre,
    Ligne,
    SeauACCEO,
)


# Un compteur par seau, initialisé à zéro pour les trois — un sommaire qui
# omet une ligne parce qu'elle vaut 0 se lit comme un oubli.
def _seaux_vides() -> dict[SeauACCEO, Decimal]:
    return {seau: ZERO for seau in SeauACCEO}


@dataclass(frozen=True)
class ResultatLigne:
    """Une ligne calculée, ses deux axes séparés."""

    ligne: Ligne
    quantite_achetee: Decimal
    montant: Decimal
    heures: Decimal

    @property
    def axe(self) -> Axe:
        return self.ligne.axe_prix

    @property
    def seau(self) -> SeauACCEO:
        return self.ligne.nature.seau


def calculer_ligne(ligne: Ligne) -> ResultatLigne:
    """Étend une ligne sur ses deux axes.

    La perte augmente la quantité ACHETÉE, pas la quantité posée : on paie les
    retailles, on ne les installe pas. Appliquer la perte aux heures aussi
    gonflerait la main-d'oeuvre de 3 à 10 % sans raison.
    """
    quantite_achetee = ligne.quantite * (UN + ligne.facteur_perte)
    montant = quantite_achetee * ligne.prix_unitaire / ligne.unite_prix.diviseur
    heures = ligne.quantite * ligne.temps_unitaire / ligne.base_mo.diviseur
    return ResultatLigne(
        ligne=ligne,
        quantite_achetee=quantite_achetee,
        montant=montant,
        heures=heures,
    )


@dataclass(frozen=True)
class ResultatChapitre:
    """Les cinq colonnes du sommaire de chapitre, pour chacun des trois axes."""

    chapitre: Chapitre
    lignes: tuple[ResultatLigne, ...]

    # Argent, par seau. `deja_vendu` est la part dont le prix saisi est déjà du
    # vendant : elle ne doit plus recevoir de marge au sommaire.
    sous_total: dict[SeauACCEO, Decimal]
    sous_total_deja_vendu: dict[SeauACCEO, Decimal]

    # Heures : les trois colonnes du bloc main-d'oeuvre.
    sous_total_heures: Decimal
    heures_ajustees: Decimal
    total_heures: Decimal

    @property
    def total(self) -> dict[SeauACCEO, Decimal]:
        """Colonne « Total » : le sous-total répété par le Mult Bloc."""
        mult = self.chapitre.mult_bloc
        return {seau: montant * mult for seau, montant in self.sous_total.items()}

    @property
    def total_deja_vendu(self) -> dict[SeauACCEO, Decimal]:
        mult = self.chapitre.mult_bloc
        return {
            seau: montant * mult for seau, montant in self.sous_total_deja_vendu.items()
        }

    @property
    def total_argent(self) -> Decimal:
        """Somme des trois seaux, pour la colonne d'ensemble du chapitre."""
        return sum(self.total.values(), ZERO)


def calculer_chapitre(chapitre: Chapitre) -> ResultatChapitre:
    """Applique les deux facteurs du chapitre, chacun à ce qu'il touche."""
    lignes = tuple(calculer_ligne(ligne) for ligne in chapitre.lignes)

    sous_total = _seaux_vides()
    deja_vendu = _seaux_vides()
    heures = ZERO

    for resultat in lignes:
        sous_total[resultat.seau] += resultat.montant
        if resultat.axe is Axe.VENDANT:
            deja_vendu[resultat.seau] += resultat.montant
        heures += resultat.heures

    heures_ajustees = heures * chapitre.facteur_md

    return ResultatChapitre(
        chapitre=chapitre,
        lignes=lignes,
        sous_total=sous_total,
        sous_total_deja_vendu=deja_vendu,
        sous_total_heures=heures,
        heures_ajustees=heures_ajustees,
        total_heures=heures_ajustees * chapitre.mult_bloc,
    )
