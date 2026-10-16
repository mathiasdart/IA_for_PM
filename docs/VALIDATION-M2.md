# Recette du milestone 2

## Version suivante : COCO détaillé et Faster R-CNN

La recette initiale ci-dessous est conservée comme référence historique. Les améliorations demandées ensuite, leurs mesures réelles, le mode combiné expérimental et ses limites sont documentés dans [DETECTION-QUALITY.md](DETECTION-QUALITY.md). Les tableaux restent manuels et M3 attend la validation explicite du propriétaire.

## Distinguer les preuves

Les tests unitaires valident les règles et les géométries. Les tests navigateur utilisent des médias et des prédictions synthétiques pour valider le parcours. Un petit graphe synthétique teste le vrai chargement et l’exécution TensorFlow ; il ne reconnaît aucun objet réel.

**Recette initiale réalisée sur deux photos autorisées du propriétaire, trois situations, au seuil fixé à 55 %.** Le graphe officiel et ses cinq fichiers de poids ont été téléchargés et exécutés dans Chromium. Les annotations ont été établies avant inférence, puis inspectées une seconde fois par le même annotateur. Il n’y a pas eu de relecture indépendante.

Les JPEG ont été récupérés via Google Drive et conservés dans `.vision-data/`, ignoré par Git. Le dépôt publie uniquement les annotations, les paramètres de recadrage, les empreintes des sources et les résultats sans image. La vue partielle et le négatif sont des recadrages de la même photo portrait : **deux prises de vue indépendantes, pas trois**.

## Résultats du 16 octobre 2026

| Contrôle | Résultat observé |
| --- | --- |
| Tests unitaires | 17 réussis |
| Tests navigateur, régressions M1 comprises | 19 réussis sur Chromium |
| Compilation de production | Réussie, module TensorFlow chargé séparément à la demande |
| Publication Cloudflare Workers | Configuration `wrangler.jsonc` et Wrangler 4.151.1 ; déploiement à blanc réussi, 8 fichiers statiques préparés |
| Graphe synthétique exécuté par TensorFlow | Deux équipements attendus, coordonnées vérifiées, nombre de tenseurs stable après une nouvelle inférence |
| Téléchargement du vrai modèle depuis cet environnement | Réussi : HTTP 200 sur le graphe officiel et les cinq fichiers de poids, TLS vérifié |
| Exécution du vrai COCO-SSD sur la fixture PNG synthétique | Réussie sur WebGL ; chargement et première analyse 13 862 ms, inférences suivantes 1 027 et 1 092 ms ; aucune prédiction retenue à partir de 20 % |
| Précision/rappel COCO-SSD sur ce petit jeu | 4 vrais positifs, 0 faux positif, 21 faux négatifs ; précision 4/4 = 100 %, rappel 4/25 = 16 % |
| Parcours avec photo réelle | Cadres/scores et compteurs cohérents ; 2 résultats à 55 %, 16 à 20 %, 0 à 95 % ; écarts −14 chaises et −6 tables pour le référentiel 16/6 ; catégories manuelles et changement de source vérifiés |
| Webcam physique et recette métier | À confirmer sur appareil client |

Preuve machine sans image : [vision-runtime-2026-10-16.json](evidence/vision-runtime-2026-10-16.json). Elle contient la version de Chromium, le backend, les requêtes et les empreintes SHA-256 du graphe, de chaque fichier de poids et du média synthétique. Les six requêtes externes observées sont des GET vers les fichiers du modèle ; aucun envoi d’image n’a été observé pendant ce contrôle. Les mesures de durée concernent ce navigateur cloud, pas les appareils clients.

Le parcours avec le vrai modèle a également vérifié le passage à 95 %, le recalcul d’un écart de chaise à −1, les catégories manuelles et le message « Cela ne prouve aucune absence ». Le parcours avec la photo paysage a ensuite vérifié de vrais cadres et scores ; voir les preuves ci-dessous.

Le build émet un avertissement de taille pour le module TensorFlow (environ 1 Mo minifié, 258 ko gzip). Il est chargé à la première analyse et ne bloque pas l’affichage initial. La performance réelle doit être mesurée sur les appareils cibles.

## Contrôles automatisés

```bash
npm ci
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run verify:vision-runtime
```

Sans Chromium système, utiliser `npx playwright install chromium` puis `npm run test:e2e`.

