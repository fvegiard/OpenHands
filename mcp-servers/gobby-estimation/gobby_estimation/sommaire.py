"""Sommaire de soumission — les trois seaux, puis le grand total.

Reproduit le bas du rapport ACCEO :

    Matériel      Coûtant  Administration %  Profit %  Vendant
    Service       …
    Autres frais  …
    ─────────────────────────────────────────────────────────
    Sous-total · Ajustement global · TPS · TVQ · Grand total

Deux règles qui n'apparaissent pas sur le papier mais sans lesquelles le
chiffre est faux :

**Les dollars de Service naissent ici, pas dans les lignes.** Ils valent
heures chargées × taux. C'est pourquoi le contrôle de cohérence des heures est
appelé avant, et pas comme une vérification décorative après coup.

**On ne marge pas deux fois.** Un taux horaire qui contient déjà de la marge
— 99,00 $/h rond quand un composite chargé tourne à 70-80 $ — ne doit pas
recevoir en plus l'administration et le profit du sommaire. La part de marge
du taux est ajoutée au vendant sans repasser par le facteur, et si le seau
Service porte quand même un pourcentage, le sommaire le dit au lieu de le
faire en silence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from gobby_estimation.coherence import ControleHeures, controler_heures
from gobby_estimation.decimales import UN, ZERO, q_argent
from gobby_estimation.formatage import argent_fr, pourcent_fr
from gobby_estimation.modeles import (
    Hypothese,
    SeauACCEO,
    Soumission,
    hypotheses,
)
from gobby_estimation.moteur import ResultatChapitre, calculer_chapitre


@dataclass(frozen=True)
class LigneSommaire:
    """Un seau du sommaire, avec ses quatre colonnes imprimées."""

    seau: SeauACCEO
    coutant: Decimal
    administration: Decimal
    profit: Decimal
    vendant: Decimal

    @property
    def libelle(self) -> str:
        return self.seau.libelle


@dataclass(frozen=True)
class Sommaire:
    """Le résultat complet d'une soumission, tous axes étiquetés."""

    soumission: Soumission
    chapitres: tuple[ResultatChapitre, ...]
    seaux: tuple[LigneSommaire, ...]
    heures: ControleHeures

    sous_total: Decimal
    ajustement_global: Decimal
    base_taxable: Decimal
    tps: Decimal
    tvq: Decimal
    grand_total: Decimal

    ecart_reconciliation: Decimal
    hypotheses_utilisees: tuple[Hypothese, ...] = ()
    avertissements: tuple[str, ...] = field(default_factory=tuple)

    def seau(self, seau: SeauACCEO) -> LigneSommaire:
        for ligne in self.seaux:
            if ligne.seau is seau:
                return ligne
        raise KeyError(seau)

    @property
    def total_coutant(self) -> Decimal:
        return sum((ligne.coutant for ligne in self.seaux), ZERO)


