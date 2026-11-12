import {
  CardPaddingDensity,
  SubscriptionPlan,
  SubscriptionPlanId,
  SystemThemeConfig,
  ThemePaletteTokens,
  UserProfile,
} from '../types/garage';
import { roundToTwo } from './finance';

export const SUPERADMIN_BOOTSTRAP_EMAIL = 'blackproduction999@gmail.com';

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 0,
    vehicleLimit: 5,
    featuresFr: ['Jusqu’à 5 véhicules', 'Bilan P&L basique', 'Export Cerfa 15776*02'],
    featuresRu: ['До 5 автомобилей', 'Базовый расчёт P&L', 'Экспорт Cerfa 15776*02'],
  },
  {
    id: 'pro',
    name: 'Pro Dealer',
    priceMonthly: 49,
    vehicleLimit: 50,
    featuresFr: ['Jusqu’à 50 véhicules', 'Analytique & Dépenses', 'Factures PDF TVA Marge'],
    featuresRu: ['До 50 автомобилей', 'Аналитика и расходы', 'Счета PDF (TVA sur marge)'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 149,
    vehicleLimit: 9999,
    featuresFr: ['Véhicules illimités', 'Support prioritaire', 'Multi-utilisateurs & API'],
    featuresRu: ['Безлимитный автопарк', 'Приоритетная поддержка', 'Мульти-доступ и API'],
  },
];

export const DEFAULT_LIGHT_PALETTE: ThemePaletteTokens = {
  background: '#f1f5f9',
  card: '#ffffff',
  surfaceMuted: '#e2e8f0',
  primary: '#f59e0b',
  primaryForeground: '#0f172a',
  foreground: '#0f172a',
  secondaryForeground: '#334155',
  mutedForeground: '#64748b',
  border: '#cbd5e1',
  success: '#059669',
  warning: '#d97706',
};

export const DEFAULT_DARK_PALETTE: ThemePaletteTokens = {
  background: '#020617',
  card: '#0f172a',
  surfaceMuted: '#1e293b',
  primary: '#f59e0b',
  primaryForeground: '#020617',
  foreground: '#f8fafc',
  secondaryForeground: '#cbd5e1',
  mutedForeground: '#94a3b8',
  border: '#1e293b',
  success: '#34d399',
  warning: '#fbbf24',
};

export const CARD_PADDING_VALUES: Record<CardPaddingDensity, string> = {
  compact: '14px',
  comfortable: '20px',
  spacious: '28px',
};

export const DEFAULT_SYSTEM_THEME_CONFIG: SystemThemeConfig = {
  primaryAccentColor: '#f59e0b',
  cardBorderRadius: '16px',
  buttonBorderRadius: '12px',
  cardPadding: 'comfortable',
  sectionGap: '24px',
  defaultInventoryViewMode: 'grid',
  cerfaAdjustments: {
    offsetX: 0,
    offsetY: 0,
    fontSizeDelta: 0,
    defaultTemplate: 'cerfa_15776_02',
  },
  lightPalette: DEFAULT_LIGHT_PALETTE,
  darkPalette: DEFAULT_DARK_PALETTE,
};

export const ACCENT_COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'Amber Gold', hex: '#f59e0b' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Cobalt Blue', hex: '#3b82f6' },
  { name: 'Crimson Rose', hex: '#f43f5e' },
  { name: 'Violet', hex: '#8b5cf6' },
];

export interface BrandThemePreset {
  id: string;
  nameFr: string;
  nameRu: string;
  primaryHex: string;
  lightPalette: ThemePaletteTokens;
  darkPalette: ThemePaletteTokens;
}

