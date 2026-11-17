import {
  AppUserProfileType,
  FrenchTaxConfiguration,
  GarageSettings,
  GeneralExpense,
  IsRateMode,
  LegalStatus,
  RepairTask,
  TaxRegime,
  TransactionTaxSnapshot,
  VatRegime,
  Vehicle,
} from '../types/garage';

export const FRENCH_TAX_DEFAULTS = {
  MICRO_SOCIAL_RATE: 12.3,
  MICRO_VL_RATE: 1.0,
  MICRO_BIC_ABATTEMENT: 71,
  MICRO_BIC_DEFAULT_IR_RATE: 11,
  IS_REDUCED_RATE: 15,
  IS_STANDARD_RATE: 25,
  IS_REDUCED_THRESHOLD: 42500,
  STANDARD_VAT_RATE: 20,
  DISCLAIMER_FR:
    "Estimation de gestion interne — ne constitue pas une déclaration fiscale officielle. Faites valider votre paramétrage fiscal (URSSAF, Micro-BIC) par votre expert-comptable.",
  DISCLAIMER_RU:
    'Внутренний управленческий расчёт — не является официальной налоговой декларацией. Согласуйте настройки (URSSAF, Micro-BIC) с вашим бухгалтером во Франции (expert-comptable).',
  DISCLAIMER_HY:
    'Ներքին կառավարչական հաշվարկ է — չի հանդիսանում պաշտոնական հարկային հայտարարագիր։ Համաձայնեցրեք կարգավորումները (URSSAF, Micro-BIC) Ձեր հաշվապահի (expert-comptable) հետ։',
  DISCLAIMER_KA:
    'შიდა მენეჯერული გათვლაა — არ წარმოადგენს ოფიციალურ საგადასახადო დეკლარაციას. შეათანხმეთ პარამეტრები (URSSAF, Micro-BIC) თქვენს ბუღალტერთან (expert-comptable).',
} as const;

