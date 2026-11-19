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
  EXPENSE_CATEGORY_ICON_OPTIONS,
  EXPENSE_CATEGORY_ID_REGEX,
  getContrastForeground,
  getTranslationKeyCategory,
  isSuperAdminUser,
  isViewAllowedByFeatureFlags,
  normalizeExpenseCategorySlug,
  normalizeFeatureFlags,
  resolveLocalizedColor,
  resolveLocalizedLabel,
  resolveNewExpenseCategoryId,
  resolveSystemThemeConfig,
  sortExpenseCategories,
  SUPERADMIN_BOOTSTRAP_EMAIL,
  DEFAULT_FEATURE_FLAGS,
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
    mrrAmount: 79,
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
    mrrAmount: 39,
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
    mrrAmount: 39,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
];

test('isSuperAdminUser strictly enforces superadmin role or verified bootstrap email', () => {
  assert.equal(isSuperAdminUser({ email: 'user@example.com', profile: { role: 'user' } }), false);
  assert.equal(isSuperAdminUser({ email: null, profile: null }), false);
  assert.equal(isSuperAdminUser({ email: SUPERADMIN_BOOTSTRAP_EMAIL, emailVerified: false, profile: { role: 'user' } }), false);
  assert.equal(isSuperAdminUser({ email: SUPERADMIN_BOOTSTRAP_EMAIL, emailVerified: true, profile: { role: 'user' } }), true);
  assert.equal(isSuperAdminUser({ email: 'victoria.leroy456@gmail.com', emailVerified: true, profile: { role: 'user' } }), true);
  assert.equal(isSuperAdminUser({ email: 'tikjan1983@gmail.com', emailVerified: true, profile: { role: 'user' } }), true);
  assert.equal(isSuperAdminUser({ email: 'other@example.com', profile: { role: 'superadmin' } }), true);
});

test('computeAdminDashboardMetrics calculates totalUsers, activeGarages, and MRR accurately', () => {
  const metrics = computeAdminDashboardMetrics(mockAccounts, DEFAULT_SUBSCRIPTION_PLANS);
  assert.equal(metrics.totalUsers, 4);
  assert.equal(metrics.activeGarages, 3); // 2 active + 1 trial
  assert.equal(metrics.monthlyRevenueMRR, 118); // 79 + 39 (past_due excluded from active MRR)
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

test('normalizeFeatureFlags merges partial Firestore documents safely with defaults and ignores metadata fields', () => {
  const normalized = normalizeFeatureFlags({
    multiGarage: false,
    suppliersModule: false,
    updatedAt: { seconds: 12345 },
    updatedBy: 'uid_admin',
  });
  assert.equal(normalized.multiGarage, false);
  assert.equal(normalized.suppliersModule, false);
  assert.equal(normalized.cerfaGenerator, true);
  assert.equal(normalized.documentsModule, true);
  assert.equal(normalized.exportsBackup, true);
  assert.equal(Object.keys(normalized).length, Object.keys(DEFAULT_FEATURE_FLAGS).length);
});

test('isViewAllowedByFeatureFlags blocks disabled module views and permits enabled ones', () => {
  const restricted = {
    ...DEFAULT_FEATURE_FLAGS,
    expenseAnalytics: false,
    suppliersModule: false,
    documentsModule: false,
    exportsBackup: false,
  };
  assert.equal(isViewAllowedByFeatureFlags('desktop', restricted), true);
  assert.equal(isViewAllowedByFeatureFlags('settings', restricted), true);
  assert.equal(isViewAllowedByFeatureFlags('admin', restricted), true);
  assert.equal(isViewAllowedByFeatureFlags('analytics', restricted), false);
  assert.equal(isViewAllowedByFeatureFlags('suppliers', restricted), false);
  assert.equal(isViewAllowedByFeatureFlags('documents', restricted), false);
  assert.equal(isViewAllowedByFeatureFlags('exports', restricted), false);
});

import {
  computePlanPricing,
  getPlanBadgeLabel,
  getPlanCapabilities,
  getPlanRank,
  normalizeSubscriptionPlans,
  resolveEffectiveFeatureFlagsForPlan,
} from './adminUtils';

test('normalizeSubscriptionPlans preserves custom names, prices, null unlimited limit, modules, isPopular, and bullet features', () => {
  const normalized = normalizeSubscriptionPlans([
    {
      id: 'starter',
      name: 'Start Free',
      priceMonthly: 0,
      vehicleLimit: 8,
      isPopular: true,
      modules: {
        cerfaAutofill: false,
        suppliers: true,
        analytics: true,
        exportsBackup: false,
        multiGarage: false,
      },
      featuresRu: ['До 8 авто', 'Поставщики включены'],
    },
    {
      id: 'pro',
      name: 'Pro Studio',
      priceMonthly: 45,
      vehicleLimit: 15,
      isPopular: false,
    },
    {
      id: 'enterprise',
      name: 'Business Fleet',
      priceMonthly: 99,
      vehicleLimit: null,
      isPopular: false,
    },
  ]);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].id, 'starter');
  assert.equal(normalized[0].name, 'Start Free');
  assert.equal(normalized[0].vehicleLimit, 8);
  assert.equal(normalized[0].isPopular, true);
  assert.equal(normalized[0].modules?.suppliers, true);
  assert.deepEqual(normalized[0].featuresRu, ['До 8 авто', 'Поставщики включены']);

  assert.equal(normalized[1].id, 'pro');
  assert.equal(normalized[1].name, 'Pro Studio');
  assert.equal(normalized[1].priceMonthly, 45);
  assert.equal(normalized[1].vehicleLimit, 15);
  assert.equal(normalized[1].isPopular, false);

  assert.equal(normalized[2].id, 'enterprise');
  assert.equal(normalized[2].name, 'Business Fleet');
  assert.equal(normalized[2].priceMonthly, 99);
  assert.equal(normalized[2].vehicleLimit, null);
});

