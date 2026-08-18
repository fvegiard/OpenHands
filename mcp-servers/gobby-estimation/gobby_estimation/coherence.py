"""Contrôle de cohérence des heures — le « Balance » d'ACCEO.

Le rapport confronte trois nombres :

    Heures chargées               8150,000
    Heures du relevé de matériel  8106,286
    Balance                        −43,714

Le signe imprimé fixe la convention : **balance = relevé − chargées**.

Ce que ce module refuse de faire, c'est appeler ça un écart. 8150 est
8106,286 arrondi au 50 h supérieur — ou un rétro-calcul depuis un prix cible.
Les deux sont des décisions d'estimateur. Montrer « −43,714 » à quelqu'un qui
vient volontairement d'ajouter du coussin se lit comme un manque, alors on
affiche aussi la lecture dans l'autre sens : **+43,714 h ajoutées**.

Le seuil est asymétrique, et c'est le point qui compte : charger MOINS que le
relevé est dangereux — c'est de la main-d'oeuvre qu'on exécutera sans l'avoir
vendue. Charger plus est du coussin, une pratique courante.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from gobby_estimation.decimales import ZERO
from gobby_estimation.formatage import heures_fr, pourcent_fr

# Sous ce nombre d'heures, l'écart ne veut rien dire : c'est de l'arrondi.
PLANCHER_HEURES = Decimal('8')

# Coussin toléré sans commentaire, puis seuil au-delà duquel on questionne.
COUSSIN_NORMAL = Decimal('0.10')  # +10 %
COUSSIN_ELEVE = Decimal('0.25')  # +25 %

# Sous-charge : bien plus serré, parce qu'elle coûte de l'argent réel.
SOUS_CHARGE_TOLEREE = Decimal('0.02')  # −2 %

VERDICTS = ('ok', 'attention', 'alerte')


@dataclass(frozen=True)
class ControleHeures:
    """Le bloc « Heures » du rapport, plus la lecture qui manque à ACCEO."""

    heures_relevees: Decimal
    heures_chargees: Decimal
    provenance: str
    verdict: str
    message: str

    @property
    def balance(self) -> Decimal:
        """Convention ACCEO : relevé − chargées. Négatif = on a chargé plus."""
        return self.heures_relevees - self.heures_chargees

    @property
    def heures_ajoutees_par_estimateur(self) -> Decimal:
        """La même chose vue à l'endroit : ce que l'estimateur a ajouté."""
        return self.heures_chargees - self.heures_relevees

    @property
    def ecart_relatif(self) -> Decimal:
        if self.heures_relevees == ZERO:
            return ZERO
        return self.heures_ajoutees_par_estimateur / self.heures_relevees


def controler_heures(
    heures_relevees: Decimal,
    heures_chargees: Decimal | None,
    provenance: str = '',
) -> ControleHeures:
    """Compare relevé et heures chargées, sans traiter un choix comme un bug.

    `heures_chargees` à None signifie « aucun override » : on charge le relevé,
    et il n'y a rien à signaler.
    """
    if heures_chargees is None:
        return ControleHeures(
            heures_relevees=heures_relevees,
            heures_chargees=heures_relevees,
            provenance='relevé de matériel, sans ajustement',
            verdict='ok',
            message='Heures chargées = heures du relevé.',
        )

    controle = ControleHeures(
        heures_relevees=heures_relevees,
        heures_chargees=heures_chargees,
        provenance=provenance,
        verdict='ok',
        message='',
    )
    ajout = controle.heures_ajoutees_par_estimateur
    relatif = controle.ecart_relatif

    if abs(ajout) < PLANCHER_HEURES:
        verdict, message = 'ok', 'Écart négligeable entre relevé et heures chargées.'
    elif ajout < ZERO:
        # Le cas coûteux : des heures qui seront exécutées sans être vendues.
        verdict = 'alerte' if -relatif > SOUS_CHARGE_TOLEREE else 'attention'
        message = (
            f'{heures_fr(-ajout)} du relevé ne sont pas chargées '
            f'({pourcent_fr(-relatif)}). Ces heures seront exécutées sans avoir '
            'été vendues.'
        )
    elif relatif > COUSSIN_ELEVE:
        verdict = 'attention'
        message = (
            f'+{heures_fr(ajout)} ajoutées au relevé ({pourcent_fr(relatif)}). '
            "Coussin élevé : vérifier qu'il n'y a pas double comptage avec un "
            'facteur de main-d’oeuvre déjà appliqué.'
        )
    elif relatif > COUSSIN_NORMAL:
        verdict = 'ok'
        message = f'+{heures_fr(ajout)} ajoutées au relevé ({pourcent_fr(relatif)}).'
    else:
        verdict = 'ok'
        message = (
            f'+{heures_fr(ajout)} ajoutées au relevé '
            f'({pourcent_fr(relatif)}), coussin usuel.'
        )

    if not provenance.strip():
        message += ' Provenance non documentée.'

    return ControleHeures(
        heures_relevees=heures_relevees,
        heures_chargees=heures_chargees,
        provenance=provenance,
        verdict=verdict,
        message=message,
    )
