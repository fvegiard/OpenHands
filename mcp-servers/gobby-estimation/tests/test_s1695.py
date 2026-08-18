"""Test doré — les chiffres publiés de S-1695.

Si ce fichier devient rouge, ce n'est pas « un test qui casse » : c'est que la
reconstruction ne donne plus le rapport de Daniel. Le nom des tests le dit,
pour qu'un échec ici se distingue d'un échec générique dans le journal de CI.
"""

from decimal import Decimal
from pathlib import Path

import pytest

from gobby_estimation.decimales import q_argent, q_heures
from gobby_estimation.formatage import argent_fr, heures_fr, rapport
from gobby_estimation.modeles import SYSTEMES_OBSERVES, SeauACCEO
from gobby_estimation.moteur import calculer_chapitre
from gobby_estimation.s1695 import (
    BALANCE_IMPRIMEE,
    GRAND_TOTAL_PUBLIE,
    HEURES_CHARGEES,
    HEURES_RELEVEES,
    MATERIEL_COUTANT,
    QUANTITES_LUMINAIRES,
    SERVICE_COUTANT,
    SYSTEMES,
    TAUX_HORAIRE,
    UNITES_LUMINAIRES,
    chapitre_eclairage_observe,
    soumission_agregee,
)
from gobby_estimation.sommaire import calculer


@pytest.fixture(scope='module')
def resultat():
    return calculer(soumission_agregee())


class TestChiffresPubliesS1695:
    """Les invariants du papier. Un rouge ici = les chiffres ACCEO ont bougé."""

    def test_le_taux_horaire_tombe_juste_au_cent(self, resultat):
        # 8150 × 99,00 = 806 850,00 exactement. C'est ce qui prouve que 99,00
        # est bien le taux : aucun autre nombre ne donne un résidu nul.
        assert q_argent(HEURES_CHARGEES * TAUX_HORAIRE) == SERVICE_COUTANT
        assert q_argent(resultat.seau(SeauACCEO.SERVICE).coutant) == SERVICE_COUTANT

    def test_materiel_coutant_publie(self, resultat):
        assert q_argent(resultat.seau(SeauACCEO.MATERIEL).coutant) == MATERIEL_COUTANT

    def test_autres_frais_vide_sur_ce_tirage(self, resultat):
        # Le sommaire du scan ne montre que deux seaux garnis. Si un jour ce
        # test devient faux sans qu'on ait ajouté de lignes, c'est qu'un coût
        # a fui d'un seau à l'autre.
        assert resultat.seau(SeauACCEO.AUTRES_FRAIS).coutant == 0

    def test_grand_total_reconstruit(self, resultat):
        # La somme des deux seaux publiés. Le grand total imprimé est
        # 1 204 158,59 $ : les 0,03 $ d'écart sont traités à part.
        assert q_argent(resultat.grand_total) == Decimal('1204158.56')

    @pytest.mark.parametrize(
        'lecture_du_scan',
        [Decimal('1204158.59'), Decimal('1204158.56')],
        ids=['dernier-chiffre-9', 'dernier-chiffre-6'],
    )
    def test_ecart_au_total_publie_reste_un_residu_d_impression(
        self, resultat, lecture_du_scan
    ):
        # Le scan est du 300 dpi sans couche texte : le dernier chiffre se lit
        # 6 ou 9. Les deux lectures doivent rester dans l'ordre de grandeur
        # d'un résidu d'arrondi sur quelques centaines de lignes (±0,05 $).
        ecart = abs(q_argent(resultat.grand_total) - lecture_du_scan)
        assert ecart <= Decimal('0.05')

    def test_l_ecart_publie_est_de_trois_cents(self, resultat):
        assert GRAND_TOTAL_PUBLIE - q_argent(resultat.grand_total) == Decimal('0.03')

    def test_balance_reprend_le_signe_imprime(self, resultat):
        # ACCEO imprime −43,714 : relevé − chargées.
        assert q_heures(resultat.heures.balance) == BALANCE_IMPRIMEE
        assert resultat.heures.heures_relevees == HEURES_RELEVEES
        assert resultat.heures.heures_chargees == HEURES_CHARGEES

    def test_la_lecture_a_l_endroit_est_un_ajout(self, resultat):
        # Montrer −43,714 à quelqu'un qui a ajouté du coussin se lit comme un
        # manque. Le module expose donc les deux lectures.
        assert q_heures(resultat.heures.heures_ajoutees_par_estimateur) == Decimal(
            '43.714'
        )
        assert resultat.heures.verdict == 'ok'

    def test_ce_tirage_ne_porte_aucune_marge_ni_taxe(self, resultat):
        for seau in SeauACCEO:
            ligne = resultat.seau(seau)
            assert ligne.administration == 0
            assert ligne.profit == 0
            assert ligne.vendant == ligne.coutant
        assert resultat.tps == 0
        assert resultat.tvq == 0
        assert resultat.ajustement_global == 0


