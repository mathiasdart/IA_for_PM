# EPITA Smart Classroom

Application B2B d’aide au contrôle visuel des équipements d’une salle. Le responsable prépare une source visuelle, définit les quantités attendues puis, à terme, obtient un audit accompagné de réserves explicites.

## État de la livraison

**Milestone 2 : détection et audit, en recette.** Le passage à M2 a été autorisé par le propriétaire après la livraison M1. Le rapport et ses exports restent prévus à M3. Aucun résultat artificiel n’est présenté dans l’application.

- Interface responsive en français et navigation au clavier.
- Import local JPEG, PNG et WebP, maximum 15 Mo et 40 mégapixels ; redimensionnement d’affichage à 1920 px maximum.
- Démarrage/arrêt webcam et gestion des refus, de la déconnexion et des demandes annulées.
- Arrêt de la caméra lors d’un changement de source ou lorsque la page devient masquée.
- Nom de salle et configuration de six catégories, quantités entières de 0 à 999.
- Les valeurs d’exemple sont signalées et peuvent être rétablies.
- Détection COCO-SSD chargée à la demande, cadres et scores individuels ; seuil entre 20 et 95 %.
- Audit d’une image figée : une capture webcam arrête le flux ; un changement de source invalide les résultats.
- Comptages, écarts par catégorie et statut partiel recalculés selon le seuil et le référentiel.
- Échec du téléchargement expliqué avec nouvelle tentative. Un objet non détecté n’est jamais déclaré absent.
- Ni stockage persistant ni envoi de l’image. Les pixels restent temporairement en mémoire jusqu’au changement de source ou au nouvel audit.

## Démarrer

Prérequis : **Node.js 22.12 ou supérieur** (branche LTS 22 recommandée), npm et un navigateur récent.

```bash
npm ci
npm run dev
```

Ouvrir l’adresse locale indiquée par Vite. Pour la webcam, utiliser `localhost` ou HTTPS ; une adresse IP locale servie en HTTP ne suffit pas.

```bash
npm test
npm run build
npm run preview
```

La compilation génère `dist/`. Ce dossier est un artefact de livraison et n’est pas versionné.

### Tests navigateur

```bash
npx playwright install chromium
npm run test:e2e
```

Si Chromium est déjà installé sur la machine :

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Ces tests vérifient le parcours avec des médias synthétiques et des autorisations simulées. Un graphe synthétique teste le vrai runtime TensorFlow, ses sorties et la libération des tenseurs. Cela ne prouve ni la qualité de COCO-SSD sur des photographies ni le fonctionnement d’une webcam physique.

Pour l’évaluation réelle, voir [le protocole M2 et l’outil de mesure](docs/VALIDATION-M2.md). Les tests simulés et les mesures de vision sont comptabilisés séparément.

Le vrai graphe COCO-SSD et ses poids ont désormais été téléchargés et exécutés sur la fixture synthétique existante (`npm run verify:vision-runtime`). Cela confirme le runtime et le parcours réseau, sans mesure de précision/rappel sur photographies. Les deux photos autorisées du propriétaire attendent leur transfert depuis son PC vers un emplacement accessible au cloud. M2 reste en recette et M3 attend sa validation explicite.

## Architecture

Frontend statique HTML, CSS et JavaScript ES modules, assemblé par Vite. Aucune API métier ni base de données. TensorFlow.js 4.22.0 est une dépendance runtime versionnée, compilée dans un module chargé à la demande. Les poids du modèle sont téléchargés depuis Google Cloud Storage ; aucune image n’est envoyée à ce service.

```text
index.html                    Structure et parcours
src/app.js                    État de la session, sources et interactions
src/configuration.js          Catalogue, quantités et validations
src/audit.js                  Règles et indicateurs d’audit
src/detector.js               Chargement TensorFlow et exécution du graphe
src/model-spec.js             Provenance et paramètres du modèle
src/detection-postprocess.js  Classes d’équipements, cadres et doublons
src/icons.js                  Icônes SVG locales
src/style.css                 Interface et responsive
public/                       Favicon et en-têtes Cloudflare
tests/                        Tests unitaires et parcours navigateur
docs/                         Plan, décisions et guide de livraison
scripts/                      Évaluation de vision sur annotations
```

## Décision IA

Décision validée le 16 octobre 2026 : **COCO-SSD préentraîné pour le MVP, amélioration métier ensuite**. Nous ne réentraînons pas les poids dans ce MVP. Évaluer des images annotées et régler un seuil de confiance ne constitue pas un entraînement.

Le moteur charge le graphe **SSDLite MobileNet v2** utilisé par COCO-SSD. Il lit uniquement les quatre colonnes de scores d’équipements, choisit la meilleure classe autorisée par boîte puis applique une suppression des doublons par catégorie (IoU > 0,5). Le plancher de calcul est 20 % et la limite 100 détections par image, explicitement signalée si atteinte. Ce post-traitement est décrit dans [la documentation du modèle](docs/MODEL.md) et doit être évalué sur notre jeu d’images.

| Équipement | Classe COCO-SSD | Limite |
| --- | --- | --- |
| Chaises | `chair` | Objets visibles et suffisamment reconnus |
| Tables et bureaux | `dining table` | Classe approchante, couverture incomplète des bureaux |
| Ordinateurs portables | `laptop` | Objets ouverts/fermés et petits objets potentiellement mal reconnus |
| Écrans | `tv` | Classe approchante, pas une garantie de reconnaissance des moniteurs |
| Tableaux | Aucune | Contrôle manuel |
| Fenêtres | Aucune | Contrôle manuel |

COCO-SSD est un modèle générique : l’extraction de caractéristiques porte sur l’image entière. La restriction des classes ne garantit pas qu’une personne dans le champ n’influence pas les calculs internes. Aucun résultat, comptage, identité ou suivi de personne n’est produit. **Cadrez une salle vide.** Ne jamais assimiler un objet non détecté à une absence certaine.

Source du modèle : [TensorFlow.js COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd).

## Suivi et livraison

- [Pilotage et validations](https://github.com/mathiasdart/IA_for_PM/issues/11)
- [Tickets](https://github.com/mathiasdart/IA_for_PM/issues)
- [Plan en trois milestones](docs/ROADMAP.md)
- [Guide Cloudflare Pages](docs/CLOUDFLARE.md)

Cloudflare Pages : `npm run build`, sortie `dist`, racine du dépôt, Node 22. La branche de production prévue est `main`.

**URL publique : non déployée à ce stade.** L’hébergement Cloudflare et la disponibilité en ligne doivent être vérifiés séparément des tests locaux.
