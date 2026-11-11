/**
 * Centralized coordinate, font-size, and comb-box layout configuration
 * for the official French government Cerfa N° 15776*02 PDF template
 * (595.28 x 841.89 pt, applied identically to Exemplaire 1 & Exemplaire 2).
 */

export interface CerfaTextFieldConfig {
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  maxChars?: number;
}

export interface CerfaCombFieldConfig {
  x: number;
  y: number;
  stepX: number;
  maxChars: number;
  size: number;
  bold?: boolean;
}

export interface CerfaCheckboxConfig {
  x: number;
  y: number;
  size: number;
}

export const CERFA_15776_CONFIG = {
  templatePath: '/assets/aistudio/cerfa_15776-02__1__c28daa99.pdf',

  // ============================================================================
  // SECTION 1: LE VÉHICULE (à remplir par l'ancien propriétaire)
  // ============================================================================
  section1Vehicle: {
    // (A) Numéro d'immatriculation (9 comb boxes)
    registrationNumber: { x: 37, y: 722, stepX: 13.8, maxChars: 9, size: 8.5, bold: true } satisfies CerfaCombFieldConfig,
    // (E) Numéro d'identification du véhicule / VIN (17 comb boxes)
    vin: { x: 174, y: 722, stepX: 14.3, maxChars: 17, size: 8, bold: true } satisfies CerfaCombFieldConfig,
    // (B) Date de 1re immatriculation (DD MM YYYY)
    firstRegistrationDate: {
      dd: { x: 444, y: 722, stepX: 12.5, maxChars: 2, size: 8, bold: true } satisfies CerfaCombFieldConfig,
      mm: { x: 474, y: 722, stepX: 12.5, maxChars: 2, size: 8, bold: true } satisfies CerfaCombFieldConfig,
      yyyy: { x: 505, y: 722, stepX: 13.2, maxChars: 4, size: 8, bold: true } satisfies CerfaCombFieldConfig,
    },
    // (D.1) Marque
    make: { x: 38, y: 698, size: 8, bold: true, maxChars: 26 } satisfies CerfaTextFieldConfig,
    // (D.2) Type, variante, version
    typeVariantVersion: { x: 174, y: 698, size: 7.5, bold: false, maxChars: 30 } satisfies CerfaTextFieldConfig,
    // (J.1) Genre national
    nationalGenre: { x: 324, y: 698, size: 8, bold: true, maxChars: 12 } satisfies CerfaTextFieldConfig,
    // (D.3) Dénomination commerciale
    commercialDesignation: { x: 442, y: 698, size: 7.5, bold: true, maxChars: 22 } satisfies CerfaTextFieldConfig,
    // Kilométrage inscrit au compteur
    mileage: { x: 212, y: 674, size: 8.5, bold: true } satisfies CerfaTextFieldConfig,

    // Présence du certificat d'immatriculation
    certificate: {
      checkboxYes: { x: 36, y: 644, size: 9 } satisfies CerfaCheckboxConfig,
      checkboxNo: { x: 337, y: 644, size: 9 } satisfies CerfaCheckboxConfig,
      // Numéro de formule (9 cells after preprinted "2 0")
      formulaNumber: { x: 188, y: 644, stepX: 12.2, maxChars: 9, size: 8, bold: true } satisfies CerfaCombFieldConfig,
      // ou (I) Date du certificat d'immatriculation (DD MM YYYY)
      certificateDate: {
        dd: { x: 232, y: 620, stepX: 12, maxChars: 2, size: 7.5, bold: false } satisfies CerfaCombFieldConfig,
        mm: { x: 260, y: 620, stepX: 12, maxChars: 2, size: 7.5, bold: false } satisfies CerfaCombFieldConfig,
        yyyy: { x: 289, y: 620, stepX: 12, maxChars: 4, size: 7.5, bold: false } satisfies CerfaCombFieldConfig,
      },
      // Motif d'absence (2 lines)
      absenceReasonLine1: { x: 337, y: 629, size: 7.5, bold: false, maxChars: 48 } satisfies CerfaTextFieldConfig,
      absenceReasonLine2: { x: 337, y: 616, size: 7.5, bold: false, maxChars: 48 } satisfies CerfaTextFieldConfig,
    },
  },

  // ============================================================================
  // SECTION 2: ANCIEN PROPRIÉTAIRE (CÉDANT)
  // ============================================================================
  section2Seller: {
    checkboxes: {
      personnePhysique: { x: 35, y: 571, size: 9 } satisfies CerfaCheckboxConfig,
      sexM: { x: 286, y: 571, size: 8.5 } satisfies CerfaCheckboxConfig,
      sexF: { x: 308, y: 571, size: 8.5 } satisfies CerfaCheckboxConfig,
      personneMorale: { x: 35, y: 561, size: 9 } satisfies CerfaCheckboxConfig,
      certifyCeder: { x: 186, y: 469, size: 9 } satisfies CerfaCheckboxConfig,
      certifyDestruction: { x: 235, y: 469, size: 9 } satisfies CerfaCheckboxConfig,
      certifyAdminSituation: { x: 35, y: 418, size: 9 } satisfies CerfaCheckboxConfig,
      certifyNoTransformation: { x: 35, y: 397, size: 9 } satisfies CerfaCheckboxConfig,
      certifyVhuDestruction: { x: 35, y: 377, size: 9 } satisfies CerfaCheckboxConfig,
    },
    nameOrCompany: { x: 92, y: 542, size: 8, bold: true, maxChars: 48 } satisfies CerfaTextFieldConfig,
    siret: { x: 395, y: 542, stepX: 11.8, maxChars: 14, size: 7.5, bold: true } satisfies CerfaCombFieldConfig,
    address: {
      streetNumber: { x: 108, y: 514, size: 8, bold: false, maxChars: 6 } satisfies CerfaTextFieldConfig,
      streetExtension: { x: 156, y: 514, size: 8, bold: false, maxChars: 8 } satisfies CerfaTextFieldConfig,
      streetFull: { x: 280, y: 514, size: 8, bold: false, maxChars: 46 } satisfies CerfaTextFieldConfig,
      postalCode: { x: 109, y: 492, stepX: 12.2, maxChars: 5, size: 8, bold: true } satisfies CerfaCombFieldConfig,
      city: { x: 190, y: 492, size: 8, bold: false, maxChars: 32 } satisfies CerfaTextFieldConfig,
    },
    saleDateTime: {
      dd: { x: 48, y: 451, stepX: 11.5, maxChars: 2, size: 7.5, bold: true } satisfies CerfaCombFieldConfig,
      mm: { x: 72, y: 451, stepX: 11.5, maxChars: 2, size: 7.5, bold: true } satisfies CerfaCombFieldConfig,
      yyyy: { x: 96, y: 451, stepX: 11.5, maxChars: 4, size: 7.5, bold: true } satisfies CerfaCombFieldConfig,
      hours: { x: 155, y: 451, stepX: 11, maxChars: 2, size: 7.5, bold: true } satisfies CerfaCombFieldConfig,
      minutes: { x: 189, y: 451, stepX: 11, maxChars: 2, size: 7.5, bold: true } satisfies CerfaCombFieldConfig,
    },
    vhuAgreementNumber: { x: 144, y: 368, size: 7.5, bold: true, maxChars: 24 } satisfies CerfaTextFieldConfig,
    signatures: {
      // "Fait à ..., le ..." — signature box itself is intentionally left blank
      faitA: { x: 62, y: 327, size: 8, bold: false, maxChars: 26 } satisfies CerfaTextFieldConfig,
      faitLe: { x: 192, y: 327, size: 8, bold: false } satisfies CerfaTextFieldConfig,
    },
  },

  // ============================================================================
  // SECTION 3: NOUVEAU PROPRIÉTAIRE (ACQUÉREUR)
  // ============================================================================
  section3Buyer: {
    checkboxes: {
      personnePhysique: { x: 35, y: 240, size: 9 } satisfies CerfaCheckboxConfig,
      sexM: { x: 286, y: 240, size: 8.5 } satisfies CerfaCheckboxConfig,
      sexF: { x: 308, y: 240, size: 8.5 } satisfies CerfaCheckboxConfig,
      personneMorale: { x: 35, y: 230, size: 9 } satisfies CerfaCheckboxConfig,
      certifyAcquire: { x: 35, y: 111, size: 9 } satisfies CerfaCheckboxConfig,
      certifyInformedAdmin: { x: 35, y: 98, size: 9 } satisfies CerfaCheckboxConfig,
    },
    nameOrCompany: { x: 92, y: 212, size: 8, bold: true, maxChars: 48 } satisfies CerfaTextFieldConfig,
    siret: { x: 395, y: 212, stepX: 11.8, maxChars: 14, size: 7.5, bold: true } satisfies CerfaCombFieldConfig,
    birth: {
      dd: { x: 72, y: 192, stepX: 11.5, maxChars: 2, size: 7.5, bold: false } satisfies CerfaCombFieldConfig,
      mm: { x: 96, y: 192, stepX: 11.5, maxChars: 2, size: 7.5, bold: false } satisfies CerfaCombFieldConfig,
      yyyy: { x: 120, y: 192, stepX: 11.5, maxChars: 4, size: 7.5, bold: false } satisfies CerfaCombFieldConfig,
      place: { x: 184, y: 192, size: 8, bold: false, maxChars: 40 } satisfies CerfaTextFieldConfig,
    },
    address: {
      streetNumber: { x: 108, y: 167, size: 8, bold: false, maxChars: 6 } satisfies CerfaTextFieldConfig,
      streetExtension: { x: 156, y: 167, size: 8, bold: false, maxChars: 8 } satisfies CerfaTextFieldConfig,
      streetFull: { x: 280, y: 167, size: 8, bold: false, maxChars: 46 } satisfies CerfaTextFieldConfig,
      postalCode: { x: 109, y: 150, stepX: 12.2, maxChars: 5, size: 8, bold: true } satisfies CerfaCombFieldConfig,
      city: { x: 190, y: 150, size: 8, bold: false, maxChars: 32 } satisfies CerfaTextFieldConfig,
    },
    signatures: {
      // "Fait à ..., le ..." — signature box itself is intentionally left blank
      faitA: { x: 62, y: 72, size: 8, bold: false, maxChars: 26 } satisfies CerfaTextFieldConfig,
      faitLe: { x: 192, y: 72, size: 8, bold: false } satisfies CerfaTextFieldConfig,
    },
  },

  // ============================================================================
  // FOOTER CHECKBOXES
  // ============================================================================
  checkboxes: {
    opposeProspecting: { x: 511, y: 17, size: 9.5 } satisfies CerfaCheckboxConfig,
  },
} as const;