test('computePlanPricing applies 20% discount for annual billing and exact savings', () => {
  const monthlyPro = computePlanPricing(39, 'monthly');
  assert.equal(monthlyPro.effectiveMonthly, 39);
  assert.equal(monthlyPro.billedAmount, 39);
  assert.equal(monthlyPro.annualSavings, 0);

  const annualPro = computePlanPricing(39, 'annual');
  assert.equal(annualPro.effectiveMonthly, 31.2);
  assert.equal(annualPro.billedAmount, 374.4);
  assert.equal(annualPro.annualSavings, 93.6);
  assert.equal(annualPro.discountPercent, 20);

  const annualStarter = computePlanPricing(0, 'annual');
  assert.equal(annualStarter.effectiveMonthly, 0);
  assert.equal(annualStarter.billedAmount, 0);
  assert.equal(annualStarter.annualSavings, 0);
});

test('getPlanBadgeLabel returns updated tier names dynamically from plans', () => {
  assert.equal(getPlanBadgeLabel('starter', 'ru'), 'STARTER');
  assert.equal(getPlanBadgeLabel('pro', 'ru'), 'PRO');
  assert.equal(getPlanBadgeLabel('enterprise', 'ru'), 'BUSINESS');

  const customPlans = normalizeSubscriptionPlans([
    { id: 'pro', name: 'Pro Plus' },
    { id: 'enterprise', name: 'Fleet Max' },
  ]);
  assert.equal(getPlanBadgeLabel('pro', 'ru', customPlans), 'PRO PLUS');
  assert.equal(getPlanBadgeLabel('enterprise', 'fr', customPlans), 'FLEET MAX');
});

