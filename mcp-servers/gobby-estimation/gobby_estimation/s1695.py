"""Données lues sur le relevé S-1695 — Hotel Playground, Kahnawake.

Source unique : un scan 300 dpi du rapport « Produit par ACCEO Estimation »
de Daniel Dupuis. Rien ici n'est calculé ni deviné : ce sont des chiffres
recopiés du papier. Tout ce qui s'en écarte appartient aux tests, pas à ce
fichier.

Le garde anti-reconstruction est la raison d'être du module : sans lui, une
reconstruction plausible finit par se faire citer comme « ce que dit ACCEO ».
Les constantes ci-dessous sont donc les seules valeurs auxquelles le test doré
a le droit de se comparer.

Pour réimprimer le rapport reconstruit — la page qu'on met à côté du scan :

    python3 -m gobby_estimation.s1695 > S-1695_reconstruction.txt
"""

from __future__ import annotations

from decimal import Decimal

from gobby_estimation.modeles import (
    Chapitre,
    ConfigCalcul,
    Ligne,
    NatureCout,
    Soumission,
    TauxHoraire,
    UniteMO,
)

# --- Observé : sommaire de soumission --------------------------------------
MATERIEL_COUTANT = Decimal('397308.56')
SERVICE_COUTANT = Decimal('806850.00')
GRAND_TOTAL_PUBLIE = Decimal('1204158.59')

# --- Observé : contrôle de cohérence ---------------------------------------
HEURES_CHARGEES = Decimal('8150.000')
HEURES_RELEVEES = Decimal('8106.286')
BALANCE_IMPRIMEE = Decimal('-43.714')

# --- Observé : taux et marges de ce tirage ---------------------------------
# Administration et Profit sont à 0,00 % : c'est un tirage intermédiaire, pas
# la soumission déposée. Le taux se déduit exactement de 806 850 / 8150.
TAUX_HORAIRE = Decimal('99.00')

# --- Observé : unités de main-d'oeuvre des luminaires -----------------------
# Relevées telles quelles sur la page des luminaires. Les D1 croissent avec la
# longueur, ce qui confirme que le temps unitaire est bien par unité ici.
UNITES_LUMINAIRES: dict[str, Decimal] = {
    'A': Decimal('0.750'),
    'B': Decimal('0.650'),
    'C1': Decimal('0.850'),
    'C2': Decimal('1.000'),
    'D2': Decimal('1.000'),
    'D4': Decimal('1.000'),
    'E1': Decimal('1.000'),
    'D1-6pi': Decimal('0.850'),
    'D1-9pi': Decimal('0.900'),
    'D1-10a13pi': Decimal('1.000'),
    'D1-14pi': Decimal('1.250'),
    'D1-22pi': Decimal('2.000'),
}

# Quantités relevées, en unités.
QUANTITES_LUMINAIRES: dict[str, Decimal] = {
    'A1': Decimal('823'),
    'B2': Decimal('198'),
    'B4': Decimal('179'),
    'A2': Decimal('168'),
    'B1': Decimal('168'),
}

# --- Observé : systèmes de la liste manuscrite, page 1 ---------------------
SYSTEMES = (
    'ECLAIRAGE',
    'DISTRIBUTION',
    'CONTROL ECLAIRAGE',
    'CHAUFFAGE',
    'ALARME INCENDIE',
    'TEL/DATA',
    'SECURITE/CAMERA',
    'TEMPORAIRE',
)

PROVENANCE_TAUX = (
    'S-1695, sommaire de soumission : Service coûtant 806 850,00 $ pour '
    '8150,000 h chargées. Décomposition du taux inconnue.'
)
PROVENANCE_HEURES = (
    'S-1695, contrôle de cohérence : 8150,000 h chargées contre 8106,286 h au '
    'relevé — arrondi au 50 h supérieur, ou rétro-calcul depuis un prix cible.'
)


def config_s1695() -> ConfigCalcul:
    """La configuration de ce tirage : marges nulles, taxes non appliquées."""
    return ConfigCalcul(
        taux_horaire=TauxHoraire.suppose_sans_marge(TAUX_HORAIRE, PROVENANCE_TAUX),
        heures_chargees=HEURES_CHARGEES,
        provenance_heures_chargees=PROVENANCE_HEURES,
    )


def soumission_agregee() -> Soumission:
    """La soumission reconstruite AU NIVEAU DU SOMMAIRE, pas des 300 lignes.

    Le détail ligne à ligne n'est pas dans le scan : seules les pages sommaire
    le sont. Reconstituer 300 lignes pour arriver à 397 308,56 $ fabriquerait
    des données qui n'existent pas et ferait passer une invention pour une
    observation. On saisit donc les totaux publiés tels quels, et le test doré
    ne vérifie que ce que le sommaire permet de vérifier : l'arithmétique
    entre les totaux, le taux, les heures et le grand total.
    """
    return Soumission(
        numero='S-1695',
        nom='Hotel Playground, Kahnawake',
        config=config_s1695(),
        chapitres=(
            Chapitre(
                code='RELEVE',
                nom='RELEVÉ DE MATÉRIEL (totaux publiés)',
                lignes=(
                    Ligne(
                        description='Matériel du relevé — total publié au sommaire',
                        quantite=Decimal('1'),
                        um='lot',
                        prix_unitaire=MATERIEL_COUTANT,
                        temps_unitaire=HEURES_RELEVEES,
                        unite_mo=UniteMO.U,
                        nature=NatureCout.MATERIEL,
                    ),
                ),
            ),
        ),
    )


def chapitre_eclairage_observe() -> Chapitre:
    """Les luminaires réellement lus, avec leurs unités réellement lues."""
    unite = {
        'A1': UNITES_LUMINAIRES['A'],
        'A2': UNITES_LUMINAIRES['A'],
        'B1': UNITES_LUMINAIRES['B'],
        'B2': UNITES_LUMINAIRES['B'],
        'B4': UNITES_LUMINAIRES['B'],
    }
    return Chapitre(
        code='CH01',
        nom='ECLAIRAGE',
        lignes=tuple(
            Ligne(
                description=f'FIXTURE TYPE {code}',
                quantite=quantite,
                um='U',
                temps_unitaire=unite[code],
                unite_mo=UniteMO.U,
                nature=NatureCout.MATERIEL,
            )
            for code, quantite in QUANTITES_LUMINAIRES.items()
        ),
    )


def main() -> None:
    """Imprime le rapport reconstruit, en fr-CA, sur la sortie standard."""
    # Import local : le module de données ne doit pas dépendre du moteur pour
    # être lisible ni pour servir de référence aux tests.
    from gobby_estimation.formatage import rapport
    from gobby_estimation.sommaire import calculer

    print(rapport(calculer(soumission_agregee())), end='')


if __name__ == '__main__':
    main()
