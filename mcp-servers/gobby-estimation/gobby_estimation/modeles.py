"""Modèle de données ACCEO Estimation.

Réplique de ce qui est IMPRIMÉ sur le rapport ACCEO de la soumission S-1695
(Hotel Playground, Kahnawake — relevé de Daniel Dupuis). Rien n'est inventé ici
sans être marqué : ce qui vient du papier est dans `HYPOTHESES` avec la
confiance « observé », ce qui est déduit avec « inféré ».

Ce que le rapport montre, et que ce module reproduit tel quel :

* **Sommaire par chapitre** — colonnes `Sous-total | Facteur de m-d |
  Total ajusté | Mult Bloc | Total`.
* **Trois axes jamais fusionnés** — Coûtant, Vendant, Main-d'oeuvre en heures.
* **Lignes d'items** — `Description | Quantité | UM | Vendant unit. | Vendant |
  Temps unit. | Temps total`.
* **Sommaire de soumission** — Matériel / Service / Autres frais, chacun avec
  Coûtant, Administration %, Profit %, Vendant ; puis Sous-total, Ajustement
  global, TPS/TVQ, Grand total.
* **Contrôle de cohérence** — « Heures chargées » vs « Heures du relevé » vs
  « Balance ».

Le calcul lui-même vit dans `moteur`. Ici : les formes, leurs invariants, et
les endroits où le modèle refuse de deviner à la place de l'estimateur.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator

from gobby_estimation.decimales import UN, ZERO, ErreurValeur, vers_decimal

# --------------------------------------------------------------------------
# Registre des hypothèses
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Hypothese:
    """Une affirmation du modèle, avec ce qui la fonde.

    Toute sortie de calcul recopie les hypothèses qu'elle a utilisées. Sans ce
    report, une reconstruction plausible devient « ce que dit ACCEO » au bout
    de deux conversations.
    """

    code: str
    enonce: str
    fondement: str
    confiance: str  # 'observé' (lu sur le rapport) ou 'inféré' (déduit)

    @property
    def est_observee(self) -> bool:
        return self.confiance == 'observé'


def _h(code: str, enonce: str, fondement: str, confiance: str) -> Hypothese:
    return Hypothese(code=code, enonce=enonce, fondement=fondement, confiance=confiance)


HYPOTHESES: dict[str, Hypothese] = {
    h.code: h
    for h in (
        _h(
            'H-COLONNES',
            'Le sommaire de chapitre enchaîne Sous-total → ×Facteur de m-d → '
            'Total ajusté → ×Mult Bloc → Total.',
            'Colonnes lues sur le sommaire du chapitre CH11 du rapport S-1695.',
            'observé',
        ),
        _h(
            'H-AXES',
            'Coûtant, Vendant et Heures sont trois axes distincts, jamais '
            'additionnés entre eux.',
            'Trois blocs de colonnes séparés sur le rapport.',
            'observé',
        ),
        _h(
            'H-SEAUX',
            'Le sommaire de soumission porte exactement trois seaux : Matériel, '
            'Service, Autres frais.',
            'Lignes du sommaire de soumission du rapport S-1695.',
            'observé',
        ),
        _h(
            'H-BALANCE',
            'Balance = heures du relevé − heures chargées.',
            'S-1695 : 8106,286 − 8150,000 = −43,714, le signe imprimé.',
            'observé',
        ),
        _h(
            'H-FACTEUR-MD',
            "Le facteur de main-d'oeuvre corrige la PRODUCTIVITÉ : il multiplie "
            'les heures, jamais les dollars de matériel.',
            "Convention d'estimation électrique ; le rapport le place dans le "
            'bloc de colonnes des heures.',
            'inféré',
        ),
        _h(
            'H-MULT-BLOC',
            'Le Mult Bloc est un facteur de répétition physique : il multiplie '
            'les trois axes.',
            'S-1695 : ×14 pour 14 étages identiques ; répéter un étage répète '
            'son matériel et ses heures.',
            'inféré',
        ),
        _h(
            'H-PERTE',
            'Le facteur de perte augmente la quantité de matériel achetée, pas '
            'les heures : on ne pose pas les retailles.',
            "Convention d'estimation ; non visible sur le sommaire.",
            'inféré',
        ),
        _h(
            'H-AUTRES-FRAIS',
            'Sous-traitance, équipement et cautionnement tombent dans le seau '
            '« Autres frais ».',
            "Le sommaire n'offre que trois seaux et ces coûts ne sont ni du "
            'matériel ni des heures internes.',
            'inféré',
        ),
        _h(
            'H-PRIX-AXE',
            "Le prix unitaire d'une ligne est du COÛTANT par défaut.",
            'Le seau qui alimente le grand total est étiqueté « Coûtant » ; le '
            'détail imprime « Vendant unit. », mais sur S-1695 Administration '
            'et Profit sont à 0 %, donc les deux colonnes coïncident et '
            "l'observation ne tranche pas.",
            'inféré',
        ),
        _h(
            'H-ECART',
            "L'écart entre la somme des extensions imprimées et le grand total "
            "publié est un résidu d'arrondi d'impression, pas une saisie.",
            'S-1695 : 397 308,56 + 806 850,00 = 1 204 158,56 contre '
            '1 204 158,59 publié, soit 0,03 $ sur ~300 lignes.',
            'inféré',
        ),
    )
}


def hypotheses(*codes: str) -> tuple[Hypothese, ...]:
    """Résout des codes en hypothèses, en criant si l'un n'existe pas."""
    manquants = [c for c in codes if c not in HYPOTHESES]
    if manquants:
        connus = ', '.join(sorted(HYPOTHESES))
        raise KeyError(f'Hypothèse inconnue : {manquants}. Connues : {connus}.')
    return tuple(HYPOTHESES[c] for c in codes)


# --------------------------------------------------------------------------
# Vocabulaire
# --------------------------------------------------------------------------


class Axe(str, Enum):
    """Les trois axes du rapport. Ne jamais additionner deux axes différents."""

    COUTANT = 'coutant'
    VENDANT = 'vendant'
    HEURES = 'heures'


class UniteMO(str, Enum):
    """Base d'un temps ou d'un prix unitaire.

    En estimation électrique, fil, câble et conduit se cotent « par C » (100)
    ou « par M » (1000) : un #12 THHN à 43,72 $/C vaut 0,4372 $/pi et se pose
    à ~3,5 h/M. Traiter ces valeurs comme des « par unité » se trompe d'un
    facteur 100 à 1000 sur la moitié des heures d'une job.
    """

    U = 'U'
    C = 'C'
    M = 'M'

    @property
    def diviseur(self) -> Decimal:
        return {'U': UN, 'C': Decimal(100), 'M': Decimal(1000)}[self.value]


class SeauACCEO(str, Enum):
    """Les trois lignes du sommaire de soumission."""

    MATERIEL = 'materiel'
    SERVICE = 'service'
    AUTRES_FRAIS = 'autres_frais'

    @property
    def libelle(self) -> str:
        return {
            'materiel': 'Matériel',
            'service': 'Service',
            'autres_frais': 'Autres frais',
        }[self.value]


class NatureCout(str, Enum):
    """Nature fine d'une ligne, plus détaillée que le sommaire ACCEO.

    ACCEO n'imprime que trois seaux. Distinguer la sous-traitance du
    cautionnement à la saisie ne change pas le sommaire, mais permet de
    répondre à « combien de sous-traitance dans cette job ? » sans relire les
    300 lignes — et la vérification ULC-S537 d'un système d'alarme incendie
    est toujours sous-traitée, donc la question se pose sur cette soumission.
    """

    MATERIEL = 'materiel'
    MAIN_OEUVRE = 'main_oeuvre'
    SOUS_TRAITANCE = 'sous_traitance'
    EQUIPEMENT = 'equipement'
    CAUTIONNEMENT = 'cautionnement'
    DIVERS = 'divers'

    @property
    def seau(self) -> SeauACCEO:
        if self is NatureCout.MATERIEL:
            return SeauACCEO.MATERIEL
        if self is NatureCout.MAIN_OEUVRE:
            return SeauACCEO.SERVICE
        return SeauACCEO.AUTRES_FRAIS


class OriginePrix(str, Enum):
    COTATION = 'cotation'  # prix ferme d'un distributeur
    LISTE = 'liste'  # prix de liste × multiplicateur
    HISTORIQUE = 'historique'  # relevé d'une job passée
    ESTIME = 'estime'  # jugement de l'estimateur


# Unités de mesure qui se comptent en vrac : sur ces lignes, laisser
# `unite_mo` implicite est l'erreur à 1000×. Le modèle exige alors le choix.
UM_EN_VRAC = frozenset({'pi', 'pi.', 'ft', 'pied', 'pieds', 'm', 'mtr', 'verge'})

# Systèmes observés sur la liste manuscrite de Daniel, page 1 de S-1695.
SYSTEMES_OBSERVES = (
    'ECLAIRAGE',
    'DISTRIBUTION',
    'CONTROL ECLAIRAGE',
    'CHAUFFAGE',
    'ALARME INCENDIE',
    'TEL/DATA',
    'SECURITE/CAMERA',
    'TEMPORAIRE',
)


# --------------------------------------------------------------------------
# Conversion d'entrée
# --------------------------------------------------------------------------


def _en_decimal(valeur: object) -> Decimal:
    """Accepte str fr-CA, int, float et Decimal ; refuse le reste.

    Les avertissements de conversion sont perdus ici volontairement : la
    couche outils appelle `vers_decimal` elle-même pour les remonter à
    l'appelant. Un modèle qui refuse un `float` ferait réémettre un lot de
    200 lignes pour une valeur exacte.
    """
    if isinstance(valeur, Decimal):
        return valeur
    converti, _ = vers_decimal(valeur)
    return converti


Nombre = Annotated[Decimal, BeforeValidator(_en_decimal)]


class _Base(BaseModel):
    model_config = ConfigDict(frozen=True, extra='forbid')


# --------------------------------------------------------------------------
# Entités
# --------------------------------------------------------------------------


class SourcePrix(_Base):
    """D'où vient un prix, et jusqu'à quand il tient.

    Un prix sans date pourrit en silence : le cuivre bouge, la cotation
    expire, et personne ne sait plus si le 0,4372 $/pi date d'hier ou de 2023.
    """

    origine: OriginePrix
    reference: str = ''
    date_validite: date | None = None
    multiplicateur: Nombre = UN

    def perimee_le(self, jour: date) -> bool:
        return self.date_validite is not None and jour > self.date_validite


class Ligne(_Base):
    """Une ligne d'item du relevé.

    Reproduit les colonnes imprimées `Description | Quantité | UM |
    Vendant unit. | Vendant | Temps unit. | Temps total`, plus ce que le
    sommaire ne montre pas mais que le calcul exige : la base des unités, la
    perte, la nature du coût et la provenance du prix.
    """

    description: str = Field(min_length=1)
    quantite: Nombre = ZERO
    um: str = 'U'

    prix_unitaire: Nombre = ZERO
    unite_prix: UniteMO = UniteMO.U
    axe_prix: Axe = Axe.COUTANT

    temps_unitaire: Nombre = ZERO
    unite_mo: UniteMO | None = None

    facteur_perte: Nombre = ZERO
    nature: NatureCout = NatureCout.MATERIEL
    source_prix: SourcePrix | None = None

    @property
    def base_mo(self) -> UniteMO:
        """Base effective du temps unitaire, `U` quand rien n'est déclaré."""
        return self.unite_mo or UniteMO.U

    @model_validator(mode='after')
    def _verifier(self) -> Ligne:
        if self.axe_prix is Axe.HEURES:
            raise ErreurValeur(
                f'{self.description} : un prix unitaire est du coûtant ou du '
                'vendant, jamais des heures.'
            )
        if self.quantite < 0:
            raise ErreurValeur(f'{self.description} : quantité négative.')
        # Les dollars de main-d'oeuvre naissent des heures × taux, au sommaire.
        # Une ligne qui porterait les deux serait comptée deux fois sans que
        # rien ne le montre.
        if self.nature is NatureCout.MAIN_OEUVRE and self.prix_unitaire != ZERO:
            raise ErreurValeur(
                f'{self.description} : ligne de main-d’oeuvre avec un prix '
                'unitaire. Les dollars de main-d’oeuvre viennent des heures × '
                'taux au sommaire ; un montant forfaitaire acheté est de la '
                'sous-traitance (nature = sous_traitance).'
            )
        if self.facteur_perte < 0 or self.facteur_perte >= UN:
            raise ErreurValeur(
                f'{self.description} : facteur de perte {self.facteur_perte} hors '
                "de [0, 1[. Une perte s'écrit en fraction — 0,05 pour 5 %."
            )
        # Le garde qui vaut son poids : sur une ligne au pied, un temps
        # unitaire pris pour du « par unité » se trompe d'un facteur 100 à 1000.
        if (
            self.temps_unitaire != ZERO
            and self.unite_mo is None
            and self.um.strip().lower() in UM_EN_VRAC
        ):
            raise ErreurValeur(
                f'{self.description} : unité de mesure « {self.um} » avec un temps '
                f'unitaire de {self.temps_unitaire} mais aucune base déclarée. '
                "Préciser unite_mo = 'U', 'C' ou 'M' — un temps au C pris pour "
                'un temps à l’unité multiplie les heures par 100.'
            )
        return self


