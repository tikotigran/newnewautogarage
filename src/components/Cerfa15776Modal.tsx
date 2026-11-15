import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Car,
  Building2,
  UserCheck,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Download,
  Printer,
  AlertCircle,
  FileCheck,
  Loader2,
  Save,
  Eye,
  FileText,
} from 'lucide-react';
import { Vehicle } from '../types/garage';
import { getGarageSettings, saveGarageSettings } from '../services/garageService';
import {
  CERFA_TEMPLATE_OPTIONS,
  Cerfa15776FormData,
  buildInitialCerfaData,
  buildVehicleCerfaPatch,
  formatFrenchDate,
  pickCerfaTargetVehicle,
  validateCerfaStep,
} from '../utils/cerfa15776';
import { Cerfa15776Config, cloneCerfaConfig } from '../utils/cerfaConfig';
import { generateCerfa15776FromFormData } from '../utils/pdfGenerator';
import { CerfaAlignerPanel } from './CerfaAlignerPanel';
import { ThemedSelect } from './ThemedSelect';
import { useI18n } from '../i18n/I18nContext';

interface Cerfa15776ModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
  vehicles?: Vehicle[];
  userId?: string;
  initialAlignerMode?: boolean;
  variant?: 'modal' | 'page';
  onSaveVehicleFields?: (
    vehicleId: string,
    patch: Partial<Pick<Vehicle, 'registrationNumber' | 'vin' | 'mileage'>>
  ) => Promise<void>;
}

