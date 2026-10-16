# Modèle, sorties et limites

## Décision

MVP : modèle supervisé déjà entraîné, puis amélioration métier après évaluation. Aucune modification des poids livrée dans M2. Un premier jeu de tableaux est préparé, mais insuffisant pour entraîner et valider une extension. Le réglage du seuil est une calibration de restitution, pas un entraînement.

- Runtime : TensorFlow.js **4.22.0**, version fixée dans npm et le lockfile.
- Modèle : graphe **SSDLite MobileNet v2** utilisé par le package COCO-SSD.
- Source : [tensorflow/tfjs-models, COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd).
- URL du graphe : `https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json`.
- Backend : WebGL si disponible, sinon CPU. Le modèle reste en mémoire pour les analyses suivantes dans la même page.
- Le graphe et ses poids sont téléchargés à la première analyse. Le téléchargement peut échouer ou être lent. Le délai réseau est limité à 90 secondes, puis une nouvelle tentative est proposée.
- L’URL officielle n’est pas versionnée par une empreinte cryptographique ; un changement du modèle distant exige une nouvelle validation. Les dimensions des sorties sont vérifiées avant exploitation.

## Extension demandée le 16 octobre 2026

COCO détaillé et Faster R-CNN sont décrits dans [la recette des améliorations](DETECTION-QUALITY.md). Faster R-CNN ResNet50 FPN V2 COCO_V1 est converti en ONNX et exécuté localement dans un worker WebAssembly. Il partage les mêmes quatre catégories et ne reconnaît pas les tableaux. Aucun réentraînement ni API serveur n’est ajouté.

## Correspondance des catégories

Les 90 colonnes de scores utilisent les IDs COCO clairsemés, et non une liste compacte de 80 noms.

| Équipement | Classe | ID COCO | Index du score |
| --- | --- | --- | --- |
| Chaises | `chair` | 62 | 61 |
| Tables / bureaux | `dining table` | 67 | 66 |
| Écrans | `tv` | 72 | 71 |
| Portables | `laptop` | 73 | 72 |
| Tableaux / fenêtres | Aucune | — | — |

Source des correspondances : [classes officielles COCO-SSD](https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/src/classes.ts).

Les bureaux et moniteurs utilisent des classes approchantes. Une correspondance de classe ne garantit pas qu’ils seront reconnus. Les tableaux et fenêtres restent manuels, même si leur quantité attendue est nulle.

## Post-traitement

1. Lire une image ou une capture webcam figée. Import : maximum 15 Mo / 40 mégapixels, ramenée à 1920 px sur le côté le plus long. Webcam : dimensions négociées avec le navigateur.
2. Charger à la demande le runtime puis le graphe officiel. Aucun envoi de pixels ou de fichier image.
3. Exécuter le graphe, vérifier scores `[1, N, 90]` et boîtes `[1, N, 1, 4]`.
4. Pour chaque boîte, considérer uniquement les quatre colonnes d’équipements ; retenir la meilleure au-dessus de 0,20.
5. Convertir les boîtes normalisées `[ymin, xmin, ymax, xmax]` en `[x, y, largeur, hauteur]`, les borner à l’image et éliminer les géométries invalides.
6. Trier par confiance ; supprimer les boîtes de même classe dont l’IoU dépasse 0,5. Une table ne supprime pas le portable posé dessus.
7. Limiter à 100 détections ; signaler toute troncature. Appliquer ensuite le seuil utilisateur de 20 à 95 %.

Cette restriction avant suppression des doublons diffère de l’API générique `cocoSsd.detect()` qui choisit parmi toutes les classes. Ce choix réduit les catégories exploitées mais nécessite sa propre évaluation. Le score n’est pas une probabilité calibrée de conformité et ne garantit pas la correction d’un objet.

Les tenseurs d’entrée et de sortie sont libérés après chaque inférence. Le graphe est conservé en mémoire. Un résultat tardif n’est pas appliqué si la source a changé. Le nouvel audit efface les pixels affichés et les résultats ; une inférence déjà lancée termine avant de libérer sa copie temporaire.

## Personnes et confidentialité

Le modèle générique extrait des caractéristiques sur l’image entière et calcule des sorties génériques. Restreindre les colonnes exploitées n’équivaut pas à empêcher tout calcul interne influencé par une personne. L’application ne reconnaît, n’identifie, ne suit et ne compte aucune personne. Il faut cadrer une salle vide et arrêter/recommencer si une personne entre dans le champ.

Les fichiers de modèle sont téléchargés par des requêtes GET avec identifiants omis et sans référent ; le fournisseur reçoit les métadonnées réseau ordinaires de ce téléchargement. Les images ne sont ni transmises ni stockées durablement. Aucun historique d’audit ou mécanisme de suivi utilisateur n’est ajouté.

## Audit

- Écart = quantité observée − quantité attendue.
- Quatre règles comparables ; deux catégories manuelles exclues des écarts.
- Le nombre d’écarts compte des **catégories**, pas le nombre d’objets manquants supposés.
- Une analyse vide affiche zéro détection ; avant analyse les indicateurs restent en attente.
- Aucun écart sur les classes comparables signifie uniquement une cohérence des quantités sur cette vue.
- Un déficit observé exige une vérification : hors champ, occlusion, taille, perspective, éclairage et erreurs du modèle peuvent l’expliquer.
- Une vue unique ne fournit jamais un inventaire exhaustif ou une conformité complète de la salle.

## Après le MVP

Mesurer d’abord précision/rappel par classe sur des images représentatives et autorisées. Si les résultats ou la couverture métier sont insuffisants, cadrer un modèle adapté aux bureaux, moniteurs, tableaux et fenêtres : annotations, séparation entraînement/validation/test, entraînement hors du navigateur, conversion vers un runtime web, puis nouvelle recette. Cette phase reste hors du MVP validé.
