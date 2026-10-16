import { test, expect } from '@playwright/test';
import { equipmentGraph } from '../fixtures/equipment-graph.js';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const predictions = [
  { class: 'chair', score: 0.9, bbox: [0, 0, 1, 1] },
  { class: 'chair', score: 0.5, bbox: [0, 0, 1, 1] },
  { class: 'laptop', score: 0.8, bbox: [0, 0, 1, 1] },
  { class: 'person', score: 0.99, bbox: [0, 0, 1, 1] },
];

async function prepare(page, code) {
  // Test-only module interception. The product contains no mock detector.
  await page.route(/\/src\/detector\.js(?:\?.*)?$/, (route) => route.fulfill({ contentType: 'application/javascript', body: code }));
  await page.goto('/');
  await page.locator('#image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: pixel });
  await expect(page.locator('#source-badge')).toHaveText('Image prête');
}

function detector(result = predictions) {
  return `export async function getDetector(progress){progress({progress:1});return {async detect(){return {predictions:${JSON.stringify(result)},inferenceMs:12,truncated:false}}}}`;
}

test('prédictions, cadres, compteurs et seuil restent cohérents', async ({ page }) => {
  await prepare(page, detector());
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('2');
  await expect(page.locator('#metric-categories')).toHaveText('2');
  await expect(page.locator('#metric-rules')).toHaveText('4');
  await expect(page.locator('#metric-gaps')).toHaveText('3');
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#detections')).toContainText('90 %');
  await expect(page.locator('#detections')).not.toContainText('person');
  await page.locator('#confidence').fill('45');
  await expect(page.locator('#metric-total')).toHaveText('3');
  await expect(page.locator('#configuration-rows tr[data-equipment="chair"] .observed-value')).toHaveText('2');
  await page.locator('#confidence').fill('95');
  await expect(page.locator('#metric-total')).toHaveText('0');
  await expect(page.locator('#audit-status-title')).toContainText('Aucun équipement reconnu');
  await expect(page.locator('#overlay')).toBeHidden();
});

test('modifier le référentiel recalcule les écarts et une nouvelle source efface l’audit', async ({ page }) => {
  await prepare(page, detector());
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('2');
  await page.locator('#expected-chair').fill('1');
  await expect(page.locator('#metric-gaps')).toHaveText('2');
  await page.locator('#expected-board').fill('99');
  await expect(page.locator('#metric-gaps')).toHaveText('2');
  await expect(page.locator('#configuration-rows tr[data-equipment="board"] .observed-value')).toHaveText('—');
  await page.locator('#tab-camera').click();
  await expect(page.locator('#metric-total')).toHaveText('—');
  await expect(page.locator('#overlay')).toBeHidden();
});

test('changer le mode invalide les résultats et la nouvelle analyse utilise le mode choisi', async ({ page }) => {
  await prepare(page, `export async function getDetector(){return {async detect(canvas,options){window.__analysisMode=options.detailed;return {predictions:[],inferenceMs:1,regions:options.detailed?5:1}}}}`);
  await expect(page.locator('#analysis-mode')).toHaveValue('detailed');
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('0');
  expect(await page.evaluate(() => window.__analysisMode)).toBe(true);
  await page.locator('#analysis-mode').selectOption('quick');
  await expect(page.locator('#metric-total')).toHaveText('—');
  await expect(page.locator('#notification')).toContainText('Relancez l’analyse');
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('0');
  expect(await page.evaluate(() => window.__analysisMode)).toBe(false);
});

test('un modèle indisponible ne produit aucun résultat et permet de réessayer', async ({ page }) => {
  await prepare(page, `let n=0;export async function getDetector(){if(n++===0)throw Error('Network');return {async detect(){return {predictions:[],inferenceMs:1}}}}`);
  await page.locator('#analyze').click();
  await expect(page.locator('#notification')).toContainText('Impossible de charger le modèle');
  await expect(page.locator('#metric-total')).toHaveText('—');
  await page.locator('#retry-model').click();
  await expect(page.locator('#metric-total')).toHaveText('0');
  await expect(page.locator('#model-label')).toContainText('Modèle prêt');
});

test('le mode combiné fusionne les doublons et indique la provenance des scores', async ({ page }) => {
  await page.route(/\/src\/faster-detector\.js(?:\?.*)?$/, (route) => route.fulfill({
    contentType: 'application/javascript', body: `export async function getFasterDetector(){return {
      async detect(){return {predictions:[{class:'chair',score:.95,bbox:[0,0,1,1],model:'faster-rcnn'}],inferenceMs:25}},
      dispose(){window.__fasterDisposed=true}}}`,
  }));
  await prepare(page, detector());
  await page.locator('#analysis-mode').selectOption('hybrid');
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('2');
  await expect(page.locator('#detections')).toContainText('95 % (Faster R-CNN)');
  await expect(page.locator('#analysis-meta')).toContainText('COCO-SSD détaillé + Faster R-CNN');
  await page.locator('#analysis-mode').selectOption('quick');
  await expect(page.locator('#metric-total')).toHaveText('—');
  expect(await page.evaluate(() => window.__fasterDisposed)).toBe(true);
});

test('un échec Faster R-CNN ne présente pas COCO seul comme un résultat combiné', async ({ page }) => {
  await page.route(/\/src\/faster-detector\.js(?:\?.*)?$/, (route) => route.fulfill({
    contentType: 'application/javascript', body: `export async function getFasterDetector(){throw Error('WASM memory');}`,
  }));
  await prepare(page, detector());
  await page.locator('#analysis-mode').selectOption('hybrid');
  await page.locator('#analyze').click();
  await expect(page.locator('#notification')).toContainText('Le mode combiné a échoué');
  await expect(page.locator('#metric-total')).toHaveText('—');
  await page.locator('#analysis-mode').selectOption('quick');
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('2');
});

test('aucune détection ne prouve pas l’absence et les catégories manuelles restent séparées', async ({ page }) => {
  await prepare(page, detector([]));
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('0');
  await expect(page.locator('#audit-status-description')).toContainText('ne prouve aucune absence');
  await expect(page.locator('#configuration-rows tr[data-equipment="chair"] .verification-value')).toContainText('non vus');
  await expect(page.locator('#configuration-rows tr[data-equipment="board"] .verification-value')).toContainText('Contrôle manuel');
});

test('un résultat qui arrive après un nouvel audit est ignoré', async ({ page }) => {
  await prepare(page, `export async function getDetector(){return {detect(){return new Promise(resolve=>{window.__finishDetection=()=>resolve({predictions:${JSON.stringify(predictions)},inferenceMs:1})})}}}`);
  await page.locator('#analyze').click();
  await expect.poll(() => page.evaluate(() => typeof window.__finishDetection)).toBe('function');
  await page.locator('#reset').click();
  await page.evaluate(() => window.__finishDetection());
  await expect(page.locator('#analyzing-overlay')).toBeHidden();
  await expect(page.locator('#metric-total')).toHaveText('—');
  await expect(page.locator('#source-badge')).toHaveText('Aucune source');
});

test('une capture webcam arrête le flux et les résultats portent sur cette image figée', async ({ page }) => {
  await page.addInitScript(() => {
    window.__stopped = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      canvas.getContext('2d').fillRect(0, 0, 640, 360);
      const stream = canvas.captureStream(5);
      const track = stream.getTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => { window.__stopped += 1; stop(); };
      return stream;
    };
  });
  await prepare(page, detector());
  await page.locator('#tab-camera').click();
  await page.locator('#start-camera').click();
  await expect(page.locator('#source-badge')).toHaveText('Caméra active');
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('2');
  await expect(page.locator('#source-badge')).toHaveText('Capture figée');
  await expect(page.locator('#camera')).toBeHidden();
  expect(await page.evaluate(() => window.__stopped)).toBe(1);
  await expect(page.locator('#frame')).toBeVisible();
  await expect(page.locator('#analysis-meta')).toContainText('Capture webcam');
});

