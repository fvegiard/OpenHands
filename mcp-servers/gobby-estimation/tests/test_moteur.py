"""Tests du calcul : quel facteur touche quel axe, et le piège des unités."""

from decimal import Decimal

from gobby_estimation.decimales import q_argent, q_heures
from gobby_estimation.modeles import (
    Axe,
    Chapitre,
    Ligne,
    NatureCout,
    SeauACCEO,
    UniteMO,
)
from gobby_estimation.moteur import calculer_chapitre, calculer_ligne


class TestUnitesDeMainDOeuvre:
    """L'erreur d'un facteur 100 à 1000, celle qui ne se voit pas au relevé."""

    def test_temps_par_mille(self):
        # 50 000 pi de #12 THHN à 3,5 h/M = 175 h. Pris pour du h/U : 175 000 h.
        ligne = Ligne(
            description='#12 THHN',
            quantite=50000,
            um='pi',
            temps_unitaire='3,5',
            unite_mo=UniteMO.M,
        )
        assert q_heures(calculer_ligne(ligne).heures) == Decimal('175.000')

    def test_temps_par_cent(self):
        # EMT 3/4" à 5 h/C sur 2 000 pi = 100 h.
        ligne = Ligne(
            description='EMT 3/4"',
            quantite=2000,
            um='pi',
            temps_unitaire='5',
            unite_mo=UniteMO.C,
        )
        assert q_heures(calculer_ligne(ligne).heures) == Decimal('100.000')

    def test_prix_par_cent(self):
        # #12 THHN coté 43,72 $/C vaut 0,4372 $/pi. Sur 50 000 pi : 21 860 $.
        ligne = Ligne(
            description='#12 THHN',
            quantite=50000,
            um='pi',
            prix_unitaire='43,72',
            unite_prix=UniteMO.C,
        )
        assert q_argent(calculer_ligne(ligne).montant) == Decimal('21860.00')

    def test_la_precision_du_prix_unitaire_survit_a_l_extension(self):
        # Le défaut à 165 $ : arrondir 0,4567 $/pi à 0,46 $/pi avant d'étendre.
        ligne = Ligne(description='Fil', quantite=50000, prix_unitaire='0,4567')
        assert q_argent(calculer_ligne(ligne).montant) == Decimal('22835.00')


class TestPerte:
    def test_la_perte_gonfle_le_materiel(self):
        ligne = Ligne(
            description='Fil', quantite=1000, prix_unitaire='1', facteur_perte='0,05'
        )
        resultat = calculer_ligne(ligne)
        assert resultat.quantite_achetee == Decimal('1050.00')
        assert q_argent(resultat.montant) == Decimal('1050.00')

    def test_la_perte_ne_touche_pas_les_heures(self):
        # On paie les retailles, on ne les installe pas.
        ligne = Ligne(
            description='Fil',
            quantite=1000,
            um='pi',
            temps_unitaire='3',
            unite_mo=UniteMO.M,
            facteur_perte='0,10',
        )
        assert q_heures(calculer_ligne(ligne).heures) == Decimal('3.000')


class TestFacteursDuChapitre:
    """Sous-total → ×Facteur m-d → Total ajusté → ×Mult Bloc → Total."""

    def chapitre(self, **extra) -> Chapitre:
        return Chapitre(
            code='CH01',
            nom='ECLAIRAGE',
            lignes=(
                Ligne(
                    description='FIXTURE A',
                    quantite=100,
                    prix_unitaire='50',
                    temps_unitaire='0,750',
                ),
            ),
            **extra,
        )

    def test_le_facteur_md_multiplie_les_heures(self):
        resultat = calculer_chapitre(self.chapitre(facteur_md='1,15'))
        assert q_heures(resultat.sous_total_heures) == Decimal('75.000')
        assert q_heures(resultat.heures_ajustees) == Decimal('86.250')

    def test_le_facteur_md_ne_touche_pas_le_materiel(self):
        # Un électricien plus lent ne fait pas monter le prix du fil.
        neutre = calculer_chapitre(self.chapitre())
        ralenti = calculer_chapitre(self.chapitre(facteur_md='1,15'))
        assert neutre.total_argent == ralenti.total_argent == Decimal('5000')

    def test_le_mult_bloc_multiplie_les_trois_axes(self):
        # 14 étages identiques : 14 fois le matériel ET 14 fois les heures.
        resultat = calculer_chapitre(self.chapitre(mult_bloc='14'))
        assert resultat.total_argent == Decimal('70000')
        assert q_heures(resultat.total_heures) == Decimal('1050.000')

    def test_les_deux_facteurs_se_composent_sur_les_heures(self):
        resultat = calculer_chapitre(self.chapitre(facteur_md='1,15', mult_bloc='14'))
        assert q_heures(resultat.total_heures) == Decimal('1207.500')

    def test_chapitre_vide_donne_zero_dans_chaque_seau(self):
        # Un seau absent du sommaire se lit comme un oubli, pas comme un zéro.
        resultat = calculer_chapitre(Chapitre(code='CH99'))
        assert set(resultat.sous_total) == set(SeauACCEO)
        assert all(valeur == 0 for valeur in resultat.sous_total.values())


class TestVentilationParSeau:
    def test_chaque_ligne_tombe_dans_son_seau(self):
        chapitre = Chapitre(
            code='CH05',
            nom='ALARME INCENDIE',
            lignes=(
                Ligne(description='Détecteurs', quantite=100, prix_unitaire='75'),
                Ligne(
                    description='Vérification ULC-S537',
                    quantite=1,
                    prix_unitaire='4 500',
                    nature=NatureCout.SOUS_TRAITANCE,
                ),
            ),
        )
        resultat = calculer_chapitre(chapitre)
        assert resultat.sous_total[SeauACCEO.MATERIEL] == Decimal('7500')
        assert resultat.sous_total[SeauACCEO.AUTRES_FRAIS] == Decimal('4500')

    def test_les_lignes_deja_vendantes_sont_suivies_a_part(self):
        chapitre = Chapitre(
            code='CH05',
            lignes=(
                Ligne(description='Coûtant', quantite=1, prix_unitaire='100'),
                Ligne(
                    description='Déjà vendant',
                    quantite=1,
                    prix_unitaire='150',
                    axe_prix=Axe.VENDANT,
                ),
            ),
        )
        resultat = calculer_chapitre(chapitre)
        assert resultat.sous_total[SeauACCEO.MATERIEL] == Decimal('250')
        assert resultat.sous_total_deja_vendu[SeauACCEO.MATERIEL] == Decimal('150')
