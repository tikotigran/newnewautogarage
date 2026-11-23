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
  supplierId?: string;
  supplierName?: string;
  status: VehicleStatus;
  purchaseStatus?: VehiclePurchaseStatus;
  sellerProfileId?: string;
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

export function resolveDefaultSellerProfileId(
  purchaseStatus: VehiclePurchaseStatus,
  settings?: Pick<GarageSettings, 'businessProfiles' | 'personalProfiles'> | null
): string | undefined {
  const pool =
    purchaseStatus === 'particulier'
      ? settings?.personalProfiles || []
      : settings?.businessProfiles || [];
  const match = pool.find((p) => p.isDefault) || pool[0];
  return match?.id;
}

export function resolveVehicleSellerProfileId(
  vehicle?: Pick<Vehicle, 'purchaseStatus' | 'sellerProfileId' | 'buyerInfo'> | null,
  purchaseStatus: VehiclePurchaseStatus = 'micro',
  settings?: Pick<GarageSettings, 'businessProfiles' | 'personalProfiles'> | null
): string | undefined {
  const pool =
    purchaseStatus === 'particulier'
      ? settings?.personalProfiles || []
      : settings?.businessProfiles || [];
  const candidate =
    vehicle?.sellerProfileId?.trim() || vehicle?.buyerInfo?.sellerProfileId?.trim();
  if (candidate && pool.some((p) => p.id === candidate)) {
    return candidate;
  }
  const sameMode =
    !vehicle?.purchaseStatus || vehicle.purchaseStatus === purchaseStatus;
  if (candidate && sameMode) {
    return candidate;
  }
  return resolveDefaultSellerProfileId(purchaseStatus, settings);
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
  const cleanedSupplierId = input.supplierId?.trim() || initialVehicle?.supplierId || undefined;
  const cleanedSupplierName =
    input.supplierName !== undefined
      ? input.supplierName.trim() || undefined
      : initialVehicle?.supplierName || undefined;

    const resolvedSellerProfileId =
      input.sellerProfileId !== undefined
        ? input.sellerProfileId.trim() || undefined
        : initialVehicle?.purchaseStatus === resolvedPurchaseStatus
        ? initialVehicle?.sellerProfileId || undefined
        : undefined;

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
    ...(cleanedSupplierId ? { supplierId: cleanedSupplierId } : {}),
    ...(cleanedSupplierName ? { supplierName: cleanedSupplierName } : {}),
    status: nextStatus,
    purchaseStatus: resolvedPurchaseStatus,
    ...(resolvedSellerProfileId ? { sellerProfileId: resolvedSellerProfileId } : {}),
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

export const MAX_VEHICLE_PHOTOS_BYTES = 750 * 1024;

export function estimatePhotosPayloadBytes(photos: readonly string[]): number {
  let total = 0;
  for (const item of photos) {
    if (typeof item === 'string') {
      total += item.length;
    }
  }
  return total;
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

export const LEGACY_SALE_FIELDS = [
  'buyer',
  'buyerName',
  'buyerFirstName',
  'buyerLastName',
  'buyerAddress',
  'buyerCity',
  'buyerPostalCode',
  'buyerBirthDate',
  'buyerBirthPlace',
  'buyerPhone',
  'buyerEmail',
  'salePrice',
  'saleDate',
  'saleTime',
  'isSold',
  'cerfaGenerated',
] as const;

export function stripSaleFieldsFromLocalVehicle(vehicle: Vehicle): Vehicle {
  const clone = { ...vehicle } as Record<string, unknown>;
  delete clone.buyerInfo;
  for (const field of LEGACY_SALE_FIELDS) {
    delete clone[field];
  }
  return clone as unknown as Vehicle;
}

export interface SaleWizardInitialState {
  step: 1;
  // Step 1: Vehicle technical specs
  registrationNumber: string;
  vin: string;
  mileage: number | '';
  firstRegistrationDate: string;
  formulaNumber: string;
  // Step 2: Seller & deal timing
  saleDate: string;
  saleTime: string;
  // Step 3: Buyer & sale price
  isCompany: boolean;
  fullName: string;
  siret: string;
  birthDate: string;
  birthPlace: string;
  streetNumber: string;
  streetName: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  salePrice: number | '';
  saleChannel: string;
}

/**
 * Always initializes the multi-step Sale Wizard on Step 1 of 3.
 * For unsold vehicles (or vehicles whose sale was cancelled), all Step 3 buyer
 * fields are strictly blank (no prefilled dummy addresses or birth dates).
 */
export function buildSaleWizardInitialState(
  vehicle: Pick<
    Vehicle,
    | 'status'
    | 'registrationNumber'
    | 'vin'
    | 'mileage'
    | 'firstRegistrationDate'
    | 'formulaNumber'
    | 'targetSalePrice'
    | 'purchasePrice'
    | 'buyerInfo'
  > | null | undefined,
  todayIso: string = new Date().toISOString().split('T')[0]
): SaleWizardInitialState {
  const activeBuyer =
    vehicle && vehicle.status === 'sold' && vehicle.buyerInfo
      ? vehicle.buyerInfo
      : undefined;

  return {
    step: 1,
    registrationNumber: vehicle?.registrationNumber || '',
    vin: vehicle?.vin || '',
    mileage: vehicle?.mileage ?? '',
    firstRegistrationDate: vehicle?.firstRegistrationDate || '',
    formulaNumber: vehicle?.formulaNumber || '',
    saleDate: activeBuyer?.saleDate || todayIso,
    saleTime: activeBuyer?.saleTime || '14:00',
    isCompany: activeBuyer?.isCompany || false,
    fullName: activeBuyer?.fullName || '',
    siret: activeBuyer?.siret || '',
    birthDate: activeBuyer?.birthDate || '',
    birthPlace: activeBuyer?.birthPlace || '',
    streetNumber: activeBuyer?.streetNumber || '',
    streetName: activeBuyer?.streetName || '',
    postalCode: activeBuyer?.postalCode || '',
    city: activeBuyer?.city || '',
    phone: activeBuyer?.phone || '',
    email: activeBuyer?.email || '',
    salePrice:
      activeBuyer?.salePrice ||
      (vehicle?.targetSalePrice && vehicle.targetSalePrice > 0
        ? vehicle.targetSalePrice
        : vehicle?.purchasePrice || ''),
    saleChannel: activeBuyer?.saleChannel || '',
  };
}

export interface VehicleMarginPreview {
  hasPurchasePrice: boolean;
  hasTargetSalePrice: boolean;
  isComplete: boolean;
  purchasePrice: number;
  targetSalePrice: number;
  grossMarginEuro: number;
  grossMarginPercent: number;
}

export function computeVehicleMarginPreview(
  purchasePriceInput: number | '',
  targetSalePriceInput: number | ''
): VehicleMarginPreview {
  const purchaseNum = purchasePriceInput === '' ? NaN : Number(purchasePriceInput);
  const targetNum = targetSalePriceInput === '' ? NaN : Number(targetSalePriceInput);
  const hasPurchasePrice =
    purchasePriceInput !== '' && !Number.isNaN(purchaseNum) && purchaseNum >= 0;
  const hasTargetSalePrice =
    targetSalePriceInput !== '' && !Number.isNaN(targetNum) && targetNum > 0;
  const purchasePrice = hasPurchasePrice ? roundToTwo(purchaseNum) : 0;
  const targetSalePrice = hasTargetSalePrice ? roundToTwo(targetNum) : 0;
  const isComplete = hasPurchasePrice && hasTargetSalePrice;
  const grossMarginEuro = isComplete ? roundToTwo(targetSalePrice - purchasePrice) : 0;
  const grossMarginPercent =
    isComplete && targetSalePrice > 0
      ? roundToTwo((grossMarginEuro / targetSalePrice) * 100)
      : 0;

  return {
    hasPurchasePrice,
    hasTargetSalePrice,
    isComplete,
    purchasePrice,
    targetSalePrice,
    grossMarginEuro,
    grossMarginPercent,
  };
}

export interface CerfaSpecsFormInput {
  make: string;
  commercialDesignation: string;
  registrationNumber: string;
  firstRegistrationDate: string;
  vin: string;
  mileage: number | '';
  fuelType: string;
  gearbox: string;
  typeVariantVersion: string;
  nationalGenre: string;
  bodyType: string;
  hasRegistrationCertificate: boolean;
  formulaNumber: string;
  certificateDate: string;
  absenceReason: string;
}

export function resolveInitialHasRegistrationCertificate(
  vehicle: Pick<Vehicle, 'hasRegistrationCertificate' | 'absenceReason'>
): boolean {
  if (typeof vehicle.hasRegistrationCertificate === 'boolean') {
    return vehicle.hasRegistrationCertificate;
  }
  if (vehicle.absenceReason && vehicle.absenceReason.trim().length > 0) {
    return false;
  }
  return true;
}

export function validateCerfaSpecsForm(
  input: Pick<CerfaSpecsFormInput, 'make' | 'vin' | 'mileage'>,
  lang: Language = 'fr'
): string | null {
  if (!input.make.trim()) {
    return pickLocalized(lang, {
      fr: 'La marque (D.1) est obligatoire.',
      ru: 'Поле «(D.1) Марка» обязательно для заполнения.',
      hy: '«(D.1) Մակնիշ» դաշտը պարտադիր է։',
      ka: 'ველის „(D.1) მარკა“ შევსება სავალდებულოა.',
    });
  }

  const cleanedVin = input.vin.replace(/\s+/g, '').toUpperCase();
  if (cleanedVin.length > 0 && !VIN_REGEX.test(cleanedVin)) {
    return pickLocalized(lang, {
      fr: 'Le VIN doit contenir exactement 17 caractères (hors I, O, Q).',
      ru: 'VIN должен содержать ровно 17 символов (без I, O, Q).',
      hy: 'VIN կոդը պետք է ունենա ուղիղ 17 նիշ (առանց I, O, Q)։',
      ka: 'VIN კოდი უნდა შეიცავდეს ზუსტად 17 სიმბოლოს (I, O, Q-ის გარეშე).',
    });
  }

  if (
    input.mileage !== '' &&
    (Number.isNaN(Number(input.mileage)) || Number(input.mileage) < 0)
  ) {
    return pickLocalized(lang, {
      fr: 'Le kilométrage doit être un nombre positif.',
      ru: 'Пробег должен быть неотрицательным числом.',
      hy: 'Վազքը պետք է լինի ոչ բացասական թիվ։',
      ka: 'გარბენი უნდა იყოს არაუარყოფითი რიცხვი.',
    });
  }

  return null;
}

export function buildCerfaSpecsUpdatePayload(
  input: CerfaSpecsFormInput
): Partial<Vehicle> {
  const cleanedVin = input.vin.replace(/\s+/g, '').toUpperCase();
  const hasCert = input.hasRegistrationCertificate;

  return {
    make: input.make.trim(),
    commercialDesignation: input.commercialDesignation.trim(),
    registrationNumber: input.registrationNumber.trim().toUpperCase(),
    firstRegistrationDate: input.firstRegistrationDate.trim(),
    vin: cleanedVin,
    mileage: input.mileage === '' ? 0 : Math.max(0, Number(input.mileage)),
    fuelType: input.fuelType.trim(),
    gearbox: input.gearbox.trim(),
    typeVariantVersion: input.typeVariantVersion.trim(),
    nationalGenre: input.nationalGenre.trim() || 'VP',
    bodyType: input.bodyType.trim().toUpperCase(),
    hasRegistrationCertificate: hasCert,
    formulaNumber: hasCert ? input.formulaNumber.replace(/\s+/g, '').toUpperCase() : '',
    certificateDate: hasCert ? input.certificateDate.trim() : '',
    absenceReason: hasCert ? '' : input.absenceReason.trim(),
  };
}
