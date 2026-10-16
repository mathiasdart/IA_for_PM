let loading;

/** Dedicated worker keeps the interface responsive during CPU inference. */
export function getFasterDetector(onProgress = () => {}) {
  loading ??= createDetector(onProgress).catch((error) => { loading = undefined; throw error; });
  return loading;
}

function createDetector(onProgress) {
  const worker = new Worker(new URL('./faster-worker.js', import.meta.url), { type: 'module' });
  let active;
  let terminated = false;
  function dispose() { terminated = true; worker.terminate(); loading = undefined; }
  function request(message, transfer = []) {
    if (active) return Promise.reject(new Error('Une analyse Faster R-CNN est déjà en cours.'));
    if (terminated) return Promise.reject(new Error('Relancez le modèle Faster R-CNN.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { dispose(); active = null; reject(new Error('Faster R-CNN dépasse le temps disponible sur cet appareil.')); }, 180_000);
      active = { resolve: (value) => { clearTimeout(timer); active = null; resolve(value); },
        reject: (error) => { clearTimeout(timer); active = null; reject(error); } };
      worker.postMessage(message, transfer);
    });
  }
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') { onProgress({ phase: 'faster-download', progress: data.progress }); return; }
    if (data.type === 'error') { const current = active; dispose(); current?.reject(new Error(data.message)); return; }
    active?.resolve(data.result);
  };
  worker.onerror = () => { const current = active; dispose(); current?.reject(new Error('Faster R-CNN est indisponible sur ce navigateur.')); };
  return request({ type: 'load' }).then(() => ({
    backend: 'wasm',
    async detect(canvas) {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return request({ type: 'detect', width: canvas.width, height: canvas.height, pixels }, [pixels.buffer]);
    },
    dispose,
  }));
}