export const BRAND_THEME_PRESETS: BrandThemePreset[] = [
  {
    id: 'stock_amber',
    nameFr: 'Stock SaaS Amber',
    nameRu: 'Стандарт (Amber)',
    primaryHex: '#f59e0b',
    lightPalette: DEFAULT_LIGHT_PALETTE,
    darkPalette: DEFAULT_DARK_PALETTE,
  },
  {
    id: 'cobalt_executive',
    nameFr: 'Cobalt Executive',
    nameRu: 'Кобальт Бизнес',
    primaryHex: '#2563eb',
    lightPalette: {
      ...DEFAULT_LIGHT_PALETTE,
      background: '#f4f6fb',
      card: '#ffffff',
      surfaceMuted: '#e5ebf5',
      primary: '#2563eb',
      primaryForeground: '#ffffff',
      border: '#d0d9e8',
    },
    darkPalette: {
      ...DEFAULT_DARK_PALETTE,
      background: '#060b19',
      card: '#0d152a',
      surfaceMuted: '#16223f',
      primary: '#3b82f6',
      primaryForeground: '#ffffff',
      border: '#1e2c4f',
    },
  },
  {
    id: 'emerald_atelier',
    nameFr: 'Emerald Atelier',
    nameRu: 'Изумрудный Сервис',
    primaryHex: '#10b981',
    lightPalette: {
      ...DEFAULT_LIGHT_PALETTE,
      background: '#f3f7f5',
      card: '#ffffff',
      surfaceMuted: '#e1ebe6',
      primary: '#059669',
      primaryForeground: '#ffffff',
      border: '#c7d9d0',
      success: '#047857',
    },
    darkPalette: {
      ...DEFAULT_DARK_PALETTE,
      background: '#030d0a',
      card: '#0a1814',
      surfaceMuted: '#132822',
      primary: '#10b981',
      primaryForeground: '#022c22',
      border: '#19352c',
      success: '#34d399',
    },
  },
  {
    id: 'crimson_motorsport',
    nameFr: 'Crimson Motorsport',
    nameRu: 'Спорт Карбон',
    primaryHex: '#e11d48',
    lightPalette: {
      ...DEFAULT_LIGHT_PALETTE,
      background: '#f8f7f8',
      card: '#ffffff',
      surfaceMuted: '#ede9ec',
      primary: '#e11d48',
      primaryForeground: '#ffffff',
      border: '#dcd5da',
    },
    darkPalette: {
      ...DEFAULT_DARK_PALETTE,
      background: '#09090b',
      card: '#141418',
      surfaceMuted: '#222228',
      primary: '#f43f5e',
      primaryForeground: '#ffffff',
      border: '#27272f',
    },
  },
  {
    id: 'violet_studio',
    nameFr: 'Violet Studio',
    nameRu: 'Фиолетовая Студия',
    primaryHex: '#7c3aed',
    lightPalette: {
      ...DEFAULT_LIGHT_PALETTE,
      background: '#f5f4fb',
      card: '#ffffff',
      surfaceMuted: '#e7e4f5',
      primary: '#7c3aed',
      primaryForeground: '#ffffff',
      border: '#d6d0ec',
    },
    darkPalette: {
      ...DEFAULT_DARK_PALETTE,
      background: '#090614',
      card: '#120d24',
      surfaceMuted: '#1d1638',
      primary: '#8b5cf6',
      primaryForeground: '#ffffff',
      border: '#261e47',
    },
  },
];

export function getContrastForeground(hex: string): string {
  const clean = (hex || '').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return '#0f172a';
  }
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.52 ? '#0f172a' : '#ffffff';
}

export function resolveSystemThemeConfig(
  raw?: Partial<SystemThemeConfig> | null
): SystemThemeConfig {
  const baseAccent = raw?.primaryAccentColor || DEFAULT_SYSTEM_THEME_CONFIG.primaryAccentColor;
  const lightPalette: ThemePaletteTokens = {
    ...DEFAULT_LIGHT_PALETTE,
    primary: baseAccent,
    ...(raw?.lightPalette || {}),
  };
  lightPalette.primaryForeground =
    raw?.lightPalette?.primaryForeground || getContrastForeground(lightPalette.primary);

  const darkPalette: ThemePaletteTokens = {
    ...DEFAULT_DARK_PALETTE,
    primary: baseAccent,
    ...(raw?.darkPalette || {}),
  };
  darkPalette.primaryForeground =
    raw?.darkPalette?.primaryForeground || getContrastForeground(darkPalette.primary);

  return {
    ...DEFAULT_SYSTEM_THEME_CONFIG,
    ...(raw || {}),
    primaryAccentColor: baseAccent,
    cerfaAdjustments: {
      ...DEFAULT_SYSTEM_THEME_CONFIG.cerfaAdjustments,
      ...(raw?.cerfaAdjustments || {}),
    },
    lightPalette,
    darkPalette,
  };
}

