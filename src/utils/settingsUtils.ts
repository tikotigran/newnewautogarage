import { GarageSettings, GeneralExpense, RepairTask, Vehicle } from '../types/garage';

export interface ValidationResult {
  valid: boolean;
  cleaned: string;
  error?: string;
}

export interface GarageBackupPayload {
  version: number;
  exportedAt: string;
  vehicles: Vehicle[];
  repairs: RepairTask[];
  expenses: GeneralExpense[];
  settings: GarageSettings;
}

/**
 * Validates a French SIRET number (must be exactly 14 digits after stripping whitespace).
 */
export function validateSiret(siret: string): ValidationResult {
  const cleaned = (siret || '').replace(/\s+/g, '');
  if (!/^\d{14}$/.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      error: 'Le numéro SIRET doit contenir exactement 14 chiffres.',
    };
  }
  return { valid: true, cleaned };
}

/**
 * Validates a French postal code (must be exactly 5 digits after stripping whitespace).
 */
export function validatePostalCode(postalCode: string): ValidationResult {
  const cleaned = (postalCode || '').replace(/\s+/g, '');
  if (!/^\d{5}$/.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      error: 'Le code postal doit contenir exactement 5 chiffres.',
    };
  }
  return { valid: true, cleaned };
}

/**
 * Validates Company Profile fields in Settings.
 * Returns a map of field key -> error message (empty if valid).
 */
export function validateGarageSettings(settings: GarageSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  const entityType = settings.entityType || 'morale';

  if (entityType === 'physique') {
    if (!settings.lastName?.trim()) {
      errors.lastName = 'Le nom est requis.';
    }
    if (!settings.firstName?.trim()) {
      errors.firstName = 'Le prénom est requis.';
    }
  } else {
    if (!settings.name?.trim()) {
      errors.name = 'La raison sociale est requise.';
    }

    const siretCheck = validateSiret(settings.siret);
    if (!siretCheck.valid && siretCheck.error) {
      errors.siret = siretCheck.error;
    }
  }

  if (!settings.streetName?.trim()) {
    errors.streetName = 'Le nom de la voie est requis.';
  }

  const zipCheck = validatePostalCode(settings.postalCode);
  if (!zipCheck.valid && zipCheck.error) {
    errors.postalCode = zipCheck.error;
  }

  if (!settings.city?.trim()) {
    errors.city = 'La commune est requise.';
  }

  if (!settings.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email.trim())) {
    errors.email = 'Une adresse e-mail valide est requise.';
  }

  return errors;
}

/**
 * Serializes full application data into a structured JSON backup string.
 */
export function serializeBackupPayload(payload: GarageBackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses and validates an imported JSON backup string.
 * Throws a descriptive error if the file is malformed or missing required collections.
 */
export function parseBackupPayload(rawJson: string): GarageBackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Fichier JSON invalide ou corrompu.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Format de sauvegarde non reconnu.');
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.vehicles)) {
    throw new Error('La sauvegarde doit contenir un tableau "vehicles".');
  }
  if (!obj.settings || typeof obj.settings !== 'object') {
    throw new Error('La sauvegarde doit contenir un objet "settings".');
  }

  return {
    version: typeof obj.version === 'number' ? obj.version : 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    vehicles: obj.vehicles as Vehicle[],
    repairs: Array.isArray(obj.repairs) ? (obj.repairs as RepairTask[]) : [],
    expenses: Array.isArray(obj.expenses) ? (obj.expenses as GeneralExpense[]) : [],
    settings: obj.settings as GarageSettings,
  };
}

/**
 * Converts vehicles list to a semicolon-delimited CSV string (Excel FR compatible).
 */
export function vehiclesToCsv(vehicles: Vehicle[]): string {
  const headers = [
    'ID',
    'Marque',
    'Modele',
    'Finition',
    'Annee',
    'Kilometrage',
    'VIN',
    'Statut',
    'PrixAchat',
    'PrixVenteCible',
    'TotalInvesti',
    'MargeNette',
    'DateAchat',
  ];

  const escapeCell = (val: unknown): string => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = vehicles.map((v) =>
    [
      v.id,
      v.make,
      v.model,
      v.trim,
      v.year,
      v.mileage,
      v.vin,
      v.status,
      v.purchasePrice,
      v.targetSalePrice,
      v.totalInvested,
      v.netProfit,
      v.purchaseDate,
    ]
      .map(escapeCell)
      .join(';')
  );

  return [headers.join(';'), ...rows].join('\n');
}
