import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = { wasm: wasmUrl };
let session;
const categories = new Map([[62, 'chair'], [67, 'dining table'], [72, 'tv'], [73, 'laptop']]);
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map((value) => value.toString(16).padStart(2, '0')).join('');

async function load() {
  const root = `${import.meta.env.BASE_URL}models/faster-rcnn/`;
  const response = await fetch(`${root}manifest.json`);
  if (!response.ok) throw new Error('Modèle Faster R-CNN indisponible.');
  const manifest = await response.json();
  const bytes = new Uint8Array(manifest.bytes);
  let offset = 0;
  for (const part of manifest.parts) {
    const result = await fetch(`${root}${part.file}`, { signal: AbortSignal.timeout(120_000) });
    if (!result.ok) throw new Error('Téléchargement Faster R-CNN incomplet.');
    const block = new Uint8Array(await result.arrayBuffer());
    if (block.length !== part.bytes || await sha256(block) !== part.sha256) throw new Error('Intégrité du modèle invalide.');
    bytes.set(block, offset); offset += block.length;
    self.postMessage({ type: 'progress', progress: offset / manifest.bytes });
  }
  if (offset !== manifest.bytes || await sha256(bytes) !== manifest.sha256) throw new Error('Intégrité du modèle invalide.');
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      await load();
      self.postMessage({ type: 'ready' });
      return;
    }
    if (data.type !== 'detect' || !session) throw new Error('Modèle non chargé.');
    const { width, height, pixels } = data;
    const started = performance.now();
    const values = new Float32Array(width * height * 3);
    for (let index = 0; index < width * height; index += 1) {
      values[index] = pixels[index * 4] / 255;
      values[index + width * height] = pixels[index * 4 + 1] / 255;
      values[index + width * height * 2] = pixels[index * 4 + 2] / 255;
    }
    const input = new ort.Tensor('float32', values, [3, height, width]);
    let output;
    try {
      output = await session.run({ image: input });
      const predictions = [];
      for (let index = 0; index < output.scores.data.length; index += 1) {
        const category = categories.get(Number(output.labels.data[index]));
        const score = output.scores.data[index];
        if (!category || score < 0.2) continue;
        const [x1, y1, x2, y2] = output.boxes.data.slice(index * 4, index * 4 + 4);
        predictions.push({ class: category, score, bbox: [x1, y1, x2 - x1, y2 - y1], model: 'faster-rcnn' });
      }
      self.postMessage({ type: 'result', result: { predictions, inferenceMs: Math.round(performance.now() - started),
        truncated: output.scores.data.length >= 100, model: 'fasterrcnn_resnet50_fpn_v2', backend: 'wasm' } });
    } finally {
      input.dispose();
      Object.values(output ?? {}).forEach((tensor) => tensor.dispose());
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
