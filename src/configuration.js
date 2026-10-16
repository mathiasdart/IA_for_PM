/** Capacités prévues de COCO-SSD. Aucune catégorie n’est une détection. */
export const EQUIPMENT = Object.freeze([
  { id: 'chair', label: 'Chaises', icon: 'chair', modelClass: 'chair', support: 'direct', detail: 'Classe : chair', example: 20 },
  { id: 'table', label: 'Tables et bureaux', icon: 'table', modelClass: 'dining table', support: 'approximate', detail: 'Classe approchante : dining table', example: 10 },
  { id: 'laptop', label: 'Ordinateurs portables', icon: 'laptop', modelClass: 'laptop', support: 'direct', detail: 'Classe : laptop', example: 5 },
  { id: 'screen', label: 'Écrans', icon: 'monitor', modelClass: 'tv', support: 'approximate', detail: 'Classe approchante : tv', example: 0 },
  { id: 'board', label: 'Tableaux', icon: 'board', modelClass: null, support: 'manual', detail: 'Catégorie non prise en charge', example: 1 },
  { id: 'window', label: 'Fenêtres', icon: 'window', modelClass: null, support: 'manual', detail: 'Catégorie non prise en charge', example: 0 },
]);

export function exampleConfiguration() {
  return Object.fromEntries(EQUIPMENT.map(({ id, example }) => [id, example]));
}

export function parseQuantity(value) {
  const text = String(value).trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const number = Number(text);
  return number <= 999 ? number : null;
}

export function validateImageFile(file) {
  if (!file) return 'Choisissez une image à importer.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Format non pris en charge. Choisissez une image JPEG, PNG ou WebP.';
  }
  if (file.size === 0) return 'Ce fichier est vide. Choisissez une autre image.';
  if (file.size > 15 * 1024 * 1024) return 'Cette image dépasse 15 Mo. Choisissez un fichier plus léger.';
  return null;
}

export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: 'Accès à la caméra refusé. Autorisez-le dans votre navigateur, ou importez une image.',
    PermissionDeniedError: 'Accès à la caméra refusé. Autorisez-le dans votre navigateur, ou importez une image.',
    NotFoundError: 'Aucune caméra détectée. Branchez une caméra ou importez une image.',
    DevicesNotFoundError: 'Aucune caméra détectée. Branchez une caméra ou importez une image.',
    NotReadableError: 'La caméra est indisponible. Fermez les autres applications qui l’utilisent, puis réessayez.',
    TrackStartError: 'La caméra est indisponible. Fermez les autres applications qui l’utilisent, puis réessayez.',
    OverconstrainedError: 'La caméra ne peut pas utiliser ces paramètres. Essayez une autre caméra ou importez une image.',
    SecurityError: 'Le navigateur bloque la caméra. Ouvrez l’application en HTTPS ou sur localhost.',
  };
  return messages[error?.name] ?? 'Impossible de démarrer la caméra. Vérifiez les autorisations ou importez une image.';
}
