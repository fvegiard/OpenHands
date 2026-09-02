# Refactor Supabase — plan sans big-bang

## État vérifié au 1er septembre 2026

Le projet de production est sain et accessible, mais il ne possède ni preview branch ni Edge Function. Aucun changement de données ou de schéma n'a été effectué pendant cet audit.

Constats matériels :

- `bus` et `estimation` accordent des privilèges larges à `authenticated` sans RLS et sans `organization_id` : on ne peut pas sécuriser correctement ces tables par tenant sans d'abord définir leur propriété.
- Les corpus vecteurs utilisent plusieurs dimensions : 1024 et 1536. Les fusionner dans une seule colonne indexée casserait la compatibilité des requêtes.
- La recherche plein texte est partagée entre une configuration anglaise et une configuration française.
- Les données de connaissance sont dispersées entre `knowledge.entries`, `mavis.items`, `memory_documents`, `memory_chunks`, `lena_knowledge_publications` et `estimation.segment`.
- La fonction `mavis.set_updated_at()` doit fixer son `search_path`; plusieurs clés étrangères doivent être indexées.
- Les tables de gouvernance existantes constituent une bonne base pour runs, agents, événements, checkpoints, preuves et contrats de tâche.

## Modèle cible

Le schéma privé `lena` proposé complète les tables existantes sans les supprimer :

- événement vérifié et dédupliqué;
- source canonique et versions immuables;
- document et chunks avec provenance;
- profils d'embedding explicites par fournisseur, modèle et dimension;
- embeddings séparés des chunks;
- claims, preuves favorables/contradictoires et supersession;
- mémoire candidate/validée/rejetée avec échéance de revue;
- approbations liées à un hash d'action;
- reçus d'exécution incluant modèle demandé/réel, tests et artefacts.

Le RPC `public.ingest_lena_event(jsonb)` est serveur seulement, `SECURITY DEFINER`, avec `search_path` limité à `pg_catalog`, validation des champs et idempotence `(organization_id, idempotency_key)`.

## Phases

### 0 — Geler et mesurer

- Export logique et inventaire des lignes, politiques, grants, fonctions, indexes et dimensions.
- Baseline des requêtes, latence, taux de rappel, coût et erreurs.
- Aucun changement de production.

### 1 — Fondation additive sur preview branch

- Appliquer `202609010001_lena_control_plane_foundation.sql` dans une preview branch.
- Tester allow/deny avec `anon`, `authenticated` et `service_role`.
- Tester idempotence, timestamps, contraintes, rollback et création de 12 tables.

### 2 — Durcissement compatible

- Appliquer `202609010002_existing_schema_hardening.sql` sur la preview branch.
- Vérifier les plans d'exécution et l'absence de régression d'écriture.
- Ne pas activer RLS sur `bus`/`estimation` avant d'ajouter une propriété d'organisation et un plan de backfill.

### 3 — Adaptateurs et double écriture

- Chaque source conserve le RAW et son hash, puis écrit une représentation canonique séparée.
- Mapper les anciens stores vers `lena.sources`, `source_versions`, `documents` et `chunks`.
- Déclarer un `embedding_profile` distinct pour chaque dimension; aucun cast ou remplissage artificiel.
- Double écrire pendant une période mesurée; l'ancien chemin demeure source de repli.

### 4 — Backfill et validation

- Backfill par lots idempotents, journalisés et reprenables.
- Comparer nombre de documents/chunks, hashes, liens de preuve et échantillons métier.
- Mesurer lexical recall, vector recall, précision du reranker, fraîcheur et détection de contradictions.
- Rejeter toute mémoire qui n'est pas reliée à une preuve ou à un résultat métier validé.

### 5 — Bascule progressive

- Lecture parallèle ancien/nouveau, puis shadow traffic.
- Basculer un workflow à la fois : veille IA, code/GitHub, estimation, dossiers projet.
- Revenir à l'ancien chemin automatiquement si les seuils chutent.

### 6 — Retrait contrôlé

- Retirer un store seulement après zéro dépendance observée, sauvegarde, période de stabilité et approbation explicite de Francis.
- Toute suppression, renommage ou purge est un changement N3 distinct.

## Tests bloquants avant production

- Isolation stricte entre organisations.
- Clé Supabase serveur impossible à obtenir dans le frontend.
- Duplicata webhook sans second effet externe.
- Échec réseau repris puis placé en DLQ après la limite.
- Requête hybride filtrée par organisation/projet/source/révision/temps.
- Claim contradictoire visible, pas écrasé.
- Modèle et dimension d'embedding vérifiés avant distance vectorielle.
- Rollback testé sur une copie isolée.

## Risque principal

Le risque n'est pas de manquer une nouvelle table; c'est d'effectuer une migration globale avant d'avoir défini l'identité des organisations, la provenance et les contrats de compatibilité. La stratégie retenue privilégie le double chemin, les preuves et la réversibilité.
