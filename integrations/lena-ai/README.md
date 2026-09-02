# Léna AI control plane

## Statut

Ce répertoire est une **implémentation isolée et testée localement**, préparée pour la branche `feat/lena-ai-control-plane`. Il n'est pas déployé. Les migrations Supabase restent des propositions; aucun schéma ni donnée de production n'a été modifié.

## Ce qu'une persona LLM peut réellement faire

Une persona définit le rôle, le style, les priorités et les règles de décision. Elle ne crée ni accès, ni mémoire, ni autonomie par elle-même.

| Couche | Fonction réelle |
|---|---|
| Persona | Oriente le raisonnement et le comportement. |
| Skill | Charge une procédure ciblée au bon moment. |
| Outil/connecteur | Exécute une action réelle. |
| Identité + permissions | Détermine ce que l'agent est autorisé à lire ou modifier. |
| État durable | Conserve événements, décisions, mémoire et progression. |
| Trigger + file | Lance et reprend le travail sans perdre les événements. |
| Tests + reçu | Prouve le résultat, le modèle réellement utilisé et le rollback. |

Léna devient donc exécutable seulement lorsque ces couches existent ensemble. Le registre normalisé est dans `agents/lena-ia/capabilities.json`.

## Frontière du dépôt OpenHands

Ce dépôt est **Agent Canvas**, le frontend et centre de contrôle OpenHands. Il ne doit pas recevoir de nouveaux endpoints backend ni d'appels bruts vers l'Agent Server dans `src/`.

- UI et adaptation d'API existante : `src/` dans ce dépôt.
- Agent Server, outils et comportement backend : dépôt `OpenHands/software-agent-sdk`.
- Client TypeScript d'un endpoint Agent Server : dépôt `OpenHands/typescript-client`.
- Skills et automatisations publiques : dépôt `OpenHands/extensions`.
- Infrastructure propre à Francis/Léna : `integrations/lena-ai/`, isolée du frontend.

## Architecture retenue

```text
GitHub / Tailscale / autres sources
              │ webhooks signés
              ▼
Cloudflare Worker ── validation avant JSON, anti-rejeu, taille maximale
       │ petit payload             │ gros payload vérifié
       │                           └── R2 par hash, puis référence compacte
       ▼
Cloudflare Queue ── retries bornés + dead-letter queue
              │ enveloppe canonique + idempotency_key
              ▼
Supabase RPC serveur ── stockage durable, provenance, RAG, mémoire, reçus
              │
              ▼
Dispatcher privé OpenHands sur le Legion
              │ Agent Server / Automation URL observée au runtime
              ▼
Branche ou worktree ── tests ── revue ── PR ── reçu d'exécution
              │
              └── accès privé par Tailscale Serve, jamais Funnel par défaut
```

Le premier segment, de la validation du webhook jusqu'à l'ingestion Supabase, est codé. Le dispatcher OpenHands est spécifié mais n'est pas activé tant que le runtime Legion n'est pas en ligne et que son `/server_info.runtime_services` réel n'a pas été observé.

## Contenu livré

- `cloudflare/src/index.mjs` : endpoints GitHub/Tailscale, HMAC, anti-rejeu, normalisation, débordement R2, Queue et consommateur Supabase.
- `cloudflare/test/index.test.mjs` : tests heureux, négatifs, déduplication et reprise.
- `cloudflare/wrangler.jsonc.example` : bindings Queue/DLQ sans secret.
- `contracts/event-envelope.schema.json` : contrat canonique versionné.
- `supabase/proposals/` : fondation additive et durcissement, à tester sur preview branch.
- `SUPABASE-REFACTOR.md` : migration progressive sans big-bang.
- `OPENHANDS-TAILSCALE.md` : contrat du dispatcher et accès privé.
- `DAILY-STACK-RAG.md` : ingestion et retrieval de la veille IA quotidienne.
- `.agents/skills/lena-ai-control-plane/SKILL.md` : skill OpenHands à divulgation progressive.

## Validation locale

Depuis la racine du dépôt :

```bash
node --check integrations/lena-ai/cloudflare/src/index.mjs
node --test integrations/lena-ai/cloudflare/test/index.test.mjs
node --test integrations/lena-ai/test/contracts.test.mjs
```

Le workflow `.github/workflows/lena-ai-control-plane.yml` exécute les mêmes contrôles sans dépendance supplémentaire.

## Déploiement contrôlé

1. Créer une preview branch Supabase et appliquer les propositions copiées dans les migrations de cette branche seulement.
2. Exécuter les tests SQL allow/deny, idempotence, rollback et charge; comparer les comptages avant/après.
3. Créer Worker, Queue et DLQ Cloudflare; injecter les secrets par le gestionnaire de secrets, jamais dans Git.
4. Configurer les webhooks GitHub/Tailscale vers le Worker et vérifier une livraison réelle.
5. Sur le Legion, observer les services OpenHands réels, activer le dispatcher privé et Tailscale Serve.
6. Promouvoir progressivement les lectures RAG; ne retirer aucun ancien chemin avant validation et approbation explicite.

## Variables et secrets

Variables non secrètes : `LENA_ORGANIZATION_ID`, `SUPABASE_INGEST_URL`, `MAX_BODY_BYTES`, `MAX_QUEUE_MESSAGE_BYTES`, `WEBHOOK_MAX_SKEW_SECONDS`. Le bucket R2 `LENA_WEBHOOK_RAW` conserve les corps vérifiés trop gros pour la limite d'un message Queue; une politique de rétention doit être définie avant production.

Secrets runtime : `GITHUB_WEBHOOK_SECRET`, `TAILSCALE_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY`, clé de session OpenHands. Aucun secret ne doit entrer dans le navigateur, un log, une capture, une PR ou ce dépôt public.
