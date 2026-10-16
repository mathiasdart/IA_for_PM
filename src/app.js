import './style.css';
import { EQUIPMENT, exampleConfiguration, parseQuantity, validateImageFile, cameraErrorMessage } from './configuration.js';
import { hydrateIcons, icon } from './icons.js';
import { buildAudit } from './audit.js';
import { mergeDetectors } from './detection-ensemble.js';

const $ = (id) => document.getElementById(id);
const state = {
  mode: 'image', stream: null, source: null, sourceVersion: 0, expected: exampleConfiguration(),
  analysis: null, busy: false, activeVersion: null, modelState: 'idle', modelProgress: 0,
  analysisProgress: null,
};
const video = $('camera');
const frame = $('frame');
let activeFaster;
const MAX_IMAGE_PIXELS = 40_000_000;

hydrateIcons();

function notify(message, kind = 'info') {
  $('notification').textContent = message;
  $('notification').dataset.kind = kind;
  $('notification').hidden = !message;
}

function configurationChanged() {
  $('configuration-badge').textContent = 'Configuration personnalisée';
  renderAudit();
}

function renderConfiguration() {
  const body = $('configuration-rows');
  body.replaceChildren();
  for (const item of EQUIPMENT) {
    const row = document.createElement('tr');
    row.dataset.equipment = item.id;
    const description = document.createElement('td');
    // Labels and icons come only from the static equipment catalog.
    description.innerHTML = `<div class="equipment-cell"><span class="equipment-icon">${icon(item.icon)}</span><div><strong>${item.label}</strong><small>${item.detail}</small></div></div>`;
    const quantityCell = document.createElement('td');
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', min: '0', max: '999', step: '1', value: String(state.expected[item.id]), className: 'quantity-input', id: `expected-${item.id}` });
    input.setAttribute('aria-label', `${item.label} : quantité attendue`);
    input.setAttribute('inputmode', 'numeric');
    input.addEventListener('input', () => {
      const quantity = parseQuantity(input.value);
      input.setAttribute('aria-invalid', String(quantity === null));
      input.setCustomValidity(quantity === null ? 'Saisissez un entier de 0 à 999.' : '');
      if (quantity !== null) state.expected[item.id] = quantity;
      configurationChanged();
    });
    input.addEventListener('blur', () => {
      if (parseQuantity(input.value) !== null) return;
      input.value = String(state.expected[item.id]);
      input.setCustomValidity('');
      input.setAttribute('aria-invalid', 'false');
      renderAudit();
      notify('Quantité invalide : saisissez un entier de 0 à 999. La dernière valeur valide a été conservée.', 'error');
    });
    quantityCell.append(input);
    const observedCell = document.createElement('td');
    observedCell.className = 'unobserved observed-value';
    observedCell.textContent = '—';
    const differenceCell = observedCell.cloneNode(true);
    differenceCell.className = 'unobserved difference-value';
    const verificationCell = document.createElement('td');
    verificationCell.className = 'verification-value';
    const status = document.createElement('span');
    status.className = `badge ${item.support === 'manual' ? 'badge-manual' : 'badge-neutral'}`;
    status.textContent = item.support === 'manual' ? 'Contrôle manuel' : 'En attente d’analyse';
    verificationCell.append(status);
    row.append(description, quantityCell, observedCell, differenceCell, verificationCell);
    body.append(row);
  }
}

function stopTracks() {
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  video.pause();
  video.srcObject = null;
}

function clearSource() {
  state.sourceVersion += 1;
  state.analysis = null;
  stopTracks();
  state.source = null;
  frame.width = frame.height = 0;
  $('overlay').width = $('overlay').height = 0;
  $('overlay').hidden = true;
  $('image-input').value = '';
  renderAudit();
}