/**
 * Mutable config type for Visual Calibration / Aligner Mode
 */
type DeepMutable<T> = {
  -readonly [K in keyof T]: T[K] extends object ? DeepMutable<T[K]> : T[K];
};

export type Cerfa15776Config = DeepMutable<typeof CERFA_15776_CONFIG>;

export function cloneCerfaConfig(): Cerfa15776Config {
  return JSON.parse(JSON.stringify(CERFA_15776_CONFIG)) as Cerfa15776Config;
}

export interface CerfaAlignerFieldMeta {
  path: string;
  section: string;
  label: string;
}

export const CERFA_ALIGNER_FIELDS: CerfaAlignerFieldMeta[] = [
  // Section 1: Vehicle
  { path: 'section1Vehicle.registrationNumber', section: '1. Véhicule', label: '(A) Immatriculation' },
  { path: 'section1Vehicle.vin', section: '1. Véhicule', label: '(E) VIN' },
  { path: 'section1Vehicle.firstRegistrationDate.dd', section: '1. Véhicule', label: '(B) 1re immat. — Jour' },
  { path: 'section1Vehicle.firstRegistrationDate.mm', section: '1. Véhicule', label: '(B) 1re immat. — Mois' },
  { path: 'section1Vehicle.firstRegistrationDate.yyyy', section: '1. Véhicule', label: '(B) 1re immat. — Année' },
  { path: 'section1Vehicle.make', section: '1. Véhicule', label: '(D.1) Marque' },
  { path: 'section1Vehicle.typeVariantVersion', section: '1. Véhicule', label: '(D.2) Type / Variante' },
  { path: 'section1Vehicle.nationalGenre', section: '1. Véhicule', label: '(J.1) Genre national' },
  { path: 'section1Vehicle.commercialDesignation', section: '1. Véhicule', label: '(D.3) Dénomination' },
  { path: 'section1Vehicle.mileage', section: '1. Véhicule', label: 'Kilométrage' },
  { path: 'section1Vehicle.certificate.checkboxYes', section: '1. Véhicule', label: 'Certificat OUI [X]' },
  { path: 'section1Vehicle.certificate.formulaNumber', section: '1. Véhicule', label: 'N° de formule' },
  { path: 'section1Vehicle.certificate.checkboxNo', section: '1. Véhicule', label: 'Certificat NON [X]' },

  // Section 2: Seller
  { path: 'section2Seller.checkboxes.personneMorale', section: '2. Cédant', label: 'Personne morale [X]' },
  { path: 'section2Seller.checkboxes.personnePhysique', section: '2. Cédant', label: 'Personne physique [X]' },
  { path: 'section2Seller.nameOrCompany', section: '2. Cédant', label: 'Raison sociale / Nom' },
  { path: 'section2Seller.siret', section: '2. Cédant', label: 'N° SIRET (14 chiffres)' },
  { path: 'section2Seller.address.streetNumber', section: '2. Cédant', label: 'Adresse — N° de voie' },
  { path: 'section2Seller.address.streetExtension', section: '2. Cédant', label: 'Adresse — Extension' },
  { path: 'section2Seller.address.streetFull', section: '2. Cédant', label: 'Adresse — Type & Nom' },
  { path: 'section2Seller.address.postalCode', section: '2. Cédant', label: 'Adresse — Code postal' },
  { path: 'section2Seller.address.city', section: '2. Cédant', label: 'Adresse — Commune' },
  { path: 'section2Seller.checkboxes.certifyCeder', section: '2. Cédant', label: 'Case Céder [X]' },
  { path: 'section2Seller.saleDateTime.dd', section: '2. Cédant', label: 'Date cession — Jour' },
  { path: 'section2Seller.saleDateTime.mm', section: '2. Cédant', label: 'Date cession — Mois' },
  { path: 'section2Seller.saleDateTime.yyyy', section: '2. Cédant', label: 'Date cession — Année' },
  { path: 'section2Seller.saleDateTime.hours', section: '2. Cédant', label: 'Heure cession (HH)' },
  { path: 'section2Seller.saleDateTime.minutes', section: '2. Cédant', label: 'Minutes cession (MM)' },
  { path: 'section2Seller.checkboxes.certifyAdminSituation', section: '2. Cédant', label: 'Certif. sit. admin [X]' },
  { path: 'section2Seller.checkboxes.certifyNoTransformation', section: '2. Cédant', label: 'Non-transformation [X]' },
  { path: 'section2Seller.signatures.faitA', section: '2. Cédant', label: 'Fait à (Commune)' },
  { path: 'section2Seller.signatures.faitLe', section: '2. Cédant', label: 'Fait le (Date)' },

  // Section 3: Buyer
  { path: 'section3Buyer.checkboxes.personnePhysique', section: '3. Acquéreur', label: 'Personne physique [X]' },
  { path: 'section3Buyer.checkboxes.sexM', section: '3. Acquéreur', label: 'Sexe M [X]' },
  { path: 'section3Buyer.checkboxes.sexF', section: '3. Acquéreur', label: 'Sexe F [X]' },
  { path: 'section3Buyer.checkboxes.personneMorale', section: '3. Acquéreur', label: 'Personne morale [X]' },
  { path: 'section3Buyer.nameOrCompany', section: '3. Acquéreur', label: 'Nom / Raison sociale' },
  { path: 'section3Buyer.siret', section: '3. Acquéreur', label: 'N° SIRET' },
  { path: 'section3Buyer.birth.dd', section: '3. Acquéreur', label: 'Né(e) le — Jour' },
  { path: 'section3Buyer.birth.mm', section: '3. Acquéreur', label: 'Né(e) le — Mois' },
  { path: 'section3Buyer.birth.yyyy', section: '3. Acquéreur', label: 'Né(e) le — Année' },
  { path: 'section3Buyer.birth.place', section: '3. Acquéreur', label: 'Lieu de naissance' },
  { path: 'section3Buyer.address.streetNumber', section: '3. Acquéreur', label: 'Adresse — N° de voie' },
  { path: 'section3Buyer.address.streetExtension', section: '3. Acquéreur', label: 'Adresse — Extension' },
  { path: 'section3Buyer.address.streetFull', section: '3. Acquéreur', label: 'Adresse — Type & Nom' },
  { path: 'section3Buyer.address.postalCode', section: '3. Acquéreur', label: 'Adresse — Code postal' },
  { path: 'section3Buyer.address.city', section: '3. Acquéreur', label: 'Adresse — Commune' },
  { path: 'section3Buyer.checkboxes.certifyAcquire', section: '3. Acquéreur', label: 'Certifie acquérir [X]' },
  { path: 'section3Buyer.checkboxes.certifyInformedAdmin', section: '3. Acquéreur', label: 'Informé sit. admin [X]' },
  { path: 'section3Buyer.signatures.faitA', section: '3. Acquéreur', label: 'Fait à (Commune)' },
  { path: 'section3Buyer.signatures.faitLe', section: '3. Acquéreur', label: 'Fait le (Date)' },

  // Footer
  { path: 'checkboxes.opposeProspecting', section: 'Pied de page', label: 'Opposition prospection [X]' },
];