class Chapitre(_Base):
    """Un chapitre du sommaire, avec ses deux facteurs imprimés.

    `bloc` est une étiquette de zone purement descriptive : le rapport porte
    le multiplicateur sur la ligne du chapitre, pas sur une entité « bloc »
    visible. On réplique ce qui est imprimé et on garde l'étiquette pour
    regrouper les chapitres d'un même étage type dans les rapports.
    """

    code: str = Field(min_length=1)
    nom: str = ''
    bloc: str = ''
    facteur_md: Nombre = UN
    mult_bloc: Nombre = UN
    lignes: tuple[Ligne, ...] = ()

    @model_validator(mode='after')
    def _verifier(self) -> Chapitre:
        if self.facteur_md <= ZERO:
            raise ErreurValeur(
                f'{self.code} : facteur de m-d {self.facteur_md} ; ACCEO écrit '
                '1,00 quand il n’y a pas de correction, jamais 0.'
            )
        if self.mult_bloc <= ZERO:
            raise ErreurValeur(
                f'{self.code} : Mult Bloc {self.mult_bloc} ; un multiplicateur de '
                'répétition vaut au moins 1.'
            )
        return self


class TauxHoraire(_Base):
    """Le taux de main-d'oeuvre, décomposé — jamais un scalaire nu.

    Un composite chargé au Québec tourne autour de 70-80 $/h. Un taux de
    99,00 $ rond n'est pas un coût chargé : un coût chargé ne tombe jamais
    juste. La marge est donc DANS le taux, et l'y laisser implicite fait
    ensuite appliquer un profit par-dessus un profit.

    `cout_horaire` n'a pas de valeur par défaut. Pour l'omettre il faut passer
    par `suppose_sans_marge`, qui l'écrit noir sur blanc dans la sortie.
    """

    taux: Nombre
    cout_horaire: Nombre
    regime: str = ''
    provenance: str = Field(min_length=1)
    marge_supposee: bool = False

    @property
    def marge_incluse(self) -> Decimal:
        """Fraction du taux qui est de la marge. 0 si le taux est du coûtant."""
        if self.cout_horaire == ZERO:
            return ZERO
        return self.taux / self.cout_horaire - UN

    @classmethod
    def suppose_sans_marge(cls, taux: object, provenance: str) -> TauxHoraire:
        """Traite un taux publié comme du coûtant pur, en le déclarant.

        À n'utiliser que quand la décomposition est réellement inconnue. Le
        drapeau `marge_supposee` remonte jusque dans le rapport.
        """
        valeur = _en_decimal(taux)
        return cls(
            taux=valeur,
            cout_horaire=valeur,
            provenance=provenance,
            marge_supposee=True,
        )

    @model_validator(mode='after')
    def _verifier(self) -> TauxHoraire:
        if self.taux <= ZERO:
            raise ErreurValeur('Taux horaire nul ou négatif.')
        if self.cout_horaire <= ZERO:
            raise ErreurValeur('Coût horaire nul ou négatif.')
        if self.taux < self.cout_horaire:
            raise ErreurValeur(
                f'Taux {self.taux} inférieur au coût horaire {self.cout_horaire} : '
                'chaque heure vendue perdrait de l’argent. Corriger l’un des deux.'
            )
        return self