function renderSource() {
  const isCamera = state.mode === 'camera';
  const live = Boolean(state.stream);
  const imageReady = state.source === 'image' || state.source === 'capture';
  $('tab-image').classList.toggle('selected', !isCamera);
  $('tab-camera').classList.toggle('selected', isCamera);
  $('tab-image').setAttribute('aria-pressed', String(!isCamera));
  $('tab-camera').setAttribute('aria-pressed', String(isCamera));
  video.hidden = !live;
  frame.hidden = !imageReady;
  $('empty-capture').hidden = live || imageReady;
  $('pick-image').hidden = isCamera;
  $('capture-formats').hidden = isCamera;
  $('start-camera').hidden = !isCamera || live;
  $('start-camera').disabled = false;
  $('stop-camera').hidden = !live;
  $('change-image').hidden = !imageReady || isCamera;
  $('analyze-label').textContent = isCamera ? 'Analyser la vue' : 'Analyser l’image';
  $('capture-title').textContent = isCamera ? 'Un regard sur vos équipements.' : 'Votre salle, sous un nouvel angle.';
  $('capture-description').textContent = isCamera
    ? 'Démarrez la caméra et cadrez le mobilier d’une salle vide. Vous gardez le contrôle de la source.'
    : 'Importez une photo du mobilier et des équipements. Choisissez une vue dégagée, sans personne.';
  $('source-badge').textContent = live ? 'Caméra active' : state.source === 'capture' ? 'Capture figée' : imageReady ? 'Image prête' : 'Aucune source';
  $('source-badge').className = `badge ${live || imageReady ? 'badge-success' : 'badge-neutral'}`;
  renderAudit();
}

function invalidConfiguration() {
  return Boolean(document.querySelector('.quantity-input[aria-invalid="true"]'));
}

function renderModel() {
  const loading = state.modelState === 'loading';
  const labels = {
    idle: 'Modèle chargé à la première analyse', loading: `Chargement du modèle · ${Math.round(state.modelProgress * 100)} %`,
    ready: 'Modèle prêt · traitement dans le navigateur', error: 'Le modèle n’a pas pu être chargé',
  };
  $('model-label').textContent = labels[state.modelState];
  $('model-detail').textContent = state.modelState === 'error'
    ? 'Vérifiez votre connexion ou essayez un mode COCO seul.'
    : `${$('analysis-mode').value === 'hybrid' ? 'COCO-SSD + Faster R-CNN' : 'COCO-SSD'} · 4 catégories ciblées · Aucun envoi d’image`;
  $('model-dot').className = `status-dot ${state.modelState}`;
  $('retry-model').hidden = state.modelState !== 'error' || !state.source;
  $('retry-model').disabled = state.busy;
  const progress = state.analysisProgress;
  $('analyzing-message').textContent = loading ? 'Préparation du modèle de détection…'
    : progress?.phase === 'faster' ? 'Faster R-CNN · analyse approfondie en cours…'
      : progress?.total > 1 ? `Analyse détaillée · vue ${Math.min(progress.completed + 1, progress.total)} sur ${progress.total}`
      : 'Analyse des équipements…';
}

function drawDetections(predictions) {
  const canvas = $('overlay');
  canvas.width = frame.width;
  canvas.height = frame.height;
  canvas.hidden = !predictions.length || !frame.width;
  if (canvas.hidden) return;
  const context = canvas.getContext('2d');
  const factor = Math.max(1, frame.width / 800);
  context.lineWidth = 2 * factor;
  context.font = `600 ${13 * factor}px system-ui, sans-serif`;
  for (const prediction of predictions) {
    const item = EQUIPMENT.find((category) => category.modelClass === prediction.class);
    const [x, y, width, height] = prediction.bbox;
    const label = `${item.label} · ${Math.round(prediction.score * 100)} %`;
    const labelWidth = Math.min(frame.width, context.measureText(label).width + 14 * factor);
    const labelX = Math.min(x, Math.max(0, frame.width - labelWidth));
    const labelY = Math.max(0, y - 23 * factor);
    context.strokeStyle = '#d5ed93';
    context.strokeRect(x, y, width, height);
    context.fillStyle = '#174c43';
    context.fillRect(labelX, labelY, labelWidth, 23 * factor);
    context.fillStyle = '#ffffff';
    context.fillText(label, labelX + 6 * factor, labelY + 16 * factor);
  }
}

