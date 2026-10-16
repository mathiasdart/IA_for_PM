import { intersectionOverUnion } from '../src/detection-postprocess.js';

/** Greedy one-to-one matching by confidence, same category, IoU >= 0.5. */
export function measureDetections(predictions, annotations) {
  const matched = new Set();
  let truePositives = 0;
  for (const prediction of [...predictions].sort((a, b) => b.score - a.score)) {
    let best = -1;
    let bestIou = 0.5;
    annotations.forEach((annotation, index) => {
      if (matched.has(index) || annotation.class !== prediction.class) return;
      const overlap = intersectionOverUnion(prediction.bbox, annotation.bbox);
      if (overlap >= bestIou) { best = index; bestIou = overlap; }
    });
    if (best >= 0) { matched.add(best); truePositives += 1; }
  }
  const falsePositives = predictions.length - truePositives;
  const falseNegatives = annotations.length - truePositives;
  return { truePositives, falsePositives, falseNegatives,
    precision: predictions.length ? truePositives / predictions.length : null,
    recall: annotations.length ? truePositives / annotations.length : null };
}
