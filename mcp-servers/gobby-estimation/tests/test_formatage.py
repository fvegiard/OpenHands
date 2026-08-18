"""Tests de l'impression fr-CA.

Un rapport qui écrit « 1204158.56 » ne se compare pas à celui de Daniel, et un
séparateur de milliers en espace ordinaire laisse le nombre se couper en fin
de ligne. Ce sont des détails jusqu'au moment où le document part chez un
client.
"""

from decimal import Decimal

import pytest

from gobby_estimation.formatage import (
    FINE,
    argent_fr,
    facteur_fr,
    heures_fr,
    nombre_fr,
    pourcent_fr,
    prix_unitaire_fr,
    quantite_fr,
)


class TestSeparateurs:
    def test_le_separateur_est_l_espace_fine_insecable(self):
        assert FINE == ' '
        assert nombre_fr(Decimal('1204158')) == '1 204 158'

    def test_la_decimale_est_une_virgule(self):
        assert nombre_fr(Decimal('1204158.59')) == '1 204 158,59'

    @pytest.mark.parametrize(
        ('valeur', 'attendu'),
        [
            ('0', '0'),
            ('999', '999'),
            ('1000', '1 000'),
            ('-1000', '-1 000'),
            ('1000000', '1 000 000'),
        ],
    )
    def test_groupement_par_trois(self, valeur, attendu):
        assert nombre_fr(Decimal(valeur)) == attendu

    def test_l_unite_est_collee_par_une_fine_insecable(self):
        # « 1 204 158,56 $ » ne doit jamais se couper avant le symbole.
        assert argent_fr(Decimal('1204158.56')).endswith(' $')


class TestUnites:
    def test_argent_a_deux_decimales(self):
        assert argent_fr(Decimal('1204158.5891')) == '1 204 158,59 $'

    def test_heures_a_trois_decimales(self):
        assert heures_fr(Decimal('8106.286')) == '8 106,286 h'

    def test_heures_negatives_gardent_leur_signe(self):
        # La balance d'ACCEO s'imprime négative ; la masquer serait mentir.
        assert heures_fr(Decimal('-43.714')) == '-43,714 h'

    def test_quantite_a_trois_decimales(self):
        assert quantite_fr(Decimal('50000')) == '50 000,000'

    def test_le_prix_unitaire_garde_ses_decimales(self):
        # Le module existe pour que 0,4567 $/pi ne devienne pas 0,46 $/pi.
        assert prix_unitaire_fr(Decimal('0.4567')) == '0,4567 $'

    def test_pourcentage_toujours_garni(self):
        # « 0 % » se lit comme un champ vide ; « 0,00 % » comme un réglage.
        assert pourcent_fr(Decimal('0')) == '0,00 %'
        assert pourcent_fr(Decimal('0.09975')) == '9,975 %'
        assert pourcent_fr(Decimal('0.10')) == '10,00 %'

    def test_facteur_toujours_a_deux_decimales(self):
        assert facteur_fr(Decimal('1')) == '×1,00'
        assert facteur_fr(Decimal('14')) == '×14,00'
        assert facteur_fr(Decimal('1.15')) == '×1,15'


class TestDecimalesMinimales:
    @pytest.mark.parametrize(
        ('valeur', 'mini', 'attendu'),
        [
            ('1', 0, '1'),
            ('1', 2, '1,00'),
            ('1.5', 2, '1,50'),
            ('1.234', 2, '1,234'),
        ],
    )
    def test_garnissage(self, valeur, mini, attendu):
        assert nombre_fr(Decimal(valeur), mini) == attendu
