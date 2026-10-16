import test from 'node:test';
import assert from 'node:assert/strict';
import { measureDetections } from '../scripts/vision-metrics.mjs';

const annotation = { class: 'chair', bbox: [0.1, 0.1, 0.3, 0.3] };
test('une annotation ne peut valider qu’une seule détection et exige la bonne catégorie', () => {
  const result = measureDetections([{ ...annotation, score: 0.9 }, { ...annotation, score: 0.8 }, { ...annotation, class: 'laptop', score: 0.7 }], [annotation]);
  assert.equal(result.truePositives, 1);
  assert.equal(result.falsePositives, 2);
  assert.equal(result.falseNegatives, 0);
  assert.equal(result.precision, 1 / 3);
  assert.equal(result.recall, 1);
});

test('une boîte décalée ne valide pas l’objet et un dénominateur nul est signalé', () => {
  const result = measureDetections([{ ...annotation, bbox: [0.8, 0.8, 0.1, 0.1], score: 0.9 }], [annotation]);
  assert.equal(result.truePositives, 0);
  assert.equal(result.falsePositives, 1);
  assert.equal(result.falseNegatives, 1);
  assert.equal(measureDetections([], []).precision, null);
  assert.equal(measureDetections([], []).recall, null);
});
