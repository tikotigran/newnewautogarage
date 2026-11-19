import * as XLSX from 'xlsx';
import {
  BackupSnapshotCounts,
  ChangeLogFieldDiff,
  FullGarageBackupV2,
  GarageDocument,
  GarageSettings,
  GeneralExpense,
  Purchase,
  RepairTask,
  Supplier,
  VatRegime,
  Vehicle,
} from '../types/garage';
import { DealershipAnalyticsReport } from './analytics';
import { calculateSaleTaxReport, getEffectiveSalePrice, getRealizedSalePrice, roundToTwo } from './finance';
import {
  calculateFrenchVat,
  FRENCH_TAX_DEFAULTS,
  normalizeFrenchTaxConfig,
  resolveDealSellerProfileType,
  resolveEffectiveSettingsForDeal,
} from './frenchTaxEngine';
import { DEFAULT_GARAGE_ID } from './garageUtils';
import { Language, pickLocalized } from './i18nUtils';

export interface VehicleExportRow {
  ID: string;
  Marque: string;
  Modele: string;
  Finition: string;
  Annee: number;
  Kilometrage: number;
  Immatriculation: string;
  VIN: string;
  Statut: string;
  DateAchat: string;
  PrixAchat: number;
  CoutReparations: number;
  FraisGeneraux: number;
  TotalInvesti: number;
  PrixVenteCible: number;
  DateVente: string;
  PrixVenteFinal: number;
  MargeBrute: number;
  Acheteur: string;
  EmailAcheteur: string;
}

export interface FinancialLedgerRow {
  ID: string;
  Vehicule: string;
  VIN: string;
  Immatriculation: string;
  Statut: string;
  DateAchat: string;
  DateVente: string;
  ChiffreAffaires: number;
  PrixAchat: number;
  CoutReparations: number;
  FraisDivers: number;
  TotalInvesti: number;
  MargeBrute: number;
  ProfitAvantImpots_EUR: number;
  RegimeFiscal: string;
  RegimeTVA: string;
  TVA_EUR: number;
  URSSAF_EUR: number;
  VersementLiberatoire_EUR: number;
  IS_Annuel_Contexte: string;
  ImpotEstime: number;
  BeneficeNet: number;
  MargePourcent: number;
  ROIPourcent: number;
}

export function buildVehiclesExportRows(vehicles: Vehicle[]): VehicleExportRow[] {
  return vehicles.map((v) => {
    const realized = getRealizedSalePrice(v);
    const grossMargin =
      v.status === 'sold' && realized > 0
        ? roundToTwo(realized - (v.totalInvested || 0))
        : roundToTwo((v.targetSalePrice || 0) - (v.totalInvested || 0));

    return {
      ID: v.id,
      Marque: v.make || '',
      Modele: v.model || '',
      Finition: v.trim || '',
      Annee: Number(v.year) || 0,
      Kilometrage: Number(v.mileage) || 0,
      Immatriculation: v.registrationNumber || '',
      VIN: v.vin || '',
      Statut: v.status,
      DateAchat: v.purchaseDate || '',
      PrixAchat: roundToTwo(Number(v.purchasePrice) || 0),
      CoutReparations: roundToTwo(Number(v.repairCostTotal) || 0),
      FraisGeneraux: roundToTwo(Number(v.generalExpensesTotal) || 0),
      TotalInvesti: roundToTwo(Number(v.totalInvested) || 0),
      PrixVenteCible: roundToTwo(Number(v.targetSalePrice) || 0),
      DateVente: v.buyerInfo?.saleDate || '',
      PrixVenteFinal: roundToTwo(realized),
      MargeBrute: grossMargin,
      Acheteur: v.buyerInfo?.fullName || '',
      EmailAcheteur: v.buyerInfo?.email || '',
    };
  });
}

