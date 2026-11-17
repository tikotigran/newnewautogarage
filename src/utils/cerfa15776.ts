import { GarageSettings, Vehicle } from '../types/garage';
import { DEFAULT_GARAGE_SETTINGS } from '../services/garageService';
export { CERFA_15776_CONFIG } from './cerfaConfig';

export interface Cerfa15776VehicleStep {
  registrationNumber: string; // (A) Numéro d'immatriculation
  vin: string;                // (E) Numéro d'identification (VIN)
  make: string;               // (D.1) Marque
  typeVariantVersion: string; // (D.2) Type, variante, version
  commercialDesignation: string; // (D.3) Dénomination commerciale
  firstRegistrationDate: string; // (B) Date de 1re immatriculation (YYYY-MM-DD or DD/MM/YYYY)
  nationalGenre: string;      // (J.1) Genre national (VP, CTTE, etc.)
  bodywork?: string;          // (J.3) Carrosserie (CI, BREAK, etc.)
  mileage: number | '';       // Kilométrage inscrit au compteur
  hasRegistrationCertificate: boolean; // Présence du certificat d'immatriculation (OUI / NON)
  formulaNumber: string;      // Numéro de formule (ex: 2019AB12345)
  certificateDate: string;    // ou (I) date du certificat d'immatriculation
  absenceReason: string;      // Motif d'absence si NON
}

export interface Cerfa15776SellerStep {
  entityType: 'physique' | 'morale';
  sex: 'M' | 'F' | '';
  nameOrCompany: string;      // Raison sociale ou Nom et Prénom
  siret: string;              // N° SIRET (14 chiffres)
  streetNumber: string;       // N° de la voie
  streetExtension: string;    // Extension (bis, ter, etc.)
  streetType: string;         // Type de voie (rue, avenue, etc.)
  streetName: string;         // Nom de la voie
  postalCode: string;         // Code postal
  city: string;               // Commune
  saleType: 'cession' | 'destruction';
  saleDate: string;           // Date de cession (YYYY-MM-DD)
  saleTime: string;           // Heure de cession (HH:MM)
  signingCity: string;        // Fait à ...
  signingDate: string;        // le ...
  certifyAdminSituation: boolean;
  certifyNoTransformation: boolean;
  certifyVhuDestruction: boolean;
  vhuAgreementNumber: string;
  opposeProspecting: boolean;
}

export interface Cerfa15776BuyerStep {
  entityType: 'physique' | 'morale';
  sex: 'M' | 'F' | '';
  nameOrCompany: string;      // Nom et Prénom ou Raison sociale
  siret: string;              // N° SIRET (si personne morale)
  birthDate: string;          // Né(e) le
  birthPlace: string;         // à
  streetNumber: string;       // N° de la voie
  streetExtension: string;    // Extension (bis, ter, etc.)
  streetType: string;         // Type de voie
  streetName: string;         // Nom de la voie
  postalCode: string;         // Code postal
  city: string;               // Commune
  signingCity: string;        // Fait à ...
  signingDate: string;        // le ...
  certifyAcquire: boolean;
  certifyInformedAdmin: boolean;
  opposeProspecting: boolean;
}

export interface Cerfa15776FormData {
  vehicle: Cerfa15776VehicleStep;
  seller: Cerfa15776SellerStep;
  buyer: Cerfa15776BuyerStep;
}

/**
 * Splits a street string like "Rue de l'Industrie" into { streetType: "Rue", streetName: "de l'Industrie" }
 */
export function splitStreetTypeAndName(fullStreet: string): { streetType: string; streetName: string } {
  const trimmed = (fullStreet || '').trim();
  if (!trimmed) return { streetType: '', streetName: '' };
  const knownTypes = [
    'rue', 'avenue', 'boulevard', 'impasse', 'allée', 'allee', 'chemin',
    'place', 'square', 'route', 'cours', 'passage', 'voie', 'quai', 'résidence', 'residence',
  ];
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1 && knownTypes.includes(parts[0].toLowerCase())) {
    return {
      streetType: parts[0],
      streetName: parts.slice(1).join(' '),
    };
  }
  return { streetType: '', streetName: trimmed };
}

/**
 * Formats YYYY-MM-DD or DD/MM/YYYY to DD/MM/YYYY
 */
export function formatFrenchDate(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [yyyy, mm, dd] = trimmed.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Extracts DD, MM, YYYY from YYYY-MM-DD or DD/MM/YYYY
 */
export function splitFrenchDateDigits(dateStr?: string): { dd: string; mm: string; yyyy: string } {
  const fr = formatFrenchDate(dateStr);
  const match = fr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return { dd: match[1], mm: match[2], yyyy: match[3] };
  }
  return { dd: '', mm: '', yyyy: '' };
}