function renderAudit() {
  const invalid = invalidConfiguration();
  const audit = invalid ? null : buildAudit(state.analysis, state.expected, Number($('confidence').value) / 100);
  const activeBusy = state.busy && state.activeVersion === state.sourceVersion;
  const ready = Boolean(state.source);
  $('analyze').disabled = !ready || state.busy || invalid;
  $('confidence').disabled = !state.analysis || state.busy;
  $('analysis-mode').disabled = state.busy;
  $('viewfinder').setAttribute('aria-busy', String(activeBusy));
  $('analyzing-overlay').hidden = !activeBusy;
  $('analyze-label').textContent = state.busy ? 'Analyse en cours…' : state.mode === 'camera' && state.stream ? 'Analyser la vue' : 'Analyser l’image';
  $('analysis-availability').textContent = invalid ? 'Corrigez les quantités attendues avant de comparer les résultats.'
    : state.source === 'capture' ? 'Capture figée pour cet audit. Redémarrez la caméra pour analyser une nouvelle vue.'
      : 'Analyse ponctuelle : cadrez uniquement les équipements d’une salle vide.';
  $('metric-total').textContent = audit ? String(audit.total) : '—';
  $('metric-categories').textContent = audit ? String(audit.categories) : '—';
  $('metric-rules').textContent = audit ? String(audit.verifiableRules) : '—';
  $('metric-gaps').textContent = audit ? String(audit.gaps) : '—';
  $('metric-total-note').textContent = audit ? `Au seuil de ${Math.round(audit.threshold * 100)} % sur cette vue` : 'En attente d’une analyse';
  $('metric-rules-note').textContent = audit ? `${audit.manualCategories} catégories à contrôler manuellement` : 'Selon les capacités du modèle';
  $('metric-gaps-note').textContent = audit ? 'Catégories présentant un écart' : 'À confirmer sur place';
  $('detection-count').textContent = `${audit?.categories ?? 0} catégorie${(audit?.categories ?? 0) > 1 ? 's' : ''}`;
  for (const row of document.querySelectorAll('#configuration-rows tr')) {
    const observation = audit?.rows.find((item) => item.id === row.dataset.equipment);
    const item = EQUIPMENT.find((category) => category.id === row.dataset.equipment);
    row.querySelector('.observed-value').textContent = observation?.observed ?? '—';
    const difference = observation?.difference;
    row.querySelector('.difference-value').textContent = difference == null ? '—' : difference > 0 ? `+${difference}` : String(difference);
    const badge = row.querySelector('.verification-value .badge');
    badge.className = `badge ${item.support === 'manual' ? 'badge-manual' : observation?.difference ? 'badge-warning' : observation ? 'badge-success' : 'badge-neutral'}`;
    const labels = { manual: 'Contrôle manuel', 'not-seen': 'À vérifier · non vus', excess: 'À vérifier · surplus', matching: 'Aucun écart visible' };
    badge.textContent = observation ? labels[observation.status] : item.support === 'manual' ? 'Contrôle manuel' : 'En attente d’analyse';
  }
  if (!audit) {
    $('audit-status-title').textContent = invalid ? 'Configuration à corriger' : ready ? 'Source prête pour l’audit' : 'Prêt quand vous l’êtes';
    $('audit-status-description').textContent = invalid ? 'Saisissez des quantités entières entre 0 et 999.' : ready
      ? 'Vérifiez le cadrage et les quantités attendues, puis lancez l’analyse.' : 'Ajoutez une image ou démarrez la caméra pour préparer votre audit.';
    $('detections').innerHTML = `<div class="results-empty"><span>${icon('layers')}</span><p>Les résultats de votre analyse<br>apparaîtront ici.</p></div>`;
    $('analysis-meta').hidden = true;
  } else {
    const titles = { 'no-detection': 'Aucun équipement reconnu sur cette vue', review: 'Vérification complémentaire requise', 'partial-match': 'Aucun écart sur les catégories vérifiables' };
    $('audit-status-title').textContent = titles[audit.status];
    $('audit-status-description').textContent = audit.status === 'no-detection'
      ? 'Cela ne prouve aucune absence. Essayez un autre cadrage ou un seuil plus bas, puis contrôlez sur place.'
      : `${audit.gaps} catégorie${audit.gaps > 1 ? 's' : ''} avec un écart observé. Tableaux et fenêtres nécessitent un contrôle manuel. L’inventaire de la salle reste partiel.`;
    $('detections').replaceChildren();
    if (!audit.predictions.length) {
      $('detections').innerHTML = `<div class="results-empty"><span>${icon('eye')}</span><p>Aucune prédiction retenue à ce seuil.<br>Vérifiez le cadrage et les équipements sur place.</p></div>`;
    }
    for (const item of EQUIPMENT.filter((category) => audit.counts[category.id] > 0)) {
      const group = document.createElement('div');
      group.className = 'detection-group';
      const categoryPredictions = audit.predictions.filter((prediction) => prediction.class === item.modelClass);
      group.innerHTML = `<div class="detection-group-heading"><span class="equipment-icon">${icon(item.icon)}</span><strong>${item.label}</strong><span class="detection-quantity">${categoryPredictions.length}</span></div>`;
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Voir les scores de confiance';
      details.append(summary);
      const scores = document.createElement('p');
      scores.textContent = categoryPredictions.map((prediction, index) => `#${index + 1} : ${Math.round(prediction.score * 100)} %${prediction.model ? ` (${prediction.model === 'faster-rcnn' ? 'Faster R-CNN' : 'COCO-SSD'})` : ''}`).join(' · ');
      details.append(scores);
      group.append(details);
      $('detections').append(group);
    }
    const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(state.analysis.at));
    const method = state.analysis.engines?.includes('faster-rcnn') ? 'COCO-SSD détaillé + Faster R-CNN'
      : state.analysis.regions > 1 ? 'Vue complète et 4 zones rapprochées' : 'Vue complète';
    $('analysis-meta').textContent = `${state.analysis.source === 'camera' ? 'Capture webcam' : 'Image importée'} · ${date} · ${method} · Analyse ${state.analysis.durationMs / 1000} s, dont inférence ${state.analysis.inferenceMs / 1000} s. Résultats limités à cette vue.${audit.truncated ? ' Limite de 100 détections atteinte : comptage potentiellement incomplet.' : ''}`;
    $('analysis-meta').hidden = false;
  }
  drawDetections(audit?.predictions ?? []);
  renderModel();
}

