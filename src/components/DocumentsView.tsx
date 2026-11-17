import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Car,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FilePlus2,
  FileText,
  History,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Search,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  DocumentBindingType,
  DocumentHistoryAction,
  DocumentHistoryEvent,
  GarageDocument,
  GarageDocumentCategory,
  Purchase,
  Vehicle,
} from '../types/garage';
import {
  computeMissingDocumentReminders,
  DOCUMENT_CATEGORIES,
  extractUniqueClients,
  formatFileSize,
  formatVehicleSummaryLabel,
  getDocumentCategoryLabel,
  inferCategoryFromFileName,
  MissingDocumentReminder,
  resolveDocumentBinding,
  searchAndFilterDocuments,
  validateDocumentInput,
} from '../utils/documents';
import {
  createGarageDocument,
  deleteGarageDocument,
  recordDocumentDownload,
  updateGarageDocument,
} from '../services/documentService';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';
import { getIntlLocale, pickLocalized } from '../utils/i18nUtils';
import { useI18n } from '../i18n/I18nContext';
import { ThemedSelect } from './ThemedSelect';
import { PdfCanvasPreview } from './PdfCanvasPreview';

interface DocumentsViewProps {
  vehicles: Vehicle[];
  purchases: Purchase[];
  documents: GarageDocument[];
  historyEvents: DocumentHistoryEvent[];
  userId: string;
  userEmail?: string | null;
  activeGarageId: string | null;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onSeedDocuments: () => Promise<void>;
  onOpenCerfaGenerator?: (vehicle?: Vehicle) => void;
}

type DocumentsTab = 'library' | 'missing' | 'history';

const MAX_PDF_BYTES = 550 * 1024; // 550 KB limit for Firestore 1MB safety
const MAX_IMAGE_TARGET_BYTES = 300 * 1024; // Compress raster images <= 300 KB

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
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

