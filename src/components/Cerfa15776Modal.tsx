import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  FileText,
  ArrowLeft,
  Edit3,
} from 'lucide-react';
import { AppUserProfileType, GarageSettings, Vehicle } from '../types/garage';
import {
  fetchGarageSettingsFromCloud,
  getGarageSettings,
  saveGarageSettings,
} from '../services/garageService';
import {
  CERFA_TEMPLATE_OPTIONS,
  Cerfa15776FormData,
  buildCerfaSellerFromProfile,
  buildInitialCerfaData,
  buildVehicleCerfaPatch,
  createCalibrationDummyCerfaData,
  normalizeCerfaTemplateId,
  pickCerfaTargetVehicle,
  resolveCerfaSellerModeForVehicle,
  resolveCerfaTargetGarageId,
  validateAllCerfaSteps,
  validateCerfaStep,
} from '../utils/cerfa15776';
import {
  ensureBusinessProfiles,
  ensurePersonalProfiles,
  getSellerProfileDisplayName,
} from '../utils/profileSeparationUtils';
import { formatCerfaMissingToast } from '../utils/vehicleFormUtils';
import {
  Cerfa15776Config,
  CerfaTemplateKey,
  CerfaTemplatesCalibrationPayload,
} from '../utils/cerfaConfig';
import {
  getCerfaTemplatesCalibration,
  saveCerfaTemplatesCalibration,
  subscribeCerfaTemplatesCalibration,
} from '../services/adminService';
import { buildCerfa15776PdfBytes, generateCerfa15776FromFormData } from '../utils/pdfGenerator';
import { CerfaAlignerPanel } from './CerfaAlignerPanel';
import { CerfaLivePreviewSheet } from './CerfaLivePreviewSheet';
import { ThemedSelect } from './ThemedSelect';
import { pickLocalized } from '../utils/i18nUtils';
import { useI18n } from '../i18n/I18nContext';

interface Cerfa15776ModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
  vehicles?: Vehicle[];
  userId?: string;
  activeGarageId?: string | null;
  isSuperAdmin?: boolean;
  initialAlignerMode?: boolean;
  calibrationDummyMode?: boolean;
  variant?: 'modal' | 'page';
  canUseCerfaAutofill?: boolean;
  onSaveVehicleFields?: (
    vehicleId: string,
    patch: Partial<Pick<Vehicle, 'registrationNumber' | 'vin' | 'mileage'>>
  ) => Promise<void>;
  onValidationToast?: (message: string) => void;
}