export function isSuperAdminUser(params: {
  email?: string | null;
  emailVerified?: boolean;
  profile?: Pick<UserProfile, 'role'> | null;
}): boolean {
  if (params.profile?.role === 'superadmin') {
    return true;
  }
  if (
    params.email &&
    params.email.toLowerCase() === SUPERADMIN_BOOTSTRAP_EMAIL.toLowerCase() &&
    params.emailVerified !== false
  ) {
    return true;
  }
  return false;
}

export interface AdminDashboardMetrics {
  totalUsers: number;
  activeGarages: number;
  monthlyRevenueMRR: number;
  totalActiveVehicles: number;
  trialAccounts: number;
  pastDueAccounts: number;
  planCounts: Record<SubscriptionPlanId, number>;
}

export function computeAdminDashboardMetrics(
  accounts: UserProfile[],
  plans: SubscriptionPlan[] = DEFAULT_SUBSCRIPTION_PLANS
): AdminDashboardMetrics {
  const planPriceMap = new Map<SubscriptionPlanId, number>();
  for (const p of plans) {
    planPriceMap.set(p.id, p.priceMonthly);
  }

  let monthlyRevenueMRR = 0;
  let activeGarages = 0;
  let totalActiveVehicles = 0;
  let trialAccounts = 0;
  let pastDueAccounts = 0;

  const planCounts: Record<SubscriptionPlanId, number> = {
    starter: 0,
    pro: 0,
    enterprise: 0,
  };

  for (const acc of accounts) {
    planCounts[acc.planId] = (planCounts[acc.planId] || 0) + 1;
    totalActiveVehicles += Number(acc.activeVehiclesCount) || 0;

    if (acc.subscriptionStatus === 'active') {
      activeGarages += 1;
      const price = acc.mrrAmount > 0 ? acc.mrrAmount : (planPriceMap.get(acc.planId) ?? 0);
      monthlyRevenueMRR += price;
    } else if (acc.subscriptionStatus === 'trial') {
      activeGarages += 1;
      trialAccounts += 1;
    } else if (acc.subscriptionStatus === 'past_due') {
      pastDueAccounts += 1;
    }
  }

  return {
    totalUsers: accounts.length,
    activeGarages,
    monthlyRevenueMRR: roundToTwo(monthlyRevenueMRR),
    totalActiveVehicles,
    trialAccounts,
    pastDueAccounts,
    planCounts,
  };
}

export function applySystemThemeVariables(
  config: SystemThemeConfig,
  themeMode?: 'dark' | 'light'
): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveSystemThemeConfig(config);
  const root = document.documentElement;
  const mode: 'dark' | 'light' =
    themeMode || (root.classList.contains('theme-light') ? 'light' : 'dark');
  const palette =
    mode === 'light'
      ? resolved.lightPalette || DEFAULT_LIGHT_PALETTE
      : resolved.darkPalette || DEFAULT_DARK_PALETTE;

  const primaryFg = palette.primaryForeground || getContrastForeground(palette.primary);

  root.style.setProperty('--background', palette.background);
  root.style.setProperty('--card', palette.card);
  root.style.setProperty('--surface-muted', palette.surfaceMuted);
  root.style.setProperty('--primary', palette.primary);
  root.style.setProperty('--primary-foreground', primaryFg);
  root.style.setProperty('--foreground', palette.foreground);
  root.style.setProperty('--secondary-foreground', palette.secondaryForeground);
  root.style.setProperty('--muted-foreground', palette.mutedForeground);
  root.style.setProperty('--border', palette.border);
  root.style.setProperty('--success', palette.success);
  root.style.setProperty('--warning', palette.warning);

  root.style.setProperty('--ag-accent', palette.primary);
  root.style.setProperty('--ag-card-radius', resolved.cardBorderRadius || '16px');
  root.style.setProperty('--ag-button-radius', resolved.buttonBorderRadius || '12px');
  root.style.setProperty(
    '--ag-card-padding',
    CARD_PADDING_VALUES[resolved.cardPadding || 'comfortable'] || '20px'
  );
  root.style.setProperty('--ag-section-gap', resolved.sectionGap || '24px');
}