export function buildFinancialLedgerRows(
  vehicles: Vehicle[],
  garageSettings: Pick<GarageSettings, 'taxRegime' | 'taxRatePercent' | 'frenchTaxConfig' | 'profileType' | 'legalStatus'>
): FinancialLedgerRow[] {
  return vehicles.map((v) => {
    const isSold = v.status === 'sold';
    const revenue = isSold ? getRealizedSalePrice(v) : getEffectiveSalePrice(v);
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

    const taxReport = calculateSaleTaxReport({
      salePrice: revenue,
      purchasePrice: v.purchasePrice || 0,
      repairCostTotal: v.repairCostTotal || 0,
      generalExpensesTotal: v.generalExpensesTotal || 0,
      taxRegime: dealSettings.taxRegime,
      taxRatePercent: dealSettings.taxRatePercent,
      frenchTaxConfig: dealTaxConfig,
      vatRegime: v.buyerInfo?.vatRegime,
      vatRatePercent: v.buyerInfo?.vatRatePercent,
      taxSnapshot: isSold && snapMatchesDeal ? existingSnap : undefined,
    });
    const totalInvested = roundToTwo(
      taxReport.purchasePrice + taxReport.repairCostTotal + taxReport.generalExpensesTotal
    );
    const marginPercent =
      revenue > 0 ? roundToTwo((taxReport.netProfitAfterTax / revenue) * 100) : 0;
    const roiPercent =
      totalInvested > 0 && revenue > 0
        ? roundToTwo((taxReport.netProfitAfterTax / totalInvested) * 100)
        : 0;

    return {
      ID: v.id,
      Vehicule: `${v.make} ${v.model} ${v.trim || ''}`.trim(),
      VIN: v.vin || '',
      Immatriculation: v.registrationNumber || '',
      Statut: v.status,
      DateAchat: v.purchaseDate || '',
      DateVente: isSold ? v.buyerInfo?.saleDate || '' : '',
      ChiffreAffaires: isSold ? taxReport.salePrice : 0,
      PrixAchat: taxReport.purchasePrice,
      CoutReparations: taxReport.repairCostTotal,
      FraisDivers: taxReport.generalExpensesTotal,
      TotalInvesti: totalInvested,
      MargeBrute: isSold ? taxReport.grossMargin : 0,
      ProfitAvantImpots_EUR: isSold ? taxReport.grossMargin : 0,
      RegimeFiscal: taxReport.taxLabel,
      RegimeTVA: taxReport.vatRegime,
      TVA_EUR: isSold ? taxReport.vatAmount : 0,
      URSSAF_EUR: isSold ? taxReport.urssafAmount : 0,
      VersementLiberatoire_EUR: isSold ? taxReport.versementLiberatoireAmount : 0,
      IS_Annuel_Contexte: isSold ? taxReport.corporateIsContextNote || '' : '',
      ImpotEstime: isSold ? taxReport.taxAmount : 0,
      BeneficeNet: isSold ? taxReport.netProfitAfterTax : 0,
      MargePourcent: isSold ? marginPercent : 0,
      ROIPourcent: isSold ? roiPercent : 0,
    };
  });
}

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '');
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function financialLedgerToCsv(
  vehicles: Vehicle[],
  garageSettings: Pick<GarageSettings, 'taxRegime' | 'taxRatePercent' | 'frenchTaxConfig' | 'profileType' | 'legalStatus'>
): string {
  const rows = buildFinancialLedgerRows(vehicles, garageSettings);
  const headers = [
    'ID',
    'Vehicule',
    'VIN',
    'Immatriculation',
    'Statut',
    'DateAchat',
    'DateVente',
    'ChiffreAffaires_EUR',
    'PrixAchat_EUR',
    'CoutReparations_EUR',
    'FraisDivers_EUR',
    'TotalInvesti_EUR',
    'MargeBrute_EUR',
    'RegimeFiscal',
    'RegimeTVA',
    'TVA_EUR',
    'URSSAF_EUR',
    'VersementLiberatoire_EUR',
    'ImpotEstime_EUR',
    'BeneficeNet_EUR',
    'IS_Annuel_Contexte',
    'MargeNet_Pct',
    'ROI_Pct',
  ];

  const lines = rows.map((r) =>
    [
      r.ID,
      r.Vehicule,
      r.VIN,
      r.Immatriculation,
      r.Statut,
      r.DateAchat,
      r.DateVente,
      r.ChiffreAffaires,
      r.PrixAchat,
      r.CoutReparations,
      r.FraisDivers,
      r.TotalInvesti,
      r.MargeBrute,
      r.RegimeFiscal,
      r.RegimeTVA,
      r.TVA_EUR,
      r.URSSAF_EUR,
      r.VersementLiberatoire_EUR,
      r.ImpotEstime,
      r.BeneficeNet,
      r.IS_Annuel_Contexte,
      r.MargePourcent,
      r.ROIPourcent,
    ]
      .map(escapeCsvCell)
      .join(';')
  );

  return [headers.join(';'), ...lines].join('\n');
}

