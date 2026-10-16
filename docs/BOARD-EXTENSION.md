# Extension pour les tableaux

COCO-SSD et Faster R-CNN préentraînés sur COCO ne possèdent pas de classe « tableau blanc » ou « tableau noir ». Le mode combiné conserve donc le contrôle manuel des tableaux. Renommer la classe `tv` créerait une fausse reconnaissance.

Les deux vues de salle fournies montrent le même tableau. Un premier manifeste local décrit deux exemples positifs et deux recadrages négatifs. Les annotations des tableaux restent à relire. Ce jeu ne permet ni entraînement fiable ni validation indépendante : même salle, même session, un seul tableau physique.

`scripts/prepare-board-dataset.py` prépare des images et annotations au format COCO à partir d'un manifeste avec empreintes SHA-256. Chaque cas comporte `file`, `sourceSha256`, `group`, `split`, `reviewed`, éventuellement `crop`, et `expected` (`class: whiteboard`, boîte normalisée `[x,y,largeur,hauteur]`). Les groupes ne peuvent pas être répartis entre entraînement, validation et test. Les sorties restent dans `.vision-data/`, exclu de Git.

```bash
python scripts/prepare-board-dataset.py .vision-data/manifest-boards.json .vision-data/board-dataset --require-ready
```

Le contrôle de préparation exige des annotations relues et des exemples positifs et négatifs dans chaque partition ; il échoue sur le jeu actuel. Cette vérification structurelle ne prouve jamais une qualité suffisante. Voir les preuves [du jeu initial](evidence/board-dataset-seed-2026-10-16.json) et [de sa préparation](evidence/board-dataset-readiness-2026-10-16.json).

Pour poursuivre : collecter des salles et tableaux distincts sous différents angles, avec occlusions, éclairages et surfaces ressemblantes ; annoter et relire les boîtes ; réserver des salles/sessions indépendantes pour validation et test ; entraîner une extension puis mesurer précision, rappel et temps dans le navigateur. Aucun entraînement ni reconnaissance automatique de tableau n'est livré par cette préparation.
