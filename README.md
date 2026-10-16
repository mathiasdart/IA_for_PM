# EPITA Smart Classroom

Application B2B d’aide au contrôle visuel des équipements d’une salle. Le responsable prépare une source visuelle, définit les quantités attendues puis, à terme, obtient un audit accompagné de réserves explicites.

## État de la livraison

**Milestone 1 : interface, sources et configuration.** La détection, les compteurs d’audit et le rapport ne sont pas encore activés. Aucun résultat artificiel n’est présenté. La validation du propriétaire est requise avant de commencer le milestone 2.

- Interface responsive en français et navigation au clavier.
- Import local JPEG, PNG et WebP, maximum 15 Mo et 40 mégapixels ; redimensionnement d’affichage à 1920 px maximum.
- Démarrage/arrêt webcam et gestion des refus, de la déconnexion et des demandes annulées.
- Arrêt de la caméra lors d’un changement de source ou lorsque la page devient masquée.
- Nom de salle et configuration de six catégories, quantités entières de 0 à 999.
- Les valeurs d’exemple sont signalées et peuvent être rétablies.
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

Ces tests vérifient le parcours avec des médias synthétiques et des autorisations simulées. Ils ne prouvent ni la qualité d’une future détection IA ni le fonctionnement d’une webcam physique. La recette utilisateur complète ces contrôles.

## Architecture

Frontend statique HTML, CSS et JavaScript ES modules, assemblé par Vite. Aucune API métier ni base de données au milestone 1. Le code produit n’a pas de dépendance runtime externe.

```text
index.html                    Structure et parcours
src/app.js                    État de la session, sources et interactions
src/configuration.js          Catalogue, quantités et validations
src/icons.js                  Icônes SVG locales
src/style.css                 Interface et responsive
public/                       Favicon et en-têtes Cloudflare
tests/                        Tests unitaires et parcours navigateur
docs/                         Plan, décisions et guide de livraison
```

## Décision IA

Décision validée le 16 octobre 2026 : **COCO-SSD préentraîné pour le MVP, amélioration métier ensuite**. Nous ne réentraînons pas les poids dans ce MVP. Évaluer des images annotées et régler un seuil de confiance ne constitue pas un entraînement.

Le milestone 2 doit intégrer TensorFlow.js avec COCO-SSD et documenter les dépendances de chargement du modèle. L’application devra restituer uniquement les détections réellement produites pour les équipements autorisés.

| Équipement | Classe COCO-SSD prévue | Limite |
| --- | --- | --- |
| Chaises | `chair` | Objets visibles et suffisamment reconnus |
| Tables et bureaux | `dining table` | Classe approchante, couverture incomplète des bureaux |
| Ordinateurs portables | `laptop` | Objets ouverts/fermés et petits objets potentiellement mal reconnus |
| Écrans | `tv` | Classe approchante, pas une garantie de reconnaissance des moniteurs |
| Tableaux | Aucune | Contrôle manuel |
| Fenêtres | Aucune | Contrôle manuel |

COCO-SSD est un modèle générique capable de produire d’autres classes. La restriction aux équipements, la non-exposition des personnes et les limites de cette restriction devront être vérifiées au milestone 2. Cadrez une salle vide. Ne jamais assimiler un objet non détecté à une absence certaine.

Source du modèle prévu : [TensorFlow.js COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd).

## Suivi et livraison

- [Pilotage et validations](https://github.com/mathiasdart/IA_for_PM/issues/11)
- [Tickets](https://github.com/mathiasdart/IA_for_PM/issues)
- [Plan en trois milestones](docs/ROADMAP.md)
- [Guide Cloudflare Pages](docs/CLOUDFLARE.md)

Cloudflare Pages : `npm run build`, sortie `dist`, racine du dépôt, Node 22. La branche de production prévue est `main`.

**URL publique : non déployée à ce stade.** L’hébergement Cloudflare et la disponibilité en ligne doivent être vérifiés séparément des tests locaux.
