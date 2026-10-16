# Recette du milestone 2

## Distinguer les preuves

Les tests unitaires valident les règles et les géométries. Les tests navigateur utilisent des médias et des prédictions synthétiques pour valider le parcours. Un petit graphe synthétique teste le vrai chargement et l’exécution TensorFlow ; il ne reconnaît aucun objet réel.

**Aucune mesure de précision ou rappel sur photographies n’est annoncée à ce stade.** Le blocage réseau initial est levé : le graphe officiel et ses cinq fichiers de poids ont été téléchargés et exécutés dans Chromium le 16 octobre 2026. Cette vérification utilise le PNG synthétique 1 × 1 des fixtures existantes ; elle ne valide pas la reconnaissance d’équipements photographiés.

Le propriétaire a fourni deux aperçus de photos de salle, sans personne visible, et autorisé leur utilisation pour la recette. Les chemins indiqués (`C:/Users/.../Downloads/`) désignent son PC Windows ; les fichiers JPEG ne sont pas présents dans l’environnement cloud. Aucun fichier ni photo n’a été reconstitué à partir de l’aperçu. L’annotation et l’évaluation attendent des fichiers accessibles au processus de mesure (dépôt, dossier `.vision-data/` ou lien téléchargeable).

## Résultats du 16 octobre 2026

| Contrôle | Résultat observé |
| --- | --- |
| Tests unitaires | 17 réussis |
| Tests navigateur, régressions M1 comprises | 19 réussis sur Chromium |
| Compilation de production | Réussie, module TensorFlow chargé séparément à la demande |
| Graphe synthétique exécuté par TensorFlow | Deux équipements attendus, coordonnées vérifiées, nombre de tenseurs stable après une nouvelle inférence |
| Téléchargement du vrai modèle depuis cet environnement | Réussi : HTTP 200 sur le graphe officiel et les cinq fichiers de poids, TLS vérifié |
| Exécution du vrai COCO-SSD sur la fixture PNG synthétique | Réussie sur WebGL ; chargement et première analyse 13 862 ms, inférences suivantes 1 027 et 1 092 ms ; aucune prédiction retenue à partir de 20 % |
| Précision/rappel COCO-SSD sur photos | Non mesurés |
| Webcam physique et recette métier | À confirmer sur appareil client |

Preuve machine sans image : [vision-runtime-2026-10-16.json](evidence/vision-runtime-2026-10-16.json). Elle contient la version de Chromium, le backend, les requêtes et les empreintes SHA-256 du graphe, de chaque fichier de poids et du média synthétique. Les six requêtes externes observées sont des GET vers les fichiers du modèle ; aucun envoi d’image n’a été observé pendant ce contrôle. Les mesures de durée concernent ce navigateur cloud, pas les appareils clients.

Le parcours avec le vrai modèle a également vérifié le passage à 95 %, le recalcul d’un écart de chaise à −1, les catégories manuelles et le message « Cela ne prouve aucune absence ». Les tests de cadres et scores avec objets reconnus restent synthétiques tant que les JPEG ne sont pas disponibles.

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

Plan pour les deux photos autorisées du propriétaire :

- `20261016_145907.jpg` : vue paysage, équipements visibles ; annoter toutes les chaises et tables discernables, y compris aux bords.
- `rn_image_picker_lib_temp_5f806735-a4ef-4693-b904-ebabf507e684.jpg` : vue portrait dense et nombreuses occlusions ; annoter les objets visibles, en consignant les ambiguïtés des rangées du fond.
- Troisième situation proposée : recadrage du plafond de la photo portrait, sans mobilier ciblé. Consigner les coordonnées du recadrage et l’empreinte de la photo source ; annotations vides. Il s’agit d’une transformation de photo réelle, **pas d’une troisième prise de vue indépendante**. Les métriques de ce cas ne doivent pas être présentées comme celles d’un jeu de trois photos indépendantes.

Ce plan n’est pas une annotation ni un résultat mesuré. Les boîtes seront établies et relues avant l’inférence. Les images resteront dans `.vision-data/`, ignoré par Git ; seules les annotations et preuves sans image seront publiées dans la PR.

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

L’outil utilise le même détecteur que l’application et produit `test-results/vision-evaluation.json`, sans copie d’image. Il conserve le backend, le seuil, les prédictions, les annotations, les dimensions de l’image analysée, l’empreinte SHA-256 du fichier source, la durée d’inférence et les métriques par cas.

Appariement : même classe, IoU ≥ 0,5, un objet annoté au plus par détection, ordre décroissant de confiance. Précision = vrais positifs / détections ; rappel = vrais positifs / objets annotés. Un dénominateur nul donne `null`, pas un taux de réussite artificiel. Les boîtes de prédiction et d’annotation sont comparées en coordonnées normalisées.

Trois photos servent à la recette initiale, pas à établir une promesse de performance B2B. Une évaluation représentative doit élargir les salles, appareils, éclairages et angles. Les décisions sur le modèle et les seuils doivent suivre ces mesures.

## Recette utilisateur

Sur localhost ou l’URL HTTPS de prévisualisation : importer une photo autorisée, lancer l’analyse, vérifier quelques cadres et scores, changer le seuil puis le référentiel. Confirmer que tableaux/fenêtres restent manuels. Recommencer avec une capture webcam et vérifier l’arrêt matériel de la caméra. Vérifier enfin zéro détection et le message en cas de blocage du modèle.

M3 commence après validation de cette recette et consignation des limites restantes dans le ticket #7.