class Marges(_Base):
    """Administration et profit d'un seau, en fractions.

    Composées, pas additionnées : vendant = coûtant × (1+admin) × (1+profit).
    C'est l'ordre qu'applique une feuille de soumission, et il ne donne pas le
    même nombre que la somme des deux pourcentages.
    """

    administration: Nombre = ZERO
    profit: Nombre = ZERO

    @model_validator(mode='after')
    def _verifier(self) -> Marges:
        for nom, valeur in (
            ('administration', self.administration),
            ('profit', self.profit),
        ):
            if valeur < ZERO or valeur >= UN:
                raise ErreurValeur(
                    f'{nom} = {valeur} hors de [0, 1[. Une marge s’écrit en '
                    'fraction — 0,10 pour 10 %.'
                )
        return self

    @property
    def facteur(self) -> Decimal:
        return (UN + self.administration) * (UN + self.profit)


MARGES_NULLES = Marges()


class ConfigCalcul(_Base):
    """Tout ce qui n'est pas dans les lignes mais entre dans le grand total.

    Persistée avec la soumission : quand le modèle évoluera, une vieille
    soumission doit continuer à donner le même chiffre qu'au jour du dépôt.
    """

    taux_horaire: TauxHoraire
    marges: dict[SeauACCEO, Marges] = Field(default_factory=dict)

    heures_chargees: Nombre | None = None
    provenance_heures_chargees: str = ''

    ajustement_global: Nombre = ZERO
    provenance_ajustement: str = ''

    taxes_applicables: bool = False
    taux_tps: Nombre = Decimal('0.05')
    taux_tvq: Nombre = Decimal('0.09975')

    def marges_de(self, seau: SeauACCEO) -> Marges:
        return self.marges.get(seau, MARGES_NULLES)

    @model_validator(mode='after')
    def _verifier(self) -> ConfigCalcul:
        # Les heures chargées sont une DÉCISION d'estimateur, pas une valeur
        # dérivée : 8150 h est 8106,286 arrondi au 50 h supérieur, ou un
        # rétro-calcul depuis un prix cible. Les deux se défendent, aucun ne
        # se devine — d'où la provenance obligatoire.
        if self.heures_chargees is not None:
            if self.heures_chargees <= ZERO:
                raise ErreurValeur('Heures chargées nulles ou négatives.')
            if not self.provenance_heures_chargees.strip():
                raise ErreurValeur(
                    'Heures chargées imposées sans provenance. Écrire d’où vient '
                    'le chiffre (ex. « arrondi au 50 h supérieur », « rétro-calcul '
                    'depuis un prix cible de 1,2 M$ »).'
                )
        if self.ajustement_global != ZERO and not self.provenance_ajustement.strip():
            raise ErreurValeur(
                'Ajustement global sans provenance. Ce champ existe dans ACCEO '
                'pour une décision assumée, pas pour absorber un écart de calcul.'
            )
        return self


class Soumission(_Base):
    """Une soumission complète, prête à calculer."""

    numero: str = Field(min_length=1)
    nom: str = ''
    config: ConfigCalcul
    chapitres: tuple[Chapitre, ...] = ()

    @model_validator(mode='after')
    def _verifier(self) -> Soumission:
        codes = [c.code for c in self.chapitres]
        doublons = sorted({c for c in codes if codes.count(c) > 1})
        if doublons:
            raise ErreurValeur(
                f'{self.numero} : codes de chapitre en double : {doublons}. '
                'Deux chapitres du même code se confondraient au sommaire.'
            )
        return self
