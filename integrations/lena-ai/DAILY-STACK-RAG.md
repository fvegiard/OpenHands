# Veille IA quotidienne — ingestion et RAG

## Source comprise

La veille demandée surveille notamment GitHub/Copilot, OpenAI/ChatGPT/Codex, Alibaba/Qwen, OpenHands, Hyper-V, Docker, runtimes locaux et la fabrique de connaissance sémantique. Son objectif est de mesurer le travail humain réellement remplacé, pas le volume de nouvelles ou de tokens.

## Pipeline canonique

```text
rapport brut + sources primaires + logs de l'expérience
→ source hash et fenêtre observée
→ déduplication release/tag/commit/document
→ extraction entités, versions, statuts et claims
→ preuves au niveau du claim
→ contradictions, staleness et supersession
→ chunks lexical + embeddings par profil
→ retrieval hybride filtré
→ réponse sourcée
→ résultat métier / correction humaine
→ promotion ou rejet de mémoire
```

## Métadonnées minimales

- `organization_id`, `project_id`, `source_id`, `source_version_id`;
- produit, composant, fournisseur, modèle et version exacte;
- `observed_at`, `valid_from`, `valid_to`, `review_due_at`;
- URL/référence primaire, hash du contenu et statut release/preview/expérimental;
- accès, confidentialité, auteur, runner et modèle demandé/réel;
- relation `supersedes`, contradiction et confiance.

## Retrieval

1. Filtrer d'abord par organisation, portée, produit, temps et statut.
2. Exécuter la recherche lexicale et vectorielle dans le profil d'embedding compatible.
3. Fusionner les rangs, puis reranker seulement un petit ensemble.
4. Remonter les claims avec preuves, contradictions et date d'observation.
5. Ne pas injecter un rapport complet lorsqu'un delta ou cinq passages suffisent.

## Scorecard quotidienne

- Semantic Coverage Score.
- Knowledge Freshness Score.
- Retrieval Hit Rate.
- Contradiction Detection Rate.
- Context Efficiency.
- Memory Precision.
- Unattended Completion, Recovery, Idempotency et coût par résultat accepté.

## Expérience de bout en bout

Chaque journée doit tenter un flux mesurable : événement GitHub → OpenHands → worktree/sandbox → modification → tests/CI → artefact/reçu → ingestion de l'issue, du diff, des tests et de la décision dans Supabase. Un apprentissage n'entre en mémoire durable que si le résultat a passé les contrôles définis.
