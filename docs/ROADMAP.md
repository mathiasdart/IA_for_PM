# Roadmap et critères de passage

Produit : aide B2B au contrôle des équipements d’une salle. Le cahier des charges initial fixe le périmètre fonctionnel. Le produit doit être crédible pour un responsable de site et explicite sur ses limites.

Référence de suivi : [issue de pilotage #11](https://github.com/mathiasdart/IA_for_PM/issues/11). Les tickets font foi pour l’état courant et les preuves de validation.

## M1 — Interface et configuration de la salle

Objectif : application utilisable, prête à recevoir la détection.

| Ticket | Priorité | Contenu |
| --- | --- | --- |
| [#1](https://github.com/mathiasdart/IA_for_PM/issues/1) | P0 | Socle frontend et lancement reproductible |
| [#2](https://github.com/mathiasdart/IA_for_PM/issues/2) | P0 | Interface B2B responsive et accessible |
| [#3](https://github.com/mathiasdart/IA_for_PM/issues/3) | P0 | Import d’image et cycle de vie webcam |
| [#4](https://github.com/mathiasdart/IA_for_PM/issues/4) | P0 | Référentiel configurable et capacités du modèle |

Validation : lancement local et build ; vues de 1440, 768 et 390 px ; import valide/invalide ; démarrage/arrêt/refus webcam ; configuration modifiable ; aucun résultat fictif. Contrôles automatisés avec médias synthétiques, complétés par une recette manuelle avec webcam physique.

Passage : validation explicite du propriétaire de l’interface et du parcours avant M2.

## M2 — Détection réelle et audit

Objectif : observations réelles et conclusions interprétables.

| Ticket | Priorité | Contenu |
| --- | --- | --- |
| [#5](https://github.com/mathiasdart/IA_for_PM/issues/5) | P0 | COCO-SSD préentraîné, cadres, scores et restriction aux équipements |
| [#6](https://github.com/mathiasdart/IA_for_PM/issues/6) | P0 | Seuil, comptages, écarts et indicateurs |
| [#7](https://github.com/mathiasdart/IA_for_PM/issues/7) | P0 | Jeu annoté, trois situations et parcours d’erreur |

Validation : équipements visibles, occlusions/vue partielle et aucune détection exploitable ; cadres et compteurs cohérents ; seuil fonctionnel ; tests des calculs ; nouvelle tentative après échec de chargement. Les tests IA réels sont distingués des simulations.

Passage : validation explicite de la détection et des conclusions avant M3.

Décision du 16 octobre 2026 : COCO-SSD déjà entraîné, sans entraînement ou fine-tuning dans le MVP. Évaluation et calibration du seuil ; amélioration métier après le MVP, cadrée séparément.

## M3 — Rapport et livrables projet

Objectif : version démontrable, documentée et livrable.

| Ticket | Priorité | Contenu |
| --- | --- | --- |
| [#8](https://github.com/mathiasdart/IA_for_PM/issues/8) | P0 | Rapport, Markdown et impression/PDF sans image |
| [#9](https://github.com/mathiasdart/IA_for_PM/issues/9) | P0 | Cadrage, architecture, backlog, KPI, risques et tests |
| [#10](https://github.com/mathiasdart/IA_for_PM/issues/10) | P1 | CI, recette et préparation Cloudflare Pages |

Validation : rapport cohérent avec l’audit et ses réserves ; installation propre ; tests et compilation ; parcours source → détection → audit → rapport ; preuves et limites documentées.

Le propriétaire a demandé à préparer Cloudflare dès M1 pour vérifier l’hébergement tôt. Cela ne valide pas les fonctions de M2/M3 et ne change pas leurs points de passage.

## Règles de suivi

- Priorité P0 : indispensable à la recette ; P1 : livraison et exploitation.
- Ticket ouvert : à faire, en cours ou en recette, précisé dans sa description.
- Un ticket est clôturé uniquement avec des preuves pour ses critères d’acceptation.
- Une livraison technique ne vaut pas validation du milestone par le propriétaire.
- Les milestones natifs restent à créer lorsque l’accès API GitHub le permet ; les sections ci-dessus ne les remplacent pas.
