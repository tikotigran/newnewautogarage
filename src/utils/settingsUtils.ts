import {
  GarageSettings,
  GeneralExpense,
  Purchase,
  RepairTask,
  Vehicle,
} from '../types/garage';
import {
  AnalyticsTimeRange,
  CustomDateRange,
  isWithinTimeRange,
  resolveGeneralExpenseDate,
  resolveRepairExpenseDate,
} from './analytics';
import { calculateSaleTaxReport, getRealizedSalePrice, roundToTwo } from './finance';
import {
  normalizeFrenchTaxConfig,
  resolveDealSellerProfileType,
  resolveEffectiveSettingsForDeal,
} from './frenchTaxEngine';
import { Language, pickLocalized } from './i18nUtils';

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
 * Validates an international bank IBAN (14 to 34 alphanumeric characters starting with 2 letters + 2 digits).
 */
export function validateIban(iban: string): ValidationResult {
  const cleaned = (iban || '').replace(/[\s-]+/g, '').toUpperCase();
  if (!cleaned) {
    return { valid: true, cleaned: '' };
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      error: 'Format IBAN invalide (ex. FR76 3000 6000 0112 3456 7890 189).',
    };
  }
  return { valid: true, cleaned };
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

export function validateHexColor(hex: string): boolean {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test((hex || '').trim());
}