import {
  DynamicExpenseCategory,
  FeatureFlagsConfig,
  GlobalTextOverrides,
} from '../types/garage';

export const DEFAULT_FEATURE_FLAGS: FeatureFlagsConfig = {
  cerfaGenerator: true,
  pnlCalculator: true,
  expenseAnalytics: true,
  multiGarage: true,
  repairChecklist: true,
};

export const DEFAULT_DYNAMIC_EXPENSE_CATEGORIES: DynamicExpenseCategory[] = [
  { id: 'transport', labelFr: 'Transport / Rapatriement', labelRu: 'Доставка / Эвакуатор', icon: 'Truck', defaultAmount: 180, order: 1 },
  { id: 'fuel', labelFr: 'Carburant', labelRu: 'Топливо', icon: 'Fuel', defaultAmount: 65, order: 2 },
  { id: 'controle_technique', labelFr: 'Contrôle Technique', labelRu: 'Техосмотр (Contrôle Technique)', icon: 'FileCheck', defaultAmount: 85, order: 3 },
  { id: 'detailing', labelFr: 'Lavage / Detailing', labelRu: 'Мойка / Детейлинг', icon: 'Sparkles', defaultAmount: 120, order: 4 },
  { id: 'admin', labelFr: 'Frais Administratifs / Carte Grise', labelRu: 'Оформление и Carte Grise', icon: 'FileText', defaultAmount: 35, order: 5 },
  { id: 'insurance', labelFr: 'Assurance garage / Flotte transit', labelRu: 'Страховка автопарка / Транзит', icon: 'ShieldCheck', defaultAmount: 50, order: 6 },
  { id: 'other', labelFr: 'Autre dépense', labelRu: 'Прочие расходы', icon: 'Coins', defaultAmount: 0, order: 7 },
];

