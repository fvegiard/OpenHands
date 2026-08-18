"""Tests du sommaire : les trois seaux, les marges, et le refus de marger deux fois."""

from decimal import Decimal

import pytest

from gobby_estimation.decimales import q_argent
from gobby_estimation.modeles import (
    Axe,
    Chapitre,
    ConfigCalcul,
    Ligne,
    Marges,
    NatureCout,
    SeauACCEO,
    Soumission,
    TauxHoraire,
)
from gobby_estimation.sommaire import calculer


def soumission(config: ConfigCalcul, *lignes: Ligne, **chapitre) -> Soumission:
    return Soumission(
        numero='T-1',
        config=config,
        chapitres=(Chapitre(code='CH01', lignes=lignes, **chapitre),),
    )


def taux_charge() -> TauxHoraire:
    """Un taux honnête : 99 $ vendus, 75 $ de coût réel."""
    return TauxHoraire(taux='99,00', cout_horaire='75,00', provenance='paie 2026')


class TestServiceNaitDesHeures:
    def test_les_dollars_de_service_viennent_du_taux(self):
        config = ConfigCalcul(taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'))
        resultat = calculer(
            soumission(
                config,
                Ligne(description='Pose', quantite=100, temps_unitaire='1'),
            )
        )
        assert q_argent(resultat.seau(SeauACCEO.SERVICE).coutant) == Decimal('9900.00')

    def test_les_heures_chargees_priment_sur_le_releve(self):
        config = ConfigCalcul(
            taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'),
            heures_chargees='200',
            provenance_heures_chargees='coussin assumé',
        )
        resultat = calculer(
            soumission(
                config, Ligne(description='Pose', quantite=100, temps_unitaire='1')
            )
        )
        assert q_argent(resultat.seau(SeauACCEO.SERVICE).coutant) == Decimal('19800.00')


class TestMargesParSeau:
    def test_le_facteur_s_applique_seau_par_seau(self):
        config = ConfigCalcul(
            taux_horaire=TauxHoraire.suppose_sans_marge('100', 'x'),
            marges={
                SeauACCEO.MATERIEL: Marges(administration='0,10', profit='0,05'),
                SeauACCEO.AUTRES_FRAIS: Marges(profit='0,05'),
            },
        )
        resultat = calculer(
            soumission(
                config,
                Ligne(description='Matériel', quantite=1, prix_unitaire='1000'),
                Ligne(
                    description='Sous-traitant',
                    quantite=1,
                    prix_unitaire='1000',
                    nature=NatureCout.SOUS_TRAITANCE,
                ),
            )
        )
        # 1000 × 1,10 × 1,05 = 1155 — composé, pas 1000 × 1,15.
        assert q_argent(resultat.seau(SeauACCEO.MATERIEL).vendant) == Decimal('1155.00')
        assert q_argent(resultat.seau(SeauACCEO.AUTRES_FRAIS).vendant) == Decimal(
            '1050.00'
        )

    def test_seau_sans_marge_reste_a_son_coutant(self):
        config = ConfigCalcul(taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'))
        resultat = calculer(
            soumission(config, Ligne(description='M', quantite=1, prix_unitaire='1000'))
        )
        ligne = resultat.seau(SeauACCEO.MATERIEL)
        assert ligne.vendant == ligne.coutant


class TestAntiDoubleMarge:
    def test_la_marge_du_taux_n_est_pas_remargee(self):
        config = ConfigCalcul(
            taux_horaire=taux_charge(),
            heures_chargees='100',
            provenance_heures_chargees='x',
            marges={SeauACCEO.SERVICE: Marges(profit='0,10')},
        )
        resultat = calculer(soumission(config))
        service = resultat.seau(SeauACCEO.SERVICE)
        # Coûtant 100 × 75 = 7500, margé à 10 % = 8250 ; la marge du taux
        # (100 × 24 = 2400) s'ajoute sans repasser par le facteur.
        assert q_argent(service.coutant) == Decimal('7500.00')
        assert q_argent(service.vendant) == Decimal('10650.00')

    def test_le_double_marge_est_annonce(self):
        config = ConfigCalcul(
            taux_horaire=taux_charge(),
            heures_chargees='100',
            provenance_heures_chargees='x',
            marges={SeauACCEO.SERVICE: Marges(profit='0,10')},
        )
        resultat = calculer(soumission(config))
        assert any('Double marge' in a for a in resultat.avertissements)

    def test_sans_marge_de_seau_aucun_avertissement(self):
        config = ConfigCalcul(
            taux_horaire=taux_charge(),
            heures_chargees='100',
            provenance_heures_chargees='x',
        )
        resultat = calculer(soumission(config))
        service = resultat.seau(SeauACCEO.SERVICE)
        assert q_argent(service.vendant) == Decimal('9900.00')
        assert not any('Double marge' in a for a in resultat.avertissements)

    def test_les_lignes_deja_vendantes_echappent_aux_marges(self):
        config = ConfigCalcul(
            taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'),
            marges={SeauACCEO.MATERIEL: Marges(profit='0,50')},
        )
        resultat = calculer(
            soumission(
                config,
                Ligne(description='Coûtant', quantite=1, prix_unitaire='100'),
                Ligne(
                    description='Déjà vendant',
                    quantite=1,
                    prix_unitaire='100',
                    axe_prix=Axe.VENDANT,
                ),
            )
        )
        # 100 × 1,50 + 100 tel quel = 250, pas 300.
        assert q_argent(resultat.seau(SeauACCEO.MATERIEL).vendant) == Decimal('250.00')
        assert any('déjà du vendant' in a for a in resultat.avertissements)


class TestTaxes:
    def test_taxes_appliquees_sur_la_base_ajustee(self):
        config = ConfigCalcul(
            taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'),
            taxes_applicables=True,
            ajustement_global='1000',
            provenance_ajustement='rabais de fin de soumission',
        )
        resultat = calculer(
            soumission(config, Ligne(description='M', quantite=1, prix_unitaire='9000'))
        )
        assert q_argent(resultat.base_taxable) == Decimal('10000.00')
        assert q_argent(resultat.tps) == Decimal('500.00')
        assert q_argent(resultat.tvq) == Decimal('997.50')
        assert q_argent(resultat.grand_total) == Decimal('11497.50')

    def test_taxes_desactivees_laissent_le_total_nu(self):
        config = ConfigCalcul(taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'))
        resultat = calculer(
            soumission(config, Ligne(description='M', quantite=1, prix_unitaire='9000'))
        )
        assert resultat.tps == 0
        assert q_argent(resultat.grand_total) == Decimal('9000.00')


class TestEcartDeReconciliation:
    def test_zero_quand_toutes_les_extensions_tombent_juste(self):
        config = ConfigCalcul(taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'))
        resultat = calculer(
            soumission(config, Ligne(description='M', quantite=2, prix_unitaire='10'))
        )
        assert resultat.ecart_reconciliation == 0

    def test_le_residu_d_impression_apparait_sans_etre_absorbe(self):
        # Trois lignes dont l'extension tombe à un demi-cent : imprimées, elles
        # arrondissent vers le haut ; le total exact, lui, ne bouge pas.
        config = ConfigCalcul(taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'))
        lignes = tuple(
            Ligne(description=f'L{i}', quantite=1, prix_unitaire='0,005')
            for i in range(3)
        )
        resultat = calculer(soumission(config, *lignes))
        assert resultat.ecart_reconciliation == Decimal('0.02')
        # Et surtout : le grand total garde la pleine précision.
        assert resultat.grand_total == Decimal('0.015')

    @pytest.mark.parametrize(
        ('mult', 'attendu'),
        # Une ligne à 0,005 $ s'imprime 0,01 $ ; l'exact reste 0,005 $.
        # Le résidu vaut donc mult × 0,005 $, lui-même imprimé à la cent —
        # d'où 0,01 $ (et non 0,005 $) quand le bloc ne se répète pas.
        [('1', '0.01'), ('14', '0.07')],
    )
    def test_le_mult_bloc_multiplie_aussi_le_residu(self, mult, attendu):
        config = ConfigCalcul(taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'))
        resultat = calculer(
            soumission(
                config,
                Ligne(description='L', quantite=1, prix_unitaire='0,005'),
                mult_bloc=mult,
            )
        )
        assert resultat.ecart_reconciliation == Decimal(attendu)


class TestHypothesesReportees:
    def test_le_resultat_porte_ses_hypotheses(self):
        config = ConfigCalcul(taux_horaire=TauxHoraire.suppose_sans_marge('99', 'x'))
        resultat = calculer(soumission(config))
        codes = {h.code for h in resultat.hypotheses_utilisees}
        assert 'H-BALANCE' in codes
        assert any(not h.est_observee for h in resultat.hypotheses_utilisees)
