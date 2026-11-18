import React, { useState } from 'react';
import {
  Calendar,
  Car,
  Download,
  Edit3,
  Eye,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  User,
} from 'lucide-react';
import { GarageDocument, Vehicle } from '../types/garage';
import { formatFileSize, getDocumentCategoryLabel } from '../utils/documents';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

interface DocumentCardProps {
  doc: GarageDocument;
  boundVehicle?: Vehicle;
  showVehicleLink?: boolean;
  onSelectVehicle?: (vehicle: Vehicle) => void;
  onPreview: (doc: GarageDocument) => void;
  onDownload: (doc: GarageDocument) => void;
  onEdit?: (doc: GarageDocument) => void;
  onDelete: (doc: GarageDocument) => Promise<void> | void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  doc,
  boundVehicle,
  showVehicleLink = true,
  onSelectVehicle,
  onPreview,
  onDownload,
  onEdit,
  onDelete,
}) => {
  const { lang, t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isImage = doc.mimeType.startsWith('image/');

  return (
    <article
      data-testid={`document-card-${doc.id}`}
      className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-col justify-between gap-3.5 hover:border-[var(--primary)]/50 transition"
    >
      <div className="space-y-3">
        {/* Header: File Thumbnail + Title + Category */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onPreview(doc)}
            className="w-12 h-12 rounded-[var(--ag-button-radius)] border border-[var(--border)] bg-[var(--surface-muted)] flex items-center justify-center overflow-hidden shrink-0 hover:opacity-90 transition"
            title={`${t('docsPreviewBtn')} — ${doc.title}`}
            aria-label={`${t('docsPreviewBtn')} — ${doc.title}`}
          >
            {isImage ? (
              <img
                src={doc.fileUrl}
                alt={doc.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <FileText className="w-6 h-6 text-rose-400" />
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--foreground)] leading-snug line-clamp-2">
                {doc.title}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
                {getDocumentCategoryLabel(doc.category, lang)}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] tabular-nums">
                {isImage ? (
                  <ImageIcon className="w-3 h-3" />
                ) : (
                  <Paperclip className="w-3 h-3" />
                )}
                {formatFileSize(doc.fileSize)}
              </span>
            </div>
          </div>
        </div>

        {/* Entity Binding Info */}
        <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-2.5 space-y-1.5 text-xs">
          {showVehicleLink && doc.vehicleLabel && (
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[var(--muted-foreground)] shrink-0">
                <Car className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {pickLocalized(lang, {
                    fr: 'Véhicule',
                    ru: 'Авто',
                    hy: 'Մեքենա',
                    ka: 'ავტომობილი',
                  })}
                  :
                </span>
              </span>
              {boundVehicle && onSelectVehicle ? (
                <button
                  type="button"
                  onClick={() => onSelectVehicle(boundVehicle)}
                  className="font-semibold text-[var(--primary)] hover:underline truncate text-right"
                >
                  {doc.vehicleLabel}
                </button>
              ) : (
                <span className="font-semibold text-[var(--foreground)] truncate text-right">
                  {doc.vehicleLabel}
                </span>
              )}
            </div>
          )}

          {doc.clientName && (
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[var(--muted-foreground)] shrink-0">
                <User className="w-3.5 h-3.5 text-violet-400" />
                <span>
                  {pickLocalized(lang, {
                    fr: 'Client',
                    ru: 'Клиент',
                    hy: 'Հաճախորդ',
                    ka: 'კლიენტი',
                  })}
                  :
                </span>
              </span>
              <span className="font-semibold text-[var(--foreground)] truncate text-right">
                {doc.clientName}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1 truncate">
              <Calendar className="w-3 h-3 shrink-0" />
              <span className="tabular-nums">{doc.documentDate}</span>
            </span>
            <span className="truncate max-w-[160px]" title={doc.fileName}>
              {doc.fileName}
            </span>
          </div>
        </div>

        {doc.notes && (
          <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2">
            {doc.notes}
          </p>
        )}
      </div>

      {/* Action Bar */}
      <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid={`doc-preview-${doc.id}`}
            onClick={() => onPreview(doc)}
            aria-label={`${t('docsPreviewBtn')} ${doc.title}`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-[11px] font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)] transition"
          >
            <Eye className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>{t('docsPreviewBtn')}</span>
          </button>

          <button
            type="button"
            data-testid={`doc-download-${doc.id}`}
            onClick={() => onDownload(doc)}
            aria-label={`${t('docsDownloadBtn')} ${doc.title}`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-[11px] font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-sky-500/50 transition"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>{t('docsDownloadBtn')}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              data-testid={`doc-edit-${doc.id}`}
              onClick={() => onEdit(doc)}
              title={`${t('docsEditBtn')} — ${doc.title}`}
              aria-label={`${t('docsEditBtn')} — ${doc.title}`}
              className="p-1.5 rounded-[var(--ag-button-radius)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid={`doc-confirm-delete-${doc.id}`}
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await onDelete(doc);
                  } finally {
                    setIsDeleting(false);
                    setConfirmDelete(false);
                  }
                }}
                className="px-2 py-1 rounded text-[10px] font-bold bg-rose-600 text-white disabled:opacity-50"
              >
                {t('docsConfirmDeleteBtn')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded text-[10px] font-semibold bg-[var(--surface-muted)] text-[var(--foreground)]"
              >
                {t('docsCancelBtn')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid={`doc-delete-${doc.id}`}
              onClick={() => setConfirmDelete(true)}
              title={`${t('docsDeleteBtn')} — ${doc.title}`}
              aria-label={`${t('docsDeleteBtn')} — ${doc.title}`}
              className="p-1.5 rounded-[var(--ag-button-radius)] text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-rose-500/10 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
