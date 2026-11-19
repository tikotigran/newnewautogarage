import {
  AppUserProfileType,
  GarageSettings,
  Vehicle,
  VehiclePurchaseStatus,
  VehicleStatus,
} from '../types/garage';
import { calculateVehicleFinancials, roundToTwo } from './finance';
import { Language, pickLocalized } from './i18nUtils';

export interface VehicleFormInput {
  make: string;
  model: string;
  commercialDesignation: string;
  firstRegistrationDate: string;
  trim: string;
  year: number | '';
  registrationNumber: string;
  purchasePrice: number | '';
  vin: string;
  mileage: number | '';
  fuelType: string;
  gearbox: string;
  typeVariantVersion: string;
  nationalGenre: string;
  bodyType: string;
  hasRegistrationCertificate: boolean | null;
  formulaNumber: string;
  certificateDate: string;
  absenceReason: string;
  purchaseDate: string;
  targetSalePrice: number | '';
  status: VehicleStatus;
  purchaseStatus?: VehiclePurchaseStatus;
  photos: string[];
}

export function mapProfileTypeToPurchaseStatus(
  profileType?: AppUserProfileType | null
): VehiclePurchaseStatus {
  return profileType === 'particulier' ? 'particulier' : 'micro';
}

export function resolveDefaultPurchaseStatus(
  activeProfileType?: AppUserProfileType | null,
  settings?: Pick<GarageSettings, 'profileType' | 'legalStatus' | 'taxRegime'> | null
): VehiclePurchaseStatus {
  if (activeProfileType === 'particulier') return 'particulier';
  if (activeProfileType === 'micro_entrepreneur') return 'micro';
  if (
    settings?.profileType === 'particulier' ||
    settings?.legalStatus === 'particulier' ||
    settings?.taxRegime === 'none'
  ) {
    return 'particulier';
  }
  return 'micro';
}

