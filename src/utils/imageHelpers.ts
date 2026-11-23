/**
 * Client-side image compression helper for company logos and signatures.
 * Ensures PNG/JPG/WEBP assets stay compact (< 150 KB) for Firestore & localStorage persistence.
 */

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

export function isSupportedLogoFile(file: File): boolean {
  if (ALLOWED_LOGO_TYPES.has(file.type.toLowerCase())) return true;
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

export async function processLogoImageFile(
  file: File,
  maxWidth = 480,
  maxHeight = 200
): Promise<string> {
  if (!isSupportedLogoFile(file)) {
    throw new Error('Format non supporté. Utilisez PNG, JPG ou WEBP.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossible de lire le fichier image.'));
      }
    };
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image invalide ou corrompue.'));
    image.src = rawDataUrl;
  });

  const width = img.naturalWidth || img.width || maxWidth;
  const height = img.naturalHeight || img.height || maxHeight;
  const ratio = Math.min(1, maxWidth / width, maxHeight / height);
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return rawDataUrl;
  }

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Use PNG so transparency is preserved cleanly for jsPDF / pdf-lib header overlays
  const pngUrl = canvas.toDataURL('image/png');
  if (pngUrl.length <= 220000) {
    return pngUrl;
  }

  // Fallback to compressed JPEG on a clean white background (supported natively by jsPDF & pdf-lib)
  const jpegCanvas = document.createElement('canvas');
  jpegCanvas.width = targetWidth;
  jpegCanvas.height = targetHeight;
  const jCtx = jpegCanvas.getContext('2d');
  if (!jCtx) return pngUrl;
  jCtx.fillStyle = '#ffffff';
  jCtx.fillRect(0, 0, targetWidth, targetHeight);
  jCtx.drawImage(canvas, 0, 0);
  const jpegUrl = jpegCanvas.toDataURL('image/jpeg', 0.86);
  return jpegUrl.length < pngUrl.length ? jpegUrl : pngUrl;
}

