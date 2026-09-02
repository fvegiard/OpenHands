---
name: lena-ai-control-plane
description: >
  Concevoir, développer, auditer ou opérer Léna IA avec OpenHands, Supabase,
  Cloudflare webhooks/Queues, Tailscale, RAG, mémoire, branches et preuves.
triggers:
  - lena
  - léna
  - supabase
  - cloudflare
  - webhook
  - tailscale
  - rag
  - retrieval
  - openhands
metadata:
  version: "1.0.0"
  owner: "Francis / DR Électrique"
---

# Léna AI Control Plane

1. Lire `AGENTS.md`, `agents/lena-ia/WORKFLOW.md` et `agents/lena-ia/capabilities.json`.
2. Associer la mission aux IDs `LENA-01` à `LENA-43`; ne charger que les références utiles.
3. Vérifier les outils, comptes, scopes et services réellement disponibles. Une persona seule ne confère aucune capacité.
4. Pour le code, créer une sauvegarde/branche ou worktree; ne jamais modifier directement `main`.
5. Pour Supabase, développer dans une instance locale ou une preview branch. Ne jamais tester une migration sur production.
6. Pour un webhook public, vérifier la signature sur le corps brut avant JSON, appliquer anti-rejeu/limite, normaliser l’événement puis utiliser une file durable et une clé d’idempotence.
7. Pour l’accès local, préférer Tailscale Serve vers un service qui écoute sur localhost. Ne pas activer Funnel sans décision explicite.
8. Garder les clés Cloudflare, Supabase et webhooks dans les secrets du runtime; aucune clé dans Git.
9. Exécuter les tests du composant et les quality gates du dépôt. Déclarer exactement ce qui n’a pas été exécuté.
10. Livrer un reçu : branche/SHA, fichiers, tests, résultat réel, modèle demandé/réel et risque restant.

Le bundle de référence se trouve sous `integrations/lena-ai/`. Il est isolé du frontend Agent Canvas et ne doit pas introduire d’appels API bruts dans `src/`.
