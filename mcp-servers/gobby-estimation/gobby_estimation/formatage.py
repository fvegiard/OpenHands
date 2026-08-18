"""Impression fr-CA et rapport au format ACCEO.

C'est ici, et seulement ici, qu'on arrondit. Le calcul court en pleine
précision jusqu'au grand total ; l'impression quantifie. Inverser les deux est
ce qui fabrique des écarts de cents qu'on passe ensuite des heures à chasser.

Le rapport produit ici est le livrable qui compte : une page qu'on met à côté
du relevé de Daniel et qu'on compare ligne à ligne. Un `pytest` vert ne
convainc personne ; « 1 204 158,56 $ » à côté de « 1 204 158,59 $ », oui.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from gobby_estimation.decimales import (
    q_argent,
    q_heures,
    q_pourcent,
    q_prix_unitaire,
    q_quantite,
)
from gobby_estimation.modeles import SeauACCEO

if TYPE_CHECKING:  # `coherence` importe ce module pour ses primitives ; un
    # import réel de `sommaire` ici fermerait le cycle.
    from gobby_estimation.sommaire import Sommaire

# Espace fine insécable : le séparateur de milliers du français du Canada.
# C'est celui qu'impriment les rapports ACCEO ; utiliser une espace ordinaire
# laisse le nombre se couper en fin de ligne.
FINE = ' '

# Le chapitre occupe deux rangées : l'argent, puis les heures. Cette
# étiquette entre dans le calcul de largeur de la première colonne.
SOUS_LIGNE_MO = '  main-d’oeuvre'


def _grouper(entier: str) -> str:
    signe, chiffres = ('-', entier[1:]) if entier.startswith('-') else ('', entier)
    tranches: list[str] = []
    while len(chiffres) > 3:
        tranches.insert(0, chiffres[-3:])
        chiffres = chiffres[:-3]
    tranches.insert(0, chiffres)
    return signe + FINE.join(tranches)


def nombre_fr(valeur: Decimal, decimales_min: int = 0) -> str:
    """Écrit un Decimal déjà quantifié à la québécoise, sans unité.

    `decimales_min` sert aux valeurs qu'ACCEO imprime toujours garnies :
    « 0,00 % » et « ×1,00 » se lisent comme des réglages assumés, « 0 % » et
    « ×1 » se lisent comme des champs vides.
    """
    texte = format(valeur, 'f')
    entier, _, decimales = texte.partition('.')
    decimales = decimales.ljust(decimales_min, '0')
    groupe = _grouper(entier)
    return f'{groupe},{decimales}' if decimales else groupe


def facteur_fr(valeur: Decimal) -> str:
    """« ×1,00 », « ×14,00 » — les deux colonnes de facteurs du sommaire."""
    return f'×{nombre_fr(valeur.normalize(), decimales_min=2)}'


def argent_fr(valeur: Decimal) -> str:
    """« 1 204 158,56 $ »."""
    return f'{nombre_fr(q_argent(valeur))}{FINE}$'


def heures_fr(valeur: Decimal) -> str:
    """« 8 106,286 h » — trois décimales, comme ACCEO."""
    return f'{nombre_fr(q_heures(valeur))}{FINE}h'


def quantite_fr(valeur: Decimal) -> str:
    return nombre_fr(q_quantite(valeur))


def prix_unitaire_fr(valeur: Decimal) -> str:
    """Garde les décimales du prix : c'est tout l'enjeu du module `decimales`."""
    return f'{nombre_fr(q_prix_unitaire(valeur).normalize())}{FINE}$'


def pourcent_fr(fraction: Decimal) -> str:
    """« 0,00 % », « 9,975 % » — à partir des fractions 0 et 0,09975."""
    return f'{nombre_fr((q_pourcent(fraction) * 100).normalize(), 2)}{FINE}%'


def _ligne_tableau(cellules: list[str], largeurs: list[int]) -> str:
    """Aligne une rangée : libellé à gauche, nombres à droite.

    Les largeurs sont calculées par l'appelant à partir du contenu réel, pour
    qu'aucune cellule ne déborde et ne décale la rangée. Un tableau dont les
    colonnes bougent d'une ligne à l'autre ne se compare pas à un rapport
    imprimé, et c'est la seule raison d'être de ce module.
    """
    droite = [
        cellule.rjust(largeur)
        for cellule, largeur in zip(cellules[1:], largeurs[1:], strict=True)
    ]
    return '  '.join([cellules[0].ljust(largeurs[0]), *droite]).rstrip()


def rapport(sommaire: Sommaire) -> str:
    """Le rapport complet, dans l'ordre du papier d'ACCEO."""
    s = sommaire
    lignes: list[str] = []

    titre = f'{s.soumission.numero} — {s.soumission.nom}'.rstrip(' —')
    lignes += [titre, '=' * len(titre), '']

    # --- Sommaire par chapitre : les cinq colonnes imprimées ---------------
    lignes += ['SOMMAIRE PAR CHAPITRE', '']
    entetes = [
        'Chapitre',
        'Sous-total',
        'Facteur m-d',
        'Total ajusté',
        'Mult Bloc',
        'Total',
    ]
    # La première colonne s'adapte à son contenu réel : tronquer « ALARME
    # INCENDIE » en « ALARME INC… » sur un document qu'on compare ligne à
    # ligne avec un rapport imprimé ne rend service à personne.
    noms = [f'{r.chapitre.code} {r.chapitre.nom}'.strip() for r in s.chapitres]
    largeurs = [
        max([len(entetes[0]), len(SOUS_LIGNE_MO), *(len(n) for n in noms)]),
        16,
        12,
        16,
        10,
        16,
    ]
    lignes += [_ligne_tableau(entetes, largeurs), '-' * (sum(largeurs) + 10)]

    for resultat, nom in zip(s.chapitres, noms, strict=True):
        ch = resultat.chapitre
        # Bloc argent : le facteur de m-d ne le touche pas, le Mult Bloc oui.
        # Le tiret dans la colonne « Facteur m-d » dit exactement ça.
        argent = sum(resultat.sous_total.values(), Decimal(0))
        lignes.append(
            _ligne_tableau(
                [
                    nom,
                    argent_fr(argent),
                    '—',
                    argent_fr(argent),
                    facteur_fr(ch.mult_bloc),
                    argent_fr(resultat.total_argent),
                ],
                largeurs,
            )
        )
        lignes.append(
            _ligne_tableau(
                [
                    SOUS_LIGNE_MO,
                    heures_fr(resultat.sous_total_heures),
                    facteur_fr(ch.facteur_md),
                    heures_fr(resultat.heures_ajustees),
                    facteur_fr(ch.mult_bloc),
                    heures_fr(resultat.total_heures),
                ],
                largeurs,
            )
        )

    # --- Contrôle de cohérence --------------------------------------------
    h = s.heures
    lignes += ['', 'CONTRÔLE DE COHÉRENCE', '']
    lignes += [
        f'  Heures chargées                {heures_fr(h.heures_chargees)}',
        f'  Heures du relevé de matériel   {heures_fr(h.heures_relevees)}',
        f'  Balance                        {heures_fr(h.balance)}',
        f'  Ajouté par l’estimateur        '
        f'{"+" if h.heures_ajoutees_par_estimateur >= 0 else ""}'
        f'{heures_fr(h.heures_ajoutees_par_estimateur)}',
        f'  Provenance                     {h.provenance or "non documentée"}',
        f'  Verdict                        {h.verdict} — {h.message}',
    ]

    # --- Sommaire de soumission -------------------------------------------
    lignes += ['', 'SOMMAIRE DE SOUMISSION', '']
    entetes = ['', 'Coûtant', 'Administration', 'Profit', 'Vendant']
    largeurs = [16, 18, 14, 10, 18]
    lignes += [_ligne_tableau(entetes, largeurs), '-' * (sum(largeurs) + 8)]
    for seau in SeauACCEO:
        ligne = s.seau(seau)
        lignes.append(
            _ligne_tableau(
                [
                    ligne.libelle,
                    argent_fr(ligne.coutant),
                    pourcent_fr(ligne.administration),
                    pourcent_fr(ligne.profit),
                    argent_fr(ligne.vendant),
                ],
                largeurs,
            )
        )

    lignes += ['']
    for etiquette, valeur in (
        ('Sous-total', s.sous_total),
        ('Ajustement global', s.ajustement_global),
        ('TPS', s.tps),
        ('TVQ', s.tvq),
    ):
        lignes.append(f'  {etiquette:<24}{argent_fr(valeur)}')
    lignes += [f'  {"GRAND TOTAL":<24}{argent_fr(s.grand_total)}']

    # --- Ce que le rapport ne cache pas -----------------------------------
    lignes += [
        '',
        f'Écart de réconciliation (arrondi d’impression) : '
        f'{argent_fr(s.ecart_reconciliation)}',
    ]

    if s.avertissements:
        lignes += ['', 'AVERTISSEMENTS', '']
        lignes += [f'  • {a}' for a in s.avertissements]

    inferees = [h_ for h_ in s.hypotheses_utilisees if not h_.est_observee]
    if inferees:
        lignes += ['', 'HYPOTHÈSES INFÉRÉES (non lues sur le rapport ACCEO)', '']
        lignes += [f'  • [{h_.code}] {h_.enonce}' for h_ in inferees]

    lignes += [
        '',
        'Modèle cohérent avec UNE observation (relevé S-1695). Non vérifié '
        'contre un second rapport ACCEO.',
    ]
    return '\n'.join(lignes) + '\n'