Couverture :

- Quantités attendues, types/tailles d’image et messages d’erreur caméra.
- Distinction entre absence d’analyse et zéro détection.
- Seuil, classes autorisées, écarts par catégorie, catégories manuelles et statut partiel.
- Correspondances COCO clairsemées, boîtes normalisées, suppression des doublons, limite de 100 objets.
- Régression M1 : interface, import, refus et arrêt webcam, permission tardive, 1440/768/390 px.
- M2 : cadres/compteurs cohérents, scores, nouveau référentiel, nouvelle source, erreur modèle et nouvelle tentative, résultat tardif ignoré.
- Capture webcam figée avec arrêt des pistes ; saisie invalide suspendant la comparaison.
- Runtime TensorFlow réel avec téléchargement bloqué simulé : chargement à la demande, message et aucun faux résultat.
- Runtime TensorFlow réel avec graphe synthétique : sorties, coordonnées et absence d’accumulation de tenseurs sur une seconde inférence.

La webcam physique et les autorisations d’un appareil client nécessitent une vérification manuelle. Les tests de navigation ne constituent pas un audit d’accessibilité exhaustif.

`verify:vision-runtime` télécharge le vrai graphe et ses poids, sans interception ni remplacement de réponse. Il produit `test-results/vision-runtime.json`, explicitement marqué `recognitionQualityMeasured: false`. Il est distinct de `evaluate:vision`, qui exige des annotations de photographies. Les outils de vision utilisent `HTTPS_PROXY` ou `HTTP_PROXY` lorsqu’il est configuré ; Chromium doit faire confiance au certificat du proxy. Dans cet environnement, sa base NSS doit être accessible en écriture pour être ouverte correctement. Aucune désactivation de la vérification TLS n’est utilisée.

## Évaluation réelle sur trois situations

Préparer au moins :

| Situation | Photo et annotations | Vérification attendue |
| --- | --- | --- |
| Équipements visibles | Une vue nette sans personne, objets visibles annotés | Cadres, catégories, scores et erreurs de comptage |
| Vue partielle / occlusions | Autre angle ou équipements partiellement masqués | Déficit de détection expliqué, jamais absence certaine |
| Aucun équipement ciblé visible | Mur ou zone vide autorisée, annotations vides | Zéro résultat possible ; faux positifs comptés s’il y en a |

Les annotations portent sur les **objets visibles de la photo**, pas sur l’inventaire théorique de la salle. Un objet complètement hors champ ne doit pas être utilisé comme vérité terrain de détection sur cette vue.

Jeu effectivement mesuré, paramètres fixés avant inférence :

| Situation | Source et région évaluée | Vérité terrain | Résultat à 55 % | Inférence |
| --- | --- | --- | --- | --- |
| Équipements visibles | `20261016_145907.jpg`, vue complète 4000 × 3000, analysée à 1920 × 1440 | 16 chaises, 6 tables | 2 chaises appariées, 20 objets manqués ; précision 100 %, rappel 9,1 % | 5 563 ms |
| Vue partielle / occlusions | Photo portrait 3000 × 4000 ; région originale `[0, 2250, 1500, 645]`, analysée à 720 × 310 | 2 chaises tronquées, 1 table partiellement masquée | 2 chaises appariées, table manquée ; précision 100 %, rappel 66,7 % | 1 171 ms |
| Aucun équipement ciblé | Même portrait ; plafond `[0, 0, 3000, 1400]`, analysé à 1440 × 672 | Aucun objet ciblé | 0 prédiction ; précision/rappel `null` | 1 253 ms |

Les régions sont `[x, y, largeur, hauteur]` en pixels de la photo originale. Le navigateur importe d’abord l’image avec le redimensionnement habituel de l’application, puis découpe le canevas : un arrondi explique les 310 px de hauteur du cas partiel. Le manifest stocke aussi les régions normalisées. Le portrait complet n’a pas de métrique annotée ; seule la région indiquée est évaluée.

Preuves versionnées :

- [Annotations établies avant inférence](evidence/vision-annotations-2026-10-16.json).
- [Prédictions, métriques, dimensions et empreintes SHA-256](evidence/vision-evaluation-2026-10-16.json).
- [Contrôles du parcours avec la photo réelle](evidence/vision-photo-ui-2026-10-16.json), reproductibles par `npm run verify:vision-photo-ui` avec les sources locales nommées `vue-paysage.jpg` et `vue-portrait.jpg`.

