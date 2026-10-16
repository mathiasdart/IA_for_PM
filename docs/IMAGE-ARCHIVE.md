# Archive privée des images — D1 / R2 / Access

L’analyse COCO/Faster R-CNN reste dans le navigateur. Importer une photo, capturer
une vue ou lancer l’analyse ne crée aucun enregistrement distant. Seul le bouton
« Enregistrer cette vue dans Cloudflare » envoie une copie JPEG de la vue et son
analyse éventuelle. La copie peut différer du fichier original (compression,
dimensions de la vue). Les scores sauvegardés sont déclarés par le client ; ils
ne constituent pas une certification serveur ni un audit exhaustif de la salle.

D1 contient le propriétaire Access (`sub`), les métadonnées, l’empreinte SHA-256
et le JSON d’analyse. R2 contient les fichiers ; aucun accès public R2 ne doit
être activé. Chaque lecture, liste et suppression vérifie le JWT Access et filtre
sur son propriétaire. Une image d’un autre compte renvoie 404. Les réponses API
et fichiers sont `private, no-store`. Les requêtes de mutation vérifient Origin.
La limite est de 8 Mio par image et 40 millions de pixels déclarés.

Les fichiers sont conservés jusqu’à leur suppression explicite. « Supprimer »
retire le fichier R2 et sa ligne D1. Les politiques de sauvegarde et récupération
du fournisseur restent distinctes de la disponibilité dans l’application.
Une reprise recharge la photo pour une nouvelle analyse ; elle ne rétablit pas
silencieusement un ancien résultat comme une analyse courante.

## Provisionnement

Le compte cible est celui de l’application `ia-for-pm`. Ne pas créer une seconde
base : le propriétaire a fourni `ia_for_pm`, UUID
`69e680df-5f6d-4d2c-98aa-d33a52d597d9`, déjà renseigné dans `wrangler.jsonc`.

Le jeton d’administration doit autoriser Workers Scripts Edit, D1 Edit, Workers
R2 Storage Edit et Access Apps and Policies Edit sur ce compte. Pour créer une
organisation Access, il faut également les droits Zero Trust correspondants, ou
la créer dans le tableau de bord. Ne jamais versionner le jeton.

1. Vérifier la base avec `npx wrangler d1 info ia_for_pm`.
2. Créer ou réutiliser un bucket privé dédié :
   `npx wrangler r2 bucket create ia-for-pm-images`.
3. Ajouter `r2_buckets: [{ binding: "IMAGES", bucket_name: "ia-for-pm-images" }]`
   à `wrangler.jsonc`, après vérification du nom réel. Ne pas activer `r2.dev`,
   de domaine public ou de règle CORS publique.
4. Appliquer la migration additive :
   `npx wrangler d1 migrations apply ia_for_pm --remote`.
5. Activer Cloudflare Access et créer une application self-hosted protégeant
   `ia-for-pm.mathiasdart89.workers.dev/api/*`, y compris `/api/login`.
   Le frontend public reste utilisable sans connexion. Choisir une politique
   Allow avec uniquement les adresses explicitement autorisées par le propriétaire,
   via OTP email ou le fournisseur d’identité de l’équipe. Ne pas utiliser de
   politique Bypass ou Allow Everyone.
6. Relever le domaine d’équipe `*.cloudflareaccess.com` et l’audience réelle de
   cette application. Renseigner les variables Worker `CF_ACCESS_TEAM_DOMAIN`
   (sans `https://`) et `CF_ACCESS_AUD` dans `wrangler.jsonc` ou la configuration
   de déploiement. Ces valeurs sont des identifiants publics, pas des mots de passe.
7. Construire, faire le dry-run, puis déployer après les vérifications ci-dessous.

Le bouton « Se connecter à l’archive » effectue une navigation vers `/api/login`
pour déclencher Access. Après connexion, le Worker redirige vers `/#images`.
Les appels fetch refusent les redirections de connexion et demandent de se
reconnecter. Sans D1, R2 ou configuration Access complète, l’API renvoie 503 et
l’analyse locale reste utilisable. Sans JWT valide, le Worker refuse en 401,
même si une requête contourne la passerelle Access ou fournit un email en en-tête.

## Recette

`npm test` vérifie signature, issuer, audience, expiration, absence de JWT,
vrais D1/R2 locaux, cycle de stockage, isolation, faux fichier, corps trop gros
avec et sans Content-Length et nettoyage de R2 après échec SQL. Les identités
injectées existent uniquement dans la fixture de test ; l’entrypoint déployé
utilise toujours la vérification cryptographique.

`npm run test:e2e` teste le frontend avec une API simulée : aucun POST à l’import
ou à l’analyse, envoi explicite de JPEG et résultats, reprise sans ancien audit,
suppression et erreurs 401/503/500. Cela ne prouve pas une connexion Access réelle.

Avant publication : `npm run build`, `npx wrangler deploy --dry-run`, puis recette
distante avec un utilisateur autorisé : connexion, import/analyse sans écriture,
enregistrement sur clic, reprise et suppression. Vérifier refus anonyme et refus
d’un compte non autorisé. Avec deux comptes autorisés, vérifier qu’aucun ne voit
ni ne lit les images de l’autre. Ne pas déclarer ces contrôles distants réussis
tant que l’accès Cloudflare et les sessions ne les ont pas permis.

Cette extension ne démarre pas M3 : la validation explicite du propriétaire reste
requise.
