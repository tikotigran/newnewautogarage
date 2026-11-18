import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FilePlus2,
  Link2,
  Upload,
  X,
} from 'lucide-react';
import {
  DocumentBindingType,
  GarageDocument,
  GarageDocumentCategory,
  Vehicle,
} from '../types/garage';
import {
  ClientOption,
  DOCUMENT_CATEGORIES,
  formatFileSize,
  formatVehicleSummaryLabel,
  getDocumentCategoryLabel,
  inferCategoryFromFileName,
  resolveDocumentBinding,
  validateDocumentInput,
  validatePdfUploadFile,
} from '../utils/documents';
import { readFileAsDataUrl } from '../utils/documentFileHelpers';
import {
  createGarageDocument,
  updateGarageDocument,
} from '../services/documentService';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { ThemedSelect } from './ThemedSelect';

export interface DocumentUploadPreset {
  category?: GarageDocumentCategory;
  vehicleId?: string;
  clientName?: string;
  bindingType?: DocumentBindingType;
}

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDoc: GarageDocument | null;
  preset?: DocumentUploadPreset | null;
  vehicles: Vehicle[];
  uniqueClients: ClientOption[];
  userId: string;
  userEmail?: string | null;
  activeGarageId: string | null;
}

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  editingDoc,
  preset,
  vehicles,
  uniqueClients,
  userId,
  userEmail,
  activeGarageId,
}) => {
  const { lang, t } = useI18n();
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [hasPresetCategory, setHasPresetCategory] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormErrors([]);
    setFileError(null);
    setIsDragging(false);

    if (editingDoc) {
      setHasPresetCategory(true);
      setFormTitle(editingDoc.title);
      setFormCategory(editingDoc.category);
      setFormBindingType(editingDoc.bindingType);
      setFormVehicleId(editingDoc.vehicleId || '');
      setFormClientName(editingDoc.clientName || '');
      setFormClientEmail(editingDoc.clientEmail || '');
      setFormClientPhone(editingDoc.clientPhone || '');
      setFormDate(editingDoc.documentDate || getTodayDateString());
      setFormNotes(editingDoc.notes || '');
      setFormFileName(editingDoc.fileName);
      setFormMimeType(editingDoc.mimeType);
      setFormFileSize(editingDoc.fileSize);
      setFormFileUrl(editingDoc.fileUrl);
    } else {
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
    }
  }, [isOpen, editingDoc, preset, vehicles]);

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

  if (!isOpen) return null;

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
    const validationError = validatePdfUploadFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (validationError === 'pdf_only') {
      setFileError(t('docsUnsupportedFileError'));
      return;
    }

    if (validationError === 'pdf_too_large') {
      setFileError(t('docsPdfSizeError'));
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setFormFileName(file.name);
    setFormMimeType('application/pdf');
    setFormFileSize(file.size);
    setFormFileUrl(dataUrl);

    if (!editingDoc) {
      if (!hasPresetCategory) {
        const inferredCat = inferCategoryFromFileName(file.name, 'application/pdf');
        setFormCategory(inferredCat);
      }
      if (!formTitle.trim()) {
        const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        setFormTitle(cleanTitle);
      }
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
          fr: 'Veuillez joindre un fichier PDF.',
          ru: 'Загрузите файл в формате PDF.',
          hy: 'Կցեք PDF ֆայլ։',
          ka: 'ატვირთეთ PDF ფაილი.',
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
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
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
            onClick={onClose}
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
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void processSelectedFile(f);
                }}
              />
              <Upload className="w-6 h-6 text-[var(--primary)] mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-[var(--foreground)]">
                {formFileName
                  ? `${formFileName} (${formatFileSize(formFileSize)})`
                  : t('docsDropzoneHint')}
              </p>
              {formFileName && (
                <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                  {t('docsDropzoneHint')}
                </p>
              )}
            </div>
            {fileError && (
              <div
                data-testid="document-file-error"
                role="alert"
                className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/40 rounded-xl px-3 py-2 text-xs font-semibold text-rose-400"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}
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
              onClick={onClose}
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
  );
};
