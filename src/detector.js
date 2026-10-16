import * as tf from '@tensorflow/tfjs';
import { MODEL } from './model-spec.js';
import { postprocess } from './detection-postprocess.js';

let loading;

/** The graph is cached in RAM only; failed loads can be retried. */
export function getDetector(onProgress = () => {}) {
  if (!loading) {
    loading = loadDetector(onProgress).catch((error) => { loading = undefined; throw error; });
  }
  return loading;
}

async function loadDetector(onProgress) {
  onProgress({ phase: 'backend', progress: 0 });
  try {
    const ready = await tf.setBackend('webgl');
    if (!ready) throw new Error('WEBGL_UNAVAILABLE');
    await tf.ready();
  } catch {
    await tf.setBackend('cpu');
    await tf.ready();
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let graph;
  try {
    graph = await tf.loadGraphModel(MODEL.url, {
      requestInit: { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' },
      onProgress: (progress) => onProgress({ phase: 'download', progress }),
    });
  } finally {
    clearTimeout(timeout);
  }
  onProgress({ phase: 'ready', progress: 1 });
  return {
    backend: tf.getBackend(),
    async detect(canvas) {
      const started = performance.now();
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
          inferenceMs: Math.round(performance.now() - started),
        };
      } finally {
        input.dispose();
        if (output) tf.dispose(output);
      }
    },
  };
}