export const Cerfa15776Modal: React.FC<Cerfa15776ModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  vehicles = [],
  userId,
  initialAlignerMode = false,
  variant = 'modal',
  onSaveVehicleFields,
}) => {
  const { lang } = useI18n();
  const isRu = lang === 'ru';
  const isPage = variant === 'page';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicle.id);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    () => getGarageSettings().defaultCerfaTemplate || 'cerfa_15776_02'
  );

  const availableVehicles = useMemo(() => {
    if (vehicles.length > 0) return vehicles;
    return [vehicle];
  }, [vehicles, vehicle]);

  const activePick = useMemo(
    () =>
      pickCerfaTargetVehicle({
        preferredVehicleId: isPage ? selectedVehicleId : vehicle.id,
        selectedVehicle: vehicle,
        vehicles: availableVehicles,
        userId,
      }),
    [isPage, selectedVehicleId, vehicle, availableVehicles, userId]
  );

  const [formData, setFormData] = useState<Cerfa15776FormData>(() =>
    buildInitialCerfaData(activePick.vehicle, getGarageSettings())
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedSuccess, setGeneratedSuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isAlignerMode, setIsAlignerMode] = useState(initialAlignerMode);
  const [alignerConfig, setAlignerConfig] = useState<Cerfa15776Config>(() => cloneCerfaConfig());

  useEffect(() => {
    if (isOpen && !isPage) {
      setStep(1);
      setSelectedVehicleId(vehicle.id);
      setFormData(buildInitialCerfaData(vehicle, getGarageSettings()));
      setErrors({});
      setGenerationError(null);
      setGeneratedSuccess(false);
      setSaveSuccess(null);
      setIsAlignerMode(initialAlignerMode);
      setAlignerConfig(cloneCerfaConfig());
    }
  }, [isOpen, isPage, vehicle, initialAlignerMode]);

  useEffect(() => {
    if (isPage) {
      setIsAlignerMode(initialAlignerMode);
    }
  }, [isPage, initialAlignerMode]);

  useEffect(() => {
    if (!isPage) return;
    setFormData(buildInitialCerfaData(activePick.vehicle, getGarageSettings()));
    setErrors({});
    setGenerationError(null);
    setGeneratedSuccess(false);
    setSaveSuccess(null);
  }, [isPage, activePick.vehicle.id]);

  if (!isOpen && !isPage) return null;

  const handleSelectVehicle = (nextVehicleId: string) => {
    setSelectedVehicleId(nextVehicleId);
    const picked = pickCerfaTargetVehicle({
      preferredVehicleId: nextVehicleId,
      selectedVehicle: vehicle,
      vehicles: availableVehicles,
      userId,
    });
    setFormData(buildInitialCerfaData(picked.vehicle, getGarageSettings()));
    setErrors({});
    setGenerationError(null);
    setGeneratedSuccess(false);
    setSaveSuccess(null);
  };

  const updateVehicleField = <K extends keyof Cerfa15776FormData['vehicle']>(
    field: K,
    value: Cerfa15776FormData['vehicle'][K]
  ) => {
    setSaveSuccess(null);
    setFormData((prev) => ({
      ...prev,
      vehicle: { ...prev.vehicle, [field]: value },
    }));
  };

  const updateSellerField = <K extends keyof Cerfa15776FormData['seller']>(
    field: K,
    value: Cerfa15776FormData['seller'][K]
  ) => {
    setSaveSuccess(null);
    setFormData((prev) => ({
      ...prev,
      seller: { ...prev.seller, [field]: value },
    }));
  };

  const updateBuyerField = <K extends keyof Cerfa15776FormData['buyer']>(
    field: K,
    value: Cerfa15776FormData['buyer'][K]
  ) => {
    setSaveSuccess(null);
    setFormData((prev) => ({
      ...prev,
      buyer: { ...prev.buyer, [field]: value },
    }));
  };

  const handleNext = () => {
    const stepErrors = validateCerfaStep(step, formData);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) {
      setStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
    }
  };

  const handlePrev = () => {
    setErrors({});
    setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev));
  };

  const handleSaveDocumentChanges = async () => {
    setIsSaving(true);
    setGenerationError(null);
    setSaveSuccess(null);
    try {
      const currentSettings = getGarageSettings();
      await saveGarageSettings(
        {
          ...currentSettings,
          defaultCerfaTemplate: selectedTemplateId,
        },
        userId
      );

      let syncedVehicle = false;
      if (!activePick.isDemo && onSaveVehicleFields && activePick.vehicle.id !== 'demo_aligner') {
        const patch = buildVehicleCerfaPatch(activePick.vehicle, formData.vehicle);
        if (patch) {
          await onSaveVehicleFields(activePick.vehicle.id, patch);
          syncedVehicle = true;
        }
      }

      setSaveSuccess(
        isRu
          ? syncedVehicle
            ? 'Шаблон и данные автомобиля (госномер, VIN, пробег) сохранены.'
            : 'Выбранный шаблон и черновик настроек документов сохранены.'
          : syncedVehicle
          ? 'Modèle et données véhicule (immatriculation, VIN, kilométrage) enregistrés.'
          : 'Modèle Cerfa et configuration document enregistrés.'
      );
    } catch (err) {
      setGenerationError(
        err instanceof Error
          ? err.message
          : isRu
          ? 'Ошибка при сохранении документа.'
          : 'Erreur lors de l’enregistrement.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePDF = async (action: 'download' | 'print') => {
    const stepErrors = validateCerfaStep(isPage ? 1 : 3, formData);
    if (isPage) {
      Object.assign(stepErrors, validateCerfaStep(2, formData), validateCerfaStep(3, formData));
    }
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedSuccess(false);

    try {
      await generateCerfa15776FromFormData(formData, action, alignerConfig);
      setGeneratedSuccess(true);
    } catch (err) {
      setGenerationError(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la génération du formulaire Cerfa 15776*02.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const steps = [
    { id: 1 as const, label: isRu ? '1. Автомобиль' : '1. Le Véhicule', icon: Car },
    { id: 2 as const, label: isRu ? '2. Продавец' : '2. Ancien Propriétaire', icon: Building2 },
    { id: 3 as const, label: isRu ? '3. Покупатель' : '3. Nouveau Propriétaire', icon: UserCheck },
  ];

  const inputClass =
    'w-full bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition';
  const labelClass = 'block text-xs font-semibold text-[var(--secondary-foreground)] mb-1.5';

  const alertsBlock = (
    <>
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-xs text-red-400 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <ul className="space-y-1">
            {Object.values(errors).map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {generationError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-xs text-red-400 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{generationError}</span>
        </div>
      )}

      {generatedSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-400 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {isRu
              ? 'Официальный бланк Cerfa N° 15776*02 сформирован (поля подписей оставлены пустыми).'
              : 'Le formulaire officiel Cerfa N° 15776*02 a été généré avec succès (signatures laissées vierges).'}
          </span>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-400 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}
    </>
  );

  const formStepsContent = (
    <>
      {/* STEP 1: VEHICLE */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cerfa-reg" className={labelClass}>
                (A) N° d'immatriculation *
              </label>
              <input
                id="cerfa-reg"
                type="text"
                placeholder="AB-123-CD"
                value={formData.vehicle.registrationNumber}
                onChange={(e) =>
                  updateVehicleField('registrationNumber', e.target.value.toUpperCase())
                }
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-vin" className={labelClass}>
                (E) Numéro d'identification (VIN) *
              </label>
              <input
                id="cerfa-vin"
                type="text"
                value={formData.vehicle.vin}
                onChange={(e) => updateVehicleField('vin', e.target.value.toUpperCase())}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-first-reg" className={labelClass}>
                (B) 1re immatriculation
              </label>
              <input
                id="cerfa-first-reg"
                type="date"
                value={formData.vehicle.firstRegistrationDate}
                onChange={(e) => updateVehicleField('firstRegistrationDate', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-make" className={labelClass}>
                (D.1) Marque *
              </label>
              <input
                id="cerfa-make"
                type="text"
                value={formData.vehicle.make}
                onChange={(e) => updateVehicleField('make', e.target.value.toUpperCase())}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-d2" className={labelClass}>
                (D.2) Type, variante, version
              </label>
              <input
                id="cerfa-d2"
                type="text"
                value={formData.vehicle.typeVariantVersion}
                onChange={(e) => updateVehicleField('typeVariantVersion', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cerfa-j1" className={labelClass}>
                (J.1) Genre national
              </label>
              <ThemedSelect
                id="cerfa-j1"
                testId="cerfa-j1-select"
                ariaLabel="(J.1) Genre national"
                value={formData.vehicle.nationalGenre}
                onChange={(val) => updateVehicleField('nationalGenre', val)}
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
              <label htmlFor="cerfa-d3" className={labelClass}>
                (D.3) Dénomination commerciale
              </label>
              <input
                id="cerfa-d3"
                type="text"
                value={formData.vehicle.commercialDesignation}
                onChange={(e) =>
                  updateVehicleField('commercialDesignation', e.target.value.toUpperCase())
                }
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-mileage" className={labelClass}>
                Kilométrage au compteur *
              </label>
              <input
                id="cerfa-mileage"
                type="number"
                min={0}
                value={formData.vehicle.mileage}
                onChange={(e) =>
                  updateVehicleField(
                    'mileage',
                    e.target.value === '' ? '' : Number(e.target.value)
                  )
                }
                className={inputClass}
              />
            </div>
          </div>

          {/* Certificat d'immatriculation presence */}
          <div className="bg-[var(--background)]/70 border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <span className="block text-xs font-bold text-[var(--foreground)]">
              Présence du certificat d'immatriculation
            </span>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => updateVehicleField('hasRegistrationCertificate', true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                  formData.vehicle.hasRegistrationCertificate
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                    : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)]'
                }`}
              >
                OUI — Certificat présent
              </button>
              <button
                type="button"
                onClick={() => updateVehicleField('hasRegistrationCertificate', false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                  !formData.vehicle.hasRegistrationCertificate
                    ? 'bg-amber-600/20 text-amber-400 border-amber-500/50'
                    : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)]'
                }`}
              >
                NON — Absent
              </button>
            </div>

            {formData.vehicle.hasRegistrationCertificate ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="cerfa-formula" className={labelClass}>
                    Numéro de formule (ex: 2019AB12345)
                  </label>
                  <input
                    id="cerfa-formula"
                    type="text"
                    placeholder="20..."
                    value={formData.vehicle.formulaNumber}
                    onChange={(e) =>
                      updateVehicleField('formulaNumber', e.target.value.toUpperCase())
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-cert-date" className={labelClass}>
                    ou (I) Date du certificat (ancien format)
                  </label>
                  <input
                    id="cerfa-cert-date"
                    type="date"
                    value={formData.vehicle.certificateDate}
                    onChange={(e) => updateVehicleField('certificateDate', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <label htmlFor="cerfa-absence-reason" className={labelClass}>
                  Motif d'absence du certificat d'immatriculation *
                </label>
                <input
                  id="cerfa-absence-reason"
                  type="text"
                  placeholder="Ex: Déclaration de perte jointe..."
                  value={formData.vehicle.absenceReason}
                  onChange={(e) => updateVehicleField('absenceReason', e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: SELLER */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => updateSellerField('entityType', 'morale')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                formData.seller.entityType === 'morale'
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              Personne morale (Société / Garage)
            </button>
            <button
              type="button"
              onClick={() => updateSellerField('entityType', 'physique')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                formData.seller.entityType === 'physique'
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              Personne physique
            </button>

            {formData.seller.entityType === 'physique' && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-[var(--muted-foreground)]">Sexe :</span>
                {(['M', 'F'] as const).map((sx) => (
                  <button
                    key={sx}
                    type="button"
                    onClick={() => updateSellerField('sex', sx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                      formData.seller.sex === sx
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                        : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
                    }`}
                  >
                    {sx}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-seller-name" className={labelClass}>
                {formData.seller.entityType === 'morale'
                  ? 'Raison sociale *'
                  : 'Nom et Prénom *'}
              </label>
              <input
                id="cerfa-seller-name"
                type="text"
                value={formData.seller.nameOrCompany}
                onChange={(e) => updateSellerField('nameOrCompany', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-siret" className={labelClass}>
                N° SIRET {formData.seller.entityType === 'morale' ? '*' : '(le cas échéant)'}
              </label>
              <input
                id="cerfa-seller-siret"
                type="text"
                value={formData.seller.siret}
                onChange={(e) => updateSellerField('siret', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="cerfa-seller-num" className={labelClass}>
                N° de voie
              </label>
              <input
                id="cerfa-seller-num"
                type="text"
                value={formData.seller.streetNumber}
                onChange={(e) => updateSellerField('streetNumber', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-ext" className={labelClass}>
                Extension (bis, ter)
              </label>
              <input
                id="cerfa-seller-ext"
                type="text"
                value={formData.seller.streetExtension}
                onChange={(e) => updateSellerField('streetExtension', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-type" className={labelClass}>
                Type de voie
              </label>
              <input
                id="cerfa-seller-type"
                type="text"
                placeholder="Rue, Avenue..."
                value={formData.seller.streetType}
                onChange={(e) => updateSellerField('streetType', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-street" className={labelClass}>
                Nom de la voie
              </label>
              <input
                id="cerfa-seller-street"
                type="text"
                value={formData.seller.streetName}
                onChange={(e) => updateSellerField('streetName', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-seller-zip" className={labelClass}>
                Code postal *
              </label>
              <input
                id="cerfa-seller-zip"
                type="text"
                value={formData.seller.postalCode}
                onChange={(e) => updateSellerField('postalCode', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-city" className={labelClass}>
                Commune *
              </label>
              <input
                id="cerfa-seller-city"
                type="text"
                value={formData.seller.city}
                onChange={(e) => updateSellerField('city', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="cerfa-sale-date" className={labelClass}>
                Cédé le *
              </label>
              <input
                id="cerfa-sale-date"
                type="date"
                value={formData.seller.saleDate}
                onChange={(e) => updateSellerField('saleDate', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-sale-time" className={labelClass}>
                à (heure)
              </label>
              <input
                id="cerfa-sale-time"
                type="time"
                value={formData.seller.saleTime}
                onChange={(e) => updateSellerField('saleTime', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-fait-a" className={labelClass}>
                Fait à (Commune) *
              </label>
              <input
                id="cerfa-seller-fait-a"
                type="text"
                value={formData.seller.signingCity}
                onChange={(e) => updateSellerField('signingCity', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-fait-le" className={labelClass}>
                Le (Date signature)
              </label>
              <input
                id="cerfa-seller-fait-le"
                type="date"
                value={formData.seller.signingDate}
                onChange={(e) => updateSellerField('signingDate', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Mandatory administrative checkboxes */}
          <div className="bg-[var(--background)]/70 border border-[var(--border)] rounded-2xl p-4 space-y-2.5 text-xs text-[var(--secondary-foreground)]">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.seller.certifyAdminSituation}
                onChange={(e) => updateSellerField('certifyAdminSituation', e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--card)] text-blue-500"
              />
              <span>
                Avoir remis au nouveau propriétaire un certificat de situation administrative de moins de 15 jours
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.seller.certifyNoTransformation}
                onChange={(e) => updateSellerField('certifyNoTransformation', e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--card)] text-blue-500"
              />
              <span>
                Que ce véhicule n'a pas subi de transformation notable susceptible de modifier ses indications
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-[var(--border)]">
              <input
                type="checkbox"
                checked={formData.seller.opposeProspecting}
                onChange={(e) => updateSellerField('opposeProspecting', e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--card)] text-blue-500"
              />
              <span>
                Je m'oppose à la réutilisation de mes données personnelles à des fins de prospection commerciale
              </span>
            </label>
          </div>
        </div>
      )}

      {/* STEP 3: BUYER */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => updateBuyerField('entityType', 'physique')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                formData.buyer.entityType === 'physique'
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              Personne physique
            </button>
            <button
              type="button"
              onClick={() => updateBuyerField('entityType', 'morale')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                formData.buyer.entityType === 'morale'
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              Personne morale (Société)
            </button>

            {formData.buyer.entityType === 'physique' && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-[var(--muted-foreground)]">Sexe :</span>
                {(['M', 'F'] as const).map((sx) => (
                  <button
                    key={sx}
                    type="button"
                    onClick={() => updateBuyerField('sex', sx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                      formData.buyer.sex === sx
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                        : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
                    }`}
                  >
                    {sx}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-buyer-name" className={labelClass}>
                {formData.buyer.entityType === 'morale'
                  ? 'Raison sociale *'
                  : 'NOM et PRÉNOM *'}
              </label>
              <input
                id="cerfa-buyer-name"
                type="text"
                value={formData.buyer.nameOrCompany}
                onChange={(e) => updateBuyerField('nameOrCompany', e.target.value)}
                className={inputClass}
              />
            </div>
            {formData.buyer.entityType === 'morale' ? (
              <div>
                <label htmlFor="cerfa-buyer-siret" className={labelClass}>
                  N° SIRET
                </label>
                <input
                  id="cerfa-buyer-siret"
                  type="text"
                  value={formData.buyer.siret}
                  onChange={(e) => updateBuyerField('siret', e.target.value)}
                  className={inputClass}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cerfa-buyer-birth-date" className={labelClass}>
                    Né(e) le *
                  </label>
                  <input
                    id="cerfa-buyer-birth-date"
                    type="date"
                    value={formData.buyer.birthDate}
                    onChange={(e) => updateBuyerField('birthDate', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-buyer-birth-place" className={labelClass}>
                    À (Lieu de naissance)
                  </label>
                  <input
                    id="cerfa-buyer-birth-place"
                    type="text"
                    value={formData.buyer.birthPlace}
                    onChange={(e) => updateBuyerField('birthPlace', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="cerfa-buyer-num" className={labelClass}>
                N° de voie
              </label>
              <input
                id="cerfa-buyer-num"
                type="text"
                value={formData.buyer.streetNumber}
                onChange={(e) => updateBuyerField('streetNumber', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-buyer-ext" className={labelClass}>
                Extension
              </label>
              <input
                id="cerfa-buyer-ext"
                type="text"
                value={formData.buyer.streetExtension}
                onChange={(e) => updateBuyerField('streetExtension', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-buyer-type" className={labelClass}>
                Type de voie
              </label>
              <input
                id="cerfa-buyer-type"
                type="text"
                placeholder="Rue, Square..."
                value={formData.buyer.streetType}
                onChange={(e) => updateBuyerField('streetType', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-buyer-street" className={labelClass}>
                Nom de la voie
              </label>
              <input
                id="cerfa-buyer-street"
                type="text"
                value={formData.buyer.streetName}
                onChange={(e) => updateBuyerField('streetName', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-buyer-zip" className={labelClass}>
                Code postal *
              </label>
              <input
                id="cerfa-buyer-zip"
                type="text"
                value={formData.buyer.postalCode}
                onChange={(e) => updateBuyerField('postalCode', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-buyer-city" className={labelClass}>
                Commune *
              </label>
              <input
                id="cerfa-buyer-city"
                type="text"
                value={formData.buyer.city}
                onChange={(e) => updateBuyerField('city', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-buyer-fait-a" className={labelClass}>
                Fait à (Commune)
              </label>
              <input
                id="cerfa-buyer-fait-a"
                type="text"
                value={formData.buyer.signingCity}
                onChange={(e) => updateBuyerField('signingCity', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-buyer-fait-le" className={labelClass}>
                Le (Date)
              </label>
              <input
                id="cerfa-buyer-fait-le"
                type="date"
                value={formData.buyer.signingDate}
                onChange={(e) => updateBuyerField('signingDate', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="bg-[var(--background)]/70 border border-[var(--border)] rounded-2xl p-4 space-y-2.5 text-xs text-[var(--secondary-foreground)]">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.buyer.certifyAcquire}
                onChange={(e) => updateBuyerField('certifyAcquire', e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--card)] text-blue-500"
              />
              <span>
                Acquérir le véhicule désigné ci-dessus aux dates et heures indiquées par l'ancien propriétaire
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.buyer.certifyInformedAdmin}
                onChange={(e) => updateBuyerField('certifyInformedAdmin', e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--card)] text-blue-500"
              />
              <span>Avoir été informé de la situation administrative du véhicule</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-[var(--border)]">
              <input
                type="checkbox"
                checked={formData.buyer.opposeProspecting}
                onChange={(e) => updateBuyerField('opposeProspecting', e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--card)] text-blue-500"
              />
              <span>
                Je m'oppose à la réutilisation de mes données personnelles à des fins de prospection commerciale
              </span>
            </label>
          </div>
        </div>
      )}
    </>
  );

  // Full In-Page Workspace Layout (Sidebar Mode)
  if (isPage) {
    const sellerAddressLine = [
      formData.seller.streetNumber,
      formData.seller.streetExtension,
      formData.seller.streetType,
      formData.seller.streetName,
    ]
      .filter(Boolean)
      .join(' ');
    const buyerAddressLine = [
      formData.buyer.streetNumber,
      formData.buyer.streetExtension,
      formData.buyer.streetType,
      formData.buyer.streetName,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div data-testid="documents-page-view" className="space-y-5">
        {/* Page Header + Template & Vehicle Pre-fill Controls + Save/Export Bar */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                <FileCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-[var(--foreground)]">
                  {isRu ? 'Документы и Cerfa 15776*02' : 'Documents & Cerfa N° 15776*02'}
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {isRu
                    ? 'Выбор шаблона, автозаполнение по автомобилю, редактор и предпросмотр бланка'
                    : 'Sélecteur de modèle, pré-remplissage véhicule, édition et aperçu en direct'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="documents-aligner-toggle"
                onClick={() => setIsAlignerMode((prev) => !prev)}
                className={`px-3 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition flex items-center gap-1.5 ${
                  isAlignerMode
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-[var(--surface-muted)] hover:opacity-90 text-amber-400 border-[var(--border)]'
                }`}
              >
                <span>🔧 {isRu ? 'Выравнивание (Aligner)' : 'Aligner Mode'}</span>
              </button>

              <button
                type="button"
                data-testid="documents-save-btn"
                disabled={isSaving}
                onClick={handleSaveDocumentChanges}
                className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{isRu ? 'Сохранить' : 'Enregistrer'}</span>
              </button>

              <button
                type="button"
                data-testid="documents-print-btn"
                disabled={isGenerating}
                onClick={() => handleGeneratePDF('print')}
                className="px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] disabled:opacity-50 transition flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isRu ? 'Печать' : 'Imprimer'}</span>
              </button>

              <button
                type="button"
                data-testid="documents-download-btn"
                disabled={isGenerating}
                onClick={() => handleGeneratePDF('download')}
                className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] hover:opacity-95 text-[var(--primary-foreground)] disabled:opacity-50 transition flex items-center gap-1.5 shadow-md"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isRu ? 'Скачать PDF [15776*02]' : 'Télécharger PDF [15776*02]'}</span>
              </button>
            </div>
          </div>

          {/* Template Selector & Vehicle Pre-Fill Picker */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--border)]">
            <div>
              <label htmlFor="documents-template-select" className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>{isRu ? 'Шаблон документа' : 'Modèle de document'}</span>
                </span>
              </label>
              <ThemedSelect
                id="documents-template-select"
                testId="documents-template-select"
                ariaLabel={isRu ? 'Шаблон документа' : 'Modèle de document'}
                value={selectedTemplateId}
                onChange={(val) => {
                  setSelectedTemplateId(val);
                  setSaveSuccess(null);
                }}
                options={CERFA_TEMPLATE_OPTIONS.map((tpl) => ({
                  value: tpl.id,
                  label: isRu ? tpl.labelRu : tpl.labelFr,
                }))}
                triggerClassName={inputClass}
              />
            </div>

            <div>
              <label htmlFor="documents-vehicle-select" className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>{isRu ? 'Автомобиль для автозаполнения' : 'Véhicule à pré-remplir'}</span>
                </span>
              </label>
              <ThemedSelect
                id="documents-vehicle-select"
                testId="documents-vehicle-select"
                ariaLabel={isRu ? 'Автомобиль для автозаполнения' : 'Véhicule à pré-remplir'}
                value={activePick.vehicle.id}
                onChange={handleSelectVehicle}
                options={availableVehicles.map((v) => {
                  const idSuffix = v.registrationNumber || (v.vin ? v.vin.slice(-6) : '—');
                  return {
                    value: v.id,
                    label: `${v.make} ${v.model} (${v.year}) — ${idSuffix}`,
                  };
                })}
                triggerClassName={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Body: Aligner Mode OR Split Form + Live Preview */}
        {isAlignerMode ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 shadow-lg">
            <CerfaAlignerPanel
              formData={formData}
              config={alignerConfig}
              onConfigChange={setAlignerConfig}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Column: Freely Clickable 3-Step Form */}
            <div className="xl:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-hidden shadow-lg">
              <div className="px-5 py-3.5 bg-[var(--background)]/50 border-b border-[var(--border)] grid grid-cols-1 sm:grid-cols-3 gap-2">
                {steps.map((s) => {
                  const Icon = s.icon;
                  const isActive = step === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      data-testid={`documents-step-${s.id}`}
                      onClick={() => {
                        setErrors({});
                        setStep(s.id);
                      }}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
                        isActive
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm'
                          : 'bg-[var(--surface-muted)]/60 text-[var(--secondary-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                {alertsBlock}
                {formStepsContent}
              </div>

              <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--background)]/50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={handlePrev}
                      className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] transition flex items-center gap-1.5"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>{isRu ? 'Назад' : 'Précédent'}</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {step < 3 && (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="px-5 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow"
                    >
                      <span>{isRu ? 'Далее' : 'Suivant'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => handleGeneratePDF('download')}
                    className="px-5 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] hover:opacity-95 text-[var(--primary-foreground)] disabled:opacity-50 transition flex items-center gap-1.5 shadow"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isRu ? 'Экспорт PDF' : 'Exporter PDF'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Live Structured A4 Document Preview */}
            <div className="xl:col-span-5 xl:sticky xl:top-20 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 sm:p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--primary)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                    {isRu ? 'Живой предпросмотр документа' : 'Aperçu en direct du document'}
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  CERFA 15776*02
                </span>
              </div>

              <div
                data-testid="documents-live-preview"
                className="bg-white text-slate-900 rounded-xl border border-slate-300 shadow-inner p-4 sm:p-5 space-y-3.5 text-[11px] leading-snug"
              >
                {/* Official Form Masthead */}
                <div className="flex items-start justify-between gap-3 border-b-2 border-slate-900 pb-2.5">
                  <div>
                    <p className="text-[9px] font-extrabold tracking-widest uppercase text-slate-600">
                      République Française • Ministère de l'Intérieur
                    </p>
                    <p className="text-xs font-black uppercase text-slate-950 mt-0.5">
                      Certificat de cession d'un véhicule d'occasion
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block border border-slate-900 px-1.5 py-0.5 font-mono font-extrabold text-[10px]">
                      cerfa 15776*02
                    </span>
                  </div>
                </div>

                {/* Section 1: Vehicle */}
                <div className="border border-slate-300 rounded-lg p-2.5 space-y-1.5 bg-slate-50/70">
                  <p className="text-[10px] font-black uppercase tracking-wide text-blue-900 border-b border-slate-200 pb-1">
                    1. Le Véhicule
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <span className="text-slate-500">(A) Immat. : </span>
                      <strong className="font-mono">{formData.vehicle.registrationNumber || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">(B) 1re immat. : </span>
                      <strong>{formatFrenchDate(formData.vehicle.firstRegistrationDate) || '—'}</strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500">(E) N° VIN : </span>
                      <strong className="font-mono break-all">{formData.vehicle.vin || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">(D.1) Marque : </span>
                      <strong>{formData.vehicle.make || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">(D.3) Modèle : </span>
                      <strong>{formData.vehicle.commercialDesignation || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">(J.1) Genre : </span>
                      <strong>{formData.vehicle.nationalGenre || 'VP'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Kilométrage : </span>
                      <strong>
                        {formData.vehicle.mileage !== '' ? `${Number(formData.vehicle.mileage).toLocaleString('fr-FR')} km` : '—'}
                      </strong>
                    </div>
                    <div className="col-span-2 pt-0.5 text-[10px]">
                      <span className="text-slate-500">Certificat d'immatriculation : </span>
                      <strong>
                        {formData.vehicle.hasRegistrationCertificate
                          ? `OUI${formData.vehicle.formulaNumber ? ` (Formule ${formData.vehicle.formulaNumber})` : ''}`
                          : `NON (${formData.vehicle.absenceReason || 'Motif à préciser'})`}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Section 2: Seller */}
                <div className="border border-slate-300 rounded-lg p-2.5 space-y-1 bg-slate-50/70">
                  <p className="text-[10px] font-black uppercase tracking-wide text-blue-900 border-b border-slate-200 pb-1">
                    2. Ancien Propriétaire (Cédant)
                  </p>
                  <p>
                    <span className="text-slate-500">
                      {formData.seller.entityType === 'morale' ? 'Raison sociale : ' : 'Nom : '}
                    </span>
                    <strong>{formData.seller.nameOrCompany || '—'}</strong>
                  </p>
                  {formData.seller.entityType === 'morale' && (
                    <p>
                      <span className="text-slate-500">SIRET : </span>
                      <strong className="font-mono">{formData.seller.siret || '—'}</strong>
                    </p>
                  )}
                  <p>
                    <span className="text-slate-500">Adresse : </span>
                    <strong>
                      {[sellerAddressLine, formData.seller.postalCode, formData.seller.city]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Cédé le : </span>
                    <strong>
                      {formatFrenchDate(formData.seller.saleDate) || '—'}
                      {formData.seller.saleTime ? ` à ${formData.seller.saleTime}` : ''}
                    </strong>
                  </p>
                </div>

                {/* Section 3: Buyer */}
                <div className="border border-slate-300 rounded-lg p-2.5 space-y-1 bg-slate-50/70">
                  <p className="text-[10px] font-black uppercase tracking-wide text-blue-900 border-b border-slate-200 pb-1">
                    3. Nouveau Propriétaire (Acquéreur)
                  </p>
                  <p>
                    <span className="text-slate-500">
                      {formData.buyer.entityType === 'morale' ? 'Raison sociale : ' : 'Nom & Prénom : '}
                    </span>
                    <strong>{formData.buyer.nameOrCompany || '—'}</strong>
                  </p>
                  {formData.buyer.entityType === 'physique' ? (
                    <p>
                      <span className="text-slate-500">Né(e) le : </span>
                      <strong>
                        {formatFrenchDate(formData.buyer.birthDate) || '—'}
                        {formData.buyer.birthPlace ? ` à ${formData.buyer.birthPlace}` : ''}
                      </strong>
                    </p>
                  ) : (
                    <p>
                      <span className="text-slate-500">SIRET : </span>
                      <strong className="font-mono">{formData.buyer.siret || '—'}</strong>
                    </p>
                  )}
                  <p>
                    <span className="text-slate-500">Domicile : </span>
                    <strong>
                      {[buyerAddressLine, formData.buyer.postalCode, formData.buyer.city]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </strong>
                  </p>
                </div>

                {/* Blank Signatures Footer */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="border border-dashed border-slate-400 rounded-lg p-2 min-h-[54px] flex flex-col justify-between">
                    <span className="text-[9px] font-semibold text-slate-600">
                      Fait à {formData.seller.signingCity || '_______'}, le {formatFrenchDate(formData.seller.signingDate) || '__/__/____'}
                    </span>
                    <span className="text-[9px] italic text-slate-400">
                      Signature ancien propriétaire (vierge)
                    </span>
                  </div>
                  <div className="border border-dashed border-slate-400 rounded-lg p-2 min-h-[54px] flex flex-col justify-between">
                    <span className="text-[9px] font-semibold text-slate-600">
                      Fait à {formData.buyer.signingCity || '_______'}, le {formatFrenchDate(formData.buyer.signingDate) || '__/__/____'}
                    </span>
                    <span className="text-[9px] italic text-slate-400">
                      Signature nouveau propriétaire (vierge)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Modal Layout (Classic Mode / Quick Vehicle Action)
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cerfa-wizard-title"
    >
      <div
        className={`bg-[var(--card)] border border-[var(--border)] rounded-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-all ${
          isAlignerMode ? 'max-w-6xl' : 'max-w-3xl'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 bg-[var(--background)]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cerfa-wizard-title" className="text-lg font-bold text-[var(--foreground)]">
                Cerfa N° 15776*02 — Certificat de cession
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Remplissage officiel sur le modèle gouvernemental (Exemplaires 1 & 2)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAlignerMode((prev) => !prev)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                isAlignerMode
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                  : 'bg-[var(--surface-muted)] hover:opacity-90 text-amber-400 border-[var(--border)]'
              }`}
            >
              <span>🔧 Режим выравнивания / Aligner Mode</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer l'assistant Cerfa 15776"
              className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-[var(--surface-muted)] hover:opacity-90 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stepper (hidden in Aligner Mode) */}
        {!isAlignerMode && (
          <div className="px-6 py-3 bg-[var(--background)]/40 border-b border-[var(--border)] grid grid-cols-3 gap-2">
            {steps.map((s) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isCompleted = step > s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (s.id < step) {
                      setErrors({});
                      setStep(s.id);
                    }
                  }}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                      : isCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 cursor-pointer'
                      : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] cursor-default'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <Icon className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Form Body or Aligner Mode */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {isAlignerMode ? (
            <CerfaAlignerPanel
              formData={formData}
              config={alignerConfig}
              onConfigChange={setAlignerConfig}
            />
          ) : (
            <>
              {alertsBlock}
              {formStepsContent}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--background)]/70 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] transition flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Précédent</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow"
              >
                <span>Suivant</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleGeneratePDF('print')}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 disabled:opacity-50 text-[var(--foreground)] transition flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer</span>
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleGeneratePDF('download')}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition flex items-center gap-2 shadow-lg"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Télécharger le formulaire n° 15776*02 [PDF]</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
