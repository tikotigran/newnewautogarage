import React, { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface CerfaLivePreviewSheetProps {
  title: string;
  activeFieldLabel?: string;
  generatePdfBytes: () => Promise<Uint8Array>;
  dependencyKey: string;
  testIdPrefix?: string;
  heightClassName?: string;
  maxPageWidthClassName?: string;
}

export const CerfaLivePreviewSheet: React.FC<CerfaLivePreviewSheetProps> = ({
  title,
  activeFieldLabel,
  generatePdfBytes,
  dependencyKey,
  testIdPrefix = 'cerfa-aligner',
  heightClassName = 'h-full min-h-[480px]',
  maxPageWidthClassName = 'max-w-[740px]',
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderPhase, setRenderPhase] = useState<string>('idle');

  useEffect(() => {
    let cancelled = false;
    let activeLoadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    let activeRenderTask: { cancel?: () => void } | null = null;
    setIsRendering(true);
    setPreviewError(null);
    setRenderPhase('debounce');

    const timer = setTimeout(async () => {
      try {
        setRenderPhase('buildPdf');
        const bytes = await generatePdfBytes();
        if (cancelled) return;

        setRenderPhase('getDocument');
        activeLoadingTask = pdfjsLib.getDocument({
          data: bytes.slice(),
          isOffscreenCanvasSupported: false,
        });
        const pdf = await activeLoadingTask.promise;
        if (cancelled) return;

        const renderedPages: string[] = [];
        const maxPages = Math.min(pdf.numPages, 4);

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          setRenderPhase(`getPage:${pageNum}`);
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.45 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          setRenderPhase(`render:${pageNum}`);
          const renderTask = page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          } as Parameters<typeof page.render>[0]);
          activeRenderTask = renderTask;
          await renderTask.promise;
          activeRenderTask = null;
          if (cancelled) return;
          renderedPages.push(canvas.toDataURL('image/jpeg', 0.92));
        }

        if (!cancelled) {
          setPreviewPages(renderedPages);
          setRenderPhase('done');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Cerfa preview render error:', err);
          setRenderPhase('error');
          setPreviewError(
            err instanceof Error
              ? err.message
              : L(
                  'Impossible d’afficher l’aperçu PDF Cerfa.',
                  'Не удалось отобразить предпросмотр PDF Cerfa.',
                  'Չհաջողվեց ցուցադրել Cerfa PDF նախադիտումը։',
                  'Cerfa PDF გადახედვის ჩვენება ვერ მოხერხდა.'
                )
          );
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      try {
        activeRenderTask?.cancel?.();
      } catch {
        // ignore cancel errors
      }
      try {
        void activeLoadingTask?.destroy?.();
      } catch {
        // ignore destroy errors
      }
    };
  }, [dependencyKey, generatePdfBytes]);

  return (
    <div
      data-testid={`${testIdPrefix}-preview-pane`}
      data-phase={renderPhase}
      className={`bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden relative flex flex-col ${heightClassName}`}
    >
      <div className="px-3.5 py-2 border-b border-slate-800 bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-slate-300 truncate">{title}</span>
          {activeFieldLabel && (
            <span
              data-testid={`${testIdPrefix}-highlighted-badge`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-red-500/40 text-amber-300 text-[10px] font-bold truncate max-w-[230px]"
            >
              <Sparkles className="w-3 h-3 text-red-400 shrink-0" />
              <span className="truncate">{activeFieldLabel}</span>
            </span>
          )}
        </div>
        {isRendering && (
          <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{L('Actualisation...', 'Обновление...', 'Թարմացում...', 'განახლება...')}</span>
          </span>
        )}
      </div>

      {previewError && previewPages.length === 0 ? (
        <div
          data-testid={`${testIdPrefix}-preview-error`}
          className="flex-1 flex flex-col items-center justify-center p-6 text-center text-red-400 gap-2"
        >
          <AlertCircle className="w-6 h-6" />
          <p className="text-xs font-semibold">{previewError}</p>
        </div>
      ) : previewPages.length > 0 ? (
        <div
          data-testid={`${testIdPrefix}-preview-pages`}
          className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-900/60"
        >
          {previewPages.map((src, idx) => (
            <div
              key={idx}
              className={`bg-white rounded-lg border border-slate-700/60 shadow-lg overflow-hidden mx-auto ${maxPageWidthClassName}`}
            >
              <img
                src={src}
                alt={`${title} - ${L('Page', 'Стр.', 'Էջ', 'გვ.')} ${idx + 1}`}
                className="w-full h-auto block"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span>{L('Chargement de l’aperçu PDF...', 'Загрузка предпросмотра PDF...', 'PDF նախադիտման բեռնում...', 'PDF გადახედვის ჩატვირთვა...')}</span>
        </div>
      )}
    </div>
  );
};
