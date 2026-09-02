# OpenHands + Tailscale — exécution privée

## Principe

Cloudflare reçoit les webhooks publics; le Legion n'est pas exposé publiquement. Supabase conserve l'événement durable. Un dispatcher privé sur le Legion réclame les événements admissibles et appelle le runtime OpenHands réellement observé.

## Contrat du dispatcher

1. Lire `server_info.runtime_services` et utiliser les URL annoncées; ne jamais deviner `localhost:8000` ou un autre port.
2. Réclamer atomiquement un petit lot d'événements `received` avec lease, compteur et délai de reprise.
3. Mapper `provider + event_type` vers une automatisation autorisée et un registre de capacités Léna.
4. Refuser toute action A3/A4 sans approbation non expirée liée au hash exact de la cible et du payload.
5. Démarrer une conversation/automation OpenHands sur une branche ou worktree dédiée.
6. Écrire `governance_runs`, événements, checkpoints et `lena.execution_receipts`.
7. Marquer `processed` seulement après preuve; sinon retry borné, puis `dead_letter`.

Le code de ce dispatcher n'est pas ajouté tant que le Legion est hors ligne : le contrat OpenHands doit être généré contre la version et les endpoints réellement en exécution, pas contre une URL supposée.

## Accès Tailscale Serve

Le service OpenHands/Agent Canvas doit écouter sur `127.0.0.1`. Après vérification du port réel :

```powershell
# Inspection sans effet
 tailscale status
 tailscale serve status

# Partage privé dans le tailnet; remplacer <port-reel>
 tailscale serve localhost:<port-reel>

# Validation
 tailscale serve status

# Rollback
 tailscale serve reset
```

Règles :

- Serve seulement; Funnel exige une décision séparée parce qu'il rend le service public.
- Les ACL du tailnet doivent limiter les utilisateurs/appareils autorisés.
- Aucune tâche planifiée ni script maison au démarrage.
- Ne pas transférer la clé de session OpenHands dans une URL, un log ou un dépôt.
- Le rollback `tailscale serve reset` doit être vérifié après tout essai.
