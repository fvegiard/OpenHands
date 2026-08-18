"""Tests des types Decimal du domaine.

Chaque test correspond à une affirmation faite dans `decimales.py`. Une
affirmation sans test est une opinion.
"""

from decimal import Decimal

import pytest

from gobby_estimation.decimales import (
    ErreurValeur,
    depuis_fr_ca,
    normaliser_zero,
    q_argent,
    q_heures,
    q_pourcent,
    q_prix_unitaire,
    q_quantite,
    vers_decimal,
)


class TestEchelles:
    """Chaque nature de valeur a SA précision. C'est le coeur du module."""

    def test_argent_deux_decimales(self):
        assert q_argent(Decimal('1204158.5891')) == Decimal('1204158.59')

    def test_prix_unitaire_cinq_decimales(self):
        # Un prix en $/C ou $/M garde ses décimales : c'est tout l'enjeu.
        assert q_prix_unitaire(Decimal('0.4567')) == Decimal('0.45670')

    def test_heures_trois_decimales(self):
        # ACCEO imprime 8106,286 — trois décimales, toujours.
        assert q_heures(Decimal('8106.2857')) == Decimal('8106.286')

    def test_quantite_trois_decimales(self):
        assert q_quantite(Decimal('50000.0004')) == Decimal('50000.000')

    def test_pourcentage_cinq_decimales(self):
        # La TVQ est à 9,975 % : quatre décimales sont nécessaires, on en met cinq.
        assert q_pourcent(Decimal('0.09975')) == Decimal('0.09975')


class TestArrondi:
    """ROUND_HALF_UP, pas le défaut de Python."""

    def test_demi_arrondit_vers_le_haut(self):
        # Le défaut de Python est ROUND_HALF_EVEN, qui donnerait 0.00 ici.
        # Un estimateur n'accepte pas l'arrondi du banquier sur une soumission.
        assert q_argent(Decimal('0.005')) == Decimal('0.01')
        assert q_argent(Decimal('0.015')) == Decimal('0.02')

    def test_demi_negatif_arrondit_en_valeur_absolue(self):
        assert q_argent(Decimal('-0.005')) == Decimal('-0.01')


class TestDefautCorrige:
    """Le bug que ce module existe pour empêcher.

    Trouvé indépendamment par deux relecteurs, par deux chemins différents.
    """

    def test_prix_unitaire_ne_doit_pas_etre_arrondi_comme_de_l_argent(self):
        quantite = Decimal('50000')  # 50 000 pi de fil
        prix_reel = Decimal('0.4567')  # $/pi, dérivé d'un prix au C

        correct = q_argent(quantite * q_prix_unitaire(prix_reel))
        errone = q_argent(quantite * q_argent(prix_reel))

        assert correct == Decimal('22835.00')
        assert errone == Decimal('23000.00')
        assert errone - correct == Decimal('165.00')

    def test_le_total_lui_reste_a_deux_decimales(self):
        # L'échelle fine s'applique aux prix unitaires, jamais aux totaux.
        total = q_argent(Decimal('50000') * Decimal('0.45670'))
        assert total.as_tuple().exponent == -2


class TestZeroNegatif:
    def test_moins_zero_devient_zero(self):
        # « -0,00 $ » dans un rapport fait douter de tout le reste du document.
        assert str(q_argent(Decimal('-0.001'))) == '0.00'
        assert str(normaliser_zero(Decimal('-0'))) == '0'

    def test_zero_positif_inchange(self):
        assert str(q_argent(Decimal('0'))) == '0.00'


class TestParsingFrCa:
    """Les documents sources impriment « 1 204 158,59 $ »."""

    @pytest.mark.parametrize(
        'texte',
        [
            '1 204 158,59 $',  # espace fine insécable — celle d'ACCEO
            '1 204 158,59 $',  # espace insécable
            '1 204 158,59',  # espace fine
            '1 204 158,59',  # espace ordinaire
            '1204158.59',  # déjà normalisé
            '  1 204 158,59 $  ',  # bordé d'espaces
        ],
    )
    def test_variantes_acceptees(self, texte):
        assert depuis_fr_ca(texte) == Decimal('1204158.59')

    def test_negatif(self):
        assert depuis_fr_ca('-43,714') == Decimal('-43.714')

    def test_vide_refuse(self):
        with pytest.raises(ErreurValeur, match='vide'):
            depuis_fr_ca('   ')

    def test_plusieurs_virgules_refusees(self):
        with pytest.raises(ErreurValeur, match='plusieurs virgules'):
            depuis_fr_ca('1,204,158.59')  # séparateur anglais : ambigu, on refuse

    def test_illisible_refuse(self):
        with pytest.raises(ErreurValeur, match='illisible'):
            depuis_fr_ca('mille piastres')


