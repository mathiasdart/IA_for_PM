import { EQUIPMENT, parseQuantity } from './configuration.js';
import { MODEL } from './model-spec.js';

const byClass = new Map(EQUIPMENT.filter((item) => item.modelClass).map((item) => [item.modelClass, item]));

/** Audit one frame only; a matching count is never a room-compliance claim. */
export function buildAudit(analysis, expected, threshold) {
  if (!analysis) return null;
  if (!Number.isFinite(threshold) || threshold < MODEL.minimumScore || threshold > 0.95) throw new Error('Seuil invalide.');
  const predictions = analysis.predictions.filter((prediction) => byClass.has(prediction.class)
    && Number.isFinite(prediction.score) && prediction.score >= threshold && prediction.score <= 1
    && Array.isArray(prediction.bbox) && prediction.bbox.length === 4 && prediction.bbox.every(Number.isFinite)
    && prediction.bbox[0] >= 0 && prediction.bbox[1] >= 0 && prediction.bbox[2] > 0 && prediction.bbox[3] > 0);
  const counts = Object.fromEntries(EQUIPMENT.filter((item) => item.modelClass).map((item) => [item.id, 0]));
  predictions.forEach((prediction) => { counts[byClass.get(prediction.class).id] += 1; });
  const rows = EQUIPMENT.map((item) => {
    const quantity = parseQuantity(expected[item.id]);
    if (quantity === null) throw new Error('Configuration attendue invalide.');
    if (!item.modelClass) return { ...item, expected: quantity, observed: null, difference: null, status: 'manual' };
    const observed = counts[item.id];
    const difference = observed - quantity;
    return { ...item, expected: quantity, observed, difference, status: difference < 0 ? 'not-seen' : difference > 0 ? 'excess' : 'matching' };
  });
  const verifiableRows = rows.filter((row) => row.observed !== null);
  return {
    predictions,
    rows,
    counts,
    total: predictions.length,
    categories: Object.values(counts).filter((count) => count > 0).length,
    verifiableRules: verifiableRows.length,
    gaps: verifiableRows.filter((row) => row.difference !== 0).length,
    manualCategories: rows.filter((row) => row.observed === null).length,
    status: predictions.length === 0 ? 'no-detection' : verifiableRows.some((row) => row.difference !== 0) ? 'review' : 'partial-match',
    threshold,
    truncated: Boolean(analysis.truncated),
  };
}