async function compressImageFileToDataUrl(
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

function dataUrlToBlobUrl(dataUrl: string): string | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const header = parts[0];
    const base64 = parts[1];
    const mimeMatch = header.match(/data:([^;]+);base64/i);
    const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  vehicles,
  purchases,
  documents,
  historyEvents,
  userId,
  userEmail,
  activeGarageId,
  onSelectVehicle,
  onSeedDocuments,
  onOpenCerfaGenerator,
}) => {
  const { lang, t } = useI18n();

  const [activeTab, setActiveTab] = useState<DocumentsTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | GarageDocumentCategory>('all');
  const [bindingFilter, setBindingFilter] = useState<'all' | DocumentBindingType>('all');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [historyActionFilter, setHistoryActionFilter] = useState<'all' | DocumentHistoryAction>('all');
  const [isSeedingDocs, setIsSeedingDocs] = useState(false);

  // Confirm delete inline state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Upload / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<GarageDocument | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<GarageDocumentCategory>('carte_grise');
  const [formBindingType, setFormBindingType] = useState<DocumentBindingType>('vehicle');
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formClientEmail, setFormClientEmail] = useState('');
  const [formClientPhone, setFormClientPhone] = useState('');
  const [formDate, setFormDate] = useState(getTodayDateString());
  const [formNotes, setFormNotes] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [formMimeType, setFormMimeType] = useState('');
  const [formFileSize, setFormFileSize] = useState(0);
  const [formFileUrl, setFormFileUrl] = useState('');

  // Preview Modal state
  const [previewDoc, setPreviewDoc] = useState<GarageDocument | null>(null);
  const [hasPresetCategory, setHasPresetCategory] = useState(false);

  const uniqueClients = useMemo(
    () => extractUniqueClients(vehicles, documents),
    [vehicles, documents]
  );

  const missingReminders = useMemo(
    () => computeMissingDocumentReminders({ vehicles, documents, purchases }),
    [vehicles, documents, purchases]
  );

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: documents.length };
    for (const c of DOCUMENT_CATEGORIES) {
      map[c.id] = 0;
    }
    for (const d of documents) {
      map[d.category] = (map[d.category] || 0) + 1;
    }
    return map;
  }, [documents]);

  const filteredDocuments = useMemo(
    () =>
      searchAndFilterDocuments({
        documents,
        query: searchQuery,
        category: categoryFilter,
        bindingType: bindingFilter,
        vehicleId: vehicleFilter,
        clientName: clientFilter,
      }),
    [documents, searchQuery, categoryFilter, bindingFilter, vehicleFilter, clientFilter]
  );

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return historyEvents.filter((ev) => {
      if (historyActionFilter !== 'all' && ev.action !== historyActionFilter) return false;
      if (!q) return true;
      const hay = [
        ev.documentTitle,
        ev.vehicleLabel || '',
        ev.clientName || '',
        ev.actorEmail || '',
        ev.details || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [historyEvents, historyActionFilter, searchQuery]);

  const kpiCoveredVehicles = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      if (d.vehicleId) set.add(d.vehicleId);
    }
    return set.size;
  }, [documents]);

  const liveResolvedBinding = useMemo(
    () =>
      resolveDocumentBinding({
        bindingType: formBindingType,
        vehicleId: formVehicleId || undefined,
        clientName: formClientName || undefined,
        clientEmail: formClientEmail || undefined,
        clientPhone: formClientPhone || undefined,
        vehicles,
      }),
    [formBindingType, formVehicleId, formClientName, formClientEmail, formClientPhone, vehicles]
  );

  const openCreateModal = (preset?: {
    category?: GarageDocumentCategory;
    vehicleId?: string;
    clientName?: string;
    bindingType?: DocumentBindingType;
  }) => {
    setEditingDoc(null);
    setFormErrors([]);
    setFileError(null);
    setHasPresetCategory(Boolean(preset?.category));
    const defaultVehId = preset?.vehicleId ?? vehicles[0]?.id ?? '';
    const defaultVeh = vehicles.find((v) => v.id === defaultVehId);
    setFormTitle('');
    setFormCategory(preset?.category || 'carte_grise');
    setFormBindingType(preset?.bindingType || 'vehicle');
    setFormVehicleId(defaultVehId);
    setFormClientName(preset?.clientName || defaultVeh?.buyerInfo?.fullName || '');
    setFormClientEmail(defaultVeh?.buyerInfo?.email || '');
    setFormClientPhone(defaultVeh?.buyerInfo?.phone || '');
    setFormDate(getTodayDateString());
    setFormNotes('');
    setFormFileName('');
    setFormMimeType('');
    setFormFileSize(0);
    setFormFileUrl('');
    setIsModalOpen(true);
  };

  const openEditModal = (doc: GarageDocument) => {
    setEditingDoc(doc);
    setFormErrors([]);
    setFileError(null);
    setHasPresetCategory(true);
    setFormTitle(doc.title);
    setFormCategory(doc.category);
    setFormBindingType(doc.bindingType);
    setFormVehicleId(doc.vehicleId || '');
    setFormClientName(doc.clientName || '');
    setFormClientEmail(doc.clientEmail || '');
    setFormClientPhone(doc.clientPhone || '');
    setFormDate(doc.documentDate || getTodayDateString());
    setFormNotes(doc.notes || '');
    setFormFileName(doc.fileName);
    setFormMimeType(doc.mimeType);
    setFormFileSize(doc.fileSize);
    setFormFileUrl(doc.fileUrl);
    setIsModalOpen(true);
  };

  const handleVehicleSelectInModal = (vehId: string) => {
    setFormVehicleId(vehId);
    const veh = vehicles.find((v) => v.id === vehId);
    if (veh?.buyerInfo?.fullName) {
      setFormClientName(veh.buyerInfo.fullName);
      setFormClientEmail(veh.buyerInfo.email || '');
      setFormClientPhone(veh.buyerInfo.phone || '');
    }
  };

  const handleClientSelectInModal = (clientNameVal: string) => {
    setFormClientName(clientNameVal);
    const foundClient = uniqueClients.find(
      (c) => c.name.toLowerCase() === clientNameVal.trim().toLowerCase()
    );
    if (foundClient) {
      if (foundClient.email) setFormClientEmail(foundClient.email);
      if (foundClient.phone) setFormClientPhone(foundClient.phone);
      if (foundClient.vehicleIds.length === 1 && !formVehicleId) {
        setFormVehicleId(foundClient.vehicleIds[0]);
      }
    }
  };

  const processSelectedFile = async (file: File) => {
    setFileError(null);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (!isPdf && !isImage) {
      setFileError(t('docsUnsupportedFileError'));
      return;
    }

    if (isPdf) {
      if (file.size > MAX_PDF_BYTES) {
        setFileError(t('docsPdfSizeError'));
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('pdf_read_error'));
        reader.readAsDataURL(file);
      });
      setFormFileName(file.name);
      setFormMimeType('application/pdf');
      setFormFileSize(file.size);
      setFormFileUrl(dataUrl);
    } else {
      try {
        const compressed = await compressImageFileToDataUrl(file);
        setFormFileName(file.name);
        setFormMimeType(compressed.mimeType);
        setFormFileSize(compressed.size);
        setFormFileUrl(compressed.dataUrl);
      } catch {
        setFileError(t('docsUnsupportedFileError'));
        return;
      }
    }

    // Auto-infer category & title on new upload unless opened from a specific reminder
    if (!editingDoc) {
      if (!hasPresetCategory) {
        const inferredCat = inferCategoryFromFileName(file.name, isPdf ? 'application/pdf' : file.type);
        setFormCategory(inferredCat);
      }
      if (!formTitle.trim()) {
        const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        setFormTitle(cleanTitle);
      }
    }
  };

  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const binding = resolveDocumentBinding({
      bindingType: formBindingType,
      vehicleId: formVehicleId || undefined,
      clientName: formClientName || undefined,
      clientEmail: formClientEmail || undefined,
      clientPhone: formClientPhone || undefined,
      vehicles,
    });

    const errors = validateDocumentInput({
      title: formTitle,
      category: formCategory,
      bindingType: binding.bindingType,
      vehicleId: binding.vehicleId,
      clientName: binding.clientName,
      fileName: formFileName,
      fileUrl: formFileUrl,
      documentDate: formDate,
    });

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
      if (editingDoc) {
        await updateGarageDocument(
          editingDoc,
          {
            title: formTitle.trim(),
            category: formCategory,
            bindingType: binding.bindingType,
            vehicleId: binding.vehicleId,
            vehicleLabel: binding.vehicleLabel,
            clientName: binding.clientName,
            clientEmail: binding.clientEmail,
            clientPhone: binding.clientPhone,
            fileName: formFileName,
            mimeType: formMimeType,
            fileSize: formFileSize,
            fileUrl: formFileUrl,
            documentDate: formDate,
            notes: formNotes.trim() || undefined,
          },
          userEmail || undefined
        );
      } else {
        await createGarageDocument({
          userId,
          garageId: targetGarageId,
          actorEmail: userEmail || undefined,
          title: formTitle.trim(),
          category: formCategory,
          bindingType: binding.bindingType,
          vehicleId: binding.vehicleId,
          vehicleLabel: binding.vehicleLabel,
          clientName: binding.clientName,
          clientEmail: binding.clientEmail,
          clientPhone: binding.clientPhone,
          fileName: formFileName,
          mimeType: formMimeType,
          fileSize: formFileSize,
          fileUrl: formFileUrl,
          documentDate: formDate,
          notes: formNotes.trim() || undefined,
        });
      }
      setIsModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadDocument = async (doc: GarageDocument) => {
    const link = document.createElement('a');
    link.href = doc.fileUrl;
    link.download = doc.fileName || `${doc.title}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    await recordDocumentDownload(doc, userEmail || undefined);
  };

  const handleSeedDemo = async () => {
    setIsSeedingDocs(true);
    try {
      await onSeedDocuments();
    } finally {
      setIsSeedingDocs(false);
    }
  };

  const handleUploadFromReminder = (reminder: MissingDocumentReminder) => {
    openCreateModal({
      category: reminder.category,
      vehicleId: reminder.vehicleId,
      clientName: reminder.clientName,
      bindingType: 'vehicle',
    });
  };

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

  const getValidationText = (code: string): string => {
    switch (code) {
      case 'title_required':
        return pickLocalized(lang, {
          fr: 'Veuillez saisir un titre de document.',
          ru: 'Укажите название документа.',
          hy: 'Նշեք փաստաթղթի անվանումը։',
          ka: 'მიუთითეთ დოკუმენტის დასახელება.',
        });
      case 'vehicle_required':
        return pickLocalized(lang, {
          fr: 'Veuillez sélectionner un véhicule associé.',
          ru: 'Выберите связанный автомобиль.',
          hy: 'Ընտրեք կապակցված ավտոմեքենան։',
          ka: 'აირჩიეთ დაკავშირებული ავტომობილი.',
        });
      case 'client_required':
        return pickLocalized(lang, {
          fr: 'Veuillez renseigner le nom du client.',
          ru: 'Укажите имя клиента.',
          hy: 'Նշեք հաճախորդի անունը։',
          ka: 'მიუთითეთ კლიენტის სახელი.',
        });
      case 'file_required':
        return pickLocalized(lang, {
          fr: 'Veuillez joindre un fichier PDF ou une image.',
          ru: 'Загрузите файл PDF или изображение.',
          hy: 'Կցեք PDF ֆայլ կամ պատկեր։',
          ka: 'ატვირთეთ PDF ფაილი ან სურათი.',
        });
      case 'date_required':
        return pickLocalized(lang, {
          fr: 'Veuillez préciser la date du document.',
          ru: 'Укажите дату документа.',
          hy: 'Նշեք փաստաթղթի ամսաթիվը։',
          ka: 'მიუთითეთ დოკუმენტის თარიღი.',
        });
      default:
        return code;
    }
  };

  const previewDocHistory = useMemo(() => {
    if (!previewDoc) return [];
    return historyEvents.filter((e) => e.documentId === previewDoc.id);
  }, [previewDoc, historyEvents]);

  return (
    <div data-testid="documents-view" className="space-y-4 animate-fade-in">
      {/* Top Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[var(--ag-button-radius)] bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--foreground)]">
                {t('docsPageTitle')}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('docsPageSubtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {documents.length === 0 && (
            <button
              type="button"
              data-testid="seed-demo-docs-btn"
              onClick={handleSeedDemo}
              disabled={isSeedingDocs}
              className="inline-flex items-center gap-1.5 h-9 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] hover:opacity-90 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSeedingDocs ? t('loading') : t('seedDemoDocsBtn')}</span>
            </button>
          )}

          {onOpenCerfaGenerator && (
            <button
              type="button"
              data-testid="open-cerfa-generator-btn"
              onClick={() => onOpenCerfaGenerator(vehicles[0])}
              className="inline-flex items-center gap-1.5 h-9 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)]/50 transition cursor-pointer"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span>{t('cerfaGeneratorBtn')}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="new-document-btn"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>{t('newDocumentBtn')}</span>
          </button>
        </div>
      </div>

      {/* 4-Card KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>{t('docsKpiTotal')}</span>
            <FileText className="w-4 h-4 text-[var(--primary)]" />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-[var(--foreground)] tabular-nums">
            {documents.length}
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>{t('docsKpiLinkedVehicles')}</span>
            <Car className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-[var(--foreground)] tabular-nums">
            {kpiCoveredVehicles}
            <span className="text-sm font-semibold text-[var(--muted-foreground)]">
              {' '}
              / {vehicles.length}
            </span>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>{t('docsKpiLinkedClients')}</span>
            <User className="w-4 h-4 text-violet-400" />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-[var(--foreground)] tabular-nums">
            {uniqueClients.length}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('missing')}
          className={`text-left bg-[var(--card)] border rounded-[var(--ag-card-radius)] p-4 transition ${
            missingReminders.length > 0
              ? 'border-amber-500/40 hover:border-amber-500'
              : 'border-emerald-500/40 hover:border-emerald-500'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>{t('docsKpiMissing')}</span>
            {missingReminders.length > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div
            data-testid="missing-docs-kpi-count"
            className={`mt-1.5 text-2xl font-extrabold tabular-nums ${
              missingReminders.length > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {missingReminders.length}
          </div>
        </button>
      </div>

      {/* Missing Document Alert Strip (when on Library tab & reminders exist) */}
      {activeTab === 'library' && missingReminders.length > 0 && (
        <div
          data-testid="missing-docs-alert-banner"
          className="bg-amber-500/10 border border-amber-500/30 rounded-[var(--ag-card-radius)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[var(--foreground)]">
                {t('docsMissingBannerTitle')} ({missingReminders.length})
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                <span className="font-semibold text-[var(--foreground)]">
                  {missingReminders[0].vehicleLabel}
                </span>{' '}
                — {getDocumentCategoryLabel(missingReminders[0].category, lang)}:{' '}
                {pickLocalized(lang, {
                  fr: missingReminders[0].reasonFr,
                  ru: missingReminders[0].reasonRu,
                  hy: missingReminders[0].reasonHy,
                  ka: missingReminders[0].reasonKa,
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleUploadFromReminder(missingReminders[0])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-amber-500 text-slate-950 hover:opacity-90 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t('docsUploadNowBtn')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('missing')}
              className="px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)]/50 transition"
            >
              {pickLocalized(lang, {
                fr: `Tout voir (${missingReminders.length})`,
                ru: `Показать все (${missingReminders.length})`,
                hy: `Տեսնել բոլորը (${missingReminders.length})`,
                ka: `ყველას ნახვა (${missingReminders.length})`,
              })}
            </button>
          </div>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div
        data-testid="documents-tabs"
        className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3"
      >
        <button
          type="button"
          data-testid="tab-docs-library"
          onClick={() => setActiveTab('library')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
            activeTab === 'library'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm'
              : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('docsTabLibrary')}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/15 tabular-nums">
            {documents.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="tab-docs-missing"
          onClick={() => setActiveTab('missing')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
            activeTab === 'missing'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm'
              : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{t('docsTabMissing')}</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${
              missingReminders.length > 0 && activeTab !== 'missing'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-black/15'
            }`}
          >
            {missingReminders.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="tab-docs-history"
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
            activeTab === 'history'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm'
              : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>{t('docsTabHistory')}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/15 tabular-nums">
            {historyEvents.length}
          </span>
        </button>
      </div>

      {/* TAB 1: DOCUMENT LIBRARY */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {/* Search + Entity Binding Filters */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  data-testid="docs-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('docsSearchPlaceholder')}
                  className="w-full pl-9 pr-8 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <ThemedSelect
                testId="docs-binding-filter"
                ariaLabel={t('docsAllBindings')}
                value={bindingFilter}
                onChange={(v) => setBindingFilter(v as 'all' | DocumentBindingType)}
                options={[
                  { value: 'all', label: t('docsAllBindings') },
                  { value: 'vehicle', label: t('docsBindingVehicle') },
                  { value: 'client', label: t('docsBindingClient') },
                ]}
                triggerClassName="w-full bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-2"
              />

              <ThemedSelect
                testId="docs-vehicle-filter"
                ariaLabel={t('docsAllVehicles')}
                value={vehicleFilter}
                onChange={(v) => setVehicleFilter(v)}
                options={[
                  { value: '', label: t('docsAllVehicles') },
                  ...vehicles.map((v) => ({
                    value: v.id,
                    label: formatVehicleSummaryLabel(v),
                  })),
                ]}
                triggerClassName="w-full bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-2"
              />

              <ThemedSelect
                testId="docs-client-filter"
                ariaLabel={t('docsAllClients')}
                value={clientFilter}
                onChange={(v) => setClientFilter(v)}
                options={[
                  { value: '', label: t('docsAllClients') },
                  ...uniqueClients.map((c) => ({
                    value: c.name,
                    label: c.name,
                  })),
                ]}
                triggerClassName="w-full bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-2"
              />
            </div>

            {/* 10 Categories Horizontal Filter Grid */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                data-testid="cat-filter-all"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-[11px] font-bold border transition ${
                  categoryFilter === 'all'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                    : 'bg-[var(--surface-muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                }`}
              >
                {t('docsAllCategories')} ({categoryCounts.all || 0})
              </button>
              {DOCUMENT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  data-testid={`cat-filter-${cat.id}`}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-[11px] font-semibold border transition ${
                    categoryFilter === cat.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] font-bold'
                      : 'bg-[var(--surface-muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {getDocumentCategoryLabel(cat.id, lang)}{' '}
                  <span className="opacity-75 tabular-nums">({categoryCounts[cat.id] || 0})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Document Cards / Ledger */}
          {filteredDocuments.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-10 text-center space-y-3">
              <FileText className="w-10 h-10 text-[var(--muted-foreground)] mx-auto opacity-60" />
              <p className="text-sm font-semibold text-[var(--muted-foreground)]">
                {t('docsNoDocsFound')}
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>{t('newDocumentBtn')}</span>
                </button>
                {documents.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedDemo}
                    disabled={isSeedingDocs}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('seedDemoDocsBtn')}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              data-testid="documents-list"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {filteredDocuments.map((doc) => {
                const isImage = doc.mimeType.startsWith('image/');
                const boundVeh = doc.vehicleId
                  ? vehicles.find((v) => v.id === doc.vehicleId)
                  : undefined;

                return (
                  <article
                    key={doc.id}
                    data-testid={`document-card-${doc.id}`}
                    className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-col justify-between gap-3.5 hover:border-[var(--primary)]/50 transition"
                  >
                    <div className="space-y-3">
                      {/* Header: File Thumbnail + Title + Category */}
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="w-12 h-12 rounded-[var(--ag-button-radius)] border border-[var(--border)] bg-[var(--surface-muted)] flex items-center justify-center overflow-hidden shrink-0 hover:opacity-90 transition"
                          title={t('docsPreviewBtn')}
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
                        {doc.vehicleLabel && (
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
                            {boundVeh ? (
                              <button
                                type="button"
                                onClick={() => onSelectVehicle(boundVeh)}
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
                          onClick={() => setPreviewDoc(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-[11px] font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)] transition"
                        >
                          <Eye className="w-3.5 h-3.5 text-[var(--primary)]" />
                          <span>{t('docsPreviewBtn')}</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`doc-download-${doc.id}`}
                          onClick={() => handleDownloadDocument(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-[11px] font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-sky-500/50 transition"
                        >
                          <Download className="w-3.5 h-3.5 text-sky-400" />
                          <span>{t('docsDownloadBtn')}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid={`doc-edit-${doc.id}`}
                          onClick={() => openEditModal(doc)}
                          title={t('docsEditBtn')}
                          aria-label={t('docsEditBtn')}
                          className="p-1.5 rounded-[var(--ag-button-radius)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {confirmDeleteId === doc.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              data-testid={`doc-confirm-delete-${doc.id}`}
                              onClick={async () => {
                                await deleteGarageDocument(doc, userEmail || undefined);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-rose-600 text-white"
                            >
                              {t('docsConfirmDeleteBtn')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded text-[10px] font-semibold bg-[var(--surface-muted)] text-[var(--foreground)]"
                            >
                              {t('docsCancelBtn')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            data-testid={`doc-delete-${doc.id}`}
                            onClick={() => setConfirmDeleteId(doc.id)}
                            title={t('docsDeleteBtn')}
                            aria-label={t('docsDeleteBtn')}
                            className="p-1.5 rounded-[var(--ag-button-radius)] text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MISSING DOCUMENT REMINDERS */}
      {activeTab === 'missing' && (
        <div data-testid="missing-documents-panel" className="space-y-3">
          {missingReminders.length === 0 ? (
            <div className="bg-[var(--card)] border border-emerald-500/30 rounded-[var(--ag-card-radius)] p-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-[var(--foreground)]">
                {t('docsNoMissingAlerts')}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {missingReminders.map((rem) => {
                const boundVeh = vehicles.find((v) => v.id === rem.vehicleId);
                return (
                  <div
                    key={rem.id}
                    data-testid={`missing-reminder-${rem.id}`}
                    className={`bg-[var(--card)] border rounded-[var(--ag-card-radius)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      rem.severity === 'high'
                        ? 'border-rose-500/40'
                        : 'border-amber-500/40'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <AlertTriangle
                        className={`w-5 h-5 shrink-0 mt-0.5 ${
                          rem.severity === 'high' ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      />
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {boundVeh ? (
                            <button
                              type="button"
                              onClick={() => onSelectVehicle(boundVeh)}
                              className="text-sm font-bold text-[var(--primary)] hover:underline"
                            >
                              {rem.vehicleLabel}
                            </button>
                          ) : (
                            <span className="text-sm font-bold text-[var(--foreground)]">
                              {rem.vehicleLabel}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]">
                            {getDocumentCategoryLabel(rem.category, lang)}
                          </span>
                          {rem.clientName && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                              <User className="w-3 h-3" />
                              {rem.clientName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {pickLocalized(lang, {
                            fr: rem.reasonFr,
                            ru: rem.reasonRu,
                            hy: rem.reasonHy,
                            ka: rem.reasonKa,
                          })}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`upload-reminder-${rem.id}`}
                      onClick={() => handleUploadFromReminder(rem)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 transition shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t('docsUploadNowBtn')}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DOCUMENT HISTORY */}
      {activeTab === 'history' && (
        <div data-testid="document-history-panel" className="space-y-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--primary)]" />
              <span>{t('docsHistoryTabTitle')}</span>
            </h3>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('docsSearchPlaceholder')}
                  className="pl-8 pr-3 py-1.5 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)]"
                />
              </div>
              <ThemedSelect
                testId="docs-history-action-filter"
                ariaLabel={t('docsHistoryFilterAll')}
                value={historyActionFilter}
                onChange={(v) => setHistoryActionFilter(v as 'all' | DocumentHistoryAction)}
                options={[
                  { value: 'all', label: t('docsHistoryFilterAll') },
                  { value: 'uploaded', label: t('docsActionUploaded') },
                  { value: 'downloaded', label: t('docsActionDownloaded') },
                  { value: 'linked', label: t('docsActionLinked') },
                  { value: 'updated', label: t('docsActionUpdated') },
                  { value: 'deleted', label: t('docsActionDeleted') },
                ]}
                triggerClassName="bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-1.5"
              />
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-10 text-center text-sm text-[var(--muted-foreground)]">
              {t('docsNoHistory')}
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/60 text-[var(--muted-foreground)] uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Date & Heure',
                        ru: 'Дата и время',
                        hy: 'Ամսաթիվ և ժամ',
                        ka: 'თარიღი და დრო',
                      })}
                    </th>
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Action',
                        ru: 'Действие',
                        hy: 'Գործողություն',
                        ka: 'ქმედება',
                      })}
                    </th>
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Document',
                        ru: 'Документ',
                        hy: 'Փաստաթուղթ',
                        ka: 'დოკუმენტი',
                      })}
                    </th>
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Liaison',
                        ru: 'Привязка',
                        hy: 'Կապակցում',
                        ka: 'ბმა',
                      })}
                    </th>
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Fichier / Utilisateur',
                        ru: 'Файл / Пользователь',
                        hy: 'Ֆայլ / Օգտատեր',
                        ka: 'ფაილი / მომხმარებელი',
                      })}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredHistory.map((ev) => (
                    <tr
                      key={ev.id}
                      data-testid={`history-row-${ev.id}`}
                      className="hover:bg-[var(--surface-muted)]/40 transition"
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap text-[var(--muted-foreground)] tabular-nums">
                        {new Date(ev.timestamp).toLocaleString(getIntlLocale(lang), {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadgeStyle(
                            ev.action
                          )}`}
                        >
                          {getHistoryActionLabel(ev.action)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-[var(--foreground)]">
                          {ev.documentTitle}
                        </div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">
                          {getDocumentCategoryLabel(ev.category, lang)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          {ev.vehicleLabel && (
                            <span className="inline-flex items-center gap-1 text-[var(--foreground)] font-medium">
                              <Car className="w-3 h-3 text-sky-400" />
                              {ev.vehicleLabel}
                            </span>
                          )}
                          {ev.clientName && (
                            <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)]">
                              <User className="w-3 h-3 text-violet-400" />
                              {ev.clientName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-[var(--muted-foreground)]">
                        {ev.details && <div className="truncate max-w-[200px]">{ev.details}</div>}
                        {ev.actorEmail && <div className="text-[10px] opacity-80">{ev.actorEmail}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* UPLOAD / EDIT DOCUMENT MODAL */}
      {isModalOpen && (
        <div
          data-testid="document-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--border)]">
              <h3 className="text-base font-extrabold text-[var(--foreground)] flex items-center gap-2">
                <FilePlus2 className="w-4 h-4 text-[var(--primary)]" />
                <span>{editingDoc ? t('docsModalEditTitle') : t('docsModalAddTitle')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDocument} className="overflow-y-auto p-4 space-y-4">
              {formErrors.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-3 space-y-1">
                  {formErrors.map((err) => (
                    <div key={err} className="text-xs font-semibold text-rose-400">
                      • {getValidationText(err)}
                    </div>
                  ))}
                </div>
              )}

              {/* File Dropzone */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--foreground)]">
                  {t('docsFieldFile')}
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) processSelectedFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition ${
                    isDragging
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                      : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]/60'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    data-testid="document-file-input"
                    type="file"
                    accept=".pdf,application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processSelectedFile(f);
                    }}
                  />
                  <Upload className="w-6 h-6 text-[var(--primary)] mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    {formFileName
                      ? `${formFileName} (${formatFileSize(formFileSize)})`
                      : t('docsDropzoneHint')}
                  </p>
                </div>
                {fileError && <p className="text-xs font-semibold text-rose-400">{fileError}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    {t('docsFieldTitle')}
                  </label>
                  <input
                    type="text"
                    data-testid="document-title-input"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder={pickLocalized(lang, {
                      fr: 'Ex : Carte grise Peugeot 208',
                      ru: 'Например: Carte grise Peugeot 208',
                      hy: 'Օրինակ՝ Carte grise Peugeot 208',
                      ka: 'მაგ.: Carte grise Peugeot 208',
                    })}
                    className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    {t('docsFieldCategory')}
                  </label>
                  <ThemedSelect
                    testId="document-category-select"
                    ariaLabel={t('docsFieldCategory')}
                    value={formCategory}
                    onChange={(v) => setFormCategory(v as GarageDocumentCategory)}
                    options={DOCUMENT_CATEGORIES.map((c) => ({
                      value: c.id,
                      label: getDocumentCategoryLabel(c.id, lang),
                    }))}
                    triggerClassName="w-full bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-2"
                  />
                </div>
              </div>

              {/* Entity Binding Section */}
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span>{t('docsFieldBinding')}</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="bind-vehicle-btn"
                      onClick={() => setFormBindingType('vehicle')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                        formBindingType === 'vehicle'
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                          : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)]'
                      }`}
                    >
                      {t('docsBindingVehicle')}
                    </button>
                    <button
                      type="button"
                      data-testid="bind-client-btn"
                      onClick={() => setFormBindingType('client')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                        formBindingType === 'client'
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                          : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)]'
                      }`}
                    >
                      {t('docsBindingClient')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                      {t('docsFieldVehicle')}
                    </label>
                    <ThemedSelect
                      testId="document-vehicle-select"
                      ariaLabel={t('docsFieldVehicle')}
                      value={formVehicleId}
                      onChange={handleVehicleSelectInModal}
                      options={[
                        {
                          value: '',
                          label: pickLocalized(lang, {
                            fr: '— Aucun —',
                            ru: '— Не выбран —',
                            hy: '— Ընտրված չէ —',
                            ka: '— არჩეული არ არის —',
                          }),
                        },
                        ...vehicles.map((v) => ({
                          value: v.id,
                          label: formatVehicleSummaryLabel(v),
                        })),
                      ]}
                      triggerClassName="w-full bg-[var(--card)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-2"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                      {t('docsFieldClientName')}
                    </label>
                    <input
                      type="text"
                      data-testid="document-client-input"
                      list="autogarage-clients-datalist"
                      value={formClientName}
                      onChange={(e) => handleClientSelectInModal(e.target.value)}
                      placeholder={pickLocalized(lang, {
                        fr: 'Nom du client',
                        ru: 'Имя покупателя / клиента',
                        hy: 'Հաճախորդի անունը',
                        ka: 'კლიენტის სახელი',
                      })}
                      className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                    />
                    <datalist id="autogarage-clients-datalist">
                      {uniqueClients.map((c) => (
                        <option key={c.name} value={c.name} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                      {t('docsFieldClientEmail')}
                    </label>
                    <input
                      type="email"
                      value={formClientEmail}
                      onChange={(e) => setFormClientEmail(e.target.value)}
                      placeholder="client@email.fr"
                      className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                      {t('docsFieldClientPhone')}
                    </label>
                    <input
                      type="text"
                      value={formClientPhone}
                      onChange={(e) => setFormClientPhone(e.target.value)}
                      placeholder="06 00 00 00 00"
                      className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)]"
                    />
                  </div>
                </div>

                {liveResolvedBinding.vehicleLabel && liveResolvedBinding.clientName && (
                  <div
                    data-testid="autobound-notice"
                    className="flex items-center gap-2 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-2.5 py-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t('docsAutoBoundNotice')} ({liveResolvedBinding.vehicleLabel} ↔{' '}
                      {liveResolvedBinding.clientName})
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    {t('docsFieldDate')}
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    {t('docsFieldNotes')}
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder={pickLocalized(lang, {
                      fr: 'Observation ou n° de référence',
                      ru: 'Комментарий или номер бланка',
                      hy: 'Մեկնաբանություն կամ համար',
                      ka: 'კომენტარი ან ბლანკის ნომერი',
                    })}
                    className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]"
                >
                  {t('docsCancelBtn')}
                </button>
                <button
                  type="submit"
                  data-testid="save-document-btn"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 disabled:opacity-50"
                >
                  {isSaving ? t('loading') : t('docsSaveBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INLINE DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <div
          data-testid="document-preview-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] truncate">
                  {previewDoc.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                  <span>{getDocumentCategoryLabel(previewDoc.category, lang)}</span>
                  {previewDoc.vehicleLabel && <span>• {previewDoc.vehicleLabel}</span>}
                  {previewDoc.clientName && <span>• {previewDoc.clientName}</span>}
                  <span>• {formatFileSize(previewDoc.fileSize)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="preview-download-btn"
                  onClick={() => handleDownloadDocument(previewDoc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('docsDownloadBtn')}</span>
                </button>
                <button
                  type="button"
                  data-testid="preview-close-btn"
                  onClick={() => setPreviewDoc(null)}
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
                {previewDoc.mimeType.startsWith('image/') ? (
                  <img
                    src={previewDoc.fileUrl}
                    alt={previewDoc.title}
                    className="max-h-[65vh] w-auto rounded-lg border border-[var(--border)] object-contain shadow"
                  />
                ) : previewDoc.mimeType.includes('pdf') ? (
                  <PdfCanvasPreview
                    fileUrl={previewDoc.fileUrl}
                    title={previewDoc.title}
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
                      onClick={() => handleDownloadDocument(previewDoc)}
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
                        {previewDoc.fileName}
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
                        {previewDoc.documentDate}
                      </span>
                    </div>
                    {previewDoc.vehicleLabel && (
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
                          {previewDoc.vehicleLabel}
                        </span>
                      </div>
                    )}
                    {previewDoc.clientName && (
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
                          {previewDoc.clientName}
                        </span>
                      </div>
                    )}
                    {previewDoc.notes && (
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
                        <span className="text-[var(--foreground)]">{previewDoc.notes}</span>
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
                            {new Date(ev.timestamp).toLocaleDateString(
                              getIntlLocale(lang)
                            )}
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
      )}
    </div>
  );
};