/**
 * Sanitizes text for pdf-lib StandardFonts (WinAnsi encoding) so special characters never throw.
 */
export function sanitizeWinAnsi(input: string): string {
  if (!input) return '';
  return input
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u202F]/g, ' ')
    // Strip characters outside Latin-1 / WinAnsi safe range
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

/**
 * Builds pre-filled Cerfa 15776*02 form data from Vehicle + GarageSettings
 */
export function buildInitialCerfaData(
  vehicle: Vehicle,
  garageSettings: GarageSettings = DEFAULT_GARAGE_SETTINGS
): Cerfa15776FormData {
  const todayIso = new Date().toISOString().split('T')[0];
  const sellerStreet = garageSettings.streetType?.trim()
    ? {
        streetType: garageSettings.streetType.trim(),
        streetName: (garageSettings.streetName || '').trim(),
      }
    : splitStreetTypeAndName(garageSettings.streetName);

  const buyer = vehicle.buyerInfo;
  const rawAddress = buyer?.address || '';
  const addrNumMatch = rawAddress.match(/^\s*(\d+[a-zA-Z]?)\s+/);
  const addrZipMatch = rawAddress.match(/\b(\d{5})\b/);
  const parsedStreetNum = buyer?.streetNumber || (addrNumMatch ? addrNumMatch[1] : '');
  const parsedPostal = buyer?.postalCode || (addrZipMatch ? addrZipMatch[1] : '');
  const buyerRawStreet =
    buyer?.streetName ||
    (rawAddress ? rawAddress.split(',')[0].replace(/^\s*\d+[a-zA-Z]?\s+/, '').trim() : '');
  const buyerStreet = splitStreetTypeAndName(buyerRawStreet);
  const parsedCityFromAddr = rawAddress
    ? rawAddress
        .split(',')
        .pop()
        ?.replace(/\b\d{5}\b/, '')
        .trim() || ''
    : '';
  const buyerCity = buyer?.city || parsedCityFromAddr;

  const saleDate = buyer?.saleDate || todayIso;
  const saleTime = buyer?.saleTime || '14:00';

  return {
    vehicle: {
      registrationNumber: (
        vehicle.registrationNumber ||
        (vehicle.vin && vehicle.vin.length <= 10 ? vehicle.vin : '')
      ).toUpperCase(),
      vin: (vehicle.vin || '').toUpperCase(),
      make: (vehicle.make || '').toUpperCase(),
      typeVariantVersion: vehicle.typeVariantVersion || vehicle.trim || vehicle.model || '',
      commercialDesignation: (vehicle.model || '').toUpperCase(),
      firstRegistrationDate: vehicle.year ? `${vehicle.year}-01-01` : '',
      nationalGenre: vehicle.nationalGenre || 'VP',
      bodywork: (vehicle.bodyType || 'CI').toUpperCase(),
      mileage: vehicle.mileage ?? 0,
      hasRegistrationCertificate: true,
      formulaNumber: (vehicle.formulaNumber || '').toUpperCase(),
      certificateDate: vehicle.certificateDate || '',
      absenceReason: '',
    },
    seller: (() => {
      const explicitDealProfile = buyer?.sellerProfileType;
      const cleanSiret = (garageSettings.siret || '').replace(/\s+/g, '');
      const sellerEntityType: 'physique' | 'morale' =
        explicitDealProfile === 'particulier'
          ? 'physique'
          : explicitDealProfile === 'micro_entrepreneur'
          ? cleanSiret.length > 0 || garageSettings.entityType !== 'physique'
            ? 'morale'
            : 'physique'
          : garageSettings.entityType === 'physique'
          ? 'physique'
          : 'morale';
      const formattedPhysiqueName = [garageSettings.lastName, garageSettings.firstName]
        .filter(Boolean)
        .join(' ')
        .trim()
        .toUpperCase();
      return {
        entityType: sellerEntityType,
        sex: sellerEntityType === 'physique' ? (garageSettings.sex || '') : '',
        nameOrCompany:
          sellerEntityType === 'physique'
            ? formattedPhysiqueName || (garageSettings.name || '').toUpperCase()
            : garageSettings.name || formattedPhysiqueName || '',
        siret: sellerEntityType === 'morale' ? cleanSiret : '',
        streetNumber: garageSettings.streetNumber || '',
        streetExtension: garageSettings.streetExtension || '',
        streetType: sellerStreet.streetType,
        streetName: sellerStreet.streetName,
        postalCode: garageSettings.postalCode || '',
        city: garageSettings.city || '',
        saleType: 'cession',
        saleDate,
        saleTime,
        signingCity: garageSettings.city || '',
        signingDate: saleDate,
        certifyAdminSituation: true,
        certifyNoTransformation: true,
        certifyVhuDestruction: false,
        vhuAgreementNumber: '',
        opposeProspecting: false,
      };
    })(),
    buyer: {
      entityType: buyer?.isCompany ? 'morale' : 'physique',
      sex: '',
      nameOrCompany: buyer?.fullName || '',
      siret: (buyer?.siret || '').replace(/\s+/g, ''),
      birthDate: buyer?.birthDate || '',
      birthPlace: buyer?.birthPlace || '',
      streetNumber: parsedStreetNum,
      streetExtension: '',
      streetType: buyerStreet.streetType,
      streetName: buyerStreet.streetName,
      postalCode: parsedPostal,
      city: buyerCity,
      signingCity: buyerCity || garageSettings.city || '',
      signingDate: saleDate,
      certifyAcquire: true,
      certifyInformedAdmin: true,
      opposeProspecting: false,
    },
  };
}

