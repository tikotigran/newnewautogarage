import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Car,
  Check,
  Info,
  Loader2,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { Supplier, Vehicle, VehiclePurchaseStatus, VehicleStatus } from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { ThemedSelect } from './ThemedSelect';
import { LocaleDateInput } from './LocaleDateInput';
import { compressImageFileToDataUrl } from '../utils/documentFileHelpers';
import { formatEuro } from '../utils/finance';
import {
  buildVehicleSubmitPayload,
  computeVehicleMarginPreview,
  estimatePhotosPayloadBytes,
  MAX_VEHICLE_PHOTOS_BYTES,
  validateVehicleFormDetailed,
  VehicleFormFieldErrorKey,
} from '../utils/vehicleFormUtils';

interface AddVehiclePageProps {
  userId: string;
  activeGarageId?: string | null;
  defaultPurchaseStatus?: VehiclePurchaseStatus;
  suppliers: Supplier[];
  onBack: () => void;
  onSubmit: (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onValidationToast?: (message: string) => void;
}

const CUSTOM_SUPPLIER_VALUE = '__custom__';

export const AddVehiclePage: React.FC<AddVehiclePageProps> = ({
  userId,
  activeGarageId,
  defaultPurchaseStatus = 'micro',
  suppliers,
  onBack,
  onSubmit,
  onValidationToast,
}) => {
  const { t, lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const [purchaseStatus, setPurchaseStatus] = useState<VehiclePurchaseStatus>(defaultPurchaseStatus);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>(new Date().getFullYear());
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [mileage, setMileage] = useState<number | ''>('');
  const [status, setStatus] = useState<VehicleStatus>('preparation');

  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [targetSalePrice, setTargetSalePrice] = useState<number | ''>('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Supplier / Source (dropdown + optional custom text)
  const [supplierSelection, setSupplierSelection] = useState<string>('');
  const [customSupplierName, setCustomSupplierName] = useState<string>('');

  // Compact Photos (auto-compressed & strictly guarded for document size limit)
  const [photos, setPhotos] = useState<string[]>([]);
  const [isCompressingPhotos, setIsCompressingPhotos] = useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<VehicleFormFieldErrorKey, string>>>(
    {}
  );

  const marginPreview = useMemo(
    () => computeVehicleMarginPreview(purchasePrice, targetSalePrice),
    [purchasePrice, targetSalePrice]
  );

  const presetSources = [
    {
      value: 'source:particulier',
      label: L(
        'Particulier / Leboncoin',
        'Частное лицо / Leboncoin',
        'Անհատ / Leboncoin',
        'კერძო პირი / Leboncoin'
      ),
    },
    {
      value: 'source:auction',
      label: L(
        'Enchères (BCA / Alcopa)',
        'Аукцион (BCA / Alcopa)',
        'Աճուրդ (BCA / Alcopa)',
        'აუქციონი (BCA / Alcopa)'
      ),
    },
    {
      value: 'source:dealership',
      label: L(
        'Concessionnaire / Reprise',
        'Дилер / Трейд-ин',
        'Դիլեր / Փոխանակում',
        'დილერი / Trade-in'
      ),
    },
  ];

  const supplierOptions = [
    {
      value: '',
      label: L('Non précisé', 'Не указан', 'Նշված չէ', 'მითითებული არ არის'),
    },
    ...suppliers.map((s) => ({
      value: `sup:${s.id}`,
      label: s.name,
    })),
    ...presetSources,
    {
      value: CUSTOM_SUPPLIER_VALUE,
      label: L(
        'Autre (saisie libre)...',
        'Другой (ввести вручную)...',
        'Այլ (ձեռքով մուտքագրում)...',
        'სხვა (ხელით შეყვანა)...'
      ),
    },
  ];

  const statusOptions: Array<{ value: VehicleStatus; label: string }> = [
    { value: 'preparation', label: `🛠️ ${t('statusPreparation')}` },
    { value: 'repair', label: `🔧 ${t('statusRepair')}` },
    { value: 'for_sale', label: `🏷️ ${t('statusForSale')}` },
    { value: 'sold', label: `✅ ${t('statusSold')}` },
  ];

  const resolveSelectedSupplier = (): { supplierId?: string; supplierName?: string } => {
    if (!supplierSelection) return {};
    if (supplierSelection === CUSTOM_SUPPLIER_VALUE) {
      const trimmed = customSupplierName.trim();
      return trimmed ? { supplierName: trimmed } : {};
    }
    if (supplierSelection.startsWith('sup:')) {
      const id = supplierSelection.slice(4);
      const found = suppliers.find((s) => s.id === id);
      return found ? { supplierId: found.id, supplierName: found.name } : {};
    }
    const preset = presetSources.find((p) => p.value === supplierSelection);
    return preset ? { supplierName: preset.label } : {};
  };

  const processPhotoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsCompressingPhotos(true);
    setError(null);
    try {
      const incomingUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const compressed = await compressImageFileToDataUrl(file);
        incomingUrls.push(compressed.dataUrl);
      }
      if (incomingUrls.length === 0) return;

      setPhotos((prev) => {
        const nextList = [...prev];
        let rejectedForLimit = false;
        for (const url of incomingUrls) {
          const candidate = [...nextList, url];
          if (estimatePhotosPayloadBytes(candidate) <= MAX_VEHICLE_PHOTOS_BYTES) {
            nextList.push(url);
          } else {
            rejectedForLimit = true;
          }
        }
        if (rejectedForLimit) {
          const limitMsg = L(
            'Taille totale des photos trop élevée. Essayez avec moins d’images.',
            'Общий размер фотографий слишком большой. Загрузите меньше изображений.',
            'Լուսանկարների ընդհանուր չափը չափազանց մեծ է։ Փորձեք ավելի քիչ նկարներ վերբեռնել։',
            'ფოტოების საერთო ზომა ძალიან დიდია. სცადეთ ნაკლები სურათის ატვირთვა.'
          );
          setError(limitMsg);
          onValidationToast?.(limitMsg);
        }
        return nextList;
      });
    } catch {
      const errMsg = L(
        'Impossible de traiter certaines photos.',
        'Не удалось обработать выбранные фото.',
        'Չհաջողվեց մշակել ընտրված լուսանկարները։',
        'შერჩეული ფოტოების დამუშავება ვერ მოხერხდა.'
      );
      setError(errMsg);
    } finally {
      setIsCompressingPhotos(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    void processPhotoFiles(e.target.files);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { supplierId, supplierName } = resolveSelectedSupplier();
    const formState = {
      make,
      model,
      commercialDesignation: '',
      firstRegistrationDate: '',
      trim: '',
      year,
      registrationNumber,
      purchasePrice,
      vin: '',
      mileage,
      fuelType: '',
      gearbox: '',
      typeVariantVersion: '',
      nationalGenre: 'VP',
      bodyType: '',
      hasRegistrationCertificate: null,
      formulaNumber: '',
      certificateDate: '',
      absenceReason: '',
      purchaseDate,
      targetSalePrice,
      supplierId,
      supplierName,
      status,
      purchaseStatus,
      photos,
    };

    const validation = validateVehicleFormDetailed(formState, lang);
    if (validation.firstError) {
      setFieldErrors(validation.fieldErrors);
      setError(validation.firstError);
      if (validation.toastMessage) {
        onValidationToast?.(validation.toastMessage);
      }
      return;
    }

    if (estimatePhotosPayloadBytes(photos) > MAX_VEHICLE_PHOTOS_BYTES) {
      const limitMsg = L(
        'Taille totale des photos trop élevée. Supprimez une photo pour continuer.',
        'Общий размер фотографий слишком большой. Удалите одно фото, чтобы продолжить.',
        'Լուսանկարների ընդհանուր չափը չափազանց մեծ է։ Շարունակելու համար հեռացրեք մեկ լուսանկար։',
        'ფოტოების საერთო ზომა ძალიან დიდია. გასაგრძელებლად წაშალეთ ერთი ფოტო.'
      );
      setError(limitMsg);
      onValidationToast?.(limitMsg);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setFieldErrors({});
      const payload = buildVehicleSubmitPayload(formState, userId, null, activeGarageId);
      await onSubmit(payload);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : L(
              'Une erreur est survenue lors de l’enregistrement.',
              'Ошибка при сохранении автомобиля.',
              'Սխալ՝ ավտոմեքենան պահպանելիս։',
              'შეცდომა ავტომობილის შენახვისას.'
            )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full h-[42px] px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition';
  const inputErrorClass =
    'w-full h-[42px] px-3.5 py-2 bg-[var(--background)] border border-red-500 ring-2 ring-red-500/20 rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-red-500 transition';
  const getInputClass = (hasErr: boolean, extra = '') =>
    `${hasErr ? inputErrorClass : inputClass}${extra ? ` ${extra}` : ''}`;
  const labelClass = 'block text-xs font-semibold text-[var(--secondary-foreground)] mb-1.5';

  const backLabel = L('Retour', 'Назад', 'Հետ', 'უკან');
  const submitLabel = L(
    'Ajouter le véhicule',
    'Добавить автомобиль',
    'Ավելացնել ավտոմեքենա',
    'ავტომობილის დამატება'
  );
  const subtitleText = L(
    'Saisie rapide des données essentielles pour la mise en parc',
    'Быстрое заполнение основных данных для постановки в автопарк',
    'Հիմնական տվյալների արագ լրացում ավտոպարկում գրանցելու համար',
    'ავტოპარკში დასამატებელი ძირითადი მონაცემების სწრაფი შევსება'
  );

  const formattedPercent = `${marginPreview.grossMarginPercent > 0 ? '+' : ''}${marginPreview.grossMarginPercent.toFixed(1)}%`;
  const formattedMarginEuro = `${marginPreview.grossMarginEuro > 0 ? '+' : ''}${formatEuro(
    marginPreview.grossMarginEuro
  )}`;

  return (
    <div data-testid="add-vehicle-page" className="max-w-6xl mx-auto space-y-5 pb-10">
      {/* Page Header Bar */}
      <div
        data-testid="add-vehicle-page-header"
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1"
      >
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <button
            type="button"
            data-testid="add-vehicle-back-btn"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--card)] hover:bg-[var(--surface-muted)] border border-[var(--border)] text-xs font-semibold text-[var(--secondary-foreground)] hover:text-[var(--foreground)] transition cursor-pointer whitespace-nowrap shrink-0 mt-0.5 sm:mt-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{backLabel}</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[var(--primary)] flex items-center justify-center shrink-0">
                <Car className="w-4 h-4" />
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[var(--foreground)] tracking-tight truncate">
                {submitLabel}
              </h1>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{subtitleText}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="add-vehicle-cancel-btn"
            onClick={onBack}
            className="px-4 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-semibold text-[var(--secondary-foreground)] hover:text-[var(--foreground)] bg-[var(--card)] hover:bg-[var(--surface-muted)] border border-[var(--border)] transition cursor-pointer whitespace-nowrap shrink-0"
          >
            {t('cancelBtn')}
          </button>
          <button
            type="submit"
            form="add-vehicle-intake-form"
            data-testid="add-vehicle-submit-btn"
            disabled={isSubmitting || isCompressingPhotos}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 shadow-md transition cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('loading')}</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{submitLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main 2-Column Intake Form (8/4 grid) */}
      <form
        id="add-vehicle-intake-form"
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
      >
        {error && (
          <div
            role="alert"
            data-testid="add-vehicle-validation-error"
            className="p-3.5 bg-red-500/10 border border-red-500/40 rounded-[var(--ag-card-radius)] text-xs text-red-400 flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (~65% width, 8/12): 2 stacked cards */}
          <div className="lg:col-span-8 space-y-5">
            {/* Card 1: Vehicle & Identification */}
            <section
              data-testid="add-vehicle-card-identity"
              className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 sm:p-6 shadow-sm space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[var(--border)]">
                <h2 className="text-sm font-bold text-[var(--foreground)]">
                  {L(
                    'Véhicule & identification',
                    'Автомобиль и идентификация',
                    'Ավտոմեքենա և նույնականացում',
                    'ავტომობილი და იდენტიფიკაცია'
                  )}
                </h2>

                {/* 2-option pill toggle (uses user's single account profile) */}
                <div
                  role="group"
                  aria-label={L(
                    'Type d’activité',
                    'Режим учёта',
                    'Հաշվառման տեսակ',
                    'საქმიანობის ტიპი'
                  )}
                  className="inline-flex items-center p-0.5 rounded-full bg-[var(--background)] border border-[var(--border)]"
                >
                  <button
                    type="button"
                    data-testid="add-vehicle-mode-pro"
                    aria-pressed={purchaseStatus === 'micro'}
                    onClick={() => setPurchaseStatus('micro')}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      purchaseStatus === 'micro'
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {L(
                      'Activité pro',
                      'Проф. деятельность',
                      'Մասնագիտական',
                      'პროფ. საქმიანობა'
                    )}
                  </button>
                  <button
                    type="button"
                    data-testid="add-vehicle-mode-personal"
                    aria-pressed={purchaseStatus === 'particulier'}
                    onClick={() => setPurchaseStatus('particulier')}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      purchaseStatus === 'particulier'
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {L(
                      'Vente personnelle',
                      'Личная продажа',
                      'Անձնական վաճառք',
                      'პირადი გაყიდვა'
                    )}
                  </button>
                </div>
              </div>

              {/* Row 1 (2 columns): Brand * / Model * */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="add-vehicle-make" className={labelClass}>
                    {t('make')} *
                  </label>
                  <input
                    id="add-vehicle-make"
                    data-testid="add-vehicle-make"
                    type="text"
                    required
                    autoFocus
                    value={make}
                    onChange={(e) => {
                      setMake(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, make: undefined }));
                    }}
                    placeholder="Peugeot"
                    className={getInputClass(Boolean(fieldErrors.make))}
                  />
                </div>

                <div>
                  <label htmlFor="add-vehicle-model" className={labelClass}>
                    {t('model')} *
                  </label>
                  <input
                    id="add-vehicle-model"
                    data-testid="add-vehicle-model"
                    type="text"
                    required
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, model: undefined }));
                    }}
                    placeholder="3008"
                    className={getInputClass(Boolean(fieldErrors.model))}
                  />
                </div>
              </div>

              {/* Row 2 (4 columns): Year * / Plate * / Mileage / Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
                <div>
                  <label htmlFor="add-vehicle-year" className={labelClass}>
                    {t('year')} *
                  </label>
                  <input
                    id="add-vehicle-year"
                    data-testid="add-vehicle-year"
                    type="number"
                    required
                    min={1900}
                    max={2100}
                    value={year}
                    onChange={(e) => {
                      setYear(e.target.value === '' ? '' : Number(e.target.value));
                      setFieldErrors((prev) => ({ ...prev, year: undefined }));
                    }}
                    placeholder="2022"
                    className={getInputClass(Boolean(fieldErrors.year), 'tabular-nums')}
                  />
                </div>

                <div>
                  <label htmlFor="add-vehicle-plate" className={labelClass}>
                    {t('thPlate')} *
                  </label>
                  <input
                    id="add-vehicle-plate"
                    data-testid="add-vehicle-plate"
                    type="text"
                    required
                    value={registrationNumber}
                    onChange={(e) => {
                      setRegistrationNumber(e.target.value.toUpperCase());
                      setFieldErrors((prev) => ({ ...prev, registrationNumber: undefined }));
                    }}
                    placeholder="AA-123-BB"
                    className={getInputClass(
                      Boolean(fieldErrors.registrationNumber),
                      'font-mono uppercase placeholder:normal-case'
                    )}
                  />
                </div>

                <div>
                  <label htmlFor="add-vehicle-mileage" className={labelClass}>
                    {t('mileage')}
                  </label>
                  <input
                    id="add-vehicle-mileage"
                    data-testid="add-vehicle-mileage"
                    type="number"
                    min={0}
                    value={mileage}
                    onChange={(e) => {
                      setMileage(e.target.value === '' ? '' : Number(e.target.value));
                      setFieldErrors((prev) => ({ ...prev, mileage: undefined }));
                    }}
                    placeholder="48000"
                    className={getInputClass(Boolean(fieldErrors.mileage), 'tabular-nums')}
                  />
                </div>

                <div>
                  <label htmlFor="add-vehicle-status" className={labelClass}>
                    {t('thStatus')}
                  </label>
                  <ThemedSelect<VehicleStatus>
                    id="add-vehicle-status"
                    testId="add-vehicle-status-select"
                    ariaLabel={t('thStatus')}
                    value={status}
                    onChange={setStatus}
                    options={statusOptions}
                    triggerClassName={`${inputClass} px-3 text-[13px] font-medium`}
                  />
                </div>
              </div>
            </section>

            {/* Card 2: Purchase & Supplier */}
            <section
              data-testid="add-vehicle-card-purchase"
              className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 sm:p-6 shadow-sm space-y-5"
            >
              <div className="pb-3.5 border-b border-[var(--border)]">
                <h2 className="text-sm font-bold text-[var(--foreground)]">
                  {L(
                    'Achat & fournisseur',
                    'Покупка и поставщик',
                    'Գնում և մատակարար',
                    'შესყიდვა და მომწოდებელი'
                  )}
                </h2>
              </div>

              {/* Row 1 (3 columns): Purchase Price (€) * / Planned Price (€) / Purchase Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="add-vehicle-purchase-price" className={labelClass}>
                    {t('purchasePriceLabel')} (€) *
                  </label>
                  <input
                    id="add-vehicle-purchase-price"
                    data-testid="add-vehicle-purchase-price"
                    type="number"
                    required
                    min={0}
                    step="any"
                    value={purchasePrice}
                    onChange={(e) => {
                      setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value));
                      setFieldErrors((prev) => ({ ...prev, purchasePrice: undefined }));
                    }}
                    placeholder="12500"
                    className={getInputClass(
                      Boolean(fieldErrors.purchasePrice),
                      'font-bold tabular-nums'
                    )}
                  />
                </div>

                <div>
                  <label htmlFor="add-vehicle-target-price" className={labelClass}>
                    {L(
                      'Prix de vente prévu (€)',
                      'Планируемая цена (€)',
                      'Նախատեսվող գին (€)',
                      'დაგეგმილი ფასი (€)'
                    )}
                  </label>
                  <input
                    id="add-vehicle-target-price"
                    data-testid="add-vehicle-target-price"
                    type="number"
                    min={0}
                    step="any"
                    value={targetSalePrice}
                    onChange={(e) =>
                      setTargetSalePrice(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="15900"
                    className={`${inputClass} font-bold tabular-nums`}
                  />
                </div>

                <div>
                  <label htmlFor="add-vehicle-purchase-date" className={labelClass}>
                    {t('purchaseDate')}
                  </label>
                  <LocaleDateInput
                    id="add-vehicle-purchase-date"
                    testId="add-vehicle-purchase-date"
                    ariaLabel={t('purchaseDate')}
                    value={purchaseDate}
                    onChange={setPurchaseDate}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Row 2: Supplier / Source (+ optional custom input when "Другой" selected) */}
              <div
                className={`grid grid-cols-1 ${
                  supplierSelection === CUSTOM_SUPPLIER_VALUE ? 'sm:grid-cols-2' : ''
                } gap-4`}
              >
                <div>
                  <label htmlFor="add-vehicle-supplier" className={labelClass}>
                    {L(
                      'Fournisseur / Source',
                      'Поставщик / Источник',
                      'Մատակարար / Աղբյուր',
                      'მომწოდებელი / წყარო'
                    )}
                  </label>
                  <ThemedSelect
                    id="add-vehicle-supplier"
                    testId="add-vehicle-supplier-select"
                    ariaLabel={L(
                      'Fournisseur / Source',
                      'Поставщик / Источник',
                      'Մատակարար / Աղբյուր',
                      'მომწოდებელი / წყარო'
                    )}
                    value={supplierSelection}
                    onChange={(val) => {
                      setSupplierSelection(val);
                      if (val !== CUSTOM_SUPPLIER_VALUE) {
                        setCustomSupplierName('');
                      }
                    }}
                    options={supplierOptions}
                    triggerClassName={inputClass}
                  />
                </div>

                {supplierSelection === CUSTOM_SUPPLIER_VALUE && (
                  <div>
                    <label htmlFor="add-vehicle-supplier-custom" className={labelClass}>
                      {L(
                        'Nom du vendeur / source',
                        'Укажите источник или имя продавца',
                        'Նշեք աղբյուրը կամ վաճառողի անունը',
                        'მიუთითეთ წყარო ან გამყიდველის სახელი'
                      )}
                    </label>
                    <input
                      id="add-vehicle-supplier-custom"
                      data-testid="add-vehicle-supplier-custom"
                      type="text"
                      value={customSupplierName}
                      onChange={(e) => setCustomSupplierName(e.target.value)}
                      placeholder={L(
                        'ex. Leboncoin Paris, Garage Martin...',
                        'напр. Leboncoin, Автосалон...',
                        'օր.՝ Leboncoin, Ավտոսրահ...',
                        'მაგ. Leboncoin, ავტოსალონი...'
                      )}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>

              {/* Footer Helper Note */}
              <div className="pt-3.5 border-t border-[var(--border)] flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                <Info className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                <span>
                  {L(
                    'Les champs étendus (VIN, Carte Grise, Cerfa) sont disponibles après l’ajout dans la fiche véhicule.',
                    'Расширенные поля (VIN, Carte Grise, Cerfa) доступны после добавления в карточке авто.',
                    'Ընդլայնված դաշտերը (VIN, Carte Grise, Cerfa) հասանելի են ավելացնելուց հետո՝ մեքենայի քարտում։',
                    'გაფართოებული ველები (VIN, Carte Grise, Cerfa) ხელმისაწვდომია დამატების შემდეგ ავტომობილის ბარათში.'
                  )}
                </span>
              </div>
            </section>
          </div>

          {/* Right Column (~35% width, 4/12): 2 stacked cards */}
          <div className="lg:col-span-4 space-y-5">
            {/* Card 3: Compact Photo */}
            <section
              data-testid="add-vehicle-photos"
              className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
                <h2 className="text-sm font-bold text-[var(--foreground)]">
                  {L(
                    'Photo compacte',
                    'Компактное фото',
                    'Կոմպակտ լուսանկար',
                    'კომპაქტური ფოტო'
                  )}
                </h2>
                <label
                  htmlFor="add-vehicle-photo-input"
                  data-testid="add-vehicle-choose-photo-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-muted)] hover:bg-[var(--background)] border border-[var(--border)] text-xs font-semibold text-[var(--foreground)] transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>
                    {L(
                      'Choisir une photo',
                      'Выбрать фото',
                      'Ընտրել լուսանկար',
                      'ფოტოს არჩევა'
                    )}
                  </span>
                </label>
              </div>

              <label
                htmlFor="add-vehicle-photo-input"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingPhoto(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingPhoto(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingPhoto(false);
                  void processPhotoFiles(e.dataTransfer.files);
                }}
                className={`flex flex-col items-center justify-center text-center gap-2 px-4 py-6 rounded-xl border border-dashed cursor-pointer transition ${
                  isDraggingPhoto
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                    : 'border-[var(--border)] bg-[var(--background)]/70 hover:border-[var(--primary)]/60 text-[var(--foreground)]'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)]">
                  {isCompressingPhotos ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    {L(
                      'Glissez-déposez ou cliquez pour importer',
                      'Перетащите фото или выберите с устройства',
                      'Քաշեք լուսանկարը կամ ընտրեք սարքից',
                      'გადმოათრიეთ ფოტო ან აირჩიეთ მოწყობილობიდან'
                    )}
                  </p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {L(
                      'PNG, JPG, WEBP · compression automatique',
                      'PNG, JPG, WEBP · автосжатие',
                      'PNG, JPG, WEBP · ավտոմատ սեղմում',
                      'PNG, JPG, WEBP · ავტომატური შეკუმშვა'
                    )}
                  </p>
                </div>
                <input
                  id="add-vehicle-photo-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  {photos.map((url, index) => (
                    <div
                      key={index}
                      className="relative aspect-[4/3] rounded-lg overflow-hidden border border-[var(--border)] group"
                    >
                      <img
                        src={url}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                        aria-label={t('deleteBtn')}
                        className="absolute top-1 right-1 p-1 rounded-full bg-slate-950/85 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Card 4: Live Margin Estimate */}
            <section
              data-testid="add-vehicle-card-margin"
              className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 shadow-sm space-y-4"
            >
              <div className="pb-3 border-b border-[var(--border)]">
                <h2 className="text-sm font-bold text-[var(--foreground)]">
                  {L(
                    'Estimation de marge',
                    'Оценка маржи',
                    'Մարժայի գնահատական',
                    'მარჟის შეფასება'
                  )}
                </h2>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--muted-foreground)]">
                    {L(
                      'Prix d’achat',
                      'Цена покупки',
                      'Գնման գին',
                      'შესყიდვის ფასი'
                    )}
                  </span>
                  <span
                    data-testid="margin-preview-purchase"
                    className="font-mono font-semibold text-[var(--foreground)] tabular-nums"
                  >
                    {marginPreview.hasPurchasePrice
                      ? formatEuro(marginPreview.purchasePrice)
                      : '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--muted-foreground)]">
                    {L(
                      'Prix prévu',
                      'Планируемая цена',
                      'Նախատեսվող գին',
                      'დაგეგმილი ფასი'
                    )}
                  </span>
                  <span
                    data-testid="margin-preview-target"
                    className="font-mono font-semibold text-[var(--foreground)] tabular-nums"
                  >
                    {marginPreview.hasTargetSalePrice
                      ? formatEuro(marginPreview.targetSalePrice)
                      : '—'}
                  </span>
                </div>

                <div className="pt-3 border-t border-[var(--border)] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--secondary-foreground)]">
                      {L(
                        'Marge brute estimée',
                        'Ожидаемая валовая маржа',
                        'Ակնկալվող համախառն մարժա',
                        'მოსალოდნელი მთლიანი მარჟა'
                      )}
                    </span>
                    {marginPreview.isComplete && (
                      <span
                        data-testid="margin-preview-percent"
                        className={`inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums ${
                          marginPreview.grossMarginEuro >= 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        }`}
                      >
                        {marginPreview.grossMarginEuro >= 0 ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5" />
                        )}
                        {formattedPercent}
                      </span>
                    )}
                  </div>

                  {marginPreview.isComplete ? (
                    <div
                      data-testid="margin-preview-euro"
                      className={`text-xl font-black font-mono tabular-nums tracking-tight ${
                        marginPreview.grossMarginEuro >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {formattedMarginEuro}
                    </div>
                  ) : (
                    <p
                      data-testid="margin-preview-empty"
                      className="text-xs text-[var(--muted-foreground)] leading-relaxed"
                    >
                      {L(
                        'Renseignez le prix d’achat et le prix prévu pour calculer la marge en direct.',
                        'Укажите цену покупки и планируемую цену для расчёта маржи.',
                        'Նշեք գնման և նախատեսվող գները՝ մարժան հաշվարկելու համար։',
                        'მიუთითეთ შესყიდვის და დაგეგმილი ფასები მარჟის დასათვლელად.'
                      )}
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <div
          data-testid="add-vehicle-bottom-actions"
          className="pt-4 border-t border-[var(--border)] flex items-center justify-end gap-2.5"
        >
          <button
            type="button"
            data-testid="add-vehicle-footer-cancel-btn"
            onClick={onBack}
            className="px-4 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-semibold text-[var(--secondary-foreground)] hover:text-[var(--foreground)] bg-[var(--card)] hover:bg-[var(--surface-muted)] border border-[var(--border)] transition cursor-pointer whitespace-nowrap shrink-0"
          >
            {t('cancelBtn')}
          </button>
          <button
            type="submit"
            data-testid="add-vehicle-footer-submit-btn"
            disabled={isSubmitting || isCompressingPhotos}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 shadow-md transition cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('loading')}</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {L(
                    'Enregistrer l’achat',
                    'Сохранить покупку',
                    'Պահպանել գնումը',
                    'შესყიდვის შენახვა'
                  )}
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
