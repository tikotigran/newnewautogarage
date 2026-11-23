import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertCircle,
  Sparkles,
  Building2,
  Clock,
  Car,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { AppUserProfileType, Vehicle, BuyerInfo, GarageSettings } from '../types/garage';
import { formatEuro } from '../utils/finance';
import {
  buildProfileSettingsPatch,
  buildTransactionTaxSnapshot,
  FRENCH_TAX_DEFAULTS,
  resolveUserProfileType,
} from '../utils/frenchTaxEngine';
import { getGarageSettings } from '../services/garageService';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { SellerProfileSelector } from './SellerProfileSelector';
import { resolveSellerProfileForVehicle } from '../utils/profileSeparationUtils';
import {
  buildSaleWizardInitialState,
  formatCerfaMissingToast,
  resolveDefaultSellerProfileId,
  VIN_REGEX,
} from '../utils/vehicleFormUtils';

interface BuyerModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  garageSettings?: GarageSettings;
  profileType?: AppUserProfileType;
  onConfirmSale: (
    vehicleId: string,
    buyerInfo: BuyerInfo,
    vehicleUpdates?: Partial<Vehicle>
  ) => Promise<void>;
  onValidationToast?: (message: string) => void;
}

type SaleWizardStep = 1 | 2 | 3;

type BuyerFieldErrorKey =
  | 'vin'
  | 'mileage'
  | 'salePrice'
  | 'saleDate'
  | 'fullName'
  | 'streetNumber'
  | 'streetName'
  | 'postalCode'
  | 'city';

