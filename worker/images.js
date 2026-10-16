const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 256 * 1024;
const equipmentClasses = new Set(['chair', 'dining table', 'tv', 'laptop']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function limitedBody(request) {
  if (!request.body) throw new ApiError(400, 'Image manquante.');
  const reader = request.body.getReader();
  const chunks = []; let length = 0;
  let oversized = Number(request.headers.get('content-length')) > MAX_BODY_BYTES;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_BODY_BYTES) oversized = true;
      // Drain rejected uploads without retaining them. Returning/cancelling while
      // the HTTP client is still writing can reset the connection before its 413.
      if (oversized) chunks.length = 0;
      else chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (oversized) throw new ApiError(413, 'Image trop volumineuse.');
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

function detectedType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  return null;
}

function cleanAnalysis(value, width, height) {
  if (value == null) return null;
  if (!value || !Array.isArray(value.predictions) || value.predictions.length > 100
    || !Number.isFinite(value.threshold) || value.threshold < .2 || value.threshold > .95) throw new ApiError(400, 'Analyse invalide.');
  const predictions = value.predictions.map((prediction) => {
    if (!equipmentClasses.has(prediction.class) || !Number.isFinite(prediction.score) || prediction.score < .2 || prediction.score > 1
      || !Array.isArray(prediction.bbox) || prediction.bbox.length !== 4 || !prediction.bbox.every(Number.isFinite)) throw new ApiError(400, 'Prédiction invalide.');
    const [x,y,w,h] = prediction.bbox;
    if (Math.min(x,y) < 0 || Math.min(w,h) <= 0 || x+w > width+1 || y+h > height+1) throw new ApiError(400, 'Cadre invalide.');
    return { class: prediction.class, score: prediction.score, bbox: prediction.bbox,
      model: prediction.model === 'faster-rcnn' ? 'faster-rcnn' : 'coco-ssd' };
  });
  const expected = {};
  for (const id of ['chair','table','board','window','laptop','screen']) {
    const quantity = value.expected?.[id];
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) throw new ApiError(400, 'Référentiel invalide.');
    expected[id] = quantity;
  }
  return JSON.stringify({ predictions, threshold: value.threshold, expected,
    at: typeof value.at === 'string' && !Number.isNaN(Date.parse(value.at)) ? value.at : null,
    provenance: 'client-reported-analysis', scope: 'single-view-not-room-compliance' });
}

function present(row) {
  return { id: row.id, filename: row.filename, contentType: row.content_type,
    bytes: row.byte_size, width: row.width, height: row.height, sha256: row.sha256,
    createdAt: row.created_at, analysis: row.analysis_json ? JSON.parse(row.analysis_json) : null };
}

export function createImageApi({ authenticate, configured = (env) => Boolean(env.DB && env.IMAGES) }) {
  return async function imageApi(request, env) {
    try {
      if (!configured(env)) return json({ error: 'Archivage non configuré sur ce déploiement.' }, 503);
      let user;
      try { user = await authenticate(request, env); }
      catch { return json({ error: 'Connexion requise pour accéder aux images.' }, 401); }
      const url = new URL(request.url);
      if (['POST','DELETE'].includes(request.method) && request.headers.get('Origin') !== url.origin) return json({ error: 'Origine refusée.' }, 403);
      if (url.pathname === '/api/login' && request.method === 'GET') return new Response(null, {
        status: 303, headers: { Location: `${url.origin}/#images`, 'Cache-Control': 'private, no-store' },
      });
      if (url.pathname === '/api/session' && request.method === 'GET') return json({ email: user.email, storage: true });
      if (url.pathname === '/api/images' && request.method === 'GET') {
        const cursor = url.searchParams.get('before');
        let at = '9999', id = 'z';
        if (cursor) {
          try { [at,id] = JSON.parse(atob(cursor)); } catch { throw new ApiError(400, 'Pagination invalide.'); }
          if (typeof at !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(at) || !uuid.test(id)) throw new ApiError(400, 'Pagination invalide.');
        }
        const { results } = await env.DB.prepare('SELECT * FROM images WHERE owner_sub = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT 21')
          .bind(user.sub,at,at,id).all();
        const rows = results.slice(0,20); const last = rows.at(-1);
        return json({ images: rows.map(present), next: results.length > 20 ? btoa(JSON.stringify([last.created_at,last.id])) : null });
      }
      if (url.pathname === '/api/images' && request.method === 'POST') {
        if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new ApiError(415, 'Formulaire image requis.');
        let form;
        try { form = await new Response(await limitedBody(request), { headers: { 'content-type': request.headers.get('content-type') } }).formData(); }
        catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Formulaire invalide.'); }
        const file = form.get('image');
        if (!(file instanceof File) || !file.size || file.size > MAX_IMAGE_BYTES) throw new ApiError(413, 'Image manquante ou trop volumineuse (8 Mo maximum).');
        const bytes = new Uint8Array(await file.arrayBuffer()); const type = detectedType(bytes);
        if (!type || type !== file.type) throw new ApiError(415, 'JPEG, PNG ou WebP requis.');
        let metadata;
        try { metadata = JSON.parse(form.get('metadata')); } catch { throw new ApiError(400, 'Métadonnées invalides.'); }
        const { width,height } = metadata ?? {};
        if (![width,height].every((value) => Number.isInteger(value) && value > 0) || width*height > 40_000_000) throw new ApiError(400, 'Dimensions invalides.');
        const analysis = cleanAnalysis(metadata.analysis,width,height);
        const imageId = crypto.randomUUID(); const key = `images/${imageId}`;
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map((value) => value.toString(16).padStart(2,'0')).join('');
        const filename = file.name.replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,160) || 'image';
        const createdAt = new Date().toISOString();
        await env.IMAGES.put(key,bytes,{ httpMetadata: { contentType: type } });
        try {
          await env.DB.prepare('INSERT INTO images (id,owner_sub,object_key,filename,content_type,byte_size,width,height,sha256,created_at,analysis_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            .bind(imageId,user.sub,key,filename,type,bytes.length,width,height,sha256,createdAt,analysis).run();
        } catch (error) { await env.IMAGES.delete(key); throw error; }
        return json({ image: { id: imageId,filename,contentType:type,bytes:bytes.length,width,height,sha256,createdAt,analysis:analysis ? JSON.parse(analysis) : null } },201);
      }
      const match = url.pathname.match(/^\/api\/images\/([0-9a-f-]+)(\/file)?$/);
      if (match && uuid.test(match[1]) && ['GET','DELETE'].includes(request.method)) {
        const row = await env.DB.prepare('SELECT * FROM images WHERE id = ? AND owner_sub = ?').bind(match[1],user.sub).first();
        if (!row) return json({ error: 'Image introuvable.' },404);
        if (request.method === 'DELETE' && !match[2]) {
          await env.IMAGES.delete(row.object_key);
          await env.DB.prepare('DELETE FROM images WHERE id = ? AND owner_sub = ?').bind(row.id,user.sub).run();
          return json({ deleted: true });
        }
        if (request.method === 'GET' && match[2]) {
          const object = await env.IMAGES.get(row.object_key);
          if (!object) return json({ error: 'Fichier indisponible.' },404);
          return new Response(object.body,{ headers: { 'Content-Type':row.content_type,'Cache-Control':'private, no-store',
            'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox" } });
        }
      }
      return json({ error: 'Route introuvable.' },404);
    } catch (error) {
      return json({ error: error instanceof ApiError ? error.message : 'L’archivage a échoué. Réessayez.' },error instanceof ApiError ? error.status : 500);
    }
  };
}