async function analyze() {
  if (!state.source || state.busy || invalidConfiguration()) return;
  const version = state.sourceVersion;
  const source = state.source === 'camera' || state.source === 'capture' ? 'camera' : 'image';
  const started = performance.now();
  const capturedAt = new Date().toISOString();
  if (state.stream) {
    if (!video.videoWidth || !video.videoHeight) { notify('La caméra n’est pas encore prête. Réessayez dans un instant.', 'error'); return; }
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext('2d').drawImage(video, 0, 0);
    stopTracks();
    state.source = 'capture';
  }
  // Separate pixels prevent a source reset from altering an ongoing inference.
  const snapshot = document.createElement('canvas');
  snapshot.width = frame.width; snapshot.height = frame.height;
  snapshot.getContext('2d').drawImage(frame, 0, 0);
  state.busy = true;
  state.activeVersion = version;
  state.analysis = null;
  state.analysisProgress = null;
  renderSource();
  let loaded = false;
  const hybrid = $('analysis-mode').value === 'hybrid';
  try {
    if (state.modelState !== 'ready') { state.modelState = 'loading'; state.modelProgress = 0; renderModel(); }
    const { getDetector } = await import('./detector.js');
    const detector = await getDetector(({ progress }) => { state.modelProgress = progress; renderModel(); });
    loaded = true;
    state.modelState = 'ready';
    renderModel();
    if (version !== state.sourceVersion) return;
    let result = await detector.detect(snapshot, {
      detailed: $('analysis-mode').value !== 'quick',
      onProgress: (progress) => {
        if (version !== state.sourceVersion) return;
        state.analysisProgress = progress; renderModel();
      },
    });
    if (version !== state.sourceVersion) return;
    if (hybrid) {
      state.modelState = 'loading'; state.modelProgress = 0; loaded = false; renderModel();
      const { getFasterDetector } = await import('./faster-detector.js');
      const faster = await getFasterDetector(({ progress }) => { state.modelProgress = progress; renderModel(); });
      activeFaster = faster;
      loaded = true; state.modelState = 'ready'; state.analysisProgress = { phase: 'faster' }; renderModel();
      if (version !== state.sourceVersion) return;
      const second = await faster.detect(snapshot);
      if (version !== state.sourceVersion) return;
      const merged = mergeDetectors(result.predictions, second.predictions);
      result = { ...result, ...merged, truncated: result.truncated || second.truncated || merged.truncated,
        inferenceMs: result.inferenceMs + second.inferenceMs, engines: ['coco-ssd', 'faster-rcnn'] };
    }
    state.analysis = { ...result, source, at: capturedAt, durationMs: Math.round(performance.now() - started) };
    notify('Analyse terminée. Les écarts concernent uniquement cette vue et demandent une vérification sur place.');
  } catch {
    state.modelState = loaded ? 'ready' : 'error';
    if (version === state.sourceVersion) notify(hybrid
      ? 'Le mode combiné a échoué sur cet appareil. Réessayez ou choisissez un mode COCO seul. Aucun résultat combiné n’a été produit.'
      : loaded
      ? 'L’analyse a échoué. Réessayez avec une image plus petite ou un autre navigateur.'
      : 'Impossible de charger le modèle. Vérifiez votre connexion, puis réessayez. Aucune détection n’a été produite.', 'error');
  } finally {
    snapshot.width = snapshot.height = 0;
    state.busy = false;
    renderSource();
  }
}

