import { mergeRegionPredictions } from './detection-regions.js';

/** Keep original model scores. A laptop display is not a second standalone screen. */
export function mergeDetectors(coco, faster) {
  const result = mergeRegionPredictions([
    ...coco.map((prediction) => ({ ...prediction, model: 'coco-ssd' })), ...faster,
  ]);
  const predictions = result.predictions.filter((prediction) => {
    if (prediction.class !== 'tv') return true;
    const [x, y, w, h] = prediction.bbox;
    return !result.predictions.some((laptop) => {
      if (laptop.class !== 'laptop' || laptop.score < prediction.score) return false;
      const [lx, ly, lw, lh] = laptop.bbox;
      const intersection = Math.max(0, Math.min(x + w, lx + lw) - Math.max(x, lx))
        * Math.max(0, Math.min(y + h, ly + lh) - Math.max(y, ly));
      return intersection / (w * h) >= 0.9;
    });
  });
  return { ...result, predictions };
}
