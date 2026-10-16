# COCO détaillé et Faster R-CNN dans le navigateur

## Comportement livré

Trois modes partagent les quatre catégories : chaises, tables, écrans indépendants (`tv`) et ordinateurs portables. Les tableaux et fenêtres restent manuels.

- **COCO détaillé**, par défaut : vue complète et quatre zones se chevauchant. Les cadres sont replacés dans l'image, les fragments aux bords internes sont écartés et les doublons de même classe sont supprimés. Une règle évite de compter les morceaux d'un grand portable comme plusieurs appareils.
- **COCO rapide** : une seule vue, consommation réduite.
- **COCO + Faster R-CNN**, facultatif et expérimental : COCO détaillé puis Faster R-CNN ResNet50 FPN V2, poids officiels torchvision COCO_V1. Exécution ONNX Runtime Web 1.23.2 en WebAssembly, dans un worker. Aucun serveur d'analyse, aucun envoi de photo.

Les scores des deux moteurs restent inchangés et leur provenance apparaît dans les détails. La fusion supprime les doublons de même classe avec IoU > 0,5. Un écran contenu à 90 % dans un portable d'un score au moins aussi élevé n'est pas compté comme un écran indépendant. Les scores de deux modèles ne sont pas calibrés entre eux ; les comparer pour fusionner les cadres ne crée pas une probabilité fiable. Les erreurs de localisation, de classe et les doublons résiduels restent possibles.

Le seuil reste réglable de 20 à 95 %, initialement 55 %. Un seuil plus élevé réduit aussi le nombre d'objets correctement repérés. Les résultats sont invalidés quand la source ou le mode change. Si Faster R-CNN échoue, aucun résultat COCO seul n'est présenté comme une analyse combinée ; un mode COCO peut être relancé.

## Mesure exploratoire

Quatre photographies autorisées, cinq cas dont des recadrages, 27 annotations : 18 chaises, 7 tables et deux vues rapprochées du **même portable**. Les recadrages de portable excluent les personnes et ne représentent pas une salle entière. Les annotations ont été faites avant inférence, relues par le même annotateur, sans validation indépendante. Les règles de fusion ont ensuite été ajustées sur ces images : **jeu de développement, aucun résultat de généralisation**. Aucun écran indépendant n'est annoté.

Au seuil de 55 %, appariement de même classe avec IoU ≥ 0,5 :

| Mode | Vrais positifs | Faux positifs | Faux négatifs | Rappel |
| --- | ---: | ---: | ---: | ---: |
| COCO rapide | 6 | 0 | 21 | 22,2 % |
| COCO détaillé | 10 | 0 | 17 | 37,0 % |
| Faster R-CNN seul, mesure technique | 19 | 12 | 8 | 70,4 % |
| Mode combiné | 21 | 11 | 6 | 77,8 % |

Le gain de rappel du mode combiné s'accompagne d'une perte de précision : 21/32 = 65,6 % sur ce jeu. À 85 %, il reste 15 vrais positifs et 3 faux positifs ; à 95 %, 12 vrais positifs et aucun faux positif observé. Ces choix de seuil restent exploratoires et ne garantissent pas la fiabilité sur une nouvelle salle.

COCO détaillé prend environ 6 secondes en moyenne, contre 1,2 seconde en rapide. Faster R-CNN ajoute environ 28 à 42 secondes par vue dans Chromium cloud, en WebAssembly à un seul thread. Les performances et la mémoire sur téléphone restent à tester. Le processus Chromium a atteint environ 1,2 Go de mémoire résidente pendant le test ; ce n'est pas une mesure isolée du seul modèle.

La variante COCO MobileNet v2 complète a également été essayée : plus lourde et moins précise sur les premières vues de salle. SSDLite MobileNet v2 est donc conservé. Les deux portables sont reconnus en COCO seul sur leurs recadrages ; cela ne prouve pas la reconnaissance générale des portables fermés ou éloignés.

Preuves sans photographie :

- [Annotations et recadrages](evidence/vision-quality-annotations-2026-10-16.json).
- [COCO rapide/détaillé retenu](evidence/vision-quality-selected-2026-10-16.json).
- [Comparaison initiale des deux variantes COCO](evidence/vision-quality-development-2026-10-16.json).
- [Faster R-CNN et fusion réellement exécutés dans Chromium](evidence/faster-browser-2026-10-16.json).
- [Parcours sur la compilation de production](evidence/hybrid-ui-2026-10-16.json).

## Poids et compilation

L'export ONNX opset 17 pèse 175 032 490 octets, SHA-256 `748b85212bc0f0a61095ae1a5a9897393445a93a52cd2b732c2ffdad75a43927`. Il est découpé en neuf parties de moins de 20 Mio, adaptées à la limite Cloudflare par fichier. Le moteur WebAssembly ajoute environ 12 Mo. Ces fichiers ne sont chargés par le navigateur qu'en mode combiné ; aucun téléchargement Faster R-CNN lors d'une analyse COCO seule.

Le manifeste versionné contient les empreintes de toutes les parties et du modèle entier. `npm run build` télécharge les parties depuis la release GitHub `models-faster-rcnn-v1`, vérifie leurs tailles et SHA-256, puis construit les fichiers statiques. Les parties locales sont ignorées par Git ; les photos le sont également. Le worker vérifie à nouveau les empreintes avant de charger ONNX. Un worker ayant dépassé 180 secondes est arrêté ; changer de mode libère le worker Faster R-CNN chargé.

Pour reproduire les mesures avec les sources autorisées dans `.vision-data/` :

```bash
npm run benchmark:vision -- .vision-data/manifest-quality.json --base=lite_mobilenet_v2
npm run benchmark:faster-browser -- .vision-data/manifest-quality.json
npm run build
node scripts/verify-hybrid-ui.mjs
```

Les navigateurs doivent autoriser WebAssembly et les workers. Les outils Playwright acceptent `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Dans l'environnement cloud avec proxy, conserver ses variables réseau et sa confiance TLS ; pour les téléchargements Node, utiliser `NODE_USE_ENV_PROXY=1` si nécessaire.

Pour exporter de nouveau le modèle, installer `scripts/requirements-vision.txt` dans un environnement Python séparé, puis exécuter `python scripts/export-faster.py`. Cela télécharge les poids officiels avec vérification de leur empreinte publiée ; aucun entraînement n'est réalisé. La conversion doit être suivie d'une nouvelle recette navigateur et d'une nouvelle version des assets si les empreintes changent. Voir [la licence du logiciel torchvision](../public/models/faster-rcnn/torchvision-LICENSE.txt).

L'extension tableaux nécessite un jeu distinct et un entraînement spécifique : [état des données et étapes restantes](BOARD-EXTENSION.md). M3 reste soumis à validation explicite du propriétaire.
