"""Types Decimal du domaine, quantificateurs et conversions d'entrée.

Aucun `float` n'entre jamais dans un calcul monétaire. Le module expose des
échelles DISTINCTES par nature de valeur, ce qui est le point corrigé le plus
important du modèle : appliquer l'échelle « argent » (2 décimales) à un prix
unitaire perd de l'argent pour de vrai.

    50 000 pi de fil à 0,4567 $/pi  =  22 835,00 $
    arrondi du prix unitaire à 0,46 =  23 000,00 $   →  +165,00 $ d'erreur

En estimation électrique les prix viennent en « par C » (100) ou « par M »
(1000), donc les prix unitaires portent couramment 4 à 6 décimales. Seuls les
TOTAUX sont de l'argent à 2 décimales.

Politique d'arrondi : pleine précision de la ligne jusqu'au grand total ;
la quantification a lieu à l'IMPRESSION (voir `formatage`). C'est ce que fait
ACCEO — l'écart de 0,03 $ observé sur S-1695 entre la somme des extensions
imprimées et le grand total publié est le résidu attendu de cette politique,
pas un ajustement saisi par quelqu'un.
"""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Context, Decimal, InvalidOperation

# Largeur IEEE decimal128. Assez pour des produits quantité × prix sans perte.
CTX = Context(prec=34, rounding=ROUND_HALF_UP)

# Échelles par nature de valeur. Ne PAS les confondre.
ARGENT = Decimal('0.01')  # totaux de ligne et au-dessus
PRIX_UNITAIRE = Decimal('0.00001')  # par U / par C / par M
QUANTITE = Decimal('0.001')
HEURES = Decimal('0.001')  # ACCEO imprime 3 décimales
POURCENTAGE = Decimal('0.00001')  # 0,09975 = 9,975 %

ZERO = Decimal('0')
UN = Decimal('1')

# Espaces utilisés comme séparateur de milliers en fr-CA : espace fine
# insécable (U+202F), insécable (U+00A0), fine (U+2009), ordinaire.
_ESPACES = '    '
_NETTOYAGE = re.compile(f'[{_ESPACES}$]')


class ErreurValeur(ValueError):
    """Valeur numérique refusée par le domaine."""


def _quantifier(valeur: Decimal, echelle: Decimal) -> Decimal:
    # `CTX.quantize(...)` applique la précision et l'arrondi de CTX directement,
    # sans toucher au contexte ambiant du thread. Ne pas remplacer par un
    # `with CTX:` — un Context n'est pas un gestionnaire de contexte (seul
    # `decimal.localcontext()` l'est), et l'écrire ainsi lève un TypeError.
    return normaliser_zero(CTX.quantize(valeur, echelle))


def q_argent(valeur: Decimal) -> Decimal:
    """Quantifie un montant à 2 décimales. Réservé aux TOTAUX."""
    return _quantifier(valeur, ARGENT)


def q_prix_unitaire(valeur: Decimal) -> Decimal:
    return _quantifier(valeur, PRIX_UNITAIRE)


def q_quantite(valeur: Decimal) -> Decimal:
    return _quantifier(valeur, QUANTITE)


def q_heures(valeur: Decimal) -> Decimal:
    return _quantifier(valeur, HEURES)


def q_pourcent(valeur: Decimal) -> Decimal:
    return _quantifier(valeur, POURCENTAGE)


def normaliser_zero(valeur: Decimal) -> Decimal:
    """Ramène -0.00 à 0.00.

    Un zéro négatif traverse les validations de format et s'imprime
    « -0,00 $ » dans un rapport, ce qui fait douter du reste du document.
    """
    if valeur == 0:
        return valeur.copy_abs()
    return valeur


def depuis_fr_ca(texte: str) -> Decimal:
    """Interprète un nombre écrit à la québécoise.

    Les documents sources impriment « 1 204 158,59 $ ». Sans cette normalisation
    à l'entrée, chaque échange commencerait par une conversion à la main faite
    par le modèle de langage — c'est-à-dire exactement le risque de
    transcription que tout le reste de l'architecture cherche à supprimer.
    """
    nettoye = _NETTOYAGE.sub('', texte.strip())
    if not nettoye:
        raise ErreurValeur('Valeur numérique vide.')
    # La virgule est le séparateur décimal ; il n'y en a jamais plus d'une.
    if nettoye.count(',') > 1:
        raise ErreurValeur(f'Nombre mal formé : {texte!r} (plusieurs virgules).')
    nettoye = nettoye.replace(',', '.')
    try:
        return normaliser_zero(Decimal(nettoye))
    except InvalidOperation as err:
        raise ErreurValeur(f'Nombre illisible : {texte!r}.') from err


def vers_decimal(
    valeur: object, *, champ: str = 'valeur'
) -> tuple[Decimal, str | None]:
    """Convertit une entrée en Decimal et signale toute conversion inexacte.

    Retourne `(decimal, avertissement)`. Un `float` n'est PAS refusé : pour tout
    nombre JSON d'au plus 15 chiffres significatifs — c'est-à-dire tout montant
    réaliste — `Decimal(repr(x))` est exact, parce que `repr` d'un float Python
    produit la plus courte chaîne qui reconstitue la même valeur binaire.

    Refuser durement forcerait le modèle à réémettre le lot entier, et faire
    retransiter des centaines de chiffres par un LLM est un risque bien plus
    grand — et silencieux — que la conversion elle-même.
    """
    if isinstance(valeur, Decimal):
        if not valeur.is_finite():
            raise ErreurValeur(f'{champ} : valeur non finie refusée.')
        return normaliser_zero(valeur), None

    if isinstance(valeur, bool):
        # bool est un int en Python ; l'accepter masquerait une erreur d'appel.
        raise ErreurValeur(f'{champ} : booléen reçu là où un nombre est attendu.')

    if isinstance(valeur, int):
        return Decimal(valeur), None

    if isinstance(valeur, float):
        if valeur != valeur or valeur in (float('inf'), float('-inf')):
            raise ErreurValeur(f'{champ} : valeur non finie refusée.')
        converti = Decimal(repr(valeur))
        avertissement = (
            f'{champ} : reçu comme nombre à virgule flottante ({valeur!r}), '
            f'converti exactement en {converti}. Transmettre une chaîne '
            f"(ex. '{converti}') évite toute ambiguïté."
        )
        return normaliser_zero(converti), avertissement

    if isinstance(valeur, str):
        return depuis_fr_ca(valeur), None

    raise ErreurValeur(f'{champ} : type non supporté ({type(valeur).__name__}).')