export function resolveTargetGarageId(
  vehicle?: Pick<Vehicle, 'garageId'> | null,
  activeGarageId?: string | null
): string | undefined {
  const candidate = vehicle?.garageId || activeGarageId || undefined;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

export function resolveVehiclePurchaseStatus(
  vehicle?: Pick<Vehicle, 'purchaseStatus' | 'buyerInfo'> | null,
  fallbackProfileType?: AppUserProfileType | null
): VehiclePurchaseStatus {
  if (vehicle?.purchaseStatus === 'particulier' || vehicle?.purchaseStatus === 'micro') {
    return vehicle.purchaseStatus;
  }
  if (vehicle?.buyerInfo?.sellerProfileType === 'particulier') {
    return 'particulier';
  }
  if (vehicle?.buyerInfo?.sellerProfileType === 'micro_entrepreneur') {
    return 'micro';
  }
  return mapProfileTypeToPurchaseStatus(fallbackProfileType);
}

export type VehicleFormFieldErrorKey =
  | 'make'
  | 'model'
  | 'commercialDesignation'
  | 'firstRegistrationDate'
  | 'year'
  | 'registrationNumber'
  | 'purchasePrice'
  | 'vin'
  | 'mileage'
  | 'hasRegistrationCertificate'
  | 'formulaOrCertificateDate'
  | 'absenceReason';

export interface VehicleFormValidationResult {
  firstError: string | null;
  toastMessage: string | null;
  missingFieldLabels: string[];
  fieldErrors: Partial<Record<VehicleFormFieldErrorKey, string>>;
}

export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

export function formatCerfaMissingToast(missingLabels: string[], lang: Language = 'ru'): string {
  const joined = missingLabels.join(', ');
  return pickLocalized(lang, {
    fr: `Veuillez remplir les champs Cerfa obligatoires : ${joined}`,
    ru: `Заполните обязательные поля бланка Cerfa: ${joined}`,
    hy: `Լրացրեք Cerfa ձևաթղթի պարտադիր դաշտերը՝ ${joined}`,
    ka: `შეავსეთ Cerfa ფორმის სავალდებულო ველები: ${joined}`,
  });
}

export function formatVehicleMissingToast(missingLabels: string[], lang: Language = 'ru'): string {
  const joined = missingLabels.join(', ');
  return pickLocalized(lang, {
    fr: `Veuillez remplir les champs obligatoires du véhicule : ${joined}`,
    ru: `Заполните обязательные поля автомобиля: ${joined}`,
    hy: `Լրացրեք ավտոմեքենայի պարտադիր դաշտերը՝ ${joined}`,
    ka: `შეავსეთ ავტომობილის სავალდებულო ველები: ${joined}`,
  });
}

export function validateVehicleFormDetailed(
  input: Pick<
    VehicleFormInput,
    | 'make'
    | 'model'
    | 'year'
    | 'registrationNumber'
    | 'purchasePrice'
    | 'vin'
    | 'mileage'
  > &
    Partial<
      Pick<
        VehicleFormInput,
        | 'commercialDesignation'
        | 'firstRegistrationDate'
        | 'hasRegistrationCertificate'
        | 'formulaNumber'
        | 'certificateDate'
        | 'absenceReason'
      >
    >,
  lang: Language = 'fr'
): VehicleFormValidationResult {
  const fieldErrors: Partial<Record<VehicleFormFieldErrorKey, string>> = {};
  const missingLabels: string[] = [];

  if (!input.make.trim()) {
    const label = pickLocalized(lang, {
      fr: 'Marque',
      ru: 'Марка',
      hy: 'Մակնիշ',
      ka: 'მარკა',
    });
    missingLabels.push(label);
    fieldErrors.make = label;
  }

  if (!input.model.trim()) {
    const label = pickLocalized(lang, {
      fr: 'Modèle',
      ru: 'Модель',
      hy: 'Մոդել',
      ka: 'მოდელი',
    });
    missingLabels.push(label);
    fieldErrors.model = label;
  }

  const parsedYear = Number(input.year);
  if (input.year === '' || Number.isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
    const label = pickLocalized(lang, {
      fr: 'Année (1900–2100)',
      ru: 'Год выпуска (1900–2100)',
      hy: 'Թողարկման տարի (1900–2100)',
      ka: 'გამოშვების წელი (1900–2100)',
    });
    missingLabels.push(label);
    fieldErrors.year = label;
  }

  if (!input.registrationNumber.trim()) {
    const label = pickLocalized(lang, {
      fr: "N° d'immatriculation",
      ru: 'Госномер',
      hy: 'Պետհամարանիշ',
      ka: 'სახელმწიფო ნომერი',
    });
    missingLabels.push(label);
    fieldErrors.registrationNumber = label;
  }

  if (
    input.purchasePrice === '' ||
    Number.isNaN(Number(input.purchasePrice)) ||
    Number(input.purchasePrice) < 0
  ) {
    const label = pickLocalized(lang, {
      fr: "Prix d'achat",
      ru: 'Цена покупки',
      hy: 'Գնման գին',
      ka: 'შესყიდვის ფასი',
    });
    missingLabels.push(label);
    fieldErrors.purchasePrice = label;
  }

  const cleanedVin = input.vin.replace(/\s+/g, '').toUpperCase();
  if (cleanedVin.length > 0 && !VIN_REGEX.test(cleanedVin)) {
    const vinMsg = pickLocalized(lang, {
      fr: 'Le numéro VIN doit contenir exactement 17 caractères alphanumériques (hors I, O, Q).',
      ru: 'VIN должен содержать ровно 17 символов (латинские буквы и цифры, без I, O, Q).',
      hy: 'VIN կոդը պետք է պարունակի ուղիղ 17 նիշ (լատինատառ և թվեր, առանց I, O, Q)։',
      ka: 'VIN კოდი უნდა შეიცავდეს ზუსტად 17 სიმბოლოს (ლათინური ასოები და ციფრები, I, O, Q-ს გარეშე).',
    });
    fieldErrors.vin = vinMsg;
    missingLabels.push('VIN (E)');
  }

  if (input.mileage !== '' && (Number.isNaN(Number(input.mileage)) || Number(input.mileage) < 0)) {
    const mileageMsg = pickLocalized(lang, {
      fr: 'Kilométrage invalide',
      ru: 'Некорректный пробег',
      hy: 'Սխալ վազք',
      ka: 'არასწორი გარბენი',
    });
    fieldErrors.mileage = mileageMsg;
    missingLabels.push(mileageMsg);
  }

  if (missingLabels.length === 0) {
    return {
      firstError: null,
      toastMessage: null,
      missingFieldLabels: [],
      fieldErrors: {},
    };
  }

  const toastMessage = formatVehicleMissingToast(missingLabels, lang);
  return {
    firstError: toastMessage,
    toastMessage,
    missingFieldLabels: missingLabels,
    fieldErrors,
  };
}

export function validateQuickVehicleForm(
  input: Pick<
    VehicleFormInput,
    | 'make'
    | 'model'
    | 'year'
    | 'registrationNumber'
    | 'purchasePrice'
    | 'vin'
    | 'mileage'
  > &
    Partial<
      Pick<
        VehicleFormInput,
        | 'commercialDesignation'
        | 'firstRegistrationDate'
        | 'hasRegistrationCertificate'
        | 'formulaNumber'
        | 'certificateDate'
        | 'absenceReason'
      >
    >,
  lang: Language = 'fr'
): string | null {
  return validateVehicleFormDetailed(input, lang).firstError;
}

export function buildVehicleSubmitPayload(
  input: VehicleFormInput,
  userId: string,
  initialVehicle?: Vehicle | null,
  activeGarageId?: string | null
): Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'> {
  const cleanedVin = input.vin.replace(/\s+/g, '').toUpperCase();
  const cleanedReg = input.registrationNumber.trim().toUpperCase();
  const parsedPurchasePrice = Number(input.purchasePrice);
  const parsedMileage =
    input.mileage !== '' && !Number.isNaN(Number(input.mileage))
      ? Math.max(0, Number(input.mileage))
      : 0;
  const parsedTargetPrice =
    input.targetSalePrice !== '' && !Number.isNaN(Number(input.targetSalePrice)) && Number(input.targetSalePrice) > 0
      ? Number(input.targetSalePrice)
      : 0;

  const repairCostTotal = roundToTwo(Math.max(0, Number(initialVehicle?.repairCostTotal) || 0));
  const generalExpensesTotal = roundToTwo(Math.max(0, Number(initialVehicle?.generalExpensesTotal) || 0));
  const fallbackTotalExpenses =
    repairCostTotal === 0 && generalExpensesTotal === 0
      ? roundToTwo(Math.max(0, Number(initialVehicle?.totalExpenses) || 0))
      : 0;
  const totalExpenses = roundToTwo(
    fallbackTotalExpenses > 0 ? fallbackTotalExpenses : repairCostTotal + generalExpensesTotal
  );
  const totalInvested = roundToTwo(parsedPurchasePrice + totalExpenses);
  const nextStatus: VehicleStatus = input.status || 'preparation';
  const effectiveSalePrice =
    nextStatus === 'sold' && initialVehicle?.buyerInfo?.salePrice
      ? Number(initialVehicle.buyerInfo.salePrice)
      : parsedTargetPrice;
  const netProfit = effectiveSalePrice > 0 ? roundToTwo(effectiveSalePrice - totalInvested) : 0;
  const marginPercentage =
    effectiveSalePrice > 0 ? roundToTwo((netProfit / effectiveSalePrice) * 100) : 0;

  const yearFromFirstReg =
    input.firstRegistrationDate && /^\d{4}/.test(input.firstRegistrationDate.trim())
      ? Number(input.firstRegistrationDate.trim().slice(0, 4))
      : undefined;
  const resolvedYear =
    input.year !== '' && !Number.isNaN(Number(input.year))
      ? Number(input.year)
      : yearFromFirstReg || new Date().getFullYear();

  const resolvedPurchaseStatus: VehiclePurchaseStatus =
    input.purchaseStatus === 'particulier' || input.purchaseStatus === 'micro'
      ? input.purchaseStatus
      : initialVehicle?.purchaseStatus === 'particulier' ||
        initialVehicle?.purchaseStatus === 'micro'
      ? initialVehicle.purchaseStatus
      : 'micro';

  const targetGarageId = resolveTargetGarageId(initialVehicle, activeGarageId);

  return {
    userId,
    ...(targetGarageId ? { garageId: targetGarageId } : {}),
    make: input.make.trim(),
    model: input.model.trim(),
    commercialDesignation: input.commercialDesignation.trim(),
    firstRegistrationDate: input.firstRegistrationDate.trim(),
    trim: input.trim.trim(),
    year: resolvedYear,
    mileage: parsedMileage,
    vin: cleanedVin,
    registrationNumber: cleanedReg,
    fuelType: input.fuelType.trim(),
    gearbox: input.gearbox.trim(),
    typeVariantVersion: input.typeVariantVersion.trim(),
    nationalGenre: input.nationalGenre.trim() || 'VP',
    bodyType: input.bodyType.trim().toUpperCase(),
    hasRegistrationCertificate:
      typeof input.hasRegistrationCertificate === 'boolean'
        ? input.hasRegistrationCertificate
        : undefined,
    formulaNumber: input.formulaNumber.replace(/\s+/g, '').toUpperCase(),
    certificateDate: input.certificateDate.trim(),
    absenceReason: input.absenceReason.trim(),
    purchaseDate: input.purchaseDate || new Date().toISOString().split('T')[0],
    purchasePrice: parsedPurchasePrice,
    targetSalePrice: parsedTargetPrice,
    status: nextStatus,
    purchaseStatus: resolvedPurchaseStatus,
    photos: input.photos,
    documents: initialVehicle?.documents || [],
    buyerInfo: nextStatus === 'sold' ? initialVehicle?.buyerInfo : undefined,
    repairCostTotal,
    generalExpensesTotal,
    totalExpenses,
    totalInvested,
    netProfit,
    marginPercentage,
  };
}

