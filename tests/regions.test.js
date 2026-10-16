import test from 'node:test';
import assert from 'node:assert/strict';
import { detectionRegions, mapRegionPrediction, mergeRegionPredictions } from '../src/detection-regions.js';

test('les zones recouvrent les bords et restent dans la source, y compris avec des dimensions impaires', () => {
  const regions = detectionRegions(1001, 601, true);
  assert.equal(regions.length, 5);
  assert(regions.slice(1).every((r) => r.x >= 0 && r.y >= 0 && r.x + r.width <= 1001 && r.y + r.height <= 601));
  assert.equal(regions[4].x + regions[4].width, 1001);
  assert.equal(regions[4].y + regions[4].height, 601);
  assert(regions[1].x + regions[1].width > regions[2].x);
  assert.equal(detectionRegions(1, 1, true).length, 1);
  assert.equal(detectionRegions(1000, 600, false).length, 1);
});

test('un fragment coupé au bord interne est rejeté sans rejeter les bords naturels ni les petits objets', () => {
  const [full, left, right] = detectionRegions(1000, 800, true);
  const fragment = { class: 'laptop', score: 0.9, bbox: [0, 0, left.width - 1, 300] };
  assert.equal(mapRegionPrediction(fragment, left, 1000, 800), null);
  assert.equal(mapRegionPrediction({ ...fragment, bbox: [1, 0, 500, 300] }, right, 1000, 800), null);
  const natural = mapRegionPrediction({ ...fragment, bbox: [0, 0, 200, 250] }, left, 1000, 800);
  assert.deepEqual(natural.bbox, [0, 0, 200, 250]);
  assert(mapRegionPrediction({ class: 'chair', score: 0.8, bbox: [600, 100, 20, 40] }, left, 1000, 800));
  assert.deepEqual(mapRegionPrediction(fragment, full, 1000, 800), fragment);
});

test('les coordonnées sont replacées dans l’image et les doublons des zones ne gonflent pas le score', () => {
  const region = { x: 400, y: 300, width: 600, height: 500, full: false };
  const mapped = mapRegionPrediction({ class: 'chair', score: 0.8, bbox: [100, 100, 200, 250] }, region, 1000, 800);
  assert.deepEqual(mapped.bbox, [500, 400, 200, 250]);
  const merged = mergeRegionPredictions([mapped, { ...mapped, score: 0.9 },
    { ...mapped, class: 'dining table', score: 0.85 }, { ...mapped, bbox: [0, 0, 50, 50], score: 0.7 }]);
  assert.equal(merged.predictions.length, 3);
  assert.equal(merged.predictions[0].score, 0.9);
  assert.equal(merged.predictions[1].class, 'dining table');
});

test('les morceaux d’un grand portable déjà reconnu ne deviennent pas trois ordinateurs', () => {
  const whole = { class: 'laptop', score: 0.86, bbox: [0, 0, 1000, 880] };
  const fragments = [
    { class: 'laptop', score: 0.9, bbox: [3, 3, 619, 608] },
    { class: 'laptop', score: 0.91, bbox: [378, 2, 619, 617] },
  ];
  const table = { class: 'dining table', score: 0.8, bbox: [0, 0, 800, 600] };
  const result = mergeRegionPredictions([whole, ...fragments, table], {
    fullPredictions: [whole], imageWidth: 1000, imageHeight: 1000,
  });
  assert.deepEqual(result.predictions, [whole, table]);
  const smallChair = { class: 'chair', score: 0.8, bbox: [0, 0, 100, 150] };
  const distinct = { class: 'chair', score: 0.9, bbox: [25, 40, 40, 50] };
  assert.equal(mergeRegionPredictions([smallChair, distinct], {
    fullPredictions: [smallChair], imageWidth: 1000, imageHeight: 1000,
  }).predictions.length, 2);
});
