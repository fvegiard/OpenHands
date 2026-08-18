"""Tests du modèle : ce qu'il accepte, et surtout ce qu'il refuse de deviner.

Chaque garde ici correspond à une erreur qui coûte de l'argent en silence.
"""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from gobby_estimation.modeles import (
    HYPOTHESES,
    UM_EN_VRAC,
    Axe,
    Chapitre,
    ConfigCalcul,
    Ligne,
    Marges,
    NatureCout,
    OriginePrix,
    SeauACCEO,
    Soumission,
    SourcePrix,
    TauxHoraire,
    UniteMO,
    hypotheses,
)


def taux_simple() -> TauxHoraire:
    return TauxHoraire.suppose_sans_marge('99,00', 'test')


def config_simple(**extra) -> ConfigCalcul:
    return ConfigCalcul(taux_horaire=taux_simple(), **extra)


class TestUniteMO:
    @pytest.mark.parametrize(
        ('unite', 'diviseur'),
        [(UniteMO.U, 1), (UniteMO.C, 100), (UniteMO.M, 1000)],
    )
    def test_diviseurs(self, unite, diviseur):
        assert unite.diviseur == Decimal(diviseur)


class TestNatureVersSeau:
    @pytest.mark.parametrize(
        ('nature', 'seau'),
        [
            (NatureCout.MATERIEL, SeauACCEO.MATERIEL),
            (NatureCout.MAIN_OEUVRE, SeauACCEO.SERVICE),
            (NatureCout.SOUS_TRAITANCE, SeauACCEO.AUTRES_FRAIS),
            (NatureCout.EQUIPEMENT, SeauACCEO.AUTRES_FRAIS),
            (NatureCout.CAUTIONNEMENT, SeauACCEO.AUTRES_FRAIS),
            (NatureCout.DIVERS, SeauACCEO.AUTRES_FRAIS),
        ],
    )
    def test_chaque_nature_tombe_dans_un_seau(self, nature, seau):
        assert nature.seau is seau

    def test_les_libelles_sont_ceux_du_rapport(self):
        assert SeauACCEO.MATERIEL.libelle == 'Matériel'
        assert SeauACCEO.SERVICE.libelle == 'Service'
        assert SeauACCEO.AUTRES_FRAIS.libelle == 'Autres frais'


class TestLigne:
    def test_entree_fr_ca_acceptee_partout(self):
        ligne = Ligne(
            description='Fil #12 THHN',
            quantite='50 000',
            prix_unitaire='43,72',
            unite_prix=UniteMO.C,
            um='pi',
            temps_unitaire='3,5',
            unite_mo=UniteMO.M,
        )
        assert ligne.quantite == Decimal('50000')
        assert ligne.prix_unitaire == Decimal('43.72')

    @pytest.mark.parametrize('um', sorted(UM_EN_VRAC))
    def test_um_en_vrac_exige_une_base_de_temps(self, um):
        # Le garde à 1000× : un temps « par M » pris pour du « par unité ».
        with pytest.raises(ValidationError, match='aucune base déclarée'):
            Ligne(description='Fil', quantite=1000, um=um, temps_unitaire='3,5')

    def test_um_en_vrac_sans_temps_reste_acceptee(self):
        # Une ligne de matériel sans main-d'oeuvre n'a rien à déclarer.
        ligne = Ligne(description='Fil fourni', quantite=1000, um='pi')
        assert ligne.base_mo is UniteMO.U

    def test_um_en_vrac_avec_base_declaree_passe(self):
        ligne = Ligne(
            description='Fil',
            quantite=1000,
            um='pi',
            temps_unitaire='3,5',
            unite_mo=UniteMO.M,
        )
        assert ligne.unite_mo is UniteMO.M

    def test_um_a_l_unite_n_exige_rien(self):
        ligne = Ligne(
            description='FIXTURE TYPE A', quantite=823, um='U', temps_unitaire='0,750'
        )
        assert ligne.base_mo is UniteMO.U

    def test_main_d_oeuvre_avec_prix_refusee(self):
        # Sinon la ligne serait comptée deux fois : ici et au sommaire.
        with pytest.raises(ValidationError, match='sous-traitance'):
            Ligne(
                description='Pose',
                quantite=1,
                prix_unitaire='1000',
                nature=NatureCout.MAIN_OEUVRE,
            )

    def test_quantite_negative_refusee(self):
        with pytest.raises(ValidationError, match='négative'):
            Ligne(description='X', quantite=-1)

    @pytest.mark.parametrize('perte', ['-0,01', '1', '1,5'])
    def test_facteur_de_perte_hors_bornes_refuse(self, perte):
        with pytest.raises(ValidationError, match='facteur de perte'):
            Ligne(description='X', quantite=1, facteur_perte=perte)

    def test_prix_en_heures_refuse(self):
        with pytest.raises(ValidationError, match='jamais des heures'):
            Ligne(description='X', quantite=1, axe_prix=Axe.HEURES)

    def test_ligne_immuable(self):
        ligne = Ligne(description='X', quantite=1)
        with pytest.raises(ValidationError):
            ligne.quantite = Decimal('2')

    def test_champ_inconnu_refuse(self):
        # Un champ mal orthographié qui passerait en silence perdrait sa valeur.
        with pytest.raises(ValidationError):
            Ligne(description='X', quantite=1, prix_unitair='10')


