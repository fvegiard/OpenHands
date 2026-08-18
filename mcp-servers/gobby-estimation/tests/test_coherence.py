"""Tests du contrôle de cohérence — le seuil asymétrique, surtout."""

from decimal import Decimal

import pytest

from gobby_estimation.coherence import controler_heures


class TestConventionDeSigne:
    def test_balance_est_releve_moins_charge(self):
        # Le signe imprimé par ACCEO sur S-1695 : −43,714.
        controle = controler_heures(Decimal('8106.286'), Decimal('8150'), 'arrondi')
        assert controle.balance == Decimal('-43.714')

    def test_les_deux_lectures_sont_opposees(self):
        controle = controler_heures(Decimal('8106.286'), Decimal('8150'), 'arrondi')
        assert controle.heures_ajoutees_par_estimateur == -controle.balance

    def test_sans_override_rien_a_signaler(self):
        controle = controler_heures(Decimal('8106.286'), None)
        assert controle.balance == 0
        assert controle.verdict == 'ok'
        assert controle.heures_chargees == Decimal('8106.286')


class TestSeuilAsymetrique:
    """Charger MOINS que le relevé est le cas qui coûte de l'argent."""

    def test_coussin_usuel_passe(self):
        controle = controler_heures(Decimal('8106.286'), Decimal('8150'), 'arrondi')
        assert controle.verdict == 'ok'
        assert 'coussin usuel' in controle.message

    def test_coussin_eleve_questionne(self):
        # +30 % : soit un vrai risque assumé, soit un facteur de m-d appliqué
        # deux fois. Les deux méritent qu'on regarde.
        controle = controler_heures(Decimal('1000'), Decimal('1300'), 'coussin')
        assert controle.verdict == 'attention'
        assert 'double comptage' in controle.message

    def test_sous_charge_legere_deja_signalee(self):
        # −1 % seulement, mais 10 h qui seront exécutées sans être vendues.
        controle = controler_heures(Decimal('1000'), Decimal('990'), 'saisie')
        assert controle.verdict == 'attention'
        assert 'sans avoir été vendues' in controle.message

    def test_sous_charge_franche_alerte(self):
        controle = controler_heures(Decimal('1000'), Decimal('900'), 'saisie')
        assert controle.verdict == 'alerte'

    def test_meme_ecart_relatif_deux_verdicts_opposes(self):
        # C'est tout l'intérêt de l'asymétrie : ±5 % ne se valent pas.
        dessus = controler_heures(Decimal('1000'), Decimal('1050'), 'x')
        dessous = controler_heures(Decimal('1000'), Decimal('950'), 'x')
        assert dessus.verdict == 'ok'
        assert dessous.verdict == 'alerte'


class TestPlancher:
    @pytest.mark.parametrize('ecart', ['1', '-1', '7.9'])
    def test_sous_le_plancher_rien_a_dire(self, ecart):
        releve = Decimal('1000')
        controle = controler_heures(releve, releve + Decimal(ecart), 'x')
        assert controle.verdict == 'ok'
        assert 'négligeable' in controle.message

    def test_releve_nul_ne_divise_pas_par_zero(self):
        controle = controler_heures(Decimal('0'), Decimal('40'), 'forfait')
        assert controle.ecart_relatif == 0


class TestProvenance:
    def test_absence_de_provenance_notee(self):
        controle = controler_heures(Decimal('1000'), Decimal('1050'), '')
        assert 'Provenance non documentée' in controle.message

    def test_provenance_reportee_telle_quelle(self):
        controle = controler_heures(Decimal('1000'), Decimal('1050'), 'prix cible')
        assert controle.provenance == 'prix cible'
        assert 'non documentée' not in controle.message


class TestFormatDesMessages:
    def test_les_nombres_sont_ecrits_a_la_quebecoise(self):
        controle = controler_heures(Decimal('8106.286'), Decimal('8150'), 'arrondi')
        # Virgule décimale, pas de point : le message va sous les yeux d'un
        # estimateur, pas d'un développeur.
        assert '43,714' in controle.message
        assert '43.714' not in controle.message
