"""Tests du serveur MCP unifié.

Les outils sont appelés EN PROCESSUS, sans lancer de sous-processus stdio,
comme le fait déjà le dépôt pour son serveur Claude Desktop.
"""

from pathlib import Path

import pytest

from gobby_vm.serveur import (
    NON_NOEUDS,
    ConfigServeur,
    build_server,
    famille_de,
    parametres_depuis_schema,
)


@pytest.fixture
def config(tmp_path: Path) -> ConfigServeur:
    return ConfigServeur(repertoire_graphes=tmp_path / 'graphes')


async def appeler(serveur, nom: str, **arguments):
    outil = await serveur.get_tool(nom)
    return await outil.run(arguments=arguments)


class TestFamille:
    @pytest.mark.parametrize(
        ('nom', 'attendu'),
        [
            ('vm_dispatcher', 'vm'),
            ('estimation_calculer', 'estimation'),
            ('graphe_lire', 'graphe'),
            ('sansprefixe', 'defaut'),
        ],
    )
    def test_deduction(self, nom, attendu):
        assert famille_de(nom) == attendu


class TestSchemaVersPins:
    def test_schema_absent(self):
        assert parametres_depuis_schema(None) == ()
        assert parametres_depuis_schema({}) == ()

    def test_types_traduits(self):
        params = parametres_depuis_schema(
            {
                'properties': {
                    'texte': {'type': 'string'},
                    'nombre': {'type': 'integer'},
                    'reel': {'type': 'number'},
                    'drapeau': {'type': 'boolean'},
                    'liste': {'type': 'array'},
                },
                'required': ['texte', 'nombre', 'reel', 'drapeau', 'liste'],
            }
        )
        types = {p.nom: p.type_python for p in params}
        assert types == {
            'texte': 'str',
            'nombre': 'int',
            'reel': 'float',
            'drapeau': 'bool',
            'liste': 'list',
        }

    def test_optionnel_recoit_un_defaut(self):
        # Sans défaut, le noeud exigerait un pin branché pour chaque champ
        # facultatif — inutilisable à l'écran.
        params = parametres_depuis_schema(
            {
                'properties': {
                    'obligatoire': {'type': 'string'},
                    'libre': {'type': 'string'},
                },
                'required': ['obligatoire'],
            }
        )
        par_nom = {p.nom: p for p in params}
        assert par_nom['obligatoire'].defaut is None
        assert par_nom['libre'].defaut is not None

    def test_type_nullable(self):
        params = parametres_depuis_schema(
            {'properties': {'x': {'type': ['string', 'null']}}, 'required': []}
        )
        assert params[0].type_python == 'str'


class TestOutilsExposes:
    async def test_les_outils_attendus_existent(self, config):
        serveur = build_server(config)
        noms = {outil.name for outil in await serveur.list_tools()}
        assert {
            'vm_dispatcher',
            'vm_statut',
            'vm_sessions',
            'vm_vue',
            'graphe_depuis_outils',
            'graphe_lire',
        } <= noms

    async def test_vue_non_configuree_le_dit(self, config, monkeypatch):
        monkeypatch.delenv('GOBBY_VM_VNC_HOST', raising=False)
        resultat = await appeler(build_server(config), 'vm_vue')
        donnees = resultat.structured_content
        assert donnees['vue'] is None
        assert 'GOBBY_VM_VNC_HOST' in donnees['note']


class TestGrapheDepuisOutils:
    """La boucle qui se referme : le serveur transforme ses propres outils."""

    async def test_ecrit_un_fichier_et_liste_les_noeuds(self, config):
        serveur = build_server(config)
        resultat = await appeler(serveur, 'graphe_depuis_outils', titre='Essai')
        donnees = resultat.structured_content

        fichier = Path(donnees['fichier'])
        assert fichier.exists()
        assert donnees['noeuds']

        contenu = fichier.read_text(encoding='utf-8')
        assert contenu.startswith('# Essai')
        assert '@node_entry' in contenu

    async def test_exclut_les_outils_qui_n_ont_pas_de_sens_en_noeud(self, config):
        resultat = await appeler(build_server(config), 'graphe_depuis_outils')
        for exclu in NON_NOEUDS:
            assert exclu not in resultat.structured_content['noeuds']

    async def test_selection_explicite(self, config):
        resultat = await appeler(
            build_server(config), 'graphe_depuis_outils', outils=['vm_statut']
        )
        assert resultat.structured_content['noeuds'] == ['vm_statut']

    async def test_chainage_optionnel(self, config):
        serveur = build_server(config)
        avec = await appeler(serveur, 'graphe_depuis_outils', nom_fichier='a.md')
        sans = await appeler(
            serveur,
            'graphe_depuis_outils',
            chainer_en_sequence=False,
            nom_fichier='b.md',
        )
        assert avec.structured_content['connexions'] > 0
        assert sans.structured_content['connexions'] == 0

    async def test_selection_vide_explique(self, config):
        with pytest.raises(Exception, match='Aucun outil retenu|Disponibles'):
            await appeler(
                build_server(config), 'graphe_depuis_outils', outils=['nexiste_pas']
            )

    async def test_le_code_genere_porte_les_pins(self, config):
        serveur = build_server(config)
        resultat = await appeler(
            serveur, 'graphe_depuis_outils', outils=['vm_statut'], nom_fichier='p.md'
        )
        contenu = Path(resultat.structured_content['fichier']).read_text(
            encoding='utf-8'
        )
        # vm_statut prend session_id: c'est ce paramètre qui devient un pin.
        assert 'session_id: str' in contenu


class TestGrapheLire:
    async def test_relit_ce_qui_vient_d_etre_ecrit(self, config):
        serveur = build_server(config)
        ecrit = await appeler(serveur, 'graphe_depuis_outils', nom_fichier='r.md')
        chemin = ecrit.structured_content['fichier']

        relu = await appeler(serveur, 'graphe_lire', chemin=chemin)
        assert '@node_entry' in str(relu.structured_content or relu.content)

    async def test_fichier_absent_explique(self, config):
        with pytest.raises(Exception, match='introuvable'):
            await appeler(build_server(config), 'graphe_lire', chemin='/nexiste/pas.md')
