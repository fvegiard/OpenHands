# Carte du code — OpenHands Agent Canvas et Léna

## Verdict architectural

Le dépôt `fvegiard/OpenHands` est une copie d'**Agent Canvas**, pas le monolithe historique OpenHands. Son rôle est de sélectionner un backend, gérer les profils, démarrer des conversations, afficher les événements et administrer les automatisations déjà exposées par le backend.

## Surfaces pertinentes

| Surface | Responsabilité | Usage Léna |
|---|---|---|
| `src/api/backend-registry/` | Backends local/cloud et sélection active. | Choisir le runtime réel sans figer un host. |
| `src/api/agent-profiles-service/` | CRUD/activation des profils via le client officiel. | Profil de lancement Léna, sans secrets embarqués. |
| `src/api/automation-service/` | Automatisations cron/événement et exécutions. | Déclencher une conversation quand le backend le supporte. |
| `src/api/agent-server-adapter.ts` | Construit le contexte et relaie `runtime_services`. | Découvrir les URL accessibles depuis le sandbox. |
| `.agents/skills/` | Instructions progressives locales au dépôt. | Charger la procédure Léna uniquement sur déclencheur. |
| `agents/lena-ia/` | Persona, workflow et registre de capacités. | Définir le rôle et les contrats de résultat. |
| `integrations/lena-ai/` | Infrastructure spécifique, indépendante de l'UI. | Worker, Queue, Supabase, RAG et Tailscale. |

## Invariants de refactor

- Aucun `fetch`/`axios` direct vers un nouvel endpoint Agent Server dans `src/`.
- Aucun secret dans un profil d'agent ou un fichier de configuration versionné.
- Aucun couplage de l'UI à un fournisseur Cloudflare/Supabase propre à Francis.
- Le frontend peut consommer un contrat officiel; il ne remplace pas le backend.
- Le runtime réel et ses URLs viennent de `server_info.runtime_services`, pas d'un port supposé.
- Chaque mission de code s'exécute sur une branche/worktree isolé avec tests et reçu.

## Ce qui doit rester hors de cette branche

- Modification du moteur OpenHands Agent Server.
- Nouveau tool Python/OpenHands.
- Changement du client TypeScript généré.
- Déploiement Cloudflare ou migration Supabase production.
- Activation de Tailscale Serve/Funnel sur une machine non observée.

Ces travaux deviennent des incréments séparés dans les dépôts ou environnements qui en sont propriétaires.
