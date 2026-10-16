import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDetectors } from '../src/detection-ensemble.js';

test('deux modèles ne comptent qu’une chaise commune et conservent le score et la provenance', () => {
  const box = [10, 20, 100, 150];
  const result = mergeDetectors([{ class: 'chair', score: .8, bbox: box }],
    [{ class: 'chair', score: .9, bbox: box, model: 'faster-rcnn' },
      { class: 'chair', score: .7, bbox: [200, 20, 100, 150], model: 'faster-rcnn' }]);
  assert.equal(result.predictions.length, 2);
  assert.equal(result.predictions[0].score, .9);
  assert.equal(result.predictions[0].model, 'faster-rcnn');
});

test('l’écran contenu dans un portable plus certain ne devient pas un équipement séparé', () => {
  const laptop = { class: 'laptop', score: .98, bbox: [0, 0, 200, 200], model: 'faster-rcnn' };
  const display = { class: 'tv', score: .8, bbox: [10, 10, 180, 80], model: 'faster-rcnn' };
  const monitor = { ...display, bbox: [250, 0, 200, 200] };
  const table = { class: 'dining table', score: .9, bbox: [0, 0, 220, 220] };
  assert.deepEqual(mergeDetectors([table], [laptop, display, monitor]).predictions,
    [laptop, { ...table, model: 'coco-ssd' }, monitor]);
  assert.equal(mergeDetectors([], [{ ...laptop, score: .7 }, display]).predictions.length, 2);
});