test('getPlanCapabilities and resolveEffectiveFeatureFlagsForPlan dynamically follow editable plan modules & quotas', () => {
  assert.equal(getPlanRank('starter'), 0);
  assert.equal(getPlanRank('pro'), 1);
  assert.equal(getPlanRank('enterprise'), 2);

  assert.equal(DEFAULT_SUBSCRIPTION_PLANS[0].name, 'Starter');
  assert.equal(DEFAULT_SUBSCRIPTION_PLANS[0].priceMonthly, 0);
  assert.equal(DEFAULT_SUBSCRIPTION_PLANS[1].name, 'Pro');
  assert.equal(DEFAULT_SUBSCRIPTION_PLANS[1].priceMonthly, 39);
  assert.equal(DEFAULT_SUBSCRIPTION_PLANS[1].vehicleLimit, null);
  assert.equal(DEFAULT_SUBSCRIPTION_PLANS[2].name, 'Business');
  assert.equal(DEFAULT_SUBSCRIPTION_PLANS[2].priceMonthly, 79);
  assert.equal(DEFAULT_SUBSCRIPTION_PLANS[2].vehicleLimit, null);

  const starterCaps = getPlanCapabilities('starter', DEFAULT_SUBSCRIPTION_PLANS);
  assert.equal(starterCaps.vehicleLimit, 5);
  assert.equal(starterCaps.rawVehicleLimit, 5);
  assert.equal(starterCaps.isUnlimitedVehicles, false);
  assert.equal(starterCaps.canUseCerfaAutofillAll, false);
  assert.equal(starterCaps.canUseSuppliers, false);
  assert.equal(starterCaps.canUseExportsBackup, false);
  assert.equal(starterCaps.canUseMultiGarage, false);

  const proCaps = getPlanCapabilities('pro', DEFAULT_SUBSCRIPTION_PLANS);
  assert.equal(proCaps.isUnlimitedVehicles, true);
  assert.equal(proCaps.rawVehicleLimit, null);
  assert.equal(proCaps.canUseCerfaAutofillAll, true);
  assert.equal(proCaps.canUseSuppliers, true);
  assert.equal(proCaps.canUseAdvancedAnalytics, true);
  assert.equal(proCaps.canUseExportsBackup, true);
  assert.equal(proCaps.canUseMultiGarage, false);

  const businessCaps = getPlanCapabilities('enterprise', DEFAULT_SUBSCRIPTION_PLANS);
  assert.equal(businessCaps.isUnlimitedVehicles, true);
  assert.equal(businessCaps.canUseMultiGarage, true);
  assert.equal(businessCaps.canUseAdvancedAnalytics, true);

  // Dynamic edits made by Superadmin in Subscription Plans editor propagate immediately
  const editedPlans = normalizeSubscriptionPlans([
    {
      id: 'starter',
      vehicleLimit: 12,
      modules: {
        cerfaAutofill: true,
        suppliers: true,
        analytics: false,
        exportsBackup: false,
        multiGarage: false,
      },
    },
    {
      id: 'pro',
      vehicleLimit: 25,
      modules: {
        cerfaAutofill: true,
        suppliers: false,
        analytics: true,
        exportsBackup: true,
        multiGarage: true,
      },
    },
  ]);

  const editedStarterCaps = getPlanCapabilities('starter', editedPlans);
  assert.equal(editedStarterCaps.isUnlimitedVehicles, false);
  assert.equal(editedStarterCaps.vehicleLimit, 12);
  assert.equal(editedStarterCaps.canUseSuppliers, true);
  assert.equal(editedStarterCaps.canUseCerfaAutofillAll, true);

  const editedStarterFlags = resolveEffectiveFeatureFlagsForPlan(
    DEFAULT_FEATURE_FLAGS,
    'starter',
    false,
    editedPlans
  );
  assert.equal(editedStarterFlags.suppliersModule, true);
  assert.equal(editedStarterFlags.expenseAnalytics, false);

  const editedProCaps = getPlanCapabilities('pro', editedPlans);
  assert.equal(editedProCaps.isUnlimitedVehicles, false);
  assert.equal(editedProCaps.vehicleLimit, 25);
  const editedProFlags = resolveEffectiveFeatureFlagsForPlan(
    DEFAULT_FEATURE_FLAGS,
    'pro',
    false,
    editedPlans
  );
  assert.equal(editedProFlags.suppliersModule, false);
  assert.equal(editedProFlags.multiGarage, true);

  // Global Superadmin killswitch remains enforced even on Business
  const disabledSuppliersGlobal = { ...DEFAULT_FEATURE_FLAGS, suppliersModule: false };
  assert.equal(
    resolveEffectiveFeatureFlagsForPlan(disabledSuppliersGlobal, 'enterprise', true, DEFAULT_SUBSCRIPTION_PLANS).suppliersModule,
    false
  );
});

test('normalizeExpenseCategorySlug and resolveNewExpenseCategoryId enforce Firestore slug compatibility and uniqueness', () => {
  assert.equal(normalizeExpenseCategorySlug('  Diagnostic & Contrôle '), 'Diagnostic_Controle');
  assert.equal(normalizeExpenseCategorySlug('pieces-rechange'), 'pieces-rechange');
  assert.ok(EXPENSE_CATEGORY_ICON_OPTIONS.some((i) => i.id === 'Wrench'));
  assert.ok(EXPENSE_CATEGORY_ICON_OPTIONS.some((i) => i.id === 'Activity'));

  // Explicit valid ID
  const validExplicit = resolveNewExpenseCategoryId({
    rawId: 'diag_moteur',
    fallbackLabel: 'Diagnostic',
    existingIds: ['transport', 'fuel'],
  });
  assert.equal(validExplicit.error, undefined);
  assert.equal(validExplicit.id, 'diag_moteur');
  assert.ok(EXPENSE_CATEGORY_ID_REGEX.test(validExplicit.id));

  // Explicit ID with spaces/accents gets normalized cleanly
  const normalizedExplicit = resolveNewExpenseCategoryId({
    rawId: 'Pièces Moteur',
    fallbackLabel: 'Pièces',
    existingIds: ['transport'],
  });
  assert.equal(normalizedExplicit.error, undefined);
  assert.equal(normalizedExplicit.id, 'Pieces_Moteur');
  assert.ok(EXPENSE_CATEGORY_ID_REGEX.test(normalizedExplicit.id));

  // Empty rawId auto-generates unique <=64 char valid slug
  const autoGen = resolveNewExpenseCategoryId({
    rawId: '',
    fallbackLabel: 'Une très longue catégorie pour tester la limite de 64 caractères maximum dans Firestore',
    existingIds: ['transport'],
    suffix: '1234',
  });
  assert.equal(autoGen.error, undefined);
  assert.ok(autoGen.id.length <= 64);
  assert.ok(EXPENSE_CATEGORY_ID_REGEX.test(autoGen.id));

  // Collision on auto-generated ID produces deduplicated slug
  const deduped = resolveNewExpenseCategoryId({
    rawId: '',
    fallbackLabel: 'Diagnostic',
    existingIds: ['diagnostic_4321'],
    suffix: '4321',
  });
  assert.equal(deduped.id, 'diagnostic_4321_1');

  // Duplicate explicit ID returns duplicate_id error
  const duplicate = resolveNewExpenseCategoryId({
    rawId: 'transport',
    fallbackLabel: 'Transport',
    existingIds: ['transport'],
  });
  assert.equal(duplicate.error, 'duplicate_id');

  // Non-ASCII / symbols-only ID returns invalid_id error
  const invalidOnly = resolveNewExpenseCategoryId({
    rawId: 'Диагностика!!!',
    fallbackLabel: 'Diagnostic',
    existingIds: [],
  });
  assert.equal(invalidOnly.error, 'invalid_id');

  // >64 chars explicit ID returns too_long error
  const tooLong = resolveNewExpenseCategoryId({
    rawId: 'a'.repeat(65),
    fallbackLabel: 'Diagnostic',
    existingIds: [],
  });
  assert.equal(tooLong.error, 'too_long');
});

