import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authenticate } from '../worker/auth.js';
import { createImageApi } from '../worker/images.js';
import worker from '../worker/index.js';

test('Access vérifie la signature, l’émetteur et l’audience, pas un simple en-tête email', async () => {
  const { publicKey,privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig' };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys:[jwk] });
  const env = { CF_ACCESS_TEAM_DOMAIN:'archive-test.cloudflareaccess.com',CF_ACCESS_AUD:'image-archive' };
  const issuer = `https://${env.CF_ACCESS_TEAM_DOMAIN}`;
  const token = (audience) => new SignJWT({ email:'owner@example.test' }).setProtectedHeader({ alg:'RS256',kid:'test-key' })
    .setSubject('owner').setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('2m').sign(privateKey);
  try {
    const valid = await token(env.CF_ACCESS_AUD);
    assert.equal((await authenticate(new Request('https://app.test',{ headers:{ 'cf-access-jwt-assertion':valid } }),env)).sub,'owner');
    await assert.rejects(authenticate(new Request('https://app.test',{ headers:{ 'cf-access-jwt-assertion':await token('another-app') } }),env));
    await assert.rejects(authenticate(new Request('https://app.test',{ headers:{ 'cf-access-authenticated-user-email':'owner@example.test' } }),env));
    await assert.rejects(authenticate(new Request('https://app.test',{ headers:{ 'cf-access-jwt-assertion':`${valid.slice(0,-20)}forged` } }),env));
    const wrongIssuer = await new SignJWT({ email:'owner@example.test' }).setProtectedHeader({ alg:'RS256',kid:'test-key' })
      .setSubject('owner').setIssuer('https://another.cloudflareaccess.com').setAudience(env.CF_ACCESS_AUD)
      .setIssuedAt().setExpirationTime('2m').sign(privateKey);
    const expired = await new SignJWT({ email:'owner@example.test' }).setProtectedHeader({ alg:'RS256',kid:'test-key' })
      .setSubject('owner').setIssuer(issuer).setAudience(env.CF_ACCESS_AUD).setIssuedAt(1).setExpirationTime(2).sign(privateKey);
    const noExpiry = await new SignJWT({ email:'owner@example.test' }).setProtectedHeader({ alg:'RS256',kid:'test-key' })
      .setSubject('owner').setIssuer(issuer).setAudience(env.CF_ACCESS_AUD).setIssuedAt().sign(privateKey);
    for (const jwt of [wrongIssuer,expired,noExpiry]) await assert.rejects(authenticate(new Request('https://app.test',
      { headers:{ 'cf-access-jwt-assertion':jwt } }),env));
  } finally { globalThis.fetch = previousFetch; }
});

test('D1 et R2 locaux : archivage explicite, lecture privée, isolation des comptes et suppression', async () => {
  const bundle = await build({ entryPoints:['tests/fixtures/archive-worker.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022' });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-16',
    d1Databases:{ DB:'archive-test' },r2Buckets:{ IMAGES:'archive-test' } }));
  try {
    const db = await mf.getD1Database('DB');
    await db.exec((await readFile('migrations/0001_images.sql','utf8')).replace(/\n/g,' '));
    const call = async (path,options={},user='owner-a') => {
      const url = `http://localhost${path}`;
      const request = new Request(url,{ ...options,
        headers:{ origin:'http://localhost',...(user ? { 'x-test-user':user } : {}),...options.headers } });
      return mf.dispatchFetch(url,{ method:request.method,redirect:'manual',headers:Object.fromEntries(request.headers),
        ...(request.body ? { body:await request.arrayBuffer() } : {}) });
    };
    assert.equal((await call('/api/images',{},null)).status,401);
    const login = await call('/api/login');
    assert.equal(login.status,303);
    assert.equal(login.headers.get('location'),'http://localhost/#images');
    assert.equal((await call('/api/images',{ method:'POST',headers:{ origin:'https://attacker.test' } })).status,403);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
    const body = new FormData(); body.set('image',new File([png],'test.png',{ type:'image/png' }));
    body.set('metadata',JSON.stringify({ width:1,height:1,analysis:null }));
    const created = await call('/api/images',{ method:'POST',body });
    assert.equal(created.status,201,await created.clone().text());
    const { image } = await created.json();
    const list = await call('/api/images');
    assert.equal(list.headers.get('cache-control'),'private, no-store');
    assert.equal((await list.json()).images.length,1);
    assert.equal((await (await call('/api/images',{},'owner-b')).json()).images.length,0);
    assert.equal((await (await call('/api/images',{},"' OR 1=1 --")).json()).images.length,0);
    assert.equal((await call(`/api/images/${image.id}/file`,{},'owner-b')).status,404);
    assert.equal((await call(`/api/images/${image.id}`,{ method:'DELETE' },'owner-b')).status,404);
    const file = await call(`/api/images/${image.id}/file`);
    assert.equal(file.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()),png);
    assert.equal((await call(`/api/images/${image.id}`,{ method:'DELETE' })).status,200);
    assert.equal((await call(`/api/images/${image.id}/file`)).status,404);
    assert.equal((await (await call('/api/images')).json()).images.length,0);
    assert.equal((await (await mf.getR2Bucket('IMAGES')).list()).objects.length,0);
    const invalid = new FormData(); invalid.set('image',new File(['html'],'fake.jpg',{ type:'image/jpeg' }));
    invalid.set('metadata',JSON.stringify({ width:1,height:1 }));
    assert.equal((await call('/api/images',{ method:'POST',body:invalid })).status,415);
    assert.equal((await call('/api/images',{ method:'POST',headers:{ 'content-type':'multipart/form-data; boundary=test' },body:new Uint8Array(9000000) })).status,413);
    // A failed SQL write must not leave a private object behind in R2.
    await db.exec('DROP TABLE images');
    assert.equal((await call('/api/images',{ method:'POST',body })).status,500);
    assert.equal((await (await mf.getR2Bucket('IMAGES')).list()).objects.length,0);
  } finally { await mf.dispose(); }
});

test('sans configuration Access complète, la production refuse toute archive', async () => {
  const request = new Request('https://app.test/api/images');
  assert.equal((await worker.fetch(request,{})).status,503);
  assert.equal((await worker.fetch(request,{ DB:{},IMAGES:{} })).status,503);
  const env = { DB:{},IMAGES:{},CF_ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',CF_ACCESS_AUD:'test' };
  const forged = new Request(request,{ headers:{ 'x-test-user':'owner','cf-access-authenticated-user-email':'owner@example.test' } });
  assert.equal((await worker.fetch(forged,env)).status,401);
});

test('un corps sans Content-Length dépassant la limite reçoit 413 après drainage', async () => {
  const imageApi = createImageApi({ authenticate:async()=>({ sub:'owner',email:'owner@example.test' }) });
  let reads=0;
  const body = new ReadableStream({ pull(controller) {
    if (reads===10) { controller.close(); return; }
    reads++; controller.enqueue(new Uint8Array(1024*1024));
  } });
  const request = new Request('https://app.test/api/images',{ method:'POST',duplex:'half',body,
    headers:{ Origin:'https://app.test','Content-Type':'multipart/form-data; boundary=test' } });
  const response = await imageApi(request,{ DB:{},IMAGES:{} });
  assert.equal(response.status,413);
  assert.equal(reads,10);
});