class TestRapportImprime:
    """Le livrable qu'on met à côté du scan."""

    def test_les_montages_cles_apparaissent_en_fr_ca(self, resultat):
        texte = rapport(resultat)
        assert argent_fr(Decimal('1204158.56')) in texte
        assert argent_fr(MATERIEL_COUTANT) in texte
        assert argent_fr(SERVICE_COUTANT) in texte
        assert heures_fr(HEURES_CHARGEES) in texte
        assert heures_fr(HEURES_RELEVEES) in texte

    def test_le_rapport_dit_qu_il_repose_sur_une_seule_observation(self, resultat):
        # L'étiquette honnête. La retirer transformerait une reconstruction en
        # référence.
        assert 'UNE observation' in rapport(resultat)

    def test_le_rapport_montre_ses_hypotheses_inferees(self, resultat):
        texte = rapport(resultat)
        assert 'HYPOTHÈSES INFÉRÉES' in texte
        assert 'H-MULT-BLOC' in texte

    def test_le_rapport_signale_que_la_marge_du_taux_est_inconnue(self, resultat):
        assert 'traité comme du coûtant pur' in rapport(resultat)


class TestDonneesObserveesDesLuminaires:
    """Ce qui est lisible ligne à ligne sur le scan, donc vérifiable."""

    def test_les_heures_des_luminaires_relevees(self):
        resultat = calculer_chapitre(chapitre_eclairage_observe())
        attendu = (
            QUANTITES_LUMINAIRES['A1'] * UNITES_LUMINAIRES['A']
            + QUANTITES_LUMINAIRES['A2'] * UNITES_LUMINAIRES['A']
            + QUANTITES_LUMINAIRES['B1'] * UNITES_LUMINAIRES['B']
            + QUANTITES_LUMINAIRES['B2'] * UNITES_LUMINAIRES['B']
            + QUANTITES_LUMINAIRES['B4'] * UNITES_LUMINAIRES['B']
        )
        assert q_heures(resultat.sous_total_heures) == q_heures(attendu)
        # 823 × 0,750 = 617,25 h pour le seul type A1 : l'ordre de grandeur
        # d'un hôtel de 14 étages, pas d'une erreur d'unité.
        assert q_heures(resultat.lignes[0].heures) == Decimal('617.250')

    def test_les_luminaires_ne_pesent_qu_une_part_du_releve(self):
        resultat = calculer_chapitre(chapitre_eclairage_observe())
        # ~1082 h sur 8106 : l'éclairage est un chapitre parmi huit, pas la job.
        assert resultat.sous_total_heures < HEURES_RELEVEES

    def test_les_systemes_du_modele_sont_ceux_de_la_page_manuscrite(self):
        assert SYSTEMES_OBSERVES == SYSTEMES


RAPPORT_COMMIS = Path(__file__).resolve().parents[1] / 'S-1695_reconstruction.txt'


def test_le_rapport_commis_est_a_jour(resultat):
    """Le fichier versionné doit être exactement ce que le code produit.

    C'est ce fichier qu'on met à côté du scan de Daniel. Sans ce test il
    pourrit en silence : le code évolue, la page montrée reste celle d'il y a
    trois mois, et la comparaison ne prouve plus rien.
    """
    assert RAPPORT_COMMIS.exists(), (
        f'{RAPPORT_COMMIS.name} manquant. Le régénérer avec '
        '`python3 -m gobby_estimation.s1695 > S-1695_reconstruction.txt`.'
    )
    attendu = rapport(resultat)
    obtenu = RAPPORT_COMMIS.read_text(encoding='utf-8')
    assert obtenu == attendu, (
        'Le rapport versionné a divergé du code. Le régénérer avec '
        '`python3 -m gobby_estimation.s1695 > S-1695_reconstruction.txt`.'
    )