class TestVersDecimal:
    def test_decimal_passe_tel_quel(self):
        valeur, avert = vers_decimal(Decimal('397308.56'))
        assert valeur == Decimal('397308.56')
        assert avert is None

    def test_int_accepte(self):
        valeur, avert = vers_decimal(8150)
        assert valeur == Decimal('8150')
        assert avert is None

    def test_chaine_fr_ca_acceptee(self):
        valeur, avert = vers_decimal('806 850,00 $')
        assert valeur == Decimal('806850.00')
        assert avert is None

    def test_float_converti_exactement_avec_avertissement(self):
        # repr() donne la plus courte chaîne qui reconstitue la valeur binaire,
        # donc la conversion est exacte pour tout montant réaliste.
        valeur, avert = vers_decimal(397308.56, champ='materiel_coutant')
        assert valeur == Decimal('397308.56')
        assert avert is not None
        assert 'materiel_coutant' in avert

    @pytest.mark.parametrize('brut', [0.1, 1204158.59, 0.4567, 8106.286])
    def test_conversion_float_ne_perd_rien(self, brut):
        valeur, _ = vers_decimal(brut)
        assert valeur == Decimal(repr(brut))
        assert float(valeur) == brut

    def test_bool_refuse(self):
        # bool est un int en Python ; l'accepter masquerait une erreur d'appel.
        with pytest.raises(ErreurValeur, match='[Bb]ooléen'):
            vers_decimal(True)

    @pytest.mark.parametrize('brut', [float('nan'), float('inf'), float('-inf')])
    def test_non_fini_refuse(self, brut):
        with pytest.raises(ErreurValeur, match='non finie'):
            vers_decimal(brut)

    def test_decimal_non_fini_refuse(self):
        with pytest.raises(ErreurValeur, match='non finie'):
            vers_decimal(Decimal('NaN'))

    def test_type_non_supporte_refuse(self):
        with pytest.raises(ErreurValeur, match='non supporté'):
            vers_decimal([1, 2, 3])

    def test_le_champ_est_nomme_dans_l_erreur(self):
        # Un message d'erreur qui ne dit pas QUEL champ est inutilisable.
        with pytest.raises(ErreurValeur, match='taux_horaire'):
            vers_decimal(None, champ='taux_horaire')


class TestInvariantsS1695:
    """Les chiffres publiés du relevé, au niveau où ce module opère."""

    def test_service_coutant_est_heures_fois_taux(self):
        heures = q_heures(Decimal('8150.000'))
        taux = Decimal('99.00')
        assert q_argent(heures * taux) == Decimal('806850.00')

    def test_balance_et_heures_ajoutees(self):
        chargees = q_heures(Decimal('8150.000'))
        releve = q_heures(Decimal('8106.286'))

        # La valeur telle qu'ACCEO l'imprime.
        assert q_heures(releve - chargees) == Decimal('-43.714')
        # La même chose dite comme un estimateur la lit : il a AJOUTÉ du coussin.
        assert q_heures(chargees - releve) == Decimal('43.714')

    def test_somme_des_postes_publies(self):
        materiel = depuis_fr_ca('397 308,56 $')
        service = depuis_fr_ca('806 850,00 $')
        assert q_argent(materiel + service) == Decimal('1204158.56')

    def test_ecart_avec_le_grand_total_publie(self):
        # 0,03 $ : résidu d'arrondi d'impression attendu sur ~300 lignes,
        # PAS un ajustement saisi. Conservé comme écart mesuré, jamais absorbé.
        somme_postes = Decimal('1204158.56')
        grand_total_publie = depuis_fr_ca('1 204 158,59 $')
        assert q_argent(grand_total_publie - somme_postes) == Decimal('0.03')