export function roundCurrency(value: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function resolveUserProfileType(
  input?: {
    profileType?: AppUserProfileType;
    legalStatus?: LegalStatus;
    taxRegime?: TaxRegime;
    entityType?: 'morale' | 'physique';
  } | null
): AppUserProfileType {
  if (input?.profileType === 'particulier') return 'particulier';
  if (input?.profileType === 'micro_entrepreneur') return 'micro_entrepreneur';
  if (input?.legalStatus === 'particulier' || input?.taxRegime === 'none') {
    return 'particulier';
  }
  return 'micro_entrepreneur';
}

/**
 * Resolves the effective seller profile for a specific vehicle transaction.
 * An explicit per-deal `vehicle.buyerInfo.sellerProfileType` always overrides global settings.
 * Legacy sold vehicles without `sellerProfileType` fall back to global settings / profileType.
 */
export function resolveDealSellerProfileType(
  vehicle?: Pick<Vehicle, 'buyerInfo'> | null,
  garageSettings?: Partial<GarageSettings> | null,
  fallbackProfileType?: AppUserProfileType
): AppUserProfileType {
  const explicitDealProfile = vehicle?.buyerInfo?.sellerProfileType;
  if (explicitDealProfile === 'particulier' || explicitDealProfile === 'micro_entrepreneur') {
    return explicitDealProfile;
  }

  if (fallbackProfileType === 'particulier') {
    return 'particulier';
  }
  if (garageSettings) {
    return resolveUserProfileType(garageSettings);
  }
  if (fallbackProfileType) {
    return fallbackProfileType;
  }
  const snap = vehicle?.buyerInfo?.taxSnapshot;
  if (snap?.isHistoricalSnapshot) {
    if (snap.taxRegime === 'none' || snap.legalStatus === 'particulier') {
      return 'particulier';
    }
    return 'micro_entrepreneur';
  }
  return 'micro_entrepreneur';
}

/**
 * Returns GarageSettings patched for a specific deal's seller regime.
 * Ensures a deal marked as 'particulier' always yields 0 € taxes, while a deal marked
 * as 'micro_entrepreneur' applies Micro URSSAF + VL even if global settings are Particulier.
 */
export function resolveEffectiveSettingsForDeal(params: {
  vehicle?: Pick<Vehicle, 'buyerInfo'> | null;
  garageSettings?: Partial<GarageSettings> | null;
  fallbackProfileType?: AppUserProfileType;
}): Partial<GarageSettings> {
  const { vehicle, garageSettings, fallbackProfileType } = params;
  const base = garageSettings || {};
  const explicitDealProfile = vehicle?.buyerInfo?.sellerProfileType;

  if (explicitDealProfile === 'particulier') {
    return {
      ...base,
      ...buildProfileSettingsPatch('particulier', base),
    };
  }

  if (explicitDealProfile === 'micro_entrepreneur') {
    return {
      ...base,
      ...buildProfileSettingsPatch('micro_entrepreneur', base),
    };
  }

  if (fallbackProfileType === 'particulier' || resolveUserProfileType(base) === 'particulier') {
    return {
      ...base,
      ...buildProfileSettingsPatch('particulier', base),
    };
  }

  return base;
}

export function mapLegalStatusToTaxRegime(legalStatus: LegalStatus): TaxRegime {
  switch (legalStatus) {
    case 'particulier':
      return 'none';
    case 'micro_entreprise':
    case 'ei':
      return 'micro';
    case 'sas':
    case 'sasu':
      return 'sas';
    case 'sarl':
    case 'eurl':
    case 'other':
    default:
      return 'sarl';
  }
}

export function mapTaxRegimeToLegalStatus(
  taxRegime?: TaxRegime,
  entityType?: 'morale' | 'physique'
): LegalStatus {
  if (taxRegime === 'none') return 'particulier';
  if (taxRegime === 'micro') return 'micro_entreprise';
  if (taxRegime === 'sas') return 'sas';
  if (taxRegime === 'sarl') return 'sarl';
  if (entityType === 'physique') return 'micro_entreprise';
  return 'micro_entreprise';
}

export function createDefaultFrenchTaxConfig(
  legalStatus: LegalStatus = 'micro_entreprise',
  overrides?: Partial<FrenchTaxConfiguration>
): FrenchTaxConfiguration {
  const today = getTodayIsoDate();
  const currentYear = new Date().getFullYear();
  const businessTaxRegime = overrides?.businessTaxRegime || mapLegalStatusToTaxRegime(legalStatus);
  const isParticulier = legalStatus === 'particulier' || businessTaxRegime === 'none';
  const isVatExemptProfile =
    isParticulier ||
    legalStatus === 'micro_entreprise' ||
    businessTaxRegime === 'micro';

  return {
    legalStatus,
    businessTaxRegime,
    socialContributionRate: isParticulier ? 0 : FRENCH_TAX_DEFAULTS.MICRO_SOCIAL_RATE,
    versementLiberatoireEnabled: !isParticulier,
    versementLiberatoireRate: isParticulier ? 0 : FRENCH_TAX_DEFAULTS.MICRO_VL_RATE,
    microBicAbattementPercent: isParticulier ? 0 : FRENCH_TAX_DEFAULTS.MICRO_BIC_ABATTEMENT,
    microBicIncomeTaxRate: isParticulier ? 0 : FRENCH_TAX_DEFAULTS.MICRO_BIC_DEFAULT_IR_RATE,
    isRateMode: 'progressive_15_25',
    corporateTaxRateReduced: FRENCH_TAX_DEFAULTS.IS_REDUCED_RATE,
    corporateTaxRateStandard: FRENCH_TAX_DEFAULTS.IS_STANDARD_RATE,
    corporateTaxCustomRate: FRENCH_TAX_DEFAULTS.IS_STANDARD_RATE,
    reducedIsEligible: true,
    reducedIsThreshold: FRENCH_TAX_DEFAULTS.IS_REDUCED_THRESHOLD,
    annualTaxableProfit: 0,
    financialYear: currentYear,
    vatRegime: isVatExemptProfile ? 'franchise_base' : 'tva_marge',
    vatRatePercent: isVatExemptProfile ? 0 : FRENCH_TAX_DEFAULTS.STANDARD_VAT_RATE,
    ...overrides,
    ...(isParticulier
      ? {
          legalStatus: 'particulier' as const,
          businessTaxRegime: 'none' as const,
          socialContributionRate: 0,
          versementLiberatoireEnabled: false,
          versementLiberatoireRate: 0,
          microBicAbattementPercent: 0,
          microBicIncomeTaxRate: 0,
          vatRegime: 'franchise_base' as const,
          vatRatePercent: 0,
        }
      : {}),
    effectiveDates: {
      urssaf: overrides?.effectiveDates?.urssaf || today,
      is: overrides?.effectiveDates?.is || today,
      vat: overrides?.effectiveDates?.vat || today,
    },
  };
}

/**
 * Builds a non-destructive GarageSettings patch when switching between
 * the two supported application profiles: 'particulier' and 'micro_entrepreneur'.
 */
export function buildProfileSettingsPatch(
  profileType: AppUserProfileType,
  current?: Partial<GarageSettings> | null
): Partial<GarageSettings> {
  if (profileType === 'particulier') {
    const baseCfg = createDefaultFrenchTaxConfig('particulier', {
      effectiveDates: current?.frenchTaxConfig?.effectiveDates,
    });
    return {
      profileType: 'particulier',
      entityType: 'physique',
      legalStatus: 'particulier',
      taxRegime: 'none',
      taxRatePercent: 0,
      legalForm: '',
      tvaMention: '',
      frenchTaxConfig: baseCfg,
    };
  }

  const wasParticulier =
    current?.profileType === 'particulier' ||
    current?.legalStatus === 'particulier' ||
    current?.taxRegime === 'none' ||
    current?.frenchTaxConfig?.businessTaxRegime === 'none' ||
    current?.frenchTaxConfig?.legalStatus === 'particulier';

  const defaultMicroCfg = createDefaultFrenchTaxConfig('micro_entreprise');
  const carriedMicroRates =
    !wasParticulier && current?.frenchTaxConfig
      ? {
          ...defaultMicroCfg,
          ...current.frenchTaxConfig,
          legalStatus: 'micro_entreprise' as const,
          businessTaxRegime: 'micro' as const,
          vatRegime: 'franchise_base' as const,
          vatRatePercent: 0,
        }
      : {
          ...defaultMicroCfg,
          effectiveDates: current?.frenchTaxConfig?.effectiveDates || defaultMicroCfg.effectiveDates,
        };

  const normalizedMicro = normalizeFrenchTaxConfig({
    ...(current || {}),
    profileType: 'micro_entrepreneur',
    entityType: 'physique',
    legalStatus: 'micro_entreprise',
    taxRegime: 'micro',
    frenchTaxConfig: carriedMicroRates,
  });

  const combinedMicroRate = roundCurrency(
    normalizedMicro.socialContributionRate +
      (normalizedMicro.versementLiberatoireEnabled ? normalizedMicro.versementLiberatoireRate : 0)
  );

  return {
    profileType: 'micro_entrepreneur',
    entityType: 'physique',
    legalStatus: 'micro_entreprise',
    taxRegime: 'micro',
    taxRatePercent: combinedMicroRate,
    legalForm: 'Micro-entrepreneur',
    tvaMention: 'TVA non applicable, art. 293 B du CGI',
    frenchTaxConfig: normalizedMicro,
  };
}

/**
 * Normalizes GarageSettings (including legacy settings without `frenchTaxConfig`)
 * into a complete, valid FrenchTaxConfiguration.
 */
export function normalizeFrenchTaxConfig(
  settings?: Partial<GarageSettings> | null,
  globalDefaults?: Partial<FrenchTaxConfiguration> | null
): FrenchTaxConfiguration {
  const existing = settings?.frenchTaxConfig;
  const isExplicitParticulier =
    settings?.profileType === 'particulier' ||
    settings?.legalStatus === 'particulier' ||
    settings?.taxRegime === 'none' ||
    (!settings?.profileType &&
      !settings?.legalStatus &&
      !settings?.taxRegime &&
      (existing?.legalStatus === 'particulier' || existing?.businessTaxRegime === 'none'));

  if (isExplicitParticulier) {
    return createDefaultFrenchTaxConfig('particulier', {
      effectiveDates: existing?.effectiveDates || globalDefaults?.effectiveDates,
    });
  }

  const isExplicitMicro =
    settings?.profileType === 'micro_entrepreneur' ||
    settings?.legalStatus === 'micro_entreprise' ||
    settings?.taxRegime === 'micro';

  const inferredLegalStatus: LegalStatus = isExplicitMicro
    ? 'micro_entreprise'
    : existing?.legalStatus && existing.legalStatus !== 'particulier'
    ? existing.legalStatus
    : settings?.legalStatus ||
      mapTaxRegimeToLegalStatus(settings?.taxRegime, settings?.entityType) ||
      globalDefaults?.legalStatus ||
      'sarl';

  const base = createDefaultFrenchTaxConfig(inferredLegalStatus, globalDefaults || undefined);

  if (existing) {
    const resolvedLegalStatus = isExplicitMicro
      ? 'micro_entreprise'
      : existing.legalStatus && existing.legalStatus !== 'particulier'
      ? existing.legalStatus
      : inferredLegalStatus;
    const businessTaxRegime = isExplicitMicro
      ? 'micro'
      : existing.businessTaxRegime && existing.businessTaxRegime !== 'none'
      ? existing.businessTaxRegime
      : settings?.taxRegime || base.businessTaxRegime;

    if (businessTaxRegime === 'none' || resolvedLegalStatus === 'particulier') {
      return createDefaultFrenchTaxConfig('particulier', {
        effectiveDates: existing.effectiveDates || base.effectiveDates,
      });
    }

    const isVatExemptProfile =
      businessTaxRegime === 'micro' || resolvedLegalStatus === 'micro_entreprise';

    const existingWasParticulier =
      existing.legalStatus === 'particulier' || existing.businessTaxRegime === 'none';

    return {
      ...base,
      ...existing,
      legalStatus: resolvedLegalStatus,
      businessTaxRegime,
      socialContributionRate:
        !existingWasParticulier && typeof existing.socialContributionRate === 'number'
          ? Math.max(0, existing.socialContributionRate)
          : base.socialContributionRate,
      versementLiberatoireEnabled:
        !existingWasParticulier && typeof existing.versementLiberatoireEnabled === 'boolean'
          ? existing.versementLiberatoireEnabled
          : base.versementLiberatoireEnabled,
      versementLiberatoireRate:
        !existingWasParticulier && typeof existing.versementLiberatoireRate === 'number'
          ? Math.max(0, existing.versementLiberatoireRate)
          : base.versementLiberatoireRate,
      microBicAbattementPercent:
        !existingWasParticulier && typeof existing.microBicAbattementPercent === 'number'
          ? Math.min(100, Math.max(0, existing.microBicAbattementPercent))
          : base.microBicAbattementPercent,
      microBicIncomeTaxRate:
        !existingWasParticulier && typeof existing.microBicIncomeTaxRate === 'number'
          ? Math.max(0, existing.microBicIncomeTaxRate)
          : base.microBicIncomeTaxRate,
      isRateMode: existing.isRateMode || base.isRateMode,
      corporateTaxRateReduced:
        typeof existing.corporateTaxRateReduced === 'number'
          ? Math.max(0, existing.corporateTaxRateReduced)
          : base.corporateTaxRateReduced,
      corporateTaxRateStandard:
        typeof existing.corporateTaxRateStandard === 'number'
          ? Math.max(0, existing.corporateTaxRateStandard)
          : base.corporateTaxRateStandard,
      corporateTaxCustomRate:
        typeof existing.corporateTaxCustomRate === 'number'
          ? Math.max(0, existing.corporateTaxCustomRate)
          : base.corporateTaxCustomRate,
      reducedIsEligible:
        typeof existing.reducedIsEligible === 'boolean'
          ? existing.reducedIsEligible
          : base.reducedIsEligible,
      reducedIsThreshold:
        typeof existing.reducedIsThreshold === 'number' && existing.reducedIsThreshold > 0
          ? existing.reducedIsThreshold
          : FRENCH_TAX_DEFAULTS.IS_REDUCED_THRESHOLD,
      annualTaxableProfit:
        typeof existing.annualTaxableProfit === 'number'
          ? existing.annualTaxableProfit
          : base.annualTaxableProfit,
      financialYear:
        typeof existing.financialYear === 'number'
          ? existing.financialYear
          : base.financialYear,
      vatRegime: isVatExemptProfile ? 'franchise_base' : existing.vatRegime || base.vatRegime,
      vatRatePercent: isVatExemptProfile
        ? 0
        : typeof existing.vatRatePercent === 'number'
        ? Math.max(0, existing.vatRatePercent)
        : base.vatRatePercent,
      effectiveDates: {
        urssaf: existing.effectiveDates?.urssaf || base.effectiveDates.urssaf,
        is: existing.effectiveDates?.is || base.effectiveDates.is,
        vat: existing.effectiveDates?.vat || base.effectiveDates.vat,
      },
    };
  }

  // Legacy migration path from settings.taxRegime & settings.taxRatePercent
  const legacyRegime = settings?.taxRegime || base.businessTaxRegime;
  const legacyRate = typeof settings?.taxRatePercent === 'number' ? settings.taxRatePercent : undefined;

  if (legacyRegime === 'micro') {
    const isCombinedLegacy = legacyRate !== undefined && Math.abs(legacyRate - 13.3) < 0.05;
    const isExact123 = legacyRate === undefined || Math.abs(legacyRate - 12.3) < 0.05;
    return {
      ...base,
      legalStatus: settings?.legalStatus || 'micro_entreprise',
      businessTaxRegime: 'micro',
      socialContributionRate: isCombinedLegacy || isExact123 ? 12.3 : Math.max(0, legacyRate),
      versementLiberatoireEnabled: isCombinedLegacy || legacyRate === undefined,
      versementLiberatoireRate: 1.0,
    };
  }

  if (legacyRegime === 'custom') {
    return {
      ...base,
      legalStatus: settings?.legalStatus || 'sarl',
      businessTaxRegime: 'custom',
      corporateTaxCustomRate: legacyRate ?? 20,
      isRateMode: 'custom',
    };
  }

  if (legacyRegime === 'none') {
    return createDefaultFrenchTaxConfig('particulier');
  }

  return {
    ...base,
    legalStatus: settings?.legalStatus || (legacyRegime === 'sas' ? 'sas' : 'sarl'),
    businessTaxRegime: legacyRegime === 'sas' ? 'sas' : 'sarl',
    isRateMode: 'progressive_15_25',
  };
}

/**
 * Computes pure commercial Vehicle Profitability Before Taxes:
 * Sale Price - (Purchase Price + Repairs + General Expenses)
 */
export function calculateVehicleProfitBeforeTaxes(params: {
  salePrice: number;
  purchasePrice: number;
  repairCostTotal: number;
  generalExpensesTotal: number;
}): {
  salePrice: number;
  purchasePrice: number;
  repairCostTotal: number;
  generalExpensesTotal: number;
  totalInvested: number;
  profitBeforeTaxes: number;
} {
  const salePrice = roundCurrency(Math.max(0, Number(params.salePrice) || 0));
  const purchasePrice = roundCurrency(Math.max(0, Number(params.purchasePrice) || 0));
  const repairCostTotal = roundCurrency(Math.max(0, Number(params.repairCostTotal) || 0));
  const generalExpensesTotal = roundCurrency(Math.max(0, Number(params.generalExpensesTotal) || 0));
  const totalInvested = roundCurrency(purchasePrice + repairCostTotal + generalExpensesTotal);
  const profitBeforeTaxes = roundCurrency(salePrice - totalInvested);

  return {
    salePrice,
    purchasePrice,
    repairCostTotal,
    generalExpensesTotal,
    totalInvested,
    profitBeforeTaxes,
  };
}

export interface FrenchVatBreakdown {
  vatRegime: VatRegime;
  vatRatePercent: number;
  vatBaseAmount: number;
  vatAmount: number;
  htAmount: number;
  ttcAmount: number;
  legalMention: string;
  regimeShortLabel: string;
}

/**
 * Computes French VAT (TVA) strictly separated from URSSAF & Corporate IS.
 * Supports:
 * - tva_marge: VAT calculated on positive gross margin only (Art. 297 A CGI)
 * - tva_total: Standard VAT applied to the total sale price TTC -> HT + TVA
 * - franchise_base: Exempt from VAT (Art. 293 B CGI) -> 0%
 * - custom: Custom VAT rate applied to total TTC price
 */
export function calculateFrenchVat(params: {
  salePrice: number;
  purchasePrice: number;
  vatRegime: VatRegime;
  vatRatePercent?: number;
}): FrenchVatBreakdown {
  const ttcAmount = roundCurrency(Math.max(0, Number(params.salePrice) || 0));
  const purchasePrice = roundCurrency(Math.max(0, Number(params.purchasePrice) || 0));
  const vatRegime = params.vatRegime || 'tva_marge';
  const configuredRate = Math.max(0, Number(params.vatRatePercent ?? FRENCH_TAX_DEFAULTS.STANDARD_VAT_RATE));

  if (vatRegime === 'franchise_base') {
    return {
      vatRegime: 'franchise_base',
      vatRatePercent: 0,
      vatBaseAmount: 0,
      vatAmount: 0,
      htAmount: ttcAmount,
      ttcAmount,
      legalMention: 'TVA non applicable, art. 293 B du CGI (Franchise en base de TVA).',
      regimeShortLabel: 'Franchise en base (Art. 293 B)',
    };
  }

  if (vatRegime === 'tva_marge') {
    const positiveMarginTTC = Math.max(0, ttcAmount - purchasePrice);
    const vatAmount =
      configuredRate > 0
        ? roundCurrency((positiveMarginTTC * configuredRate) / (100 + configuredRate))
        : 0;
    const vatBaseAmount = roundCurrency(Math.max(0, positiveMarginTTC - vatAmount));
    const htAmount = roundCurrency(ttcAmount - vatAmount);
    return {
      vatRegime: 'tva_marge',
      vatRatePercent: configuredRate,
      vatBaseAmount,
      vatAmount,
      htAmount,
      ttcAmount,
      legalMention:
        "Régime particulier - Biens d'occasion - TVA sur la marge (Art. 297 A du CGI). La TVA n'ouvre pas droit à déduction.",
      regimeShortLabel: `TVA sur marge (${configuredRate}%)`,
    };
  }

  // tva_total or custom VAT rate on total price
  const htAmount =
    configuredRate > 0 ? roundCurrency(ttcAmount / (1 + configuredRate / 100)) : ttcAmount;
  const vatAmount = roundCurrency(ttcAmount - htAmount);

  return {
    vatRegime,
    vatRatePercent: configuredRate,
    vatBaseAmount: htAmount,
    vatAmount,
    htAmount,
    ttcAmount,
    legalMention:
      vatRegime === 'custom'
        ? `TVA personnalisée (${configuredRate}%) sur le prix total TTC.`
        : `TVA standard (${configuredRate}%) sur le prix total TTC (Art. 256 du CGI).`,
    regimeShortLabel:
      vatRegime === 'custom'
        ? `TVA personnalisée (${configuredRate}%)`
        : `TVA sur prix total (${configuredRate}%)`,
  };
}

export interface MicroEntrepriseTaxResult {
  turnover: number;
  urssafRate: number;
  urssafAmount: number;
  versementLiberatoireEnabled: boolean;
  versementLiberatoireRate: number;
  versementLiberatoireAmount: number;
  combinedSocialAndVlRate: number;
  totalSocialAndVlAmount: number;
  // Separate Micro-BIC income tax estimation when Versement libératoire = NO
  microBicAbattementPercent: number;
  microBicTaxableTurnover: number;
  microBicIncomeTaxRate: number;
  separateMicroBicIncomeTax: number;
  totalEstimatedTaxOutflow: number;
}

/**
 * Micro-entreprise — Achat / Revente:
 * Strictly applies social contributions (URSSAF) and optional Versement libératoire
 * to Turnover (Chiffre d'affaires / Sale price), NEVER subtracting vehicle purchase,
 * repairs, or general expenses from the URSSAF/VL taxable turnover base.
 */
export function calculateMicroEntrepriseTaxes(params: {
  turnover: number;
  config: Pick<
    FrenchTaxConfiguration,
    | 'socialContributionRate'
    | 'versementLiberatoireEnabled'
    | 'versementLiberatoireRate'
    | 'microBicAbattementPercent'
    | 'microBicIncomeTaxRate'
  >;
}): MicroEntrepriseTaxResult {
  const turnover = roundCurrency(Math.max(0, Number(params.turnover) || 0));
  const urssafRate = Math.max(0, Number(params.config.socialContributionRate ?? 12.3));
  const vlEnabled = Boolean(params.config.versementLiberatoireEnabled);
  const vlRate = vlEnabled ? Math.max(0, Number(params.config.versementLiberatoireRate ?? 1)) : 0;

  const urssafAmount = roundCurrency(turnover * (urssafRate / 100));
  const versementLiberatoireAmount = vlEnabled ? roundCurrency(turnover * (vlRate / 100)) : 0;
  const combinedSocialAndVlRate = roundCurrency(urssafRate + vlRate);
  const totalSocialAndVlAmount = roundCurrency(urssafAmount + versementLiberatoireAmount);

  const abattement = Math.min(100, Math.max(0, Number(params.config.microBicAbattementPercent ?? 71)));
  const irRate = Math.max(0, Number(params.config.microBicIncomeTaxRate ?? 11));
  const microBicTaxableTurnover = vlEnabled ? 0 : roundCurrency(turnover * (1 - abattement / 100));
  const separateMicroBicIncomeTax = vlEnabled
    ? 0
    : roundCurrency(microBicTaxableTurnover * (irRate / 100));

  return {
    turnover,
    urssafRate,
    urssafAmount,
    versementLiberatoireEnabled: vlEnabled,
    versementLiberatoireRate: vlRate,
    versementLiberatoireAmount,
    combinedSocialAndVlRate,
    totalSocialAndVlAmount,
    microBicAbattementPercent: abattement,
    microBicTaxableTurnover,
    microBicIncomeTaxRate: irRate,
    separateMicroBicIncomeTax,
    totalEstimatedTaxOutflow: totalSocialAndVlAmount,
  };
}

export interface CorporateIsResult {
  annualTaxableProfit: number;
  isRateMode: IsRateMode;
  reducedIsEligible: boolean;
  threshold: number;
  reducedRatePercent: number;
  standardRatePercent: number;
  bracket15Base: number;
  bracket15Tax: number;
  bracket25Base: number;
  bracket25Tax: number;
  totalIsTax: number;
  effectiveRatePercent: number;
  netProfitAfterIs: number;
}

/**
 * SARL / SAS — Impôt sur les Sociétés (IS):
 * Progressive corporate tax on annual taxable profit:
 * - 15% reduced rate up to €42,500 (when reducedIsEligible = true)
 * - 25% standard rate above €42,500 (or on 100% if not eligible)
 * - Returns 0 when annual taxable profit <= 0.
 */
export function calculateCorporateIS(params: {
  annualTaxableProfit: number;
  config: Pick<
    FrenchTaxConfiguration,
    | 'isRateMode'
    | 'corporateTaxRateReduced'
    | 'corporateTaxRateStandard'
    | 'corporateTaxCustomRate'
    | 'reducedIsEligible'
    | 'reducedIsThreshold'
  >;
}): CorporateIsResult {
  const profit = roundCurrency(Number(params.annualTaxableProfit) || 0);
  const mode: IsRateMode = params.config.isRateMode || 'progressive_15_25';
  const eligible = Boolean(params.config.reducedIsEligible);
  const threshold = Math.max(0, Number(params.config.reducedIsThreshold ?? 42500));
  const reducedRate = Math.max(0, Number(params.config.corporateTaxRateReduced ?? 15));
  const standardRate = Math.max(0, Number(params.config.corporateTaxRateStandard ?? 25));
  const customRate = Math.max(0, Number(params.config.corporateTaxCustomRate ?? 25));

  if (profit <= 0) {
    return {
      annualTaxableProfit: profit,
      isRateMode: mode,
      reducedIsEligible: eligible,
      threshold,
      reducedRatePercent: reducedRate,
      standardRatePercent: standardRate,
      bracket15Base: 0,
      bracket15Tax: 0,
      bracket25Base: 0,
      bracket25Tax: 0,
      totalIsTax: 0,
      effectiveRatePercent: 0,
      netProfitAfterIs: profit,
    };
  }

  let bracket15Base = 0;
  let bracket15Tax = 0;
  let bracket25Base = 0;
  let bracket25Tax = 0;

  if (mode === 'progressive_15_25') {
    if (eligible) {
      bracket15Base = roundCurrency(Math.min(profit, threshold));
      bracket15Tax = roundCurrency(bracket15Base * (reducedRate / 100));
      bracket25Base = roundCurrency(Math.max(0, profit - threshold));
      bracket25Tax = roundCurrency(bracket25Base * (standardRate / 100));
    } else {
      bracket25Base = profit;
      bracket25Tax = roundCurrency(bracket25Base * (standardRate / 100));
    }
  } else if (mode === 'reduced_15') {
    bracket15Base = profit;
    bracket15Tax = roundCurrency(profit * (reducedRate / 100));
  } else if (mode === 'standard_25') {
    bracket25Base = profit;
    bracket25Tax = roundCurrency(profit * (standardRate / 100));
  } else {
    // custom flat IS rate
    bracket25Base = profit;
    bracket25Tax = roundCurrency(profit * (customRate / 100));
  }

  const totalIsTax = roundCurrency(bracket15Tax + bracket25Tax);
  const effectiveRatePercent = roundCurrency((totalIsTax / profit) * 100);
  const netProfitAfterIs = roundCurrency(profit - totalIsTax);

  return {
    annualTaxableProfit: profit,
    isRateMode: mode,
    reducedIsEligible: eligible,
    threshold,
    reducedRatePercent: reducedRate,
    standardRatePercent: mode === 'custom' ? customRate : standardRate,
    bracket15Base,
    bracket15Tax,
    bracket25Base,
    bracket25Tax,
    totalIsTax,
    effectiveRatePercent,
    netProfitAfterIs,
  };
}

export function getTaxRegimeDisplayLabel(config: FrenchTaxConfiguration): string {
  if (config.businessTaxRegime === 'micro') {
    const combined = roundCurrency(
      config.socialContributionRate +
        (config.versementLiberatoireEnabled ? config.versementLiberatoireRate : 0)
    );
    return config.versementLiberatoireEnabled
      ? `Micro-entreprise (${config.socialContributionRate}% URSSAF + ${config.versementLiberatoireRate}% VL = ${combined}% CA)`
      : `Micro-entreprise (${config.socialContributionRate}% URSSAF sur CA · IR Micro-BIC séparé)`;
  }

  if (config.businessTaxRegime === 'sarl' || config.businessTaxRegime === 'sas') {
    const prefix = config.businessTaxRegime.toUpperCase();
    if (config.isRateMode === 'progressive_15_25') {
      return config.reducedIsEligible
        ? `${prefix} (IS progressif ${config.corporateTaxRateReduced}% ≤ 42 500 € / ${config.corporateTaxRateStandard}%)`
        : `${prefix} (IS ${config.corporateTaxRateStandard}% standard)`;
    }
    if (config.isRateMode === 'standard_25') {
      return `${prefix} (IS ${config.corporateTaxRateStandard}%)`;
    }
    if (config.isRateMode === 'reduced_15') {
      return `${prefix} (IS réduit ${config.corporateTaxRateReduced}%)`;
    }
    return `${prefix} (IS ${config.corporateTaxCustomRate}%)`;
  }

  if (config.businessTaxRegime === 'custom') {
    return `Personnalisé (${config.corporateTaxCustomRate}%)`;
  }

  return 'Particulier (Sans fiscalité professionnelle)';
}

/**
 * Builds an immutable per-transaction tax & VAT snapshot at the moment a sale is validated.
 * Once saved onto `vehicle.buyerInfo.taxSnapshot`, subsequent settings changes must NOT alter it.
 */
export function buildTransactionTaxSnapshot(params: {
  salePrice: number;
  purchasePrice: number;
  repairCostTotal: number;
  generalExpensesTotal: number;
  settings?: Partial<GarageSettings> | null;
  vatRegimeOverride?: VatRegime;
  vatRateOverride?: number;
  capturedAt?: string;
}): TransactionTaxSnapshot {
  const config = normalizeFrenchTaxConfig(params.settings);
  const pnl = calculateVehicleProfitBeforeTaxes({
    salePrice: params.salePrice,
    purchasePrice: params.purchasePrice,
    repairCostTotal: params.repairCostTotal,
    generalExpensesTotal: params.generalExpensesTotal,
  });

  const isVatExemptProfile =
    config.businessTaxRegime === 'micro' || config.businessTaxRegime === 'none';

  const vat = calculateFrenchVat({
    salePrice: pnl.salePrice,
    purchasePrice: pnl.purchasePrice,
    vatRegime: isVatExemptProfile
      ? 'franchise_base'
      : params.vatRegimeOverride || config.vatRegime,
    vatRatePercent: isVatExemptProfile
      ? 0
      : params.vatRateOverride ?? config.vatRatePercent,
  });

  const taxLabel = getTaxRegimeDisplayLabel(config);
  let urssafRate = 0;
  let urssafAmount = 0;
  let vlEnabled = false;
  let vlRate = 0;
  let vlAmount = 0;
  let microBicEstimatedTax = 0;
  let corporateIsContextNote = '';
  const corporateTaxEstimatedAmount = 0;
  let totalTaxAmount = 0;

  if (config.businessTaxRegime === 'micro') {
    const micro = calculateMicroEntrepriseTaxes({
      turnover: pnl.salePrice,
      config,
    });
    urssafRate = micro.urssafRate;
    urssafAmount = micro.urssafAmount;
    vlEnabled = micro.versementLiberatoireEnabled;
    vlRate = micro.versementLiberatoireRate;
    vlAmount = micro.versementLiberatoireAmount;
    microBicEstimatedTax = micro.separateMicroBicIncomeTax;
    totalTaxAmount = micro.totalSocialAndVlAmount;
    if (!vlEnabled) {
      corporateIsContextNote = `IR Micro-BIC estimé séparément : ${micro.separateMicroBicIncomeTax.toFixed(2)} € (abattement ${micro.microBicAbattementPercent}%).`;
    }
  } else if (config.businessTaxRegime === 'sarl' || config.businessTaxRegime === 'sas') {
    // Corporate IS is calculated on company annual taxable profit, never flat 15% per vehicle.
    corporateIsContextNote =
      config.isRateMode === 'progressive_15_25' && config.reducedIsEligible
        ? `IS ${config.businessTaxRegime.toUpperCase()} calculé sur le résultat fiscal annuel (15% ≤ 42 500 €, 25% au-delà).`
        : `IS ${config.businessTaxRegime.toUpperCase()} calculé annuellement sur le résultat fiscal global de la société.`;
    totalTaxAmount = 0;
  } else if (config.businessTaxRegime === 'custom') {
    const rate = Math.max(0, Number(config.corporateTaxCustomRate ?? params.settings?.taxRatePercent ?? 0));
    totalTaxAmount = pnl.profitBeforeTaxes > 0 ? roundCurrency(pnl.profitBeforeTaxes * (rate / 100)) : 0;
  }

  const netProfitAfterTax = roundCurrency(pnl.profitBeforeTaxes - totalTaxAmount);

  const isParticulierRegime = config.businessTaxRegime === 'none';

  return {
    legalStatus: config.legalStatus,
    taxRegime: config.businessTaxRegime,
    taxLabel,
    vatRegime: vat.vatRegime,
    vatRatePercent: vat.vatRatePercent,
    vatBaseAmount: vat.vatBaseAmount,
    vatAmount: vat.vatAmount,
    htAmount: vat.htAmount,
    ttcAmount: vat.ttcAmount,
    vatLegalMention: isParticulierRegime ? '' : vat.legalMention,
    salePrice: pnl.salePrice,
    purchasePrice: pnl.purchasePrice,
    repairCostTotal: pnl.repairCostTotal,
    generalExpensesTotal: pnl.generalExpensesTotal,
    profitBeforeTaxes: pnl.profitBeforeTaxes,
    urssafRate: isParticulierRegime ? 0 : urssafRate,
    urssafAmount: isParticulierRegime ? 0 : urssafAmount,
    versementLiberatoireEnabled: isParticulierRegime ? false : vlEnabled,
    versementLiberatoireRate: isParticulierRegime ? 0 : vlRate,
    versementLiberatoireAmount: isParticulierRegime ? 0 : vlAmount,
    microBicEstimatedTax: isParticulierRegime ? 0 : microBicEstimatedTax,
    corporateIsContextNote: isParticulierRegime ? '' : corporateIsContextNote,
    corporateTaxEstimatedAmount: isParticulierRegime ? 0 : corporateTaxEstimatedAmount,
    totalTaxAmount: isParticulierRegime ? 0 : totalTaxAmount,
    netProfitAfterTax: isParticulierRegime ? pnl.profitBeforeTaxes : netProfitAfterTax,
    effectiveDate:
      config.businessTaxRegime === 'micro'
        ? config.effectiveDates.urssaf
        : config.effectiveDates.is,
    capturedAt: params.capturedAt || new Date().toISOString(),
    isHistoricalSnapshot: true,
    disclaimerNote: isParticulierRegime ? '' : FRENCH_TAX_DEFAULTS.DISCLAIMER_FR,
  };
}

/**
 * Resolves a sold vehicle's financial & tax report.
 * CRITICAL IMMUTABILITY RULE:
 * If the vehicle already has an immutable `buyerInfo.taxSnapshot` saved at sale time,
 * ALWAYS return that frozen snapshot (ignoring subsequent global/garage setting changes).
 */
export function getResolvedVehicleSaleSnapshot(params: {
  vehicle: Vehicle;
  garageSettings?: Partial<GarageSettings> | null;
  repairs?: RepairTask[];
  expenses?: GeneralExpense[];
  fallbackProfileType?: AppUserProfileType;
}): TransactionTaxSnapshot {
  const { vehicle, garageSettings, repairs, expenses, fallbackProfileType } = params;
  const explicitDealProfile = vehicle.buyerInfo?.sellerProfileType;
  const existingSnap = vehicle.buyerInfo?.taxSnapshot;

  if (existingSnap?.isHistoricalSnapshot) {
    if (!explicitDealProfile) {
      return existingSnap;
    }
    const snapMatchesExplicitProfile =
      explicitDealProfile === 'particulier'
        ? existingSnap.taxRegime === 'none' || existingSnap.legalStatus === 'particulier'
        : existingSnap.taxRegime === 'micro' || existingSnap.legalStatus === 'micro_entreprise';
    if (snapMatchesExplicitProfile) {
      return existingSnap;
    }
  }

  const effectiveSettings = explicitDealProfile
    ? resolveEffectiveSettingsForDeal({ vehicle, garageSettings, fallbackProfileType })
    : garageSettings;

  const repairCostTotal = repairs
    ? repairs.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0)
    : Number(vehicle.repairCostTotal) || 0;
  const generalExpensesTotal = expenses
    ? expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    : Number(vehicle.generalExpensesTotal) || 0;
  const salePrice = Number(vehicle.buyerInfo?.salePrice) || Number(vehicle.targetSalePrice) || 0;

  return buildTransactionTaxSnapshot({
    salePrice,
    purchasePrice: Number(vehicle.purchasePrice) || 0,
    repairCostTotal,
    generalExpensesTotal,
    settings: effectiveSettings,
    vatRegimeOverride: vehicle.buyerInfo?.vatRegime,
    vatRateOverride: vehicle.buyerInfo?.vatRatePercent,
    capturedAt: vehicle.buyerInfo?.saleDate || vehicle.updatedAt,
  });
}
