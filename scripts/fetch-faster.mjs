import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../public/models/faster-rcnn/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
const release = 'https://github.com/mathiasdart/IA_for_PM/releases/download/models-faster-rcnn-v1/';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const part of manifest.parts) {
  if (!/^model-\d{2}\.bin$/.test(part.file)) throw new Error('Invalid model part.');
  const target = new URL(part.file, root);
  const existing = await readFile(target).catch(() => null);
  if (existing?.length === part.bytes && hash(existing) === part.sha256) continue;
  console.log(`Téléchargement Faster R-CNN : ${part.file}`);
  const response = await fetch(`${release}${part.file}`, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== part.bytes || hash(bytes) !== part.sha256) throw new Error('Model SHA-256 mismatch.');
  const temporary = new URL(`${part.file}.download`, root);
  try { await writeFile(temporary, bytes); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
}
console.log('Poids Faster R-CNN vérifiés.');