function switchSource(mode) {
  if (mode === state.mode) return;
  clearSource();
  state.mode = mode;
  notify('');
  renderSource();
}

async function importImage(file) {
  const error = validateImageFile(file);
  if (error) { notify(error, 'error'); return; }
  clearSource();
  state.mode = 'image';
  const version = state.sourceVersion;
  renderSource();
  notify('Ouverture de l’image…');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (version !== state.sourceVersion) return;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
      throw new Error('IMAGE_DIMENSIONS');
    }
    const scale = Math.min(1, 1920 / Math.max(width, height));
    frame.width = Math.round(width * scale);
    frame.height = Math.round(height * scale);
    frame.getContext('2d').drawImage(image, 0, 0, frame.width, frame.height);
    state.source = 'image';
    renderSource();
    notify('Image prête. Vérifiez que seuls les équipements et le mobilier sont visibles.');
  } catch (cause) {
    if (version !== state.sourceVersion) return;
    clearSource();
    renderSource();
    notify(cause.message === 'IMAGE_DIMENSIONS'
      ? 'Cette image dépasse 40 mégapixels ou ses dimensions sont invalides. Réduisez-la avant de l’importer.'
      : 'Cette image ne peut pas être lue. Vérifiez le fichier et choisissez une image JPEG, PNG ou WebP valide.', 'error');
  } finally {
    URL.revokeObjectURL(url);
    image.src = '';
  }
}

