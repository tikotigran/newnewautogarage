import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Car,
  Upload,
  Check,
  AlertCircle,
  ChevronDown,
  FileText,
} from 'lucide-react';
import { GarageSettings, Vehicle, VehiclePurchaseStatus, VehicleStatus } from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { ThemedSelect } from './ThemedSelect';
import { LocaleDateInput } from './LocaleDateInput';
import { SellerProfileSelector } from './SellerProfileSelector';
import { fetchGarageSettingsFromCloud, getGarageSettings } from '../services/garageService';
import {
  buildVehicleSubmitPayload,
  resolveDefaultPurchaseStatus,
  resolveDefaultSellerProfileId,
  resolveTargetGarageId,
  resolveVehiclePurchaseStatus,
  resolveVehicleSellerProfileId,
  validateVehicleFormDetailed,
  VehicleFormFieldErrorKey,
} from '../utils/vehicleFormUtils';

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  initialVehicle?: Vehicle | null;
  userId: string;
  activeGarageId?: string | null;
  defaultPurchaseStatus?: VehiclePurchaseStatus;
  onValidationToast?: (message: string) => void;
}

export const VehicleModal: React.FC<VehicleModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialVehicle,
  userId,
  activeGarageId,
  defaultPurchaseStatus,
  onValidationToast,
}) => {
  const { t, lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });
  const targetGarageId = resolveTargetGarageId(initialVehicle, activeGarageId);
  const hasEditedPurchaseStatusRef = useRef(false);

  // Primary & Mandatory Cerfa Vehicle Fields
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [commercialDesignation, setCommercialDesignation] = useState('');
  const [firstRegistrationDate, setFirstRegistrationDate] = useState('');
  const [year, setYear] = useState<number | ''>(2021);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [hasRegistrationCertificate, setHasRegistrationCertificate] = useState<boolean | null>(null);
  const [absenceReason, setAbsenceReason] = useState('');

  // Collapsible Secondary & Carte Grise Fields
  const [isExtendedOpen, setIsExtendedOpen] = useState(false);
  const [trim, setTrim] = useState('');
  const [mileage, setMileage] = useState<number | ''>('');
  const [vin, setVin] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [gearbox, setGearbox] = useState('');
  const [typeVariantVersion, setTypeVariantVersion] = useState('');
  const [nationalGenre, setNationalGenre] = useState('VP');
  const [bodyType, setBodyType] = useState('');
  const [formulaNumber, setFormulaNumber] = useState('');
  const [certificateDate, setCertificateDate] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetSalePrice, setTargetSalePrice] = useState<number | ''>('');
  const [status, setStatus] = useState<VehicleStatus>('preparation');
  const [garageSettings, setGarageSettings] = useState<GarageSettings>(() =>
    getGarageSettings(targetGarageId)
  );
  const [purchaseStatus, setPurchaseStatus] = useState<VehiclePurchaseStatus>(
    () =>
      defaultPurchaseStatus ||
      resolveDefaultPurchaseStatus(undefined, getGarageSettings(targetGarageId))
  );
  const [sellerProfileId, setSellerProfileId] = useState<string | undefined>(() =>
    resolveVehicleSellerProfileId(
      initialVehicle,
      defaultPurchaseStatus || resolveDefaultPurchaseStatus(undefined, getGarageSettings(targetGarageId)),
      getGarageSettings(targetGarageId)
    )
  );
  const [photos, setPhotos] = useState<string[]>([]);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<VehicleFormFieldErrorKey, string>>>({});

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
      setModel(initialVehicle.model);
      setCommercialDesignation(initialVehicle.commercialDesignation || '');
      setFirstRegistrationDate(initialVehicle.firstRegistrationDate || '');
      setYear(initialVehicle.year);
      setRegistrationNumber(initialVehicle.registrationNumber || '');
      setPurchasePrice(initialVehicle.purchasePrice);
      setHasRegistrationCertificate(
        typeof initialVehicle.hasRegistrationCertificate === 'boolean'
          ? initialVehicle.hasRegistrationCertificate
          : null
      );
      setAbsenceReason(initialVehicle.absenceReason || '');

      setIsExtendedOpen(true);
      setTrim(initialVehicle.trim || '');
      setMileage(initialVehicle.mileage > 0 ? initialVehicle.mileage : '');
      setVin(initialVehicle.vin || '');
      setFuelType(initialVehicle.fuelType || '');
      setGearbox(initialVehicle.gearbox || '');
      setTypeVariantVersion(initialVehicle.typeVariantVersion || '');
      setNationalGenre(initialVehicle.nationalGenre || 'VP');
      setBodyType(initialVehicle.bodyType || '');
      setFormulaNumber(initialVehicle.formulaNumber || '');
      setCertificateDate(initialVehicle.certificateDate || '');
      setPurchaseDate(initialVehicle.purchaseDate || new Date().toISOString().split('T')[0]);
      setTargetSalePrice(initialVehicle.targetSalePrice > 0 ? initialVehicle.targetSalePrice : '');
      setStatus(initialVehicle.status);
      const resolvedInitialStatus = resolveVehiclePurchaseStatus(
        initialVehicle,
        initialVehicle.garageId
          ? scopedFallbackProfile
          : defaultPurchaseStatus === 'particulier'
          ? 'particulier'
          : scopedFallbackProfile
      );
      setPurchaseStatus(resolvedInitialStatus);
      setSellerProfileId(
        resolveVehicleSellerProfileId(initialVehicle, resolvedInitialStatus, scopedSettings)
      );
      setPhotos(initialVehicle.photos || []);
    } else {
      setMake('');
      setModel('');
      setCommercialDesignation('');
      setFirstRegistrationDate('');
      setYear(2021);
      setRegistrationNumber('');
      setPurchasePrice('');
      setHasRegistrationCertificate(null);
      setAbsenceReason('');

      setIsExtendedOpen(false);
      setTrim('');
      setMileage('');
      setVin('');
      setFuelType('');
      setGearbox('');
      setTypeVariantVersion('');
      setNationalGenre('VP');
      setBodyType('');
      setFormulaNumber('');
      setCertificateDate('');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setTargetSalePrice('');
      setStatus('preparation');
      const nextDefaultStatus =
        defaultPurchaseStatus || resolveDefaultPurchaseStatus(undefined, scopedSettings);
      setPurchaseStatus(nextDefaultStatus);
      setSellerProfileId(resolveDefaultSellerProfileId(nextDefaultStatus, scopedSettings));
      setPhotos([]);
    }
    setError(null);
    setFieldErrors({});
  }, [initialVehicle, isOpen, defaultPurchaseStatus, targetGarageId]);

  useEffect(() => {
    const syncLocal = () => setGarageSettings(getGarageSettings(targetGarageId));
    window.addEventListener('autogarage_settings_updated', syncLocal);
    if (!isOpen || !userId || !targetGarageId) {
      return () => {
        window.removeEventListener('autogarage_settings_updated', syncLocal);
      };
    }
    let isCancelled = false;
    fetchGarageSettingsFromCloud(userId, targetGarageId).then((cloudSettings) => {
      if (isCancelled) return;
      setGarageSettings(cloudSettings);
      if (hasEditedPurchaseStatusRef.current) return;
      if (!initialVehicle && !defaultPurchaseStatus) {
        const nextStatus = resolveDefaultPurchaseStatus(undefined, cloudSettings);
        setPurchaseStatus(nextStatus);
        setSellerProfileId(resolveDefaultSellerProfileId(nextStatus, cloudSettings));
      }
    });
    return () => {
      isCancelled = true;
      window.removeEventListener('autogarage_settings_updated', syncLocal);
    };
  }, [isOpen, userId, targetGarageId, initialVehicle, defaultPurchaseStatus]);

  if (!isOpen) return null;

  const processPhotoFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhotos((prev) => [reader.result as string, ...prev]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processPhotoFiles(e.target.files);
    e.target.value = '';
  };

  const handlePhotoDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingPhoto) setIsDraggingPhoto(true);
  };

  const handlePhotoDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPhoto(false);
  };

  const handlePhotoDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPhoto(false);
    processPhotoFiles(e.dataTransfer.files);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formState = {
      make,
      model,
      commercialDesignation,
      firstRegistrationDate,
      trim,
      year,
      registrationNumber,
      purchasePrice,
      vin,
      mileage,
      fuelType,
      gearbox,
      typeVariantVersion,
      nationalGenre,
      bodyType,
      hasRegistrationCertificate,
      formulaNumber,
      certificateDate,
      absenceReason,
      purchaseDate,
      targetSalePrice,
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

    try {
      setIsSubmitting(true);
      setError(null);
      setFieldErrors({});
      const payload = buildVehicleSubmitPayload(
        formState,
        userId,
        initialVehicle,
        activeGarageId
      );
      await onSubmit(payload);
      onClose();
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
    'w-full px-3.5 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition';
  const inputErrorClass =
    'w-full px-3.5 py-2.5 bg-[var(--background)] border border-red-500 ring-2 ring-red-500/20 rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-red-500 transition';
  const getInputClass = (hasErr: boolean, extra = '') =>
    `${hasErr ? inputErrorClass : inputClass}${extra ? ` ${extra}` : ''}`;
  const labelClass = 'block text-xs font-semibold text-[var(--secondary-foreground)] mb-1.5';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-modal-title"
    >
      <div className="bg-[var(--ag-modal-bg)] border border-[var(--border)] rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[var(--primary)] flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 id="vehicle-modal-title" className="text-lg font-bold text-[var(--foreground)]">
                {initialVehicle ? t('editVehicleModalTitle') : t('addVehicleModalTitle')}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('vehicleModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeBtn')}
            className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-xl hover:bg-[var(--surface-muted)] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto">
          {error && (
            <div
              role="alert"
              data-testid="vehicle-modal-validation-error"
              className="p-3 bg-red-500/10 border border-red-500/40 rounded-xl text-xs text-red-400 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Purchase Status / Owner Selector (binds automatically to Cerfa 15776*02 Step 2 Seller) */}
          <div
            data-testid="vehicle-purchase-status-section"
            className="bg-[var(--background)]/75 border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                id="vehicle-purchase-status-label"
                className="text-xs font-bold text-[var(--foreground)]"
              >
                {t('purchaseStatusLabel')}
              </span>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {t('purchaseStatusHint')}
              </span>
            </div>
            <div
              role="radiogroup"
              aria-labelledby="vehicle-purchase-status-label"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={purchaseStatus === 'micro'}
                data-testid="vehicle-purchase-status-micro"
                onClick={() => {
                  hasEditedPurchaseStatusRef.current = true;
                  setPurchaseStatus('micro');
                  setSellerProfileId(resolveDefaultSellerProfileId('micro', garageSettings));
                }}
                className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left text-xs font-bold transition cursor-pointer ${
                  purchaseStatus === 'micro'
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-sm'
                    : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="truncate">{t('purchaseStatusMicroOption')}</span>
                {purchaseStatus === 'micro' && (
                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={purchaseStatus === 'particulier'}
                data-testid="vehicle-purchase-status-particulier"
                onClick={() => {
                  hasEditedPurchaseStatusRef.current = true;
                  setPurchaseStatus('particulier');
                  setSellerProfileId(resolveDefaultSellerProfileId('particulier', garageSettings));
                }}
                className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left text-xs font-bold transition cursor-pointer ${
                  purchaseStatus === 'particulier'
                    ? 'bg-blue-500/15 border-blue-500/60 text-blue-300 shadow-sm'
                    : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="truncate">{t('purchaseStatusParticulierOption')}</span>
                {purchaseStatus === 'particulier' && (
                  <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                )}
              </button>
            </div>

            <div className="pt-2 border-t border-[var(--border)]/70">
              <SellerProfileSelector
                compact
                purchaseStatus={purchaseStatus}
                selectedProfileId={sellerProfileId}
                garageSettings={garageSettings}
                userId={userId}
                garageId={targetGarageId}
                onSelectProfileId={setSellerProfileId}
                onSettingsUpdated={setGarageSettings}
                testIdPrefix="vehicle-modal-seller-profile"
              />
            </div>
          </div>

          {/* Primary Vehicle Fields */}
          <div
            data-testid="vehicle-modal-primary-fields"
            className="space-y-4 bg-[var(--surface-muted)]/35 border border-[var(--border)] rounded-2xl p-4 sm:p-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="vehicle-make" className={labelClass}>
                  {t('make')} *
                </label>
                <input
                  id="vehicle-make"
                  type="text"
                  required
                  autoFocus
                  value={make}
                  onChange={(e) => {
                    setMake(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, make: undefined }));
                  }}
                  placeholder="ex. Peugeot, Renault..."
                  className={getInputClass(Boolean(fieldErrors.make))}
                />
              </div>

              <div>
                <label htmlFor="vehicle-model" className={labelClass}>
                  {t('model')} *
                </label>
                <input
                  id="vehicle-model"
                  type="text"
                  required
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, model: undefined }));
                  }}
                  placeholder="ex. 208, Clio V, Golf..."
                  className={getInputClass(Boolean(fieldErrors.model))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="vehicle-year" className={labelClass}>
                  {t('year')} *
                </label>
                <input
                  id="vehicle-year"
                  type="number"
                  required
                  min={1900}
                  max={2100}
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value === '' ? '' : Number(e.target.value));
                    setFieldErrors((prev) => ({ ...prev, year: undefined }));
                  }}
                  className={getInputClass(Boolean(fieldErrors.year))}
                />
              </div>

              <div>
                <label htmlFor="vehicle-reg" className={labelClass}>
                  {t('thPlate')} *
                </label>
                <input
                  id="vehicle-reg"
                  type="text"
                  required
                  value={registrationNumber}
                  onChange={(e) => {
                    setRegistrationNumber(e.target.value.toUpperCase());
                    setFieldErrors((prev) => ({ ...prev, registrationNumber: undefined }));
                  }}
                  placeholder="ex. AB-123-CD"
                  className={getInputClass(
                    Boolean(fieldErrors.registrationNumber),
                    'font-mono uppercase placeholder:normal-case'
                  )}
                />
              </div>

              <div>
                <label htmlFor="vehicle-purchase-price" className={labelClass}>
                  {t('purchasePriceLabel')} (€) *
                </label>
                <input
                  id="vehicle-purchase-price"
                  type="number"
                  required
                  min={0}
                  step="any"
                  value={purchasePrice}
                  onChange={(e) => {
                    setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value));
                    setFieldErrors((prev) => ({ ...prev, purchasePrice: undefined }));
                  }}
                  placeholder="ex. 8500"
                  className={getInputClass(Boolean(fieldErrors.purchasePrice), 'font-bold')}
                />
              </div>
            </div>

            {/* Mileage, Fuel & Gearbox */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="vehicle-mileage" className={labelClass}>
                  {t('mileage')} (km)
                </label>
                <input
                  id="vehicle-mileage"
                  type="number"
                  min={0}
                  value={mileage}
                  onChange={(e) => {
                    setMileage(e.target.value === '' ? '' : Number(e.target.value));
                    setFieldErrors((prev) => ({ ...prev, mileage: undefined }));
                  }}
                  placeholder="ex. 65000"
                  className={getInputClass(Boolean(fieldErrors.mileage))}
                />
              </div>

              <div>
                <label htmlFor="vehicle-fuel" className={labelClass}>
                  {t('fuelTypeLabel')}
                </label>
                <ThemedSelect
                  id="vehicle-fuel"
                  testId="vehicle-fuel-select"
                  ariaLabel={t('fuelTypeLabel')}
                  value={fuelType}
                  onChange={setFuelType}
                  options={[
                    { value: '', label: L('Non précisé', 'Не указано', 'Նշված չէ', 'მითითებული არ არის') },
                    { value: 'Essence', label: L('Essence', 'Бензин (Essence)', 'Բենզին (Essence)', 'ბენზინი (Essence)') },
                    { value: 'Diesel', label: L('Diesel', 'Дизель (Diesel)', 'Դիզել (Diesel)', 'დიზელი (Diesel)') },
                    { value: 'Hybride', label: L('Hybride', 'Гибрид (Hybride)', 'Հիբրիդ (Hybride)', 'ჰიბრიდი (Hybride)') },
                    { value: 'Électrique', label: L('Électrique', 'Электро (Électrique)', 'Էլեկտրական (Électrique)', 'ელექტრო (Électrique)') },
                    { value: 'GPL', label: L('GPL', 'Газ (GPL)', 'Գազ (GPL)', 'გაზი (GPL)') },
                  ]}
                  triggerClassName={inputClass}
                />
              </div>

              <div>
                <label htmlFor="vehicle-gearbox" className={labelClass}>
                  {t('gearboxLabel')}
                </label>
                <ThemedSelect
                  id="vehicle-gearbox"
                  testId="vehicle-gearbox-select"
                  ariaLabel={t('gearboxLabel')}
                  value={gearbox}
                  onChange={setGearbox}
                  options={[
                    { value: '', label: L('Non précisé', 'Не указано', 'Նշված չէ', 'მითითებული არ არის') },
                    { value: 'Manuelle', label: L('Manuelle', 'Механика (Manuelle)', 'Մեխանիկական (Manuelle)', 'მექანიკა (Manuelle)') },
                    { value: 'Automatique', label: L('Automatique', 'Автомат (Automatique)', 'Ավտոմատ (Automatique)', 'ავტომატიკა (Automatique)') },
                    { value: 'Séquentielle', label: L('Séquentielle / BVA', 'Робот / Вариатор', 'Ռոբոտ / Վարիատոր', 'რობოტი / ვარიატორი') },
                  ]}
                  triggerClassName={inputClass}
                />
              </div>
            </div>

            {/* Required Initial Status */}
            <div>
              <label className={labelClass}>{t('taskStatusLabel')} *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  data-testid="vehicle-status-preparation"
                  onClick={() => setStatus('preparation')}
                  className={`p-2.5 rounded-xl text-xs font-bold border text-center transition cursor-pointer ${
                    status === 'preparation'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                      : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  🛠️ {t('statusPreparation')}
                </button>
                <button
                  type="button"
                  data-testid="vehicle-status-repair"
                  onClick={() => setStatus('repair')}
                  className={`p-2.5 rounded-xl text-xs font-bold border text-center transition cursor-pointer ${
                    status === 'repair'
                      ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                      : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  🔧 {t('statusRepair')}
                </button>
                <button
                  type="button"
                  data-testid="vehicle-status-for_sale"
                  onClick={() => setStatus('for_sale')}
                  className={`p-2.5 rounded-xl text-xs font-bold border text-center transition cursor-pointer ${
                    status === 'for_sale'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  🏷️ {t('statusForSale')}
                </button>
                <button
                  type="button"
                  data-testid="vehicle-status-sold"
                  onClick={() => setStatus('sold')}
                  className={`p-2.5 rounded-xl text-xs font-bold border text-center transition cursor-pointer ${
                    status === 'sold'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                      : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  ✅ {t('statusSold')}
                </button>
              </div>
            </div>

            {/* Optional Photos Upload (Drag-and-Drop / File Upload Box Only) */}
            <div data-testid="vehicle-photos-section" className="space-y-2">
              <label htmlFor="vehicle-photo-upload" className={labelClass}>
                {t('photosVehicleLabel')}
              </label>

              {photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map((url, index) => (
                    <div
                      key={index}
                      className="relative w-24 h-16 rounded-lg overflow-hidden shrink-0 border border-[var(--border)] group"
                    >
                      <img
                        src={url}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(index)}
                        aria-label={t('deleteBtn')}
                        className="absolute top-1 right-1 p-0.5 rounded-full bg-slate-900/80 text-red-400 hover:bg-red-500 hover:text-white transition opacity-90 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label
                htmlFor="vehicle-photo-upload"
                onDragOver={handlePhotoDragOver}
                onDragLeave={handlePhotoDragLeave}
                onDrop={handlePhotoDrop}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-4 text-center cursor-pointer transition ${
                  isDraggingPhoto
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] bg-[var(--background)]/60 hover:border-[var(--primary)]/60 hover:bg-[var(--background)]'
                }`}
              >
                <Upload className="w-4 h-4 text-[var(--primary)]" />
                <span className="text-xs font-semibold text-[var(--foreground)]">
                  {t('uploadFromDevice')}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  PNG, JPG, WEBP
                </span>
                <input
                  id="vehicle-photo-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Collapsible Accordion Toggle for Administrative & Carte Grise Details */}
          <div>
            <button
              type="button"
              data-testid="vehicle-modal-extra-toggle"
              aria-expanded={isExtendedOpen}
              aria-controls="vehicle-modal-extra-section"
              onClick={() => setIsExtendedOpen((prev) => !prev)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--ag-button-radius)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/50 hover:bg-[var(--surface-muted)] text-xs sm:text-sm font-bold text-[var(--foreground)] transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--primary)] shrink-0" />
                <span>{isExtendedOpen ? t('extraCerfaToggleHide') : t('extraCerfaToggle')}</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 ${
                  isExtendedOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isExtendedOpen && (
              <div
                id="vehicle-modal-extra-section"
                data-testid="vehicle-modal-extra-section"
                className="mt-4 space-y-5 p-4 sm:p-5 rounded-2xl border border-[var(--border)] bg-[var(--background)]/45"
              >
                {/* Moved Cerfa 15776*02 Registration Fields (optional at lot creation, required when generating Cerfa) */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="vehicle-first-reg" className={labelClass}>
                        (B) 1re immatriculation
                      </label>
                      <LocaleDateInput
                        id="vehicle-first-reg"
                        testId="vehicle-first-reg-date"
                        ariaLabel="(B) 1re immatriculation"
                        value={firstRegistrationDate}
                        onChange={handleFirstRegDateChange}
                        className={getInputClass(Boolean(fieldErrors.firstRegistrationDate))}
                      />
                    </div>

                    <div>
                      <label htmlFor="vehicle-d3-commercial" className={labelClass}>
                        (D.3) Dénomination commerciale
                      </label>
                      <input
                        id="vehicle-d3-commercial"
                        data-testid="vehicle-d3-commercial"
                        type="text"
                        value={commercialDesignation}
                        onChange={(e) => {
                          setCommercialDesignation(e.target.value);
                          setFieldErrors((prev) => ({
                            ...prev,
                            commercialDesignation: undefined,
                          }));
                        }}
                        placeholder="ex. 208 GT Line, Clio TCe 90..."
                        className={getInputClass(Boolean(fieldErrors.commercialDesignation))}
                      />
                    </div>
                  </div>

                  {/* Cerfa Carte Grise Presence & Formula / Certificate Date */}
                  <div
                    data-testid="vehicle-cert-presence-block"
                    className={`rounded-2xl border p-3.5 space-y-3 bg-[var(--background)]/65 transition ${
                      fieldErrors.hasRegistrationCertificate
                        ? 'border-red-500 ring-2 ring-red-500/20'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--foreground)]">
                        Présence du certificat d'immatriculation (OUI / NON)
                      </span>
                      <div
                        role="radiogroup"
                        aria-label="Présence du certificat d'immatriculation (OUI / NON)"
                        className="flex items-center gap-2"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={hasRegistrationCertificate === true}
                          data-testid="vehicle-cert-yes"
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
                          OUI
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={hasRegistrationCertificate === false}
                          data-testid="vehicle-cert-no"
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
                          NON
                        </button>
                      </div>
                    </div>

                    {hasRegistrationCertificate === true && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label htmlFor="vehicle-formula" className={labelClass}>
                            {t('formulaNumberLabel')} (2019...)
                          </label>
                          <input
                            id="vehicle-formula"
                            data-testid="vehicle-formula-number"
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
                          <label htmlFor="vehicle-cert-date" className={labelClass}>
                            {t('certificateDateLabel')} (ou ancien format)
                          </label>
                          <LocaleDateInput
                            id="vehicle-cert-date"
                            testId="vehicle-cert-date"
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
                        <label htmlFor="vehicle-absence-reason" className={labelClass}>
                          {L(
                            "Motif d'absence du certificat",
                            'Причина отсутствия СТС',
                            'Վկայականի բացակայության պատճառը',
                            'მოწმობის არარსებობის მიზეზი'
                          )}
                        </label>
                        <input
                          id="vehicle-absence-reason"
                          data-testid="vehicle-absence-reason"
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

                {/* Technical Details: VIN & Finition / Version */}
                <div className="pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="vehicle-vin"
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
                      id="vehicle-vin"
                      type="text"
                      maxLength={17}
                      value={vin}
                      onChange={(e) => setVin(e.target.value.replace(/\s+/g, '').toUpperCase())}
                      placeholder="ex. VF3UPHNK0MT129841"
                      className={getInputClass(
                        Boolean(fieldErrors.vin),
                        'font-mono uppercase placeholder:normal-case'
                      )}
                    />
                  </div>

                  <div>
                    <label htmlFor="vehicle-trim" className={labelClass}>
                      {t('trimVersion')}
                    </label>
                    <input
                      id="vehicle-trim"
                      type="text"
                      value={trim}
                      onChange={(e) => setTrim(e.target.value)}
                      placeholder="ex. GT Line 130ch"
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* French Carte Grise Codes (D.2, J.1, J.3) */}
                <div className="pt-3 border-t border-[var(--border)] space-y-3">
                  <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">
                    {t('carteGriseSectionTitle')}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                      <label htmlFor="vehicle-d2" className={labelClass}>
                        {t('d2TypeLabel')}
                      </label>
                      <input
                        id="vehicle-d2"
                        type="text"
                        value={typeVariantVersion}
                        onChange={(e) => setTypeVariantVersion(e.target.value)}
                        placeholder="ex. UPHNK-01"
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label htmlFor="vehicle-j1" className={labelClass}>
                        {t('j1GenreLabel')}
                      </label>
                      <ThemedSelect
                        id="vehicle-j1"
                        testId="vehicle-j1-select"
                        ariaLabel={t('j1GenreLabel')}
                        value={nationalGenre}
                        onChange={setNationalGenre}
                        options={[
                          { value: 'VP', label: 'VP (Voiture particulière)' },
                          { value: 'CTTE', label: 'CTTE (Camionnette)' },
                          { value: 'MTT1', label: 'MTT1 / MTT2 (Moto)' },
                          { value: 'CAM', label: 'CAM (Camion)' },
                          { value: 'VASP', label: 'VASP (Véhicule spécialisé)' },
                        ]}
                        triggerClassName={inputClass}
                      />
                    </div>

                    <div>
                      <label htmlFor="vehicle-j3" className={labelClass}>
                        {t('j3BodyLabel')}
                      </label>
                      <input
                        id="vehicle-j3"
                        type="text"
                        value={bodyType}
                        onChange={(e) => setBodyType(e.target.value.toUpperCase())}
                        placeholder="ex. CI, BREAK"
                        className={`${inputClass} uppercase placeholder:normal-case`}
                      />
                    </div>
                  </div>
                </div>

                {/* Acquisition Date & Target Price */}
                <div className="pt-3 border-t border-[var(--border)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="vehicle-purchase-date" className={labelClass}>
                        {t('purchaseDate')}
                      </label>
                      <LocaleDateInput
                        id="vehicle-purchase-date"
                        testId="vehicle-purchase-date"
                        ariaLabel={t('purchaseDate')}
                        value={purchaseDate}
                        onChange={setPurchaseDate}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="vehicle-target-price" className={labelClass}>
                        {t('targetSalePriceInput')}
                      </label>
                      <input
                        id="vehicle-target-price"
                        type="number"
                        min={0}
                        step="any"
                        value={targetSalePrice}
                        onChange={(e) =>
                          setTargetSalePrice(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="ex. 11900"
                        className={`${inputClass} font-bold`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          </div>

          {/* Footer Submit */}
          <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--background)]/50 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-xl transition cursor-pointer"
            >
              {t('cancelBtn')}
            </button>
            <button
              type="submit"
              data-testid="vehicle-modal-submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] hover:opacity-95 text-[var(--primary-foreground)] shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <span>{t('loading')}</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{initialVehicle ? t('updateVehicleBtn') : t('saveVehicleBtn')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
