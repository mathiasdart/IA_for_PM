import { test, expect } from '@playwright/test';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const image = { id: 'fe7507e0-0ad6-4891-afd5-9e4ba5abac32', filename: '<salle>.jpg',
  contentType: 'image/png', width: 1, height: 1, bytes: pixel.length, createdAt: '2026-10-16T12:00:00Z', analysis: null };

async function setup(page, { sessionStatus = 200, saveStatus = 201, initial = [] } = {}) {
  const writes = [];
  let images = [...initial];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['POST', 'DELETE'].includes(request.method())) writes.push(request);
    if (path === '/api/session') return route.fulfill({ status: sessionStatus, json: sessionStatus === 200
      ? { email: 'owner@example.test', storage: true }
      : { error: sessionStatus === 401 ? 'Connexion requise.' : 'Archivage non configuré sur ce déploiement.' } });
    if (path.endsWith('/file')) return route.fulfill({ contentType: 'image/png', body: pixel });
    if (request.method() === 'POST') {
      if (saveStatus !== 201) return route.fulfill({ status: saveStatus, json: { error: 'Enregistrement refusé.' } });
      images = [image];
      return route.fulfill({ status: 201, json: { image } });
    }
    if (request.method() === 'DELETE') { images = []; return route.fulfill({ json: { deleted: true } }); }
    return route.fulfill({ json: { images, next: null } });
  });
  await page.route(/\/src\/detector\.js(?:\?.*)?$/, (route) => route.fulfill({ contentType: 'application/javascript',
    body: `export async function getDetector(){return {async detect(){return {predictions:[{class:'chair',score:.9,bbox:[0,0,1,1]}],inferenceMs:1}}}}` }));
  await page.goto('/');
  return writes;
}

test('import et analyse restent locaux ; seul le clic enregistre le JPEG et son analyse', async ({ page }) => {
  const writes = await setup(page);
  await page.locator('#image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: pixel });
  await expect(page.locator('#archive-save')).toBeEnabled();
  expect(writes).toHaveLength(0);
  await page.locator('#analyze').click();
  await expect(page.locator('#metric-total')).toHaveText('1');
  expect(writes).toHaveLength(0);
  await page.locator('#archive-save').click();
  await expect(page.locator('#archive-status')).toContainText('sur votre demande');
  expect(writes).toHaveLength(1);
  expect(writes[0].method()).toBe('POST');
  const body = writes[0].postDataBuffer().toString('latin1');
  expect(body).toContain('image/jpeg');
  expect(body).toContain('"predictions":[{"class":"chair"');
  await expect(page.locator('#archive-list strong')).toHaveText('<salle>.jpg');
  await expect(page.locator('#archive-list script')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reprendre pour analyse' }).click();
  await expect(page.locator('#metric-total')).toHaveText('—');
  expect(writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.locator('#archive-list article')).toHaveCount(0);
  expect(writes.map((request) => request.method())).toEqual(['POST', 'DELETE']);
});

for (const status of [401, 503]) {
  test(`archive ${status} : analyse disponible et enregistrement désactivé`, async ({ page }) => {
    const writes = await setup(page, { sessionStatus: status });
    await page.locator('#image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: pixel });
    await expect(page.locator('#archive-status')).toContainText(status === 401 ? 'Connexion requise' : 'non configuré');
    await expect(page.locator('#archive-save')).toBeDisabled();
    await expect(page.locator('#archive-login')).toHaveAttribute('href', '/api/login');
    await page.locator('#analyze').click();
    await expect(page.locator('#metric-total')).toHaveText('1');
    expect(writes).toHaveLength(0);
  });
}

test('un refus de sauvegarde conserve la vue et permet une nouvelle tentative explicite', async ({ page }) => {
  const writes = await setup(page, { saveStatus: 500 });
  await page.locator('#image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: pixel });
  await page.locator('#archive-save').click();
  await expect(page.locator('#archive-status')).toHaveText('Enregistrement refusé.');
  await expect(page.locator('#archive-save')).toBeEnabled();
  await expect(page.locator('#source-badge')).toHaveText('Image prête');
  expect(writes).toHaveLength(1);
});