export const BuyerModal: React.FC<BuyerModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  garageSettings: propGarageSettings,
  profileType: propProfileType,
  onConfirmSale,
  onValidationToast,
}) => {
  const { t, lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const [localSettings, setLocalSettings] = useState<GarageSettings>(() =>
    getGarageSettings(vehicle?.garageId)
  );

  useEffect(() => {
    const sync = () => setLocalSettings(getGarageSettings(vehicle?.garageId));
    if (isOpen) sync();
    window.addEventListener('autogarage_settings_updated', sync);
    return () => window.removeEventListener('autogarage_settings_updated', sync);
  }, [isOpen, vehicle?.garageId]);

  const resolvedSettings = propGarageSettings || localSettings;

  const resolveInitialSellerProfile = (
    targetVehicle: Vehicle | null,
    settings: GarageSettings
  ): AppUserProfileType => {
    if (
      targetVehicle?.status === 'sold' &&
      (targetVehicle?.buyerInfo?.sellerProfileType === 'particulier' ||
        targetVehicle?.buyerInfo?.sellerProfileType === 'micro_entrepreneur')
    ) {
      return targetVehicle.buyerInfo.sellerProfileType;
    }
    if (targetVehicle?.purchaseStatus === 'particulier') {
      return 'particulier';
    }
    if (targetVehicle?.purchaseStatus === 'micro') {
      return 'micro_entrepreneur';
    }
    const snap = targetVehicle?.status === 'sold' ? targetVehicle?.buyerInfo?.taxSnapshot : undefined;
    if (snap?.isHistoricalSnapshot) {
      if (snap.taxRegime === 'none' || snap.legalStatus === 'particulier') {
        return 'particulier';
      }
      if (snap.taxRegime === 'micro' || snap.legalStatus === 'micro_entreprise') {
        return 'micro_entrepreneur';
      }
    }
    return propProfileType === 'particulier'
      ? 'particulier'
      : resolveUserProfileType(settings);
  };

  const initialWizard = buildSaleWizardInitialState(vehicle);

  const [step, setStep] = useState<SaleWizardStep>(1);
  const [sellerProfileType, setSellerProfileType] = useState<AppUserProfileType>(() =>
    resolveInitialSellerProfile(vehicle, resolvedSettings)
  );
  const [sellerProfileId, setSellerProfileId] = useState<string | undefined>(() => {
    const mode =
      resolveInitialSellerProfile(vehicle, resolvedSettings) === 'particulier'
        ? 'particulier'
        : 'micro';
    return (
      vehicle?.sellerProfileId ||
      vehicle?.buyerInfo?.sellerProfileId ||
      resolveDefaultSellerProfileId(mode, resolvedSettings)
    );
  });
  const isParticulierSeller = sellerProfileType === 'particulier';
  const effectiveSettings: GarageSettings = {
    ...resolvedSettings,
    ...buildProfileSettingsPatch(sellerProfileType, resolvedSettings),
  };

  // Step 1: Vehicle technical details
  const [registrationNumber, setRegistrationNumber] = useState(initialWizard.registrationNumber);
  const [vin, setVin] = useState(initialWizard.vin);
  const [mileage, setMileage] = useState<number | ''>(initialWizard.mileage);
  const [firstRegistrationDate, setFirstRegistrationDate] = useState(
    initialWizard.firstRegistrationDate
  );
  const [formulaNumber, setFormulaNumber] = useState(initialWizard.formulaNumber);

  // Step 2: Seller & deal date/time
  const [saleDate, setSaleDate] = useState(initialWizard.saleDate);
  const [saleTime, setSaleTime] = useState(initialWizard.saleTime);

  // Step 3: Buyer & final price (strictly blank for unsold vehicles)
  const [isCompany, setIsCompany] = useState(initialWizard.isCompany);
  const [fullName, setFullName] = useState(initialWizard.fullName);
  const [siret, setSiret] = useState(initialWizard.siret);
  const [birthDate, setBirthDate] = useState(initialWizard.birthDate);
  const [birthPlace, setBirthPlace] = useState(initialWizard.birthPlace);
  const [streetNumber, setStreetNumber] = useState(initialWizard.streetNumber);
  const [streetName, setStreetName] = useState(initialWizard.streetName);
  const [postalCode, setPostalCode] = useState(initialWizard.postalCode);
  const [city, setCity] = useState(initialWizard.city);
  const [phone, setPhone] = useState(initialWizard.phone);
  const [email, setEmail] = useState(initialWizard.email);
  const [salePrice, setSalePrice] = useState<number | ''>(initialWizard.salePrice);
  const [saleChannel, setSaleChannel] = useState(initialWizard.saleChannel);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BuyerFieldErrorKey, string>>>({});

  useEffect(() => {
    if (vehicle && isOpen) {
      const latestSettings = propGarageSettings || getGarageSettings(vehicle.garageId);
      const resetState = buildSaleWizardInitialState(vehicle);
      const nextSellerProfile = resolveInitialSellerProfile(vehicle, latestSettings);
      setStep(1);
      setSellerProfileType(nextSellerProfile);
      setSellerProfileId(
        vehicle.sellerProfileId ||
          vehicle.buyerInfo?.sellerProfileId ||
          resolveDefaultSellerProfileId(
            nextSellerProfile === 'particulier' ? 'particulier' : 'micro',
            latestSettings
          )
      );
      setRegistrationNumber(resetState.registrationNumber);
      setVin(resetState.vin);
      setMileage(resetState.mileage);
      setFirstRegistrationDate(resetState.firstRegistrationDate);
      setFormulaNumber(resetState.formulaNumber);
      setSaleDate(resetState.saleDate);
      setSaleTime(resetState.saleTime);
      setIsCompany(resetState.isCompany);
      setFullName(resetState.fullName);
      setSiret(resetState.siret);
      setBirthDate(resetState.birthDate);
      setBirthPlace(resetState.birthPlace);
      setStreetNumber(resetState.streetNumber);
      setStreetName(resetState.streetName);
      setPostalCode(resetState.postalCode);
      setCity(resetState.city);
      setPhone(resetState.phone);
      setEmail(resetState.email);
      setSalePrice(resetState.salePrice);
      setSaleChannel(resetState.saleChannel);
      setError(null);
      setFieldErrors({});
    }
    // Always reset to Step 1 when modal opens for a vehicle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id, vehicle?.status, isOpen]);

  if (!isOpen || !vehicle) return null;

  const numericSalePrice = Number(salePrice) || 0;
  const liveSnapshot = buildTransactionTaxSnapshot({
    salePrice: numericSalePrice,
    purchasePrice: vehicle.purchasePrice,
    repairCostTotal: vehicle.repairCostTotal || 0,
    generalExpensesTotal: vehicle.generalExpensesTotal || 0,
    settings: effectiveSettings,
    vatRegimeOverride: 'franchise_base',
    vatRateOverride: 0,
  });
  const computedTotalInvested =
    Math.round(
      ((Number(vehicle.purchasePrice) || 0) +
        (Number(vehicle.repairCostTotal) || 0) +
        (Number(vehicle.generalExpensesTotal) || 0) +
        Number.EPSILON) *
        100
    ) / 100;
  const projectedGrossMargin = liveSnapshot.profitBeforeTaxes;
  const projectedNetProfit = isParticulierSeller
    ? projectedGrossMargin
    : liveSnapshot.netProfitAfterTax;
  const projectedMargin = numericSalePrice > 0 ? (projectedNetProfit / numericSalePrice) * 100 : 0;

  const validateStep1 = (): boolean => {
    const cleanedVin = vin.replace(/\s+/g, '').toUpperCase();
    if (cleanedVin.length > 0 && !VIN_REGEX.test(cleanedVin)) {
      const msg = L(
        'Le VIN doit contenir exactement 17 caractères (hors I, O, Q).',
        'VIN должен содержать ровно 17 символов (без I, O, Q).',
        'VIN կոդը պետք է ունենա ուղիղ 17 նիշ (առանց I, O, Q)։',
        'VIN კოდი უნდა შეიცავდეს ზუსტად 17 სიმბოლოს (I, O, Q-ს გარეშე).'
      );
      setFieldErrors({ vin: msg });
      setError(msg);
      onValidationToast?.(msg);
      return false;
    }
    if (mileage !== '' && (Number.isNaN(Number(mileage)) || Number(mileage) < 0)) {
      const msg = L(
        'Le kilométrage doit être positif.',
        'Пробег не может быть отрицательным.',
        'Վազքը չի կարող բացասական լինել։',
        'გარბენი არ შეიძლება იყოს უარყოფითი.'
      );
      setFieldErrors({ mileage: msg });
      setError(msg);
      return false;
    }
    setError(null);
    setFieldErrors({});
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!saleDate.trim()) {
      const lbl = L('Date de cession', 'Дата продажи', 'Վաճառքի ամսաթիվ', 'გაყიდვის თარიღი');
      const msg = formatCerfaMissingToast([lbl], lang);
      setFieldErrors({ saleDate: lbl });
      setError(msg);
      onValidationToast?.(msg);
      return false;
    }
    setError(null);
    setFieldErrors({});
    return true;
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
    } else if (step === 2) {
      if (!validateStep2()) return;
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    setError(null);
    setFieldErrors({});
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      handleNextStep();
      return;
    }

    const nextFieldErrors: Partial<Record<BuyerFieldErrorKey, string>> = {};
    const missingLabels: string[] = [];

    if (salePrice === '' || Number.isNaN(Number(salePrice)) || Number(salePrice) <= 0) {
      const lbl = L('Prix de vente final', 'Итоговая цена продажи', 'Վաճառքի գին', 'საბოლოო ფასი');
      nextFieldErrors.salePrice = lbl;
      missingLabels.push(lbl);
    }
    if (!saleDate.trim()) {
      const lbl = L('Date de cession', 'Дата продажи', 'Վաճառքի ամսաթիվ', 'გაყიდვის თარიღი');
      nextFieldErrors.saleDate = lbl;
      missingLabels.push(lbl);
    }
    if (!fullName.trim()) {
      const lbl = isCompany
        ? L('Raison sociale', 'Название компании', 'Կազմակերպության անվանում', 'კომპანიის დასახელება')
        : L('Nom et Prénom', 'ФИО покупателя', 'Գնորդի անունը', 'მყიდველის სახელი');
      nextFieldErrors.fullName = lbl;
      missingLabels.push(lbl);
    }
    if (!streetNumber.trim()) {
      const lbl = L('N° de voie', 'Номер дома', 'Տան համար', 'ქუჩის ნომერი');
      nextFieldErrors.streetNumber = lbl;
      missingLabels.push(lbl);
    }
    if (!streetName.trim()) {
      const lbl = L('Nom de la voie', 'Улица', 'Փողոց', 'ქუჩის დასახელება');
      nextFieldErrors.streetName = lbl;
      missingLabels.push(lbl);
    }
    if (!postalCode.trim()) {
      const lbl = L('Code postal', 'Почтовый индекс', 'Փոստային ինդեքս', 'საფოსტო ინდექსი');
      nextFieldErrors.postalCode = lbl;
      missingLabels.push(lbl);
    }
    if (!city.trim()) {
      const lbl = L('Commune / Ville', 'Город', 'Քաղաք', 'ქალაქი');
      nextFieldErrors.city = lbl;
      missingLabels.push(lbl);
    }

    if (missingLabels.length > 0) {
      const toastMsg = formatCerfaMissingToast(missingLabels, lang);
      setFieldErrors(nextFieldErrors);
      setError(toastMsg);
      onValidationToast?.(toastMsg);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setFieldErrors({});

      const fullFormattedAddress = `${streetNumber ? streetNumber + ' ' : ''}${streetName.trim()}, ${postalCode.trim()} ${city.trim()}`;

      const existingSnapshot =
        vehicle.status === 'sold' ? vehicle.buyerInfo?.taxSnapshot : undefined;
      const existingSnapshotProfile: AppUserProfileType | null = existingSnapshot?.isHistoricalSnapshot
        ? existingSnapshot.taxRegime === 'none' || existingSnapshot.legalStatus === 'particulier'
          ? 'particulier'
          : 'micro_entrepreneur'
        : null;
      const shouldKeepExistingSnapshot =
        Boolean(existingSnapshot?.isHistoricalSnapshot) &&
        existingSnapshotProfile === sellerProfileType &&
        Number(existingSnapshot?.salePrice) === Number(salePrice);

      const frozenSnapshot =
        shouldKeepExistingSnapshot && existingSnapshot
          ? existingSnapshot
          : buildTransactionTaxSnapshot({
              salePrice: Number(salePrice),
              purchasePrice: vehicle.purchasePrice,
              repairCostTotal: vehicle.repairCostTotal || 0,
              generalExpensesTotal: vehicle.generalExpensesTotal || 0,
              settings: effectiveSettings,
              vatRegimeOverride: 'franchise_base',
              vatRateOverride: 0,
            });

      const buyerData: BuyerInfo = {
        isCompany,
        sellerProfileType,
        sellerProfileId,
        fullName: fullName.trim(),
        siret: siret.trim() || undefined,
        birthDate: isCompany ? undefined : birthDate || undefined,
        birthPlace: isCompany ? undefined : birthPlace.trim() || undefined,
        streetNumber: streetNumber.trim(),
        streetName: streetName.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
        address: fullFormattedAddress,
        phone: phone.trim() || L('Non renseigné', 'Не указано', 'Նշված չէ', 'მითითებული არ არის'),
        email: email.trim() || L('Non renseigné', 'Не указано', 'Նշված չէ', 'მითითებული არ არის'),
        salePrice: Number(salePrice),
        saleDate,
        saleTime,
        saleChannel: saleChannel || undefined,
        vatRegime: frozenSnapshot.vatRegime,
        vatRatePercent: frozenSnapshot.vatRatePercent,
        taxSnapshot: frozenSnapshot,
      };

      const cleanedReg = registrationNumber.trim().toUpperCase();
      const cleanedVin = vin.replace(/\s+/g, '').toUpperCase();
      const cleanedFormula = formulaNumber.replace(/\s+/g, '').toUpperCase();
      const vehicleUpdates: Partial<Vehicle> = {
        registrationNumber: cleanedReg,
        vin: cleanedVin,
        mileage: mileage === '' ? vehicle.mileage : Math.max(0, Number(mileage)),
        firstRegistrationDate: firstRegistrationDate.trim(),
        formulaNumber: cleanedFormula,
        purchaseStatus: isParticulierSeller ? 'particulier' : 'micro',
        sellerProfileId,
      };

      await onConfirmSale(vehicle.id, buyerData, vehicleUpdates);
      onClose();
    } catch (err: any) {
      setError(
        err?.message ||
          L(
            'Erreur lors de l’enregistrement de la vente.',
            'Ошибка при сохранении продажи.',
            'Վաճառքը պահպանելիս սխալ տեղի ունեցավ։',
            'გაყიდვის შენახვის შეცდომა.'
          )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepsMeta: { id: SaleWizardStep; label: string }[] = [
    {
      id: 1,
      label: L('Véhicule', 'Данные авто', 'Ավտոմեքենա', 'ავტომობილი'),
    },
    {
      id: 2,
      label: L('Vendeur', 'Данные продавца', 'Վաճառող', 'გამყიდველი'),
    },
    {
      id: 3,
      label: L('Acquéreur & Prix', 'Покупатель и цена', 'Գնորդ և գին', 'მყიდველი და ფასი'),
    },
  ];

  const resolvedSellerInfo = resolveSellerProfileForVehicle({
    garageSettings: resolvedSettings,
    overrideMode: isParticulierSeller ? 'particulier' : 'micro',
    overrideProfileId: sellerProfileId,
  });

  const sellerDisplayName =
    resolvedSellerInfo.displayName ||
    (isParticulierSeller
      ? L('Vendeur particulier', 'Частное лицо', 'Անհատ վաճառող', 'კერძო გამყიდველი')
      : L('Garage / Entreprise', 'Гараж / ИП', 'Ավտոսրահ / ԱՁ', 'გარაჟი / ი/მ'));

  const sellerAddressLine = [
    [
      resolvedSellerInfo.profile.streetNumber,
      resolvedSellerInfo.profile.streetType,
      resolvedSellerInfo.profile.streetName,
    ]
      .filter(Boolean)
      .join(' '),
    [resolvedSellerInfo.profile.postalCode, resolvedSellerInfo.profile.city]
      .filter(Boolean)
      .join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--ag-modal-bg)] border border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{t('closeSaleTitle')}</h2>
                <span
                  data-testid="sale-wizard-step-badge"
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 tabular-nums"
                >
                  {L(`Étape ${step}/3`, `Шаг ${step} из 3`, `Քայլ ${step}/3`, `ნაბიջი ${step}/3`)}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {vehicle.make} {vehicle.model} • {registrationNumber || vehicle.vin || '—'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('cancelBtn')}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Bar */}
        <div
          data-testid="sale-wizard-stepper"
          className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 grid grid-cols-3 gap-2"
        >
          {stepsMeta.map((s) => {
            const isActive = step === s.id;
            const isCompleted = step > s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`sale-wizard-step-${s.id}-tab`}
                onClick={() => {
                  if (s.id < step) {
                    setError(null);
                    setFieldErrors({});
                    setStep(s.id);
                  } else if (s.id === 2 && step === 1 && validateStep1()) {
                    setStep(2);
                  } else if (s.id === 3 && step === 2 && validateStep2()) {
                    setStep(3);
                  } else if (s.id === 3 && step === 1 && validateStep1() && validateStep2()) {
                    setStep(3);
                  }
                }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition ${
                  isActive
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : isCompleted
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950'
                      : isCompleted
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {s.id}
                </span>
                <span className="text-[11px] font-bold truncate">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div
              role="alert"
              data-testid="buyer-modal-validation-error"
              className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: VEHICLE TECHNICAL DATA */}
          {step === 1 && (
            <div data-testid="sale-wizard-step-1" className="space-y-3.5">
              <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Car className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    {L(
                      'Étape 1 : Vérification des données du véhicule',
                      'Шаг 1: Данные автомобиля (для ДКП и Cerfa)',
                      'Քայլ 1․ Ավտոմեքենայի տվյալներ',
                      'ნაბიჯი 1: ავტომობილის მონაცემები'
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {L('Immatriculation (A)', 'Госномер (A)', 'Պետհամարանիշ (A)', 'სახელმწიფო ნომერი (A)')}
                  </label>
                  <input
                    type="text"
                    data-testid="sale-step1-registration"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                    placeholder="AB-123-CD"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono uppercase text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {L('Kilométrage (km)', 'Пробег (км)', 'Վազք (կմ)', 'გარბენი (კმ)')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    data-testid="sale-step1-mileage"
                    value={mileage}
                    onChange={(e) => {
                      setMileage(e.target.value === '' ? '' : Number(e.target.value));
                      setFieldErrors((prev) => ({ ...prev, mileage: undefined }));
                    }}
                    placeholder="84500"
                    className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none ${
                      fieldErrors.mileage
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-slate-800 focus:border-amber-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  VIN (E)
                </label>
                <input
                  type="text"
                  maxLength={17}
                  data-testid="sale-step1-vin"
                  value={vin}
                  onChange={(e) => {
                    setVin(e.target.value.replace(/\s+/g, '').toUpperCase());
                    setFieldErrors((prev) => ({ ...prev, vin: undefined }));
                  }}
                  placeholder="VF3UPHNK0MT129841"
                  className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-sm font-mono uppercase text-white placeholder-slate-600 focus:outline-none ${
                    fieldErrors.vin
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-slate-800 focus:border-amber-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {L(
                      'Date de 1ère immatriculation (B)',
                      'Дата 1-й регистрации (B)',
                      'Առաջին գրանցման ամսաթիվ (B)',
                      'პირველი რეგისტრაციის თარიღი (B)'
                    )}
                  </label>
                  <input
                    type="date"
                    data-testid="sale-step1-first-reg-date"
                    value={firstRegistrationDate}
                    onChange={(e) => setFirstRegistrationDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {L(
                      'N° de formule (Carte Grise)',
                      'Номер формулы (N° de formule)',
                      'Ձևաթղթի համար (N° de formule)',
                      'ფორმულის ნომერი (N° de formule)'
                    )}
                  </label>
                  <input
                    type="text"
                    data-testid="sale-step1-formula-number"
                    value={formulaNumber}
                    onChange={(e) => setFormulaNumber(e.target.value.toUpperCase())}
                    placeholder="2021AB12345"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono uppercase text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: SELLER DETAILS & TIMING */}
          {step === 2 && (
            <div data-testid="sale-wizard-step-2" className="space-y-3.5">
              {/* Seller Profile Regime Selector */}
              <div
                data-testid="buyer-modal-seller-regime"
                className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    {L(
                      'Statut du vendeur pour cette transaction',
                      'Статус продавца для этой сделки',
                      'Վաճառողի կարգավիճակը այս գործարքի համար',
                      'გამყიდველის სტატუსი ამ გარიგებისთვის'
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {isParticulierSeller
                      ? L(
                          'Vente privée (0 € taxes)',
                          'Частная продажа (0 € налогов)',
                          'Մասնավոր վաճառք (0 € հարկ)',
                          'კერძო გაყიდვა (0 € გადასახადი)'
                        )
                      : L(
                          'Fiscalité Micro-entrepreneur appliquée',
                          'Применяются налоги Micro-entrepreneur',
                          'Կիրառվում են Micro-entrepreneur հարկեր',
                          'მოქმედებს Micro-entrepreneur გადასახადები'
                        )}
                  </span>
                </div>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="group"
                  aria-label={L('Statut du vendeur', 'Статус продавца', 'Վաճառողի կարգավիճակ', 'გამყიდველის სტატუსი')}
                >
                  <button
                    type="button"
                    data-testid="buyer-modal-seller-micro"
                    aria-pressed={sellerProfileType === 'micro_entrepreneur'}
                    onClick={() => {
                      setSellerProfileType('micro_entrepreneur');
                      setSellerProfileId(resolveDefaultSellerProfileId('micro', resolvedSettings));
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition ${
                      sellerProfileType === 'micro_entrepreneur'
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 shadow-sm'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <Building2
                      className={`w-4 h-4 shrink-0 ${
                        sellerProfileType === 'micro_entrepreneur' ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">Micro-entrepreneur</div>
                      <div className="text-[10px] opacity-75 truncate">
                        {L('URSSAF + VL sur CA', 'URSSAF + VL с оборота', 'URSSAF + VL շրջանառությունից', 'URSSAF + VL ბრუნვიდან')}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="buyer-modal-seller-particulier"
                    aria-pressed={sellerProfileType === 'particulier'}
                    onClick={() => {
                      setSellerProfileType('particulier');
                      setSellerProfileId(resolveDefaultSellerProfileId('particulier', resolvedSettings));
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition ${
                      sellerProfileType === 'particulier'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200 shadow-sm'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <User
                      className={`w-4 h-4 shrink-0 ${
                        sellerProfileType === 'particulier' ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">Particulier</div>
                      <div className="text-[10px] opacity-75 truncate">
                        {L('0 € taxes · Vente privée', '0 € налогов · Физлицо', '0 € հարկ · Անհատ', '0 € გადასახადი · კერძო')}
                      </div>
                    </div>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <SellerProfileSelector
                    compact
                    purchaseStatus={isParticulierSeller ? 'particulier' : 'micro'}
                    selectedProfileId={sellerProfileId}
                    garageSettings={resolvedSettings}
                    userId={vehicle.userId}
                    garageId={vehicle.garageId}
                    onSelectProfileId={setSellerProfileId}
                    onSettingsUpdated={setLocalSettings}
                    testIdPrefix="buyer-modal-seller-profile"
                  />
                </div>
              </div>

              {/* Garage / Seller Credentials Recap from Settings */}
              <div
                data-testid="sale-step2-seller-recap"
                className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold uppercase tracking-wider text-amber-400 text-[11px]">
                    {L(
                      'Coordonnées du vendeur (depuis les paramètres)',
                      'Реквизиты продавца (из настроек гаража / ИП)',
                      'Վաճառողի տվյալներ (կարգավորումներից)',
                      'გამყიდველის რეკვიზიტები (პარამეტრებიდან)'
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-300">
                  <div>
                    <span className="text-[10px] text-slate-500 block">
                      {L('Nom / Raison sociale', 'Продавец / Гараж', 'Անվանում', 'დასახელება')}
                    </span>
                    <span className="font-semibold text-white">{sellerDisplayName}</span>
                  </div>
                  {!isParticulierSeller && (
                    <div>
                      <span className="text-[10px] text-slate-500 block">SIRET</span>
                      <span className="font-mono text-white">
                        {resolvedSellerInfo.profile.siret || L('Non renseigné', 'Не указан', 'Նշված չէ', 'არ არის მითითებული')}
                      </span>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <span className="text-[10px] text-slate-500 block">
                      {L('Adresse', 'Адрес', 'Հասցե', 'მისამართი')}
                    </span>
                    <span>
                      {sellerAddressLine || L('À compléter dans les paramètres', 'Укажите в настройках гаража', 'Լրացրեք կարգավորումներում', 'შეავსეთ პარამეტრებში')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">{t('phone')}</span>
                    <span>{resolvedSellerInfo.profile.phone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">{t('email')}</span>
                    <span className="truncate block">{resolvedSellerInfo.profile.email || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Sale Date & Sale Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {t('saleDateLabel')}
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="date"
                      required
                      data-testid="buyer-sale-date"
                      value={saleDate}
                      onChange={(e) => {
                        setSaleDate(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, saleDate: undefined }));
                      }}
                      className={`w-full pl-9 pr-3 py-2 bg-slate-950 border rounded-xl text-xs text-white focus:outline-none ${
                        fieldErrors.saleDate
                          ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-500'
                          : 'border-slate-800 focus:border-amber-500'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {t('saleTimeLabel')}
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="time"
                      required
                      value={saleTime}
                      onChange={(e) => setSaleTime(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: BUYER & FINAL PRICE */}
          {step === 3 && (
            <div data-testid="sale-wizard-step-3" className="space-y-3.5">
              {/* Sale Price */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('finalSalePriceLabel')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    data-testid="buyer-sale-price"
                    value={salePrice}
                    onChange={(e) => {
                      setSalePrice(e.target.value === '' ? '' : Number(e.target.value));
                      setFieldErrors((prev) => ({ ...prev, salePrice: undefined }));
                    }}
                    className={`w-full pl-3 pr-8 py-2 bg-slate-950 border rounded-xl text-sm font-bold text-emerald-400 focus:outline-none ${
                      fieldErrors.salePrice
                        ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-500'
                        : 'border-slate-800 focus:border-amber-500'
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">
                    €
                  </span>
                </div>
              </div>

              {/* Real-time P&L & French Tax / VAT Outcome Preview Box */}
              <div
                data-testid="buyer-modal-tax-preview"
                className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-slate-400 block">{t('totalCapitalInvestedLabel')} :</span>
                    <span className="text-slate-200 font-bold text-sm tabular-nums">
                      {formatEuro(computedTotalInvested)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block">
                      {isParticulierSeller
                        ? L(
                            'Résultat financier',
                            'Финансовый результат',
                            'Ֆինանսական արդյունք',
                            'ფინანսური შედეგი'
                          )
                        : L(
                            'Marge brute (avant cotisations)',
                            'Валовая маржа (до взносов)',
                            'Համախառն մարժա (մինչև վճարները)',
                            'მთლიანი მარჟა (შენატანებამდე)'
                          )}
                    </span>
                    <span
                      data-testid="buyer-modal-gross-margin"
                      className={`text-base font-extrabold tabular-nums ${
                        (isParticulierSeller ? projectedNetProfit : projectedGrossMargin) >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {(isParticulierSeller ? projectedNetProfit : projectedGrossMargin) >= 0 ? '+' : ''}
                      {formatEuro(isParticulierSeller ? projectedNetProfit : projectedGrossMargin)}
                      {isParticulierSeller && (
                        <span className="text-xs ml-1 font-normal opacity-80">
                          ({projectedMargin.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {!isParticulierSeller && (
                  <div data-testid="buyer-modal-tax-breakdown" className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] tabular-nums">
                      <div className="bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 block">
                          {L(
                            'URSSAF / VL (sur CA)',
                            'Взносы URSSAF / VL (на оборот)',
                            'URSSAF / VL (շրջանառությունից)',
                            'URSSAF / VL (ბრუნვიდან)'
                          )}
                        </span>
                        <span data-testid="buyer-modal-urssaf-vl" className="text-amber-300 font-bold">
                          {formatEuro(liveSnapshot.urssafAmount)} URSSAF
                          {liveSnapshot.versementLiberatoireEnabled
                            ? ` + ${formatEuro(liveSnapshot.versementLiberatoireAmount)} VL`
                            : ` (${L('IR sép.', 'IR отд.', 'IR առանձ.', 'IR ცალკე')} ${formatEuro(liveSnapshot.microBicEstimatedTax)})`}
                        </span>
                      </div>
                      <div className="bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 block">
                          {L(
                            'Net estimé après cotisations',
                            'Оценочный чистый результат',
                            'Գնահատված զուտ արդյունք',
                            'სავარაუდო წმინდა შედეგი'
                          )}
                        </span>
                        <span
                          data-testid="buyer-modal-net-profit"
                          className={`font-extrabold ${liveSnapshot.netProfitAfterTax >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {liveSnapshot.netProfitAfterTax >= 0 ? '+' : ''}
                          {formatEuro(liveSnapshot.netProfitAfterTax)}
                          <span className="text-[10px] ml-1 font-normal opacity-80">
                            ({projectedMargin.toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-300/80 flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 font-bold uppercase tracking-wider text-[9px]">
                        {t('taxEstimateBadge')}
                      </span>
                      <span>{t('taxEstimateDisclaimerShort')}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Section: Nouveau Propriétaire (Clean blank form for fresh sales) */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                    {L(
                      'Section Cerfa 15776 : Nouveau Propriétaire (Acquéreur)',
                      'Раздел Cerfa 15776: Покупатель (Acquéreur)',
                      'Բաժին Cerfa 15776. Գնորդ (Acquéreur)',
                      'სექცია Cerfa 15776: მყიდველი (Acquéreur)'
                    )}
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setIsCompany(false)}
                      className={`px-2.5 py-1 rounded-lg border transition ${
                        !isCompany
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {t('individualBuyer')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCompany(true)}
                      className={`px-2.5 py-1 rounded-lg border transition ${
                        isCompany
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {t('companyBuyer')}
                    </button>
                  </div>
                </div>

                {/* Buyer Name & SIRET / Birth */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isCompany
                        ? L(
                            'Raison Sociale de l’Entreprise *',
                            'Название компании (Raison sociale) *',
                            'Կազմակերպության անվանումը *',
                            'კომპანიის დასახელება *'
                          )
                        : t('buyerFullNameLabel')}
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        required
                        data-testid="buyer-full-name"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                        }}
                        placeholder={
                          isCompany
                            ? L(
                                'ex. Entreprise Transport Express',
                                'напр. SARL Auto Express',
                                'օր.՝ Transport Express SARL',
                                'მაგ. Transport Express SARL'
                              )
                            : t('buyerFullNamePlaceholder')
                        }
                        className={`w-full pl-9 pr-3 py-2 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none ${
                          fieldErrors.fullName
                            ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-500'
                            : 'border-slate-800 focus:border-amber-500'
                        }`}
                      />
                    </div>
                  </div>

                  {isCompany ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        {t('buyerSiretLabel')}
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          value={siret}
                          onChange={(e) => setSiret(e.target.value)}
                          placeholder={L(
                            'ex. 912 345 678 00019',
                            'напр. 912 345 678 00019',
                            'օր.՝ 912 345 678 00019',
                            'მაგ. 912 345 678 00019'
                          )}
                          className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          {t('buyerBirthDateLabel')}
                        </label>
                        <input
                          type="date"
                          data-testid="buyer-birth-date"
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          {t('buyerBirthPlaceLabel')}
                        </label>
                        <input
                          type="text"
                          data-testid="buyer-birth-place"
                          value={birthPlace}
                          onChange={(e) => setBirthPlace(e.target.value)}
                          placeholder={L('ex. Lyon (69)', 'напр. Lyon (69)', 'օր.՝ Lyon (69)', 'მაგ. Lyon (69)')}
                          className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Address fields */}
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="col-span-1">
                    <label htmlFor="buyer-street-number" className="block text-xs font-semibold text-slate-300 mb-1">
                      {L('N° de voie *', 'Номер дома *', 'Տան համար *', 'ქუჩის № *')}
                    </label>
                    <input
                      id="buyer-street-number"
                      data-testid="buyer-street-number"
                      type="text"
                      required
                      value={streetNumber}
                      onChange={(e) => {
                        setStreetNumber(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, streetNumber: undefined }));
                      }}
                      placeholder="14"
                      className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none ${
                        fieldErrors.streetNumber
                          ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-500'
                          : 'border-slate-800 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <div className="col-span-3">
                    <label htmlFor="buyer-street-name" className="block text-xs font-semibold text-slate-300 mb-1">
                      {L('Nom de la voie *', 'Улица *', 'Փողոցի անվանում *', 'ქუჩის დასახელება *')}
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        id="buyer-street-name"
                        data-testid="buyer-street-name"
                        type="text"
                        required
                        value={streetName}
                        onChange={(e) => {
                          setStreetName(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, streetName: undefined }));
                        }}
                        placeholder={L(
                          'ex. Rue des Lilas',
                          'напр. ул. Сиреневая',
                          'օր.՝ Աբովյան փողոց',
                          'მაგ. რუსთაველის გამზ.'
                        )}
                        className={`w-full pl-9 pr-3 py-2 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none ${
                          fieldErrors.streetName
                            ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-500'
                            : 'border-slate-800 focus:border-amber-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label htmlFor="buyer-postal-code" className="block text-xs font-semibold text-slate-300 mb-1">
                      {t('buyerPostalCodeLabel')}
                    </label>
                    <input
                      id="buyer-postal-code"
                      data-testid="buyer-postal-code"
                      type="text"
                      required
                      value={postalCode}
                      onChange={(e) => {
                        setPostalCode(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, postalCode: undefined }));
                      }}
                      placeholder="69003"
                      className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-sm font-mono text-white placeholder-slate-600 focus:outline-none ${
                        fieldErrors.postalCode
                          ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-500'
                          : 'border-slate-800 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label htmlFor="buyer-city" className="block text-xs font-semibold text-slate-300 mb-1">
                      {t('buyerCityLabel')}
                    </label>
                    <input
                      id="buyer-city"
                      data-testid="buyer-city"
                      type="text"
                      required
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, city: undefined }));
                      }}
                      placeholder={L('ex. Lyon', 'напр. Лион', 'օր.՝ Երևան', 'მაგ. თბილისი')}
                      className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none ${
                        fieldErrors.city
                          ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-500'
                          : 'border-slate-800 focus:border-amber-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Phone & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {t('phone')}
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder={t('buyerPhonePlaceholder')}
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {t('email')}
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('buyerEmailPlaceholder')}
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Optional Sales Channel */}
                <div className="mt-3">
                  <label htmlFor="buyer-sale-channel" className="block text-xs font-semibold text-slate-300 mb-1">
                    {L('Canal de vente (optionnel)', 'Канал продажи (необязательно)', 'Վաճառքի աղբյուր (ոչ պարտադիր)', 'გაყიდვის არხი (არასავალდებულო)')}
                  </label>
                  <select
                    id="buyer-sale-channel"
                    data-testid="buyer-sale-channel"
                    value={saleChannel}
                    onChange={(e) => setSaleChannel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">{L('Autre / Non précisé', 'Другое / Не указан', 'Այլ / Նշված չէ', 'სხვა / არ არის მითითებული')}</option>
                    <option value="leboncoin">Leboncoin</option>
                    <option value="direct">{L('Client direct', 'Прямой клиент', 'Ուղղակի հաճախորդ', 'პირდაპირი კლიენტი')}</option>
                    <option value="referral">{L('Recommandation', 'Рекомендация', 'Երաշխավորություն', 'რეკომენდაცია')}</option>
                    <option value="other">{L('Autre', 'Другое', 'Այլ', 'სხვა')}</option>
                  </select>
                </div>
              </div>

              {/* Document Auto-Generation & Fiscal Immutability Notice */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 to-indigo-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-200">{t('autoGenNoticeTitle')}</p>
                  <p className="text-slate-300 text-[11px]">
                    {L(
                      'Dès validation, les 2 boutons « Télécharger / Imprimer la Facture » et « Télécharger / Imprimer le Cerfa 15776 » seront instantanément disponibles dans le dossier du véhicule.',
                      'После подтверждения в карточке авто сразу станут доступны кнопки «Скачать / распечатать счёт (Facture)» и «Скачать / распечатать Cerfa 15776».',
                      'Հաստատումից անմիջապես հետո ավտոմեքենայի քարտում հասանելի կդառնան «Ներբեռնել / տպել հաշիվ-ապրանքագիրը» և «Ներբեռնել / տպել Cerfa 15776» կոճակները։',
                      'დადასტურებისთანავე ავტომობილის ბარათში მომენტალურად ხელმისაწვდომი გახდება ღილაკები «ინვოისის ჩამოტვირთვა / ბეჭდვა» და «Cerfa 15776 ჩამოტვირთვა / ბეჭდვა».'
                    )}
                  </p>
                  {!isParticulierSeller && (
                    <p className="text-slate-400 text-[10px]">
                      {pickLocalized(lang, {
                        fr: FRENCH_TAX_DEFAULTS.DISCLAIMER_FR,
                        ru: FRENCH_TAX_DEFAULTS.DISCLAIMER_RU,
                        hy: FRENCH_TAX_DEFAULTS.DISCLAIMER_HY,
                        ka: FRENCH_TAX_DEFAULTS.DISCLAIMER_KA,
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            <div>
              {step > 1 ? (
                <button
                  type="button"
                  data-testid="sale-wizard-prev-btn"
                  onClick={handlePrevStep}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{L('Précédent', 'Назад', 'Հետ', 'უკან')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition"
                >
                  {t('cancelBtn')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {step > 1 && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition"
                >
                  {t('cancelBtn')}
                </button>
              )}

              {step < 3 ? (
                <button
                  key="wizard-next-btn"
                  type="button"
                  data-testid="sale-wizard-next-btn"
                  onClick={handleNextStep}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 transition inline-flex items-center gap-1.5"
                >
                  <span>{L('Suivant', 'Далее', 'Առաջ', 'შემდეგი')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  key="wizard-submit-btn"
                  type="submit"
                  data-testid="buyer-modal-submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20 transition flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? t('loading') : t('confirmSaleBtn')}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
