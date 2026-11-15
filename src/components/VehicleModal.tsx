import React, { useState, useEffect } from 'react';
import {
  X,
  Car,
  Upload,
  Image as ImageIcon,
  Check,
  AlertCircle,
  ChevronDown,
  FileText,
  Sparkles,
} from 'lucide-react';
import { Vehicle, VehicleStatus } from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { VehiclePhotoPlaceholder } from './VehiclePhotoPlaceholder';
import { ThemedSelect } from './ThemedSelect';
import {
  buildVehicleSubmitPayload,
  validateQuickVehicleForm,
} from '../utils/vehicleFormUtils';

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  initialVehicle?: Vehicle | null;
  userId: string;
}

const SAMPLE_PHOTO_PRESETS = [
  { label: 'Citadine Moderne (Peugeot)', url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Berline Compacte (Golf)', url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Premium Sportback (Audi)', url: 'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Crossover / SUV (Renault)', url: 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Utilitaire / Van', url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80' },
];

export const VehicleModal: React.FC<VehicleModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialVehicle,
  userId,
}) => {
  const { t, lang } = useI18n();
  const isRu = lang === 'ru';

  // 5 Primary Required Fields
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>(2021);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');

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
  const [photos, setPhotos] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialVehicle) {
      setMake(initialVehicle.make);
      setModel(initialVehicle.model);
      setYear(initialVehicle.year);
      setRegistrationNumber(initialVehicle.registrationNumber || '');
      setPurchasePrice(initialVehicle.purchasePrice);

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
      setPhotos(initialVehicle.photos || []);
    } else {
      setMake('');
      setModel('');
      setYear(2021);
      setRegistrationNumber('');
      setPurchasePrice('');

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
      setPhotos([]);
    }
    setError(null);
  }, [initialVehicle, isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhotos((prev) => [reader.result as string, ...prev]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPresetPhoto = (url: string) => {
    if (!photos.includes(url)) {
      setPhotos((prev) => [...prev, url]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formState = {
      make,
      model,
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
      formulaNumber,
      certificateDate,
      purchaseDate,
      targetSalePrice,
      status,
      photos,
    };

    const validationError = validateQuickVehicleForm(formState, lang);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const payload = buildVehicleSubmitPayload(formState, userId, initialVehicle);
      await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : isRu
          ? 'Ошибка при сохранении автомобиля.'
          : 'Une erreur est survenue lors de l’enregistrement.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3.5 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition';
  const labelClass = 'block text-xs font-semibold text-[var(--secondary-foreground)] mb-1.5';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-modal-title"
    >
      <div className="bg-[var(--ag-modal-bg)] border border-[var(--border)] rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[var(--primary)] flex items-center justify-center">
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
            aria-label={isRu ? 'Закрыть окно' : 'Fermer la fenêtre'}
            className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-xl hover:bg-[var(--surface-muted)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-xl text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 5 Mandatory Quick-Entry Fields */}
          <div
            data-testid="vehicle-modal-primary-fields"
            className="space-y-4 bg-[var(--surface-muted)]/35 border border-[var(--border)] rounded-2xl p-4 sm:p-5"
          >
            <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--primary)]">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{t('quickEntryHint')}</span>
            </div>

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
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="ex. Peugeot, Renault..."
                  className={inputClass}
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
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="ex. 208, Clio V, Golf..."
                  className={inputClass}
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
                  onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="vehicle-reg" className={labelClass}>
                  {isRu ? 'Госномер *' : 'Immatriculation *'}
                </label>
                <input
                  id="vehicle-reg"
                  type="text"
                  required
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                  placeholder="ex. AB-123-CD"
                  className={`${inputClass} font-mono uppercase placeholder:normal-case`}
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
                  onChange={(e) =>
                    setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="ex. 8500"
                  className={`${inputClass} font-bold`}
                />
              </div>
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
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--ag-button-radius)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/50 hover:bg-[var(--surface-muted)] text-xs sm:text-sm font-bold text-[var(--foreground)] transition"
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
                {/* Technical Details: VIN, Mileage, Trim */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
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
                      className={`${inputClass} font-mono uppercase placeholder:normal-case`}
                    />
                  </div>

                  <div>
                    <label htmlFor="vehicle-mileage" className={labelClass}>
                      {t('mileage')} (km)
                    </label>
                    <input
                      id="vehicle-mileage"
                      type="number"
                      min={0}
                      value={mileage}
                      onChange={(e) =>
                        setMileage(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="ex. 65000"
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Specs: Trim, Fuel, Gearbox */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        { value: '', label: isRu ? 'Не указано' : 'Non précisé' },
                        { value: 'Essence', label: isRu ? 'Бензин (Essence)' : 'Essence' },
                        { value: 'Diesel', label: isRu ? 'Дизель (Diesel)' : 'Diesel' },
                        { value: 'Hybride', label: isRu ? 'Гибрид (Hybride)' : 'Hybride' },
                        { value: 'Électrique', label: isRu ? 'Электро (Électrique)' : 'Électrique' },
                        { value: 'GPL', label: isRu ? 'Газ (GPL)' : 'GPL' },
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
                        { value: '', label: isRu ? 'Не указано' : 'Non précisé' },
                        { value: 'Manuelle', label: isRu ? 'Механика (Manuelle)' : 'Manuelle' },
                        { value: 'Automatique', label: isRu ? 'Автомат (Automatique)' : 'Automatique' },
                        { value: 'Séquentielle', label: isRu ? 'Робот / Вариатор' : 'Séquentielle / BVA' },
                      ]}
                      triggerClassName={inputClass}
                    />
                  </div>
                </div>

                {/* French Carte Grise Codes (D.2, J.1, J.3, Formule, Date I) */}
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="vehicle-formula" className={labelClass}>
                        {t('formulaNumberLabel')}
                      </label>
                      <input
                        id="vehicle-formula"
                        type="text"
                        value={formulaNumber}
                        onChange={(e) => setFormulaNumber(e.target.value.toUpperCase())}
                        placeholder="ex. 2021AB12345"
                        className={`${inputClass} font-mono uppercase placeholder:normal-case`}
                      />
                    </div>

                    <div>
                      <label htmlFor="vehicle-cert-date" className={labelClass}>
                        {t('certificateDateLabel')}
                      </label>
                      <input
                        id="vehicle-cert-date"
                        type="date"
                        value={certificateDate}
                        onChange={(e) => setCertificateDate(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                {/* Acquisition Date, Target Price & Status */}
                <div className="pt-3 border-t border-[var(--border)] space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="vehicle-purchase-date" className={labelClass}>
                        {t('purchaseDate')}
                      </label>
                      <input
                        id="vehicle-purchase-date"
                        type="date"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
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

                  <div>
                    <label className={labelClass}>{t('taskStatusLabel')}</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setStatus('preparation')}
                        className={`p-2.5 rounded-xl text-xs font-bold border text-center transition ${
                          status === 'preparation'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                            : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        🛠️ {t('statusPreparation')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatus('repair')}
                        className={`p-2.5 rounded-xl text-xs font-bold border text-center transition ${
                          status === 'repair'
                            ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                            : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        🔧 {t('statusRepair')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatus('for_sale')}
                        className={`p-2.5 rounded-xl text-xs font-bold border text-center transition ${
                          status === 'for_sale'
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        🏷️ {t('statusForSale')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatus('sold')}
                        className={`p-2.5 rounded-xl text-xs font-bold border text-center transition ${
                          status === 'sold'
                            ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                            : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        ✅ {t('statusSold')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Photos Upload */}
                <div className="space-y-2 pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--secondary-foreground)] flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-[var(--primary)]" />
                      {t('photosVehicleLabel')}
                    </label>
                    <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:opacity-80">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t('uploadFromDevice')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pb-1">
                    <span className="text-[11px] text-[var(--muted-foreground)] self-center">
                      {t('quickPresetsPhotos')}
                    </span>
                    {SAMPLE_PHOTO_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAddPresetPhoto(p.url)}
                        className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-muted)] hover:opacity-80 text-[var(--secondary-foreground)] transition"
                      >
                        + {p.label}
                      </button>
                    ))}
                  </div>

                  {photos.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto py-2">
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
                            className="absolute top-1 right-1 p-0.5 rounded-full bg-slate-900/80 text-red-400 hover:bg-red-500 hover:text-white transition opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-28 rounded-2xl overflow-hidden border border-dashed border-[var(--border)]">
                      <VehiclePhotoPlaceholder variant="modal" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-[var(--border)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-xl transition"
            >
              {t('cancelBtn')}
            </button>
            <button
              type="submit"
              data-testid="vehicle-modal-submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] hover:opacity-95 text-[var(--primary-foreground)] shadow-md transition flex items-center gap-2"
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