export const Cerfa15776Modal: React.FC<Cerfa15776ModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  vehicles = [],
  userId,
  activeGarageId,
  isSuperAdmin = false,
  initialAlignerMode = false,
  calibrationDummyMode = false,
  variant = 'modal',
  canUseCerfaAutofill = true,
  onSaveVehicleFields,
  onValidationToast,
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });
  const isPage = variant === 'page';
  const initialTargetGarageId = resolveCerfaTargetGarageId(vehicle, activeGarageId);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicle.id);
  const [selectedTemplateId, setSelectedTemplateId] = useState<CerfaTemplateKey>(
    () => normalizeCerfaTemplateId(getGarageSettings(initialTargetGarageId).defaultCerfaTemplate)
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

  const targetVehicle = isPage ? activePick.vehicle : vehicle;
  const targetGarageId = resolveCerfaTargetGarageId(targetVehicle, activeGarageId);

  const [latestGarageSettings, setLatestGarageSettings] = useState<GarageSettings>(() =>
    getGarageSettings(targetGarageId)
  );
  const [selectedSellerProfileId, setSelectedSellerProfileId] = useState<string>(
    () => targetVehicle.sellerProfileId || targetVehicle.buyerInfo?.sellerProfileId || ''
  );
  const hasSellerEditsRef = useRef(false);

  const [formData, setFormData] = useState<Cerfa15776FormData>(() =>
    calibrationDummyMode
      ? createCalibrationDummyCerfaData()
      : buildInitialCerfaData(activePick.vehicle, getGarageSettings(targetGarageId))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedSuccess, setGeneratedSuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [showFormEditor, setShowFormEditor] = useState(false);

  // Manual field calibration sliders are restricted strictly to Superadmin calibrationDummyMode
  const allowCalibrationEditor = calibrationDummyMode;
  const [isAlignerMode, setIsAlignerMode] = useState(
    allowCalibrationEditor && initialAlignerMode
  );
  const [cloudCalibration, setCloudCalibration] = useState<CerfaTemplatesCalibrationPayload>(() =>
    getCerfaTemplatesCalibration()
  );
  const [alignerConfig, setAlignerConfig] = useState<Cerfa15776Config>(
    () => getCerfaTemplatesCalibration().cerfa_15776_02.config
  );
  const [isAlignerDirty, setIsAlignerDirty] = useState(false);
  const [isSavingCalibration, setIsSavingCalibration] = useState(false);
  const [alignerSaveNotice, setAlignerSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeCerfaTemplatesCalibration((cal) => {
      setCloudCalibration(cal);
      if (!isAlignerDirty) {
        setAlignerConfig(cal.cerfa_15776_02.config);
      }
    });
    return () => unsub();
  }, [isAlignerDirty]);

  useEffect(() => {
    if (!isOpen && !isPage) return;
    let isCancelled = false;
    const currentVehicle = isPage ? activePick.vehicle : vehicle;
    const resolvedGarageId = resolveCerfaTargetGarageId(currentVehicle, activeGarageId);
    const syncLocal = () => {
      setLatestGarageSettings(getGarageSettings(resolvedGarageId));
    };
    syncLocal();
    window.addEventListener('autogarage_settings_updated', syncLocal);
    if (userId) {
      fetchGarageSettingsFromCloud(userId, resolvedGarageId).then((cloud) => {
        if (isCancelled) return;
        setLatestGarageSettings(cloud);
        setSelectedTemplateId(normalizeCerfaTemplateId(cloud.defaultCerfaTemplate));
        if (!hasSellerEditsRef.current && !calibrationDummyMode) {
          const mode = resolveCerfaSellerModeForVehicle(currentVehicle, cloud);
          const explicitProfileId =
            currentVehicle.sellerProfileId || currentVehicle.buyerInfo?.sellerProfileId;
          setSelectedSellerProfileId(explicitProfileId || '');
          setFormData((prev) => ({
            ...prev,
            seller: buildCerfaSellerFromProfile(
              cloud,
              mode,
              prev.seller,
              explicitProfileId
            ),
          }));
        }
      });
    }
    return () => {
      isCancelled = true;
      window.removeEventListener('autogarage_settings_updated', syncLocal);
    };
  }, [isOpen, isPage, userId, calibrationDummyMode, activePick.vehicle, vehicle, activeGarageId]);

  useEffect(() => {
    if (isOpen && !isPage) {
      hasSellerEditsRef.current = false;
      const resolvedGarageId = resolveCerfaTargetGarageId(vehicle, activeGarageId);
      const freshSettings = getGarageSettings(resolvedGarageId);
      setLatestGarageSettings(freshSettings);
      setSelectedTemplateId(normalizeCerfaTemplateId(freshSettings.defaultCerfaTemplate));
      setStep(1);
      setSelectedVehicleId(vehicle.id);
      setSelectedSellerProfileId(
        vehicle.sellerProfileId || vehicle.buyerInfo?.sellerProfileId || ''
      );
      setFormData(
        calibrationDummyMode
          ? createCalibrationDummyCerfaData()
          : buildInitialCerfaData(vehicle, freshSettings)
      );
      setErrors({});
      setGenerationError(null);
      setGeneratedSuccess(false);
      setSaveSuccess(null);
      setIsAlignerMode(allowCalibrationEditor && initialAlignerMode);
      const latest = getCerfaTemplatesCalibration();
      setCloudCalibration(latest);
      setAlignerConfig(latest.cerfa_15776_02.config);
      setIsAlignerDirty(false);
      setAlignerSaveNotice(null);
    }
  }, [isOpen, isPage, vehicle, activeGarageId, initialAlignerMode, calibrationDummyMode, allowCalibrationEditor]);

  useEffect(() => {
    if (isPage) {
      setIsAlignerMode(allowCalibrationEditor && initialAlignerMode);
    }
  }, [isPage, initialAlignerMode, allowCalibrationEditor]);

  useEffect(() => {
    if (!isPage) return;
    hasSellerEditsRef.current = false;
    const resolvedGarageId = resolveCerfaTargetGarageId(activePick.vehicle, activeGarageId);
    const freshSettings = getGarageSettings(resolvedGarageId);
    setLatestGarageSettings(freshSettings);
    setSelectedTemplateId(normalizeCerfaTemplateId(freshSettings.defaultCerfaTemplate));
    setSelectedSellerProfileId(
      activePick.vehicle.sellerProfileId || activePick.vehicle.buyerInfo?.sellerProfileId || ''
    );
    setFormData(
      calibrationDummyMode
        ? createCalibrationDummyCerfaData()
        : buildInitialCerfaData(activePick.vehicle, freshSettings)
    );
    setErrors({});
    setGenerationError(null);
    setGeneratedSuccess(false);
    setSaveSuccess(null);
  }, [isPage, activePick.vehicle.id, activePick.vehicle.garageId, activeGarageId, calibrationDummyMode]);

  const showAlignerView = allowCalibrationEditor && isAlignerMode;

  const generateLivePagePdfBytes = useCallback(
    () =>
      buildCerfa15776PdfBytes(formData, cloudCalibration.cerfa_15776_02.config, {
        customOffsets: cloudCalibration.cerfa_15776_02.offsets,
        sellerSignatureDataUrl: latestGarageSettings.signatureDataUrl,
      }),
    [formData, cloudCalibration, latestGarageSettings.signatureDataUrl]
  );

  const livePagePreviewDependencyKey = useMemo(
    () =>
      JSON.stringify({
        formData,
        cerfaCalibration: cloudCalibration.cerfa_15776_02,
        selectedTemplateId,
        sellerSignatureDataUrl: latestGarageSettings.signatureDataUrl || '',
      }),
    [formData, cloudCalibration, selectedTemplateId, latestGarageSettings.signatureDataUrl]
  );

  if (!isOpen && !isPage) return null;

  const handleSelectVehicle = (nextVehicleId: string) => {
    setSelectedVehicleId(nextVehicleId);
    const picked = pickCerfaTargetVehicle({
      preferredVehicleId: nextVehicleId,
      selectedVehicle: vehicle,
      vehicles: availableVehicles,
      userId,
    });
    const pickedGarageId = resolveCerfaTargetGarageId(picked.vehicle, activeGarageId);
    const pickedSettings = getGarageSettings(pickedGarageId);
    hasSellerEditsRef.current = false;
    setLatestGarageSettings(pickedSettings);
    setSelectedTemplateId(normalizeCerfaTemplateId(pickedSettings.defaultCerfaTemplate));
    setSelectedSellerProfileId(
      picked.vehicle.sellerProfileId || picked.vehicle.buyerInfo?.sellerProfileId || ''
    );
    setFormData(buildInitialCerfaData(picked.vehicle, pickedSettings));
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
    setErrors((prev) => {
      const next = { ...prev };
      if (field === 'registrationNumber') delete next.registrationNumber;
      if (field === 'vin') delete next.vin;
      if (field === 'firstRegistrationDate') delete next.firstRegistrationDate;
      if (field === 'make') delete next.make;
      if (field === 'commercialDesignation') delete next.commercialDesignation;
      if (field === 'mileage') delete next.mileage;
      if (field === 'hasRegistrationCertificate') {
        delete next.hasRegistrationCertificate;
        delete next.formulaOrCertificateDate;
        delete next.absenceReason;
      }
      if (field === 'formulaNumber' || field === 'certificateDate') {
        delete next.formulaOrCertificateDate;
      }
      if (field === 'absenceReason') delete next.absenceReason;
      return next;
    });
    setFormData((prev) => ({
      ...prev,
      vehicle: { ...prev.vehicle, [field]: value },
    }));
  };

  const handleSelectSellerProfileType = (targetMode: AppUserProfileType) => {
    hasSellerEditsRef.current = true;
    setSaveSuccess(null);
    const resolvedGarageId = resolveCerfaTargetGarageId(
      isPage ? activePick.vehicle : vehicle,
      activeGarageId
    );
    const currentSettings = getGarageSettings(resolvedGarageId);
    const hasCurrentProfileContent = Boolean(
      currentSettings.particulierProfile?.lastName ||
        currentSettings.particulierProfile?.firstName ||
        currentSettings.proProfile?.name ||
        currentSettings.proProfile?.siret ||
        currentSettings.name ||
        currentSettings.siret
    );
    const resolvedSettings =
      hasCurrentProfileContent ||
      (resolvedGarageId && latestGarageSettings.garageId !== resolvedGarageId)
        ? currentSettings
        : latestGarageSettings;

    setErrors((prev) => {
      const next = { ...prev };
      delete next.sellerName;
      delete next.sellerSiret;
      delete next.sellerStreetNumber;
      delete next.sellerStreetName;
      delete next.sellerCity;
      delete next.sellerSigningCity;
      return next;
    });

    const candidateList =
      targetMode === 'particulier'
        ? ensurePersonalProfiles(resolvedSettings)
        : ensureBusinessProfiles(resolvedSettings);
    const defaultProfile =
      candidateList.find((item) => item.isDefault) || candidateList[0];
    setSelectedSellerProfileId(defaultProfile?.id || '');

    setFormData((prev) => ({
      ...prev,
      seller: buildCerfaSellerFromProfile(
        resolvedSettings,
        targetMode,
        prev.seller,
        defaultProfile?.id
      ),
    }));
  };

  const handleSelectSavedSellerProfile = (profileId: string) => {
    hasSellerEditsRef.current = true;
    setSaveSuccess(null);
    setSelectedSellerProfileId(profileId);
    const targetMode: AppUserProfileType =
      formData.seller.entityType === 'physique' ? 'particulier' : 'micro_entrepreneur';
    setErrors((prev) => {
      const next = { ...prev };
      delete next.sellerName;
      delete next.sellerSiret;
      delete next.sellerStreetNumber;
      delete next.sellerStreetName;
      delete next.sellerCity;
      delete next.sellerSigningCity;
      return next;
    });
    setFormData((prev) => ({
      ...prev,
      seller: buildCerfaSellerFromProfile(
        latestGarageSettings,
        targetMode,
        prev.seller,
        profileId || undefined
      ),
    }));
  };

  const updateSellerField = <K extends keyof Cerfa15776FormData['seller']>(
    field: K,
    value: Cerfa15776FormData['seller'][K]
  ) => {
    hasSellerEditsRef.current = true;
    setSaveSuccess(null);
    setErrors((prev) => {
      const next = { ...prev };
      if (field === 'nameOrCompany') delete next.sellerName;
      if (field === 'siret') delete next.sellerSiret;
      if (field === 'streetNumber') delete next.sellerStreetNumber;
      if (field === 'streetName') delete next.sellerStreetName;
      if (field === 'postalCode' || field === 'city') delete next.sellerCity;
      if (field === 'saleDate') delete next.saleDate;
      if (field === 'signingCity') delete next.sellerSigningCity;
      return next;
    });
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
    setErrors((prev) => {
      const next = { ...prev };
      if (field === 'nameOrCompany') delete next.buyerName;
      if (field === 'birthDate') delete next.buyerBirthDate;
      if (field === 'streetNumber') delete next.buyerStreetNumber;
      if (field === 'streetName') delete next.buyerStreetName;
      if (field === 'postalCode' || field === 'city') delete next.buyerCity;
      return next;
    });
    setFormData((prev) => ({
      ...prev,
      buyer: { ...prev.buyer, [field]: value },
    }));
  };

  const handleNext = () => {
    const stepErrors = validateCerfaStep(step, formData, lang);
    setErrors(stepErrors);
    const missing = Object.values(stepErrors);
    if (missing.length === 0) {
      setStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
    } else {
      onValidationToast?.(formatCerfaMissingToast(missing, lang));
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
      const resolvedGarageId = resolveCerfaTargetGarageId(
        isPage ? activePick.vehicle : vehicle,
        activeGarageId
      );
      const currentSettings = getGarageSettings(resolvedGarageId);
      await saveGarageSettings(
        {
          ...currentSettings,
          garageId: resolvedGarageId || currentSettings.garageId,
          defaultCerfaTemplate: normalizeCerfaTemplateId(selectedTemplateId),
        },
        userId,
        resolvedGarageId
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
        syncedVehicle
          ? pickLocalized(lang, {
              fr: 'Modèle et données véhicule (immatriculation, VIN, kilométrage) enregistrés.',
              ru: 'Шаблон и данные автомобиля (госномер, VIN, пробег) сохранены.',
              hy: 'Ձևանմուշը և ավտոմեքենայի տվյալները (համարանիշ, VIN, վազք) պահպանվեցին։',
              ka: 'შაბლონი და ავტომობილის მონაცემები (ნომერი, VIN, გარბენი) შენახულია.',
            })
          : pickLocalized(lang, {
              fr: 'Modèle Cerfa et configuration document enregistrés.',
              ru: 'Выбранный шаблон и черновик настроек документов сохранены.',
              hy: 'Ընտրված ձևանմուշը և փաստաթղթերի կարգավորումները պահպանվեցին։',
              ka: 'არჩეული შაბლონი და დოკუმენტის პარამეტრები შენახულია.',
            })
      );
    } catch (err) {
      setGenerationError(
        err instanceof Error
          ? err.message
          : pickLocalized(lang, {
              fr: 'Erreur lors de l’enregistrement.',
              ru: 'Ошибка при сохранении документа.',
              hy: 'Փաստաթղթի պահպանման սխալ։',
              ka: 'დოკუმენტის შენახვის შეცდომა.',
            })
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePDF = async (action: 'download' | 'print') => {
    const validation = validateAllCerfaSteps(formData, lang);
    if (validation.firstInvalidStep !== null) {
      setErrors(validation.errors);
      setStep(validation.firstInvalidStep);
      if (isPage) {
        setShowFormEditor(true);
      }
      if (validation.toastMessage) {
        onValidationToast?.(validation.toastMessage);
      }
      return;
    }
    setErrors({});

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedSuccess(false);

    try {
      const activeConfig = showAlignerView
        ? alignerConfig
        : cloudCalibration.cerfa_15776_02.config;
      await generateCerfa15776FromFormData(formData, action, activeConfig, {
        customOffsets: cloudCalibration.cerfa_15776_02.offsets,
        sellerSignatureDataUrl: latestGarageSettings.signatureDataUrl,
      });
      setGeneratedSuccess(true);
    } catch (err) {
      setGenerationError(
        err instanceof Error
          ? err.message
          : L(
              'Erreur lors de la génération du formulaire Cerfa 15776*02.',
              'Ошибка при создании формы Cerfa 15776*02.',
              'Cerfa 15776*02 ձևաթղթի ձևավորման սխալ։',
              'Cerfa 15776*02 ფორმის გენერირების შეცდომა.'
            )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAlignerCalibration = async (nextCfg: Cerfa15776Config) => {
    setIsSavingCalibration(true);
    setAlignerSaveNotice(null);
    try {
      const current = getCerfaTemplatesCalibration();
      await saveCerfaTemplatesCalibration(
        {
          ...current,
          cerfa_15776_02: {
            ...current.cerfa_15776_02,
            config: nextCfg,
          },
        },
        userId
      );
      setIsAlignerDirty(false);
      setAlignerSaveNotice(
        L(
          'Calibration Cerfa enregistrée dans le cloud',
          'Калибровка полей Cerfa сохранена в облаке',
          'Cerfa դաշտերի կարգավորումը պահպանվեց ամպում',
          'Cerfa ველების კალიბრაცია შენახულია ღრუბელში'
        )
      );
      setTimeout(() => setAlignerSaveNotice(null), 3500);
    } catch (err) {
      setGenerationError(
        err instanceof Error
          ? err.message
          : L(
              'Impossible d’enregistrer la calibration Cerfa dans le cloud.',
              'Не удалось сохранить калибровку Cerfa в облаке.',
              'Հնարավոր չեղավ պահպանել Cerfa կարգավորումը ամպում։',
              'Cerfa კალიბრაციის ღრუბელში შენახვა ვერ მოხერხდა.'
            )
      );
    } finally {
      setIsSavingCalibration(false);
    }
  };

  const steps = [
    {
      id: 1 as const,
      label: pickLocalized(lang, {
        fr: '1. Le Véhicule',
        ru: '1. Автомобиль',
        hy: '1. Ավտոմեքենա',
        ka: '1. ავტომობილი',
      }),
      icon: Car,
    },
    {
      id: 2 as const,
      label: pickLocalized(lang, {
        fr: '2. Ancien Propriétaire',
        ru: '2. Продавец',
        hy: '2. Վաճառող',
        ka: '2. გამყიდველი',
      }),
      icon: Building2,
    },
    {
      id: 3 as const,
      label: pickLocalized(lang, {
        fr: '3. Nouveau Propriétaire',
        ru: '3. Покупатель',
        hy: '3. Գնորդ',
        ka: '3. მყიდველი',
      }),
      icon: UserCheck,
    },
  ];

  const inputClass =
    'w-full bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition';
  const inputErrorClass =
    'w-full bg-[var(--background)] border border-red-500 ring-2 ring-red-500/20 rounded-[var(--ag-button-radius)] px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-red-500 transition';
  const getInputClass = (hasErr: boolean, extraClass = '') =>
    `${hasErr ? inputErrorClass : inputClass}${extraClass ? ` ${extraClass}` : ''}`;
  const labelClass = 'block text-xs font-semibold text-[var(--secondary-foreground)] mb-1.5';

  const alertsBlock = (
    <>
      {Object.keys(errors).length > 0 && (
        <div
          role="alert"
          data-testid="cerfa-validation-alert"
          className="bg-red-500/10 border border-red-500/40 rounded-xl p-3.5 text-xs text-red-400 flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              {formatCerfaMissingToast(Object.values(errors), lang)}
            </p>
          </div>
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
            {pickLocalized(lang, {
              fr: 'Le formulaire officiel Cerfa N° 15776*02 a été généré avec succès (signatures laissées vierges).',
              ru: 'Официальный бланк Cerfa N° 15776*02 сформирован (поля подписей оставлены пустыми).',
              hy: 'Պաշտոնական Cerfa N° 15776*02 ձևաթուղթը ձևավորվեց (ստորագրության դաշտերը դատարկ են)։',
              ka: 'ოფიციალური ფორმა Cerfa N° 15776*02 შექმნილია (ხელმოწერის ველები ცარიელია).',
            })}
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
          {Object.keys(errors).length === 0 &&
            (!formData.vehicle.firstRegistrationDate.trim() ||
              !formData.vehicle.commercialDesignation.trim() ||
              typeof formData.vehicle.hasRegistrationCertificate !== 'boolean' ||
              (formData.vehicle.hasRegistrationCertificate === true &&
                !formData.vehicle.formulaNumber.trim() &&
                !formData.vehicle.certificateDate.trim()) ||
              (formData.vehicle.hasRegistrationCertificate === false &&
                !formData.vehicle.absenceReason.trim()) ||
              !formData.vehicle.vin.trim()) && (
            <div
              data-testid="cerfa-step1-missing-hint"
              className="px-3.5 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-300 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {pickLocalized(lang, {
                  fr: 'Certains champs requis pour le Cerfa 15776*02 ((B), (D.3), VIN ou présence du certificat) ne sont pas encore renseignés. Veuillez les compléter ci-dessous.',
                  ru: 'Для формирования Cerfa 15776*02 заполните недостающие поля автомобиля ((B), (D.3), VIN или наличие СТС) ниже.',
                  hy: 'Cerfa 15776*02-ի ձևավորման համար լրացրեք ավտոմեքենայի պակասող դաշտերը ((B), (D.3), VIN կամ վկայականի առկայություն)։',
                  ka: 'Cerfa 15776*02-ის შესადგენად შეავსეთ ავტომობილის ნაკლული ველები ((B), (D.3), VIN ან მოწმობის არსებობა).',
                })}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cerfa-reg" className={labelClass}>
                {L(
                  "(A) N° d'immatriculation *",
                  '(A) Госномер *',
                  '(A) Պետհամարանիշ *',
                  '(A) სახელმწიფო ნომერი *'
                )}
              </label>
              <input
                id="cerfa-reg"
                type="text"
                required
                placeholder="AB-123-CD"
                value={formData.vehicle.registrationNumber}
                onChange={(e) =>
                  updateVehicleField('registrationNumber', e.target.value.toUpperCase())
                }
                className={getInputClass(Boolean(errors.registrationNumber))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-vin" className={labelClass}>
                {L(
                  "(E) Numéro d'identification (VIN) *",
                  '(E) VIN номер *',
                  '(E) VIN համար *',
                  '(E) VIN კოდი *'
                )}
              </label>
              <input
                id="cerfa-vin"
                type="text"
                required
                value={formData.vehicle.vin}
                onChange={(e) => updateVehicleField('vin', e.target.value.toUpperCase())}
                className={getInputClass(Boolean(errors.vin))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-first-reg" className={labelClass}>
                {L(
                  '(B) 1re immatriculation *',
                  '(B) 1-я регистрация *',
                  '(B) Առաջին գրանցում *',
                  '(B) პირველი რეგისტრაცია *'
                )}
              </label>
              <input
                id="cerfa-first-reg"
                type="date"
                required
                value={formData.vehicle.firstRegistrationDate}
                onChange={(e) => updateVehicleField('firstRegistrationDate', e.target.value)}
                className={getInputClass(Boolean(errors.firstRegistrationDate))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-make" className={labelClass}>
                {L('(D.1) Marque *', '(D.1) Марка *', '(D.1) Մակնիշ *', '(D.1) მარკა *')}
              </label>
              <input
                id="cerfa-make"
                type="text"
                required
                value={formData.vehicle.make}
                onChange={(e) => updateVehicleField('make', e.target.value.toUpperCase())}
                className={getInputClass(Boolean(errors.make))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-d2" className={labelClass}>
                {L(
                  '(D.2) Type, variante, version',
                  '(D.2) Тип, вариант, версия',
                  '(D.2) Տիպ, տարբերակ',
                  '(D.2) ტიპი, ვარიანტი, ვერსია'
                )}
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
                {L(
                  '(J.1) Genre national',
                  '(J.1) Категория ТС',
                  '(J.1) Տրանսպորտային միջոցի տեսակ',
                  '(J.1) ტრანსპორტის კატეგორია'
                )}
              </label>
              <ThemedSelect
                id="cerfa-j1"
                testId="cerfa-j1-select"
                ariaLabel={L(
                  '(J.1) Genre national',
                  '(J.1) Категория ТС',
                  '(J.1) Տրանսպորտային միջոցի տեսակ',
                  '(J.1) ტრანსპორტის კატეგორია'
                )}
                value={formData.vehicle.nationalGenre}
                onChange={(val) => updateVehicleField('nationalGenre', val)}
                options={[
                  {
                    value: 'VP',
                    label: L(
                      'VP (Voiture particulière)',
                      'VP (Легковой авто)',
                      'VP (Մարդատար ավտո)',
                      'VP (მსუბუქი ავტო)'
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
                      'MTT1 / MTT2 (მოტოციკლი)'
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
              <label htmlFor="cerfa-d3" className={labelClass}>
                {L(
                  '(D.3) Dénomination commerciale *',
                  '(D.3) Модель / Коммерч. назв. *',
                  '(D.3) Առևտրային անվանում *',
                  '(D.3) კომერციული დასახელება *'
                )}
              </label>
              <input
                id="cerfa-d3"
                type="text"
                required
                value={formData.vehicle.commercialDesignation}
                onChange={(e) =>
                  updateVehicleField('commercialDesignation', e.target.value.toUpperCase())
                }
                className={getInputClass(Boolean(errors.commercialDesignation))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-mileage" className={labelClass}>
                {L(
                  'Kilométrage au compteur *',
                  'Пробег по одометру *',
                  'Վազքը (կմ) *',
                  'ოდომეტრის გარბენი *'
                )}
              </label>
              <input
                id="cerfa-mileage"
                type="number"
                required
                min={0}
                value={formData.vehicle.mileage}
                onChange={(e) =>
                  updateVehicleField(
                    'mileage',
                    e.target.value === '' ? '' : Number(e.target.value)
                  )
                }
                className={getInputClass(Boolean(errors.mileage))}
              />
            </div>
          </div>

          {/* Certificat d'immatriculation presence */}
          <div
            className={`bg-[var(--background)]/70 border rounded-2xl p-4 space-y-3 transition ${
              errors.hasRegistrationCertificate
                ? 'border-red-500 ring-2 ring-red-500/20'
                : 'border-[var(--border)]'
            }`}
          >
            <span className="block text-xs font-bold text-[var(--foreground)]">
              {L(
                "Présence du certificat d'immatriculation *",
                'Наличие техпаспорта / СТС (Carte Grise) *',
                'Գրանցման վկայականի (Carte Grise) առկայություն *',
                'სარეგისტრაციო მოწმობის (Carte Grise) არსებობა *'
              )}
            </span>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                data-testid="cerfa-cert-yes"
                onClick={() => updateVehicleField('hasRegistrationCertificate', true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  formData.vehicle.hasRegistrationCertificate === true
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                    : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)]'
                }`}
              >
                {L(
                  'Oui — Certificat présent',
                  'Да — СТС в наличии',
                  'Այո — Վկայականը առկա է',
                  'დიახ — მოწმობა არსებობს'
                )}
              </button>
              <button
                type="button"
                data-testid="cerfa-cert-no"
                onClick={() => updateVehicleField('hasRegistrationCertificate', false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  formData.vehicle.hasRegistrationCertificate === false
                    ? 'bg-amber-600/20 text-amber-400 border-amber-500/50'
                    : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)]'
                }`}
              >
                {L(
                  'Non — Absent',
                  'Нет — Отсутствует',
                  'Ոչ — Բացակայում է',
                  'არა — არ არის'
                )}
              </button>
            </div>

            {formData.vehicle.hasRegistrationCertificate === true && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="cerfa-formula" className={labelClass}>
                    {L(
                      'Numéro de formule (ex: 2019AB12345) *',
                      'Номер формулы СТС (напр. 2019AB12345) *',
                      'Ձևի համար (օր.՝ 2019AB12345) *',
                      'ფორმულის ნომერი (მაგ. 2019AB12345) *'
                    )}
                  </label>
                  <input
                    id="cerfa-formula"
                    type="text"
                    placeholder="20..."
                    value={formData.vehicle.formulaNumber}
                    onChange={(e) =>
                      updateVehicleField('formulaNumber', e.target.value.toUpperCase())
                    }
                    className={getInputClass(Boolean(errors.formulaOrCertificateDate))}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-cert-date" className={labelClass}>
                    {L(
                      'ou (I) Date du certificat (ancien format) *',
                      'или (I) Дата выдачи СТС (старый формат) *',
                      'կամ (I) Վկայականի ամսաթիվ (հին ձևաչափ) *',
                      'ან (I) მოწმობის თარიღი (ძველი ფორმატი) *'
                    )}
                  </label>
                  <input
                    id="cerfa-cert-date"
                    type="date"
                    value={formData.vehicle.certificateDate}
                    onChange={(e) => updateVehicleField('certificateDate', e.target.value)}
                    className={getInputClass(Boolean(errors.formulaOrCertificateDate))}
                  />
                </div>
              </div>
            )}

            {formData.vehicle.hasRegistrationCertificate === false && (
              <div className="pt-1">
                <label htmlFor="cerfa-absence-reason" className={labelClass}>
                  {L(
                    "Motif d'absence du certificat d'immatriculation *",
                    'Причина отсутствия СТС *',
                    'Վկայականի բացակայության պատճառը *',
                    'მოწმობის არქონის მიზეზი *'
                  )}
                </label>
                <input
                  id="cerfa-absence-reason"
                  type="text"
                  required
                  placeholder={L(
                    'Ex: Déclaration de perte jointe...',
                    'Напр.: Приложено заявление об утере...',
                    'Օր.՝ Կցված է կորստի հայտարարությունը...',
                    'მაგ.: თან ერთვის დაკარგვის განცხადება...'
                  )}
                  value={formData.vehicle.absenceReason}
                  onChange={(e) => updateVehicleField('absenceReason', e.target.value)}
                  className={getInputClass(Boolean(errors.absenceReason))}
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
              data-testid="cerfa-seller-type-micro"
              onClick={() => handleSelectSellerProfileType('micro_entrepreneur')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                formData.seller.entityType === 'morale'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
              }`}
            >
              {L(
                'Micro-entrepreneur',
                'Micro-entrepreneur (Бизнес)',
                'Micro-entrepreneur (Բիզնես)',
                'Micro-entrepreneur (ბიზნესი)'
              )}
            </button>
            <button
              type="button"
              data-testid="cerfa-seller-type-particulier"
              onClick={() => handleSelectSellerProfileType('particulier')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                formData.seller.entityType === 'physique'
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
              }`}
            >
              {L(
                'Particulier',
                'Particulier (Частное лицо)',
                'Particulier (Անհատ)',
                'Particulier (ფიზიკური პირი)'
              )}
            </button>

            {formData.seller.entityType === 'physique' && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-[var(--muted-foreground)]">
                  {L('Sexe :', 'Пол:', 'Սեռ՝', 'სქესი:')}
                </span>
                {(['M', 'F'] as const).map((sx) => (
                  <button
                    key={sx}
                    type="button"
                    data-testid={`cerfa-seller-sex-${sx}`}
                    onClick={() => updateSellerField('sex', sx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
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

          {activePick.vehicle.purchaseStatus && !calibrationDummyMode && (
            <div
              data-testid="cerfa-seller-bound-status"
              className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)]/60 text-[11px] text-[var(--muted-foreground)] flex items-center gap-2"
            >
              {activePick.vehicle.purchaseStatus === 'particulier' ? (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>
                    {pickLocalized(lang, {
                      fr: 'Profil lié au véhicule : 👤 Particulier (pré-rempli depuis le profil privé, sans SIRET)',
                      ru: 'Привязан статус авто: 👤 Particulier (личные данные из профиля частного лица, без SIRET)',
                      hy: 'Կցված է մեքենայի կարգավիճակը՝ 👤 Particulier (անհատական պրոֆիլից, առանց SIRET)',
                      ka: 'მიბმულია ავტოს სტატუსი: 👤 Particulier (ფიზიკური პირის პროფილიდან, SIRET-ის გარეშე)',
                    })}
                  </span>
                </>
              ) : (
                <>
                  <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    {pickLocalized(lang, {
                      fr: 'Profil lié au véhicule : 💼 Micro-entrepreneur (raison sociale et SIRET professionnels)',
                      ru: 'Привязан статус авто: 💼 Micro-entrepreneur (название бизнеса и SIRET из бизнес-профиля)',
                      hy: 'Կցված է մեքենայի կարգավիճակը՝ 💼 Micro-entrepreneur (բիզնես անվանում և SIRET)',
                      ka: 'მიბმულია ავტოს სტატუსი: 💼 Micro-entrepreneur (კომპანიის დასახელება და SIRET)',
                    })}
                  </span>
                </>
              )}
            </div>
          )}

          {(() => {
            const isPersonalEntity = formData.seller.entityType === 'physique';
            const savedProfiles = isPersonalEntity
              ? ensurePersonalProfiles(latestGarageSettings)
              : ensureBusinessProfiles(latestGarageSettings);
            if (savedProfiles.length === 0) return null;
            const currentMatchId = savedProfiles.some((item) => item.id === selectedSellerProfileId)
              ? selectedSellerProfileId
              : (savedProfiles.find((item) => item.isDefault) || savedProfiles[0])?.id || '';
            return (
              <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]/50 space-y-1.5">
                <label className="block text-[11px] font-semibold text-[var(--secondary-foreground)]">
                  {isPersonalEntity
                    ? L(
                        'Profil particulier enregistré (auto-remplissage)',
                        'Сохранённый личный профиль продавца (автозаполнение)',
                        'Պահպանված անհատական պրոֆիլ',
                        'შენახული პირადი პროფილი'
                      )
                    : L(
                        'Profil professionnel enregistré (auto-remplissage)',
                        'Сохранённый профиль компании (автозаполнение)',
                        'Պահպանված բիզնես պրոֆիլ',
                        'შენახული კომპანიის პროფილი'
                      )}
                </label>
                <ThemedSelect
                  testId="cerfa-saved-seller-select"
                  ariaLabel={L(
                    'Sélectionner un vendeur enregistré',
                    'Выбрать сохранённого продавца',
                    'Ընտրել պահպանված վաճառողին',
                    'აირჩიეთ შენახული გამყიდველი'
                  )}
                  value={currentMatchId}
                  onChange={handleSelectSavedSellerProfile}
                  options={savedProfiles.map((entry) => ({
                    value: entry.id,
                    label: `${getSellerProfileDisplayName(
                      entry,
                      isPersonalEntity ? 'particulier' : 'micro'
                    )}${entry.city ? ` — ${entry.city}` : ''}${
                      entry.isDefault ? L(' (par défaut)', ' (осн.)', ' (հիմն.)', ' (ძირ.)') : ''
                    }`,
                  }))}
                  triggerClassName="w-full h-9 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--foreground)]"
                />
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-seller-name" className={labelClass}>
                {formData.seller.entityType === 'morale'
                  ? L('Raison sociale *', 'Название компании *', 'Կազմակերպության անվանում *', 'კომპანიის დასახელება *')
                  : L('Nom et Prénom *', 'Фамилия и имя *', 'Ազգանուն, անուն *', 'სახელი და გვარი *')}
              </label>
              <input
                id="cerfa-seller-name"
                type="text"
                required
                value={formData.seller.nameOrCompany}
                onChange={(e) => updateSellerField('nameOrCompany', e.target.value)}
                placeholder={
                  formData.seller.entityType === 'morale'
                    ? L('ex. Mon Garage Auto', 'напр. Mon Garage Auto', 'օր.՝ Mon Garage Auto', 'მაგ. Mon Garage Auto')
                    : L('ex. MARTIN Jean', 'напр. MARTIN Jean', 'օր.՝ MARTIN Jean', 'მაგ. MARTIN Jean')
                }
                className={getInputClass(Boolean(errors.sellerName))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-siret" className={labelClass}>
                {L('N° SIRET', '№ SIRET', 'SIRET №', 'SIRET №')}{' '}
                {formData.seller.entityType === 'morale'
                  ? '*'
                  : L(
                      '(non applicable)',
                      '(нет для частного лица)',
                      '(անհատի համար չկա)',
                      '(ფიზ. პირისთვის არ არის)'
                    )}
              </label>
              <input
                id="cerfa-seller-siret"
                type="text"
                required={formData.seller.entityType === 'morale'}
                disabled={formData.seller.entityType === 'physique'}
                value={formData.seller.entityType === 'physique' ? '' : formData.seller.siret}
                onChange={(e) => updateSellerField('siret', e.target.value)}
                placeholder={
                  formData.seller.entityType === 'physique'
                    ? '—'
                    : L('ex. 12345678900012', 'напр. 12345678900012', 'օր.՝ 12345678900012', 'მაგ. 12345678900012')
                }
                className={getInputClass(
                  Boolean(errors.sellerSiret),
                  formData.seller.entityType === 'physique'
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="cerfa-seller-num" className={labelClass}>
                {L('N° de voie *', 'Номер дома *', 'Տան համար *', 'ქუჩის № *')}
              </label>
              <input
                id="cerfa-seller-num"
                type="text"
                required
                value={formData.seller.streetNumber}
                onChange={(e) => updateSellerField('streetNumber', e.target.value)}
                className={getInputClass(Boolean(errors.sellerStreetNumber))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-ext" className={labelClass}>
                {L('Extension (bis, ter)', 'Корпус / лит.', 'Կցորդ (bis, ter)', 'დამატ. (bis, ter)')}
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
                {L('Type de voie', 'Тип улицы', 'Փողոցի տիպ', 'ქუჩის ტიპი')}
              </label>
              <input
                id="cerfa-seller-type"
                type="text"
                placeholder={L('Rue, Avenue...', 'ул., пр-т...', 'փ., պող...', 'ქ., გამზ...')}
                value={formData.seller.streetType}
                onChange={(e) => updateSellerField('streetType', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-street" className={labelClass}>
                {L('Nom de la voie *', 'Улица *', 'Փողոց *', 'ქუჩა *')}
              </label>
              <input
                id="cerfa-seller-street"
                type="text"
                required
                value={formData.seller.streetName}
                onChange={(e) => updateSellerField('streetName', e.target.value)}
                className={getInputClass(Boolean(errors.sellerStreetName))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-seller-zip" className={labelClass}>
                {L('Code postal *', 'Почтовый индекс *', 'Փոստային ինդեքս *', 'საფოსტო ინდექსი *')}
              </label>
              <input
                id="cerfa-seller-zip"
                type="text"
                required
                value={formData.seller.postalCode}
                onChange={(e) => updateSellerField('postalCode', e.target.value)}
                className={getInputClass(Boolean(errors.sellerCity))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-city" className={labelClass}>
                {L('Commune *', 'Город / Коммуна *', 'Քաղաք *', 'ქალაქი *')}
              </label>
              <input
                id="cerfa-seller-city"
                type="text"
                required
                value={formData.seller.city}
                onChange={(e) => updateSellerField('city', e.target.value)}
                className={getInputClass(Boolean(errors.sellerCity))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="cerfa-sale-date" className={labelClass}>
                {L('Cédé le *', 'Дата продажи *', 'Վաճառքի ամսաթիվ *', 'გაყიდვის თარიღი *')}
              </label>
              <input
                id="cerfa-sale-date"
                type="date"
                required
                value={formData.seller.saleDate}
                onChange={(e) => updateSellerField('saleDate', e.target.value)}
                className={getInputClass(Boolean(errors.saleDate))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-sale-time" className={labelClass}>
                {L('à (heure)', 'Время продажи', 'Ժամը', 'დრო')}
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
                {L('Fait à (Commune) *', 'Место (Fait à) *', 'Կազմվել է (Fait à) *', 'ადგილი (Fait à) *')}
              </label>
              <input
                id="cerfa-seller-fait-a"
                type="text"
                required
                value={formData.seller.signingCity}
                onChange={(e) => updateSellerField('signingCity', e.target.value)}
                className={getInputClass(Boolean(errors.sellerSigningCity))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-seller-fait-le" className={labelClass}>
                {L('Le (Date signature)', 'Дата подписи (Le)', 'Ստորագրման ամսաթիվ', 'ხელმოწერის თარიღი')}
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
                {L(
                  'Avoir remis au nouveau propriétaire un certificat de situation administrative de moins de 15 jours',
                  'Подтверждаю передачу новому владельцу справки о статусе авто (Certificat de non-gage) не старше 15 дней',
                  'Հաստատում եմ, որ նոր սեփականատիրոջը հանձնվել է վարչական կարգավիճակի տեղեկանք (15 օրից ոչ հին)',
                  'ვადასტურებ ახალ მფლობელზე ადმინისტრაციული სტატუსის ცნობის (< 15 დღე) გადაცემას'
                )}
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
                {L(
                  "Que ce véhicule n'a pas subi de transformation notable susceptible de modifier ses indications",
                  'Автомобиль не подвергался существенным конструктивным изменениям, меняющим данные ПТС/СТС',
                  'Ավտոմեքենան չի ենթարկվել էական փոփոխությունների, որոնք փոխում են գրանցման տվյալները',
                  'ავტომობილს არ განუცდია მნიშვნელოვანი კონსტრუქციული ცვლილებები'
                )}
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
                {L(
                  "Je m'oppose à la réutilisation de mes données personnelles à des fins de prospection commerciale",
                  'Запрещаю использование моих персональных данных в целях коммерческого маркетинга',
                  'Արգելում եմ իմ անձնական տվյալների օգտագործումը առևտրային մարքեթինգի նպատակով',
                  'ვეწინააღმდეგები ჩემი პერსონალური მონაცემების კომერციულ მარკეტინგში გამოყენებას'
                )}
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
              {L(
                'Personne physique',
                'Физическое лицо',
                'Ֆիզիկական անձ',
                'ფიზიკური პირი'
              )}
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
              {L(
                'Personne morale (Société)',
                'Юридическое лицо (Компания)',
                'Իրավաբանական անձ (Ընկերություն)',
                'იურიდიული პირი (კომპანია)'
              )}
            </button>

            {formData.buyer.entityType === 'physique' && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-[var(--muted-foreground)]">
                  {L('Sexe :', 'Пол:', 'Սեռ՝', 'სქესი:')}
                </span>
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
                  ? L('Raison sociale *', 'Название компании *', 'Կազմակերպության անվանում *', 'კომპანიის დასახელება *')
                  : L('NOM et PRÉNOM *', 'ФИО *', 'ԱՆՈՒՆ, ԱԶԳԱՆՈՒՆ *', 'სახელი და გვარი *')}
              </label>
              <input
                id="cerfa-buyer-name"
                type="text"
                required
                value={formData.buyer.nameOrCompany}
                onChange={(e) => updateBuyerField('nameOrCompany', e.target.value)}
                className={getInputClass(Boolean(errors.buyerName))}
              />
            </div>
            {formData.buyer.entityType === 'morale' ? (
              <div>
                <label htmlFor="cerfa-buyer-siret" className={labelClass}>
                  {L('N° SIRET', '№ SIRET', 'SIRET №', 'SIRET №')}
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
                    {L('Né(e) le *', 'Дата рождения *', 'Ծննդյան ամսաթիվ *', 'დაბადების თარიღი *')}
                  </label>
                  <input
                    id="cerfa-buyer-birth-date"
                    type="date"
                    required
                    value={formData.buyer.birthDate}
                    onChange={(e) => updateBuyerField('birthDate', e.target.value)}
                    className={getInputClass(Boolean(errors.buyerBirthDate))}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-buyer-birth-place" className={labelClass}>
                    {L('À (Lieu de naissance)', 'Место рождения', 'Ծննդավայր', 'დაბადების ადგილი')}
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
                {L('N° de voie *', 'Номер дома *', 'Տան համար *', 'ქუჩის № *')}
              </label>
              <input
                id="cerfa-buyer-num"
                type="text"
                required
                value={formData.buyer.streetNumber}
                onChange={(e) => updateBuyerField('streetNumber', e.target.value)}
                className={getInputClass(Boolean(errors.buyerStreetNumber))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-buyer-ext" className={labelClass}>
                {L('Extension', 'Корпус', 'Կցորդ', 'დამატ.')}
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
                {L('Type de voie', 'Тип улицы', 'Փողոցի տիպ', 'ქუჩის ტიპი')}
              </label>
              <input
                id="cerfa-buyer-type"
                type="text"
                placeholder={L('Rue, Square...', 'ул., пер...', 'փ., նրբ...', 'ქ., შეს...')}
                value={formData.buyer.streetType}
                onChange={(e) => updateBuyerField('streetType', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cerfa-buyer-street" className={labelClass}>
                {L('Nom de la voie *', 'Улица *', 'Փողոց *', 'ქუჩა *')}
              </label>
              <input
                id="cerfa-buyer-street"
                type="text"
                required
                value={formData.buyer.streetName}
                onChange={(e) => updateBuyerField('streetName', e.target.value)}
                className={getInputClass(Boolean(errors.buyerStreetName))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-buyer-zip" className={labelClass}>
                {L('Code postal *', 'Почтовый индекс *', 'Փոստային ինդեքս *', 'საფოსტო ინდექსი *')}
              </label>
              <input
                id="cerfa-buyer-zip"
                type="text"
                required
                value={formData.buyer.postalCode}
                onChange={(e) => updateBuyerField('postalCode', e.target.value)}
                className={getInputClass(Boolean(errors.buyerCity))}
              />
            </div>
            <div>
              <label htmlFor="cerfa-buyer-city" className={labelClass}>
                {L('Commune *', 'Город / Коммуна *', 'Քաղաք *', 'ქალაქი *')}
              </label>
              <input
                id="cerfa-buyer-city"
                type="text"
                required
                value={formData.buyer.city}
                onChange={(e) => updateBuyerField('city', e.target.value)}
                className={getInputClass(Boolean(errors.buyerCity))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cerfa-buyer-fait-a" className={labelClass}>
                {L('Fait à (Commune)', 'Место (Fait à)', 'Կազմվել է (Fait à)', 'ადგილი (Fait à)')}
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
                {L('Le (Date)', 'Дата подписи (Le)', 'Ամսաթիվ', 'თარიღი')}
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
                {L(
                  "Acquérir le véhicule désigné ci-dessus aux dates et heures indiquées par l'ancien propriétaire",
                  'Подтверждаю приобретение указанного ТС в дату и время, указанные прежним владельцем',
                  'Հաստատում եմ վերը նշված ավտոմեքենայի ձեռքբերումը նախկին սեփականատիրոջ նշած ամսաթվով և ժամով',
                  'ვადასტურებ ზემოაღნიშნული ავტომობილის შეძენას წინა მფლობელის მიერ მითითებულ თარიღსა და დროს'
                )}
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.buyer.certifyInformedAdmin}
                onChange={(e) => updateBuyerField('certifyInformedAdmin', e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--card)] text-blue-500"
              />
              <span>
                {L(
                  'Avoir été informé de la situation administrative du véhicule',
                  'Ознакомлен с административным статусом автомобиля (Certificat de non-gage)',
                  'Տեղեկացված եմ ավտոմեքենայի վարչական կարգավիճակի մասին',
                  'ინფორმირებული ვარ ავტომობილის ადმინისტრაციული სტატუსის შესახებ'
                )}
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-[var(--border)]">
              <input
                type="checkbox"
                checked={formData.buyer.opposeProspecting}
                onChange={(e) => updateBuyerField('opposeProspecting', e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--card)] text-blue-500"
              />
              <span>
                {L(
                  "Je m'oppose à la réutilisation de mes données personnelles à des fins de prospection commerciale",
                  'Запрещаю использование моих персональных данных в целях коммерческого маркетинга',
                  'Արգելում եմ իմ անձնական տվյալների օգտագործումը առևտրային մարքեթինգի նպատակով',
                  'ვეწინააღმდეგები ჩემი პერსონალური მონაცემების კომერციულ მარკეტინგში გამოყენებას'
                )}
              </span>
            </label>
          </div>
        </div>
      )}
    </>
  );

  // Full In-Page Workspace Layout (Sidebar Mode)
  if (isPage) {
    return (
      <div data-testid="documents-page-view" className="space-y-4">
        {/* Page Header + Template & Vehicle Pre-fill Controls + Save/Export Bar */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {onClose && (
                <button
                  type="button"
                  data-testid="documents-back-to-archive-btn"
                  onClick={onClose}
                  title={pickLocalized(lang, {
                    fr: 'Retour aux documents',
                    ru: 'Назад к архиву документов',
                    hy: 'Վերադառնալ փաստաթղթերին',
                    ka: 'დოკუმენტებთან დაბრუნება',
                  })}
                  className="w-9 h-9 rounded-xl bg-[var(--surface-muted)] hover:opacity-90 border border-[var(--border)] text-[var(--foreground)] flex items-center justify-center shrink-0 transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                <FileCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[var(--foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Documents & Cerfa N° 15776*02',
                    ru: 'Документы и Cerfa 15776*02',
                    hy: 'Փաստաթղթեր և Cerfa 15776*02',
                    ka: 'დოკუმენტები და Cerfa 15776*02',
                  })}
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Sélecteur de modèle, pré-remplissage véhicule et aperçu PDF calibré prêt à exporter',
                    ru: 'Выбор шаблона, автозаполнение по автомобилю и калиброванный PDF-предпросмотр для печати',
                    hy: 'Ձևանմուշի ընտրություն, ավտոլրացում և կալիբրացված PDF նախադիտում',
                    ka: 'შაბლონის არჩევა, ავტოშევსება და კალიბრირებული PDF გადახედვა',
                  })}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {allowCalibrationEditor && (
                <button
                  type="button"
                  data-testid="documents-aligner-toggle"
                  onClick={() => setIsAlignerMode((prev) => !prev)}
                  className={`px-3 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition flex items-center gap-1.5 ${
                    showAlignerView
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                      : 'bg-[var(--surface-muted)] hover:opacity-90 text-amber-400 border-[var(--border)]'
                  }`}
                >
                  <span>
                    🔧{' '}
                    {pickLocalized(lang, {
                      fr: 'Aligner Mode',
                      ru: 'Выравнивание (Aligner)',
                      hy: 'Հավասարեցում (Aligner)',
                      ka: 'გასწორება (Aligner)',
                    })}
                  </span>
                </button>
              )}

              {!showAlignerView && (
                <button
                  type="button"
                  data-testid="documents-edit-fields-toggle"
                  onClick={() => setShowFormEditor((prev) => !prev)}
                  className={`px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition flex items-center gap-1.5 ${
                    showFormEditor
                      ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                      : 'bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border-[var(--border)]'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>
                    {pickLocalized(lang, {
                      fr: 'Éditer les champs',
                      ru: 'Данные формы',
                      hy: 'Ձևի տվյալներ',
                      ka: 'ფორმის მონაცემები',
                    })}
                  </span>
                </button>
              )}

              <button
                type="button"
                data-testid="documents-save-btn"
                disabled={isSaving}
                onClick={handleSaveDocumentChanges}
                className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-emerald-400" />}
                <span>
                  {pickLocalized(lang, {
                    fr: 'Enregistrer',
                    ru: 'Сохранить',
                    hy: 'Պահպանել',
                    ka: 'შენახვა',
                  })}
                </span>
              </button>

              <button
                type="button"
                data-testid="documents-print-btn"
                disabled={isGenerating}
                onClick={() => handleGeneratePDF('print')}
                className="px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] disabled:opacity-50 transition flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>
                  {pickLocalized(lang, {
                    fr: 'Imprimer',
                    ru: 'Печать',
                    hy: 'Տպել',
                    ka: 'ბეჭდვა',
                  })}
                </span>
              </button>

              <button
                type="button"
                data-testid="documents-download-btn"
                disabled={isGenerating}
                onClick={() => handleGeneratePDF('download')}
                className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] hover:opacity-95 text-[var(--primary-foreground)] disabled:opacity-50 transition flex items-center gap-1.5 shadow-md"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>
                  {pickLocalized(lang, {
                    fr: 'Télécharger PDF [15776*02]',
                    ru: 'Скачать PDF [15776*02]',
                    hy: 'Ներբեռնել PDF [15776*02]',
                    ka: 'PDF ჩამოტვირთვა [15776*02]',
                  })}
                </span>
              </button>
            </div>
          </div>

          {/* Template Selector & Vehicle Pre-Fill Picker */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--border)]">
            <div>
              <label htmlFor="documents-template-select" className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>
                    {pickLocalized(lang, {
                      fr: 'Modèle de document',
                      ru: 'Шаблон документа',
                      hy: 'Փաստաթղթի ձևանմուշ',
                      ka: 'დოკუმენტის შაბლონი',
                    })}
                  </span>
                </span>
              </label>
              <ThemedSelect
                id="documents-template-select"
                testId="documents-template-select"
                ariaLabel={pickLocalized(lang, {
                  fr: 'Modèle de document',
                  ru: 'Шаблон документа',
                  hy: 'Փաստաթղթի ձևանմուշ',
                  ka: 'დოკუმენტის შაბლონი',
                })}
                value={selectedTemplateId}
                onChange={(val) => {
                  setSelectedTemplateId(normalizeCerfaTemplateId(val));
                  setSaveSuccess(null);
                }}
                options={CERFA_TEMPLATE_OPTIONS.map((tpl) => ({
                  value: tpl.id,
                  label: pickLocalized(lang, {
                    fr: tpl.labelFr,
                    ru: tpl.labelRu,
                    hy: tpl.labelHy,
                    ka: tpl.labelKa,
                  }),
                }))}
                triggerClassName={inputClass}
              />
            </div>

            {!calibrationDummyMode && (
              <div>
                <label htmlFor="documents-vehicle-select" className={labelClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span>
                      {canUseCerfaAutofill
                        ? pickLocalized(lang, {
                            fr: 'Véhicule à pré-remplir',
                            ru: 'Автомобиль для автозаполнения',
                            hy: 'Ավտոլրացման ավտոմեքենա',
                            ka: 'ავტოშევსების ავტომობილი',
                          })
                        : pickLocalized(lang, {
                            fr: 'Auto-remplissage (mode manuel actif)',
                            ru: 'Автозаполнение (только ручной ввод)',
                            hy: 'Ավտոլրացում (ձեռքով մուտքագրում)',
                            ka: 'ავტოშევსება (მხოლოდ ხელით)',
                          })}
                    </span>
                  </span>
                </label>
                {canUseCerfaAutofill ? (
                  <ThemedSelect
                    id="documents-vehicle-select"
                    testId="documents-vehicle-select"
                    ariaLabel={pickLocalized(lang, {
                      fr: 'Véhicule à pré-remplir',
                      ru: 'Автомобиль для автозаполнения',
                      hy: 'Ավտոլրացման ավտոմեքենա',
                      ka: 'ავტოშევსების ავტომობილი',
                    })}
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
                ) : (
                  <div
                    data-testid="documents-cerfa-autofill-locked"
                    className={`${inputClass} opacity-70 flex items-center text-[var(--muted-foreground)]`}
                  >
                    {pickLocalized(lang, {
                      fr: 'Auto-remplissage Cerfa 15776*02 désactivé sur ce forfait',
                      ru: 'Автозаполнение Cerfa 15776*02 недоступно на текущем тарифе',
                      hy: 'Cerfa 15776*02 ավտոլրացումն անջատված է ընթացիկ սակագնում',
                      ka: 'Cerfa 15776*02 ავტოშევსება გამორთულია მიმდინარე ტარიფზე',
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Body: Superadmin Aligner Mode OR Clean Full-Width Calibrated Live Preview */}
        {showAlignerView ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 shadow-lg">
            <CerfaAlignerPanel
              formData={formData}
              config={alignerConfig}
              onConfigChange={(next) => {
                setIsAlignerDirty(true);
                setAlignerConfig(next);
              }}
              onSaveCalibration={isSuperAdmin ? handleSaveAlignerCalibration : undefined}
              isSavingCalibration={isSavingCalibration}
              saveNotice={alignerSaveNotice}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {alertsBlock && <div className="w-full max-w-4xl mx-auto space-y-2">{alertsBlock}</div>}

            {showFormEditor && (
              <div
                data-testid="documents-form-editor"
                className="w-full max-w-4xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-hidden shadow-lg"
              >
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

                <div className="p-4 space-y-4">{formStepsContent}</div>

                <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--background)]/50 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    {step > 1 && (
                      <button
                        type="button"
                        onClick={handlePrev}
                        className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] transition flex items-center gap-1.5"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>
                          {pickLocalized(lang, {
                            fr: 'Précédent',
                            ru: 'Назад',
                            hy: 'Նախորդ',
                            ka: 'წინა',
                          })}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {step < 3 && (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="px-5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow"
                      >
                        <span>
                          {pickLocalized(lang, {
                            fr: 'Suivant',
                            ru: 'Далее',
                            hy: 'Հաջորդ',
                            ka: 'შემდეგი',
                          })}
                        </span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFormEditor(false)}
                      className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] transition"
                    >
                      {pickLocalized(lang, {
                        fr: 'Fermer',
                        ru: 'Свернуть',
                        hy: 'Փակել',
                        ka: 'დახურვა',
                      })}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Full Clean Width Calibrated Live Cerfa PDF Preview */}
            <div data-testid="documents-live-preview-wrapper" className="w-full max-w-4xl mx-auto">
              <CerfaLivePreviewSheet
                title={pickLocalized(lang, {
                  fr: 'Aperçu en direct Cerfa N° 15776*02',
                  ru: 'Живой предпросмотр Cerfa N° 15776*02',
                  hy: 'Ուղիղ նախադիտում Cerfa N° 15776*02',
                  ka: 'პირდაპირი გადახედვა Cerfa N° 15776*02',
                })}
                generatePdfBytes={generateLivePagePdfBytes}
                dependencyKey={livePagePreviewDependencyKey}
                testIdPrefix="documents-cerfa"
                heightClassName="min-h-[780px]"
                maxPageWidthClassName="max-w-[840px]"
              />
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
          showAlignerView ? 'max-w-6xl' : 'max-w-3xl'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 bg-[var(--background)]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cerfa-wizard-title" className="text-lg font-bold text-[var(--foreground)]">
                {L(
                  'Cerfa N° 15776*02 — Certificat de cession',
                  'Cerfa N° 15776*02 — Акт передачи ТС (Cession)',
                  'Cerfa N° 15776*02 — Փոխանցման վկայագիր (Cession)',
                  'Cerfa N° 15776*02 — გადაცემის სერტიფიკატი (Cession)'
                )}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {L(
                  'Remplissage officiel sur le modèle gouvernemental (Exemplaires 1 & 2)',
                  'Официальное заполнение государственного бланка (экземпляры 1 и 2)',
                  'Պաշտոնական ձևաթղթի լրացում (1-ին և 2-րդ օրինակներ)',
                  'ოფიციალური ბლანკის შევსება (1-ლი და მე-2 ეგზემპლარი)'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {allowCalibrationEditor && (
              <button
                type="button"
                onClick={() => setIsAlignerMode((prev) => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                  showAlignerView
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-[var(--surface-muted)] hover:opacity-90 text-amber-400 border-[var(--border)]'
                }`}
              >
                <span>
                  🔧{' '}
                  {L(
                    'Aligner Mode',
                    'Выравнивание (Aligner)',
                    'Հավասարեցում (Aligner)',
                    'გასწორება (Aligner)'
                  )}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={L(
                "Fermer l'assistant Cerfa 15776",
                'Закрыть мастер Cerfa 15776',
                'Փակել Cerfa 15776 օգնականը',
                'Cerfa 15776 ფანჯრის დახურვა'
              )}
              className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-[var(--surface-muted)] hover:opacity-90 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stepper (hidden in Aligner Mode) */}
        {!showAlignerView && (
          <div className="px-5 py-3 bg-[var(--background)]/40 border-b border-[var(--border)] grid grid-cols-3 gap-2">
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

        {/* Form Body or Aligner Mode (Superadmin only) */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {showAlignerView ? (
            <CerfaAlignerPanel
              formData={formData}
              config={alignerConfig}
              onConfigChange={(next) => {
                setIsAlignerDirty(true);
                setAlignerConfig(next);
              }}
              onSaveCalibration={isSuperAdmin ? handleSaveAlignerCalibration : undefined}
              isSavingCalibration={isSavingCalibration}
              saveNotice={alignerSaveNotice}
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
                <span>{L('Précédent', 'Назад', 'Նախորդ', 'წინა')}</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {step < 3 ? (
              <button
                type="button"
                data-testid="cerfa-wizard-next-btn"
                onClick={handleNext}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow"
              >
                <span>{L('Suivant', 'Далее', 'Հաջորդ', 'შემდეგი')}</span>
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
                  <span>{L('Imprimer', 'Печать', 'Տպել', 'ბეჭდვა')}</span>
                </button>
                <button
                  type="button"
                  data-testid="cerfa-wizard-download-btn"
                  disabled={isGenerating}
                  onClick={() => handleGeneratePDF('download')}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition flex items-center gap-2 shadow-lg"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>
                    {L(
                      'Télécharger le formulaire n° 15776*02 [PDF]',
                      'Скачать бланк Cerfa 15776*02 [PDF]',
                      'Ներբեռնել Cerfa 15776*02 ձևաթուղթը [PDF]',
                      'ჩამოტვირთეთ Cerfa 15776*02 ფორმა [PDF]'
                    )}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
