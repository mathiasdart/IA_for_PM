import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { MODEL } from '../src/model-spec.js';
import { measureDetections } from './vision-metrics.mjs';
import { launchVisionBrowser } from './vision-browser.mjs';

async function main() {
  if (!process.argv[2]) throw new Error('Usage : npm run evaluate:vision -- /chemin/manifest.json');
  const manifestPath = path.resolve(process.argv[2]);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const threshold = manifest.threshold ?? 0.55;
  if (!Number.isFinite(threshold) || threshold < 0.2 || threshold > 0.95) throw new Error('Seuil attendu entre 0.2 et 0.95.');
  if (!Array.isArray(manifest.cases) || manifest.cases.length < 3) throw new Error('Au moins trois situations annotées sont nécessaires.');
  const classes = new Set(MODEL.classes.map((item) => item.class));
  const validBox = (box) => Array.isArray(box) && box.length === 4
    && box.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && box[2] > 0 && box[3] > 0 && box[0] + box[2] <= 1 && box[1] + box[3] <= 1;
  for (const item of manifest.cases) {
    if (typeof item.id !== 'string' || !item.id || typeof item.file !== 'string' || !Array.isArray(item.expected)) throw new Error('Chaque cas doit définir id, file et expected.');
    if (item.crop && !validBox(item.crop)) throw new Error(`Recadrage invalide pour ${item.id}.`);
    for (const annotation of item.expected) {
      if (!classes.has(annotation.class) || !Array.isArray(annotation.bbox) || annotation.bbox.length !== 4
        || !annotation.bbox.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
        || annotation.bbox[2] <= 0 || annotation.bbox[3] <= 0
        || annotation.bbox[0] + annotation.bbox[2] > 1 || annotation.bbox[1] + annotation.bbox[3] > 1) {
        throw new Error(`Annotation invalide pour ${item.id} : classe autorisée et boîte normalisée [x, y, largeur, hauteur] attendues.`);
      }
    }
    item.resolvedFile = path.resolve(path.dirname(manifestPath), item.file);
    await access(item.resolvedFile);
    item.sha256 = createHash('sha256').update(await readFile(item.resolvedFile)).digest('hex');
    if (item.sourceSha256 && item.sourceSha256 !== item.sha256) throw new Error(`L’image de ${item.id} ne correspond pas à l’empreinte annotée.`);
  }
  if (!manifest.cases.some((item) => item.expected.length > 0)) throw new Error('Le jeu de test doit inclure au moins un équipement annoté.');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
  let browser;
  try {
    await server.listen();
    browser = await launchVisionBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(120_000);
    await page.goto('http://127.0.0.1:5174');
    const results = [];
    for (const item of manifest.cases) {
      await page.locator('#image-input').setInputFiles(item.resolvedFile);
      await page.locator('#source-badge').filter({ hasText: 'Image prête' }).waitFor();
      const result = await page.evaluate(async (crop) => {
        const { getDetector } = await import('/src/detector.js');
        const detector = await getDetector();
        const canvas = document.getElementById('frame');
        const sourceDimensions = [canvas.width, canvas.height];
        if (crop) {
          const [x, y, width, height] = crop;
          const region = document.createElement('canvas');
          region.width = Math.max(1, Math.round(width * canvas.width));
          region.height = Math.max(1, Math.round(height * canvas.height));
          region.getContext('2d').drawImage(canvas, x * canvas.width, y * canvas.height,
            width * canvas.width, height * canvas.height, 0, 0, region.width, region.height);
          canvas.width = region.width; canvas.height = region.height;
          canvas.getContext('2d').drawImage(region, 0, 0);
        }
        return { ...(await detector.detect(canvas)), width: canvas.width, height: canvas.height,
          sourceDimensions, backend: detector.backend };
      }, item.crop ?? null);
      const predictions = result.predictions.filter((prediction) => prediction.score >= threshold).map((prediction) => ({ ...prediction,
        bbox: [prediction.bbox[0] / result.width, prediction.bbox[1] / result.height, prediction.bbox[2] / result.width, prediction.bbox[3] / result.height] }));
      results.push({ id: item.id, sha256: item.sha256, crop: item.crop ?? null, sourceDimensions: result.sourceDimensions,
        width: result.width, height: result.height, expected: item.expected,
        inferenceMs: result.inferenceMs, backend: result.backend, truncated: result.truncated,
        metrics: measureDetections(predictions, item.expected), predictions });
    }
    const totals = results.reduce((sum, item) => ({ truePositives: sum.truePositives + item.metrics.truePositives,
      falsePositives: sum.falsePositives + item.metrics.falsePositives, falseNegatives: sum.falseNegatives + item.metrics.falseNegatives }),
    { truePositives: 0, falsePositives: 0, falseNegatives: 0 });
    const predicted = totals.truePositives + totals.falsePositives;
    const annotated = totals.truePositives + totals.falseNegatives;
    const output = { at: new Date().toISOString(), model: MODEL, dataset: manifest.dataset ?? null,
      threshold, iouThreshold: 0.5, cases: results,
      totals: { ...totals, precision: predicted ? totals.truePositives / predicted : null, recall: annotated ? totals.truePositives / annotated : null,
        meanInferenceMs: results.reduce((sum, item) => sum + item.inferenceMs, 0) / results.length } };
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/vision-evaluation.json', JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output.totals, null, 2));
    console.log('Rapport sans image : test-results/vision-evaluation.json');
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error) => { console.error(`Évaluation non réalisée : ${error.message}`); process.exitCode = 1; });
