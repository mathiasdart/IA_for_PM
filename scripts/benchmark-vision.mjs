import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { MODEL, MODEL_VARIANTS } from '../src/model-spec.js';
import { measureDetections } from './vision-metrics.mjs';
import { launchVisionBrowser } from './vision-browser.mjs';
import { REGION_POLICY } from '../src/detection-regions.js';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const thresholds = [0.2, 0.3, 0.4, 0.55, 0.65];

function summarize(cases, threshold, category) {
  const totals = { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
  for (const item of cases) {
    const predictions = item.predictions.filter((p) => p.score >= threshold && (!category || p.class === category));
    const expected = item.expected.filter((p) => !category || p.class === category);
    const metrics = measureDetections(predictions, expected);
    for (const key of Object.keys(totals)) totals[key] += metrics[key];
  }
  const predicted = totals.truePositives + totals.falsePositives;
  const expected = totals.truePositives + totals.falseNegatives;
  return { ...totals, precision: predicted ? totals.truePositives / predicted : null,
    recall: expected ? totals.truePositives / expected : null };
}

async function main() {
  if (!process.argv[2]) throw new Error('Usage : npm run benchmark:vision -- chemin/manifest.json');
  const manifestPath = path.resolve(process.argv[2]);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const selected = process.argv.slice(3).find((value) => value.startsWith('--base='))?.slice(7);
  if (selected && !Object.hasOwn(MODEL_VARIANTS, selected)) throw new Error('Variante inconnue.');
  for (const item of manifest.cases) {
    item.resolvedFile = path.resolve(path.dirname(manifestPath), item.file);
    item.sha256 = sha256(await readFile(item.resolvedFile));
    if (!item.sourceSha256 || item.sourceSha256 !== item.sha256) throw new Error(`Empreinte annotée incorrecte pour ${item.id}.`);
  }
  const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
  const experiments = [];
  const downloads = [];
  let browser;
  try {
    await server.listen();
    for (const base of selected ? [selected] : Object.keys(MODEL_VARIANTS)) {
      browser = await launchVisionBrowser();
      const page = await browser.newPage();
      page.setDefaultTimeout(180_000);
      const pending = [];
      page.on('response', (response) => {
        if (!response.url().startsWith(new URL('.', MODEL_VARIANTS[base]).href)) return;
        pending.push((async () => {
          const body = await response.body();
          downloads.push({ base, url: response.url(), status: response.status(), bytes: body.length, sha256: sha256(body) });
        })().catch((error) => { downloads.push({ base, url: response.url(), error: error.message }); }));
      });
      await page.goto('http://127.0.0.1:5174');
      await page.locator('#image-input').setInputFiles(manifest.cases[0].resolvedFile);
      await page.locator('#source-badge').filter({ hasText: 'Image prête' }).waitFor();
      const loadStarted = Date.now();
      const warmup = await page.evaluate(async (base) => {
        const { getDetector } = await import('/src/detector.js');
        const detector = await getDetector(undefined, { base });
        return detector.detect(document.getElementById('frame'));
      }, base);
      const loadAndWarmupMs = Date.now() - loadStarted;
      for (const detailed of [false, true]) {
        const cases = [];
        for (const item of manifest.cases) {
          await page.locator('#image-input').setInputFiles(item.resolvedFile);
          await page.locator('#source-badge').filter({ hasText: 'Image prête' }).waitFor();
          const result = await page.evaluate(async ({ base, detailed, crop }) => {
            const { getDetector } = await import('/src/detector.js');
            const detector = await getDetector(undefined, { base });
            const frame = document.getElementById('frame');
            let canvas = frame;
            if (crop) {
              const [x, y, w, h] = crop;
              canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(frame.width * w));
              canvas.height = Math.max(1, Math.round(frame.height * h));
              canvas.getContext('2d').drawImage(frame, frame.width * x, frame.height * y,
                frame.width * w, frame.height * h, 0, 0, canvas.width, canvas.height);
            }
            return { ...(await detector.detect(canvas, { detailed })), width: canvas.width, height: canvas.height,
              backend: detector.backend };
          }, { base, detailed, crop: item.crop ?? null });
          cases.push({ id: item.id, sourceSha256: item.sha256, crop: item.crop ?? null, expected: item.expected,
            ...result, predictions: result.predictions.map((p) => ({ ...p,
              bbox: p.bbox.map((value, i) => value / (i % 2 === 0 ? result.width : result.height)) })) });
        }
        const byThreshold = thresholds.map((threshold) => ({ threshold, totals: summarize(cases, threshold),
          byClass: Object.fromEntries(MODEL.classes.map((c) => [c.class, summarize(cases, threshold, c.class)])) }));
        const experiment = { base, detailed, browser: browser.version(), loadAndWarmupMs,
          warmupInferenceMs: warmup.inferenceMs, meanInferenceMs: cases.reduce((s, c) => s + c.inferenceMs, 0) / cases.length,
          byThreshold, cases };
        experiments.push(experiment);
        console.log(JSON.stringify({ base, detailed, meanInferenceMs: experiment.meanInferenceMs,
          thresholds: byThreshold.map(({ threshold, totals }) => ({ threshold, ...totals })) }));
      }
      await Promise.all(pending);
      await browser.close(); browser = undefined;
    }
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/vision-benchmark.json', JSON.stringify({ at: new Date().toISOString(),
      kind: 'exploratory-development-benchmark', manifestSha256: sha256(manifestBytes), dataset: manifest.dataset,
      modelRules: MODEL, regionPolicy: REGION_POLICY, experiments, downloads }, null, 2) + '\n');
  } finally {
    await browser?.close(); await server.close();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