### Interprétation et limites

Le modèle sous-compte fortement la vue large : seules deux chaises proches sont retenues au seuil fixé. Sur l’ensemble, rappel des chaises 4/18 = 22,2 % ; rappel des tables 0/7 = 0 %. Aucun écran ni portable n’est visible : aucune performance de ces classes n’est mesurée. Une précision de 100 % sur quatre prédictions ne constitue pas une promesse de qualité et ne compense pas les 21 objets manqués.

Les cadres annotés englobent les parties visibles et les pieds discernables ; les objets entièrement cachés sont exclus. La surface continue de la rangée de tables arrière droite est annotée comme une table, faute de joint discernable : son nombre physique doit être confirmé sur place. Ces annotations manuelles initiales et ce petit jeu ne constituent pas un benchmark représentatif. Aucun réglage de seuil, poids ou annotation n’a été optimisé à partir des résultats. Le seuil à 20 % a été vérifié pour le parcours uniquement ; ses 16 résultats n’ont pas fait l’objet d’un appariement ni d’une mesure de qualité.

M2 est publiable comme **aide au contrôle sur une vue**, avec vérification humaine obligatoire des déficits et des catégories manuelles. Il ne fournit pas d’inventaire exhaustif. La webcam physique reste à vérifier sur appareil client. La publication M2 n’autorise pas M3 : le propriétaire doit valider explicitement la détection et ses conclusions.

### Reproduire la mesure

Créer un dossier `.vision-data/` (ignoré par Git) avec les photos et un fichier `manifest.json`. Format d’exemple à compléter manuellement ; les coordonnées ci-dessous illustrent le format et ne sont pas des annotations validées :

```json
{
  "threshold": 0.55,
  "cases": [
    {"id":"vue-generale", "file":"salle.jpg", "expected":[{"class":"chair", "bbox":[0.1,0.2,0.2,0.5]}]},
    {"id":"vue-partielle", "file":"angle.jpg", "expected":[{"class":"laptop", "bbox":[0.3,0.3,0.3,0.2]}]},
    {"id":"zone-vide", "file":"mur.jpg", "expected":[]}
  ]
}
```

Classes admises : `chair`, `dining table`, `tv`, `laptop`. Boîtes `[x, y, largeur, hauteur]` entre 0 et 1, relatives à l’image complète. Annoter tous les équipements visibles des classes ciblées, puis faire relire les annotations.

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run evaluate:vision -- .vision-data/manifest.json
```

L’outil utilise le même détecteur que l’application et produit `test-results/vision-evaluation.json`, sans copie d’image. Il conserve le backend, le seuil, les prédictions, les annotations, les dimensions et régions de l’image analysée, l’empreinte SHA-256 du fichier source, la durée d’inférence et les métriques par cas. Une empreinte `sourceSha256` fournie dans le manifest est vérifiée avant toute inférence ; `crop` accepte une région normalisée `[x, y, largeur, hauteur]`, les annotations étant relatives à cette région.

Appariement : même classe, IoU ≥ 0,5, un objet annoté au plus par détection, ordre décroissant de confiance. Précision = vrais positifs / détections ; rappel = vrais positifs / objets annotés. Un dénominateur nul donne `null`, pas un taux de réussite artificiel. Les boîtes de prédiction et d’annotation sont comparées en coordonnées normalisées.

Ces trois situations dérivées de deux photos servent à la recette initiale, pas à établir une promesse de performance B2B. Une évaluation représentative doit élargir les salles, appareils, éclairages et angles. Les décisions sur le modèle et les seuils doivent suivre ces mesures.

## Recette utilisateur

Sur localhost ou l’URL HTTPS de prévisualisation : importer une photo autorisée, lancer l’analyse, vérifier quelques cadres et scores, changer le seuil puis le référentiel. Confirmer que tableaux/fenêtres restent manuels. Recommencer avec une capture webcam et vérifier l’arrêt matériel de la caméra. Vérifier enfin zéro détection et le message en cas de blocage du modèle.

Les mesures et limites sont consignées dans le ticket #7. M3 commence uniquement après validation explicite du propriétaire, distincte de sa demande de publication M2.
