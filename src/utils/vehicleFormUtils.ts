import { Vehicle, VehicleStatus } from '../types/garage';

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
  lang: 'fr' | 'ru' = 'fr'
): string | null {
  const isRu = lang === 'ru';

  if (!input.make.trim() || !input.model.trim()) {
    return isRu
      ? 'Укажите марку и модель автомобиля.'
      : 'Veuillez renseigner la marque et le modèle.';
  }

  const parsedYear = Number(input.year);
  if (input.year === '' || Number.isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
    return isRu
      ? 'Укажите корректный год выпуска (1900–2100).'
      : 'Veuillez renseigner une année de mise en circulation valide (1900–2100).';
  }

  if (!input.registrationNumber.trim()) {
    return isRu
      ? 'Укажите госномер (Immatriculation), например AB-123-CD.'
      : 'Veuillez renseigner le numéro d’immatriculation (ex. AB-123-CD).';
  }

  if (input.purchasePrice === '' || Number.isNaN(Number(input.purchasePrice)) || Number(input.purchasePrice) < 0) {
    return isRu
      ? 'Укажите корректную цену покупки.'
      : 'Veuillez renseigner un prix d’achat valide.';
  }

  const cleanedVin = input.vin.replace(/\s+/g, '').toUpperCase();
  if (cleanedVin.length > 0 && !VIN_REGEX.test(cleanedVin)) {
    return isRu
      ? 'VIN должен содержать ровно 17 символов (латинские буквы и цифры, без I, O, Q).'
      : 'Le numéro VIN doit contenir exactement 17 caractères alphanumériques (hors I, O, Q).';
  }

  if (input.mileage !== '' && (Number.isNaN(Number(input.mileage)) || Number(input.mileage) < 0)) {
    return isRu
      ? 'Укажите корректный пробег.'
      : 'Veuillez renseigner un kilométrage valide.';
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
    repairCostTotal: initialVehicle?.repairCostTotal || 0,
    generalExpensesTotal: initialVehicle?.generalExpensesTotal || 0,
    totalExpenses: initialVehicle?.totalExpenses || 0,
    totalInvested: initialVehicle?.totalInvested ?? parsedPurchasePrice,
    netProfit: initialVehicle?.netProfit || 0,
    marginPercentage: initialVehicle?.marginPercentage || 0,
  };
}

export function hasVehicleCerfaDetails(vehicle: Partial<Vehicle>): boolean {
  return Boolean(
    (vehicle.vin && vehicle.vin.trim().length === 17) &&
      (vehicle.registrationNumber && vehicle.registrationNumber.trim().length > 0) &&
      (vehicle.typeVariantVersion || vehicle.formulaNumber || vehicle.certificateDate || vehicle.bodyType)
  );
}
