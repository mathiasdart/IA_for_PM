import './style.css';
import { EQUIPMENT, exampleConfiguration, parseQuantity, validateImageFile, cameraErrorMessage } from './configuration.js';
import { hydrateIcons, icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const state = { mode: 'image', stream: null, source: null, sourceVersion: 0, expected: exampleConfiguration() };
const video = $('camera');
const frame = $('frame');
const MAX_IMAGE_PIXELS = 40_000_000;

hydrateIcons();

function notify(message, kind = 'info') {
  $('notification').textContent = message;
  $('notification').dataset.kind = kind;
  $('notification').hidden = !message;
}

function configurationChanged() {
  $('configuration-badge').textContent = 'Configuration personnalisée';
}

function renderConfiguration() {
  const body = $('configuration-rows');
  body.replaceChildren();
  for (const item of EQUIPMENT) {
    const row = document.createElement('tr');
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
      notify('Quantité invalide : saisissez un entier de 0 à 999. La dernière valeur valide a été conservée.', 'error');
    });
    quantityCell.append(input);
    const observedCell = document.createElement('td');
    observedCell.className = 'unobserved';
    observedCell.textContent = '—';
    const differenceCell = observedCell.cloneNode(true);
    const verificationCell = document.createElement('td');
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
  stopTracks();
  state.source = null;
  frame.width = frame.height = 0;
  $('overlay').width = $('overlay').height = 0;
  $('overlay').hidden = true;
  $('image-input').value = '';
}

function renderSource() {
  const isCamera = state.mode === 'camera';
  const live = Boolean(state.stream);
  const imageReady = state.source === 'image';
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
  $('change-image').hidden = !imageReady;
  $('analyze-label').textContent = isCamera ? 'Analyser la vue' : 'Analyser l’image';
  $('capture-title').textContent = isCamera ? 'Un regard sur vos équipements.' : 'Votre salle, sous un nouvel angle.';
  $('capture-description').textContent = isCamera
    ? 'Démarrez la caméra et cadrez le mobilier d’une salle vide. Vous gardez le contrôle de la source.'
    : 'Importez une photo du mobilier et des équipements. Choisissez une vue dégagée, sans personne.';
  $('source-badge').textContent = live ? 'Caméra active' : imageReady ? 'Image prête' : 'Aucune source';
  $('source-badge').className = `badge ${live || imageReady ? 'badge-success' : 'badge-neutral'}`;
  $('audit-status-title').textContent = live || imageReady ? 'Source prête pour l’audit' : 'Prêt quand vous l’êtes';
  $('audit-status-description').textContent = live || imageReady
    ? 'Vérifiez votre cadrage et la configuration attendue. La détection sera activée à la prochaine étape.'
    : 'Ajoutez une image ou démarrez la caméra pour préparer votre audit.';
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
  notify('Quantités d’exemple rétablies. Adaptez-les à votre salle avant un audit.');
});
$('room-name').addEventListener('input', configurationChanged);
$('room-name').addEventListener('blur', (event) => {
  if (!event.target.value.trim()) event.target.value = 'Salle sans nom';
});
$('confidence').disabled = true;
$('confidence').setAttribute('aria-describedby', 'analysis-availability');
$('report-hint').textContent = 'Le rapport sera disponible après l’activation de la détection.';

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
