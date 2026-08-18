"""Tests du pont outil MCP ↔ noeud PyFlowGraph.

Le test qui compte est celui de fidélité : notre Markdown est relu par le
parseur de PyFlowGraph lui-même, qui sert d'oracle. Vérifier notre écriture
avec notre propre lecture ne prouverait rien.
"""

import importlib.util
import os
from pathlib import Path

import pytest

from gobby_vm import registre
from gobby_vm.pont import (
    COULEURS,
    ErreurPont,
    OutilMCP,
    Parametre,
    appeler_outil,
    chainer,
    code_du_noeud,
    connecter,
    graphe_depuis_outils,
    noeud_depuis_outil,
    nom_python,
    vers_markdown,
)

OUTIL = OutilMCP(
    nom='estimation_calculer',
    description='Calcule une soumission complète.',
    parametres=(
        Parametre('soumission_id', 'str'),
        Parametre('portee', 'str', defaut="'tout'"),
    ),
    type_retour='str',
    famille='estimation',
)


class TestNomPython:
    @pytest.mark.parametrize(
        ('brut', 'attendu'),
        [
            ('estimation_calculer', 'estimation_calculer'),
            ('mcp.outil-avec-tirets', 'mcp_outil_avec_tirets'),
            ('2rapide', '_2rapide'),
        ],
    )
    def test_assainissement(self, brut, attendu):
        assert nom_python(brut) == attendu

    def test_nom_vide_refuse(self):
        with pytest.raises(ErreurPont, match='inutilisable'):
            nom_python('')


class TestCodeGenere:
    def test_est_du_python_valide(self):
        # Un noeud dont le code ne compile pas échouerait à l'exécution du
        # graphe, donc tard et loin de la cause.
        compile(code_du_noeud(OUTIL), '<noeud>', 'exec')

    def test_annotations_presentes(self):
        # PyFlowGraph crée les pins EN LISANT ces annotations. Sans elles,
        # pas de pins, donc pas de noeud utilisable.
        code = code_du_noeud(OUTIL)
        assert 'soumission_id: str' in code
        assert "portee: str = 'tout'" in code
        assert '-> str' in code

    def test_decorateur_node_entry(self):
        assert '@node_entry' in code_du_noeud(OUTIL)

    def test_delegue_a_l_outil_sans_reimplementer(self):
        code = code_du_noeud(OUTIL)
        assert 'appeler_outil' in code
        assert "'estimation_calculer'" in code

    def test_type_inconnu_retombe_sur_str(self):
        exotique = OutilMCP(
            nom='bizarre', parametres=(Parametre('x', 'SoumissionComplete'),)
        )
        code = code_du_noeud(exotique)
        assert 'x: str' in code
        compile(code, '<noeud>', 'exec')

    def test_outil_sans_parametre(self):
        code = code_du_noeud(OutilMCP(nom='vm_statut'))
        assert 'def vm_statut() -> str' in code
        compile(code, '<noeud>', 'exec')


class TestNoeud:
    def test_champs_attendus(self):
        noeud = noeud_depuis_outil(OUTIL)
        for cle in ('uuid', 'title', 'description', 'pos', 'size', 'code', 'colors'):
            assert cle in noeud

    def test_couleur_par_famille(self):
        assert noeud_depuis_outil(OUTIL)['colors'] == COULEURS['estimation']
        inconnu = OutilMCP(nom='x', famille='pas_une_famille')
        assert noeud_depuis_outil(inconnu)['colors'] == COULEURS['defaut']

    def test_noeuds_etales_et_non_empiles(self):
        # Tous en (0,0), le graphe paraît vide à l'ouverture.
        graphe = graphe_depuis_outils([OUTIL, OutilMCP(nom='vm_statut')])
        positions = [n['pos'][0] for n in graphe['nodes']]
        assert positions[0] != positions[1]


class TestConnexions:
    def test_forme_attendue(self):
        lien = connecter('a', 'exec_out', 'b', 'exec_in')
        assert lien == {
            'start_node_uuid': 'a',
            'start_pin_name': 'exec_out',
            'end_node_uuid': 'b',
            'end_pin_name': 'exec_in',
        }

    def test_chainage_sequentiel(self):
        liens = chainer(['a', 'b', 'c'])
        assert len(liens) == 2
        assert liens[0]['start_node_uuid'] == 'a'
        assert liens[1]['end_node_uuid'] == 'c'

    def test_chainage_d_un_seul_noeud(self):
        assert chainer(['a']) == []
        assert chainer([]) == []


class TestRegistre:
    def setup_method(self):
        registre.vider()

    def teardown_method(self):
        registre.vider()

    def test_appel_via_le_pont(self):
        registre.enregistrer('addition', lambda a, b: str(int(a) + int(b)))
        assert appeler_outil('addition', {'a': '2', 'b': '3'}) == '5'

    def test_outil_inconnu_dit_quoi_faire(self):
        registre.enregistrer('connu', lambda: 'ok')
        with pytest.raises(registre.OutilInconnu) as err:
            appeler_outil('absent', {})
        message = str(err.value)
        assert 'absent' in message
        assert 'connu' in message  # liste les outils disponibles
        assert 'enregistrer' in message  # dit comment corriger


def _oracle_pyflowgraph():
    """Charge le parseur de PyFlowGraph, s'il est disponible.

    Chargé par chemin : le paquet `data` de PyFlowGraph tire PySide6 via son
    `__init__`, alors que `flow_format.py` lui-même est sans Qt.
    """
    racine = os.environ.get('PYFLOWGRAPH_PATH')
    if not racine:
        return None
    chemin = Path(racine) / 'src' / 'data' / 'flow_format.py'
    if not chemin.exists():
        return None
    spec = importlib.util.spec_from_file_location('flow_format_oracle', chemin)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.FlowFormatHandler()


class TestFideliteDuFormat:
    """Notre écriture est relue par le parseur de PyFlowGraph."""

    @pytest.mark.skipif(
        _oracle_pyflowgraph() is None,
        reason='PYFLOWGRAPH_PATH non défini ou PyFlowGraph absent',
    )
    def test_aller_retour_par_le_vrai_parseur(self):
        oracle = _oracle_pyflowgraph()
        outils = [OUTIL, OutilMCP(nom='vm_statut', famille='vm')]
        graphe = graphe_depuis_outils(outils, titre='Test pont')
        graphe['connections'] = chainer([o.uuid() for o in outils])

        relu = oracle.markdown_to_data(vers_markdown(graphe))

        assert relu['graph_title'] == 'Test pont'
        assert len(relu['nodes']) == 2
        assert len(relu['connections']) == 1

        titres = {n['title'] for n in relu['nodes']}
        assert titres == {'estimation_calculer', 'vm_statut'}

        # Le code doit survivre au tour complet : c'est lui qui porte les pins.
        premier = next(n for n in relu['nodes'] if n['title'] == 'estimation_calculer')
        assert '@node_entry' in premier['code']
        assert 'soumission_id: str' in premier['code']
        compile(premier['code'], '<relu>', 'exec')

    def test_markdown_structurellement_correct_sans_oracle(self):
        # Filet de sécurité quand PyFlowGraph n'est pas installé.
        md = vers_markdown(graphe_depuis_outils([OUTIL], titre='Sans oracle'))
        assert md.startswith('# Sans oracle')
        assert '## Node: estimation_calculer (ID: mcp-estimation-calculer)' in md
        assert '### Metadata' in md
        assert '### Logic' in md
        assert '## Connections' in md
        assert '```python' in md and '```json' in md