def calculer(soumission: Soumission) -> Sommaire:
    """Calcule tout, en pleine précision, et rend les hypothèses avec."""
    config = soumission.config
    taux = config.taux_horaire

    chapitres = tuple(calculer_chapitre(ch) for ch in soumission.chapitres)

    coutant = {seau: ZERO for seau in SeauACCEO}
    deja_vendu = {seau: ZERO for seau in SeauACCEO}
    for resultat in chapitres:
        for seau, montant in resultat.total.items():
            coutant[seau] += montant
        for seau, montant in resultat.total_deja_vendu.items():
            deja_vendu[seau] += montant

    heures_relevees = sum((r.total_heures for r in chapitres), ZERO)
    heures = controler_heures(
        heures_relevees,
        config.heures_chargees,
        config.provenance_heures_chargees,
    )

    # Le seau Service naît du contrôle des heures, pas des lignes.
    coutant[SeauACCEO.SERVICE] += heures.heures_chargees * taux.cout_horaire
    marge_du_taux = heures.heures_chargees * (taux.taux - taux.cout_horaire)

    avertissements: list[str] = []
    seaux: list[LigneSommaire] = []
    for seau in SeauACCEO:
        marges = config.marges_de(seau)
        marginable = coutant[seau] - deja_vendu[seau]
        vendant = marginable * marges.facteur + deja_vendu[seau]

        if seau is SeauACCEO.SERVICE:
            vendant += marge_du_taux
            if marge_du_taux != ZERO and marges.facteur != UN:
                avertissements.append(
                    'Double marge sur la main-d’oeuvre : le taux de '
                    f'{argent_fr(taux.taux)}/h contient déjà '
                    f'{pourcent_fr(taux.marge_incluse)} de marge et le seau '
                    'Service porte en plus administration/profit. La marge du '
                    'taux a été ajoutée sans repasser par le facteur, mais le '
                    'coûtant, lui, est margé deux fois si ce n’est pas voulu.'
                )

        if deja_vendu[seau] != ZERO:
            avertissements.append(
                f'{seau.libelle} : {argent_fr(deja_vendu[seau])} de lignes dont '
                'le prix saisi est déjà du vendant. Leur coûtant réel est '
                'inconnu ; il est repris tel quel et exclu des marges.'
            )

        seaux.append(
            LigneSommaire(
                seau=seau,
                coutant=coutant[seau],
                administration=marges.administration,
                profit=marges.profit,
                vendant=vendant,
            )
        )

    if taux.marge_supposee:
        avertissements.append(
            f'Taux de {argent_fr(taux.taux)}/h traité comme du coûtant pur : la '
            'décomposition réelle est inconnue. Toute marge déjà contenue dans '
            'ce taux est donc comptée comme un coût, ce qui sous-estime le '
            'profit affiché sans changer le grand total.'
        )

    sous_total = sum((ligne.vendant for ligne in seaux), ZERO)
    base_taxable = sous_total + config.ajustement_global
    tps = base_taxable * config.taux_tps if config.taxes_applicables else ZERO
    tvq = base_taxable * config.taux_tvq if config.taxes_applicables else ZERO

    return Sommaire(
        soumission=soumission,
        chapitres=chapitres,
        seaux=tuple(seaux),
        heures=heures,
        sous_total=sous_total,
        ajustement_global=config.ajustement_global,
        base_taxable=base_taxable,
        tps=tps,
        tvq=tvq,
        grand_total=base_taxable + tps + tvq,
        ecart_reconciliation=ecart_reconciliation(chapitres),
        hypotheses_utilisees=hypotheses(
            'H-COLONNES',
            'H-AXES',
            'H-SEAUX',
            'H-BALANCE',
            'H-FACTEUR-MD',
            'H-MULT-BLOC',
            'H-PERTE',
            'H-AUTRES-FRAIS',
            'H-PRIX-AXE',
            'H-ECART',
        ),
        avertissements=tuple(avertissements),
    )


def ecart_reconciliation(
    chapitres: tuple[ResultatChapitre, ...],
) -> Decimal:
    """Somme des extensions ARRONDIES moins la même somme en pleine précision.

    C'est le résidu qu'un rapport imprimé porte forcément : chaque extension
    est imprimée à la cent, le total est calculé sans arrondir. Sur quelques
    centaines de lignes la dérive attendue est de l'ordre de ±0,05 $ — c'est
    exactement l'ordre de grandeur du 0,03 $ observé sur S-1695.

    Sortie DÉRIVÉE, jamais un champ d'entrée. Un champ nullable qui fait
    toujours balancer absorberait les vrais bugs pour la vie du produit.
    """
    imprime = ZERO
    exact = ZERO
    for resultat in chapitres:
        mult = resultat.chapitre.mult_bloc
        for ligne in resultat.lignes:
            imprime += q_argent(ligne.montant) * mult
            exact += ligne.montant * mult
    return q_argent(imprime - exact)
