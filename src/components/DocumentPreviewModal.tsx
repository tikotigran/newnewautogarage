import React, { useMemo } from 'react';
import { Download, FileText, History, X } from 'lucide-react';
import {
  DocumentHistoryAction,
  DocumentHistoryEvent,
  GarageDocument,
} from '../types/garage';
import { formatFileSize, getDocumentCategoryLabel } from '../utils/documents';
import { useI18n } from '../i18n/I18nContext';
import { getIntlLocale, pickLocalized } from '../utils/i18nUtils';
import { PdfCanvasPreview } from './PdfCanvasPreview';

interface DocumentPreviewModalProps {
  doc: GarageDocument | null;
  historyEvents: DocumentHistoryEvent[];
  onClose: () => void;
  onDownload: (doc: GarageDocument) => void;
}

function getActionBadgeStyle(action: DocumentHistoryAction): string {
  switch (action) {
    case 'uploaded':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'downloaded':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'linked':
      return 'bg-violet-500/15 text-violet-400 border-violet-500/30';
    case 'updated':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'deleted':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    default:
      return 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]';
  }
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  doc,
  historyEvents,
  onClose,
  onDownload,
}) => {
  const { lang, t } = useI18n();

  const previewDocHistory = useMemo(() => {
    if (!doc) return [];
    return historyEvents.filter((e) => e.documentId === doc.id);
  }, [doc, historyEvents]);

  if (!doc) return null;

  const getHistoryActionLabel = (action: DocumentHistoryAction): string => {
    switch (action) {
      case 'uploaded':
        return t('docsActionUploaded');
      case 'updated':
        return t('docsActionUpdated');
      case 'downloaded':
        return t('docsActionDownloaded');
      case 'linked':
        return t('docsActionLinked');
      case 'deleted':
        return t('docsActionDeleted');
      default:
        return action;
    }
  };

  return (
    <div
      data-testid="document-preview-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] truncate">
              {doc.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
              <span>{getDocumentCategoryLabel(doc.category, lang)}</span>
              {doc.vehicleLabel && <span>• {doc.vehicleLabel}</span>}
              {doc.clientName && <span>• {doc.clientName}</span>}
              <span>• {formatFileSize(doc.fileSize)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="preview-download-btn"
              onClick={() => onDownload(doc)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('docsDownloadBtn')}</span>
            </button>
            <button
              type="button"
              data-testid="preview-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3">
          {/* Main File Viewport */}
          <div className="lg:col-span-2 bg-[var(--background)] p-4 flex items-center justify-center min-h-[380px]">
            {doc.mimeType.startsWith('image/') ? (
              <img
                src={doc.fileUrl}
                alt={doc.title}
                className="max-h-[65vh] w-auto rounded-lg border border-[var(--border)] object-contain shadow"
              />
            ) : doc.mimeType.includes('pdf') ? (
              <PdfCanvasPreview
                fileUrl={doc.fileUrl}
                title={doc.title}
                fallbackText={t('docsPreviewUnsupported')}
              />
            ) : (
              <div className="text-center space-y-3 p-6">
                <FileText className="w-12 h-12 text-[var(--muted-foreground)] mx-auto" />
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t('docsPreviewUnsupported')}
                </p>
                <button
                  type="button"
                  onClick={() => onDownload(doc)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('docsDownloadBtn')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Side Metadata & Document Audit History */}
          <div className="border-t lg:border-t-0 lg:border-l border-[var(--border)] p-4 space-y-4 bg-[var(--card)]">
            <div className="space-y-2 text-xs">
              <div className="font-bold uppercase tracking-wider text-[10px] text-[var(--muted-foreground)]">
                {pickLocalized(lang, {
                  fr: 'Métadonnées & Liaison',
                  ru: 'Информация и привязка',
                  hy: 'Տվյալներ և կապակցում',
                  ka: 'მონაცემები და ბმა',
                })}
              </div>
              <div className="space-y-1.5 bg-[var(--background)] border border-[var(--border)] rounded-xl p-3">
                <div>
                  <span className="text-[var(--muted-foreground)]">
                    {pickLocalized(lang, {
                      fr: 'Fichier',
                      ru: 'Файл',
                      hy: 'Ֆայլ',
                      ka: 'ფაილი',
                    })}
                    :{' '}
                  </span>
                  <span className="font-semibold text-[var(--foreground)] break-all">
                    {doc.fileName}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted-foreground)]">
                    {pickLocalized(lang, {
                      fr: 'Date',
                      ru: 'Дата',
                      hy: 'Ամսաթիվ',
                      ka: 'თარიღი',
                    })}
                    :{' '}
                  </span>
                  <span className="font-semibold text-[var(--foreground)] tabular-nums">
                    {doc.documentDate}
                  </span>
                </div>
                {doc.vehicleLabel && (
                  <div>
                    <span className="text-[var(--muted-foreground)]">
                      {pickLocalized(lang, {
                        fr: 'Véhicule',
                        ru: 'Авто',
                        hy: 'Մեքենա',
                        ka: 'ავტომობილი',
                      })}
                      :{' '}
                    </span>
                    <span className="font-semibold text-[var(--primary)]">
                      {doc.vehicleLabel}
                    </span>
                  </div>
                )}
                {doc.clientName && (
                  <div>
                    <span className="text-[var(--muted-foreground)]">
                      {pickLocalized(lang, {
                        fr: 'Client',
                        ru: 'Клиент',
                        hy: 'Հաճախորդ',
                        ka: 'კლიენტი',
                      })}
                      :{' '}
                    </span>
                    <span className="font-semibold text-[var(--foreground)]">
                      {doc.clientName}
                    </span>
                  </div>
                )}
                {doc.notes && (
                  <div>
                    <span className="text-[var(--muted-foreground)]">
                      {pickLocalized(lang, {
                        fr: 'Notes',
                        ru: 'Заметки',
                        hy: 'Նշումներ',
                        ka: 'შენიშვნები',
                      })}
                      :{' '}
                    </span>
                    <span className="text-[var(--foreground)]">{doc.notes}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-bold uppercase tracking-wider text-[10px] text-[var(--muted-foreground)] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span>{t('docsTabHistory')}</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {previewDocHistory.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-2.5 text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getActionBadgeStyle(
                          ev.action
                        )}`}
                      >
                        {getHistoryActionLabel(ev.action)}
                      </span>
                      <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                        {new Date(ev.timestamp).toLocaleDateString(getIntlLocale(lang))}
                      </span>
                    </div>
                    {ev.actorEmail && (
                      <div className="text-[10px] text-[var(--muted-foreground)]">
                        {ev.actorEmail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