test('une quantité en cours de saisie invalide suspend la comparaison sans faux audit', async ({ page }) => {
  await prepare(page, detector());
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('2');
  await page.locator('#expected-chair').fill('-1');
  await expect(page.locator('#analyze')).toBeDisabled();
  await expect(page.locator('#metric-total')).toHaveText('—');
  await expect(page.locator('#audit-status-title')).toHaveText('Configuration à corriger');
  await page.locator('#expected-chair').fill('1');
  await expect(page.locator('#metric-total')).toHaveText('2');
});

test('le vrai runtime TensorFlow charge à la demande et explique un téléchargement bloqué', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://storage.googleapis.com/**', async (route) => {
    requests.push({ method: route.request().method(), url: route.request().url() });
    await route.abort('internetdisconnected');
  });
  await page.goto('/');
  await page.locator('#image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: pixel });
  expect(requests).toEqual([]);
  await page.locator('#analyze').click();
  await expect(page.locator('#model-label')).toContainText('n’a pas pu être chargé', { timeout: 30000 });
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((request) => request.method === 'GET')).toBe(true);
  await expect(page.locator('#metric-total')).toHaveText('—');
  await expect(page.locator('#retry-model')).toBeVisible();
  expect(errors).toEqual([]);
});

test('TensorFlow exécute un graphe synthétique avec coordonnées et libération des tenseurs', async ({ page }) => {
  const fixture = equipmentGraph();
  const requests = [];
  let runtimeUrl;
  page.on('request', (request) => { if (request.url().includes('/.vite/deps/@tensorflow_tfjs.js')) runtimeUrl = request.url(); });
  await page.route('https://storage.googleapis.com/**', async (route) => {
    requests.push(route.request().method());
    const weights = route.request().url().endsWith('.bin');
    await route.fulfill({ contentType: weights ? 'application/octet-stream' : 'application/json',
      body: weights ? fixture.weights : JSON.stringify(fixture.manifest), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/');
  await page.locator('#image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: pixel });
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('2', { timeout: 30000 });
  await expect(page.locator('#model-label')).toContainText('Modèle prêt');
  expect(runtimeUrl).toBeTruthy();
  const metrics = await page.evaluate(async (url) => {
    const tf = await import(url);
    const { getDetector } = await import('/src/detector.js');
    const detector = await getDetector();
    const before = tf.memory().numTensors;
    const result = await detector.detect(document.getElementById('frame'));
    return { before, after: tf.memory().numTensors, predictions: result.predictions };
  }, runtimeUrl);
  expect(metrics.after).toBe(metrics.before);
  expect(metrics.predictions.map((item) => item.class)).toEqual(['chair', 'laptop']);
  expect(metrics.predictions[0].bbox[0]).toBeCloseTo(0.1);
  const detailedMetrics = await page.evaluate(async (url) => {
    const tf = await import(url);
    const { getDetector } = await import('/src/detector.js');
    const detector = await getDetector();
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 800;
    const before = tf.memory().numTensors;
    const result = await detector.detect(canvas, { detailed: true });
    await detector.detect(canvas, { detailed: true });
    return { before, after: tf.memory().numTensors, regions: result.regions };
  }, runtimeUrl);
  expect(detailedMetrics.regions).toBe(5);
  expect(detailedMetrics.after).toBe(detailedMetrics.before);
  expect(requests.every((method) => method === 'GET')).toBe(true);
});