/**
 * Builds update fields when reverting a vehicle from 'sold' to an unsold status
 * ('preparation', 'repair', or 'for_sale'), clearing stale buyerInfo and
 * recalculating expected P&L against targetSalePrice.
 */
export function buildSoldRevertUpdate(
  prevVehicle: Pick<
    Vehicle,
    | 'status'
    | 'purchasePrice'
    | 'targetSalePrice'
    | 'repairCostTotal'
    | 'generalExpensesTotal'
    | 'totalExpenses'
    | 'totalInvested'
    | 'buyerInfo'
  >,
  nextStatus: VehicleStatus,
  overrides: Partial<Vehicle> = {}
): { shouldClearBuyerInfo: boolean; updates: Partial<Vehicle> } {
  const isLeavingSold = prevVehicle.status === 'sold' && nextStatus !== 'sold';
  if (!isLeavingSold) {
    return {
      shouldClearBuyerInfo: false,
      updates: { ...overrides, status: nextStatus },
    };
  }

  const purchasePrice =
    overrides.purchasePrice !== undefined
      ? Number(overrides.purchasePrice) || 0
      : Number(prevVehicle.purchasePrice) || 0;
  const targetSalePrice =
    overrides.targetSalePrice !== undefined
      ? Number(overrides.targetSalePrice) || 0
      : Number(prevVehicle.targetSalePrice) || 0;
  const repairCostTotal = roundToTwo(
    Math.max(0, Number(overrides.repairCostTotal ?? prevVehicle.repairCostTotal) || 0)
  );
  const generalExpensesTotal = roundToTwo(
    Math.max(0, Number(overrides.generalExpensesTotal ?? prevVehicle.generalExpensesTotal) || 0)
  );
  const totalExpenses = roundToTwo(
    overrides.totalExpenses !== undefined
      ? Math.max(0, Number(overrides.totalExpenses) || 0)
      : repairCostTotal + generalExpensesTotal > 0
      ? repairCostTotal + generalExpensesTotal
      : Math.max(0, Number(prevVehicle.totalExpenses) || 0)
  );

  const fin = calculateVehicleFinancials({
    purchasePrice,
    targetSalePrice,
    finalSalePrice: undefined,
    repairs: repairCostTotal > 0 ? [{ partsCost: repairCostTotal, laborCost: 0 }] : [],
    expenses: totalExpenses > repairCostTotal ? [{ amount: roundToTwo(totalExpenses - repairCostTotal) }] : [],
  });

  return {
    shouldClearBuyerInfo: true,
    updates: {
      ...overrides,
      status: nextStatus,
      buyerInfo: undefined,
      totalExpenses: fin.totalExpenses,
      totalInvested: fin.totalInvested,
      netProfit: fin.netProfit,
      marginPercentage: fin.marginPercentage,
    },
  };
}

/**
 * Resolves a newly created vehicle from the current reactive vehicles list.
 * Returns null while the vehicle is not yet present in the resolved list so
 * callers wait until subscription/store updates deliver the created record.
 */
export function resolvePendingVehicleSelection(
  pendingVehicleId: string | null | undefined,
  resolvedVehicles: readonly Vehicle[]
): Vehicle | null {
  if (!pendingVehicleId) return null;
  return resolvedVehicles.find((v) => v.id === pendingVehicleId) || null;
}

export function hasVehicleCerfaDetails(vehicle: Partial<Vehicle>): boolean {
  const hasCertProof =
    vehicle.hasRegistrationCertificate === false
      ? Boolean(vehicle.absenceReason && vehicle.absenceReason.trim())
      : vehicle.hasRegistrationCertificate === true
      ? Boolean(vehicle.formulaNumber || vehicle.certificateDate)
      : false;
  return Boolean(
    vehicle.registrationNumber &&
      vehicle.registrationNumber.trim().length > 0 &&
      vehicle.firstRegistrationDate &&
      vehicle.firstRegistrationDate.trim().length > 0 &&
      vehicle.commercialDesignation &&
      vehicle.commercialDesignation.trim().length > 0 &&
      hasCertProof
  );
}
