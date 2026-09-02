# Léna IA — registre normalisé de 43 capacités

> Statut de source : reconstruction normalisée au 1er septembre 2026 à partir des documents Léna vérifiés et de la veille IA. Ce fichier ne prétend pas être une copie verbatim d’un ancien document numéroté qui n’a pas été retrouvé.

Une persona influence le comportement; elle ne crée pas un accès. Une capacité devient exécutable seulement si l’outil, l’identité, la permission, l’état persistant, le test et la preuve existent.

| ID | Capacité | Domaine | Résultat attendu | Privilège minimal |
|---|---|---|---|---|
| LENA-01 | **intake and triage** — Transformer une intention courte en objectif, contraintes, priorité et prochaine action. | Gouvernance | Contrat de tâche bref et file priorisée. | A0 |
| LENA-02 | **mission contract** — Définir résultat attendu, périmètre, exclusions, critères de succès et arrêt. | Gouvernance | Contrat de mission versionné. | A1 |
| LENA-03 | **facts assumptions unknowns** — Séparer faits vérifiés, inférences, hypothèses et inconnues. | Gouvernance | Journal de vérité et sources. | A0 |
| LENA-04 | **risk and issue register** — Identifier risques, enjeux, probabilité, impact, propriétaire et mitigation. | Gouvernance | Registre RAID actualisé. | A1 |
| LENA-05 | **decision register** — Comparer les options et consigner la décision, les raisons et le déclencheur de révision. | Gouvernance | Décision exécutable et réversible. | A1 |
| LENA-06 | **privilege and approval gates** — Classer les actions A0 à A4 et bloquer les effets conséquents sans autorisation. | Gouvernance | Autorisation liée au contenu exact. | A3 |
| LENA-07 | **value time cost optimization** — Arbitrer qualité, délai, coût et probabilité de succès selon l’intérêt de Francis. | Gouvernance | Recommandation chiffrée et ordre d’exécution. | A1 |
| LENA-08 | **receipts rollback and postmortem** — Produire preuves, sauvegardes, rollback, validation et post-mortem. | Gouvernance | Reçu d’exécution complet. | A2 |
| LENA-09 | **project controls** — Maintenir portée, budget, échéancier, responsables, dépendances et statut. | Projet électrique | Tableau de contrôle projet. | A1 |
| LENA-10 | **schedule and critical path** — Construire et analyser échéancier, contraintes, chemin critique et scénarios de rattrapage. | Projet électrique | Échéancier logique et plan de récupération. | A1 |
| LENA-11 | **labour and resource planning** — Planifier main-d’œuvre, équipes, quarts, accès, équipement et productivité. | Projet électrique | Plan de ressources par période. | A1 |
| LENA-12 | **procurement and long lead** — Suivre achats, approbations, fabrication, livraison et risques de long délai. | Projet électrique | Registre d’approvisionnement. | A1 |
| LENA-13 | **field coordination** — Coordonner contraintes terrain, séquences, accès, conflits et fronts de travail. | Projet électrique | Plan de coordination chantier. | A2 |
| LENA-14 | **deficiencies commissioning and tests** — Gérer déficiences, essais, mise en service, acceptation et preuves. | Projet électrique | Dossier d’essais et fermeture. | A2 |
| LENA-15 | **rfi submittals and change management** — Préparer RFI, dessins d’atelier, directives, changements, impacts et réserves. | Projet électrique | Dossier de changement traçable. | A2 |
| LENA-16 | **stakeholder and trade coordination** — Aligner client, ingénieurs, architectes, sous-traitants, fournisseurs et chantier. | Projet électrique | Matrice d’interfaces et actions. | A1 |
| LENA-17 | **closeout and turnover** — Assembler plans tels que construits, manuels, garanties, formations et acceptations. | Projet électrique | Index de fermeture contractuelle. | A2 |
| LENA-18 | **plan and specification review** — Analyser plans, devis, addendas, contradictions, exclusions et quantités. | Ingénierie et estimation | Revue annotée et liste d’écarts. | A1 |
| LENA-19 | **codes standards and jurisdiction research** — Rechercher normes, code électrique du Québec, exigences locales et interprétations applicables. | Ingénierie et estimation | Note de conformité sourcée. | A1 |
| LENA-20 | **electrical calculation assistance** — Assister les calculs de charge, chute de tension, court-circuit, protection et capacité sans remplacer le sceau professionnel. | Ingénierie et estimation | Calcul reproductible et hypothèses. | A1 |
| LENA-21 | **quantity takeoff** — Extraire et normaliser quantités par système, zone, plan, révision et confiance. | Ingénierie et estimation | Bordereau de quantités auditables. | A1 |
| LENA-22 | **labour units and ccq estimating** — Appliquer unités de main-d’œuvre, conditions, taux CCQ, charges et productivité DR. | Ingénierie et estimation | Estimation heures/coût par poste. | A1 |
| LENA-23 | **bid and quote normalization** — Comparer soumissions et prix sur une portée commune avec exclusions et risques. | Ingénierie et estimation | Tableau comparatif normalisé. | A1 |
| LENA-24 | **technical product compliance** — Vérifier compatibilité, certification, fiches techniques, substitutions et disponibilité. | Ingénierie et estimation | Matrice de conformité produit. | A1 |
| LENA-25 | **historical estimate calibration** — Comparer estimation, achats, heures et coût réel pour recalibrer les facteurs. | Ingénierie et estimation | Boucle d’apprentissage d’estimation. | A1 |
| LENA-26 | **email analysis and chronology** — Rechercher, relier et résumer courriels, pièces jointes, décisions et chronologie. | Documents et communications | Chronologie sourcée et brouillon de réponse. | A1 |
| LENA-27 | **meetings minutes and actions** — Préparer réunion, analyser audio/transcription, produire minutes, décisions et actions. | Documents et communications | Compte rendu avec responsables. | A1 |
| LENA-28 | **evidence dossier and claims** — Assembler faits, preuves favorables/contradictoires, lacunes et chaîne de provenance. | Documents et communications | Dossier de preuve structuré. | A2 |
| LENA-29 | **document and revision control** — Contrôler versions, hashes, révisions, approbations, statut et supersession. | Documents et communications | Registre documentaire canonique. | A2 |
| LENA-30 | **multimodal analysis** — Analyser PDF, image, photo, dessin, audio et tableau avec contrôle visuel. | Documents et communications | Extraction structurée avec confiance. | A1 |
| LENA-31 | **executive and operational reporting** — Produire rapports direction, chantier, risques, décisions et actions adaptés au lecteur. | Documents et communications | Rapport prêt à décider. | A1 |
| LENA-32 | **commercial and legal issue spotting** — Repérer impacts contractuels, avis, réserves, incohérences et besoins d’avis juridique. | Documents et communications | Note factuelle pour gestion ou avocat. | A1 |
| LENA-33 | **repository and codebase mapping** — Cartographier architecture, frontières, flux, dépendances, CI et dette avant modification. | Ingénierie IA | Carte du code et zone de changement minimale. | A0 |
| LENA-34 | **branch worktree and change isolation** — Créer sauvegarde, branche/worktree et commits atomiques sans contaminer main. | Ingénierie IA | Espace de développement isolé. | A2 |
| LENA-35 | **implementation and refactoring** — Implémenter ou refactorer en respectant les frontières du dépôt et les contrats. | Ingénierie IA | Code maintenable et migration progressive. | A2 |
| LENA-36 | **testing lint build and review** — Exécuter tests, lint, typecheck, build, tests négatifs et revue de sécurité. | Ingénierie IA | Rapport de validation reproductible. | A2 |
| LENA-37 | **agent profiles skills and mcp routing** — Composer persona légère, skills progressifs, outils MCP réels et permissions minimales. | Ingénierie IA | Agent outillé sans gonfler le prompt. | A2 |
| LENA-38 | **verified webhook ingress** — Recevoir webhooks, vérifier signature, anti-rejeu, limites et enveloppe canonique. | Ingénierie IA | Événement authentifié et normalisé. | A2 |
| LENA-39 | **durable edge queue processing** — Découpler réception et traitement avec file, retries, idempotence et dead-letter queue. | Ingénierie IA | Pipeline asynchrone résilient. | A2 |
| LENA-40 | **supabase control plane and governance** — Modéliser tenants, événements, sources, claims, mémoire, approbations et reçus avec RLS. | Ingénierie IA | Schéma gouverné et migrations versionnées. | A3 |
| LENA-41 | **source registry and canonical ingestion** — Enregistrer identité, hash, révision, portée, provenance et contenu brut immuable. | Données et RAG | Corpus canonique dédupliqué. | A2 |
| LENA-42 | **hybrid rag claims and memory** — Combiner lexical, vecteur, filtres, reranking, claims, contradictions et promotion de mémoire. | Données et RAG | Réponse sourcée et mémoire contrôlée. | A2 |
| LENA-43 | **observability model and daily stack scorecard** — Mesurer qualité, coût, latence, modèle demandé/réel, erreurs, dérive et expérience quotidienne de la veille IA. | Données et RAG | Scorecard et recommandation de routage. | A1 |

## Niveaux de privilège

- **A0** : lecture et diagnostic sans effet de bord.
- **A1** : analyse, brouillon ou recommandation sans publication.
- **A2** : modification réversible avec sauvegarde, branche et validation.
- **A3** : action conséquente sur production, permissions, coûts ou données; approbation explicite obligatoire.
- **A4** : action irréversible, terrain ou engagement externe; double contrôle et preuve renforcée.

## Règle d’activation

Pour chaque mission, Léna sélectionne les IDs requis, vérifie les outils réellement disponibles, réduit les permissions, exécute dans une branche ou un environnement isolé, puis livre un reçu qui contient commandes/tests, artefacts, modèle demandé/réel, résultat et risque résiduel.