export function buildVehiclesWorkbookBytes(
  vehicles: Vehicle[],
  repairs: RepairTask[] = [],
  expenses: GeneralExpense[] = []
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const vehicleRows = buildVehiclesExportRows(vehicles);
  const vehicleSheet = XLSX.utils.json_to_sheet(
    vehicleRows.length > 0
      ? vehicleRows
      : [
          {
            ID: '',
            Marque: '',
            Modele: '',
            Finition: '',
            Annee: 0,
            Kilometrage: 0,
            Immatriculation: '',
            VIN: '',
            Statut: '',
            DateAchat: '',
            PrixAchat: 0,
            CoutReparations: 0,
            FraisGeneraux: 0,
            TotalInvesti: 0,
            PrixVenteCible: 0,
            DateVente: '',
            PrixVenteFinal: 0,
            MargeBrute: 0,
            Acheteur: '',
            EmailAcheteur: '',
          },
        ]
  );
  XLSX.utils.book_append_sheet(wb, vehicleSheet, 'Vehicules');

  const repairRows = repairs.map((r) => ({
    ID: r.id,
    VehiculeID: r.vehicleId,
    Intitule: r.title,
    Statut: r.status,
    Pieces_EUR: roundToTwo(Number(r.partsCost) || 0),
    MainOeuvre_EUR: roundToTwo(Number(r.laborCost) || 0),
    Total_EUR: roundToTwo(Number(r.totalCost) || 0),
    Notes: r.notes || '',
  }));
  const repairSheet = XLSX.utils.json_to_sheet(
    repairRows.length > 0
      ? repairRows
      : [{ ID: '', VehiculeID: '', Intitule: '', Statut: '', Pieces_EUR: 0, MainOeuvre_EUR: 0, Total_EUR: 0, Notes: '' }]
  );
  XLSX.utils.book_append_sheet(wb, repairSheet, 'Reparations');

  const expenseRows = expenses.map((e) => ({
    ID: e.id,
    VehiculeID: e.vehicleId,
    Categorie: e.category,
    Description: e.description,
    Date: e.date,
    Montant_EUR: roundToTwo(Number(e.amount) || 0),
  }));
  const expenseSheet = XLSX.utils.json_to_sheet(
    expenseRows.length > 0
      ? expenseRows
      : [{ ID: '', VehiculeID: '', Categorie: '', Description: '', Date: '', Montant_EUR: 0 }]
  );
  XLSX.utils.book_append_sheet(wb, expenseSheet, 'Frais_Divers');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

export function buildFinancialWorkbookBytes(params: {
  analytics: DealershipAnalyticsReport;
  vehicles: Vehicle[];
  garageSettings: GarageSettings;
  repairs?: RepairTask[];
  expenses?: GeneralExpense[];
  purchases?: Purchase[];
  periodLabel?: string;
}): Uint8Array {
  const {
    analytics,
    vehicles,
    garageSettings,
    repairs = [],
    expenses = [],
    purchases = [],
    periodLabel = 'Periode selectionnee',
  } = params;

  const wb = XLSX.utils.book_new();

  // Sheet 1: P&L Summary strictly separating Revenue / Gross Profit / Net Profit
  const summaryRows = [
    {
      Indicateur: 'Garage',
      Valeur: garageSettings.name,
      Detail: garageSettings.siret ? `SIRET ${garageSettings.siret}` : 'Profil Particulier / AutoGarage',
    },
    { Indicateur: 'Periode analysee', Valeur: periodLabel, Detail: new Date().toISOString().slice(0, 10) },
    { Indicateur: 'Valeur stock (Prix cible)', Valeur: analytics.inventory.totalStockValue, Detail: `${analytics.inventory.activeCount} vehicules en stock` },
    { Indicateur: 'Capital immobilise en stock', Valeur: analytics.inventory.totalInvestedInStock, Detail: 'Achats + Reparations + Frais' },
    { Indicateur: 'Profit potentiel du stock', Valeur: analytics.inventory.totalPotentialProfit, Detail: 'Estimation avant cession' },
    { Indicateur: '1. Chiffre d affaires (Revenue)', Valeur: analytics.salesPerformance.revenue, Detail: `${analytics.salesPerformance.soldCount} ventes realisees` },
    { Indicateur: '2. Marge brute avant impots (Profit Before Taxes)', Valeur: analytics.salesPerformance.grossProfit, Detail: 'Revenue - Cout de revient vehicules vendus' },
    { Indicateur: 'TVA estimee / collectee (TVA)', Valeur: analytics.salesPerformance.vatAmount, Detail: 'Separee du CA et du resultat fiscal' },
    { Indicateur: 'Cotisations URSSAF (Micro)', Valeur: analytics.salesPerformance.urssafAmount, Detail: 'Sur chiffre d affaires (achat/revente)' },
    { Indicateur: 'Versement liberatoire IR (Micro)', Valeur: analytics.salesPerformance.versementLiberatoireAmount, Detail: 'Option sur CA si activee' },
    { Indicateur: 'IR Micro-BIC estime separement (si VL = NON)', Valeur: analytics.salesPerformance.microBicEstimatedIrAmount, Detail: 'Apres abattement forfaitaire 71%' },
    ...(analytics.salesPerformance.corporateIsAmount > 0
      ? [
          {
            Indicateur: 'Impot sur les Societes - IS (historique)',
            Valeur: analytics.salesPerformance.corporateIsAmount,
            Detail: 'Donnees historiques archivees',
          },
        ]
      : []),
    { Indicateur: 'Total Impots & Taxes estimes', Valeur: analytics.salesPerformance.taxAmount, Detail: analytics.salesPerformance.taxLabel },
    { Indicateur: '3. Benefice net (Net Profit)', Valeur: analytics.salesPerformance.netProfit, Detail: 'Marge brute - Impots estimes' },
    { Indicateur: 'Marge nette moyenne / vehicule', Valeur: analytics.salesPerformance.averageNetMarginEuro, Detail: `${analytics.salesPerformance.netMarginPercent.toFixed(1)}%` },
    { Indicateur: 'Delai moyen de vente (jours)', Valeur: analytics.salesPerformance.averageDaysToSell ?? 0, Detail: 'Rotation moyenne' },
    { Indicateur: 'Cash Flow Entrees (Inflow)', Valeur: analytics.cashFlow.inflow, Detail: 'Encaissements ventes' },
    { Indicateur: 'Cash Flow Sorties (Outflow)', Valeur: analytics.cashFlow.outflow, Detail: 'Achats + Travaux + Frais + Taxes' },
    { Indicateur: 'Cash Flow Net', Valeur: analytics.cashFlow.netCashFlow, Detail: 'Tresorerie nette sur la periode' },
    { Indicateur: 'Avertissement conformite', Valeur: 'Estimation interne uniquement', Detail: FRENCH_TAX_DEFAULTS.DISCLAIMER_FR },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Synthese_PnL');

  // Sheet 2: Vehicle Sales & Margins Ledger
  const ledgerRows = buildFinancialLedgerRows(vehicles, garageSettings);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      ledgerRows.length > 0
        ? ledgerRows
        : [
            {
              ID: '',
              Vehicule: '',
              VIN: '',
              Immatriculation: '',
              Statut: '',
              DateAchat: '',
              DateVente: '',
              ChiffreAffaires: 0,
              PrixAchat: 0,
              CoutReparations: 0,
              FraisDivers: 0,
              TotalInvesti: 0,
              MargeBrute: 0,
              ProfitAvantImpots_EUR: 0,
              RegimeFiscal: '',
              RegimeTVA: '',
              TVA_EUR: 0,
              URSSAF_EUR: 0,
              VersementLiberatoire_EUR: 0,
              IS_Annuel_Contexte: '',
              ImpotEstime: 0,
              BeneficeNet: 0,
              MargePourcent: 0,
              ROIPourcent: 0,
            },
          ]
    ),
    'Ventes_Marges'
  );

  // Sheet 3: Combined Outflows (Repairs, Expenses, Purchases)
  const outflowRows = [
    ...repairs.map((r) => ({
      Source: 'Reparation',
      ID: r.id,
      VehiculeID: r.vehicleId,
      Libelle: r.title,
      Date: r.createdAt.slice(0, 10),
      Montant_EUR: roundToTwo(Number(r.totalCost) || 0),
    })),
    ...expenses.map((e) => ({
      Source: `Frais (${e.category})`,
      ID: e.id,
      VehiculeID: e.vehicleId,
      Libelle: e.description,
      Date: e.date,
      Montant_EUR: roundToTwo(Number(e.amount) || 0),
    })),
    ...purchases.map((p) => ({
      Source: `Achat (${p.supplierName})`,
      ID: p.id,
      VehiculeID: p.vehicleId || '',
      Libelle: p.description,
      Date: p.date,
      Montant_EUR: roundToTwo(Number(p.amount) || 0),
    })),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      outflowRows.length > 0
        ? outflowRows
        : [{ Source: '', ID: '', VehiculeID: '', Libelle: '', Date: '', Montant_EUR: 0 }]
    ),
    'Depenses_Achats'
  );

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

