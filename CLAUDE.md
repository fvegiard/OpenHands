# Claude — règles du dépôt

## Definition of done
Une tâche n'est PAS terminée tant que :
1. un smoke réel a importé/appelé le code modifié — sortie + exit code collés dans la réponse
2. `make -C mcp-servers verifier` est passé (exit 0) — même porte que le CI, jamais ruff seul
3. les tests du nouveau comportement existent, dans le même commit
4. le diff est minimal et borné à la tâche — jamais `git add .`

## Interdits
- Pousser après ruff/format seul (f7ec47848 : pyproject-fmt a cassé un push « vert ruff »)
- Déclarer « works / done / ready » sans sortie d'exécution (c27f506b0 : `with CTX as ctx:` passait ruff et levait TypeError à chaque appel)
- Nouveau module Python sans tests dans le même commit
- Deviner un flag CLI ou une API de bibliothèque — introspecter l'artefact installé (`binaire --help`, `python3 -c "import pkg; print(dir(pkg))"`) ; si doc et binaire divergent, le binaire gagne (ffaf0c4ae : `get_tools()` n'existe pas, c'est `list_tools()`)
- Ajouter un champ pour absorber une donnée qui contredit le modèle (S-1695 : 0,03 $ = résidu d'arrondi ACCEO attendu, pas un ajustement)
- `git add .`

## Avant chaque push
```bash
./scripts/verify.sh        # = make -C mcp-servers verifier, fail-fast
```
`make install-pre-commit-hooks` une fois par clone (AGENTS.md l'exige — l'oublier = CI rouge).

## Smoke minimal
```bash
python3 -c "from decimal import Decimal; from gobby_estimation.decimales import q_prix_unitaire; print(q_prix_unitaire(Decimal('0.4567')))"
```

## Argent / domaine
Avant toute arithmétique : hypothèses explicites, un exemple numérique qui casserait le
modèle, et la question « qu'est-ce qui perd de l'argent en silence si je me trompe ? »
(leçon +165 $ : échelle 2 décimales appliquée à un prix unitaire à 4 décimales).
Règles d'estimation (décimales, arrondis ACCEO) : `mcp-servers/CLAUDE.md`.
