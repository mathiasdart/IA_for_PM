import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuantity, exampleConfiguration, validateImageFile, cameraErrorMessage } from '../src/configuration.js';

test('les quantités acceptent uniquement des entiers de 0 à 999', () => {
  for (const value of ['', '-1', '1.5', '1e2', '1000', 'abc', null, undefined]) assert.equal(parseQuantity(value), null);
  assert.equal(parseQuantity('0'), 0);
  assert.equal(parseQuantity('999'), 999);
  assert.equal(parseQuantity('20'), 20);
});

test('chaque configuration d’exemple peut être modifiée indépendamment', () => {
  const first = exampleConfiguration();
  first.chair = 99;
  assert.equal(exampleConfiguration().chair, 20);
});

test('les images vides, trop lourdes et les types non pris en charge sont refusés', () => {
  assert.ok(validateImageFile({ type: 'image/png', size: 0 }));
  assert.ok(validateImageFile({ type: 'image/png', size: 15 * 1024 * 1024 + 1 }));
  assert.ok(validateImageFile({ type: 'image/svg+xml', size: 100 }));
  assert.ok(validateImageFile({ type: 'text/html', size: 100 }));
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) assert.equal(validateImageFile({ type, size: 1024 }), null);
});

test('les erreurs caméra expliquent une action possible', () => {
  assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /refusé/);
  assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /Aucune caméra/);
  assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /autres applications/);
  assert.match(cameraErrorMessage({ name: 'UnknownError' }), /importez une image/);
});
