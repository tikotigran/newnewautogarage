import React, { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileText, Loader2 } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasPreviewProps {
  fileUrl: string;
  title: string;
  fallbackText?: string;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export const PdfCanvasPreview: React.FC<PdfCanvasPreviewProps> = ({
  fileUrl,
  title,
  fallbackText,
}) => {
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPages([]);

    const renderPdf = async () => {
      try {
        let task;
        if (fileUrl.startsWith('data:')) {
          const bytes = dataUrlToUint8Array(fileUrl);
          if (!bytes) throw new Error('invalid_pdf_data');
          task = pdfjsLib.getDocument({ data: bytes });
        } else {
          task = pdfjsLib.getDocument({ url: fileUrl });
        }

        const pdf = await task.promise;
        if (cancelled) return;
        setTotalPages(pdf.numPages);

        const maxPages = Math.min(pdf.numPages, 8);
        const renderedUrls: string[] = [];

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
          if (cancelled) return;
          renderedUrls.push(canvas.toDataURL('image/png'));
        }

        if (!cancelled) {
          setPages(renderedUrls);
          setLoading(false);
        }
      } catch (err) {
        console.warn('PDF canvas preview fallback:', err);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };

    renderPdf();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--muted-foreground)]">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--primary)]" />
        <span className="text-xs font-medium">{title}</span>
      </div>
    );
  }

  if (error || pages.length === 0) {
    return (
      <div className="text-center space-y-3 p-6">
        <FileText className="w-12 h-12 text-[var(--muted-foreground)] mx-auto" />
        <p className="text-xs text-[var(--muted-foreground)]">
          {fallbackText || title}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="pdf-canvas-preview" className="w-full space-y-3 max-h-[65vh] overflow-y-auto px-1">
      {pages.map((src, idx) => (
        <div key={idx} className="bg-white rounded-lg border border-[var(--border)] shadow overflow-hidden">
          <img
            src={src}
            alt={`${title} - Page ${idx + 1}`}
            className="w-full h-auto block"
          />
        </div>
      ))}
      {totalPages > pages.length && (
        <div className="text-center text-[11px] text-[var(--muted-foreground)] py-1">
          {pages.length} / {totalPages}
        </div>
      )}
    </div>
  );
};
