import { test, expect } from '@playwright/test';

// Synthetic media is used only to test browser workflows, never as AI evidence.
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');

test('les résultats sont en attente et les fonctions futures indisponibles', async ({ page }) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/');
  await expect(page.locator('#configuration-rows tr')).toHaveCount(6);
  await expect(page.locator('#analyze')).toBeDisabled();
  await expect(page.locator('#view-report')).toBeDisabled();
  await expect(page.locator('#metric-total')).toHaveText('—');
  await expect(page.locator('#confidence')).toBeDisabled();
  await expect(page.locator('body')).not.toContainText('Projet pédagogique');
  await expect(page.locator('body')).not.toContainText('Projet IA for Managers');
  expect(failures).toEqual([]);
});

test('configuration modifiable, valeurs invalides corrigées, remise aux exemples', async ({ page }) => {
  await page.goto('/');
  const chairs = page.getByRole('spinbutton', { name: 'Chaises : quantité attendue' });
  await chairs.fill('30');
  await expect(page.locator('#configuration-badge')).toHaveText('Configuration personnalisée');
  await chairs.fill('-5');
  await chairs.blur();
  await expect(chairs).toHaveValue('30');
  await expect(page.locator('#notification')).toContainText('Quantité invalide');
  await page.locator('#reset-config').click();
  await expect(chairs).toHaveValue('20');
  await expect(page.locator('#configuration-badge')).toHaveText('Configuration d’exemple');
});

test('image valide affichée puis effacée sans persistance ni requête externe', async ({ page }) => {
  const external = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173')) external.push(request.url()); });
  await page.goto('/');
  await page.locator('#image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: pixel });
  await expect(page.locator('#source-badge')).toHaveText('Image prête');
  await expect(page.locator('#frame')).toBeVisible();
  await expect(page.locator('#analyze')).toBeEnabled();
  await page.locator('#reset').click();
  await expect(page.locator('#frame')).toBeHidden();
  expect(await page.locator('#frame').evaluate((canvas) => canvas.width)).toBe(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(external).toEqual([]);
});

test('type interdit et image corrompue produisent une explication', async ({ page }) => {
  await page.goto('/');
  await page.locator('#image-input').setInputFiles({ name: 'test.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('#notification')).toContainText('Format non pris en charge');
  await page.locator('#image-input').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await expect(page.locator('#notification')).toContainText('ne peut pas être lue');
  await expect(page.locator('#frame')).toBeHidden();
});

test('refus caméra expliqué et nouvelle tentative disponible', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  await page.locator('#tab-camera').click();
  await page.locator('#start-camera').click();
  await expect(page.locator('#notification')).toContainText('Accès à la caméra refusé');
  await expect(page.locator('#start-camera')).toBeEnabled();
});

async function fakeCamera(page, delayed = false) {
  await page.addInitScript(({ delayed }) => {
    window.__tracksStopped = 0;
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => {
      const provideStream = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        canvas.getContext('2d').fillRect(0, 0, 640, 360);
        const stream = canvas.captureStream(5);
        for (const track of stream.getTracks()) {
          const originalStop = track.stop.bind(track);
          track.stop = () => { window.__tracksStopped += 1; originalStop(); };
        }
        resolve(stream);
      };
      if (delayed) window.__resolveCamera = provideStream;
      else provideStream();
    });
  }, { delayed });
}

test('caméra : démarrage, arrêt et changement de source libèrent les pistes', async ({ page }) => {
  await fakeCamera(page);
  await page.goto('/');
  await page.locator('#tab-camera').click();
  await page.locator('#start-camera').click();
  await expect(page.locator('#source-badge')).toHaveText('Caméra active');
  await page.locator('#stop-camera').click();
  expect(await page.evaluate(() => window.__tracksStopped)).toBe(1);
  await page.locator('#start-camera').click();
  await expect(page.locator('#camera')).toBeVisible();
  await page.locator('#tab-image').click();
  expect(await page.evaluate(() => window.__tracksStopped)).toBe(2);
  expect(await page.locator('#camera').evaluate((video) => video.srcObject)).toBeNull();
});

test('un accès caméra accordé après annulation ne réactive pas le flux', async ({ page }) => {
  await fakeCamera(page, true);
  await page.goto('/');
  await page.locator('#tab-camera').click();
  await page.locator('#start-camera').click();
  await page.locator('#stop-camera').click();
  await page.evaluate(() => window.__resolveCamera());
  await expect.poll(() => page.evaluate(() => window.__tracksStopped)).toBe(1);
  await expect(page.locator('#camera')).toBeHidden();
  await expect(page.locator('#source-badge')).toHaveText('Aucune source');
});

for (const width of [1440, 768, 390]) {
  test(`interface sans débordement global à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#configuration-rows tr')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.locator('.nav-link[href="#configuration"]').click();
    await expect(page.locator('#configuration')).toBeInViewport();
  });
}
