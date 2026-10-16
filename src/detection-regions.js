import { intersectionOverUnion } from './detection-postprocess.js';
import { MODEL } from './model-spec.js';

export const REGION_POLICY = Object.freeze({ tileFraction: 0.625, minimumBorderPixels: 2,
  largeFullViewArea: 0.4, containedFraction: 0.9, minimumAreaRatio: 1.5 });

/** Full view plus four overlapping views. Coordinates are integer source pixels. */
export function detectionRegions(width, height, detailed = false) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Dimensions invalides.');
  const full = { x: 0, y: 0, width, height, full: true };
  // Very small media cannot gain spatial information from further subdivision.
  if (!detailed || Math.min(width, height) < 300) return [full];
  const tileWidth = Math.ceil(width * REGION_POLICY.tileFraction);
  const tileHeight = Math.ceil(height * REGION_POLICY.tileFraction);
  return [full, ...[0, height - tileHeight].flatMap((y) => [0, width - tileWidth].map((x) => ({
    x, y, width: tileWidth, height: tileHeight, full: false,
  })))];
}

/** Reject fragments cut by an internal tile edge, retaining natural image edges. */
export function mapRegionPrediction(prediction, region, width, height) {
  const [x, y, w, h] = prediction.bbox;
  const marginX = REGION_POLICY.minimumBorderPixels;
  const marginY = REGION_POLICY.minimumBorderPixels;
  if (!region.full && ((region.x > 0 && x <= marginX) || (region.y > 0 && y <= marginY)
    || (region.x + region.width < width && x + w >= region.width - marginX)
    || (region.y + region.height < height && y + h >= region.height - marginY))) return null;
  return { ...prediction, bbox: [x + region.x, y + region.y, w, h] };
}

/** Merge views without adding or averaging scores; preserve cross-class overlap. */
export function mergeRegionPredictions(predictions, { fullPredictions = [], imageWidth = 0, imageHeight = 0 } = {}) {
  const candidates = predictions.filter((prediction) => {
    if (fullPredictions.includes(prediction)) return true;
    const [x, y, w, h] = prediction.bbox;
    return !fullPredictions.some((anchor) => {
      if (anchor.class !== prediction.class) return false;
      const [ax, ay, aw, ah] = anchor.bbox;
      if (aw * ah < imageWidth * imageHeight * REGION_POLICY.largeFullViewArea
        || aw * ah < w * h * REGION_POLICY.minimumAreaRatio) return false;
      const intersection = Math.max(0, Math.min(x + w, ax + aw) - Math.max(x, ax))
        * Math.max(0, Math.min(y + h, ay + ah) - Math.max(y, ay));
      return intersection / (w * h) > REGION_POLICY.containedFraction;
    });
  });
  const retained = [];
  for (const prediction of [...candidates].sort((a, b) => b.score - a.score)) {
    if (!retained.some((other) => other.class === prediction.class
      && intersectionOverUnion(other.bbox, prediction.bbox) > MODEL.iouThreshold)) retained.push(prediction);
  }
  return { predictions: retained.slice(0, MODEL.maximumDetections), truncated: retained.length > MODEL.maximumDetections };
}