export function normalizeHexColor(hex: string | undefined, fallback: string): string {
  const trimmed = (hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function hexToRgbTuple(
  hex: string | undefined,
  fallback: [number, number, number]
): [number, number, number] {
  const normalized = normalizeHexColor(hex, '');
  if (!normalized || normalized.length !== 7) return fallback;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return fallback;
  return [r, g, b];
}

export function isLightRgb([r, g, b]: [number, number, number]): boolean {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65;
}

/**
 * Validates Company Profile fields in Settings.
 * Returns a map of field key -> error message (empty if valid).
 */
export function validateGarageSettings(settings: GarageSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  const entityType = settings.entityType || 'morale';

  if (settings.profileType === 'particulier') {
    if (!settings.lastName?.trim() && !settings.name?.trim()) {
      errors.lastName = 'Le nom est requis.';
    }
    if (!settings.firstName?.trim() && !settings.name?.trim()) {
      errors.firstName = 'Le prénom est requis.';
    }
  } else if (settings.profileType === 'micro_entrepreneur') {
    const hasPersonalName = Boolean(settings.lastName?.trim() && settings.firstName?.trim());
    if (!settings.name?.trim() && !hasPersonalName) {
      errors.name = 'Le nom commercial ou votre nom complet est requis.';
    }
    if (settings.siret?.trim()) {
      const siretCheck = validateSiret(settings.siret);
      if (!siretCheck.valid && siretCheck.error) {
        errors.siret = siretCheck.error;
      }
    }
  } else if (entityType === 'physique') {
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

  if (!settings.streetNumber?.trim()) {
    errors.streetNumber = 'Le numéro de voie (N° de voie) est requis.';
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

  if (!settings.email?.trim() || !validateEmail(settings.email)) {
    errors.email = 'Une adresse e-mail valide est requise.';
  }

  if (settings.iban?.trim()) {
    const ibanCheck = validateIban(settings.iban);
    if (!ibanCheck.valid && ibanCheck.error) {
      errors.iban = ibanCheck.error;
    }
  }

  if (settings.accountantEmail?.trim() && !validateEmail(settings.accountantEmail)) {
    errors.accountantEmail = "L'adresse e-mail de l'expert-comptable est invalide.";
  }

  return errors;
}

export function validatePersonalProfileEntry(profile: {
  lastName?: string;
  firstName?: string;
  postalCode?: string;
  email?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!profile.lastName?.trim()) errors.lastName = 'Le nom est requis.';
  if (!profile.firstName?.trim()) errors.firstName = 'Le prénom est requis.';
  if (profile.postalCode?.trim()) {
    const zipCheck = validatePostalCode(profile.postalCode);
    if (!zipCheck.valid && zipCheck.error) errors.postalCode = zipCheck.error;
  }
  if (profile.email?.trim() && !validateEmail(profile.email)) {
    errors.email = 'Une adresse e-mail valide est requise.';
  }
  return errors;
}

export function validateBusinessProfileEntry(profile: {
  name?: string;
  siret?: string;
  postalCode?: string;
  email?: string;
  iban?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!profile.name?.trim()) errors.name = "Le nom de l'entreprise est requis.";
  if (profile.siret?.trim()) {
    const siretCheck = validateSiret(profile.siret);
    if (!siretCheck.valid && siretCheck.error) errors.siret = siretCheck.error;
  }
  if (profile.postalCode?.trim()) {
    const zipCheck = validatePostalCode(profile.postalCode);
    if (!zipCheck.valid && zipCheck.error) errors.postalCode = zipCheck.error;
  }
  if (profile.email?.trim() && !validateEmail(profile.email)) {
    errors.email = 'Une adresse e-mail valide est requise.';
  }
  if (profile.iban?.trim()) {
    const ibanCheck = validateIban(profile.iban);
    if (!ibanCheck.valid && ibanCheck.error) errors.iban = ibanCheck.error;
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

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '');
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
      .map(escapeCsvCell)
      .join(';')
  );

  return [headers.join(';'), ...rows].join('\n');
}

export interface SalesJournalExportResult {
  count: number;
  totalRevenue: number;
  totalGrossProfit: number;
  totalNetProfit: number;
  csv: string;
}

export function buildSalesJournalCsv(params: {
  vehicles: Vehicle[];
  garageSettings: GarageSettings;
  timeRange: AnalyticsTimeRange;
  customRange?: CustomDateRange;
  now?: Date;
}): SalesJournalExportResult {
  const { vehicles, garageSettings, timeRange, customRange, now = new Date() } = params;

  const soldVehicles = vehicles
    .filter((v) => {
      if (v.status !== 'sold') return false;
      const saleDate = v.buyerInfo?.saleDate || v.updatedAt;
      return isWithinTimeRange(saleDate, timeRange, now, customRange);
    })
    .sort((a, b) =>
      (b.buyerInfo?.saleDate || b.updatedAt || '').localeCompare(
        a.buyerInfo?.saleDate || a.updatedAt || ''
      )
    );

  const headers = [
    'DateVente',
    'FactureRef',
    'Vehicule',
    'Immatriculation',
    'VIN',
    'ModeVente',
    'Acheteur',
    'PrixVenteTTC_EUR',
    'PrixAchat_EUR',
    'Reparations_EUR',
    'FraisDivers_EUR',
    'TotalInvesti_EUR',
    'MargeBrute_EUR',
    'URSSAF_VL_Estime_EUR',
    'TVA_EUR',
    'ResultatNetEstime_EUR',
  ];

  let totalRevenue = 0;
  let totalGrossProfit = 0;
  let totalNetProfit = 0;

  const lines = soldVehicles.map((v) => {
    const realized = roundToTwo(getRealizedSalePrice(v));
    const dealProfile = resolveDealSellerProfileType(v, garageSettings);
    const dealSettings = resolveEffectiveSettingsForDeal({
      vehicle: v,
      garageSettings,
    });
    const dealTaxConfig = normalizeFrenchTaxConfig(dealSettings);
    const existingSnap = v.buyerInfo?.taxSnapshot;
    const snapMatchesDeal =
      Boolean(existingSnap?.isHistoricalSnapshot) &&
      (!v.buyerInfo?.sellerProfileType ||
        (dealProfile === 'particulier'
          ? existingSnap?.taxRegime === 'none' || existingSnap?.legalStatus === 'particulier'
          : existingSnap?.taxRegime === 'micro' || existingSnap?.legalStatus === 'micro_entreprise'));

    const report = calculateSaleTaxReport({
      salePrice: realized,
      purchasePrice: Number(v.purchasePrice) || 0,
      repairCostTotal: Number(v.repairCostTotal) || 0,
      generalExpensesTotal: Number(v.generalExpensesTotal) || 0,
      taxRegime: dealSettings.taxRegime,
      taxRatePercent: dealSettings.taxRatePercent,
      frenchTaxConfig: dealTaxConfig,
      vatRegime: v.buyerInfo?.vatRegime,
      vatRatePercent: v.buyerInfo?.vatRatePercent,
      taxSnapshot: snapMatchesDeal ? existingSnap : undefined,
    });

    totalRevenue = roundToTwo(totalRevenue + report.salePrice);
    totalGrossProfit = roundToTwo(totalGrossProfit + report.grossMargin);
    totalNetProfit = roundToTwo(totalNetProfit + report.netProfitAfterTax);

    const saleYear = v.buyerInfo?.saleDate?.slice(0, 4) || String(v.year || new Date().getFullYear());
    const suffix = (v.vin || v.id || '001').replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
    const invoiceRef = `FAC-${saleYear}-${suffix || '001'}`;

    return [
      v.buyerInfo?.saleDate || '',
      invoiceRef,
      `${v.make} ${v.model} ${v.trim || ''}`.trim(),
      v.registrationNumber || '',
      v.vin || '',
      dealProfile === 'particulier' ? 'Particulier' : 'Micro-entreprise (Pro)',
      v.buyerInfo?.fullName || '',
      report.salePrice,
      report.purchasePrice,
      report.repairCostTotal,
      report.generalExpensesTotal,
      roundToTwo(report.purchasePrice + report.repairCostTotal + report.generalExpensesTotal),
      report.grossMargin,
      roundToTwo(report.urssafAmount + report.versementLiberatoireAmount),
      report.vatAmount,
      report.netProfitAfterTax,
    ]
      .map(escapeCsvCell)
      .join(';');
  });

  return {
    count: soldVehicles.length,
    totalRevenue,
    totalGrossProfit,
    totalNetProfit,
    csv: [headers.join(';'), ...lines].join('\n'),
  };
}

export interface ExpensesJournalExportResult {
  count: number;
  totalAmount: number;
  csv: string;
}

export function buildExpensesJournalCsv(params: {
  vehicles: Vehicle[];
  repairs: RepairTask[];
  expenses: GeneralExpense[];
  purchases?: Purchase[];
  timeRange: AnalyticsTimeRange;
  customRange?: CustomDateRange;
  now?: Date;
}): ExpensesJournalExportResult {
  const {
    vehicles,
    repairs,
    expenses,
    purchases = [],
    timeRange,
    customRange,
    now = new Date(),
  } = params;

  const vehicleMap = new Map<string, Vehicle>();
  for (const v of vehicles) {
    vehicleMap.set(v.id, v);
  }

  interface ExpenseRowItem {
    date: string;
    sourceType: string;
    category: string;
    vehicleLabel: string;
    vinOrImmat: string;
    description: string;
    amount: number;
  }

  const items: ExpenseRowItem[] = [];

  for (const r of repairs) {
    const amount = roundToTwo(
      Number(r.totalCost ?? (Number(r.partsCost) || 0) + (Number(r.laborCost) || 0)) || 0
    );
    if (amount <= 0) continue;
    const veh = vehicleMap.get(r.vehicleId);
    const effectiveDate = resolveRepairExpenseDate(r, veh);
    if (!isWithinTimeRange(effectiveDate, timeRange, now, customRange)) continue;
    items.push({
      date: effectiveDate.slice(0, 10),
      sourceType: 'Reparation',
      category: r.categoryPreset || 'atelier',
      vehicleLabel: veh ? `${veh.make} ${veh.model}`.trim() : r.vehicleId,
      vinOrImmat: veh?.registrationNumber || veh?.vin || '',
      description: r.title,
      amount,
    });
  }

  for (const e of expenses) {
    const amount = roundToTwo(Number(e.amount) || 0);
    if (amount <= 0) continue;
    const veh = vehicleMap.get(e.vehicleId);
    const effectiveDate = resolveGeneralExpenseDate(e, veh);
    if (!isWithinTimeRange(effectiveDate, timeRange, now, customRange)) continue;
    items.push({
      date: effectiveDate.slice(0, 10),
      sourceType: 'Frais annexe',
      category: e.category || 'other',
      vehicleLabel: veh ? `${veh.make} ${veh.model}`.trim() : e.vehicleId,
      vinOrImmat: veh?.registrationNumber || veh?.vin || '',
      description: e.description,
      amount,
    });
  }

  for (const p of purchases) {
    const amount = roundToTwo(Number(p.amount) || 0);
    if (amount <= 0) continue;
    if (!isWithinTimeRange(p.date, timeRange, now, customRange)) continue;
    items.push({
      date: (p.date || '').slice(0, 10),
      sourceType: `Achat fournisseur (${p.supplierName})`,
      category: p.category || 'other',
      vehicleLabel: p.vehicleLabel || '',
      vinOrImmat: p.invoiceNumber || '',
      description: p.description,
      amount,
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));

  const totalAmount = roundToTwo(items.reduce((sum, item) => sum + item.amount, 0));

  const headers = [
    'Date',
    'Type',
    'Categorie',
    'Vehicule',
    'Immat_VIN_Ref',
    'Description',
    'Montant_EUR',
  ];

  const lines = items.map((item) =>
    [
      item.date,
      item.sourceType,
      item.category,
      item.vehicleLabel,
      item.vinOrImmat,
      item.description,
      item.amount,
    ]
      .map(escapeCsvCell)
      .join(';')
  );

  return {
    count: items.length,
    totalAmount,
    csv: [headers.join(';'), ...lines].join('\n'),
  };
}

export function buildAccountantMailtoUrl(params: {
  accountantEmail: string;
  garageName: string;
  siret?: string;
  periodLabel: string;
  soldCount: number;
  totalRevenue: number;
  expensesCount: number;
  totalExpenses: number;
  lang?: Language;
}): string {
  const {
    accountantEmail,
    garageName,
    siret,
    periodLabel,
    soldCount,
    totalRevenue,
    expensesCount,
    totalExpenses,
    lang = 'fr',
  } = params;

  const safeEmail = encodeURIComponent(accountantEmail.trim());
  const companyTitle = garageName.trim() || 'AutoGarage';
  const subject = encodeURIComponent(
    pickLocalized(lang, {
      fr: `[${companyTitle}] Exports comptables — ${periodLabel}`,
      ru: `[${companyTitle}] Бухгалтерская выгрузка — ${periodLabel}`,
      hy: `[${companyTitle}] Հաշվապահական արտահանում — ${periodLabel}`,
      ka: `[${companyTitle}] ბუღალტრული ექსპორტი — ${periodLabel}`,
    })
  );

  const bodyText = pickLocalized(lang, {
    fr: [
      `Bonjour,`,
      ``,
      `Veuillez trouver ci-dessous le récapitulatif de gestion pour ${companyTitle}${siret ? ` (SIRET : ${siret})` : ''} — Période : ${periodLabel}.`,
      ``,
      `- Journal des ventes : ${soldCount} vente(s) | Chiffre d'affaires : ${totalRevenue.toFixed(2)} €`,
      `- Journal des dépenses : ${expensesCount} ligne(s) | Total : ${totalExpenses.toFixed(2)} €`,
      ``,
      `Les fichiers CSV (Journal des ventes & Dépenses) ont été téléchargés sur mon poste pour mise en pièce jointe à ce message.`,
      ``,
      `Note : Ces exports CSV sont fournis à titre indicatif pour le suivi de gestion et ne remplacent pas les déclarations comptables officielles.`,
    ].join('\n'),
    ru: [
      `Здравствуйте,`,
      ``,
      `Направляю сводку по управленческому учёту для ${companyTitle}${siret ? ` (SIRET: ${siret})` : ''} за период: ${periodLabel}.`,
      ``,
      `- Журнал продаж: ${soldCount} продаж(и) | Выручка: ${totalRevenue.toFixed(2)} €`,
      `- Журнал расходов: ${expensesCount} записей | Итого: ${totalExpenses.toFixed(2)} €`,
      ``,
      `CSV-файлы (Журнал продаж и Расходы) выгружены для прикрепления к этому письму.`,
      ``,
      `Примечание: данные CSV носят информационный характер и не заменяют официальную бухгалтерскую отчётность.`,
    ].join('\n'),
    hy: [
      `Բարև Ձեզ,`,
      ``,
      `Ստորև ներկայացված է ${companyTitle}-ի ամփոփագիրը${siret ? ` (SIRET՝ ${siret})` : ''} — Ժամանակաշրջան՝ ${periodLabel}:`,
      ``,
      `- Վաճառքների մատյան՝ ${soldCount} գործարք | Շրջանառություն՝ ${totalRevenue.toFixed(2)} €`,
      `- Ծախսերի մատյան՝ ${expensesCount} գրառում | Ընդամենը՝ ${totalExpenses.toFixed(2)} €`,
      ``,
      `CSV ֆայլերը ներբեռնված են կցելու համար։`,
    ].join('\n'),
    ka: [
      `გამარջობა,`,
      ``,
      `გიგზავნით მართვის შეჯამებას ${companyTitle}-სთვის${siret ? ` (SIRET: ${siret})` : ''} — პერიოდი: ${periodLabel}:`,
      ``,
      `- გაყიდვების ჟურნალი: ${soldCount} გაყიდვა | ბრუნვა: ${totalRevenue.toFixed(2)} €`,
      `- ხარჯების ჟურნალი: ${expensesCount} ჩანაწერი | სულ: ${totalExpenses.toFixed(2)} €`,
      ``,
      `CSV ფაილები ჩამოტვირთულია წერილზე დასართავად.`,
    ].join('\n'),
  });

  return `mailto:${safeEmail}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
}

