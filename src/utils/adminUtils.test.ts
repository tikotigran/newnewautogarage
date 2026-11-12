import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySystemThemeVariables,
  BRAND_THEME_PRESETS,
  CARD_PADDING_VALUES,
  computeAdminDashboardMetrics,
  DEFAULT_DARK_PALETTE,
  DEFAULT_DYNAMIC_EXPENSE_CATEGORIES,
  DEFAULT_LIGHT_PALETTE,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_SYSTEM_THEME_CONFIG,
  getContrastForeground,
  getTranslationKeyCategory,
  isSuperAdminUser,
  resolveLocalizedColor,
  resolveLocalizedLabel,
  resolveSystemThemeConfig,
  sortExpenseCategories,
  SUPERADMIN_BOOTSTRAP_EMAIL,
} from './adminUtils';
import { UserProfile } from '../types/garage';

const mockAccounts: UserProfile[] = [
  {
    uid: 'u1',
    email: SUPERADMIN_BOOTSTRAP_EMAIL,
    displayName: 'Admin',
    garageName: 'AutoGarage HQ',
    role: 'superadmin',
    planId: 'enterprise',
    vehicleLimit: 9999,
    activeVehiclesCount: 12,
    subscriptionStatus: 'active',
    mrrAmount: 149,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    uid: 'u2',
    email: 'garage.lyon@example.fr',
    displayName: 'Marc Dupont',
    garageName: 'Lyon Auto Select',
    role: 'user',
    planId: 'pro',
    vehicleLimit: 50,
    activeVehiclesCount: 18,
    subscriptionStatus: 'active',
    mrrAmount: 49,
    createdAt: '2026-03-10T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    uid: 'u3',
    email: 'paris.vo@example.fr',
    displayName: 'Sophie Martin',
    garageName: 'Paris VO',
    role: 'user',
    planId: 'starter',
    vehicleLimit: 5,
    activeVehiclesCount: 3,
    subscriptionStatus: 'trial',
    mrrAmount: 0,
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    uid: 'u4',
    email: 'late@example.fr',
    displayName: 'Luc Bernard',
    garageName: 'Sud Occasion',
    role: 'user',
    planId: 'pro',
    vehicleLimit: 50,
    activeVehiclesCount: 7,
    subscriptionStatus: 'past_due',
    mrrAmount: 49,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
];

test('isSuperAdminUser strictly enforces superadmin role or verified bootstrap email', () => {
  assert.equal(isSuperAdminUser({ email: 'user@example.com', profile: { role: 'user' } }), false);
  assert.equal(isSuperAdminUser({ email: null, profile: null }), false);
  assert.equal(isSuperAdminUser({ email: SUPERADMIN_BOOTSTRAP_EMAIL, emailVerified: false, profile: { role: 'user' } }), false);
  assert.equal(isSuperAdminUser({ email: SUPERADMIN_BOOTSTRAP_EMAIL, emailVerified: true, profile: { role: 'user' } }), true);
  assert.equal(isSuperAdminUser({ email: 'other@example.com', profile: { role: 'superadmin' } }), true);
});

test('computeAdminDashboardMetrics calculates totalUsers, activeGarages, and MRR accurately', () => {
  const metrics = computeAdminDashboardMetrics(mockAccounts, DEFAULT_SUBSCRIPTION_PLANS);
  assert.equal(metrics.totalUsers, 4);
  assert.equal(metrics.activeGarages, 3); // 2 active + 1 trial
  assert.equal(metrics.monthlyRevenueMRR, 198); // 149 + 49 (past_due excluded from active MRR)
  assert.equal(metrics.totalActiveVehicles, 40);
  assert.equal(metrics.trialAccounts, 1);
  assert.equal(metrics.pastDueAccounts, 1);
  assert.equal(metrics.planCounts.enterprise, 1);
  assert.equal(metrics.planCounts.pro, 2);
  assert.equal(metrics.planCounts.starter, 1);
});

test('sortExpenseCategories sorts categories by order ascending', () => {
  const reversed = [...DEFAULT_DYNAMIC_EXPENSE_CATEGORIES].reverse();
  const sorted = sortExpenseCategories(reversed);
  assert.equal(sorted[0].id, 'transport');
  assert.equal(sorted[sorted.length - 1].id, 'other');
});

test('resolveLocalizedLabel returns override when set and falls back to baseText', () => {
  const overrides = { appName: { fr: 'Mon Garage Pro', ru: 'Мой Автосалон' } };
  assert.equal(resolveLocalizedLabel('appName', 'fr', 'AutoGarage Manager', overrides), 'Mon Garage Pro');
  assert.equal(resolveLocalizedLabel('appName', 'ru', 'AutoGarage Manager', overrides), 'Мой Автосалон');
  assert.equal(resolveLocalizedLabel('newVehicle', 'fr', 'Nouveau Véhicule', overrides), 'Nouveau Véhicule');
});

test('resolveLocalizedColor returns trimmed hex override when present and undefined when blank or absent', () => {
  const overrides = {
    pnlBannerTitle: { fr: 'Bilan', ru: 'Баланс', color: ' #38bdf8 ' },
    saleReportTitle: { fr: 'Rapport', ru: 'Отчёт', color: '   ' },
  };
  assert.equal(resolveLocalizedColor('pnlBannerTitle', overrides), '#38bdf8');
  assert.equal(resolveLocalizedColor('saleReportTitle', overrides), undefined);
  assert.equal(resolveLocalizedColor('missingKey', overrides), undefined);
});

test('getContrastForeground selects readable dark or white ink based on background luminance', () => {
  assert.equal(getContrastForeground('#f59e0b'), '#0f172a');
  assert.equal(getContrastForeground('#ffffff'), '#0f172a');
  assert.equal(getContrastForeground('#2563eb'), '#ffffff');
  assert.equal(getContrastForeground('#0f172a'), '#ffffff');
});

test('resolveSystemThemeConfig hydrates legacy single-accent configs into dual light & dark palettes', () => {
  const resolved = resolveSystemThemeConfig({
    primaryAccentColor: '#2563eb',
    cardBorderRadius: '12px',
  });
  assert.equal(resolved.lightPalette?.primary, '#2563eb');
  assert.equal(resolved.lightPalette?.primaryForeground, '#ffffff');
  assert.equal(resolved.lightPalette?.background, DEFAULT_LIGHT_PALETTE.background);
  assert.equal(resolved.darkPalette?.primary, '#2563eb');
  assert.equal(resolved.darkPalette?.background, DEFAULT_DARK_PALETTE.background);
  assert.equal(resolved.cardBorderRadius, '12px');
});

test('applySystemThemeVariables injects mode-specific CSS custom properties onto documentElement', () => {
  const store = new Map<string, string>();
  const prevDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    documentElement: {
      classList: { contains: () => false },
      style: {
        setProperty: (k: string, v: string) => store.set(k, v),
      },
    },
  };

  try {
    const preset = BRAND_THEME_PRESETS.find((p) => p.id === 'cobalt_executive')!;
    const customConfig = {
      ...DEFAULT_SYSTEM_THEME_CONFIG,
      primaryAccentColor: preset.primaryHex,
      cardBorderRadius: '24px' as const,
      lightPalette: preset.lightPalette,
      darkPalette: preset.darkPalette,
    };

    applySystemThemeVariables(customConfig, 'light');
    assert.equal(store.get('--background'), preset.lightPalette.background);
    assert.equal(store.get('--card'), preset.lightPalette.card);
    assert.equal(store.get('--primary'), preset.lightPalette.primary);
    assert.equal(store.get('--ag-card-radius'), '24px');
    assert.equal(store.get('--ag-header-bg'), preset.lightPalette.headerBg);
    assert.equal(store.get('--ag-nav-active-bg'), preset.lightPalette.navActiveBg);
    assert.equal(store.get('--ag-detail-bg'), preset.lightPalette.detailContainerBg);
    assert.equal(store.get('--ag-metric-bg'), preset.lightPalette.metricBoxBg);
    assert.equal(store.get('--ag-receipt-bg'), preset.lightPalette.saleReceiptBg);
    assert.equal(store.get('--ag-profit-color'), preset.lightPalette.profitColor);
    assert.equal(store.get('--ag-expense-color'), preset.lightPalette.expenseColor);
    assert.equal(store.get('--ag-table-header-bg'), preset.lightPalette.tableHeaderBg);
    assert.equal(store.get('--ag-modal-bg'), preset.lightPalette.modalBg);

    applySystemThemeVariables(customConfig, 'dark');
    assert.equal(store.get('--background'), preset.darkPalette.background);
    assert.equal(store.get('--card'), preset.darkPalette.card);
    assert.equal(store.get('--primary'), preset.darkPalette.primary);
    assert.equal(store.get('--ag-header-bg'), preset.darkPalette.headerBg);
    assert.equal(store.get('--ag-nav-active-bg'), preset.darkPalette.navActiveBg);
    assert.equal(store.get('--ag-detail-bg'), preset.darkPalette.detailContainerBg);
    assert.equal(store.get('--ag-metric-bg'), preset.darkPalette.metricBoxBg);
    assert.equal(store.get('--ag-receipt-bg'), preset.darkPalette.saleReceiptBg);
    assert.equal(store.get('--ag-detail-heading'), preset.darkPalette.detailHeadingColor);
    assert.equal(store.get('--ag-chart-accent'), preset.darkPalette.chartAccent);

    const layoutConfig = {
      ...customConfig,
      buttonBorderRadius: '16px' as const,
      cardPadding: 'spacious' as const,
      sectionGap: '32px' as const,
    };
    applySystemThemeVariables(layoutConfig, 'light');
    assert.equal(store.get('--ag-button-radius'), '16px');
    assert.equal(store.get('--ag-card-padding'), CARD_PADDING_VALUES.spacious);
    assert.equal(store.get('--ag-section-gap'), '32px');
  } finally {
    (globalThis as { document?: unknown }).document = prevDoc;
  }
});

test('getTranslationKeyCategory classifies keys into expected UI customization categories', () => {
  assert.equal(getTranslationKeyCategory('saleReportTitle'), 'sale_report');
  assert.equal(getTranslationKeyCategory('saleReportNetProfit'), 'sale_report');
  assert.equal(getTranslationKeyCategory('pnlBannerTitle'), 'vehicle_detail');
  assert.equal(getTranslationKeyCategory('tabOverview'), 'vehicle_detail');
  assert.equal(getTranslationKeyCategory('headerTotalInStock'), 'navigation');
  assert.equal(getTranslationKeyCategory('analyticsRevenueTitle'), 'analytics');
  assert.equal(getTranslationKeyCategory('statusForSale'), 'statuses');
  assert.equal(getTranslationKeyCategory('searchPlaceholder'), 'inventory');
});