/**
 * Structured field-level diff helper for Entity Change Log
 */
const IGNORED_DIFF_KEYS = new Set([
  'updatedAt',
  'createdAt',
  'photos',
  'documents',
  'fileUrl',
  'invoiceProofUrl',
  'vehicleDocuments',
]);

function stringifyDiffValue(val: unknown): string {
  if (val === undefined || val === null || val === '') return '—';
  if (typeof val === 'object') {
    try {
      const json = JSON.stringify(val);
      return json.length > 140 ? `${json.slice(0, 137)}...` : json;
    } catch {
      return '[object]';
    }
  }
  const str = String(val);
  return str.length > 140 ? `${str.slice(0, 137)}...` : str;
}

export function computeEntityFieldDiffs(
  beforeObj: Record<string, unknown> | null | undefined,
  afterObj: Record<string, unknown> | null | undefined,
  keysToInspect?: string[]
): ChangeLogFieldDiff[] {
  const before = beforeObj || {};
  const after = afterObj || {};
  const candidateKeys = keysToInspect
    ? keysToInspect
    : Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  const diffs: ChangeLogFieldDiff[] = [];
  for (const key of candidateKeys) {
    if (IGNORED_DIFF_KEYS.has(key)) continue;
    const oldStr = stringifyDiffValue(before[key]);
    const newStr = stringifyDiffValue(after[key]);
    if (oldStr !== newStr) {
      diffs.push({
        field: key,
        oldValue: oldStr,
        newValue: newStr,
      });
    }
  }
  return diffs;
}

