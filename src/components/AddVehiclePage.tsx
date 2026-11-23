import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Car,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react';
import {
  GarageSettings,
  Supplier,
  Vehicle,
  VehiclePurchaseStatus,
  VehicleStatus,
} from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { ThemedSelect } from './ThemedSelect';
import { LocaleDateInput } from './LocaleDateInput';
import { SellerProfileSelector } from './SellerProfileSelector';
import { fetchGarageSettingsFromCloud, getGarageSettings } from '../services/garageService';
import { compressImageFileToDataUrl } from '../utils/documentFileHelpers';
import { formatEuro } from '../utils/finance';
import {
  buildVehicleSubmitPayload,
  computeVehicleMarginPreview,
  estimatePhotosPayloadBytes,
  MAX_VEHICLE_PHOTOS_BYTES,
  resolveDefaultPurchaseStatus,
  resolveDefaultSellerProfileId,
  resolveInitialConsolidatedModel,
  resolveTargetGarageId,
  resolveVehiclePurchaseStatus,
  resolveVehicleSellerProfileId,
  validateVehicleFormDetailed,
  VehicleFormFieldErrorKey,
} from '../utils/vehicleFormUtils';

interface AddVehiclePageProps {
  userId: string;
  activeGarageId?: string | null;
  initialVehicle?: Vehicle | null;
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
  initialVehicle = null,
  defaultPurchaseStatus = 'micro',
  suppliers,
  onBack,
  onSubmit,
  onValidationToast,
}) => {
  const { t, lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const isEditMode = Boolean(initialVehicle);
  const targetGarageId = resolveTargetGarageId(initialVehicle, activeGarageId);
  const hasEditedPurchaseStatusRef = useRef(false);

  const presetSources = useMemo(
    () => [
      {
        value: 'source:particulier',
        label: pickLocalized(lang, {
          fr: 'Particulier / Leboncoin',
          ru: 'Частное лицо / Leboncoin',
          hy: 'Անհատ / Leboncoin',
          ka: 'კერძო პირი / Leboncoin',
        }),
      },
      {
        value: 'source:auction',
        label: pickLocalized(lang, {
          fr: 'Enchères (BCA / Alcopa)',
          ru: 'Аукцион (BCA / Alcopa)',
          hy: 'Աճուրդ (BCA / Alcopa)',
          ka: 'აუქციონი (BCA / Alcopa)',
        }),
      },
      {
        value: 'source:dealership',
        label: pickLocalized(lang, {
          fr: 'Concessionnaire / Reprise',
          ru: 'Дилер / Трейд-ин',
          hy: 'Դիլեր / Փոխանակում',
          ka: 'დილერი / Trade-in',
        }),
      },
    ],
    [lang]
  );

  const resolveInitialSupplierState = (
    vehicle: Vehicle | null | undefined,
    supplierList: Supplier[]
  ): { selection: string; customName: string } => {
    if (!vehicle) return { selection: '', customName: '' };
    if (vehicle.supplierId && supplierList.some((s) => s.id === vehicle.supplierId)) {
      return { selection: `sup:${vehicle.supplierId}`, customName: '' };
    }
    const rawName = (vehicle.supplierName || '').trim();
    if (!rawName) return { selection: '', customName: '' };
    const matchedSupplier = supplierList.find(
      (s) => s.name.trim().toLowerCase() === rawName.toLowerCase()
    );
    if (matchedSupplier) {
      return { selection: `sup:${matchedSupplier.id}`, customName: '' };
    }
    const matchedPreset = presetSources.find(
      (p) => p.label.toLowerCase() === rawName.toLowerCase()
    );
    if (matchedPreset) {
      return { selection: matchedPreset.value, customName: '' };
    }
    return { selection: CUSTOM_SUPPLIER_VALUE, customName: rawName };
  };

  const [garageSettings, setGarageSettings] = useState<GarageSettings>(() =>
    getGarageSettings(targetGarageId)
  );
  const [purchaseStatus, setPurchaseStatus] = useState<VehiclePurchaseStatus>(() =>
    initialVehicle
      ? resolveVehiclePurchaseStatus(initialVehicle, 'micro_entrepreneur')
      : defaultPurchaseStatus
  );
  const [sellerProfileId, setSellerProfileId] = useState<string | undefined>(() =>
    initialVehicle
      ? resolveVehicleSellerProfileId(
          initialVehicle,
          resolveVehiclePurchaseStatus(initialVehicle, 'micro_entrepreneur'),
          getGarageSettings(targetGarageId)
        )
      : resolveDefaultSellerProfileId(defaultPurchaseStatus, getGarageSettings(targetGarageId))
  );

  // Core vehicle fields
  const [make, setMake] = useState(() => initialVehicle?.make || '');
  const [model, setModel] = useState(() => resolveInitialConsolidatedModel(initialVehicle));
  const [year, setYear] = useState<number | ''>(
    () => initialVehicle?.year ?? new Date().getFullYear()
  );
  const [registrationNumber, setRegistrationNumber] = useState(
    () => initialVehicle?.registrationNumber || ''
  );
  const [mileage, setMileage] = useState<number | ''>(() =>
    initialVehicle && initialVehicle.mileage > 0 ? initialVehicle.mileage : ''
  );
  const [status, setStatus] = useState<VehicleStatus>(
    () => initialVehicle?.status || 'preparation'
  );

  // Purchase & Pricing
  const [purchasePrice, setPurchasePrice] = useState<number | ''>(() =>
    initialVehicle ? initialVehicle.purchasePrice : ''
  );
  const [targetSalePrice, setTargetSalePrice] = useState<number | ''>(() =>
    initialVehicle && initialVehicle.targetSalePrice > 0 ? initialVehicle.targetSalePrice : ''
  );
  const [purchaseDate, setPurchaseDate] = useState(
    () => initialVehicle?.purchaseDate || new Date().toISOString().split('T')[0]
  );

  // Supplier / Source (dropdown + optional custom text)
  const initialSupplierState = resolveInitialSupplierState(initialVehicle, suppliers);
  const [supplierSelection, setSupplierSelection] = useState<string>(
    initialSupplierState.selection
  );
  const [customSupplierName, setCustomSupplierName] = useState<string>(
    initialSupplierState.customName
  );

  // Collapsible Technical & Carte Grise / Cerfa Details
  const [isExtendedOpen, setIsExtendedOpen] = useState<boolean>(() => Boolean(initialVehicle));
  const [vin, setVin] = useState(() => initialVehicle?.vin || '');
  const [fuelType, setFuelType] = useState(() => initialVehicle?.fuelType || '');
  const [gearbox, setGearbox] = useState(() => initialVehicle?.gearbox || '');
  const [firstRegistrationDate, setFirstRegistrationDate] = useState(
    () => initialVehicle?.firstRegistrationDate || ''
  );
  const [nationalGenre, setNationalGenre] = useState(
    () => initialVehicle?.nationalGenre || 'VP'
  );
  const [hasRegistrationCertificate, setHasRegistrationCertificate] = useState<boolean | null>(() =>
    typeof initialVehicle?.hasRegistrationCertificate === 'boolean'
      ? initialVehicle.hasRegistrationCertificate
      : null
  );
  const [formulaNumber, setFormulaNumber] = useState(() => initialVehicle?.formulaNumber || '');
  const [certificateDate, setCertificateDate] = useState(
    () => initialVehicle?.certificateDate || ''
  );
  const [absenceReason, setAbsenceReason] = useState(() => initialVehicle?.absenceReason || '');

  // Compact Photos (auto-compressed & strictly guarded for document size limit)
  const [photos, setPhotos] = useState<string[]>(() => initialVehicle?.photos || []);
  const [isCompressingPhotos, setIsCompressingPhotos] = useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<VehicleFormFieldErrorKey, string>>>(
    {}
  );

  // Sync form state cleanly when switching between create mode and a vehicle in edit mode
  useEffect(() => {
    hasEditedPurchaseStatusRef.current = false;
    const scopedSettings = getGarageSettings(targetGarageId);
    setGarageSettings(scopedSettings);
    const scopedFallbackProfile =
      resolveDefaultPurchaseStatus(undefined, scopedSettings) === 'particulier'
        ? 'particulier'
        : 'micro_entrepreneur';

    if (initialVehicle) {
      setMake(initialVehicle.make);
      setModel(resolveInitialConsolidatedModel(initialVehicle));
      setYear(initialVehicle.year);
      setRegistrationNumber(initialVehicle.registrationNumber || '');
      setMileage(initialVehicle.mileage > 0 ? initialVehicle.mileage : '');
      setStatus(initialVehicle.status);
      setPurchasePrice(initialVehicle.purchasePrice);
      setTargetSalePrice(
        initialVehicle.targetSalePrice > 0 ? initialVehicle.targetSalePrice : ''
      );
      setPurchaseDate(initialVehicle.purchaseDate || new Date().toISOString().split('T')[0]);

      const resolvedStatus = resolveVehiclePurchaseStatus(
        initialVehicle,
        initialVehicle.garageId
          ? scopedFallbackProfile
          : defaultPurchaseStatus === 'particulier'
          ? 'particulier'
          : scopedFallbackProfile
      );
      setPurchaseStatus(resolvedStatus);
      setSellerProfileId(
        resolveVehicleSellerProfileId(initialVehicle, resolvedStatus, scopedSettings)
      );

      const supState = resolveInitialSupplierState(initialVehicle, suppliers);
      setSupplierSelection(supState.selection);
      setCustomSupplierName(supState.customName);

      setIsExtendedOpen(true);
      setVin(initialVehicle.vin || '');
      setFuelType(initialVehicle.fuelType || '');
      setGearbox(initialVehicle.gearbox || '');
      setFirstRegistrationDate(initialVehicle.firstRegistrationDate || '');
      setNationalGenre(initialVehicle.nationalGenre || 'VP');
      setHasRegistrationCertificate(
        typeof initialVehicle.hasRegistrationCertificate === 'boolean'
          ? initialVehicle.hasRegistrationCertificate
          : null
      );
      setFormulaNumber(initialVehicle.formulaNumber || '');
      setCertificateDate(initialVehicle.certificateDate || '');
      setAbsenceReason(initialVehicle.absenceReason || '');
      setPhotos(initialVehicle.photos || []);
    } else {
      setMake('');
      setModel('');
      setYear(new Date().getFullYear());
      setRegistrationNumber('');
      setMileage('');
      setStatus('preparation');
      setPurchasePrice('');
      setTargetSalePrice('');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setPurchaseStatus(defaultPurchaseStatus);
      setSellerProfileId(resolveDefaultSellerProfileId(defaultPurchaseStatus, scopedSettings));
      setSupplierSelection('');
      setCustomSupplierName('');
      setIsExtendedOpen(false);
      setVin('');
      setFuelType('');
      setGearbox('');
      setFirstRegistrationDate('');
      setNationalGenre('VP');
      setHasRegistrationCertificate(null);
      setFormulaNumber('');
      setCertificateDate('');
      setAbsenceReason('');
      setPhotos([]);
    }
    setError(null);
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVehicle?.id, targetGarageId, defaultPurchaseStatus]);

  useEffect(() => {
    const syncLocal = () => setGarageSettings(getGarageSettings(targetGarageId));
    syncLocal();
    window.addEventListener('autogarage_settings_updated', syncLocal);
    let cancelled = false;
    if (userId) {
      fetchGarageSettingsFromCloud(userId, targetGarageId).then((cloud) => {
        if (cancelled) return;
        setGarageSettings(cloud);
        if (hasEditedPurchaseStatusRef.current) return;
        if (initialVehicle) {
          const resolvedStatus = resolveVehiclePurchaseStatus(initialVehicle, 'micro_entrepreneur');
          setSellerProfileId(
            resolveVehicleSellerProfileId(initialVehicle, resolvedStatus, cloud)
          );
        }
      });
    }
    return () => {
      cancelled = true;
      window.removeEventListener('autogarage_settings_updated', syncLocal);
    };
  }, [userId, targetGarageId, initialVehicle]);

  const marginPreview = useMemo(
    () => computeVehicleMarginPreview(purchasePrice, targetSalePrice),
    [purchasePrice, targetSalePrice]
  );

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

  const resolveSelectedSupplier = (): { supplierId: string; supplierName: string } => {
    if (!supplierSelection) return { supplierId: '', supplierName: '' };
    if (supplierSelection === CUSTOM_SUPPLIER_VALUE) {
      return { supplierId: '', supplierName: customSupplierName.trim() };
    }
    if (supplierSelection.startsWith('sup:')) {
      const id = supplierSelection.slice(4);
      const found = suppliers.find((s) => s.id === id);
      return found ? { supplierId: found.id, supplierName: found.name } : { supplierId: '', supplierName: '' };
    }
    const preset = presetSources.find((p) => p.value === supplierSelection);
    return preset ? { supplierId: '', supplierName: preset.label } : { supplierId: '', supplierName: '' };
  };

  const handleFirstRegDateChange = (nextDate: string) => {
    setFirstRegistrationDate(nextDate);
    setFieldErrors((prev) => ({ ...prev, firstRegistrationDate: undefined, year: undefined }));
    if (/^\d{4}/.test(nextDate.trim())) {
      const parsedYr = Number(nextDate.trim().slice(0, 4));
      if (!Number.isNaN(parsedYr) && parsedYr >= 1900 && parsedYr <= 2100) {
        setYear(parsedYr);
      }
    }
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
    const consolidatedModel = model.trim();
    const formState = {
      make,
      model: consolidatedModel,
      commercialDesignation: consolidatedModel,
      firstRegistrationDate,
      trim: consolidatedModel,
      year,
      registrationNumber,
      purchasePrice,
      vin,
      mileage,
      fuelType,
      gearbox,
      typeVariantVersion: initialVehicle?.typeVariantVersion || '',
      nationalGenre,
      bodyType: initialVehicle?.bodyType || '',
      hasRegistrationCertificate,
      formulaNumber: hasRegistrationCertificate === false ? '' : formulaNumber,
      certificateDate: hasRegistrationCertificate === false ? '' : certificateDate,
      absenceReason: hasRegistrationCertificate === false ? absenceReason : '',
      purchaseDate,
      targetSalePrice,
      supplierId,
      supplierName,
      status,
      purchaseStatus,
      sellerProfileId,
      photos,
    };

    const validation = validateVehicleFormDetailed(formState, lang);
    if (validation.firstError) {
      setFieldErrors(validation.fieldErrors);
      setError(validation.firstError);
      if (validation.fieldErrors.vin) {
        setIsExtendedOpen(true);
      }
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
      const payload = buildVehicleSubmitPayload(
        formState,
        userId,
        initialVehicle || null,
        targetGarageId
      );
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
  const pageTitle = isEditMode
    ? L(
        'Modifier le véhicule',
        'Редактировать автомобиль',
        'Խմբագրել ավտոմեքենան',
        'ავტომობილის რედაქტირება'
      )
    : L(
        'Ajouter le véhicule',
        'Добавить автомобиль',
        'Ավելացնել ավտոմեքենա',
        'ავტომობილის დამატება'
      );
  const topSubmitLabel = isEditMode
    ? L('Enregistrer', 'Сохранить изменения', 'Պահպանել', 'შენახვა')
    : pageTitle;
  const bottomSubmitLabel = isEditMode
    ? L(
        'Enregistrer les modifications',
        'Сохранить изменения',
        'Պահպանել փոփոխությունները',
        'ცვლილებების შენახვა'
      )
    : L('Enregistrer l’achat', 'Сохранить покупку', 'Պահպանել գնումը', 'შესყიდვის შენახვა');
  const subtitleText = isEditMode
    ? [
        [initialVehicle?.make, initialVehicle?.model].filter(Boolean).join(' '),
        initialVehicle?.registrationNumber,
        L(
          'Mise à jour complète de la fiche véhicule et des champs Cerfa',
          'Полное редактирование данных автомобиля и полей Cerfa',
          'Ավտոմեքենայի և Cerfa դաշտերի ամբողջական խմբագրում',
          'ავტომობილისა და Cerfa ველების სრული რედაქტირება'
        ),
      ]
        .filter(Boolean)
        .join(' · ')
    : L(
        'Saisie rapide des données essentielles pour la mise en parc',
        'Быстрое заполнение основных данных для постановки в автопарк',
        'Հիմնական տվյալների արագ լրացում ավտոպարկում գրանցելու համար',
        'ავტოპარკში დასამატებელი ძირითადი მონაცემების სწრაფი შევსება'
      );

  const formattedPercent = `${marginPreview.grossMarginPercent > 0 ? '+' : ''}${marginPreview.grossMarginPercent.toFixed(1)}%`;
  const formattedMarginEuro = `${marginPreview.grossMarginEuro > 0 ? '+' : ''}${formatEuro(
    marginPreview.grossMarginEuro
  )}`;

  const existingExpenses = isEditMode ? Math.max(0, Number(initialVehicle?.totalExpenses) || 0) : 0;

  return (
    <div
      data-testid="add-vehicle-page"
      data-mode={isEditMode ? 'edit' : 'create'}
      className="max-w-6xl mx-auto space-y-5 pb-10"
    >
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
                {pageTitle}
              </h1>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 truncate">{subtitleText}</p>
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
                {isEditMode ? (
                  <Check className="w-4 h-4 stroke-[2.5]" />
                ) : (
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                )}
                <span>{topSubmitLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main 2-Column Form (8/4 grid) */}
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
          {/* Left Column (~65% width, 8/12): Identity + Purchase + Collapsible Extended Technical/Cerfa Card */}
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

                {/* 2-option pill toggle (Pro activity / Personal sale) */}
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
                    onClick={() => {
                      hasEditedPurchaseStatusRef.current = true;
                      setPurchaseStatus('micro');
                      setSellerProfileId(resolveDefaultSellerProfileId('micro', garageSettings));
                    }}
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
                    onClick={() => {
                      hasEditedPurchaseStatusRef.current = true;
                      setPurchaseStatus('particulier');
                      setSellerProfileId(
                        resolveDefaultSellerProfileId('particulier', garageSettings)
                      );
                    }}
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

              <div className="p-3.5 rounded-xl bg-[var(--background)]/65 border border-[var(--border)]">
                <SellerProfileSelector
                  compact
                  purchaseStatus={purchaseStatus}
                  selectedProfileId={sellerProfileId}
                  garageSettings={garageSettings}
                  userId={userId}
                  garageId={targetGarageId}
                  onSelectProfileId={setSellerProfileId}
                  onSettingsUpdated={setGarageSettings}
                  testIdPrefix="add-vehicle-seller-profile"
                />
              </div>

              {/* Row 1 (2 columns): Brand * / Model * */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="add-vehicle-make" className={labelClass}>
                    {L(
                      '(D.1) Marque *',
                      '(D.1) Марка *',
                      '(D.1) Մակնիշ *',
                      '(D.1) მარკა *'
                    )}
                  </label>
                  <input
                    id="add-vehicle-make"
                    data-testid="add-vehicle-make"
                    type="text"
                    required
                    autoFocus={!isEditMode}
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
                    {L(
                      'Modèle / (D.3) Dénomination *',
                      'Модель / (D.3) Коммерч. назв. *',
                      'Մոդել / (D.3) Առևտր. անվանում *',
                      'მოდელი / (D.3) კომერც. დასახელება *'
                    )}
                  </label>
                  <input
                    id="add-vehicle-model"
                    data-testid="add-vehicle-model"
                    type="text"
                    required
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setFieldErrors((prev) => ({
                        ...prev,
                        model: undefined,
                        commercialDesignation: undefined,
                      }));
                    }}
                    placeholder={L(
                      'ex. 3008 GT Line, Clio TCe 90...',
                      'напр. 3008 GT Line, Clio TCe 90...',
                      'օր.՝ 3008 GT Line, Clio TCe 90...',
                      'მაგ. 3008 GT Line, Clio TCe 90...'
                    )}
                    className={getInputClass(
                      Boolean(fieldErrors.model || fieldErrors.commercialDesignation)
                    )}
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
                    {L(
                      '(A) Immatriculation *',
                      '(A) Госномер *',
                      '(A) Պետհամարանիշ *',
                      '(A) სახ. ნომერი *'
                    )}
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

            {/* Card 2 (Collapsible): Extended Technical, Carte Grise & Cerfa Details */}
            <section
              data-testid="add-vehicle-card-extended"
              className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-sm overflow-hidden"
            >
              <button
                type="button"
                data-testid="add-vehicle-extra-toggle"
                aria-expanded={isExtendedOpen}
                aria-controls="add-vehicle-extra-section"
                onClick={() => setIsExtendedOpen((prev) => !prev)}
                className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 text-left hover:bg-[var(--surface-muted)]/40 transition cursor-pointer"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <span className="text-sm font-bold text-[var(--foreground)] truncate">
                    {isExtendedOpen ? t('extraCerfaToggleHide') : t('extraCerfaToggle')}
                  </span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--muted-foreground)] shrink-0 transition-transform duration-200 ${
                    isExtendedOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isExtendedOpen && (
                <div
                  id="add-vehicle-extra-section"
                  data-testid="add-vehicle-extra-section"
                  className="px-5 sm:px-6 pb-6 pt-4 border-t border-[var(--border)] space-y-5"
                >
                  {/* Technical: VIN, (B) First Reg, (J.1) Genre, Fuel, Gearbox */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor="add-vehicle-vin"
                          className="text-xs font-semibold text-[var(--secondary-foreground)]"
                        >
                          VIN (E)
                        </label>
                        <span
                          className={`text-[10px] font-mono ${
                            vin.replace(/\s+/g, '').length === 17
                              ? 'text-emerald-400'
                              : 'text-[var(--muted-foreground)]'
                          }`}
                        >
                          {vin.replace(/\s+/g, '').length}/17
                        </span>
                      </div>
                      <input
                        id="add-vehicle-vin"
                        data-testid="add-vehicle-vin"
                        type="text"
                        maxLength={17}
                        value={vin}
                        onChange={(e) => {
                          setVin(e.target.value.replace(/\s+/g, '').toUpperCase());
                          setFieldErrors((prev) => ({ ...prev, vin: undefined }));
                        }}
                        placeholder="ex. VF3UPHNK0MT129841"
                        className={getInputClass(
                          Boolean(fieldErrors.vin),
                          'font-mono uppercase placeholder:normal-case'
                        )}
                      />
                    </div>

                    <div>
                      <label htmlFor="add-vehicle-first-reg" className={labelClass}>
                        {L(
                          '(B) 1re immatriculation',
                          '(B) Дата 1-й регистрации',
                          '(B) Առաջին գրանցման ամսաթիվ',
                          '(B) პირველი რეგისტრაცია'
                        )}
                      </label>
                      <LocaleDateInput
                        id="add-vehicle-first-reg"
                        testId="add-vehicle-first-reg-date"
                        ariaLabel={L(
                          '(B) 1re immatriculation',
                          '(B) Дата 1-й регистрации',
                          '(B) Առաջին գրանցման ամսաթիվ',
                          '(B) პირველი რეგისტრაცია'
                        )}
                        value={firstRegistrationDate}
                        onChange={handleFirstRegDateChange}
                        className={getInputClass(Boolean(fieldErrors.firstRegistrationDate))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="add-vehicle-j1" className={labelClass}>
                        {t('j1GenreLabel')}
                      </label>
                      <ThemedSelect
                        id="add-vehicle-j1"
                        testId="add-vehicle-j1-select"
                        ariaLabel={t('j1GenreLabel')}
                        value={nationalGenre}
                        onChange={setNationalGenre}
                        options={[
                          {
                            value: 'VP',
                            label: L(
                              'VP (Voiture particulière)',
                              'VP (Легковой авто)',
                              'VP (Մարդատար)',
                              'VP (მსუბუქი)'
                            ),
                          },
                          {
                            value: 'CTTE',
                            label: L(
                              'CTTE (Camionnette)',
                              'CTTE (Фургон / LCV)',
                              'CTTE (Ֆուրգոն)',
                              'CTTE (ფურგონი)'
                            ),
                          },
                          {
                            value: 'MTT1',
                            label: L(
                              'MTT1 / MTT2 (Moto)',
                              'MTT1 / MTT2 (Мотоцикл)',
                              'MTT1 / MTT2 (Մոտոցիկլ)',
                              'MTT1 / MTT2 (მოტო)'
                            ),
                          },
                          {
                            value: 'CAM',
                            label: L('CAM (Camion)', 'CAM (Грузовик)', 'CAM (Բեռնատար)', 'CAM (სატვირთო)'),
                          },
                          {
                            value: 'VASP',
                            label: L(
                              'VASP (Véhicule spécialisé)',
                              'VASP (Спецтехника)',
                              'VASP (Հատուկ տեխնիկա)',
                              'VASP (სპეცტექნიკა)'
                            ),
                          },
                        ]}
                        triggerClassName={inputClass}
                      />
                    </div>

                    <div>
                      <label htmlFor="add-vehicle-fuel" className={labelClass}>
                        {t('fuelTypeLabel')}
                      </label>
                      <ThemedSelect
                        id="add-vehicle-fuel"
                        testId="add-vehicle-fuel-select"
                        ariaLabel={t('fuelTypeLabel')}
                        value={fuelType}
                        onChange={setFuelType}
                        options={[
                          {
                            value: '',
                            label: L('Non précisé', 'Не указано', 'Նշված չէ', 'მითითებული არ არის'),
                          },
                          {
                            value: 'Essence',
                            label: L('Essence', 'Бензин (Essence)', 'Բենզին (Essence)', 'ბენზინი (Essence)'),
                          },
                          {
                            value: 'Diesel',
                            label: L('Diesel', 'Дизель (Diesel)', 'Դիզել (Diesel)', 'დიზელი (Diesel)'),
                          },
                          {
                            value: 'Hybride',
                            label: L('Hybride', 'Гибрид (Hybride)', 'Հիբրիդ (Hybride)', 'ჰიბრიდი (Hybride)'),
                          },
                          {
                            value: 'Électrique',
                            label: L('Électrique', 'Электро (Électrique)', 'Էլեկտրական (Électrique)', 'ელექტრო (Électrique)'),
                          },
                          {
                            value: 'GPL',
                            label: L('GPL', 'Газ (GPL)', 'Գազ (GPL)', 'გაზი (GPL)'),
                          },
                        ]}
                        triggerClassName={inputClass}
                      />
                    </div>

                    <div>
                      <label htmlFor="add-vehicle-gearbox" className={labelClass}>
                        {t('gearboxLabel')}
                      </label>
                      <ThemedSelect
                        id="add-vehicle-gearbox"
                        testId="add-vehicle-gearbox-select"
                        ariaLabel={t('gearboxLabel')}
                        value={gearbox}
                        onChange={setGearbox}
                        options={[
                          {
                            value: '',
                            label: L('Non précisé', 'Не указано', 'Նշված չէ', 'მითითებული არ არის'),
                          },
                          {
                            value: 'Manuelle',
                            label: L('Manuelle', 'Механика (Manuelle)', 'Մեխանիկական (Manuelle)', 'მექანიკა (Manuelle)'),
                          },
                          {
                            value: 'Automatique',
                            label: L('Automatique', 'Автомат (Automatique)', 'Ավտոմատ (Automatique)', 'ავტომატიკა (Automatique)'),
                          },
                          {
                            value: 'Séquentielle',
                            label: L('Séquentielle / BVA', 'Робот / Вариатор', 'Ռոբոտ / Վարիատոր', 'რობოტი / ვარიატორი'),
                          },
                        ]}
                        triggerClassName={inputClass}
                      />
                    </div>
                  </div>

                  {/* Carte Grise Presence (OUI / NON) */}
                  <div
                    data-testid="add-vehicle-cert-presence-block"
                    className={`rounded-2xl border p-4 space-y-3 bg-[var(--background)]/65 transition ${
                      fieldErrors.hasRegistrationCertificate
                        ? 'border-red-500 ring-2 ring-red-500/20'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--foreground)]">
                        {L(
                          "Présence du certificat d'immatriculation",
                          'Наличие СТС / Carte Grise',
                          'Գրանցման վկայականի առկայություն',
                          'სარეგისტრაციო მოწმობის არსებობა'
                        )}
                      </span>
                      <div
                        role="radiogroup"
                        aria-label={L(
                          "Présence du certificat d'immatriculation",
                          'Наличие СТС / Carte Grise',
                          'Գրանցման վկայականի առկայություն',
                          'სარეგისტრაციო მოწმობის არსებობა'
                        )}
                        className="flex items-center gap-2"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={hasRegistrationCertificate === true}
                          data-testid="add-vehicle-cert-yes"
                          onClick={() => {
                            setHasRegistrationCertificate(true);
                            setFieldErrors((prev) => ({
                              ...prev,
                              hasRegistrationCertificate: undefined,
                              absenceReason: undefined,
                            }));
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            hasRegistrationCertificate === true
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                              : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {L('Oui', 'Да', 'Այո', 'დიახ')}
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={hasRegistrationCertificate === false}
                          data-testid="add-vehicle-cert-no"
                          onClick={() => {
                            setHasRegistrationCertificate(false);
                            setFieldErrors((prev) => ({
                              ...prev,
                              hasRegistrationCertificate: undefined,
                              formulaOrCertificateDate: undefined,
                            }));
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            hasRegistrationCertificate === false
                              ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                              : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {L('Non', 'Нет', 'Ոչ', 'არა')}
                        </button>
                      </div>
                    </div>

                    {hasRegistrationCertificate === true && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label htmlFor="add-vehicle-formula" className={labelClass}>
                            {t('formulaNumberLabel')} (2019...)
                          </label>
                          <input
                            id="add-vehicle-formula"
                            data-testid="add-vehicle-formula-number"
                            type="text"
                            value={formulaNumber}
                            onChange={(e) => {
                              setFormulaNumber(e.target.value.toUpperCase());
                              setFieldErrors((prev) => ({
                                ...prev,
                                formulaOrCertificateDate: undefined,
                              }));
                            }}
                            placeholder="ex. 2019AB12345"
                            className={getInputClass(
                              Boolean(fieldErrors.formulaOrCertificateDate),
                              'font-mono uppercase placeholder:normal-case'
                            )}
                          />
                        </div>
                        <div>
                          <label htmlFor="add-vehicle-cert-date" className={labelClass}>
                            {t('certificateDateLabel')}
                          </label>
                          <LocaleDateInput
                            id="add-vehicle-cert-date"
                            testId="add-vehicle-cert-date"
                            ariaLabel={t('certificateDateLabel')}
                            value={certificateDate}
                            onChange={(val) => {
                              setCertificateDate(val);
                              setFieldErrors((prev) => ({
                                ...prev,
                                formulaOrCertificateDate: undefined,
                              }));
                            }}
                            className={getInputClass(Boolean(fieldErrors.formulaOrCertificateDate))}
                          />
                        </div>
                      </div>
                    )}

                    {hasRegistrationCertificate === false && (
                      <div className="pt-1">
                        <label htmlFor="add-vehicle-absence-reason" className={labelClass}>
                          {L(
                            "Motif d'absence du certificat",
                            'Причина отсутствия СТС',
                            'Վկայականի բացակայության պատճառը',
                            'მოწმობის არარსებობის მიზეზი'
                          )}
                        </label>
                        <input
                          id="add-vehicle-absence-reason"
                          data-testid="add-vehicle-absence-reason"
                          type="text"
                          value={absenceReason}
                          onChange={(e) => {
                            setAbsenceReason(e.target.value);
                            setFieldErrors((prev) => ({ ...prev, absenceReason: undefined }));
                          }}
                          placeholder="ex. Déclaration de perte / vol..."
                          className={getInputClass(Boolean(fieldErrors.absenceReason))}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Card 3: Purchase & Supplier */}
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

              {/* Row 2: Supplier / Source (+ optional custom input when custom selected) */}
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
            </section>
          </div>

          {/* Right Column (~35% width, 4/12): Photos + Margin Estimate */}
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

                {existingExpenses > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted-foreground)]">
                      {L(
                        'Frais & réparations',
                        'Расходы и ремонт',
                        'Ծախսեր և վերանորոգում',
                        'ხარჯები და რემონტი'
                      )}
                    </span>
                    <span className="font-mono font-semibold text-[var(--foreground)] tabular-nums">
                      {formatEuro(existingExpenses)}
                    </span>
                  </div>
                )}

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
                <span>{bottomSubmitLabel}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
