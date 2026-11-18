import { GarageDocument } from '../types/garage';
import { recordDocumentDownload } from '../services/documentService';
import { MAX_PDF_UPLOAD_BYTES } from './documents';

export const MAX_PDF_BYTES = MAX_PDF_UPLOAD_BYTES; // 5 MB max PDF upload size
export const MAX_IMAGE_TARGET_BYTES = 300 * 1024; // Compress raster images <= 300 KB

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('pdf_read_error'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageFileToDataUrl(
  file: File
): Promise<{ dataUrl: string; mimeType: string; size: number }> {
  if (file.type === 'image/svg+xml') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read_failed'));
      reader.readAsDataURL(file);
    });
    return { dataUrl, mimeType: file.type, size: file.size };
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });

  if (file.size <= MAX_IMAGE_TARGET_BYTES) {
    return { dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg', size: file.size };
  }

  // Canvas resize + progressive JPEG compression for large vehicle photos
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('img_decode_failed'));
    el.src = rawDataUrl;
  });

  const maxDim = 1400;
  let width = img.naturalWidth || 1200;
  let height = img.naturalHeight || 900;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg', size: file.size };
  }
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.82;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length * 0.75 > MAX_IMAGE_TARGET_BYTES && quality > 0.35) {
    quality -= 0.12;
    out = canvas.toDataURL('image/jpeg', quality);
  }

  const approxBytes = Math.round(out.length * 0.75);
  return { dataUrl: out, mimeType: 'image/jpeg', size: approxBytes };
}

export async function triggerDocumentDownload(
  doc: GarageDocument,
  actorEmail?: string | null
): Promise<void> {
  const link = document.createElement('a');
  link.href = doc.fileUrl;
  link.download = doc.fileName || `${doc.title}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  await recordDocumentDownload(doc, actorEmail || undefined);
}