/**
 * French e-Invoicing / Factur-X (EN 16931 / UN/CEFACT CII D16B) Readiness & Generator
 */
export interface FacturXCheckItem {
  id: string;
  labelFr: string;
  labelRu: string;
  labelHy: string;
  labelKa: string;
  passed: boolean;
  valuePreview: string;
}

export interface FacturXReadinessResult {
  ready: boolean;
  score: number;
  maxScore: number;
  invoiceNumber: string;
  issueDateIso: string;
  checks: FacturXCheckItem[];
  warnings: string[];
}

export function buildFacturXInvoiceNumber(vehicle: Vehicle): string {
  const saleYear =
    vehicle.buyerInfo?.saleDate?.slice(0, 4) ||
    String(vehicle.year || new Date().getFullYear());
  const suffix = (vehicle.vin || vehicle.id || '00001')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-5)
    .toUpperCase();
  return `FAC-${saleYear}-${suffix || '001'}`;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toCiiDate102(isoDate?: string): string {
  const clean = (isoDate || new Date().toISOString().slice(0, 10)).trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}${match[2]}${match[3]}`;
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export function validateFacturXReadiness(
  vehicle: Vehicle,
  settings: GarageSettings,
  lang: Language = 'fr'
): FacturXReadinessResult {
  const L = (fr: string, ru: string, hy: string, ka: string) =>
    pickLocalized(lang, { fr, ru, hy, ka });
  const cleanSiret = (settings.siret || '').replace(/\s+/g, '');
  const cleanZip = (settings.postalCode || '').replace(/\s+/g, '');
  const sellerName =
    settings.entityType === 'physique'
      ? `${settings.firstName || ''} ${settings.lastName || ''}`.trim() || settings.name
      : settings.name;
  const sellerAddressOk =
    Boolean(settings.streetName?.trim()) &&
    /^\d{5}$/.test(cleanZip) &&
    Boolean(settings.city?.trim());
  const invoiceNumber = buildFacturXInvoiceNumber(vehicle);
  const issueDateIso =
    vehicle.buyerInfo?.saleDate || new Date().toISOString().slice(0, 10);
  const salePrice = getRealizedSalePrice(vehicle) || vehicle.targetSalePrice || 0;
  const buyerName = vehicle.buyerInfo?.fullName?.trim() || '';
  const buyerAddress = vehicle.buyerInfo?.address?.trim() || '';

  const checks: FacturXCheckItem[] = [
    {
      id: 'seller_name',
      labelFr: 'Raison sociale / Nom du vendeur',
      labelRu: 'Название / Имя продавца',
      labelHy: 'Վաճառողի անվանում / Անուն',
      labelKa: 'გამყიდველის სახელი / დასახელება',
      passed: Boolean(sellerName?.trim()),
      valuePreview: sellerName || '—',
    },
    {
      id: 'seller_siret',
      labelFr: 'Numéro SIRET vendeur (14 chiffres — identifiant 0002)',
      labelRu: 'SIRET продавца (14 цифр — схема 0002)',
      labelHy: 'Վաճառողի SIRET (14 նիշ — սխեմա 0002)',
      labelKa: 'გამყიდველის SIRET (14 ციფრი — სქემა 0002)',
      passed: /^\d{14}$/.test(cleanSiret),
      valuePreview: cleanSiret || '—',
    },
    {
      id: 'seller_address',
      labelFr: 'Adresse postale complète du garage (Rue, CP 5 chiffres, Ville)',
      labelRu: 'Полный почтовый адрес (Улица, Индекс 5 цифр, Город)',
      labelHy: 'Ամբողջական հասցե (Փողոց, 5-նիշ ինդեքս, Քաղաք)',
      labelKa: 'სრული მისამართი (ქუჩა, 5-ნიშნა ინდექსი, ქალაქი)',
      passed: sellerAddressOk,
      valuePreview: sellerAddressOk
        ? `${settings.streetNumber || ''} ${settings.streetName}, ${cleanZip} ${settings.city}`.trim()
        : L('Incomplète', 'Неполный адрес', 'Անավարտ է', 'არასრული'),
    },
    {
      id: 'invoice_meta',
      labelFr: 'Numéro de facture séquentiel & Date de cession (YYYYMMDD)',
      labelRu: 'Номер счёта и дата продажи (YYYYMMDD)',
      labelHy: 'Հաշվի համար և վաճառքի ամսաթիվ (YYYYMMDD)',
      labelKa: 'ინვოისის ნომერი და გაყიდვის თარიღი (YYYYMMDD)',
      passed: Boolean(invoiceNumber) && /^\d{4}-\d{2}-\d{2}/.test(issueDateIso),
      valuePreview: `${invoiceNumber} (${issueDateIso})`,
    },
    {
      id: 'buyer_identity',
      labelFr: 'Identité et adresse de l’acquéreur (BG-7)',
      labelRu: 'Имя/Данные и адрес покупателя (BG-7)',
      labelHy: 'Գնորդի տվյալները և հասցեն (BG-7)',
      labelKa: 'მყიდველის მონაცემები და მისამართი (BG-7)',
      passed: Boolean(buyerName) && Boolean(buyerAddress),
      valuePreview: buyerName
        ? `${buyerName} — ${buyerAddress || L('sans adresse', 'без адреса', 'առանց հասցեի', 'მისამართის გარეშე')}`
        : L(
            'Non vendu / Acheteur manquant',
            'Не продано / Нет покупателя',
            'Վաճառված չէ / Գնորդը նշված չէ',
            'არ არის გაყიდული / მყიდველი აკლია'
          ),
    },
    {
      id: 'amount_valid',
      labelFr: 'Montant TTC positif (> 0 €) & Régime TVA',
      labelRu: 'Положительная сумма счёта (> 0 €) и режим НДС (TVA)',
      labelHy: 'Դրական գումար (> 0 €) և ԱԱՀ (TVA) ռեժիմ',
      labelKa: 'დადებითი თანხა (> 0 €) და დღგ-ს (TVA) რეჟიმი',
      passed: salePrice > 0 && Boolean(settings.tvaMention?.trim() || settings.taxRegime),
      valuePreview: `${roundToTwo(salePrice)} € (${settings.tvaMention || 'Art. 297 A CGI'})`,
    },
  ];

  const warnings: string[] = [];
  if (vehicle.status !== 'sold') {
    warnings.push(
      L(
        'Le véhicule n’est pas encore au statut « Vendu » — export généré à titre de pro-forma / préparation.',
        'Автомобиль ещё не в статусе «Продано» — экспорт сформирован в режиме предпросмотра / проформы.',
        'Մեքենան դեռ «Վաճառված» կարգավիճակում չէ — արտահանումը ձևավորվել է որպես նախահաշիվ (pro-forma)։',
        'ავტომობილი ჯერ არ არის სტატუსში «გაყიდული» — ექსპორტი შექმნილია პროფორმის სახით.'
      )
    );
  }
  if (vehicle.buyerInfo?.isCompany && !vehicle.buyerInfo?.siret?.replace(/\s+/g, '').match(/^\d{14}$/)) {
    warnings.push(
      L(
        'Acheteur professionnel (B2B) : le SIRET 14 chiffres de l’acheteur est requis pour le routage PPF / PDP.',
        'Корпоративный покупатель (B2B): для маршрутизации PPF / PDP требуется 14-значный SIRET покупателя.',
        'Բիզնես գնորդ (B2B). PPF / PDP երթուղավորման համար անհրաժեշտ է գնորդի 14-նիշ SIRET-ը։',
        'ბიზნეს მყიდველი (B2B): PPF / PDP მარშრუტიზაციისთვის საჭიროა მყიდველის 14-ნიშნა SIRET.'
      )
    );
  }

  const score = checks.filter((c) => c.passed).length;
  return {
    ready: score === checks.length,
    score,
    maxScore: checks.length,
    invoiceNumber,
    issueDateIso,
    checks,
    warnings,
  };
}

export function buildFacturXXml(
  vehicle: Vehicle,
  settings: GarageSettings,
  options?: {
    invoiceNumber?: string;
    issueDate?: string;
    paymentMeansCode?: '30' | '48' | '10' | '20';
    vatMode?: VatRegime | 'margin' | 'standard_20';
    vatRatePercent?: number;
  }
): string {
  const invoiceNumber = options?.invoiceNumber || buildFacturXInvoiceNumber(vehicle);
  const issueDateIso =
    options?.issueDate || vehicle.buyerInfo?.saleDate || new Date().toISOString().slice(0, 10);
  const issueDate102 = toCiiDate102(issueDateIso);
  const currency = settings.currency || 'EUR';
  const paymentMeansCode = options?.paymentMeansCode || '30'; // 30 = Credit transfer (SEPA)

  const dealProfile = resolveDealSellerProfileType(vehicle, settings);
  const dealSettings = {
    ...settings,
    ...resolveEffectiveSettingsForDeal({ vehicle, garageSettings: settings }),
  };
  const isParticulierDeal = dealProfile === 'particulier';

  const isCorporateVatSeller =
    !vehicle.buyerInfo?.sellerProfileType &&
    (dealSettings.taxRegime === 'sarl' ||
      dealSettings.taxRegime === 'sas' ||
      dealSettings.taxRegime === 'custom');

  const resolvedVatRegime: VatRegime = (() => {
    const raw =
      isParticulierDeal || vehicle.buyerInfo?.sellerProfileType === 'micro_entrepreneur'
        ? options?.vatMode || 'franchise_base'
        : isCorporateVatSeller
        ? options?.vatMode ||
          vehicle.buyerInfo?.vatRegime ||
          vehicle.buyerInfo?.taxSnapshot?.vatRegime ||
          dealSettings.frenchTaxConfig?.vatRegime ||
          'tva_marge'
        : options?.vatMode ||
          (vehicle.buyerInfo?.taxSnapshot?.isHistoricalSnapshot &&
          vehicle.buyerInfo.taxSnapshot.vatAmount > 0
            ? vehicle.buyerInfo.taxSnapshot.vatRegime
            : 'franchise_base');
    if (raw === 'margin') return 'tva_marge';
    if (raw === 'standard_20') return 'tva_total';
    return raw;
  })();

  const resolvedVatRate = isParticulierDeal || vehicle.buyerInfo?.sellerProfileType === 'micro_entrepreneur'
    ? options?.vatRatePercent ?? 0
    : isCorporateVatSeller
    ? options?.vatRatePercent ??
      vehicle.buyerInfo?.vatRatePercent ??
      vehicle.buyerInfo?.taxSnapshot?.vatRatePercent ??
      dealSettings.frenchTaxConfig?.vatRatePercent ??
      20
    : options?.vatRatePercent ??
      (resolvedVatRegime === 'franchise_base'
        ? 0
        : vehicle.buyerInfo?.taxSnapshot?.vatRatePercent ?? 0);

  const cleanSiret = isParticulierDeal ? '' : (settings.siret || '').replace(/\s+/g, '');
  const sellerName =
    isParticulierDeal || settings.entityType === 'physique'
      ? `${settings.firstName || ''} ${settings.lastName || ''}`.trim() || settings.name
      : settings.name;
  const sellerStreet = [
    settings.streetNumber,
    settings.streetExtension,
    settings.streetType,
    settings.streetName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const buyerName = vehicle.buyerInfo?.fullName?.trim() || 'Client Particulier';
  const buyerStreet = [vehicle.buyerInfo?.streetNumber, vehicle.buyerInfo?.streetName]
    .filter(Boolean)
    .join(' ')
    .trim() || vehicle.buyerInfo?.address || 'France';
  const buyerZip = (vehicle.buyerInfo?.postalCode || '').replace(/\s+/g, '') || '75000';
  const buyerCity = vehicle.buyerInfo?.city?.trim() || 'France';
  const buyerSiret = (vehicle.buyerInfo?.siret || '').replace(/\s+/g, '');

  const grossAmount = roundToTwo(
    getRealizedSalePrice(vehicle) || vehicle.targetSalePrice || 0
  );
  const vatBreakdown = calculateFrenchVat({
    salePrice: grossAmount,
    purchasePrice: Number(vehicle.purchasePrice) || 0,
    vatRegime: resolvedVatRegime,
    vatRatePercent: resolvedVatRate,
  });

  const isStandardOnTotal = resolvedVatRegime === 'tva_total' || resolvedVatRegime === 'custom';
  const vatRate = isStandardOnTotal ? vatBreakdown.vatRatePercent : 0;
  const taxBasisAmount = isStandardOnTotal ? vatBreakdown.htAmount : grossAmount;
  const vatAmount = isStandardOnTotal ? vatBreakdown.vatAmount : 0;
  const taxCategoryCode =
    resolvedVatRegime === 'franchise_base' ? 'E' : isStandardOnTotal ? 'S' : 'AE';
  const legalNote =
    resolvedVatRegime === 'tva_marge' && settings.tvaMention?.trim()
      ? settings.tvaMention
      : vatBreakdown.legalMention;

  const lineItemTitle = `Véhicule d'occasion ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''} (${vehicle.year}) - VIN ${vehicle.vin}`.trim();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter>
      <ram:ID>A1</ram:ID>
    </ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${escapeXml(issueDate102)}</udt:DateTimeString>
    </ram:IssueDateTime>
    <ram:IncludedNote>
      <ram:Content>${escapeXml(legalNote)}</ram:Content>
      <ram:SubjectCode>REG</ram:SubjectCode>
    </ram:IncludedNote>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>1</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:GlobalID schemeID="0160">${escapeXml(vehicle.vin)}</ram:GlobalID>
        <ram:Name>${escapeXml(lineItemTitle)}</ram:Name>
        <ram:Description>${escapeXml(`Immatriculation: ${vehicle.registrationNumber || 'N/A'} | Kilometrage: ${vehicle.mileage} km`)}</ram:Description>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${taxBasisAmount.toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">1.00</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${taxCategoryCode}</ram:CategoryCode>
          <ram:RateApplicablePercent>${vatRate.toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${taxBasisAmount.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(sellerName)}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escapeXml(cleanSiret || '00000000000000')}</ram:ID>
          <ram:TradingBusinessName>${escapeXml(settings.name)}</ram:TradingBusinessName>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml((settings.postalCode || '').replace(/\s+/g, '') || '75000')}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(sellerStreet || 'Adresse garage')}</ram:LineOne>
          <ram:CityName>${escapeXml(settings.city || 'Paris')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escapeXml(settings.email || 'contact@autogarage.fr')}</ram:URIID>
        </ram:URIUniversalCommunication>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(buyerName)}</ram:Name>
        ${buyerSiret ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${escapeXml(buyerSiret)}</ram:ID></ram:SpecifiedLegalOrganization>` : ''}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(buyerZip)}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(buyerStreet)}</ram:LineOne>
          <ram:CityName>${escapeXml(buyerCity)}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${vehicle.buyerInfo?.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${escapeXml(vehicle.buyerInfo.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${escapeXml(issueDate102)}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(currency)}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>${escapeXml(paymentMeansCode)}</ram:TypeCode>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${vatAmount.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${resolvedVatRegime === 'tva_marge' ? '<ram:ExemptionReason>TVA sur la marge - Article 297 A du CGI</ram:ExemptionReason>' : resolvedVatRegime === 'franchise_base' ? '<ram:ExemptionReason>TVA non applicable, art. 293 B du CGI</ram:ExemptionReason>' : ''}
        <ram:BasisAmount>${taxBasisAmount.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>${taxCategoryCode}</ram:CategoryCode>
        <ram:RateApplicablePercent>${vatRate.toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${taxBasisAmount.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${taxBasisAmount.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escapeXml(currency)}">${vatAmount.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${grossAmount.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${grossAmount.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

/**
 * Full Backup v2 serialization & backward-compatible v1/v2 parsing
 */
export function serializeFullBackupV2(payload: FullGarageBackupV2): string {
  return JSON.stringify(payload, null, 2);
}

export function parseFullBackupPayload(rawJson: string): FullGarageBackupV2 {
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
    version: 2,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    garageId: typeof obj.garageId === 'string' ? obj.garageId : undefined,
    actorEmail: typeof obj.actorEmail === 'string' ? obj.actorEmail : undefined,
    vehicles: obj.vehicles as Vehicle[],
    repairs: Array.isArray(obj.repairs) ? (obj.repairs as RepairTask[]) : [],
    expenses: Array.isArray(obj.expenses) ? (obj.expenses as GeneralExpense[]) : [],
    suppliers: Array.isArray(obj.suppliers) ? (obj.suppliers as Supplier[]) : [],
    purchases: Array.isArray(obj.purchases) ? (obj.purchases as Purchase[]) : [],
    documents: Array.isArray(obj.documents) ? (obj.documents as GarageDocument[]) : [],
    documentHistory: Array.isArray(obj.documentHistory) ? obj.documentHistory : [],
    settings: obj.settings as GarageSettings,
  };
}

export function computeBackupCounts(backup: FullGarageBackupV2): BackupSnapshotCounts {
  return {
    vehicles: backup.vehicles.length,
    repairs: backup.repairs.length,
    expenses: backup.expenses.length,
    suppliers: backup.suppliers.length,
    purchases: backup.purchases.length,
    documents: backup.documents.length,
  };
}

export function filterAuditLogsByGarage<T extends { garageId?: string }>(
  items: T[],
  garageId: string | null | undefined
): T[] {
  if (!garageId) return items;
  return items.filter((item) =>
    item.garageId ? item.garageId === garageId : garageId === DEFAULT_GARAGE_ID
  );
}
