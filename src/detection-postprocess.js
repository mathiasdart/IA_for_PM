import { MODEL } from './model-spec.js';

export function intersectionOverUnion(a, b) {
  const intersection = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]))
    * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const union = a[2] * a[3] + b[2] * b[3] - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Only equipment score columns are read; other categories are never returned. */
export function postprocess({ scores, boxes, numBoxes, numClasses, width, height }) {
  if (numClasses !== 90 || scores.length !== numBoxes * numClasses || boxes.length !== numBoxes * 4
    || !Number.isInteger(numBoxes) || numBoxes <= 0 || width <= 0 || height <= 0) {
    throw new Error('La structure du modèle COCO-SSD est incompatible.');
  }
  const candidates = [];
  for (let i = 0; i < numBoxes; i += 1) {
    let best = null;
    let score = MODEL.minimumScore;
    for (const category of MODEL.classes) {
      const candidateScore = scores[i * numClasses + category.scoreIndex];
      if (Number.isFinite(candidateScore) && candidateScore >= score && candidateScore <= 1) {
        best = category;
        score = candidateScore;
      }
    }
    if (!best) continue;
    const [y0, x0, y1, x1] = boxes.slice(i * 4, i * 4 + 4);
    if (![y0, x0, y1, x1].every(Number.isFinite)) continue;
    const left = Math.max(0, Math.min(1, x0));
    const top = Math.max(0, Math.min(1, y0));
    const right = Math.max(0, Math.min(1, x1));
    const bottom = Math.max(0, Math.min(1, y1));
    if (right <= left || bottom <= top) continue;
    candidates.push({ class: best.class, score, bbox: [left * width, top * height, (right - left) * width, (bottom - top) * height] });
  }
  candidates.sort((a, b) => b.score - a.score);
  // Per-class NMS preserves a laptop placed on a table even when boxes overlap.
  const retained = [];
  for (const candidate of candidates) {
    if (!retained.some((other) => other.class === candidate.class && intersectionOverUnion(other.bbox, candidate.bbox) > MODEL.iouThreshold)) {
      retained.push(candidate);
    }
  }
  return { predictions: retained.slice(0, MODEL.maximumDetections), truncated: retained.length > MODEL.maximumDetections };
}
