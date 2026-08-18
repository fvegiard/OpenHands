# mcp-servers/ — règles de travail

Sous-projets autonomes, hors du périmètre d'OpenHands. Chacun a son
`pyproject.toml`, son `rootdir` pytest, et n'est pas collecté par le `pytest`
de la racine (`norecursedirs` dans `/pytest.ini`).

## Avant de pousser, toujours

```bash
make -C mcp-servers verifier
```

Lance exactement ce que lance la CI : ruff format, ruff check, pyproject-fmt,
mypy, pytest. Dans cet ordre, du moins cher au plus cher.

**Ne jamais pousser après avoir lancé seulement `ruff`.** La CI lance tout le
pre-commit, dont `pyproject-fmt`, qui réécrit les `pyproject.toml` des
sous-projets. C'est une CI rouge déjà vécue.

## Règles apprises en produisant des bugs

**Exécuter avant d'affirmer.** Un module a été livré avec une PR affirmant
qu'il fonctionnait alors que ses cinq fonctions levaient `TypeError` à chaque
appel. Ruff passait. Le code se lisait bien. Rien ne l'avait exécuté.

**Vérifier l'artefact, pas la description.** La documentation décrit
l'intention, le binaire décrit la réalité. Un livrable entier a été conçu sur
un type de hook absent de la version installée. Pour une dépendance :
`grep` dans le lockfile. Pour un comportement : l'exécuter.

**Une anomalie falsifie le modèle.** Un écart de 0,03 $ a d'abord reçu un champ
pour l'absorber. C'était la preuve que la politique d'arrondi était fausse. Ne
pas router autour d'une donnée qui contredit — la donnée gagne.

**Un test rouge peut accuser le test.** Deux attentes écrites à tort ; la
seconde a révélé du code mort. Lire le message avant de corriger le code.

## Discipline Decimal (gobby-estimation)

Jamais de `float` dans un calcul monétaire. Les échelles sont **distinctes par
nature de valeur** — c'est le point le plus coûteux à se tromper :

| Nature | Décimales | Pourquoi |
|---|---|---|
| Prix unitaire | 5 | Les prix électriques viennent en $/C ou $/M |
| Quantité, heures | 3 | ACCEO imprime 3 décimales |
| **Argent (totaux seulement)** | 2 | |

Appliquer l'échelle « argent » à un prix unitaire coûte 165 $ sur une ligne de
50 000 pi à 0,4567 $/pi. Deux relecteurs indépendants ont trouvé ce défaut.

## Modèle ACCEO (gobby-estimation)

Ce qui vient du papier et ce qui est déduit sont séparés dans
`gobby_estimation/modeles.py::HYPOTHESES`, chaque entrée portant sa confiance
(`observé` / `inféré`) et son fondement. Toute sortie de calcul les recopie.
**Ne jamais promouvoir une hypothèse `inféré` en `observé` sans une nouvelle
page de rapport ACCEO en main.**

Trois règles de calcul qu'on ne devine pas deux fois :

* le **facteur de m-d** multiplie les HEURES, jamais les dollars de matériel ;
* le **Mult Bloc** est une répétition physique : il multiplie les trois axes ;
* la **perte** gonfle la quantité achetée, pas les heures posées.

Deux choses que le modèle refuse de deviner, et c'est voulu : `cout_horaire`
n'a pas de défaut (sinon une marge nulle s'installe en silence dans un taux
qui en contient), et `heures_chargees` exige une provenance (8150 h n'est pas
un écart, c'est une décision).

Le fichier `S-1695_reconstruction.txt` est versionné et vérifié par un test :
c'est la page qu'on met à côté du scan de Daniel. Le régénérer avec
`python3 -m gobby_estimation.s1695 > S-1695_reconstruction.txt`.

## Style

Aligné sur la racine : guillemets **simples** pour le code, **doubles** pour
les docstrings. Vocabulaire du domaine en français — les utilisateurs sont des
estimateurs francophones et la sortie doit être comparable à leurs rapports.
