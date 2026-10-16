import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { preview } from 'vite';
import { launchVisionBrowser } from './vision-browser.mjs';

const server = await preview({ preview: { host: '127.0.0.1', port: 5175, strictPort: true } });
let browser;
try {
  browser = await launchVisionBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(240_000);
  const requests = [];
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));
  await page.goto('http://127.0.0.1:5175');
  await page.locator('#analysis-mode').selectOption('hybrid');
  await page.locator('#image-input').setInputFiles('.vision-data/vue-paysage.jpg');
  await page.locator('#source-badge').filter({ hasText: 'Image prête' }).waitFor();
  const started = Date.now();
  await page.locator('#analyze').click();
  await page.locator('#analyzing-overlay').waitFor({ state: 'hidden' });
  const total55 = Number(await page.locator('#metric-total').textContent());
  const measured = JSON.parse(await readFile('docs/evidence/faster-browser-2026-10-16.json'));
  const expected = measured.cases.find((item) => item.id === 'equipements-visibles').ensemble.filter((p) => p.score >= .55).length;
  assert.equal(total55, expected);
  assert(await page.locator('#overlay').isVisible());
  assert.match(await page.locator('#analysis-meta').textContent(), /COCO-SSD détaillé \+ Faster R-CNN/);
  assert.match(await page.locator('#detections').textContent(), /Faster R-CNN/);
  const durationMs = Date.now() - started;
  await page.locator('#confidence').fill('95');
  const total95 = Number(await page.locator('#metric-total').textContent());
  assert(total95 < total55);
  await page.screenshot({ path: '.vision-data/hybrid-production-ui.png', fullPage: true });
  await page.locator('#confidence').fill('55');
  // Crop the second photograph in memory before inference, excluding all people.
  await page.locator('#image-input').setInputFiles('.vision-data/portable-ouvert.jpg');
  await page.locator('#source-badge').filter({ hasText: 'Image prête' }).waitFor();
  const png = await page.evaluate(() => {
    const frame = document.getElementById('frame');
    const crop = [450/2160,650/2880,1500/2160,1800/2880];
    const [x,y,w,h] = crop; const canvas = document.createElement('canvas');
    canvas.width = Math.round(frame.width*w); canvas.height = Math.round(frame.height*h);
    canvas.getContext('2d').drawImage(frame,frame.width*x,frame.height*y,frame.width*w,frame.height*h,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#image-input').setInputFiles({ name: 'portable-cadre.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('#source-badge').filter({ hasText: 'Image prête' }).waitFor();
  assert.equal(await page.locator('#metric-total').textContent(), '—');
  await page.locator('#analyze').click();
  await page.locator('#analyzing-overlay').waitFor({ state: 'hidden' });
  const laptop = await page.locator('[data-equipment="laptop"] .observed-value').textContent();
  const screens = await page.locator('[data-equipment="screen"] .observed-value').textContent();
  assert.equal(laptop, '1'); assert.equal(screens, '0');
  for (const id of ['board','window']) assert.match(await page.locator(`[data-equipment="${id}"] .verification-value`).textContent(), /Contrôle manuel/);
  await page.locator('#analysis-mode').selectOption('quick');
  assert.equal(await page.locator('#metric-total').textContent(), '—');
  assert(requests.every((request) => request.method === 'GET'));
  const external = requests.filter((request) => /^https?:/.test(request.url) && !request.url.startsWith('http://127.0.0.1:'));
  assert(external.every((request) => request.url.startsWith('https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/')), JSON.stringify(external));
  const report = { at: new Date().toISOString(), kind: 'real-compiled-hybrid-ui', browser: browser.version(),
    total55, total95, durationMs, laptopObserved: laptop, standaloneScreensObserved: screens,
    sourceChangeClearsAudit: true, modeChangeClearsAudit: true, manualCategoriesVerified: true,
    requests, imageUploadObserved: false };
  await writeFile('docs/evidence/hybrid-ui-2026-10-16.json', JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report));
} finally { await browser?.close(); await new Promise((resolve) => server.httpServer.close(resolve)); }
