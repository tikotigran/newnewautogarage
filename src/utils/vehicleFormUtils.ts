import { Vehicle, VehicleStatus } from '../types/garage';
import { roundToTwo } from './finance';
import { Language, pickLocalized } from './i18nUtils';

export interface VehicleFormInput {
  make: string;
  model: string;
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
  formulaNumber: string;
  certificateDate: string;
  purchaseDate: string;
  targetSalePrice: number | '';
  status: VehicleStatus;
  photos: string[];
}

export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

export function validateQuickVehicleForm(
  input: Pick<VehicleFormInput, 'make' | 'model' | 'year' | 'registrationNumber' | 'purchasePrice' | 'vin' | 'mileage'>,
  lang: Language = 'fr'
): string | null {
  if (!input.make.trim() || !input.model.trim()) {
    return pickLocalized(lang, {
      fr: 'Veuillez renseigner la marque et le modèle.',
      ru: 'Укажите марку и модель автомобиля.',
      hy: 'Նշեք ավտոմեքենայի մակնիշը և մոդելը։',
      ka: 'მიუთითეთ ავტომობილის მარკა და მოდელი.',
    });
  }

  const parsedYear = Number(input.year);
  if (input.year === '' || Number.isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
    return pickLocalized(lang, {
      fr: 'Veuillez renseigner une année de mise en circulation valide (1900–2100).',
      ru: 'Укажите корректный год выпуска (1900–2100).',
      hy: 'Նշեք ճիշտ թողարկման տարեթիվ (1900–2100)։',
      ka: 'მიუთითეთ გამოშვების სწორი წელი (1900–2100).',
    });
  }

  if (!input.registrationNumber.trim()) {
    return pickLocalized(lang, {
      fr: 'Veuillez renseigner le numéro d’immatriculation (ex. AB-123-CD).',
      ru: 'Укажите госномер (Immatriculation), например AB-123-CD.',
      hy: 'Նշեք պետհամարանիշը (Immatriculation), օրինակ՝ AB-123-CD։',
      ka: 'მიუთითეთ სახელმწიფო ნომერი (Immatriculation), მაგ. AB-123-CD.',
    });
  }

  if (input.purchasePrice === '' || Number.isNaN(Number(input.purchasePrice)) || Number(input.purchasePrice) < 0) {
    return pickLocalized(lang, {
      fr: 'Veuillez renseigner un prix d’achat valide.',
      ru: 'Укажите корректную цену покупки.',
      hy: 'Նշեք գնման ճիշտ արժեքը։',
      ka: 'მიუთითეთ შესყიდვის სწორი ფასი.',
    });
  }

  const cleanedVin = input.vin.replace(/\s+/g, '').toUpperCase();
  if (cleanedVin.length > 0 && !VIN_REGEX.test(cleanedVin)) {
    return pickLocalized(lang, {
      fr: 'Le numéro VIN doit contenir exactement 17 caractères alphanumériques (hors I, O, Q).',
      ru: 'VIN должен содержать ровно 17 символов (латинские буквы и цифры, без I, O, Q).',
      hy: 'VIN կոդը պետք է պարունակի ուղիղ 17 նիշ (լատինատառ և թվեր, առանց I, O, Q)։',
      ka: 'VIN კოდი უნდა შეიცავდეს ზუსტად 17 სიმბოლოს (ლათინური ასოები და ციფრები, I, O, Q-ს გარეშე).',
    });
  }

  if (input.mileage !== '' && (Number.isNaN(Number(input.mileage)) || Number(input.mileage) < 0)) {
    return pickLocalized(lang, {
      fr: 'Veuillez renseigner un kilométrage valide.',
      ru: 'Укажите корректный пробег.',
      hy: 'Նշեք ճիշտ վազքը։',
      ka: 'მიუთითეთ სწორი გარბენი.',
    });
  }

  return null;
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

  return {
    userId,
    make: input.make.trim(),
    model: input.model.trim(),
    trim: input.trim.trim(),
    year: Number(input.year),
    mileage: parsedMileage,
    vin: cleanedVin,
    registrationNumber: cleanedReg,
    fuelType: input.fuelType.trim(),
    gearbox: input.gearbox.trim(),
    typeVariantVersion: input.typeVariantVersion.trim(),
    nationalGenre: input.nationalGenre.trim() || 'VP',
    bodyType: input.bodyType.trim().toUpperCase(),
    formulaNumber: input.formulaNumber.replace(/\s+/g, '').toUpperCase(),
    certificateDate: input.certificateDate.trim(),
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
  return Boolean(
    (vehicle.vin && vehicle.vin.trim().length === 17) &&
      (vehicle.registrationNumber && vehicle.registrationNumber.trim().length > 0) &&
      (vehicle.typeVariantVersion || vehicle.formulaNumber || vehicle.certificateDate || vehicle.bodyType)
  );
}
