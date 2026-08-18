"""Tests du dispatch de sessions autonomes.

La construction de commande est pure, donc testée sans lancer d'agent. Le
parsing de `claude agents --json` est testé sur des sorties fabriquées ET sur
la vraie sortie du binaire installé, quand il est présent.
"""

import shutil

import pytest

from gobby_vm.dispatch import (
    MODES_PERMISSION,
    ErreurDispatch,
    OptionsDispatch,
    analyser_agents,
    construire_commande,
    nouvel_identifiant,
    statut,
    url_vue,
)

SID = '11111111-2222-3333-4444-555555555555'


class TestConstructionCommande:
    def test_options_par_defaut(self):
        cmd = construire_commande('corrige le bug', SID)
        assert cmd[0] == 'claude'
        # --bg est ce qui rend la main immédiatement ; sans lui, pas d'autonomie.
        assert '--bg' in cmd
        assert '--print' in cmd
        assert '--session-id' in cmd and SID in cmd
        # La tâche est l'argument positionnel, donc en dernier.
        assert cmd[-1] == 'corrige le bug'

    def test_mode_permission_par_defaut_est_prudent(self):
        cmd = construire_commande('tâche', SID)
        i = cmd.index('--permission-mode')
        assert cmd[i + 1] == 'acceptEdits'

    def test_mode_bypass_accepte(self):
        cmd = construire_commande(
            'tâche', SID, OptionsDispatch(mode_permission='bypassPermissions')
        )
        i = cmd.index('--permission-mode')
        assert cmd[i + 1] == 'bypassPermissions'

    @pytest.mark.parametrize('mode', MODES_PERMISSION)
    def test_tous_les_modes_du_binaire_passent(self, mode):
        # La liste vient de `claude --help`, pas d'un souvenir.
        cmd = construire_commande('tâche', SID, OptionsDispatch(mode_permission=mode))
        assert mode in cmd

    def test_mode_inconnu_refuse_avant_de_lancer_quoi_que_ce_soit(self):
        with pytest.raises(ErreurDispatch, match='Mode de permission inconnu'):
            construire_commande('tâche', SID, OptionsDispatch(mode_permission='yolo'))

    def test_tache_vide_refusee(self):
        with pytest.raises(ErreurDispatch, match='vide'):
            construire_commande('   ', SID)

    def test_mcp_config_repetable(self):
        # C'est ce qui referme la boucle : l'agent dispatché reçoit les mêmes
        # outils que celui qui le lance.
        cmd = construire_commande(
            'tâche', SID, OptionsDispatch(mcp_configs=('a.json', 'b.json'))
        )
        assert cmd.count('--mcp-config') == 2
        assert 'a.json' in cmd and 'b.json' in cmd

    def test_repertoires_repetables(self):
        cmd = construire_commande(
            'tâche', SID, OptionsDispatch(repertoires=('/w/un', '/w/deux'))
        )
        assert cmd.count('--add-dir') == 2

    def test_persona_et_modele(self):
        cmd = construire_commande(
            'tâche',
            SID,
            OptionsDispatch(persona='Tu es estimateur.', modele='claude-opus-5'),
        )
        i = cmd.index('--append-system-prompt')
        assert cmd[i + 1] == 'Tu es estimateur.'
        j = cmd.index('--model')
        assert cmd[j + 1] == 'claude-opus-5'

    def test_identifiant_frappe_d_avance_est_un_uuid(self):
        sid = nouvel_identifiant()
        assert len(sid) == 36 and sid.count('-') == 4
        assert nouvel_identifiant() != sid


class TestUrlVue:
    def test_none_si_non_configure(self):
        # Mieux vaut rien qu'une URL plausible et fausse.
        assert url_vue({}) is None

    def test_valeurs_par_defaut(self):
        assert url_vue({'GOBBY_VM_VNC_HOST': 'localhost'}) == (
            'http://localhost:6080/vnc.html'
        )

    def test_port_et_chemin_surchargeables(self):
        url = url_vue(
            {
                'GOBBY_VM_VNC_HOST': '10.0.0.4',
                'GOBBY_VM_VNC_PORT': '7000',
                'GOBBY_VM_VNC_PATH': '/vnc_lite.html',
            }
        )
        assert url == 'http://10.0.0.4:7000/vnc_lite.html'


class TestAnalyseAgents:
    def test_liste_vide(self):
        assert analyser_agents('') == []
        assert analyser_agents('[]') == []

    def test_json_simple(self):
        agents = analyser_agents('[{"session_id": "abc", "status": "running"}]')
        assert agents == [{'session_id': 'abc', 'status': 'running'}]

    def test_bruit_avant_le_json_tolere(self):
        # Le CLI peut préfixer des lignes de journal ; supposer du JSON pur
        # casserait au premier avertissement affiché.
        agents = analyser_agents('warning: something\n[{"id": "abc"}]')
        assert agents == [{'id': 'abc'}]

    def test_elements_non_objets_ignores(self):
        assert analyser_agents('[{"id": "a"}, "bruit", 42]') == [{'id': 'a'}]

    def test_sans_crochet_refuse(self):
        with pytest.raises(ErreurDispatch, match='inattendue'):
            analyser_agents('command not found')

    def test_json_casse_refuse(self):
        with pytest.raises(ErreurDispatch, match='illisible'):
            analyser_agents('[{"id": ')

    def test_objet_au_lieu_de_liste_refuse(self):
        # Sans crochet ouvrant, c'est la garde « sortie inattendue » qui tranche,
        # avant même le décodage JSON. Refusé quand même, plus tôt.
        with pytest.raises(ErreurDispatch, match='inattendue'):
            analyser_agents('{"id": "a"}')

    def test_json_tronque_apres_le_crochet_refuse(self):
        with pytest.raises(ErreurDispatch, match='illisible'):
            analyser_agents('[[1, 2]] extra')


class TestStatutContreLeVraiBinaire:
    """Vérifie le parseur contre la vraie sortie, pas contre une supposition."""

    @pytest.mark.skipif(
        shutil.which('claude') is None, reason='CLI Claude Code absent de cette machine'
    )
    def test_agents_json_est_analysable(self):
        # N'affirme rien sur le CONTENU (il peut n'y avoir aucune session),
        # seulement que la vraie sortie traverse le parseur sans lever.
        resultat = statut('session-qui-n-existe-pas')
        assert resultat['trouve'] is False
        assert resultat['session_id'] == 'session-qui-n-existe-pas'
        assert 'note' in resultat