async function startCamera() {
  clearSource();
  state.mode = 'camera';
  const version = state.sourceVersion;
  renderSource();
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    notify('La caméra nécessite une connexion HTTPS ou localhost et un navigateur compatible. Vous pouvez importer une image.', 'error');
    return;
  }
  $('start-camera').disabled = true;
  // Cancellation remains available while the browser asks for permission.
  $('stop-camera').hidden = false;
  notify('Autorisez la caméra dans votre navigateur. Cadrez uniquement le mobilier et les équipements.');
  let acquiredStream;
  try {
    acquiredStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (version !== state.sourceVersion) {
      acquiredStream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.stream = acquiredStream;
    video.srcObject = acquiredStream;
    await video.play();
    if (version !== state.sourceVersion) return;
    state.source = 'camera';
    acquiredStream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (version !== state.sourceVersion) return;
        clearSource();
        renderSource();
        notify('La caméra a été déconnectée. Reconnectez-la ou importez une image.', 'error');
      });
    });
    renderSource();
    notify('Caméra active. Cadrez une salle vide et arrêtez la caméra dès que vous avez terminé.');
  } catch (error) {
    if (version !== state.sourceVersion) return;
    clearSource();
    renderSource();
    notify(cameraErrorMessage(error), 'error');
  }
}

$('tab-image').addEventListener('click', () => switchSource('image'));
$('tab-camera').addEventListener('click', () => switchSource('camera'));
$('pick-image').addEventListener('click', () => $('image-input').click());
$('change-image').addEventListener('click', () => $('image-input').click());
$('image-input').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) void importImage(file);
});
$('start-camera').addEventListener('click', () => { void startCamera(); });
$('stop-camera').addEventListener('click', () => {
  clearSource();
  renderSource();
  notify('Caméra arrêtée. Aucun flux vidéo n’est conservé.');
});
$('reset').addEventListener('click', () => {
  clearSource();
  renderSource();
  notify('Nouvel audit prêt. La source a été effacée ; la configuration de la salle est conservée.');
});
$('reset-config').addEventListener('click', () => {
  state.expected = exampleConfiguration();
  $('configuration-badge').textContent = 'Configuration d’exemple';
  renderConfiguration();
  renderAudit();
  notify('Quantités d’exemple rétablies. Adaptez-les à votre salle avant un audit.');
});
$('room-name').addEventListener('input', configurationChanged);
$('room-name').addEventListener('blur', (event) => {
  if (!event.target.value.trim()) event.target.value = 'Salle sans nom';
});
$('analyze').addEventListener('click', () => { void analyze(); });
$('retry-model').addEventListener('click', () => { void analyze(); });
$('confidence').addEventListener('input', () => {
  $('confidence-value').textContent = `${$('confidence').value} %`;
  renderAudit();
});
$('analysis-mode').addEventListener('change', () => {
  if ($('analysis-mode').value !== 'hybrid') { activeFaster?.dispose(); activeFaster = undefined; }
  state.sourceVersion += 1;
  state.analysis = null;
  state.analysisProgress = null;
  renderAudit();
  if (state.source) notify('Mode d’analyse modifié. Relancez l’analyse pour obtenir les résultats correspondants.');
});
$('report-hint').textContent = 'Consultation et export du rapport prévus à la prochaine étape.';

const navLinks = [...document.querySelectorAll('.nav-link')];
navLinks.forEach((link) => link.addEventListener('click', () => {
  navLinks.forEach((item) => item.classList.toggle('active', item === link));
}));
const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach((link) => {
    const active = link.hash === `#${visible.target.id}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}, { rootMargin: '-10% 0px -50% 0px', threshold: [0, 0.2, 0.5] });
['audit', 'configuration', 'rapport', 'methode'].forEach((id) => sectionObserver.observe($(id)));

window.addEventListener('pagehide', () => { clearSource(); renderSource(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state.stream || $('start-camera').disabled)) {
    clearSource();
    renderSource();
    notify('La caméra a été arrêtée pendant votre absence. Redémarrez-la pour reprendre.');
  }
});

renderConfiguration();
renderSource();
