import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { MODEL } from '../src/model-spec.js';
import { launchVisionBrowser } from './vision-browser.mjs';

// Same synthetic PNG as the existing browser fixtures. This is deliberately
// separate from evaluate:vision: no photograph or quality metric is claimed.
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function main() {
  const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
  let browser;
  try {
    await server.listen();
    browser = await launchVisionBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(120_000);
    const requests = [];
    const downloads = [];
    const pending = [];
    page.on('request', (request) => {
      if (request.url().startsWith('https://')) requests.push({ method: request.method(), url: request.url() });
    });
    page.on('response', (response) => {
      if (!response.url().startsWith(new URL('.', MODEL.url).href)) return;
      pending.push((async () => {
        const body = await response.body();
        downloads.push({ url: response.url(), status: response.status(), bytes: body.length, sha256: sha256(body) });
      })());
    });
    await page.goto('http://127.0.0.1:5174');
    assert.equal(requests.length, 0, 'Le modèle doit être chargé à la demande.');
    await page.locator('#image-input').setInputFiles({ name: 'runtime-only.png', mimeType: 'image/png', buffer: pixel });
    await page.locator('#source-badge').filter({ hasText: 'Image prête' }).waitFor();
    const started = Date.now();
    await page.locator('#analyze').click();
    await page.locator('#model-label').filter({ hasText: 'Modèle prêt' }).waitFor();
    await page.locator('#metric-total').filter({ hasText: /^\d+$/ }).waitFor();
    const firstAnalysisMs = Date.now() - started;
    const runs = await page.evaluate(async () => {
      const { getDetector } = await import('/src/detector.js');
      const detector = await getDetector();
      const canvas = document.getElementById('frame');
      const results = [];
      for (let i = 0; i < 2; i += 1) results.push(await detector.detect(canvas));
      return { backend: detector.backend, results };
    });
    await page.locator('#confidence').fill('95');
    const at95 = await page.locator('#metric-total').textContent();
    await page.locator('#expected-chair').fill('1');
    const ui = {
      totalAt95: Number(at95),
      chairDifference: await page.locator('[data-equipment="chair"] .difference-value').textContent(),
      boardStatus: await page.locator('[data-equipment="board"] .verification-value').textContent(),
      windowStatus: await page.locator('[data-equipment="window"] .verification-value').textContent(),
      conclusion: await page.locator('#audit-status-description').textContent(),
    };
    assert.equal(ui.totalAt95, 0);
    assert.equal(ui.chairDifference, '-1');
    assert.match(ui.boardStatus, /Contrôle manuel/);
    assert.match(ui.windowStatus, /Contrôle manuel/);
    assert.match(ui.conclusion, /ne prouve aucune absence/);
    assert(requests.length > 1);
    assert(requests.every((request) => request.method === 'GET' && request.url.startsWith(new URL('.', MODEL.url).href)));
    await Promise.all(pending);
    assert(downloads.every((item) => item.status === 200));
    const output = {
      at: new Date().toISOString(), kind: 'runtime-smoke-synthetic-input', recognitionQualityMeasured: false,
      model: MODEL, browser: browser.version(), backend: runs.backend,
      input: { description: 'PNG synthétique 1 × 1 des fixtures navigateur existantes ; aucune photographie', sha256: sha256(pixel) },
      firstAnalysisMs, runs: runs.results, ui, requests,
      downloads: downloads.sort((a, b) => a.url.localeCompare(b.url)),
    };
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/vision-runtime.json', JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ kind: output.kind, recognitionQualityMeasured: false, backend: output.backend,
      firstAnalysisMs, inferenceMs: runs.results.map((run) => run.inferenceMs), modelFiles: downloads.length }));
    console.log('Preuve du runtime uniquement : test-results/vision-runtime.json');
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error) => { console.error(`Vérification du runtime échouée : ${error.message}`); process.exitCode = 1; });