export function sortExpenseCategories(
  categories: DynamicExpenseCategory[]
): DynamicExpenseCategory[] {
  return [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export function resolveLocalizedLabel(
  key: string,
  lang: 'fr' | 'ru',
  baseText: string,
  overrides: GlobalTextOverrides
): string {
  const entry = overrides[key];
  if (entry) {
    const custom = lang === 'ru' ? entry.ru : entry.fr;
    if (custom !== undefined && custom.trim() !== '') {
      return custom;
    }
  }
  return baseText;
}

export type TranslationCategoryId =
  | 'all'
  | 'navigation'
  | 'inventory'
  | 'vehicle_detail'
  | 'sale_report'
  | 'statuses'
  | 'analytics'
  | 'forms';

export const TRANSLATION_CATEGORIES: {
  id: TranslationCategoryId;
  labelFr: string;
  labelRu: string;
}[] = [
  { id: 'all', labelFr: 'Tout', labelRu: 'Все' },
  { id: 'navigation', labelFr: 'Navigation & En-tête', labelRu: 'Навигация и шапка' },
  { id: 'inventory', labelFr: 'Inventaire & Garages', labelRu: 'Инвентарь и гаражи' },
  { id: 'vehicle_detail', labelFr: 'Fiche Véhicule & P&L', labelRu: 'Карточка авто и P&L' },
  { id: 'sale_report', labelFr: 'Rapport Financier', labelRu: 'Финансовый отчёт' },
  { id: 'statuses', labelFr: 'Statuts', labelRu: 'Статусы' },
  { id: 'analytics', labelFr: 'Analytique', labelRu: 'Аналитика' },
  { id: 'forms', labelFr: 'Formulaires & Docs', labelRu: 'Формы и документы' },
];

export function getTranslationKeyCategory(key: string): Exclude<TranslationCategoryId, 'all'> {
  if (key.startsWith('saleReport')) return 'sale_report';
  if (key.startsWith('analytics')) return 'analytics';
  if (key.startsWith('status') && key !== 'statusLabel') return 'statuses';
  if (
    [
      'appName',
      'appSubtitle',
      'proDealer',
      'studioView',
      'mobileView',
      'newVehicle',
      'openNewTab',
      'demoFleet',
      'loading',
      'signIn',
      'signOut',
      'allGarages',
      'headerTotalInStock',
      'headerPrepRepair',
      'headerForSale',
      'settingsLabel',
      'liveSync',
      'totalFleet',
      'inStockLabel',
      'vehiclesCount',
      'activeStock',
      'capitalInvested',
      'globalMargin',
      'realizedProfit',
    ].includes(key)
  ) {
    return 'navigation';
  }
  if (
    key.startsWith('search') ||
    key.startsWith('clear') ||
    key.startsWith('sort') ||
    key.startsWith('view') ||
    key.startsWith('empty') ||
    key.startsWith('card') ||
    key.startsWith('selectGarage') ||
    key.startsWith('createGarage') ||
    key.startsWith('enterGarage') ||
    key.startsWith('garagePrep') ||
    [
      'boughtOn',
      'purchaseAndExpenses',
      'realizedSalePrice',
      'targetSalePrice',
      'netMargin',
      'marginPercent',
      'roiPercent',
      'manageDossier',
      'addVehicleBtn',
      'loadDemoBtn',
      'thVehicleYear',
      'thPlate',
      'thMileage',
      'thPurchasePrice',
      'thSalePrice',
      'dossierBtn',
    ].includes(key)
  ) {
    return 'inventory';
  }
  if (
    key.startsWith('tab') ||
    key.startsWith('pnl') ||
    key.startsWith('repair') ||
    key.startsWith('generalExpense') ||
    key.startsWith('techSpec') ||
    key.startsWith('commercialStatus') ||
    [
      'backToFleet',
      'recordSaleBtn',
      'invoicePdfBtn',
      'editVehicleTitle',
      'deleteVehicleTitle',
      'confirmDelete',
      'statusLabel',
      'purchasePriceLabel',
      'acquiredOn',
      'workshopRepairsLabel',
      'partsAndLaborBreakdown',
      'generalExpensesLabel',
      'expensesCount',
      'totalCapitalInvestedLabel',
      'expensesSum',
      'soldTo',
      'inListing',
      'netProfitLabel',
      'make',
      'model',
      'trimVersion',
      'year',
      'mileage',
      'vinOrPlate',
      'vinFieldLabel',
      'plateFieldLabel',
      'purchaseDate',
      'targetSalePriceInput',
      'saleValidated',
      'buyer',
      'phone',
      'email',
      'billingAddress',
      'netSalePrice',
      'downloadInvoicePdf',
      'inStockNotice',
      'recordSaleAndDetails',
      'completedCount',
      'manageAllRepairs',
      'newRepairBtn',
      'newExpenseBtn',
      'totalCumulativeRepairs',
      'totalCumulativeExpenses',
      'thTaskDesc',
      'thStatus',
      'thPartsCost',
      'thLaborCost',
      'thTotalTask',
      'thActions',
      'thCategory',
      'thDescription',
      'thDate',
      'thAmount',
    ].includes(key)
  ) {
    return 'vehicle_detail';
  }
  return 'forms';
}

