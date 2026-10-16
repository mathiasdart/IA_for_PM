import test from 'node:test';
import assert from 'node:assert/strict';
import { postprocess, intersectionOverUnion } from '../src/detection-postprocess.js';

function input(candidates) {
  const scores = new Float32Array(candidates.length * 90);
  const boxes = new Float32Array(candidates.length * 4);
  candidates.forEach(({ index, score, box }, i) => { scores[i * 90 + index] = score; boxes.set(box ?? [0, 0, 1, 1], i * 4); });
  return { scores, boxes, numBoxes: candidates.length, numClasses: 90, width: 1000, height: 500 };
}

test('les index COCO clairsemés mappent les quatre équipements, pas les personnes', () => {
  const data = input([{ index: 0, score: 0.99 }, { index: 61, score: 0.95 }, { index: 66, score: 0.9 }, { index: 71, score: 0.85 }, { index: 72, score: 0.8 }]);
  const result = postprocess(data);
  assert.deepEqual(result.predictions.map((p) => p.class), ['chair', 'dining table', 'tv', 'laptop']);
  assert.equal(result.truncated, false);
});

test('la suppression des doublons garde les équipements qui se chevauchent de classes différentes', () => {
  const data = input([{ index: 61, score: 0.9 }, { index: 61, score: 0.8 }, { index: 66, score: 0.7 }]);
  const result = postprocess(data);
  assert.deepEqual(result.predictions.map((p) => p.class), ['chair', 'dining table']);
  assert.equal(intersectionOverUnion([0, 0, 10, 10], [0, 0, 10, 10]), 1);
});

test('les boîtes sont converties depuis les coordonnées normalisées et bornées', () => {
  const result = postprocess(input([{ index: 72, score: 0.9, box: [0, -1, 0.5, 2] }]));
  assert.deepEqual(result.predictions[0].bbox, [0, 0, 1000, 250]);
});

test('scores trop faibles, boîtes invalides et formats de modèle inattendus sont refusés', () => {
  const data = input([{ index: 61, score: 0.19 }, { index: 72, score: 0.8, box: [1, 1, 0, 0] }]);
  assert.equal(postprocess(data).predictions.length, 0);
  assert.throws(() => postprocess({ ...data, numClasses: 80 }), /incompatible/);
});

test('la limite de cent détections est explicitement signalée', () => {
  const data = input(Array.from({ length: 101 }, (_, i) => ({ index: 61, score: 0.9, box: [0, i / 101, 0.01, (i + 0.5) / 101] })));
  const result = postprocess(data);
  assert.equal(result.predictions.length, 100);
  assert.equal(result.truncated, true);
});