/**
 * Validates a specific step of the Cerfa 15776*02 wizard.
 * Returns an object mapping field keys to French error messages (empty object = valid).
 */
export function validateCerfaStep(
  step: 1 | 2 | 3,
  data: Cerfa15776FormData
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (!data.vehicle.registrationNumber.trim()) {
      errors.registrationNumber = 'Le numéro d’immatriculation (A) est requis.';
    }
    if (!data.vehicle.vin.trim()) {
      errors.vin = 'Le numéro d’identification VIN (E) est requis.';
    }
    if (!data.vehicle.make.trim()) {
      errors.make = 'La marque (D.1) est requise.';
    }
    if (data.vehicle.mileage === '' || Number(data.vehicle.mileage) < 0) {
      errors.mileage = 'Le kilométrage est requis.';
    }
    if (!data.vehicle.hasRegistrationCertificate && !data.vehicle.absenceReason.trim()) {
      errors.absenceReason = 'Veuillez indiquer le motif d’absence du certificat.';
    }
  }

  if (step === 2) {
    if (!data.seller.nameOrCompany.trim()) {
      errors.sellerName = 'Le nom ou la raison sociale du cédant est requis.';
    }
    if (data.seller.entityType === 'morale' && !data.seller.siret.trim()) {
      errors.sellerSiret = 'Le numéro SIRET est requis pour une personne morale.';
    }
    if (!data.seller.postalCode.trim() || !data.seller.city.trim()) {
      errors.sellerCity = 'Le code postal et la commune du cédant sont requis.';
    }
    if (!data.seller.saleDate.trim()) {
      errors.saleDate = 'La date de cession est requise.';
    }
    if (!data.seller.signingCity.trim()) {
      errors.sellerSigningCity = 'Le lieu de signature (Fait à) est requis.';
    }
  }

  if (step === 3) {
    if (!data.buyer.nameOrCompany.trim()) {
      errors.buyerName = 'Le nom ou la raison sociale de l’acquéreur est requis.';
    }
    if (data.buyer.entityType === 'physique' && !data.buyer.birthDate.trim()) {
      errors.buyerBirthDate = 'La date de naissance est requise pour une personne physique.';
    }
    if (!data.buyer.postalCode.trim() || !data.buyer.city.trim()) {
      errors.buyerCity = 'Le code postal et la commune de l’acquéreur sont requis.';
    }
  }

  return errors;
}

export interface CerfaTemplateOption {
  id: string;
  code: string;
  labelFr: string;
  labelRu: string;
  descriptionFr: string;
  descriptionRu: string;
}

export const CERFA_TEMPLATE_OPTIONS: CerfaTemplateOption[] = [
  {
    id: 'cerfa_15776_02',
    code: '15776*02',
    labelFr: 'Cerfa N° 15776*02 — Certificat de cession',
    labelRu: 'Cerfa N° 15776*02 — Акт передачи ТС (Cession)',
    descriptionFr: 'Formulaire officiel ANTS / SIV (Exemplaires 1 & 2 pré-remplis)',
    descriptionRu: 'Официальный бланк ANTS / SIV (экземпляры 1 и 2 с автозаполнением)',
  },
];

