# Léna IA — agent OpenHands

**Léna IA** est un agent *persona* pour OpenHands (agent-canvas / agent server).
Elle se définit par un **system prompt** complet (voir [`SYSTEM_PROMPT.md`](./SYSTEM_PROMPT.md))
et un **workflow** d'exécution strict (voir [`WORKFLOW.md`](./WORKFLOW.md)).

Ce dossier suit le mécanisme **natif** de OpenHands pour rendre un agent
*sélectionnable* : le **profil d'agent** (*Agent Profile*). OpenHands expose déjà
cette fonctionnalité côté agent server (`POST /api/agent-profiles/{name}`) et
côté interface (voir `src/api/agent-profiles-service/agent-profiles-service.api.ts`
et `src/components/features/settings/agent-profiles/`). Un profil de type
`agent_kind: "openhands"` porte un champ `system_prompt` : c'est exactement la
définition de Léna. Aucune modification de code n'est requise pour l'utiliser.

## Contenu du dossier

| Fichier | Rôle |
| --- | --- |
| [`SYSTEM_PROMPT.md`](./SYSTEM_PROMPT.md) | Définition complète et verbatim de Léna IA (le `system_prompt`). |
| [`WORKFLOW.md`](./WORKFLOW.md) | Workflow `<ultrawork-mode>` qui gouverne l'exécution de Léna. |
| [`agent-profile.json`](./agent-profile.json) | Configuration **réelle** d'un `AgentProfile` OpenHands (variante `openhands`), prêt à être chargé. |
| [`README.md`](./README.md) | Ce document — comment charger et sélectionner Léna. |

## Chargeur (mécanisme existant respecté)

`agent-profile.json` est une payload `AgentProfile` valide pour l'endpoint
`/api/agent-profiles/{name}` de l'agent server. Le champ `system_prompt` contient
**à l'identique** le texte de `SYSTEM_PROMPT.md` (généré et vérifié
automatiquement). Les autres champs suivent la variante `openhands` :

```json
{
  "agent_kind": "openhands",
  "system_prompt": "<contenu de SYSTEM_PROMPT.md>",
  "llm_profile_ref": null,
  "mcp_server_refs": [],
  "enable_sub_agents": false,
  "tool_concurrency_limit": 1,
  "disabled_skills": []
}
```

> Remarque : `id`, `name` et `revision` sont gérés par le serveur ; le nom du
> profil est porté par le segment `{name}` de l'URL. Tu peux fixer
> `llm_profile_ref` au nom d'un profil LLM déjà enregistré pour lier un modèle
> par défaut à Léna.

---

## Option A — Chargement via l'interface agent-canvas

1. Ouvre **Settings → Agent profiles** (Paramètres → Profils d'agent).
2. Clique sur **Add profile** (Ajouter un profil) et nomme-le `lena-ia`.
3. Choisis le type **OpenHands** (et, si demandé, un profil LLM de base).
4. Colle le contenu de [`SYSTEM_PROMPT.md`](./SYSTEM_PROMPT.md) dans le champ
   *system prompt* de l'agent.
5. **Save** (Enregistrer).
6. Active le profil (`lena-ia`) depuis la liste : il devient le profil d'agent
   par défaut pour les nouvelles conversations.

## Option B — Chargement via l'API de l'agent server

Depuis la racine de ce dossier, envoie la payload à l'agent server
(par défaut `http://localhost:8000`) :

```bash
curl -X POST http://localhost:8000/api/agent-profiles/lena-ia \
  -H "Content-Type: application/json" \
  --data-binary @agent-profile.json
```

Ou via Python :

```python
import json, urllib.request

path = "agent-profile.json"          # ce dossier
payload = json.load(open(path, encoding="utf-8"))

req = urllib.request.Request(
    "http://localhost:8000/api/agent-profiles/lena-ia",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
print(urllib.request.urlopen(req).read().decode("utf-8"))
```

Pour un backend **cloud**, la même opération passe par le proxy
`POST /api/cloud-proxy` (`AgentProfilesService` route cloud dans
`src/api/cloud/agent-profiles-service.api.ts`).

## Sélectionner et activer Léna

- **Activer** (pointeur par défaut) :

  ```bash
  curl -X POST http://localhost:8000/api/agent-profiles/lena-ia/activate
  ```

- **Lancer une conversation avec Léna** : crée la conversation en passant
  `agent_profile_id` (résolu côté serveur, exclusif avec `agent_settings`) —

  ```bash
  curl -X POST http://localhost:8000/api/conversations \
    -H "Content-Type: application/json" \
    -d '{"agent_profile_id": "<id-stable-du-profil-lena-ia>"}'
  ```

  Dans l'interface, sélectionne simplement le profil `lena-ia` dans le sélecteur
  d'agent avant de démarrer la conversation.

## Vérification

- `GET /api/agent-profiles` doit lister `lena-ia`.
- `GET /api/agent-profiles/lena-ia` doit renvoyer le profil avec
  `agent_kind: "openhands"` et un `system_prompt` non vide.
- Une nouvelle conversation lancée avec ce profil démarre avec la personnalité
  Léna IA définie dans `SYSTEM_PROMPT.md`.

## Source de vérité

`SYSTEM_PROMPT.md` reste la source de vérité lisible. Si tu modifies Léna,
régénère `agent-profile.json` à partir de `SYSTEM_PROMPT.md` pour garantir que le
`system_prompt` envoyé à l'agent server reste identique au document.
