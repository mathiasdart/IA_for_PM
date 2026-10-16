import * as tf from '@tensorflow/tfjs';
import { MODEL, MODEL_VARIANTS } from './model-spec.js';
import { postprocess } from './detection-postprocess.js';
import { detectionRegions, mapRegionPrediction, mergeRegionPredictions } from './detection-regions.js';

const loading = new Map();
let backendReady;

/** The graph is cached in RAM only; failed loads can be retried. */
export function getDetector(onProgress = () => {}, { base = MODEL.base } = {}) {
  if (!Object.hasOwn(MODEL_VARIANTS, base)) throw new Error('Variante COCO-SSD inconnue.');
  if (!loading.has(base)) {
    loading.set(base, loadDetector(onProgress, base).catch((error) => { loading.delete(base); throw error; }));
  }
  return loading.get(base);
}

async function prepareBackend() {
  try {
    const ready = await tf.setBackend('webgl');
    if (!ready) throw new Error('WEBGL_UNAVAILABLE');
    await tf.ready();
  } catch {
    await tf.setBackend('cpu');
    await tf.ready();
  }
}

async function loadDetector(onProgress, base) {
  onProgress({ phase: 'backend', progress: 0 });
  backendReady ??= prepareBackend().catch((error) => { backendReady = undefined; throw error; });
  await backendReady;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let graph;
  try {
    graph = await tf.loadGraphModel(MODEL_VARIANTS[base], {
      requestInit: { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' },
      onProgress: (progress) => onProgress({ phase: 'download', progress }),
    });
  } finally {
    clearTimeout(timeout);
  }
  onProgress({ phase: 'ready', progress: 1 });
  return {
    base,
    backend: tf.getBackend(),
    async detect(canvas, { detailed = MODEL.detailed, onProgress = () => {} } = {}) {
      const started = performance.now();
      const regions = detectionRegions(canvas.width, canvas.height, detailed);
      const predictions = [];
      const fullPredictions = [];
      let truncated = false;
      let borderFragments = 0;
      const tile = document.createElement('canvas');
      try {
        for (const [index, region] of regions.entries()) {
          onProgress({ completed: index, total: regions.length });
          let inputCanvas = canvas;
          if (!region.full) {
            tile.width = region.width; tile.height = region.height;
            tile.getContext('2d').drawImage(canvas, region.x, region.y, region.width, region.height,
              0, 0, region.width, region.height);
            inputCanvas = tile;
          }
          const result = await detectFrame(inputCanvas);
          truncated ||= result.truncated;
          for (const prediction of result.predictions) {
            const mapped = mapRegionPrediction(prediction, region, canvas.width, canvas.height);
            if (mapped) {
              predictions.push(mapped);
              if (region.full) fullPredictions.push(mapped);
            } else borderFragments += 1;
          }
        }
      } finally {
        tile.width = tile.height = 0;
      }
      const merged = mergeRegionPredictions(predictions, { fullPredictions, imageWidth: canvas.width, imageHeight: canvas.height });
      onProgress({ completed: regions.length, total: regions.length });
      return { ...merged, truncated: truncated || merged.truncated, inferenceMs: Math.round(performance.now() - started),
        regions: regions.length, borderFragments, base };
    },
  };

  async function detectFrame(canvas) {
    const input = tf.tidy(() => tf.browser.fromPixels(canvas).expandDims(0));
    let output;
    try {
      output = await graph.executeAsync(input);
      if (!Array.isArray(output) || output.length !== 2
        || output[0].shape.length !== 3 || output[0].shape[0] !== 1 || output[0].shape[2] !== 90
        || output[1].shape.length !== 4 || output[1].shape[0] !== 1
        || output[1].shape[1] !== output[0].shape[1] || output[1].shape[2] !== 1 || output[1].shape[3] !== 4) {
        throw new Error('La structure du modèle COCO-SSD est incompatible.');
      }
      const [scores, boxes] = await Promise.all(output.map((tensor) => tensor.data()));
      return {
        ...postprocess({ scores, boxes, numBoxes: output[0].shape[1], numClasses: output[0].shape[2], width: canvas.width, height: canvas.height }),
      };
    } finally {
      input.dispose();
      if (output) tf.dispose(output);
    }
  }
}
