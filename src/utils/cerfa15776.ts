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
    .replace(/\u00A0/g, ' ')
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
      typeVariantVersion: vehicle.trim || vehicle.model || '',
      commercialDesignation: (vehicle.model || '').toUpperCase(),
      firstRegistrationDate: vehicle.year ? `${vehicle.year}-01-01` : '',
      nationalGenre: 'VP',
      mileage: vehicle.mileage ?? 0,
      hasRegistrationCertificate: true,
      formulaNumber: '',
      certificateDate: '',
      absenceReason: '',
    },
    seller: (() => {
      const sellerEntityType = garageSettings.entityType === 'physique' ? 'physique' : 'morale';
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
            : garageSettings.name || '',
        siret: sellerEntityType === 'morale' ? (garageSettings.siret || '').replace(/\s+/g, '') : '',
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
