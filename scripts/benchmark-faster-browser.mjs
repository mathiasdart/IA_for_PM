import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { launchVisionBrowser } from './vision-browser.mjs';
import { measureDetections } from './vision-metrics.mjs';
import { mergeDetectors } from '../src/detection-ensemble.js';

const manifestPath = path.resolve(process.argv[2] ?? '.vision-data/manifest-quality.json');
const manifest = JSON.parse(await readFile(manifestPath));
const baseline = JSON.parse(await readFile('docs/evidence/vision-quality-selected-2026-10-16.json'));
const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
let browser;
try {
  await server.listen(); browser = await launchVisionBrowser();
  const page = await browser.newPage(); page.setDefaultTimeout(240_000);
  page.on('console', (message) => console.log('browser:', message.text().slice(0, 300)));
  page.on('pageerror', (error) => console.log('browser-error:', error.message));
  const outgoing = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:')) outgoing.push({ method: request.method(), url: request.url() }); });
  await page.goto('http://127.0.0.1:5174');
  const loadMs = await page.evaluate(async () => {
    const started = performance.now();
    const { getFasterDetector } = await import('/src/faster-detector.js');
    await getFasterDetector(); return Math.round(performance.now() - started);
  });
  console.log(JSON.stringify({ loaded: true, loadMs }));
  const cases = [];
  for (const item of manifest.cases) {
    await page.locator('#image-input').setInputFiles(path.resolve(path.dirname(manifestPath), item.file));
    await page.locator('#source-badge').filter({ hasText: 'Image prête' }).waitFor();
    const result = await page.evaluate(async (crop) => {
      const { getFasterDetector } = await import('/src/faster-detector.js');
      const frame = document.getElementById('frame'); let canvas = frame;
      if (crop) {
        const [x, y, w, h] = crop; canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(frame.width * w)); canvas.height = Math.max(1, Math.round(frame.height * h));
        canvas.getContext('2d').drawImage(frame, frame.width*x, frame.height*y, frame.width*w, frame.height*h, 0, 0, canvas.width, canvas.height);
      }
      return { ...(await (await getFasterDetector()).detect(canvas)), width: canvas.width, height: canvas.height };
    }, item.crop ?? null);
    const predictions = result.predictions.map((prediction) => ({ ...prediction,
      bbox: prediction.bbox.map((value, i) => value / (i % 2 === 0 ? result.width : result.height)) }));
    const coco = baseline.experiments.find((experiment) => experiment.detailed).cases.find((c) => c.id === item.id);
    const ensemble = mergeDetectors(coco.predictions, predictions);
    const entry = { id: item.id, sourceSha256: item.sourceSha256, crop: item.crop ?? null,
      expected: item.expected, ...result, predictions, ensemble: ensemble.predictions };
    cases.push(entry);
    console.log(JSON.stringify({ case: item.id, inferenceMs: result.inferenceMs, detections: predictions.length }));
  }
  const measurements = [];
  for (const kind of ['predictions', 'ensemble']) for (const threshold of [.2,.3,.4,.55,.65,.75,.85,.95]) {
    const totals = { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
    for (const item of cases) {
      const metrics = measureDetections(item[kind].filter((p) => p.score >= threshold), item.expected);
      for (const key of Object.keys(totals)) totals[key] += metrics[key];
    }
    measurements.push({ kind, threshold, ...totals });
  }
  const result = { at: new Date().toISOString(), kind: 'real-faster-rcnn-browser-benchmark', browser: browser.version(),
    runtime: 'onnxruntime-web 1.23.2', backend: 'wasm', threads: 1, loadMs, dataset: manifest.dataset,
    outgoing, modelManifest: JSON.parse(await readFile('public/models/faster-rcnn/manifest.json')), measurements, cases };
  await writeFile('test-results/faster-browser-benchmark.json', JSON.stringify(result, null, 2) + '\n');
  await writeFile('docs/evidence/faster-browser-2026-10-16.json', JSON.stringify({ ...result,
    postprocessing: 'Same-class NMS IoU >0.5; omit tv >=90% inside a laptop with at least its score; original scores and provenance. Developed on these same exploratory images.' }, null, 2) + '\n');
  console.log(JSON.stringify(measurements));
} finally { await browser?.close(); await server.close(); }