class TestSourcePrix:
    def test_peremption(self):
        from datetime import date

        source = SourcePrix(
            origine=OriginePrix.COTATION,
            reference='Westburne 2026-07-02',
            date_validite=date(2026, 8, 1),
        )
        assert source.perimee_le(date(2026, 8, 2))
        assert not source.perimee_le(date(2026, 7, 31))

    def test_sans_date_jamais_perimee(self):
        from datetime import date

        source = SourcePrix(origine=OriginePrix.ESTIME)
        assert not source.perimee_le(date(2099, 1, 1))


class TestChapitre:
    def test_facteurs_par_defaut_neutres(self):
        chapitre = Chapitre(code='CH11')
        assert chapitre.facteur_md == 1
        assert chapitre.mult_bloc == 1

    @pytest.mark.parametrize('valeur', ['0', '-1'])
    def test_facteur_md_nul_refuse(self, valeur):
        with pytest.raises(ValidationError, match='facteur de m-d'):
            Chapitre(code='CH11', facteur_md=valeur)

    @pytest.mark.parametrize('valeur', ['0', '-2'])
    def test_mult_bloc_nul_refuse(self, valeur):
        with pytest.raises(ValidationError, match='Mult Bloc'):
            Chapitre(code='CH11', mult_bloc=valeur)


class TestTauxHoraire:
    def test_marge_deduite_du_couple(self):
        taux = TauxHoraire(taux='99,00', cout_horaire='75,00', provenance='paie 2026')
        # 99/75 − 1 = 32 %
        assert taux.marge_incluse == Decimal('0.32')

    def test_provenance_obligatoire(self):
        with pytest.raises(ValidationError):
            TauxHoraire(taux='99,00', cout_horaire='75,00', provenance='')

    def test_cout_horaire_sans_defaut(self):
        # Le champ ne peut pas être omis : c'est la garantie qu'aucune marge
        # nulle ne s'installe par défaut.
        with pytest.raises(ValidationError):
            TauxHoraire(taux='99,00', provenance='x')

    def test_supposition_declaree(self):
        taux = TauxHoraire.suppose_sans_marge('99,00', 'sommaire seul')
        assert taux.marge_supposee is True
        assert taux.marge_incluse == 0

    def test_taux_sous_le_cout_refuse(self):
        with pytest.raises(ValidationError, match='perdrait de l’argent'):
            TauxHoraire(taux='70', cout_horaire='75', provenance='x')


class TestMarges:
    def test_composition_multiplicative(self):
        marges = Marges(administration='0,10', profit='0,10')
        # Composées : 1,21 — pas 1,20. La différence est réelle sur 1,2 M$.
        assert marges.facteur == Decimal('1.21')

    @pytest.mark.parametrize('champ', ['administration', 'profit'])
    @pytest.mark.parametrize('valeur', ['-0,01', '1', '10'])
    def test_hors_bornes_refuse(self, champ, valeur):
        with pytest.raises(ValidationError, match='fraction'):
            Marges(**{champ: valeur})


class TestConfigCalcul:
    def test_heures_chargees_exigent_une_provenance(self):
        with pytest.raises(ValidationError, match='provenance'):
            config_simple(heures_chargees='8150')

    def test_heures_chargees_avec_provenance_passent(self):
        config = config_simple(
            heures_chargees='8150', provenance_heures_chargees='arrondi au 50 h'
        )
        assert config.heures_chargees == Decimal('8150')

    def test_ajustement_global_exige_une_provenance(self):
        # Le champ existe dans ACCEO pour une décision assumée. L'utiliser pour
        # absorber un écart de calcul est exactement l'erreur à empêcher.
        with pytest.raises(ValidationError, match='provenance'):
            config_simple(ajustement_global='0,03')

    def test_marges_absentes_valent_zero(self):
        config = config_simple()
        assert config.marges_de(SeauACCEO.MATERIEL).facteur == 1

    def test_taxes_desactivees_par_defaut(self):
        # Le tirage observé n'en porte pas ; les activer par défaut changerait
        # le grand total de 15 % sans que personne ne l'ait demandé.
        assert config_simple().taxes_applicables is False


class TestSoumission:
    def test_codes_de_chapitre_uniques(self):
        chapitre = Chapitre(code='CH11')
        with pytest.raises(ValidationError, match='double'):
            Soumission(
                numero='S-1', config=config_simple(), chapitres=(chapitre, chapitre)
            )


class TestHypotheses:
    def test_chaque_hypothese_declare_sa_confiance(self):
        for hypothese in HYPOTHESES.values():
            assert hypothese.confiance in ('observé', 'inféré')
            assert hypothese.fondement.strip()

    def test_resolution_par_code(self):
        assert hypotheses('H-BALANCE')[0].est_observee

    def test_code_inconnu_liste_les_codes_connus(self):
        with pytest.raises(KeyError, match='H-BALANCE'):
            hypotheses('H-INVENTEE')
