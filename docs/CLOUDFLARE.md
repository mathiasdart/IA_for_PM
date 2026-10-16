# Déployer avec Cloudflare Pages

Le dépôt doit contenir au moins un commit et une branche distante avant de connecter Pages. Un dépôt vide ne peut pas fournir de branche de production.

## Connexion GitHub

1. Ouvrir [Cloudflare](https://dash.cloudflare.com/) et sélectionner le compte concerné.
2. Aller dans **Workers & Pages → Create application → Pages → Connect to Git**.
3. Choisir GitHub. Installer ou configurer l’intégration Cloudflare et lui donner accès au dépôt privé **mathiasdart/IA_for_PM**.
4. Sélectionner ce dépôt et commencer la configuration.

## Paramètres de compilation

| Champ | Valeur |
| --- | --- |
| Nom du projet | `epita-smart-classroom` (ou un nom disponible) |
| Branche de production | `main` |
| Framework preset | `None` si aucun preset Vite simple n’est proposé |
| Root directory | Laisser vide : racine du dépôt |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node | 22, également déclaré dans `.node-version` |
| Variables applicatives / secrets | Aucun nécessaire au milestone 1 |

Cloudflare installe les dépendances du dépôt avant le build. Le dossier `dist` est généré ; il n’a pas à être poussé sur GitHub.

Dans Pages, il n’y a pas de commande `wrangler deploy` à saisir. Si l’écran réclame une commande de déploiement de Worker, revenir à la création d’un projet **Pages**.

Une fois le dépôt poussé et le build local vérifié, **Save and Deploy** démarre le premier déploiement. Cloudflare fournit alors une URL HTTPS en `pages.dev` ; cette URL, son commit et son statut doivent être consignés dans le README après vérification.

## Si le clonage échoue

Le message `Failed: error occurred while fetching repository` apparaît avant le build. Modifier `npm run build` ou `dist` ne corrige pas cette étape.

Vérifier dans cet ordre :

1. Le dépôt a au moins un commit et `main` apparaît sur GitHub.
2. L’intégration Cloudflare est autorisée sur le dépôt privé exact. Dans GitHub : **Settings → Applications → Installed GitHub Apps → Cloudflare → Configure** ; vérifier la sélection du dépôt.
3. Le bon compte GitHub est associé au projet Pages et le dépôt n’a pas été renommé ou déplacé.
4. Relancer le déploiement. Si nécessaire, reconnecter l’intégration Git depuis les paramètres du projet Pages.

Ne jamais publier de token ou modifier un secret pour résoudre un simple problème de sélection de dépôt.

## Recette après déploiement

- Vérifier l’interface et les six lignes de configuration.
- Importer une image autorisée, vérifier l’affichage puis l’effacement.
- Autoriser la webcam, vérifier le démarrage puis l’arrêt physique de la caméra.
- Vérifier le comportement en cas de refus caméra.
- Au milestone 1 : détection, seuil d’analyse et exports sont volontairement indisponibles.
- Au milestone 2 : vérifier en plus le chargement du modèle et une inférence réelle. L’environnement de l’utilisateur devra accéder aux fichiers du modèle.

Les déploiements des branches de travail peuvent servir de prévisualisations. Le dépôt privé ne rend pas automatiquement le site déployé privé : une restriction d’accès est un réglage d’hébergement distinct.

## Références officielles

- [Connecter Git à Pages](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Configuration des builds](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Gérer l’intégration GitHub](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