export function createDemoCerfaVehicle(userId: string = 'garage_pro_dealer'): Vehicle {
  return {
    id: 'demo_aligner',
    userId,
    make: 'PEUGEOT',
    model: '208 GT LINE',
    trim: 'UPHNK0MT129841',
    typeVariantVersion: 'UPHNK0MT129841',
    nationalGenre: 'VP',
    bodyType: 'CI',
    formulaNumber: '2021AB12345',
    certificateDate: '2021-09-20',
    year: 2020,
    mileage: 84500,
    vin: 'VF3UPHNK0MT129841',
    registrationNumber: 'AB-123-CD',
    purchaseDate: '2026-08-10',
    purchasePrice: 10400,
    targetSalePrice: 13990,
    status: 'for_sale',
    photos: [],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 10400,
    netProfit: 3590,
    marginPercentage: 25.66,
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * Complete, deterministic French dummy/test dataset for Superadmin Cerfa calibration.
 * Strictly independent of any garage inventory or user profile data.
 */
export function createCalibrationDummyCerfaData(): Cerfa15776FormData {
  return {
    vehicle: {
      registrationNumber: 'AB-123-CD',
      vin: 'VF3UPHNK0MT129841',
      make: 'PEUGEOT',
      typeVariantVersion: 'UPHNK0MT129841',
      commercialDesignation: '208 GT LINE',
      firstRegistrationDate: '2020-06-15',
      nationalGenre: 'VP',
      bodywork: 'CI',
      mileage: 84500,
      hasRegistrationCertificate: true,
      formulaNumber: '2021AB12345',
      certificateDate: '2021-09-20',
      absenceReason: '',
    },
    seller: {
      entityType: 'morale',
      sex: '',
      nameOrCompany: 'AUTOGARAGE MANAGER SARL',
      siret: '89412345600012',
      streetNumber: '12',
      streetExtension: '',
      streetType: 'RUE',
      streetName: "DE L'INDUSTRIE",
      postalCode: '75011',
      city: 'PARIS',
      saleType: 'cession',
      saleDate: '2026-11-17',
      saleTime: '14:30',
      signingCity: 'PARIS',
      signingDate: '2026-11-17',
      certifyAdminSituation: true,
      certifyNoTransformation: true,
      certifyVhuDestruction: false,
      vhuAgreementNumber: '',
      opposeProspecting: false,
    },
    buyer: {
      entityType: 'physique',
      sex: 'M',
      nameOrCompany: 'DUPONT JEAN-MARC',
      siret: '',
      birthDate: '1985-04-12',
      birthPlace: 'LYON',
      streetNumber: '45',
      streetExtension: '',
      streetType: 'AVENUE',
      streetName: 'DE LA RÉPUBLIQUE',
      postalCode: '69003',
      city: 'LYON',
      signingCity: 'PARIS',
      signingDate: '2026-11-17',
      certifyAcquire: true,
      certifyInformedAdmin: true,
      opposeProspecting: false,
    },
  };
}

export function pickCerfaTargetVehicle(params: {
  preferredVehicleId?: string | null;
  selectedVehicle?: Vehicle | null;
  vehicles?: Vehicle[];
  userId?: string;
}): { vehicle: Vehicle; isDemo: boolean } {
  const list = params.vehicles || [];
  if (params.preferredVehicleId) {
    const byId = list.find((v) => v.id === params.preferredVehicleId);
    if (byId) return { vehicle: byId, isDemo: false };
  }
  if (params.selectedVehicle) {
    const matching = list.find((v) => v.id === params.selectedVehicle?.id);
    return { vehicle: matching || params.selectedVehicle, isDemo: false };
  }
  if (list.length > 0) {
    return { vehicle: list[0], isDemo: false };
  }
  return { vehicle: createDemoCerfaVehicle(params.userId), isDemo: true };
}

export function buildVehicleCerfaPatch(
  vehicle: Vehicle,
  step1: Cerfa15776VehicleStep
): Partial<Pick<Vehicle, 'registrationNumber' | 'vin' | 'mileage'>> | null {
  const nextReg = step1.registrationNumber.trim().toUpperCase();
  const nextVin = step1.vin.trim().toUpperCase();
  const nextMileage =
    step1.mileage === '' || Number.isNaN(Number(step1.mileage))
      ? vehicle.mileage
      : Math.max(0, Number(step1.mileage));

  const patch: Partial<Pick<Vehicle, 'registrationNumber' | 'vin' | 'mileage'>> = {};
  if (nextReg !== (vehicle.registrationNumber || '').toUpperCase()) {
    patch.registrationNumber = nextReg;
  }
  if (nextVin && nextVin !== (vehicle.vin || '').toUpperCase()) {
    patch.vin = nextVin;
  }
  if (nextMileage !== vehicle.mileage) {
    patch.mileage = nextMileage;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