test('Pro plan descriptions advertise only Cerfa 15776*02 and sanitize legacy 13750/DA bullets', () => {
  const proDefault = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === 'pro')!;
  const allDefaultBullets = [
    ...proDefault.featuresFr,
    ...proDefault.featuresRu,
    ...(proDefault.featuresHy || []),
    ...(proDefault.featuresKa || []),
  ];
  for (const item of allDefaultBullets) {
    assert.equal(/13750|13751|\bDA\b/.test(item), false, `Unexpected unsupported form in: ${item}`);
  }
  assert.ok(proDefault.featuresFr.some((f) => f.includes('15776*02')));
  assert.ok(proDefault.featuresRu.some((f) => f.includes('15776*02')));

  const normalizedLegacy = normalizeSubscriptionPlans([
    {
      id: 'pro',
      featuresFr: [
        'Stock de véhicules illimité',
        'Auto-remplissage & export PDF de tous les Cerfa (15776*02, 13750*07, DA)',
      ],
      featuresRu: [
        'Безлимитный склад авто',
        'Автозаполнение и PDF-экспорт всех бланков Cerfa (15776*02, 13750*07, DA)',
      ],
    },
  ]);
  const proNormalized = normalizedLegacy.find((p) => p.id === 'pro')!;
  assert.equal(
    proNormalized.featuresFr[1],
    'Auto-remplissage & export PDF Cerfa 15776*02 (cession officielle)'
  );
  assert.equal(
    proNormalized.featuresRu[1],
    'Автозаполнение и PDF-экспорт Cerfa 15776*02 (акт передачи ТС)'
  );
});

test('resolveEffectiveFeatureFlagsForPlan grants SuperAdmin full module access regardless of assigned planId', () => {
  for (const assignedPlan of ['starter', 'pro', 'enterprise'] as const) {
    const adminFlags = resolveEffectiveFeatureFlagsForPlan(
      DEFAULT_FEATURE_FLAGS,
      assignedPlan,
      true,
      DEFAULT_SUBSCRIPTION_PLANS
    );
    assert.deepEqual(adminFlags, DEFAULT_FEATURE_FLAGS);
    assert.equal(adminFlags.multiGarage, true);
    assert.equal(adminFlags.suppliersModule, true);
    assert.equal(adminFlags.exportsBackup, true);
    assert.equal(adminFlags.expenseAnalytics, true);
  }

  // Non-superadmin users remain restricted by starter/pro plan locks
  const starterUserFlags = resolveEffectiveFeatureFlagsForPlan(
    DEFAULT_FEATURE_FLAGS,
    'starter',
    false,
    DEFAULT_SUBSCRIPTION_PLANS
  );
  assert.equal(starterUserFlags.multiGarage, false);
  assert.equal(starterUserFlags.suppliersModule, false);
  assert.equal(starterUserFlags.exportsBackup, false);
  assert.equal(starterUserFlags.expenseAnalytics, false);

  const proUserFlags = resolveEffectiveFeatureFlagsForPlan(
    DEFAULT_FEATURE_FLAGS,
    'pro',
    false,
    DEFAULT_SUBSCRIPTION_PLANS
  );
  assert.equal(proUserFlags.multiGarage, false);
  assert.equal(proUserFlags.suppliersModule, true);
  assert.equal(proUserFlags.exportsBackup, true);
  assert.equal(proUserFlags.expenseAnalytics, true);
});

