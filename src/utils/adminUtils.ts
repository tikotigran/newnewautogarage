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
  headerBg: '#ffffff',
  headerText: '#0f172a',
  headerBorder: '#cbd5e1',
  navActiveBg: '#f59e0b',
  navActiveText: '#0f172a',
  detailContainerBg: '#ffffff',
  metricBoxBg: '#e2e8f0',
  saleReceiptBg: '#f8fafc',
  detailHeadingColor: '#0f172a',
  profitColor: '#059669',
  expenseColor: '#dc2626',
  tableHeaderBg: '#e2e8f0',
  tableRowHover: '#f1f5f9',
  chartAccent: '#f59e0b',
  modalBg: '#ffffff',
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
  headerBg: '#0f172a',
  headerText: '#f8fafc',
  headerBorder: '#1e293b',
  navActiveBg: '#f59e0b',
  navActiveText: '#020617',
  detailContainerBg: '#0f172a',
  metricBoxBg: '#1e293b',
  saleReceiptBg: '#020617',
  detailHeadingColor: '#f59e0b',
  profitColor: '#34d399',
  expenseColor: '#f87171',
  tableHeaderBg: '#020617',
  tableRowHover: '#1e293b',
  chartAccent: '#f59e0b',
  modalBg: '#0f172a',
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
      headerBg: '#ffffff',
      headerBorder: '#d0d9e8',
      navActiveBg: '#2563eb',
      navActiveText: '#ffffff',
      detailContainerBg: '#ffffff',
      metricBoxBg: '#e5ebf5',
      saleReceiptBg: '#f4f6fb',
      detailHeadingColor: '#1e40af',
      tableHeaderBg: '#e5ebf5',
      tableRowHover: '#eff4fc',
      chartAccent: '#2563eb',
      modalBg: '#ffffff',
    },
    darkPalette: {
      ...DEFAULT_DARK_PALETTE,
      background: '#060b19',
      card: '#0d152a',
      surfaceMuted: '#16223f',
      primary: '#3b82f6',
      primaryForeground: '#ffffff',
      border: '#1e2c4f',
      headerBg: '#0d152a',
      headerBorder: '#1e2c4f',
      navActiveBg: '#3b82f6',
      navActiveText: '#ffffff',
      detailContainerBg: '#0d152a',
      metricBoxBg: '#16223f',
      saleReceiptBg: '#060b19',
      detailHeadingColor: '#60a5fa',
      tableHeaderBg: '#060b19',
      tableRowHover: '#16223f',
      chartAccent: '#3b82f6',
      modalBg: '#0d152a',
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
      headerBg: '#ffffff',
      headerBorder: '#c7d9d0',
      navActiveBg: '#059669',
      navActiveText: '#ffffff',
      detailContainerBg: '#ffffff',
      metricBoxBg: '#e1ebe6',
      saleReceiptBg: '#f3f7f5',
      detailHeadingColor: '#065f46',
      profitColor: '#047857',
      tableHeaderBg: '#e1ebe6',
      tableRowHover: '#ecf4f0',
      chartAccent: '#059669',
      modalBg: '#ffffff',
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
      headerBg: '#0a1814',
      headerBorder: '#19352c',
      navActiveBg: '#10b981',
      navActiveText: '#022c22',
      detailContainerBg: '#0a1814',
      metricBoxBg: '#132822',
      saleReceiptBg: '#030d0a',
      detailHeadingColor: '#34d399',
      profitColor: '#34d399',
      tableHeaderBg: '#030d0a',
      tableRowHover: '#132822',
      chartAccent: '#10b981',
      modalBg: '#0a1814',
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
      headerBg: '#ffffff',
      headerBorder: '#dcd5da',
      navActiveBg: '#e11d48',
      navActiveText: '#ffffff',
      detailContainerBg: '#ffffff',
      metricBoxBg: '#ede9ec',
      saleReceiptBg: '#f8f7f8',
      detailHeadingColor: '#be123c',
      tableHeaderBg: '#ede9ec',
      tableRowHover: '#f4f1f3',
      chartAccent: '#e11d48',
      modalBg: '#ffffff',
    },
    darkPalette: {
      ...DEFAULT_DARK_PALETTE,
      background: '#09090b',
      card: '#141418',
      surfaceMuted: '#222228',
      primary: '#f43f5e',
      primaryForeground: '#ffffff',
      border: '#27272f',
      headerBg: '#141418',
      headerBorder: '#27272f',
      navActiveBg: '#f43f5e',
      navActiveText: '#ffffff',
      detailContainerBg: '#141418',
      metricBoxBg: '#222228',
      saleReceiptBg: '#09090b',
      detailHeadingColor: '#fb7185',
      tableHeaderBg: '#09090b',
      tableRowHover: '#222228',
      chartAccent: '#f43f5e',
      modalBg: '#141418',
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
      headerBg: '#ffffff',
      headerBorder: '#d6d0ec',
      navActiveBg: '#7c3aed',
      navActiveText: '#ffffff',
      detailContainerBg: '#ffffff',
      metricBoxBg: '#e7e4f5',
      saleReceiptBg: '#f5f4fb',
      detailHeadingColor: '#6d28d9',
      tableHeaderBg: '#e7e4f5',
      tableRowHover: '#efedf8',
      chartAccent: '#7c3aed',
      modalBg: '#ffffff',
    },
    darkPalette: {
      ...DEFAULT_DARK_PALETTE,
      background: '#090614',
      card: '#120d24',
      surfaceMuted: '#1d1638',
      primary: '#8b5cf6',
      primaryForeground: '#ffffff',
      border: '#261e47',
      headerBg: '#120d24',
      headerBorder: '#261e47',
      navActiveBg: '#8b5cf6',
      navActiveText: '#ffffff',
      detailContainerBg: '#120d24',
      metricBoxBg: '#1d1638',
      saleReceiptBg: '#090614',
      detailHeadingColor: '#a78bfa',
      tableHeaderBg: '#090614',
      tableRowHover: '#1d1638',
      chartAccent: '#8b5cf6',
      modalBg: '#120d24',
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

function hydrateSectionTokens(
  baseDefaults: ThemePaletteTokens,
  rawPalette: Partial<ThemePaletteTokens> | undefined,
  mode: 'light' | 'dark',
  baseAccent: string
): ThemePaletteTokens {
  const primary = rawPalette?.primary || baseAccent;
  const primaryForeground =
    rawPalette?.primaryForeground || getContrastForeground(primary);
  const card = rawPalette?.card || baseDefaults.card;
  const background = rawPalette?.background || baseDefaults.background;
  const surfaceMuted = rawPalette?.surfaceMuted || baseDefaults.surfaceMuted;
  const foreground = rawPalette?.foreground || baseDefaults.foreground;
  const border = rawPalette?.border || baseDefaults.border;
  const success = rawPalette?.success || baseDefaults.success;

  return {
    ...baseDefaults,
    primary,
    primaryForeground,
    ...(rawPalette || {}),
    headerBg: rawPalette?.headerBg || card,
    headerText: rawPalette?.headerText || foreground,
    headerBorder: rawPalette?.headerBorder || border,
    navActiveBg: rawPalette?.navActiveBg || primary,
    navActiveText:
      rawPalette?.navActiveText ||
      getContrastForeground(rawPalette?.navActiveBg || primary),
    detailContainerBg: rawPalette?.detailContainerBg || card,
    metricBoxBg: rawPalette?.metricBoxBg || surfaceMuted,
    saleReceiptBg:
      rawPalette?.saleReceiptBg ||
      (mode === 'light' ? '#f8fafc' : background),
    detailHeadingColor:
      rawPalette?.detailHeadingColor ||
      (mode === 'light' ? foreground : primary),
    profitColor: rawPalette?.profitColor || success,
    expenseColor: rawPalette?.expenseColor || baseDefaults.expenseColor || '#ef4444',
    tableHeaderBg:
      rawPalette?.tableHeaderBg ||
      (mode === 'light' ? surfaceMuted : background),
    tableRowHover:
      rawPalette?.tableRowHover ||
      (mode === 'light' ? background : surfaceMuted),
    chartAccent: rawPalette?.chartAccent || primary,
    modalBg: rawPalette?.modalBg || card,
  };
}

export function resolveSystemThemeConfig(
  raw?: Partial<SystemThemeConfig> | null
): SystemThemeConfig {
  const baseAccent = raw?.primaryAccentColor || DEFAULT_SYSTEM_THEME_CONFIG.primaryAccentColor;
  const lightPalette = hydrateSectionTokens(
    DEFAULT_LIGHT_PALETTE,
    raw?.lightPalette,
    'light',
    baseAccent
  );
  const darkPalette = hydrateSectionTokens(
    DEFAULT_DARK_PALETTE,
    raw?.darkPalette,
    'dark',
    baseAccent
  );

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

  // Section-by-section CSS custom properties
  root.style.setProperty('--ag-header-bg', palette.headerBg || palette.card);
  root.style.setProperty('--ag-header-text', palette.headerText || palette.foreground);
  root.style.setProperty('--ag-header-border', palette.headerBorder || palette.border);
  root.style.setProperty('--ag-nav-active-bg', palette.navActiveBg || palette.primary);
  root.style.setProperty(
    '--ag-nav-active-text',
    palette.navActiveText || getContrastForeground(palette.navActiveBg || palette.primary)
  );
  root.style.setProperty('--ag-detail-bg', palette.detailContainerBg || palette.card);
  root.style.setProperty('--ag-metric-bg', palette.metricBoxBg || palette.surfaceMuted);
  root.style.setProperty('--ag-receipt-bg', palette.saleReceiptBg || palette.background);
  root.style.setProperty(
    '--ag-detail-heading',
    palette.detailHeadingColor || (mode === 'light' ? palette.foreground : palette.primary)
  );
  root.style.setProperty('--ag-profit-color', palette.profitColor || palette.success);
  root.style.setProperty('--ag-expense-color', palette.expenseColor || '#ef4444');
  root.style.setProperty('--ag-table-header-bg', palette.tableHeaderBg || palette.background);
  root.style.setProperty('--ag-table-row-hover', palette.tableRowHover || palette.surfaceMuted);
  root.style.setProperty('--ag-chart-accent', palette.chartAccent || palette.primary);
  root.style.setProperty('--ag-modal-bg', palette.modalBg || palette.card);
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

export function resolveLocalizedColor(
  key: string,
  overrides: GlobalTextOverrides
): string | undefined {
  const entry = overrides[key];
  const color = entry?.color?.trim();
  if (!color) return undefined;
  return color;
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

