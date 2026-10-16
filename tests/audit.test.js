import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAudit } from '../src/audit.js';
import { EQUIPMENT } from '../src/configuration.js';

const expected = Object.fromEntries(EQUIPMENT.map(({ id }) => [id, 0]));
const prediction = (name, score = 0.9) => ({ class: name, score, bbox: [0, 0, 100, 100] });

test('aucune analyse se distingue d’une analyse sans détection', () => {
  assert.equal(buildAudit(null, expected, 0.55), null);
  const audit = buildAudit({ predictions: [] }, expected, 0.55);
  assert.equal(audit.total, 0);
  assert.equal(audit.status, 'no-detection');
  assert.equal(audit.verifiableRules, 4);
});

test('le seuil modifie les vrais comptages et les écarts par catégorie', () => {
  const analysis = { predictions: [prediction('chair', 0.9), prediction('chair', 0.5), prediction('laptop', 0.8)] };
  const configuration = { ...expected, chair: 2, table: 1 };
  const audit = buildAudit(analysis, configuration, 0.55);
  assert.equal(audit.total, 2);
  assert.equal(audit.categories, 2);
  assert.equal(audit.counts.chair, 1);
  assert.equal(audit.rows.find((row) => row.id === 'chair').difference, -1);
  assert.equal(audit.rows.find((row) => row.id === 'chair').status, 'not-seen');
  assert.equal(audit.rows.find((row) => row.id === 'laptop').difference, 1);
  assert.equal(audit.gaps, 3);
  assert.equal(buildAudit(analysis, configuration, 0.45).counts.chair, 2);
  assert.equal(buildAudit(analysis, configuration, 0.95).total, 0);
});

test('les catégories manuelles ne génèrent ni quantité observée ni faux écart', () => {
  const audit = buildAudit({ predictions: [] }, { ...expected, board: 5, window: 8 }, 0.55);
  const board = audit.rows.find((row) => row.id === 'board');
  assert.deepEqual([board.observed, board.difference, board.status], [null, null, 'manual']);
  assert.equal(audit.gaps, 0);
  assert.equal(audit.manualCategories, 2);
});

test('les classes non autorisées et les prédictions invalides ne sont pas comptées', () => {
  const invalid = [prediction('person'), prediction('dog'), prediction('chair', NaN), prediction('chair', 1.1),
    { ...prediction('chair'), bbox: [0, 0, -1, 1] }, { ...prediction('chair'), bbox: [NaN, 0, 1, 1] }];
  assert.equal(buildAudit({ predictions: invalid }, expected, 0.55).total, 0);
});

test('une quantité observée cohérente reste un résultat partiel', () => {
  const audit = buildAudit({ predictions: [prediction('chair')] }, { ...expected, chair: 1 }, 0.55);
  assert.equal(audit.gaps, 0);
  assert.equal(audit.status, 'partial-match');
});

test('une configuration ou un seuil invalide ne produit pas d’audit', () => {
  const analysis = { predictions: [] };
  assert.throws(() => buildAudit(analysis, { ...expected, chair: -1 }, 0.55));
  assert.throws(() => buildAudit(analysis, expected, 0.1));
});
