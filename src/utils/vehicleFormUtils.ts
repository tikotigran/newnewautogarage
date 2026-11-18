import { Vehicle, VehicleStatus } from '../types/garage';
import { roundToTwo } from './finance';
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
  photos: string[];
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

export function validateVehicleFormDetailed(
  input: Pick<
    VehicleFormInput,
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
    | 'formulaNumber'
    | 'certificateDate'
    | 'absenceReason'
  >,
  lang: Language = 'fr'
): VehicleFormValidationResult {
  const fieldErrors: Partial<Record<VehicleFormFieldErrorKey, string>> = {};
  const missingLabels: string[] = [];

  if (!input.make.trim()) {
    const label = pickLocalized(lang, {
      fr: '(D.1) Marque',
      ru: '(D.1) Марка',
      hy: '(D.1) Մակնիշ',
      ka: '(D.1) მარკა',
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

  if (!input.commercialDesignation.trim()) {
    const label = '(D.3) Dénomination commerciale';
    missingLabels.push(label);
    fieldErrors.commercialDesignation = label;
  }

  if (!input.firstRegistrationDate.trim()) {
    const label = '(B) 1re immatriculation';
    missingLabels.push(label);
    fieldErrors.firstRegistrationDate = label;
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
      fr: "(A) N° d'immatriculation",
      ru: '(A) Госномер (Immatriculation)',
      hy: '(A) Պետհամարանիշ',
      ka: '(A) სახელმწიფო ნომერი',
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

  if (input.hasRegistrationCertificate === null || input.hasRegistrationCertificate === undefined) {
    const label = "Présence du certificat d'immatriculation (OUI / NON)";
    missingLabels.push(label);
    fieldErrors.hasRegistrationCertificate = label;
  } else if (input.hasRegistrationCertificate === true) {
    const hasFormula = input.formulaNumber.trim().length > 0;
    const hasCertDate = input.certificateDate.trim().length > 0;
    if (!hasFormula && !hasCertDate) {
      const label = pickLocalized(lang, {
        fr: 'Numéro de formule ou (I) Date du certificat',
        ru: 'Numéro de formule или (I) Date du certificat',
        hy: 'Numéro de formule կամ (I) Date du certificat',
        ka: 'Numéro de formule ან (I) Date du certificat',
      });
      missingLabels.push(label);
      fieldErrors.formulaOrCertificateDate = label;
    }
  } else if (!input.absenceReason.trim()) {
    const label = pickLocalized(lang, {
      fr: "Motif d'absence du certificat",
      ru: 'Причина отсутствия СТС (Motif)',
      hy: 'Վկայականի բացակայության պատճառ',
      ka: 'მოწმობის არარსებობის მიზეზი',
    });
    missingLabels.push(label);
    fieldErrors.absenceReason = label;
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

  const toastMessage = formatCerfaMissingToast(missingLabels, lang);
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
    | 'commercialDesignation'
    | 'firstRegistrationDate'
    | 'year'
    | 'registrationNumber'
    | 'purchasePrice'
    | 'vin'
    | 'mileage'
    | 'hasRegistrationCertificate'
    | 'formulaNumber'
    | 'certificateDate'
    | 'absenceReason'
  >,
  lang: Language = 'fr'
): string | null {
  return validateVehicleFormDetailed(input, lang).firstError;
}

export function buildVehicleSubmitPayload(
  input: VehicleFormInput,
  userId: string,
  initialVehicle?: Vehicle | null
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
  const effectiveSalePrice =
    (input.status || initialVehicle?.status) === 'sold' && initialVehicle?.buyerInfo?.salePrice
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

  return {
    userId,
    make: input.make.trim(),
    model: input.model.trim(),
    commercialDesignation: input.commercialDesignation.trim() || input.model.trim(),
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
      input.hasRegistrationCertificate === null ? true : input.hasRegistrationCertificate,
    formulaNumber: input.formulaNumber.replace(/\s+/g, '').toUpperCase(),
    certificateDate: input.certificateDate.trim(),
    absenceReason: input.absenceReason.trim(),
    purchaseDate: input.purchaseDate || new Date().toISOString().split('T')[0],
    purchasePrice: parsedPurchasePrice,
    targetSalePrice: parsedTargetPrice,
    status: input.status || 'preparation',
    photos: input.photos,
    documents: initialVehicle?.documents || [],
    buyerInfo: initialVehicle?.buyerInfo,
    repairCostTotal,
    generalExpensesTotal,
    totalExpenses,
    totalInvested,
    netProfit,
    marginPercentage,
  };
}

export function hasVehicleCerfaDetails(vehicle: Partial<Vehicle>): boolean {
  const hasCertProof =
    vehicle.hasRegistrationCertificate === false
      ? Boolean(vehicle.absenceReason && vehicle.absenceReason.trim())
      : Boolean(vehicle.formulaNumber || vehicle.certificateDate);
  return Boolean(
    vehicle.registrationNumber &&
      vehicle.registrationNumber.trim().length > 0 &&
      vehicle.firstRegistrationDate &&
      vehicle.firstRegistrationDate.trim().length > 0 &&
      (vehicle.commercialDesignation || vehicle.model) &&
      hasCertProof
  );
}
