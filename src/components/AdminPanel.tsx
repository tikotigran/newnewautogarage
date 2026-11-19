import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Palette,
  CreditCard,
  FileText,
  ShieldAlert,
  ArrowLeft,
  Search,
  Check,
  RotateCcw,
  Sliders,
  Building2,
  TrendingUp,
  Car,
  LogIn,
  Receipt,
  ToggleRight,
  Type,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit3,
  Sun,
  Moon,
  Sparkles,
  Eye,
  Save,
  Loader2,
  Truck,
  Fuel,
  FileCheck,
  ShieldCheck,
  Wrench,
  Coins,
  Activity,
  Package,
  Tag,
} from 'lucide-react';
import { ThemedSelect } from './ThemedSelect';
import {
  ButtonBorderRadius,
  CardPaddingDensity,
  DynamicExpenseCategory,
  FeatureFlagsConfig,
  FrenchTaxConfiguration,
  GlobalTextOverrides,
  LegalStatus,
  PlanModulesConfig,
  SectionGapSize,
  SubscriptionPlan,
  SubscriptionPlanId,
  SubscriptionStatus,
  SystemThemeConfig,
  ThemePaletteTokens,
  UserProfile,
  UserRole,
  VatRegime,
} from '../types/garage';
import {
  applySystemThemeVariables,
  BRAND_THEME_PRESETS,
  CARD_PADDING_VALUES,
  computeAdminDashboardMetrics,
  DEFAULT_DARK_PALETTE,
  DEFAULT_DYNAMIC_EXPENSE_CATEGORIES,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_LIGHT_PALETTE,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_SYSTEM_THEME_CONFIG,
  EXPENSE_CATEGORY_ICON_OPTIONS,
  getContrastForeground,
  getDefaultPlanModules,
  getPlanCapabilities,
  getTranslationKeyCategory,
  normalizeExpenseCategorySlug,
  normalizeSubscriptionPlans,
  resolveLocalizedColor,
  resolveLocalizedLabel,
  resolveNewExpenseCategoryId,
  resolveSystemThemeConfig,
  sortExpenseCategories,
  TRANSLATION_CATEGORIES,
  TranslationCategoryId,
} from '../utils/adminUtils';
import {
  getCerfaTemplatesCalibration,
  getSubscriptionPlans,
  getSuperAdminTaxDefaults,
  saveCerfaTemplatesCalibration,
  saveDynamicExpenseCategories,
  saveFeatureFlags,
  saveGlobalTextOverrides,
  saveSubscriptionPlans,
  saveSuperAdminTaxDefaults,
  saveSystemThemeConfig,
  subscribeAllUserAccounts,
  subscribeCerfaTemplatesCalibration,
  subscribeDynamicExpenseCategories,
  subscribeFeatureFlags,
  subscribeGlobalTextOverrides,
  subscribeSubscriptionPlans,
  subscribeSuperAdminTaxDefaults,
  updateUserAccount,
} from '../services/adminService';
import {
  CERFA_ALIGNER_FIELDS,
  CerfaTemplatesCalibrationPayload,
  createDefaultCerfaTemplatesCalibration,
  getCerfa15776FieldAtPath,
  updateCerfa15776FieldAtPath,
} from '../utils/cerfaConfig';
import { createCalibrationDummyCerfaData } from '../utils/cerfa15776';
import { buildCerfa15776PdfBytes } from '../utils/pdfGenerator';
import { CerfaLivePreviewSheet } from './CerfaLivePreviewSheet';
import {
  createDefaultFrenchTaxConfig,
} from '../utils/frenchTaxEngine';
import { formatEuro } from '../utils/finance';
import { pickLocalized } from '../utils/i18nUtils';
import { useI18n } from '../i18n/I18nContext';
import { translations } from '../i18n/translations';

type AdminTab =
  | 'dashboard'
  | 'users'
  | 'design'
  | 'billing'
  | 'cerfa'
  | 'expenses'
  | 'features'
  | 'texts';

interface AdminPanelProps {
  isSuperAdmin: boolean;
  currentUserUid?: string;
  systemConfig: SystemThemeConfig;
  theme?: 'dark' | 'light';
  onThemeChange?: (theme: 'dark' | 'light') => void;
  onBackToApp: () => void;
  onSignIn: () => void;
  onOpenAlignerMode: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isSuperAdmin,
  currentUserUid,
  systemConfig,
  theme = 'dark',
  onThemeChange,
  onBackToApp,
  onSignIn,
  onOpenAlignerMode,
}) => {
  const { lang, t } = useI18n();
  const isRu = lang === 'ru';

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => getSubscriptionPlans());
  const [plansDraft, setPlansDraft] = useState<SubscriptionPlan[]>(() => getSubscriptionPlans());
  const [isPlansDirty, setIsPlansDirty] = useState(false);
  const plansDirtyRef = useRef(false);
  const [isSavingPlans, setIsSavingPlans] = useState(false);
  const [planFeaturesLang, setPlanFeaturesLang] = useState<'ru' | 'fr'>(() =>
    lang === 'ru' ? 'ru' : 'fr'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [draftConfig, setDraftConfig] = useState<SystemThemeConfig>(() =>
    resolveSystemThemeConfig(systemConfig)
  );
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Dynamic Expense Categories state
  const [expenseCategories, setExpenseCategories] = useState<DynamicExpenseCategory[]>(
    DEFAULT_DYNAMIC_EXPENSE_CATEGORIES
  );
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [catFormId, setCatFormId] = useState('');
  const [catFormFr, setCatFormFr] = useState('');
  const [catFormRu, setCatFormRu] = useState('');
  const [catFormHy, setCatFormHy] = useState('');
  const [catFormKa, setCatFormKa] = useState('');
  const [catFormIcon, setCatFormIcon] = useState('Truck');
  const [catFormDefaultAmount, setCatFormDefaultAmount] = useState<number>(0);
  const [catFormError, setCatFormError] = useState<string | null>(null);

  // Feature Flags state
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsConfig>(DEFAULT_FEATURE_FLAGS);
  const [isSavingFeatureFlags, setIsSavingFeatureFlags] = useState(false);

  // SuperAdmin Global French Tax Defaults state
  const [taxDefaultsDraft, setTaxDefaultsDraft] = useState<FrenchTaxConfiguration>(() =>
    getSuperAdminTaxDefaults()
  );

  // Global Text Overrides state
  const [textOverrides, setTextOverrides] = useState<GlobalTextOverrides>({});
  const [textSearch, setTextSearch] = useState('');
  const [onlyModifiedTexts, setOnlyModifiedTexts] = useState(false);
  const [selectedTextCategory, setSelectedTextCategory] = useState<TranslationCategoryId>('all');

  // Cerfa 15776*02 Field Calibration state (persisted in platform_settings/cerfa_templates)
  const [cerfaCalibrationDraft, setCerfaCalibrationDraft] =
    useState<CerfaTemplatesCalibrationPayload>(() => getCerfaTemplatesCalibration());
  const [selectedCerfa15776Path, setSelectedCerfa15776Path] = useState<string>(
    CERFA_ALIGNER_FIELDS[0].path
  );
  const [isSavingCerfa, setIsSavingCerfa] = useState(false);

  // Design Studio section & multi-page preview state (must stay above early return)
  const [designSection, setDesignSection] = useState<
    'all' | 'header' | 'cards' | 'vehicle_detail' | 'analytics_tables'
  >('all');
  const [previewPage, setPreviewPage] = useState<'card' | 'vehicle_detail' | 'header_table'>(
    'vehicle_detail'
  );
  const [selectedPreviewKey, setSelectedPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    setDraftConfig(resolveSystemThemeConfig(systemConfig));
  }, [systemConfig]);

  // Real-time live CSS custom property injection while editing in Design & UI Customization Studios
  useEffect(() => {
    if (activeTab === 'design' || activeTab === 'texts') {
      applySystemThemeVariables(draftConfig, theme);
    } else {
      applySystemThemeVariables(systemConfig, theme);
    }
  }, [activeTab, draftConfig, systemConfig, theme]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const unsubAccounts = subscribeAllUserAccounts((data) => {
      setAccounts(data);
    });
    const unsubExpenses = subscribeDynamicExpenseCategories((cats) => {
      setExpenseCategories(cats);
    });
    const unsubFeatures = subscribeFeatureFlags((flags) => {
      setFeatureFlags(flags);
    });
    const unsubTexts = subscribeGlobalTextOverrides((overrides) => {
      setTextOverrides(overrides);
    });
    const unsubTaxDefaults = subscribeSuperAdminTaxDefaults((cfg) => {
      setTaxDefaultsDraft(cfg);
    });
    const unsubCerfaCalibration = subscribeCerfaTemplatesCalibration((cal) => {
      setCerfaCalibrationDraft(cal);
    });
    const unsubPlans = subscribeSubscriptionPlans((nextPlans) => {
      setPlans(nextPlans);
      if (!plansDirtyRef.current) {
        setPlansDraft(nextPlans);
      }
    });
    return () => {
      unsubAccounts();
      unsubExpenses();
      unsubFeatures();
      unsubTexts();
      unsubTaxDefaults();
      unsubCerfaCalibration();
      unsubPlans();
    };
  }, [isSuperAdmin]);

  const metrics = useMemo(() => {
    return computeAdminDashboardMetrics(accounts, plans);
  }, [accounts, plans]);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.displayName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.garageName.toLowerCase().includes(q)
    );
  }, [accounts, searchQuery]);

  const translationCategoryCounts = useMemo(() => {
    const keys = Object.keys(translations.fr) as (keyof typeof translations.fr)[];
    const counts: Record<TranslationCategoryId, number> = {
      all: keys.length,
      navigation: 0,
      inventory: 0,
      vehicle_detail: 0,
      sale_report: 0,
      statuses: 0,
      analytics: 0,
      forms: 0,
    };
    for (const k of keys) {
      counts[getTranslationKeyCategory(k)] += 1;
    }
    return counts;
  }, []);

  const allTranslationKeys = useMemo(() => {
    const keys = Object.keys(translations.fr) as (keyof typeof translations.fr)[];
    const q = textSearch.trim().toLowerCase();
    return keys.filter((k) => {
      if (selectedTextCategory !== 'all' && getTranslationKeyCategory(k) !== selectedTextCategory) {
        return false;
      }
      const hasOverride = Boolean(
        textOverrides[k]?.fr?.trim() ||
          textOverrides[k]?.ru?.trim() ||
          textOverrides[k]?.color?.trim()
      );
      if (onlyModifiedTexts && !hasOverride) return false;
      if (!q) return true;
      return (
        k.toLowerCase().includes(q) ||
        translations.fr[k].toLowerCase().includes(q) ||
        translations.ru[k].toLowerCase().includes(q) ||
        (textOverrides[k]?.fr || '').toLowerCase().includes(q) ||
        (textOverrides[k]?.ru || '').toLowerCase().includes(q)
      );
    });
  }, [textSearch, onlyModifiedTexts, textOverrides, selectedTextCategory]);

  // Independent 100% French dummy dataset for Superadmin Cerfa calibration (no real garage inventory or profile)
  const calibrationDummy15776Data = useMemo(() => createCalibrationDummyCerfaData(), []);

  const activeCerfaPreviewLabel = useMemo(
    () => CERFA_ALIGNER_FIELDS.find((f) => f.path === selectedCerfa15776Path)?.label,
    [selectedCerfa15776Path]
  );

  const generateAdminCerfaPreviewBytes = useCallback(
    () =>
      buildCerfa15776PdfBytes(
        calibrationDummy15776Data,
        cerfaCalibrationDraft.cerfa_15776_02.config,
        {
          customOffsets: cerfaCalibrationDraft.cerfa_15776_02.offsets,
          highlightedFieldPath: selectedCerfa15776Path,
          showCalibrationPlaceholderForSelected: true,
        }
      ),
    [calibrationDummy15776Data, cerfaCalibrationDraft, selectedCerfa15776Path]
  );

  const adminCerfaPreviewDepKey = useMemo(
    () =>
      JSON.stringify({
        draft: cerfaCalibrationDraft.cerfa_15776_02,
        path15776: selectedCerfa15776Path,
      }),
    [cerfaCalibrationDraft, selectedCerfa15776Path]
  );

  // Strict RBAC Gate for /admin
  if (!isSuperAdmin) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-red-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">
              {isRu ? 'Доступ ограничен (403)' : 'Accès Restreint (403)'}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {isRu
                ? 'Раздел /admin доступен только пользователям с ролью superadmin.'
                : 'La section /admin est strictement réservée aux comptes disposant du rôle superadmin.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onSignIn}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
            >
              <LogIn className="w-4 h-4" />
              <span>{isRu ? 'Войти как SuperAdmin' : 'Connexion SuperAdmin'}</span>
            </button>
            <button
              type="button"
              onClick={onBackToApp}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isRu ? 'Вернуться в гараж' : 'Retour au garage'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showSavedFeedback = (msg: string) => {
    setSaveNotice(msg);
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const cleanTextOverridesMap = (raw: GlobalTextOverrides): GlobalTextOverrides => {
    const cleaned: GlobalTextOverrides = {};
    for (const [k, v] of Object.entries(raw)) {
      const fr = v.fr || '';
      const ru = v.ru || '';
      const color = v.color?.trim() || '';
      if (fr.trim() !== '' || ru.trim() !== '' || color !== '') {
        cleaned[k] = {
          fr,
          ru,
          ...(color ? { color } : {}),
        };
      }
    }
    return cleaned;
  };

  const handleSaveGlobalConfig = async (
    nextConfig: SystemThemeConfig = draftConfig,
    alsoSaveTextOverrides = false
  ) => {
    const resolved = resolveSystemThemeConfig(nextConfig);
    setDraftConfig(resolved);
    if (alsoSaveTextOverrides) {
      const cleaned = cleanTextOverridesMap(textOverrides);
      setTextOverrides(cleaned);
      await Promise.all([
        saveSystemThemeConfig(resolved, currentUserUid),
        saveGlobalTextOverrides(cleaned, currentUserUid),
      ]);
    } else {
      await saveSystemThemeConfig(resolved, currentUserUid);
    }
    applySystemThemeVariables(resolved, theme);
    // Sync default inventory view mode if user hasn't set one or wants global default
    try {
      localStorage.setItem('autogarage_inventory_view', resolved.defaultInventoryViewMode);
    } catch {
      // ignore
    }
    showSavedFeedback(
      isRu ? 'Брендинг и палитра сохранены глобально' : 'Branding et palettes appliqués globalement'
    );
  };

  const handleResetConfig = async () => {
    const reset = resolveSystemThemeConfig(DEFAULT_SYSTEM_THEME_CONFIG);
    setDraftConfig(reset);
    await handleSaveGlobalConfig(reset);
    showSavedFeedback(
      isRu ? 'Сброшено к стандартным цветам' : 'Couleurs réinitialisées par défaut'
    );
  };

  const handlePaletteTokenChange = (
    mode: 'light' | 'dark',
    token: keyof ThemePaletteTokens,
    rawHex: string
  ) => {
    setDraftConfig((prev) => {
      const resolved = resolveSystemThemeConfig(prev);
      const targetKey = mode === 'light' ? 'lightPalette' : 'darkPalette';
      const currentPalette =
        resolved[targetKey] || (mode === 'light' ? DEFAULT_LIGHT_PALETTE : DEFAULT_DARK_PALETTE);
      const updatedPalette: ThemePaletteTokens = {
        ...currentPalette,
        [token]: rawHex,
      };
      if (token === 'primary') {
        updatedPalette.primaryForeground = getContrastForeground(rawHex);
      }
      return {
        ...resolved,
        primaryAccentColor:
          token === 'primary' && mode === theme ? rawHex : resolved.primaryAccentColor,
        [targetKey]: updatedPalette,
      };
    });
  };

  const handleApplyBrandPreset = (presetId: string) => {
    const preset = BRAND_THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDraftConfig((prev) => ({
      ...resolveSystemThemeConfig(prev),
      primaryAccentColor: preset.primaryHex,
      lightPalette: { ...preset.lightPalette },
      darkPalette: { ...preset.darkPalette },
    }));
  };

  const handlePlanChange = async (uid: string, planId: SubscriptionPlanId) => {
    const plan = plans.find((p) => p.id === planId);
    const caps = getPlanCapabilities(planId, plans);
    await updateUserAccount(uid, {
      planId,
      plan: planId,
      subscriptionTier: planId,
      vehicleLimit: caps.vehicleLimit,
      mrrAmount: plan?.priceMonthly ?? 0,
    });
    showSavedFeedback(isRu ? 'Тариф обновлён' : 'Forfait mis à jour');
  };

  const handleRoleToggle = async (uid: string, currentRole: UserRole) => {
    const nextRole: UserRole = currentRole === 'superadmin' ? 'user' : 'superadmin';
    await updateUserAccount(uid, { role: nextRole });
    showSavedFeedback(isRu ? 'Роль обновлена' : 'Rôle mis à jour');
  };

  const handleStatusChange = async (uid: string, subscriptionStatus: SubscriptionStatus) => {
    await updateUserAccount(uid, { subscriptionStatus });
    showSavedFeedback(isRu ? 'Статус оплаты обновлён' : 'Statut de paiement mis à jour');
  };

  const updatePlanDraft = (
    planId: SubscriptionPlanId,
    updater: (plan: SubscriptionPlan) => SubscriptionPlan
  ) => {
    plansDirtyRef.current = true;
    setIsPlansDirty(true);
    setPlansDraft((prev) =>
      prev.map((p) => (p.id === planId ? updater(p) : p))
    );
  };

  const handleTogglePlanUnlimited = (planId: SubscriptionPlanId, unlimited: boolean) => {
    updatePlanDraft(planId, (plan) => ({
      ...plan,
      vehicleLimit: unlimited ? null : plan.id === 'starter' ? 5 : 15,
    }));
  };

  const handleTogglePlanModule = (
    planId: SubscriptionPlanId,
    moduleKey: keyof PlanModulesConfig
  ) => {
    updatePlanDraft(planId, (plan) => {
      const currentModules = plan.modules || getDefaultPlanModules(plan.id);
      return {
        ...plan,
        modules: {
          ...currentModules,
          [moduleKey]: !currentModules[moduleKey],
        },
      };
    });
  };

  const handleTogglePlanPopular = (planId: SubscriptionPlanId) => {
    updatePlanDraft(planId, (plan) => ({
      ...plan,
      isPopular: !plan.isPopular,
    }));
  };

  const handleUpdatePlanFeature = (
    planId: SubscriptionPlanId,
    fieldKey: 'featuresRu' | 'featuresFr',
    index: number,
    value: string
  ) => {
    updatePlanDraft(planId, (plan) => {
      const current = [...(plan[fieldKey] || [])];
      current[index] = value;
      return { ...plan, [fieldKey]: current };
    });
  };

  const handleAddPlanFeature = (
    planId: SubscriptionPlanId,
    fieldKey: 'featuresRu' | 'featuresFr'
  ) => {
    updatePlanDraft(planId, (plan) => {
      const current = [...(plan[fieldKey] || [])];
      const defaultLine =
        fieldKey === 'featuresRu' ? 'Новая функция тарифа' : 'Nouvelle fonctionnalité';
      current.push(defaultLine);
      return { ...plan, [fieldKey]: current };
    });
  };

  const handleRemovePlanFeature = (
    planId: SubscriptionPlanId,
    fieldKey: 'featuresRu' | 'featuresFr',
    index: number
  ) => {
    updatePlanDraft(planId, (plan) => {
      const current = [...(plan[fieldKey] || [])];
      current.splice(index, 1);
      return { ...plan, [fieldKey]: current };
    });
  };

  const handleSaveAllPlans = async () => {
    setIsSavingPlans(true);
    try {
      const saved = await saveSubscriptionPlans(plansDraft, currentUserUid);
      setPlans(saved);
      setPlansDraft(saved);
      plansDirtyRef.current = false;
      setIsPlansDirty(false);
      showSavedFeedback(
        isRu
          ? 'Тарифы и лимиты сохранены в облаке'
          : 'Forfaits et limites enregistrés dans le cloud'
      );
    } catch (err) {
      console.error('Failed to save subscription plans:', err);
      showSavedFeedback(
        isRu
          ? 'Ошибка сохранения тарифов в Firestore'
          : 'Erreur lors de la sauvegarde des forfaits'
      );
    } finally {
      setIsSavingPlans(false);
    }
  };

  const handleResetPlansDraft = async () => {
    const defaults = normalizeSubscriptionPlans(DEFAULT_SUBSCRIPTION_PLANS);
    setPlansDraft(defaults);
    plansDirtyRef.current = true;
    setIsPlansDirty(true);
    showSavedFeedback(
      isRu
        ? 'Сброшено к шаблону — нажмите «Сохранить изменения»'
        : 'Réinitialisé — cliquez sur « Enregistrer »'
    );
  };

  // Expense Category CRUD & Ordering handlers
  const renderExpenseCategoryIcon = (iconKey?: string, className = 'w-4 h-4') => {
    switch (iconKey) {
      case 'Truck':
        return <Truck className={className} />;
      case 'Fuel':
        return <Fuel className={className} />;
      case 'FileCheck':
        return <FileCheck className={className} />;
      case 'Sparkles':
        return <Sparkles className={className} />;
      case 'FileText':
        return <FileText className={className} />;
      case 'ShieldCheck':
        return <ShieldCheck className={className} />;
      case 'Wrench':
        return <Wrench className={className} />;
      case 'Activity':
        return <Activity className={className} />;
      case 'Package':
        return <Package className={className} />;
      case 'Car':
        return <Car className={className} />;
      case 'Tag':
        return <Tag className={className} />;
      case 'Coins':
      default:
        return <Coins className={className} />;
    }
  };

  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCatFormId('');
    setCatFormFr('');
    setCatFormRu('');
    setCatFormHy('');
    setCatFormKa('');
    setCatFormIcon('Truck');
    setCatFormDefaultAmount(0);
    setCatFormError(null);
  };

  const handleEditCategory = (cat: DynamicExpenseCategory) => {
    setEditingCategoryId(cat.id);
    setCatFormId(cat.id);
    setCatFormFr(cat.labelFr);
    setCatFormRu(cat.labelRu);
    setCatFormHy(cat.labelHy || '');
    setCatFormKa(cat.labelKa || '');
    setCatFormIcon(cat.icon || 'Coins');
    setCatFormDefaultAmount(cat.defaultAmount || 0);
    setCatFormError(null);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatFormError(null);
    if (!catFormFr.trim() && !catFormRu.trim()) return;

    const labelFr = catFormFr.trim() || catFormRu.trim();
    const labelRu = catFormRu.trim() || catFormFr.trim();
    const labelHy = catFormHy.trim();
    const labelKa = catFormKa.trim();

    let next: DynamicExpenseCategory[];
    if (editingCategoryId) {
      next = expenseCategories.map((c) => {
        if (c.id !== editingCategoryId) return c;
        const { labelHy: _oldHy, labelKa: _oldKa, ...rest } = c;
        return {
          ...rest,
          labelFr,
          labelRu,
          ...(labelHy ? { labelHy } : {}),
          ...(labelKa ? { labelKa } : {}),
          icon: catFormIcon,
          defaultAmount: Math.max(0, Number(catFormDefaultAmount) || 0),
        };
      });
    } else {
      const idResolution = resolveNewExpenseCategoryId({
        rawId: catFormId,
        fallbackLabel: labelFr,
        existingIds: expenseCategories.map((c) => c.id),
      });
      if (idResolution.error) {
        if (idResolution.error === 'duplicate_id') {
          setCatFormError(
            isRu
              ? `Категория с ID «${idResolution.id}» уже существует.`
              : `Une catégorie avec l’ID « ${idResolution.id} » existe déjà.`
          );
        } else if (idResolution.error === 'too_long') {
          setCatFormError(
            isRu
              ? 'ID категории не должен превышать 64 символа.'
              : 'L’ID de la catégorie ne doit pas dépasser 64 caractères.'
          );
        } else {
          setCatFormError(
            isRu
              ? 'ID должен содержать латинские буквы, цифры, «_» или «-» (1–64 символа).'
              : 'L’ID doit contenir uniquement lettres, chiffres, « _ » ou « - » (1–64 caractères).'
          );
        }
        return;
      }

      const maxOrder = expenseCategories.reduce((m, c) => Math.max(m, c.order || 0), 0);
      next = [
        ...expenseCategories,
        {
          id: idResolution.id,
          labelFr,
          labelRu,
          ...(labelHy ? { labelHy } : {}),
          ...(labelKa ? { labelKa } : {}),
          icon: catFormIcon,
          defaultAmount: Math.max(0, Number(catFormDefaultAmount) || 0),
          order: maxOrder + 1,
        },
      ];
    }

    const sorted = sortExpenseCategories(next);
    setExpenseCategories(sorted);
    await saveDynamicExpenseCategories(sorted, currentUserUid);
    resetCategoryForm();
    showSavedFeedback(isRu ? 'Категория сохранена' : 'Catégorie enregistrée');
  };

  const handleDeleteCategory = async (id: string) => {
    const next = expenseCategories
      .filter((c) => c.id !== id)
      .map((c, idx) => ({ ...c, order: idx + 1 }));
    setExpenseCategories(next);
    await saveDynamicExpenseCategories(next, currentUserUid);
    if (editingCategoryId === id) resetCategoryForm();
    showSavedFeedback(isRu ? 'Категория удалена' : 'Catégorie supprimée');
  };

  const handleMoveCategory = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= expenseCategories.length) return;
    const copy = [...expenseCategories];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    const reordered = copy.map((c, idx) => ({ ...c, order: idx + 1 }));
    setExpenseCategories(reordered);
    await saveDynamicExpenseCategories(reordered, currentUserUid);
    showSavedFeedback(isRu ? 'Порядок обновлён' : 'Ordre mis à jour');
  };

  const handleResetCategories = async () => {
    setExpenseCategories(DEFAULT_DYNAMIC_EXPENSE_CATEGORIES);
    await saveDynamicExpenseCategories(DEFAULT_DYNAMIC_EXPENSE_CATEGORIES, currentUserUid);
    resetCategoryForm();
    showSavedFeedback(isRu ? 'Категории сброшены' : 'Catégories réinitialisées');
  };

  // Feature Flags handlers (persisted globally in platform_settings/feature_flags)
  const persistFeatureFlagsWithFeedback = async (nextFlags: FeatureFlagsConfig) => {
    setIsSavingFeatureFlags(true);
    try {
      await saveFeatureFlags(nextFlags, currentUserUid);
      showSavedFeedback(
        isRu
          ? 'Настройки функций сохранены в облаке'
          : 'Paramètres des fonctions enregistrés dans le cloud'
      );
    } catch (err) {
      console.error('Failed to save feature flags:', err);
      showSavedFeedback(
        isRu
          ? 'Ошибка сохранения настроек функций в Firestore'
          : 'Erreur lors de la sauvegarde dans Firestore'
      );
    } finally {
      setIsSavingFeatureFlags(false);
    }
  };

  const handleToggleFeatureFlag = async (key: keyof FeatureFlagsConfig) => {
    const updated: FeatureFlagsConfig = {
      ...featureFlags,
      [key]: !featureFlags[key],
    };
    setFeatureFlags(updated);
    await persistFeatureFlagsWithFeedback(updated);
  };

  const handleSaveFeatureFlags = async () => {
    await persistFeatureFlagsWithFeedback(featureFlags);
  };

  const handleResetFeatureFlags = async () => {
    setFeatureFlags(DEFAULT_FEATURE_FLAGS);
    await persistFeatureFlagsWithFeedback(DEFAULT_FEATURE_FLAGS);
  };

  const handleSaveTaxDefaults = async () => {
    try {
      await saveSuperAdminTaxDefaults(taxDefaultsDraft, currentUserUid);
      showSavedFeedback(
        isRu
          ? 'Налоговые настройки по умолчанию сохранены (/settings/tax_defaults)'
          : 'Paramètres fiscaux par défaut enregistrés (/settings/tax_defaults)'
      );
    } catch (err) {
      console.error('Failed to save tax defaults:', err);
      showSavedFeedback(
        isRu
          ? 'Ошибка сохранения налоговых настроек в Firestore'
          : 'Erreur lors de la sauvegarde des barèmes fiscaux dans Firestore'
      );
    }
  };

  const handleResetTaxDefaults = async () => {
    const fresh = createDefaultFrenchTaxConfig('micro_entreprise');
    setTaxDefaultsDraft(fresh);
    try {
      await saveSuperAdminTaxDefaults(fresh, currentUserUid);
      showSavedFeedback(
        pickLocalized(lang, {
          fr: 'Réinitialisé aux barèmes français (Micro 12,3% + 1% · Franchise en base)',
          ru: 'Сброшено к стандартам Франции (Micro 12.3% + 1% · Franchise en base)',
          hy: 'Վերականգնված է ֆրանսիական ստանդարտներով (Micro 12.3% + 1% · Franchise en base)',
          ka: 'აღდგენილია ფრანგული სტანდარტებით (Micro 12.3% + 1% · Franchise en base)',
        })
      );
    } catch (err) {
      console.error('Failed to reset tax defaults:', err);
      showSavedFeedback(
        isRu
          ? 'Ошибка сброса налоговых настроек в Firestore'
          : 'Erreur lors de la réinitialisation des barèmes fiscaux dans Firestore'
      );
    }
  };

  // Cerfa Calibration Cloud Persistence handlers (platform_settings/cerfa_templates)
  const handleSaveCerfaCalibration = async () => {
    setIsSavingCerfa(true);
    try {
      const { calibration } = await saveCerfaTemplatesCalibration(
        cerfaCalibrationDraft,
        currentUserUid
      );
      setCerfaCalibrationDraft(calibration);
      const resolvedDraft = resolveSystemThemeConfig(draftConfig);
      const syncedConfig: SystemThemeConfig = {
        ...resolvedDraft,
        cerfaAdjustments: {
          ...resolvedDraft.cerfaAdjustments,
          ...calibration.cerfa_15776_02.offsets,
        },
      };
      setDraftConfig(syncedConfig);
      await saveSystemThemeConfig(syncedConfig, currentUserUid);
      showSavedFeedback('Калибровка полей Cerfa сохранена в облаке');
    } finally {
      setIsSavingCerfa(false);
    }
  };

  const handleResetSelectedCerfaTemplate = () => {
    const defaults = createDefaultCerfaTemplatesCalibration();
    setCerfaCalibrationDraft((prev) => ({
      ...prev,
      cerfa_15776_02: defaults.cerfa_15776_02,
    }));
  };

  // Global Text Overrides handlers
  const handleTextOverrideChange = (key: string, field: 'fr' | 'ru' | 'color', value: string) => {
    setTextOverrides((prev) => ({
      ...prev,
      [key]: {
        fr: field === 'fr' ? value : prev[key]?.fr ?? '',
        ru: field === 'ru' ? value : prev[key]?.ru ?? '',
        color: field === 'color' ? value : prev[key]?.color ?? '',
      },
    }));
  };

  const handleSaveTextOverrides = async (nextOverrides: GlobalTextOverrides = textOverrides) => {
    const cleaned = cleanTextOverridesMap(nextOverrides);
    setTextOverrides(cleaned);
    await saveGlobalTextOverrides(cleaned, currentUserUid);
    showSavedFeedback(isRu ? 'Тексты и цвета применены глобально' : 'Textes et couleurs appliqués');
  };

  const handleSaveUiAndTexts = async () => {
    const cleaned = cleanTextOverridesMap(textOverrides);
    setTextOverrides(cleaned);
    const resolvedLayout = resolveSystemThemeConfig(draftConfig);
    setDraftConfig(resolvedLayout);
    await Promise.all([
      saveGlobalTextOverrides(cleaned, currentUserUid),
      saveSystemThemeConfig(resolvedLayout, currentUserUid),
    ]);
    applySystemThemeVariables(resolvedLayout, theme);
    showSavedFeedback(
      isRu ? 'Настройки UI и тексты сохранены глобально' : 'UI & textes appliqués globalement'
    );
  };

  const handleResetSingleText = async (key: string) => {
    const copy = { ...textOverrides };
    delete copy[key];
    await handleSaveTextOverrides(copy);
  };

  const handleResetAllTexts = async () => {
    setTextOverrides({});
    await saveGlobalTextOverrides({}, currentUserUid);
    showSavedFeedback(isRu ? 'Все тексты сброшены' : 'Tous les textes réinitialisés');
  };

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'dashboard',
      label: isRu ? 'Дашборд' : 'Tableau de bord',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'users',
      label: isRu ? 'Пользователи и гаражи' : 'Utilisateurs & Garages',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'expenses',
      label: isRu ? 'Категории расходов' : 'Catégories de frais',
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      id: 'features',
      label: isRu ? 'Управление функциями' : 'Contrôle des fonctions',
      icon: <ToggleRight className="w-4 h-4" />,
    },
    {
      id: 'texts',
      label: isRu ? 'UI и Тексты' : 'UI & Text Customization',
      icon: <Type className="w-4 h-4" />,
    },
    {
      id: 'design',
      label: isRu ? 'Дизайн и Брендинг' : 'Design & Branding',
      icon: <Palette className="w-4 h-4" />,
    },
    {
      id: 'billing',
      label: isRu ? 'Подписки и биллинг' : 'Abonnements & Billing',
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: 'cerfa',
      label: isRu ? 'Шаблоны и Cerfa' : 'Modèles & Cerfa',
      icon: <FileText className="w-4 h-4" />,
    },
  ];

  return (
    <div
      data-testid="admin-standalone-layout"
      className="min-h-screen flex flex-col lg:flex-row bg-slate-950 text-slate-100"
    >
      {/* Dedicated Standalone SuperAdmin Console Sidebar */}
      <aside
        data-testid="admin-console-sidebar"
        className="w-full lg:w-64 shrink-0 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col justify-between lg:h-screen lg:sticky lg:top-0 overflow-y-auto"
      >
        <div className="space-y-4">
          <button
            type="button"
            data-testid="admin-back-to-garage-btn"
            onClick={onBackToApp}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span>{isRu ? 'Вернуться в гараж' : 'Retour au garage'}</span>
          </button>

          <div className="px-2 pb-3 border-b border-slate-800">
            <p className="text-[11px] font-bold tracking-wider text-amber-400">SUPERADMIN</p>
            <h2 className="text-sm font-bold text-white mt-0.5">AutoGarage Console</h2>
          </div>

          <nav className="space-y-1" aria-label="SuperAdmin navigation">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`admin-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Single Fixed Save Confirmation Toast */}
      {saveNotice && (
        <div
          role="status"
          data-testid="admin-save-toast"
          className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-slate-900/95 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md"
        >
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Main Content Area */}
      <section className="flex-1 w-full min-w-0 p-4 md:p-6 lg:p-8 max-w-6xl space-y-6">
        {/* 1. DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white">
                {isRu ? 'Панель управления платформой' : 'Vue globale de la plateforme'}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {isRu
                  ? 'Ключевые показатели SaaS, активные автосалоны и ежемесячная выручка MRR'
                  : 'Indicateurs clés SaaS, garages actifs et revenus mensuels récurrents (MRR)'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{isRu ? 'Всего пользователей' : 'Total Utilisateurs'}</span>
                  <Users className="w-4 h-4 text-sky-400" />
                </div>
                <p className="text-2xl font-bold text-white tabular-nums mt-2">
                  {metrics.totalUsers}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {metrics.trialAccounts} {isRu ? 'на триале' : 'en essai'}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{isRu ? 'Активные гаражи' : 'Garages Actifs'}</span>
                  <Building2 className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-2xl font-bold text-white tabular-nums mt-2">
                  {metrics.activeGarages}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {metrics.pastDueAccounts} {isRu ? 'просрочка оплаты' : 'impayés'}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{isRu ? 'Выручка MRR' : 'Revenu Mensuel (MRR)'}</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-bold text-emerald-400 tabular-nums mt-2">
                  {formatEuro(metrics.monthlyRevenueMRR)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {isRu ? 'По активным подпискам' : 'Abonnements actifs'}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{isRu ? 'Авто на платформе' : 'Véhicules gérés'}</span>
                  <Car className="w-4 h-4 text-indigo-400" />
                </div>
                <p className="text-2xl font-bold text-white tabular-nums mt-2">
                  {metrics.totalActiveVehicles}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {isRu ? 'Суммарный инвентарь' : 'Inventaire cumulé'}
                </p>
              </div>
            </div>

            {/* Plan Distribution */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white">
                {isRu ? 'Распределение по тарифам' : 'Répartition des abonnements'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-bold text-white">{plan.name}</p>
                      <p className="text-xs text-slate-400 tabular-nums">
                        {formatEuro(plan.priceMonthly)} / {isRu ? 'мес' : 'mois'}
                      </p>
                    </div>
                    <span className="text-xl font-bold text-amber-400 tabular-nums">
                      {metrics.planCounts[plan.id] || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. USERS & GARAGES */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">
                  {isRu ? 'Пользователи и гаражи' : 'Utilisateurs & Garages'}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {isRu
                    ? 'Управление аккаунтами, проверка инвентаря и назначение лимитов'
                    : 'Gestion des comptes, inspection des parcs et attribution des limites'}
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isRu ? 'Поиск по имени, email, гаражу...' : 'Rechercher compte ou garage...'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">{isRu ? 'Аккаунт / Гараж' : 'Compte / Garage'}</th>
                    <th className="py-3 px-4">{isRu ? 'Роль' : 'Rôle'}</th>
                    <th className="py-3 px-4">{isRu ? 'Тариф' : 'Forfait'}</th>
                    <th className="py-3 px-4 text-right">{isRu ? 'Инвентарь / Лимит' : 'Stock / Limite'}</th>
                    <th className="py-3 px-4">{isRu ? 'Статус' : 'Statut'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc.uid} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{acc.garageName || acc.displayName || acc.email}</div>
                        <div className="text-[11px] text-slate-400">
                          {acc.displayName} · {acc.email}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleRoleToggle(acc.uid, acc.role)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                            acc.role === 'superadmin'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700 hover:text-white'
                          }`}
                        >
                          {acc.role}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <ThemedSelect<SubscriptionPlanId>
                          testId={`admin-plan-select-${acc.uid}`}
                          ariaLabel={`Plan for ${acc.garageName}`}
                          value={acc.planId}
                          onChange={(val) => handlePlanChange(acc.uid, val)}
                          options={plans.map((p) => ({ value: p.id, label: p.name }))}
                          triggerClassName="bg-[var(--background)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--foreground)]"
                        />
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <span className="font-bold text-white">{acc.activeVehiclesCount}</span>
                        <span className="text-slate-500"> / </span>
                        <input
                          type="number"
                          aria-label={`Vehicle limit for ${acc.garageName}`}
                          value={acc.vehicleLimit}
                          onChange={(e) =>
                            updateUserAccount(acc.uid, {
                              vehicleLimit: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-16 text-right bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-0.5 text-xs text-amber-400 font-semibold"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <ThemedSelect<SubscriptionStatus>
                          testId={`admin-status-select-${acc.uid}`}
                          ariaLabel={`Status for ${acc.garageName}`}
                          value={acc.subscriptionStatus}
                          onChange={(val) => handleStatusChange(acc.uid, val)}
                          options={[
                            { value: 'active', label: isRu ? 'Активен' : 'Actif' },
                            { value: 'trial', label: isRu ? 'Триал' : 'Essai' },
                            { value: 'past_due', label: isRu ? 'Просрочен' : 'Impayé' },
                            { value: 'canceled', label: isRu ? 'Отменён' : 'Annulé' },
                          ]}
                          triggerClassName="bg-[var(--background)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--foreground)]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. DESIGN & BRANDING STUDIO (SECTION-BY-SECTION DUAL-THEME ENGINE + MULTI-PAGE PREVIEW) */}
        {activeTab === 'design' && (() => {
          const resolvedDraft = resolveSystemThemeConfig(draftConfig);
          const lightPalette = resolvedDraft.lightPalette || DEFAULT_LIGHT_PALETTE;
          const darkPalette = resolvedDraft.darkPalette || DEFAULT_DARK_PALETTE;

          const tokenGroups: {
            id: 'header' | 'cards' | 'vehicle_detail' | 'analytics_tables';
            titleRu: string;
            titleFr: string;
            previewTarget: 'card' | 'vehicle_detail' | 'header_table';
            rows: {
              key: keyof ThemePaletteTokens;
              cssVar: string;
              labelRu: string;
              labelFr: string;
            }[];
          }[] = [
            {
              id: 'header',
              titleRu: 'Шапка и Навигация',
              titleFr: 'En-tête & Navigation',
              previewTarget: 'header_table',
              rows: [
                { key: 'headerBg', cssVar: '--ag-header-bg', labelRu: 'Фон верхней шапки', labelFr: 'Fond barre supérieure' },
                { key: 'headerText', cssVar: '--ag-header-text', labelRu: 'Текст шапки и иконки', labelFr: 'Texte & icônes en-tête' },
                { key: 'headerBorder', cssVar: '--ag-header-border', labelRu: 'Нижняя граница шапки', labelFr: 'Bordure inférieure' },
                { key: 'navActiveBg', cssVar: '--ag-nav-active-bg', labelRu: 'Фон активной вкладки', labelFr: 'Fond onglet actif' },
                { key: 'navActiveText', cssVar: '--ag-nav-active-text', labelRu: 'Текст активной вкладки', labelFr: 'Texte onglet actif' },
              ],
            },
            {
              id: 'cards',
              titleRu: 'Карточки склада и Общий фон',
              titleFr: 'Cartes d’inventaire & Fond',
              previewTarget: 'card',
              rows: [
                { key: 'background', cssVar: '--background', labelRu: 'Фон страницы (Canvas)', labelFr: 'Fond de page (Canvas)' },
                { key: 'card', cssVar: '--card', labelRu: 'Фон карточек (Card)', labelFr: 'Surface des cartes (Card)' },
                { key: 'surfaceMuted', cssVar: '--surface-muted', labelRu: 'Вторичная панель / инпут', labelFr: 'Surface secondaire / champ' },
                { key: 'primary', cssVar: '--primary', labelRu: 'Основной акцент / кнопки', labelFr: 'Couleur principale / CTA' },
                { key: 'foreground', cssVar: '--foreground', labelRu: 'Заголовки (Primary Text)', labelFr: 'Titres (Texte principal)' },
                { key: 'secondaryForeground', cssVar: '--secondary-foreground', labelRu: 'Основной текст', labelFr: 'Texte courant' },
                { key: 'mutedForeground', cssVar: '--muted-foreground', labelRu: 'Приглушённые подписи', labelFr: 'Textes secondaires' },
                { key: 'border', cssVar: '--border', labelRu: 'Рамки и разделители', labelFr: 'Bordures & séparateurs' },
                { key: 'success', cssVar: '--success', labelRu: 'Успех / В продаже', labelFr: 'Succès / En vente' },
                { key: 'warning', cssVar: '--warning', labelRu: 'Подготовка / Внимание', labelFr: 'Préparation / Alerte' },
              ],
            },
            {
              id: 'vehicle_detail',
              titleRu: 'Страница авто и Финансовый отчёт',
              titleFr: 'Fiche Véhicule & Rapport P&L',
              previewTarget: 'vehicle_detail',
              rows: [
                { key: 'detailContainerBg', cssVar: '--ag-detail-bg', labelRu: 'Контейнер баланса P&L', labelFr: 'Fond bilan P&L véhicule' },
                { key: 'detailHeadingColor', cssVar: '--ag-detail-heading', labelRu: 'Заголовок баланса и отчёта', labelFr: 'Titre bilan & rapport' },
                { key: 'metricBoxBg', cssVar: '--ag-metric-bg', labelRu: 'Фон мини-карточек (Закупка/Ремонт)', labelFr: 'Fond blocs métriques' },
                { key: 'saleReceiptBg', cssVar: '--ag-receipt-bg', labelRu: 'Фон чека продажи (Receipt)', labelFr: 'Fond reçu financier' },
                { key: 'profitColor', cssVar: '--ag-profit-color', labelRu: 'Положительная прибыль (+€)', labelFr: 'Profit positif (+€)' },
                { key: 'expenseColor', cssVar: '--ag-expense-color', labelRu: 'Затраты и налоги (-€)', labelFr: 'Coûts & taxes (-€)' },
              ],
            },
            {
              id: 'analytics_tables',
              titleRu: 'Аналитика, Таблицы и Модалки',
              titleFr: 'Analytique, Tableaux & Modales',
              previewTarget: 'header_table',
              rows: [
                { key: 'tableHeaderBg', cssVar: '--ag-table-header-bg', labelRu: 'Шапка таблиц списка', labelFr: 'En-tête des tableaux' },
                { key: 'tableRowHover', cssVar: '--ag-table-row-hover', labelRu: 'Подсветка строки при наведении', labelFr: 'Survol ligne tableau' },
                { key: 'chartAccent', cssVar: '--ag-chart-accent', labelRu: 'Акцент графиков и KPI', labelFr: 'Accent graphiques & KPI' },
                { key: 'modalBg', cssVar: '--ag-modal-bg', labelRu: 'Фон модальных окон', labelFr: 'Fond des fenêtres modales' },
              ],
            },
          ];

          const visibleGroups =
            designSection === 'all'
              ? tokenGroups
              : tokenGroups.filter((g) => g.id === designSection);

          const renderPreviewLabelBtn = (
            translationKey: keyof typeof translations.fr,
            baseColor: string,
            className = ''
          ) => {
            const label = resolveLocalizedLabel(
              translationKey,
              lang,
              translations[lang][translationKey],
              textOverrides
            );
            const customColor = resolveLocalizedColor(translationKey, textOverrides);
            const isSelected = selectedPreviewKey === translationKey;
            return (
              <button
                type="button"
                onClick={() => setSelectedPreviewKey(translationKey)}
                title={isRu ? `Нажмите для редактирования «${translationKey}»` : `Cliquer pour modifier «${translationKey}»`}
                className={`text-left transition rounded px-1 -mx-1 hover:underline ${
                  isSelected ? 'ring-1 ring-amber-400' : ''
                } ${className}`}
                style={{ color: customColor || baseColor }}
              >
                {label}
              </button>
            );
          };

          const renderMultiPagePreview = (palette: ThemePaletteTokens) => {
            const detailHeading = palette.detailHeadingColor || palette.foreground;
            const profitCol = palette.profitColor || palette.success;
            const expenseCol = palette.expenseColor || '#ef4444';
            const headerBg = palette.headerBg || palette.card;
            const headerText = palette.headerText || palette.foreground;
            const headerBorder = palette.headerBorder || palette.border;
            const navActiveBg = palette.navActiveBg || palette.primary;
            const navActiveText = palette.navActiveText || getContrastForeground(navActiveBg);
            const detailBg = palette.detailContainerBg || palette.card;
            const metricBg = palette.metricBoxBg || palette.surfaceMuted;
            const receiptBg = palette.saleReceiptBg || palette.background;
            const tableHeaderBg = palette.tableHeaderBg || palette.background;
            const tableRowHover = palette.tableRowHover || palette.surfaceMuted;
            const chartAccent = palette.chartAccent || palette.primary;
            const modalBg = palette.modalBg || palette.card;

            if (previewPage === 'card') {
              return (
                <div
                  className="p-4 border space-y-3"
                  style={{
                    backgroundColor: palette.card,
                    borderColor: palette.border,
                    borderRadius: resolvedDraft.cardBorderRadius,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: palette.foreground }}>
                          Peugeot 208 GT
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                          style={{
                            backgroundColor: palette.primary,
                            color: palette.primaryForeground || getContrastForeground(palette.primary),
                          }}
                        >
                          2022
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: palette.mutedForeground }}>
                        1.2 PureTech 130ch · 34 200 km
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${palette.warning} 14%, transparent)`,
                          borderColor: `color-mix(in srgb, ${palette.warning} 35%, transparent)`,
                          color: palette.warning,
                        }}
                      >
                        {isRu ? 'В подготовке' : 'Préparation'}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${palette.success} 14%, transparent)`,
                          borderColor: `color-mix(in srgb, ${palette.success} 35%, transparent)`,
                          color: palette.success,
                        }}
                      >
                        {isRu ? 'В продаже' : 'En vente'}
                      </span>
                    </div>
                  </div>

                  <div
                    className="p-2.5 rounded-xl border flex items-center justify-between"
                    style={{ backgroundColor: palette.surfaceMuted, borderColor: palette.border }}
                  >
                    <span className="text-xs font-medium" style={{ color: palette.secondaryForeground }}>
                      {isRu ? 'Цена продажи' : 'Prix affiché'}
                    </span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: palette.foreground }}>
                      16 900 €
                    </span>
                  </div>

                  <div
                    className="p-2.5 rounded-xl border flex items-center justify-between"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${profitCol} 12%, transparent)`,
                      borderColor: `color-mix(in srgb, ${profitCol} 32%, transparent)`,
                    }}
                  >
                    {renderPreviewLabelBtn('netProfitLabel', palette.secondaryForeground, 'text-xs font-semibold')}
                    <span className="text-sm font-bold tabular-nums" style={{ color: profitCol }}>
                      +3 700 € · 21.9%
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px]" style={{ color: palette.mutedForeground }}>
                      VIN: VR3UPHNKSN...
                    </span>
                    <span
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
                      style={{
                        backgroundColor: palette.primary,
                        color: palette.primaryForeground || getContrastForeground(palette.primary),
                      }}
                    >
                      {isRu ? 'Открыть карту' : 'Voir fiche'}
                    </span>
                  </div>
                </div>
              );
            }

            if (previewPage === 'vehicle_detail') {
              return (
                <div className="space-y-3">
                  {/* Financial Balance Container Preview */}
                  <div
                    className="p-3.5 border space-y-2.5"
                    style={{
                      backgroundColor: detailBg,
                      borderColor: palette.border,
                      borderRadius: resolvedDraft.cardBorderRadius,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {renderPreviewLabelBtn('pnlBannerTitle', detailHeading, 'text-xs font-bold')}
                      <button
                        type="button"
                        onClick={() => setSelectedPreviewKey('recordSaleBtn')}
                        className="px-2.5 py-1 text-[10px] font-bold whitespace-nowrap"
                        style={{
                          backgroundColor: palette.primary,
                          color:
                            resolveLocalizedColor('recordSaleBtn', textOverrides) ||
                            palette.primaryForeground ||
                            getContrastForeground(palette.primary),
                          borderRadius: resolvedDraft.buttonBorderRadius || '10px',
                        }}
                      >
                        {resolveLocalizedLabel(
                          'recordSaleBtn',
                          lang,
                          translations[lang].recordSaleBtn,
                          textOverrides
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div
                        className="p-2 rounded-lg border"
                        style={{ backgroundColor: metricBg, borderColor: palette.border }}
                      >
                        <div className="truncate">
                          {renderPreviewLabelBtn(
                            'purchasePriceLabel',
                            palette.mutedForeground,
                            'text-[10px] block'
                          )}
                        </div>
                        <div className="text-xs font-bold tabular-nums mt-0.5" style={{ color: palette.foreground }}>
                          3 000 €
                        </div>
                      </div>
                      <div
                        className="p-2 rounded-lg border"
                        style={{ backgroundColor: metricBg, borderColor: palette.border }}
                      >
                        <div className="truncate">
                          {renderPreviewLabelBtn(
                            'workshopRepairsLabel',
                            palette.mutedForeground,
                            'text-[10px] block'
                          )}
                        </div>
                        <div className="text-xs font-bold tabular-nums mt-0.5" style={{ color: palette.foreground }}>
                          500 €
                        </div>
                      </div>
                      <div
                        className="p-2 rounded-lg border"
                        style={{ backgroundColor: metricBg, borderColor: palette.border }}
                      >
                        <span className="text-[10px] block truncate" style={{ color: palette.mutedForeground }}>
                          {isRu ? 'Продажа' : 'Vente'}
                        </span>
                        <div className="text-xs font-bold tabular-nums mt-0.5" style={{ color: palette.foreground }}>
                          5 000 €
                        </div>
                      </div>
                      <div
                        className="p-2 rounded-lg border"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${profitCol} 12%, ${metricBg})`,
                          borderColor: `color-mix(in srgb, ${profitCol} 40%, ${palette.border})`,
                        }}
                      >
                        <div className="truncate">
                          {renderPreviewLabelBtn('netProfitLabel', profitCol, 'text-[10px] font-semibold block')}
                        </div>
                        <div className="text-xs font-black tabular-nums mt-0.5" style={{ color: profitCol }}>
                          +1 275 €
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sale Report Receipt Preview */}
                  <div
                    className="p-3 border font-mono text-[11px] space-y-1.5"
                    style={{
                      backgroundColor: receiptBg,
                      borderColor: palette.border,
                      borderRadius: resolvedDraft.cardBorderRadius,
                    }}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b" style={{ borderColor: palette.border }}>
                      <button
                        type="button"
                        onClick={() => setSelectedPreviewKey('saleReportTitle')}
                        className="font-bold text-left hover:underline"
                        style={{ color: resolveLocalizedColor('saleReportTitle', textOverrides) || detailHeading }}
                      >
                        {resolveLocalizedLabel(
                          'saleReportTitle',
                          lang,
                          translations[lang].saleReportTitle,
                          textOverrides
                        ).replace('{vehicle}', 'Peugeot 207')}
                      </button>
                      <span style={{ color: palette.mutedForeground }}>Micro 13.3%</span>
                    </div>
                    <div className="flex justify-between tabular-nums">
                      <span style={{ color: palette.secondaryForeground }}>+ {translations[lang].saleReportSalePrice}</span>
                      <span className="font-bold" style={{ color: palette.foreground }}>5 000 €</span>
                    </div>
                    <div className="flex justify-between tabular-nums">
                      <span style={{ color: palette.secondaryForeground }}>- {translations[lang].saleReportPurchase}</span>
                      <span className="font-semibold" style={{ color: expenseCol }}>-3 000 €</span>
                    </div>
                    <div className="flex justify-between tabular-nums">
                      <span style={{ color: palette.secondaryForeground }}>- {translations[lang].saleReportRepairs} / Tax</span>
                      <span className="font-semibold" style={{ color: expenseCol }}>-725 €</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t tabular-nums font-bold" style={{ borderColor: palette.border }}>
                      {renderPreviewLabelBtn('saleReportNetProfit', palette.foreground, 'text-[11px] font-bold')}
                      <span style={{ color: profitCol }}>+1 275 €</span>
                    </div>
                  </div>
                </div>
              );
            }

            // previewPage === 'header_table'
            return (
              <div className="space-y-3">
                {/* Mini Navbar Preview */}
                <div
                  className="px-3 py-2 border flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: headerBg,
                    borderColor: headerBorder,
                    color: headerText,
                    borderRadius: resolvedDraft.cardBorderRadius,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        backgroundColor: navActiveBg,
                        color: navActiveText,
                      }}
                    >
                      AG
                    </span>
                    {renderPreviewLabelBtn('appName', headerText, 'text-xs font-bold truncate')}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                      style={{ backgroundColor: navActiveBg, color: navActiveText }}
                    >
                      {isRu ? 'Склад (8)' : 'Parc (8)'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px]" style={{ color: headerText }}>
                      {isRu ? 'Аналитика' : 'Analytique'}
                    </span>
                  </div>
                </div>

                {/* Mini Table Preview */}
                <div
                  className="border overflow-hidden text-[11px]"
                  style={{
                    backgroundColor: palette.card,
                    borderColor: palette.border,
                    borderRadius: resolvedDraft.cardBorderRadius,
                  }}
                >
                  <div
                    className="grid grid-cols-3 px-3 py-1.5 font-semibold border-b"
                    style={{
                      backgroundColor: tableHeaderBg,
                      borderColor: palette.border,
                      color: palette.mutedForeground,
                    }}
                  >
                    <span>{isRu ? 'Авто' : 'Véhicule'}</span>
                    <span className="text-right">{isRu ? 'Ремонт' : 'Atelier'}</span>
                    <span className="text-right">{isRu ? 'Прибыль' : 'Marge'}</span>
                  </div>
                  <div
                    className="grid grid-cols-3 px-3 py-2 tabular-nums"
                    style={{ backgroundColor: tableRowHover, color: palette.foreground }}
                  >
                    <span className="font-semibold truncate">Renault Clio V</span>
                    <span className="text-right" style={{ color: expenseCol }}>-450 €</span>
                    <span className="text-right font-bold" style={{ color: profitCol }}>+2 150 €</span>
                  </div>
                </div>

                {/* Mini Analytics + Modal Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="p-2.5 border space-y-1.5"
                    style={{
                      backgroundColor: palette.card,
                      borderColor: palette.border,
                      borderRadius: resolvedDraft.cardBorderRadius,
                    }}
                  >
                    <div className="truncate">
                      {renderPreviewLabelBtn('analyticsTitle', palette.foreground, 'text-[10px] font-bold')}
                    </div>
                    <div className="flex items-end gap-1 h-7 pt-1">
                      <div className="flex-1 rounded-t h-3" style={{ backgroundColor: chartAccent, opacity: 0.45 }} />
                      <div className="flex-1 rounded-t h-5" style={{ backgroundColor: chartAccent, opacity: 0.7 }} />
                      <div className="flex-1 rounded-t h-7" style={{ backgroundColor: chartAccent }} />
                    </div>
                  </div>
                  <div
                    className="p-2.5 border space-y-1"
                    style={{
                      backgroundColor: modalBg,
                      borderColor: palette.border,
                      borderRadius: resolvedDraft.cardBorderRadius,
                    }}
                  >
                    <div className="text-[10px] font-bold" style={{ color: palette.foreground }}>
                      {isRu ? 'Модальное окно' : 'Fenêtre Modale'}
                    </div>
                    <div className="text-[10px]" style={{ color: palette.mutedForeground }}>
                      --ag-modal-bg
                    </div>
                    <span
                      className="inline-block px-2 py-0.5 rounded text-[9px] font-bold"
                      style={{ backgroundColor: palette.primary, color: palette.primaryForeground || '#fff' }}
                    >
                      OK
                    </span>
                  </div>
                </div>
              </div>
            );
          };

          const renderThemeColumn = (mode: 'light' | 'dark', palette: ThemePaletteTokens) => {
            const isLightCol = mode === 'light';
            const isActiveAppMode = theme === mode;

            return (
              <div
                key={mode}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                        isLightCol
                          ? 'bg-slate-100 text-slate-900 border-slate-300'
                          : 'bg-slate-950 text-amber-400 border-slate-800'
                      }`}
                    >
                      {isLightCol ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">
                        {isLightCol
                          ? isRu
                            ? 'Светлая тема (Light Theme)'
                            : 'Thème Clair (Light Palette)'
                          : isRu
                            ? 'Тёмная тема (Dark Theme)'
                            : 'Thème Sombre (Dark Palette)'}
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        {isLightCol
                          ? isRu
                            ? 'Дневной режим интерфейса и отчётов'
                            : 'Mode jour pour postes lumineux'
                          : isRu
                            ? 'Ночной режим и контрастные акценты'
                            : 'Mode nuit et contrastes élevés'}
                      </p>
                    </div>
                  </div>
                  {onThemeChange && (
                    <button
                      type="button"
                      onClick={() => onThemeChange(mode)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition whitespace-nowrap shrink-0 ${
                        isActiveAppMode
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>
                        {isActiveAppMode
                          ? isRu
                            ? 'Активна сейчас'
                            : 'Actif'
                          : isRu
                            ? 'Включить на сайте'
                            : 'Tester en direct'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Section-by-Section Color Pickers & Hex Inputs */}
                <div className="space-y-4">
                  {visibleGroups.map((group) => (
                    <div key={`${mode}-${group.id}`} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-400">
                          {isRu ? group.titleRu : group.titleFr}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreviewPage(group.previewTarget)}
                          className="text-[10px] font-semibold text-slate-400 hover:text-white transition"
                        >
                          {isRu ? 'Показать в превью' : 'Voir aperçu'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {group.rows.map((row) => {
                          const value = palette[row.key] || '#0f172a';
                          const safePickerVal = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#0f172a';
                          return (
                            <div
                              key={`${mode}-${row.key}`}
                              className="flex items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-white truncate">
                                  {isRu ? row.labelRu : row.labelFr}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 shrink-0 hidden sm:inline">
                                  {row.cssVar}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <input
                                  type="color"
                                  aria-label={`${mode} ${row.cssVar} color picker`}
                                  value={safePickerVal}
                                  onChange={(e) =>
                                    handlePaletteTokenChange(mode, row.key, e.target.value)
                                  }
                                  className="w-7 h-7 rounded-lg bg-transparent border border-slate-700 cursor-pointer p-0.5 shrink-0"
                                />
                                <input
                                  type="text"
                                  aria-label={`${mode} ${row.cssVar} hex value`}
                                  value={value}
                                  maxLength={9}
                                  onChange={(e) =>
                                    handlePaletteTokenChange(mode, row.key, e.target.value)
                                  }
                                  className="w-[82px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-200 tabular-nums focus:outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Multi-Page Preview Container */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-400">
                      {isLightCol
                        ? isRu
                          ? 'Предпросмотр светлой темы'
                          : 'Aperçu Thème Clair'
                        : isRu
                          ? 'Предпросмотр тёмной темы'
                          : 'Aperçu Thème Sombre'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 tabular-nums truncate">
                      {palette.background} · {palette.detailContainerBg || palette.card} · {palette.primary}
                    </span>
                  </div>

                  <div
                    data-branding-preview="true"
                    className="p-3.5 border transition-all"
                    style={
                      {
                        '--preview-bg': palette.background,
                        '--preview-fg': palette.foreground,
                        '--preview-border': palette.border,
                        backgroundColor: palette.background,
                        borderColor: palette.border,
                        borderRadius: resolvedDraft.cardBorderRadius,
                      } as React.CSSProperties
                    }
                  >
                    {renderMultiPagePreview(palette)}
                  </div>
                </div>
              </div>
            );
          };

          const selectedTypedKey = selectedPreviewKey as keyof typeof translations.fr | null;
          const selectedOverrideEntry = selectedTypedKey
            ? textOverrides[selectedTypedKey]
            : undefined;

          return (
            <div className="space-y-5">
              {/* Studio Header */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-white">
                    {isRu ? 'Дизайн и Брендинг' : 'Design & Branding Studio'}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    {isRu
                      ? 'Посекционная настройка цветов для шапки, карточек, страницы авто, чека P&L, таблиц и модальных окон'
                      : 'Contrôle complet des couleurs par section : en-tête, cartes, fiche véhicule, reçu P&L, tableaux et modales'}
                  </p>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
                  {onThemeChange && (
                    <button
                      type="button"
                      onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition whitespace-nowrap shrink-0"
                    >
                      {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                      <span>
                        {theme === 'dark'
                          ? isRu
                            ? 'Тёмная'
                            : 'Sombre'
                          : isRu
                            ? 'Светлая'
                            : 'Clair'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleResetConfig}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isRu ? 'Сбросить по умолчанию' : 'Réinitialiser par défaut'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveGlobalConfig(resolvedDraft, true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isRu ? 'Применить глобально' : 'Enregistrer & Appliquer'}</span>
                  </button>
                </div>
              </div>

              {/* Quick Dual-Theme Brand Presets */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">
                      {isRu ? 'Готовые палитры бренда (Light + Dark)' : 'Préréglages de marque (Clair + Sombre)'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {isRu ? 'Изменения применяются к предпросмотру мгновенно' : 'Aperçu instantané sans rechargement'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {BRAND_THEME_PRESETS.map((preset) => {
                    const isSelected =
                      lightPalette.primary.toLowerCase() === preset.lightPalette.primary.toLowerCase() &&
                      darkPalette.primary.toLowerCase() === preset.darkPalette.primary.toLowerCase() &&
                      darkPalette.background.toLowerCase() === preset.darkPalette.background.toLowerCase();
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyBrandPreset(preset.id)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition whitespace-nowrap ${
                          isSelected
                            ? 'border-amber-500 bg-slate-800 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center -space-x-1">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/40"
                            style={{ backgroundColor: preset.lightPalette.primary }}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-slate-700"
                            style={{ backgroundColor: preset.darkPalette.card }}
                          />
                        </span>
                        <span>{isRu ? preset.nameRu : preset.nameFr}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section Filter & Multi-Page Preview Switcher Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">
                    {isRu ? 'Секция:' : 'Section :'}
                  </span>
                  {(
                    [
                      { id: 'all', labelRu: 'Все секции', labelFr: 'Toutes', target: null },
                      { id: 'header', labelRu: 'Шапка и Навигация', labelFr: 'En-tête & Nav', target: 'header_table' },
                      { id: 'cards', labelRu: 'Карточки склада', labelFr: 'Cartes Stock', target: 'card' },
                      { id: 'vehicle_detail', labelRu: 'Страница авто и Чек', labelFr: 'Fiche & Reçu P&L', target: 'vehicle_detail' },
                      { id: 'analytics_tables', labelRu: 'Аналитика, Таблицы и Модалки', labelFr: 'Analytique & Modales', target: 'header_table' },
                    ] as const
                  ).map((sec) => {
                    const active = designSection === sec.id;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          setDesignSection(sec.id);
                          if (sec.target) setPreviewPage(sec.target);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${
                          active
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {isRu ? sec.labelRu : sec.labelFr}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">
                    {isRu ? 'Превью экрана:' : 'Aperçu écran :'}
                  </span>
                  {(
                    [
                      { id: 'card', labelRu: 'Карточка авто', labelFr: 'Carte Stock' },
                      { id: 'vehicle_detail', labelRu: 'Страница авто и Чек', labelFr: 'Fiche & Reçu P&L' },
                      { id: 'header_table', labelRu: 'Шапка и Таблица', labelFr: 'En-tête & Tableau' },
                    ] as const
                  ).map((pg) => {
                    const active = previewPage === pg.id;
                    return (
                      <button
                        key={pg.id}
                        type="button"
                        onClick={() => setPreviewPage(pg.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${
                          active
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {isRu ? pg.labelRu : pg.labelFr}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Linked Text + Color Quick Editor (activated by clicking any label inside previews) */}
              {selectedTypedKey && (
                <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-white">
                        {isRu ? 'Быстрое редактирование текста и цвета:' : 'Édition rapide texte & couleur :'}
                      </span>
                      <span className="text-xs font-mono text-amber-400">{selectedTypedKey}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPreviewKey(null)}
                      className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
                    >
                      {isRu ? 'Закрыть' : 'Fermer'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        FR
                      </label>
                      <input
                        type="text"
                        aria-label={`Quick edit ${selectedTypedKey} FR`}
                        value={selectedOverrideEntry?.fr ?? ''}
                        onChange={(e) =>
                          handleTextOverrideChange(selectedTypedKey, 'fr', e.target.value)
                        }
                        placeholder={translations.fr[selectedTypedKey]}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        RU
                      </label>
                      <input
                        type="text"
                        aria-label={`Quick edit ${selectedTypedKey} RU`}
                        value={selectedOverrideEntry?.ru ?? ''}
                        onChange={(e) =>
                          handleTextOverrideChange(selectedTypedKey, 'ru', e.target.value)
                        }
                        placeholder={translations.ru[selectedTypedKey]}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        {isRu ? 'Цвет текста' : 'Couleur'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          aria-label={`Quick edit ${selectedTypedKey} color`}
                          value={
                            selectedOverrideEntry?.color &&
                            /^#[0-9a-fA-F]{6}$/.test(selectedOverrideEntry.color)
                              ? selectedOverrideEntry.color
                              : '#f8fafc'
                          }
                          onChange={(e) =>
                            handleTextOverrideChange(selectedTypedKey, 'color', e.target.value)
                          }
                          className="w-8 h-8 rounded-lg bg-transparent border border-slate-700 cursor-pointer p-0.5 shrink-0"
                        />
                        {selectedOverrideEntry?.color && (
                          <button
                            type="button"
                            onClick={() =>
                              handleTextOverrideChange(selectedTypedKey, 'color', '')
                            }
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                            title={isRu ? 'Сбросить цвет' : 'Réinitialiser couleur'}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveTextOverrides(textOverrides)}
                        className="w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition whitespace-nowrap"
                      >
                        {isRu ? 'Сохранить' : 'Enregistrer'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Dual-Column Light & Dark Theme Palettes */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {renderThemeColumn('light', lightPalette)}
                {renderThemeColumn('dark', darkPalette)}
              </div>

              {/* Geometry, Default View & Live CSS Variables Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-4 space-y-2.5">
                  <label className="block text-xs font-bold text-white">
                    {isRu ? 'Скругление карточек (--ag-card-radius)' : 'Rayon des bordures de cartes (--ag-card-radius)'}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['6px', '12px', '16px', '24px'] as const).map((rad) => (
                      <button
                        key={rad}
                        type="button"
                        onClick={() =>
                          setDraftConfig({ ...resolvedDraft, cardBorderRadius: rad })
                        }
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                          resolvedDraft.cardBorderRadius === rad
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {rad}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-2.5">
                  <label className="block text-xs font-bold text-white">
                    {isRu ? 'Вид инвентаря по умолчанию' : 'Vue par défaut de l’inventaire'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftConfig({ ...resolvedDraft, defaultInventoryViewMode: 'grid' })
                      }
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition whitespace-nowrap ${
                        resolvedDraft.defaultInventoryViewMode === 'grid'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {isRu ? 'Сетка (Grid)' : 'Grille (Grid)'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftConfig({ ...resolvedDraft, defaultInventoryViewMode: 'list' })
                      }
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition whitespace-nowrap ${
                        resolvedDraft.defaultInventoryViewMode === 'list'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {isRu ? 'Список (List)' : 'Liste (List)'}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-2">
                  <p className="text-xs font-bold text-white">
                    {isRu
                      ? `Активные CSS-токены (${theme === 'light' ? 'Light' : 'Dark'})`
                      : `Variables CSS actives (${theme === 'light' ? 'Light' : 'Dark'})`}
                  </p>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-[11px] font-mono text-slate-400 space-y-1 tabular-nums">
                    <div>
                      --ag-header-bg: <span className="text-slate-200">{(theme === 'light' ? lightPalette : darkPalette).headerBg}</span> · --ag-detail-bg: <span className="text-slate-200">{(theme === 'light' ? lightPalette : darkPalette).detailContainerBg}</span>
                    </div>
                    <div>
                      --ag-receipt-bg: <span className="text-slate-200">{(theme === 'light' ? lightPalette : darkPalette).saleReceiptBg}</span> · --ag-profit-color: <span className="text-slate-200">{(theme === 'light' ? lightPalette : darkPalette).profitColor}</span>
                    </div>
                    <div>
                      --ag-modal-bg: <span className="text-slate-200">{(theme === 'light' ? lightPalette : darkPalette).modalBg}</span> · --ag-chart-accent: <span className="text-slate-200">{(theme === 'light' ? lightPalette : darkPalette).chartAccent}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 4. SUBSCRIPTION & BILLING */}
        {activeTab === 'billing' && (() => {
          const featuresFieldKey: 'featuresRu' | 'featuresFr' =
            planFeaturesLang === 'ru' ? 'featuresRu' : 'featuresFr';
          const moduleToggleDefs: {
            key: keyof PlanModulesConfig;
            labelRu: string;
            labelFr: string;
          }[] = [
            {
              key: 'cerfaAutofill',
              labelRu: 'Автозаполнение и PDF Cerfa 15776*02',
              labelFr: 'Auto-remplissage & PDF Cerfa 15776*02',
            },
            {
              key: 'suppliers',
              labelRu: 'Поставщики и запчасти',
              labelFr: 'Fournisseurs & pièces',
            },
            {
              key: 'analytics',
              labelRu: 'Аналитика и P&L',
              labelFr: 'Analytique & P&L',
            },
            {
              key: 'exportsBackup',
              labelRu: 'Экспорт и бэкап',
              labelFr: 'Exports & sauvegardes',
            },
            {
              key: 'multiGarage',
              labelRu: 'Режим Мультигараж',
              labelFr: 'Mode Multi-garages',
            },
          ];

          return (
            <div className="space-y-6">
              {/* Top Header with Global Save Changes CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {isRu ? 'Подписки и биллинг' : 'Abonnements & Facturation'}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    {isRu
                      ? 'Редактируйте названия, цены, лимиты авто, модули и преимущества тарифов (platform_settings/subscription_plans)'
                      : 'Modifiez noms, tarifs, quotas véhicules, modules et avantages des forfaits (platform_settings/subscription_plans)'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div
                    role="group"
                    aria-label={isRu ? 'Язык списка преимуществ' : 'Langue des avantages'}
                    className="inline-flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => setPlanFeaturesLang('ru')}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                        planFeaturesLang === 'ru'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      RU
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanFeaturesLang('fr')}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                        planFeaturesLang === 'fr'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      FR
                    </button>
                  </div>

                  <button
                    type="button"
                    data-testid="admin-reset-plans-btn"
                    onClick={handleResetPlansDraft}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isRu ? 'Сбросить' : 'Réinitialiser'}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="admin-save-plans-btn"
                    disabled={isSavingPlans}
                    onClick={handleSaveAllPlans}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 transition shadow-sm cursor-pointer"
                  >
                    {isSavingPlans ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isRu ? 'Сохранить изменения' : 'Enregistrer les modifications'}
                    </span>
                    {isPlansDirty && (
                      <span
                        aria-hidden="true"
                        className="w-1.5 h-1.5 rounded-full bg-slate-950"
                      />
                    )}
                  </button>
                </div>
              </div>

              {/* 3-Tier Plan Editor Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
                {plansDraft.map((plan) => {
                  const isUnlimited = plan.vehicleLimit === null;
                  const modules = plan.modules || getDefaultPlanModules(plan.id);
                  const featuresList = plan[featuresFieldKey] || [];
                  const tierCodeLabel = plan.id === 'enterprise' ? 'business' : plan.id;

                  return (
                    <div
                      key={plan.id}
                      data-testid={`admin-plan-editor-${plan.id}`}
                      className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between gap-4 transition ${
                        plan.isPopular ? 'border-amber-500/70' : 'border-slate-800'
                      }`}
                    >
                      <div className="space-y-4">
                        {/* Card Header: Tier Key & Active Subscriber Count */}
                        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                              {tierCodeLabel}
                            </span>
                            {plan.isPopular && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-slate-950">
                                <Sparkles className="w-3 h-3" />
                                <span>{isRu ? 'Популярный' : 'Populaire'}</span>
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-amber-400 tabular-nums">
                            {metrics.planCounts[plan.id] || 0} {isRu ? 'акк.' : 'comptes'}
                          </span>
                        </div>

                        {/* Plan Name & Monthly Price */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-7">
                            <label
                              htmlFor={`admin-plan-name-${plan.id}`}
                              className="block text-[11px] font-semibold text-slate-400 mb-1"
                            >
                              {isRu ? 'Название тарифа' : 'Nom du forfait'}
                            </label>
                            <input
                              id={`admin-plan-name-${plan.id}`}
                              data-testid={`admin-plan-name-${plan.id}`}
                              type="text"
                              value={plan.name}
                              onChange={(e) =>
                                updatePlanDraft(plan.id, (curr) => ({
                                  ...curr,
                                  name: e.target.value,
                                }))
                              }
                              className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl px-3 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <div className="sm:col-span-5">
                            <label
                              htmlFor={`admin-plan-price-${plan.id}`}
                              className="block text-[11px] font-semibold text-slate-400 mb-1"
                            >
                              {isRu ? 'Цена (€ / мес)' : 'Prix (€ / mois)'}
                            </label>
                            <input
                              id={`admin-plan-price-${plan.id}`}
                              data-testid={`admin-plan-price-${plan.id}`}
                              type="number"
                              min={0}
                              step="1"
                              value={plan.priceMonthly}
                              onChange={(e) =>
                                updatePlanDraft(plan.id, (curr) => ({
                                  ...curr,
                                  priceMonthly: Math.max(0, Number(e.target.value) || 0),
                                }))
                              }
                              className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl px-3 text-sm font-bold text-white tabular-nums focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>

                        {/* Vehicle Limit + Unlimited Toggle */}
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`admin-plan-limit-${plan.id}`}
                              className="text-[11px] font-semibold text-slate-400"
                            >
                              {isRu ? 'Лимит автомобилей' : 'Limite de véhicules'}
                            </label>
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                data-testid={`admin-plan-unlimited-${plan.id}`}
                                checked={isUnlimited}
                                onChange={(e) =>
                                  handleTogglePlanUnlimited(plan.id, e.target.checked)
                                }
                                className="w-4 h-4 rounded border-slate-700 bg-slate-950 accent-amber-500 cursor-pointer"
                              />
                              <span>{isRu ? 'Безлимит' : 'Illimité'}</span>
                            </label>
                          </div>

                          <input
                            id={`admin-plan-limit-${plan.id}`}
                            data-testid={`admin-plan-limit-${plan.id}`}
                            type="number"
                            min={1}
                            max={9998}
                            disabled={isUnlimited}
                            value={isUnlimited ? '' : (plan.vehicleLimit ?? 5)}
                            placeholder={isUnlimited ? (isRu ? '∞ Безлимит' : '∞ Illimité') : '5'}
                            onChange={(e) => {
                              const parsed = Math.max(1, Math.min(9998, Math.round(Number(e.target.value) || 1)));
                              updatePlanDraft(plan.id, (curr) => ({
                                ...curr,
                                vehicleLimit: parsed,
                              }));
                            }}
                            className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl px-3 text-xs font-bold text-white tabular-nums disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        {/* Popular Badge Switch */}
                        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-200">
                            {isRu ? 'Бейдж «Популярный»' : 'Badge « Populaire »'}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(plan.isPopular)}
                            aria-label={isRu ? `Популярный тариф ${plan.name}` : `Populaire ${plan.name}`}
                            data-testid={`admin-plan-popular-${plan.id}`}
                            onClick={() => handleTogglePlanPopular(plan.id)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                              plan.isPopular ? 'bg-amber-500' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                                plan.isPopular ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Plan Feature Module Toggles */}
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          <p className="text-[11px] font-semibold text-slate-400">
                            {isRu ? 'Доступные функции тарифа' : 'Modules inclus dans le forfait'}
                          </p>
                          <div className="space-y-1.5">
                            {moduleToggleDefs.map((mod) => {
                              const checked = Boolean(modules[mod.key]);
                              return (
                                <label
                                  key={mod.key}
                                  className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer select-none transition"
                                >
                                  <span className="text-xs text-slate-200">
                                    {isRu ? mod.labelRu : mod.labelFr}
                                  </span>
                                  <input
                                    type="checkbox"
                                    data-testid={`admin-plan-module-${plan.id}-${mod.key}`}
                                    checked={checked}
                                    onChange={() => handleTogglePlanModule(plan.id, mod.key)}
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 accent-amber-500 cursor-pointer shrink-0"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Editable Client Benefit Bullet List */}
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-400">
                              {isRu
                                ? `Список преимуществ (${planFeaturesLang.toUpperCase()})`
                                : `Points affichés (${planFeaturesLang.toUpperCase()})`}
                            </span>
                            <button
                              type="button"
                              data-testid={`admin-plan-add-feature-${plan.id}`}
                              onClick={() => handleAddPlanFeature(plan.id, featuresFieldKey)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{isRu ? 'Добавить пункт' : 'Ajouter'}</span>
                            </button>
                          </div>

                          <div className="space-y-2">
                            {featuresList.map((feat, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  data-testid={`admin-plan-feature-${plan.id}-${idx}`}
                                  aria-label={`${plan.name} feature ${idx + 1}`}
                                  value={feat}
                                  onChange={(e) =>
                                    handleUpdatePlanFeature(
                                      plan.id,
                                      featuresFieldKey,
                                      idx,
                                      e.target.value
                                    )
                                  }
                                  className="flex-1 min-w-0 h-8 bg-slate-950 border border-slate-800 rounded-lg px-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                                />
                                <button
                                  type="button"
                                  data-testid={`admin-plan-remove-feature-${plan.id}-${idx}`}
                                  aria-label={isRu ? 'Удалить пункт' : 'Supprimer'}
                                  onClick={() =>
                                    handleRemovePlanFeature(plan.id, featuresFieldKey, idx)
                                  }
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition shrink-0 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            {featuresList.length === 0 && (
                              <p className="text-[11px] text-slate-500">
                                {isRu
                                  ? 'Нет добавленных пунктов — нажмите «Добавить пункт».'
                                  : 'Aucun point — cliquez sur « Ajouter ».'}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Payment Statuses & Live MRR */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-white">
                    {isRu ? 'Статусы платежей' : 'Journal des paiements'}
                  </h2>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">
                    MRR: {formatEuro(metrics.monthlyRevenueMRR)}
                  </span>
                </div>
                <div className="divide-y divide-slate-800 text-xs">
                  {accounts.map((acc) => {
                    const matchedPlan = plans.find((p) => p.id === acc.planId);
                    return (
                      <div
                        key={acc.uid}
                        className="py-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <span className="font-semibold text-white">{acc.garageName || acc.displayName || acc.email}</span>
                          <span className="text-slate-400 ml-2">
                            ({matchedPlan?.name || acc.planId})
                          </span>
                        </div>
                        <div className="flex items-center gap-3 tabular-nums">
                          <span className="font-bold text-white">{formatEuro(acc.mrrAmount)}</span>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                              acc.subscriptionStatus === 'active'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : acc.subscriptionStatus === 'trial'
                                ? 'bg-sky-500/15 text-sky-400'
                                : 'bg-red-500/15 text-red-400'
                            }`}
                          >
                            {acc.subscriptionStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 5. TEMPLATE & CERFA 15776*02 CONFIGURATOR (Firestore platform_settings/cerfa_templates) */}
        {activeTab === 'cerfa' && (() => {
          const currentOffsets = cerfaCalibrationDraft.cerfa_15776_02.offsets;
          const activeFieldValues = getCerfa15776FieldAtPath(
            cerfaCalibrationDraft.cerfa_15776_02.config,
            selectedCerfa15776Path
          );

          const updateCurrentOffsets = (
            patch: Partial<CerfaTemplatesCalibrationPayload['cerfa_15776_02']['offsets']>
          ) => {
            setCerfaCalibrationDraft((prev) => ({
              ...prev,
              cerfa_15776_02: {
                ...prev.cerfa_15776_02,
                offsets: {
                  ...prev.cerfa_15776_02.offsets,
                  ...patch,
                },
              },
            }));
          };

          const updateSelectedFieldCoords = (
            patch: Partial<{ x: number; y: number; size: number; stepX: number }>
          ) => {
            setCerfaCalibrationDraft((prev) => ({
              ...prev,
              cerfa_15776_02: {
                ...prev.cerfa_15776_02,
                config: updateCerfa15776FieldAtPath(
                  prev.cerfa_15776_02.config,
                  selectedCerfa15776Path,
                  patch
                ),
              },
            }));
          };

          const nudgeSelectedField = (axis: 'x' | 'y', delta: number) => {
            if (!activeFieldValues) return;
            const nextVal = Math.round((activeFieldValues[axis] + delta) * 10) / 10;
            updateSelectedFieldCoords({ [axis]: nextVal });
          };

          const sections15776 = Array.from(new Set(CERFA_ALIGNER_FIELDS.map((f) => f.section)));

          return (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold text-white">
                      {isRu ? 'Калибровка бланка Cerfa 15776*02' : 'Calibration du modèle Cerfa 15776*02'}
                    </h1>
                    <span
                      data-testid="admin-cerfa-dummy-badge"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>
                        {isRu
                          ? '100% тестовых данных • без привязки к гаражу'
                          : 'Données de test complètes • indépendant du stock'}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {isRu
                      ? 'Облачная калибровка координат полей (x, y, шрифт) с подсветкой выбранного поля на живом бланке (platform_settings/cerfa_templates)'
                      : 'Calibration cloud des coordonnées (x, y, police) avec surbrillance du champ sélectionné (platform_settings/cerfa_templates)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAlignerMode}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition self-start"
                >
                  <Sliders className="w-4 h-4" />
                  <span>{isRu ? 'Открыть Aligner Mode' : 'Ouvrir Aligner Mode'}</span>
                </button>
              </div>

              {/* Active Official Template Banner */}
              <div
                data-testid="admin-cerfa-tpl-cerfa_15776_02"
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border bg-amber-500/10 border-amber-500/50 text-white"
              >
                <div>
                  <p className="text-sm font-bold text-amber-400">
                    Cerfa N° 15776*02 — {isRu ? 'Акт передачи ТС (Certificat de cession)' : 'Certificat de cession d’un véhicule d’occasion'}
                  </p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {isRu
                      ? 'Единый поддерживаемый правительственный шаблон PDF (экземпляры 1 и 2)'
                      : 'Modèle gouvernemental officiel actif (Exemplaires 1 & 2)'}
                  </p>
                </div>
              </div>

              {/* Calibration Controls (Left) + Live Highlighted Preview Sheet (Right) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                <div className="xl:col-span-5 space-y-4">
                  {/* Global Offsets Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-white">
                        {isRu ? 'Глобальные смещения шаблона' : 'Décalages globaux du modèle'}
                      </h2>
                      <button
                        type="button"
                        data-testid="admin-cerfa-reset-tpl-btn"
                        onClick={handleResetSelectedCerfaTemplate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{isRu ? 'Сбросить шаблон' : 'Réinitialiser modèle'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="admin-cerfa-offset-x"
                          className="block text-[11px] font-semibold text-slate-300 mb-1"
                        >
                          {isRu ? 'Смещение X' : 'Décalage X'}
                        </label>
                        <input
                          id="admin-cerfa-offset-x"
                          data-testid="admin-cerfa-offset-x"
                          type="number"
                          step="0.5"
                          value={currentOffsets.offsetX}
                          onChange={(e) =>
                            updateCurrentOffsets({ offsetX: Number(e.target.value) || 0 })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white tabular-nums"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="admin-cerfa-offset-y"
                          className="block text-[11px] font-semibold text-slate-300 mb-1"
                        >
                          {isRu ? 'Смещение Y' : 'Décalage Y'}
                        </label>
                        <input
                          id="admin-cerfa-offset-y"
                          data-testid="admin-cerfa-offset-y"
                          type="number"
                          step="0.5"
                          value={currentOffsets.offsetY}
                          onChange={(e) =>
                            updateCurrentOffsets({ offsetY: Number(e.target.value) || 0 })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white tabular-nums"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="admin-cerfa-font-delta"
                          className="block text-[11px] font-semibold text-slate-300 mb-1"
                        >
                          {isRu ? 'Шрифт Δ' : 'Police Δ'}
                        </label>
                        <input
                          id="admin-cerfa-font-delta"
                          data-testid="admin-cerfa-font-delta"
                          type="number"
                          step="0.5"
                          value={currentOffsets.fontSizeDelta}
                          onChange={(e) =>
                            updateCurrentOffsets({ fontSizeDelta: Number(e.target.value) || 0 })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Per-Field Coordinate Calibration Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                    <div>
                      <h2 className="text-sm font-bold text-white">
                        {isRu
                          ? 'Точная калибровка координат поля (pt)'
                          : 'Calibration précise des coordonnées (pt)'}
                      </h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isRu
                          ? 'Выбранное поле подсвечивается янтарно-красной рамкой на бланке справа'
                          : 'Le champ actif est surligné en ambre/rouge sur l’aperçu à droite'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="admin-cerfa-field-select"
                          className="block text-xs font-semibold text-slate-300 mb-1.5"
                        >
                          {isRu ? 'Поле документа' : 'Champ du document'}
                        </label>
                        <select
                          id="admin-cerfa-field-select"
                          data-testid="admin-cerfa-field-select"
                          value={selectedCerfa15776Path}
                          onChange={(e) => setSelectedCerfa15776Path(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                        >
                          {sections15776.map((sec) => (
                            <optgroup key={sec} label={sec}>
                              {CERFA_ALIGNER_FIELDS.filter((f) => f.section === sec).map((f) => (
                                <option key={f.path} value={f.path}>
                                  {f.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      {activeFieldValues && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div>
                            <label
                              htmlFor="admin-cerfa-field-x"
                              className="block text-[11px] font-semibold text-slate-400 mb-1"
                            >
                              X (pt)
                            </label>
                            <input
                              id="admin-cerfa-field-x"
                              data-testid="admin-cerfa-field-x"
                              type="number"
                              step="0.5"
                              value={activeFieldValues.x}
                              onChange={(e) =>
                                updateSelectedFieldCoords({ x: Number(e.target.value) || 0 })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-amber-400 tabular-nums"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="admin-cerfa-field-y"
                              className="block text-[11px] font-semibold text-slate-400 mb-1"
                            >
                              Y (pt)
                            </label>
                            <input
                              id="admin-cerfa-field-y"
                              data-testid="admin-cerfa-field-y"
                              type="number"
                              step="0.5"
                              value={activeFieldValues.y}
                              onChange={(e) =>
                                updateSelectedFieldCoords({ y: Number(e.target.value) || 0 })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-sky-400 tabular-nums"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="admin-cerfa-field-size"
                              className="block text-[11px] font-semibold text-slate-400 mb-1"
                            >
                              {isRu ? 'Шрифт (pt)' : 'Taille (pt)'}
                            </label>
                            <input
                              id="admin-cerfa-field-size"
                              data-testid="admin-cerfa-field-size"
                              type="number"
                              step="0.5"
                              min={4}
                              max={20}
                              value={activeFieldValues.size}
                              onChange={(e) =>
                                updateSelectedFieldCoords({
                                  size: Math.max(4, Number(e.target.value) || 8),
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-white tabular-nums"
                            />
                          </div>

                          {typeof activeFieldValues.stepX === 'number' && (
                            <div>
                              <label
                                htmlFor="admin-cerfa-field-stepx"
                                className="block text-[11px] font-semibold text-slate-400 mb-1"
                              >
                                stepX (pt)
                              </label>
                              <input
                                id="admin-cerfa-field-stepx"
                                data-testid="admin-cerfa-field-stepx"
                                type="number"
                                step="0.1"
                                min={4}
                                max={30}
                                value={activeFieldValues.stepX}
                                onChange={(e) =>
                                  updateSelectedFieldCoords({
                                    stepX: Math.max(4, Number(e.target.value) || 12),
                                  })
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-white tabular-nums"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {activeFieldValues && (
                      <div className="space-y-2 pt-1">
                        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-400">
                            {isRu ? 'Сдвиг X:' : 'Ajuster X :'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {[-5, -1, 1, 5].map((delta) => (
                              <button
                                key={`admin-x-${delta}`}
                                type="button"
                                onClick={() => nudgeSelectedField('x', delta)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                              >
                                {delta > 0 ? `+${delta}` : delta}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-400">
                            {isRu ? 'Сдвиг Y:' : 'Ajuster Y :'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {[-5, -1, 1, 5].map((delta) => (
                              <button
                                key={`admin-y-${delta}`}
                                type="button"
                                onClick={() => nudgeSelectedField('y', delta)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                              >
                                {delta > 0 ? `+${delta}` : delta}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <div className="text-[11px] text-slate-400">
                        <span>Firestore: </span>
                        <code className="text-slate-300 font-mono">platform_settings/cerfa_templates</code>
                        {cerfaCalibrationDraft.updatedAtIso && (
                          <span className="ml-2 text-slate-500">
                            · {cerfaCalibrationDraft.updatedAtIso.slice(0, 19).replace('T', ' ')}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        data-testid="admin-cerfa-save-btn"
                        disabled={isSavingCerfa}
                        onClick={handleSaveCerfaCalibration}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 transition shadow-sm"
                      >
                        {isSavingCerfa ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>{isRu ? 'Сохранить' : 'Enregistrer'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Live PDF Preview with Full Dummy Test Data & Highlighted Selected Field */}
                <div className="xl:col-span-7">
                  <CerfaLivePreviewSheet
                    title="Живой предпросмотр Cerfa N° 15776*02"
                    activeFieldLabel={activeCerfaPreviewLabel}
                    generatePdfBytes={generateAdminCerfaPreviewBytes}
                    dependencyKey={adminCerfaPreviewDepKey}
                    testIdPrefix="admin-cerfa"
                    heightClassName="h-[680px]"
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* 6. EXPENSE CATEGORIES MANAGER */}
        {activeTab === 'expenses' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">
                  {isRu ? 'Управление категориями расходов' : 'Gestion des catégories de dépenses'}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {isRu
                    ? 'Создавайте, переименовывайте, настраивайте иконки, суммы по умолчанию и порядок отображения (/system_config/expenses)'
                    : 'Créez, renommez et ordonnez les catégories globales de dépenses (/system_config/expenses)'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetCategories}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isRu ? 'Сбросить по умолчанию' : 'Réinitialiser'}</span>
              </button>
            </div>

            {/* Create / Edit Category Form */}
            <form
              onSubmit={handleSaveCategory}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">
                  {editingCategoryId
                    ? isRu
                      ? 'Редактировать категорию'
                      : 'Modifier la catégorie'
                    : isRu
                    ? 'Добавить новую категорию'
                    : 'Ajouter une nouvelle catégorie'}
                </h2>
                {editingCategoryId && (
                  <button
                    type="button"
                    onClick={resetCategoryForm}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    {isRu ? 'Отмена' : 'Annuler'}
                  </button>
                )}
              </div>

              {/* Multilingual Labels: FR, RU, HY, KA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Название (FR) *' : 'Nom (FR) *'}
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="admin-cat-fr-input"
                    value={catFormFr}
                    onChange={(e) => setCatFormFr(e.target.value)}
                    placeholder="ex. Expertise / Diagnostic"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Название (RU) *' : 'Nom (RU) *'}
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="admin-cat-ru-input"
                    value={catFormRu}
                    onChange={(e) => setCatFormRu(e.target.value)}
                    placeholder="напр. Диагностика / Подбор"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Название (HY)' : 'Nom (HY)'}
                  </label>
                  <input
                    type="text"
                    data-testid="admin-cat-hy-input"
                    value={catFormHy}
                    onChange={(e) => setCatFormHy(e.target.value)}
                    placeholder="օր. Ախտորոշում / Պահեստամասեր"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Название (KA)' : 'Nom (KA)'}
                  </label>
                  <input
                    type="text"
                    data-testid="admin-cat-ka-input"
                    value={catFormKa}
                    onChange={(e) => setCatFormKa(e.target.value)}
                    placeholder="მაგ. დიაგნოსტიკა / ნაწილები"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Optional ID, Default Amount & Live Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'ID категории (опционально)' : 'ID catégorie (optionnel)'}
                  </label>
                  <input
                    type="text"
                    data-testid="admin-cat-id-input"
                    disabled={Boolean(editingCategoryId)}
                    maxLength={64}
                    value={catFormId}
                    onChange={(e) => {
                      setCatFormId(e.target.value);
                      if (catFormError) setCatFormError(null);
                    }}
                    placeholder={
                      isRu
                        ? 'Авто из названия (напр. diagnostic_auto)'
                        : 'Auto depuis le nom (ex. diagnostic_auto)'
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    {editingCategoryId
                      ? isRu
                        ? 'ID существующей категории фиксирован'
                        : 'ID verrouillé après création'
                      : catFormId.trim()
                      ? `${isRu ? 'Будет сохранён' : 'ID normalisé'}: ${normalizeExpenseCategorySlug(catFormId) || '—'}`
                      : isRu
                      ? 'Латиница, цифры, _ или - (1–64 симв.)'
                      : 'Lettres, chiffres, _ ou - (1–64 car.)'}
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Сумма по умолчанию (€)' : 'Montant par défaut (€)'}
                  </label>
                  <input
                    type="number"
                    data-testid="admin-cat-default-amount-input"
                    min={0}
                    value={catFormDefaultAmount}
                    onChange={(e) => setCatFormDefaultAmount(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Live Category Preview */}
                <div>
                  <span className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Предпросмотр' : 'Aperçu en direct'}
                  </span>
                  <div
                    data-testid="admin-cat-live-preview"
                    className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 min-h-[34px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                        {renderExpenseCategoryIcon(catFormIcon, 'w-3.5 h-3.5')}
                      </span>
                      <span className="text-xs font-semibold text-white truncate">
                        {(isRu ? catFormRu : catFormFr) ||
                          catFormFr ||
                          catFormRu ||
                          (isRu ? 'Новая категория' : 'Nouvelle catégorie')}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-amber-400 shrink-0">
                      {catFormIcon}
                    </span>
                  </div>
                </div>
              </div>

              {/* Visual Icon Grid Selector */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {isRu ? 'Иконка категории' : 'Icône de la catégorie'}
                  </label>
                  <span className="text-[11px] font-mono text-amber-400" data-testid="admin-cat-selected-icon">
                    {catFormIcon}
                  </span>
                </div>
                <div
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2"
                  role="radiogroup"
                  aria-label={isRu ? 'Иконка категории' : 'Icône de la catégorie'}
                >
                  {EXPENSE_CATEGORY_ICON_OPTIONS.map((opt) => {
                    const isSelected = catFormIcon === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-testid={`admin-cat-icon-${opt.id}`}
                        onClick={() => setCatFormIcon(opt.id)}
                        title={isRu ? opt.labelRu : opt.labelFr}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-amber-400'
                          }`}
                        >
                          {renderExpenseCategoryIcon(opt.id, 'w-3.5 h-3.5')}
                        </span>
                        <div className="min-w-0 leading-tight">
                          <div className="text-[11px] font-mono font-semibold truncate">{opt.id}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {isRu ? opt.labelRu : opt.labelFr}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {catFormError && (
                <div
                  data-testid="admin-cat-error"
                  className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 font-medium"
                >
                  {catFormError}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  data-testid="admin-cat-submit-btn"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {editingCategoryId
                      ? isRu
                        ? 'Сохранить изменения'
                        : 'Mettre à jour'
                      : isRu
                      ? 'Создать категорию'
                      : 'Créer la catégorie'}
                  </span>
                </button>
              </div>
            </form>

            {/* Categories List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">{isRu ? 'Название (FR)' : 'Nom (FR)'}</th>
                    <th className="py-3 px-4">{isRu ? 'Название (RU)' : 'Nom (RU)'}</th>
                    <th className="py-3 px-4">{isRu ? 'Название (HY)' : 'Nom (HY)'}</th>
                    <th className="py-3 px-4">{isRu ? 'Название (KA)' : 'Nom (KA)'}</th>
                    <th className="py-3 px-4">{isRu ? 'Иконка' : 'Icône'}</th>
                    <th className="py-3 px-4 text-right">{isRu ? 'По умолч.' : 'Défaut'}</th>
                    <th className="py-3 px-4 text-right">{isRu ? 'Действия' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {expenseCategories.map((cat, idx) => (
                    <tr key={cat.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-4 tabular-nums text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">{cat.id}</td>
                      <td className="py-2.5 px-4 font-semibold text-white">{cat.labelFr}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-200">{cat.labelRu}</td>
                      <td className="py-2.5 px-4 text-slate-300">{cat.labelHy || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-300">{cat.labelKa || '—'}</td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1.5 text-amber-400 font-mono text-[11px]">
                          {renderExpenseCategoryIcon(cat.icon, 'w-3.5 h-3.5')}
                          <span>{cat.icon}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-200">
                        {formatEuro(cat.defaultAmount || 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveCategory(idx, -1)}
                            title={isRu ? 'Выше' : 'Monter'}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === expenseCategories.length - 1}
                            onClick={() => handleMoveCategory(idx, 1)}
                            title={isRu ? 'Ниже' : 'Descendre'}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditCategory(cat)}
                            title={isRu ? 'Редактировать' : 'Modifier'}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            title={isRu ? 'Удалить' : 'Supprimer'}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-red-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. GLOBAL FEATURE FLAGS & FUNCTION SWITCHES */}
        {activeTab === 'features' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">
                  {isRu ? 'Управление функциями (Feature Controls)' : 'Contrôle Global des Fonctions'}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {isRu
                    ? 'Мгновенное включение/отключение модулей для всех пользователей платформы (platform_settings/feature_flags)'
                    : 'Activation ou désactivation instantanée des modules pour tous les utilisateurs (platform_settings/feature_flags)'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start">
                <button
                  type="button"
                  onClick={handleResetFeatureFlags}
                  disabled={isSavingFeatureFlags}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-60"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Включить все' : 'Tout activer'}</span>
                </button>
                <button
                  type="button"
                  data-testid="admin-save-feature-flags-btn"
                  onClick={handleSaveFeatureFlags}
                  disabled={isSavingFeatureFlags}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition disabled:opacity-60"
                >
                  {isSavingFeatureFlags ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{isRu ? 'Сохранить изменения' : 'Enregistrer'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  {
                    key: 'multiGarage',
                    titleRu: 'Multi-garage / Мультигараж и переключатель пространств',
                    titleFr: 'Multi-Garage & Sélecteur d’espaces de travail',
                    descRu: 'При отключении скрывает «+ Создать новый гараж» и «РАБОЧИЙ ГАРАЖ», автоматически загружая основной гараж пользователя.',
                    descFr: 'Masque la création/sélection multi-garages et charge directement le garage principal.',
                  },
                  {
                    key: 'expenseAnalytics',
                    titleRu: 'Аналитика и P&L (графики и разбивка расходов)',
                    titleFr: 'Analytique détaillée & Graphiques P&L',
                    descRu: 'Скрывает раздел «Аналитика и P&L» в боковом меню и блокирует прямой доступ к графикам.',
                    descFr: 'Masque l’onglet « Analytique & P&L » et bloque l’accès au module.',
                  },
                  {
                    key: 'suppliersModule',
                    titleRu: 'Поставщики и закупки',
                    titleFr: 'Fournisseurs & Achats',
                    descRu: 'Скрывает раздел «Поставщики и закупки» в боковом меню и блокирует доступ к модулю.',
                    descFr: 'Masque l’onglet « Fournisseurs & Achats » et bloque l’accès au module.',
                  },
                  {
                    key: 'documentsModule',
                    titleRu: 'Документы (хранилище досье и файлов)',
                    titleFr: 'Documents (Coffre-fort documentaire)',
                    descRu: 'Скрывает раздел «Документы» в боковом меню и блокирует доступ к хранилищу документов.',
                    descFr: 'Masque l’onglet « Documents » et bloque l’accès au coffre-fort.',
                  },
                  {
                    key: 'cerfaGenerator',
                    titleRu: 'Документы Cerfa 15776*02 и Aligner Mode',
                    titleFr: 'Générateur Cerfa 15776*02 & Aligner Mode',
                    descRu: 'Скрывает генерацию и кнопки Cerfa в карточке автомобиля и разделе Документы.',
                    descFr: 'Masque le bouton Cerfa dans les fiches véhicules et Documents.',
                  },
                  {
                    key: 'exportsBackup',
                    titleRu: 'Экспорт и Бэкап (CSV / Excel / Factur-X / Снимки)',
                    titleFr: 'Exports & Sauvegardes (CSV / Excel / Factur-X)',
                    descRu: 'Скрывает раздел «Экспорт и Бэкап» в боковом меню и блокирует доступ к модулю.',
                    descFr: 'Masque l’onglet « Exports & Sauvegardes » et bloque l’accès au module.',
                  },
                  {
                    key: 'pnlCalculator',
                    titleRu: 'Калькулятор маржи P&L в карточках и досье',
                    titleFr: 'Calculateur P&L & Rentabilité en temps réel',
                    descRu: 'Скрывает общую маржу в шапке, блоки прибыли на карточках и P&L баннер в досье.',
                    descFr: 'Masque la marge globale, les blocs P&L sur les cartes et le bandeau P&L.',
                  },
                  {
                    key: 'repairChecklist',
                    titleRu: 'Чек-лист ремонта и задач сервиса',
                    titleFr: 'Checklist Réparations & Travaux Atelier',
                    descRu: 'Скрывает вкладку «Ремонт и чек-лист» и виджет прогресса ремонта в досье.',
                    descFr: 'Masque l’onglet « Travaux & Réparations » et le widget d’avancement.',
                  },
                ] as const
              ).map((item) => {
                const enabled = featureFlags[item.key];
                return (
                  <div
                    key={item.key}
                    className={`bg-slate-900 border rounded-2xl p-5 flex items-start justify-between gap-4 transition ${
                      enabled ? 'border-slate-800' : 'border-red-500/30 bg-slate-900/60'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-white">
                          {isRu ? item.titleRu : item.titleFr}
                        </h2>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            enabled
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {enabled ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {isRu ? item.descRu : item.descFr}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={isRu ? item.titleRu : item.titleFr}
                      onClick={() => handleToggleFeatureFlag(item.key)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                        enabled ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                          enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* GLOBAL FRENCH TAX ENGINE DEFAULTS (/settings/tax_defaults) */}
            <div
              data-testid="admin-french-tax-defaults"
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    {pickLocalized(lang, {
                      fr: 'Barèmes fiscaux France par défaut (Particulier / Micro-entrepreneur)',
                      ru: 'Налоговые настройки Франции по умолчанию (Particulier / Micro-entrepreneur)',
                      hy: 'Ֆրանսիայի հարկային լռելյայն չափանիշներ (Particulier / Micro-entrepreneur)',
                      ka: 'საფრანგეთის ნაგულისხმევი საგადასახადო განაკვეთები (Particulier / Micro-entrepreneur)',
                    })}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {pickLocalized(lang, {
                      fr: 'Valeurs par défaut globales pour les nouveaux espaces et l’estimation fiscale (/settings/tax_defaults)',
                      ru: 'Глобальные значения по умолчанию для новых профилей и оценочного расчёта (/settings/tax_defaults)',
                      hy: 'Գլոբալ լռելյայն արժեքներ նոր պրոֆիլների և հաշվարկային մոդելի համար (/settings/tax_defaults)',
                      ka: 'გლობალური ნაგულისხმევი პარამეტრები ახალი პროფილებისა და შეფასებითი მოდელისთვის (/settings/tax_defaults)',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleResetTaxDefaults}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {pickLocalized(lang, {
                        fr: 'Réinitialiser',
                        ru: 'Сброс',
                        hy: 'Վերականգնել',
                        ka: 'განულება',
                      })}
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid="admin-save-tax-defaults-btn"
                    onClick={handleSaveTaxDefaults}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {pickLocalized(lang, {
                        fr: 'Enregistrer barèmes',
                        ru: 'Сохранить тарифы',
                        hy: 'Պահպանել դրույքները',
                        ka: 'განაკვეთების შენახვა',
                      })}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {pickLocalized(lang, {
                      fr: 'Profil par défaut',
                      ru: 'Профиль по умолчанию',
                      hy: 'Լռելյայն պրոֆիլ',
                      ka: 'ნაგულისხმევი პროფილი',
                    })}
                  </label>
                  <ThemedSelect<LegalStatus>
                    testId="admin-tax-legal-status"
                    ariaLabel={pickLocalized(lang, {
                      fr: 'Profil par défaut',
                      ru: 'Профиль по умолчанию',
                      hy: 'Լռելյայն պրոֆիլ',
                      ka: 'ნაგულისხმევი პროფილი',
                    })}
                    value={taxDefaultsDraft.legalStatus === 'particulier' ? 'particulier' : 'micro_entreprise'}
                    onChange={(val) => {
                      const isPart = val === 'particulier';
                      const fresh = createDefaultFrenchTaxConfig(isPart ? 'particulier' : 'micro_entreprise');
                      setTaxDefaultsDraft((prev) => ({
                        ...prev,
                        legalStatus: isPart ? 'particulier' : 'micro_entreprise',
                        businessTaxRegime: isPart ? 'none' : 'micro',
                        socialContributionRate: isPart
                          ? 0
                          : prev.socialContributionRate > 0
                          ? prev.socialContributionRate
                          : fresh.socialContributionRate,
                        versementLiberatoireEnabled: isPart ? false : true,
                        versementLiberatoireRate: isPart
                          ? 0
                          : prev.versementLiberatoireRate > 0
                          ? prev.versementLiberatoireRate
                          : fresh.versementLiberatoireRate,
                        microBicAbattementPercent: isPart
                          ? 0
                          : prev.microBicAbattementPercent > 0
                          ? prev.microBicAbattementPercent
                          : fresh.microBicAbattementPercent,
                        microBicIncomeTaxRate: isPart
                          ? 0
                          : prev.microBicIncomeTaxRate > 0
                          ? prev.microBicIncomeTaxRate
                          : fresh.microBicIncomeTaxRate,
                        vatRegime: 'franchise_base',
                        vatRatePercent: 0,
                      }));
                    }}
                    options={[
                      {
                        value: 'micro_entreprise',
                        label: 'Micro-entrepreneur (Achat / Revente)',
                      },
                      {
                        value: 'particulier',
                        label: pickLocalized(lang, {
                          fr: 'Particulier (Vente privée)',
                          ru: 'Particulier (Частное лицо)',
                          hy: 'Particulier (Անհատ)',
                          ka: 'Particulier (ფიზიკური პირი)',
                        }),
                      },
                    ]}
                    triggerClassName="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                  />
                </div>

                {taxDefaultsDraft.legalStatus !== 'particulier' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-400">
                        URSSAF Micro (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        value={taxDefaultsDraft.socialContributionRate}
                        onChange={(e) =>
                          setTaxDefaultsDraft((prev) => ({
                            ...prev,
                            socialContributionRate: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white tabular-nums"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-400">
                        Versement libératoire (%)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setTaxDefaultsDraft((prev) => ({
                              ...prev,
                              versementLiberatoireEnabled: !prev.versementLiberatoireEnabled,
                            }))
                          }
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                            taxDefaultsDraft.versementLiberatoireEnabled
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-slate-950 text-slate-400 border-slate-700'
                          }`}
                        >
                          {taxDefaultsDraft.versementLiberatoireEnabled ? 'YES' : 'NO'}
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={taxDefaultsDraft.versementLiberatoireRate}
                          onChange={(e) =>
                            setTaxDefaultsDraft((prev) => ({
                              ...prev,
                              versementLiberatoireRate: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white tabular-nums"
                        />
                      </div>
                    </div>
                  </>
                )}

                {taxDefaultsDraft.legalStatus !== 'micro_entreprise' &&
                taxDefaultsDraft.legalStatus !== 'particulier' ? (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-400">
                      {pickLocalized(lang, {
                        fr: 'Régime TVA par défaut',
                        ru: 'Режим НДС (TVA) по умолчанию',
                        hy: 'ԱԱՀ (TVA) լռելյայն ռեժիմ',
                        ka: 'დღგ-ს (TVA) ნაგულისხმევი რეჟიმი',
                      })}
                    </label>
                    <ThemedSelect<VatRegime>
                      testId="admin-tax-vat-regime"
                      ariaLabel={pickLocalized(lang, {
                        fr: 'Régime TVA par défaut',
                        ru: 'Режим НДС (TVA) по умолчанию',
                        hy: 'ԱԱՀ (TVA) լռելյայն ռեժիմ',
                        ka: 'დღგ-ს (TVA) ნაგულისხმევი რეჟიმი',
                      })}
                      value={taxDefaultsDraft.vatRegime}
                      onChange={(val) =>
                        setTaxDefaultsDraft((prev) => ({
                          ...prev,
                          vatRegime: val,
                        }))
                      }
                      options={[
                        { value: 'tva_marge', label: 'TVA sur la marge (Art. 297 A)' },
                        { value: 'tva_total', label: 'TVA sur le prix total (20%)' },
                        { value: 'franchise_base', label: 'Franchise en base (0%)' },
                        {
                          value: 'custom',
                          label: pickLocalized(lang, {
                            fr: 'Taux personnalisé (%)',
                            ru: 'Своя ставка (%)',
                            hy: 'Հատուկ դրույք (%)',
                            ka: 'საკუთარი განაკვეთი (%)',
                          }),
                        },
                      ]}
                      triggerClassName="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                ) : taxDefaultsDraft.legalStatus === 'micro_entreprise' ? (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-400">
                      {pickLocalized(lang, {
                        fr: 'TVA par défaut',
                        ru: 'НДС (TVA) по умолчанию',
                        hy: 'ԱԱՀ (TVA) լռելյայն',
                        ka: 'დღგ (TVA) ნაგულისხმევი',
                      })}
                    </label>
                    <div className="w-full px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-semibold text-slate-300">
                      Franchise en base (0% · Art. 293 B)
                    </div>
                  </div>
                ) : (
                  <div className="md:col-span-3 flex items-center rounded-xl bg-blue-500/10 border border-blue-500/25 px-3.5 py-2.5 text-xs text-blue-200">
                    {pickLocalized(lang, {
                      fr: 'Profil Particulier : aucune cotisation URSSAF, aucun Versement libératoire et aucune TVA ne sont appliqués (0 € de taxes).',
                      ru: 'Профиль Particulier: взносы URSSAF, Versement libératoire и НДС полностью отключены (налоги 0 €).',
                      hy: 'Particulier պրոֆիլ․ URSSAF, Versement libératoire և TVA հաշվարկները անջատված են (հարկը՝ 0 €)։',
                      ka: 'Particulier პროფილი: URSSAF, Versement libératoire და TVA სრულად გამორთულია (გადასახადი 0 €).',
                    })}
                  </div>
                )}
              </div>

              {taxDefaultsDraft.legalStatus !== 'particulier' && (
                <>
                  <div className={`grid grid-cols-1 ${
                    taxDefaultsDraft.legalStatus !== 'micro_entreprise'
                      ? 'md:grid-cols-3'
                      : 'md:grid-cols-2'
                  } gap-4`}>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-400">
                        {pickLocalized(lang, {
                          fr: 'Abattement Micro-BIC (%)',
                          ru: 'Вычет Micro-BIC (%)',
                          hy: 'Micro-BIC նվազեցում (%)',
                          ka: 'Micro-BIC გამოქვითვა (%)',
                        })}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="1"
                        value={taxDefaultsDraft.microBicAbattementPercent}
                        onChange={(e) =>
                          setTaxDefaultsDraft((prev) => ({
                            ...prev,
                            microBicAbattementPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white tabular-nums"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-400">
                        {pickLocalized(lang, {
                          fr: 'Taux IR Micro-BIC estimé (%)',
                          ru: 'Оценочный IR Micro-BIC (%)',
                          hy: 'Գնահատված IR Micro-BIC (%)',
                          ka: 'შეფასებითი IR Micro-BIC (%)',
                        })}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        value={taxDefaultsDraft.microBicIncomeTaxRate}
                        onChange={(e) =>
                          setTaxDefaultsDraft((prev) => ({
                            ...prev,
                            microBicIncomeTaxRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white tabular-nums"
                      />
                    </div>

                    {taxDefaultsDraft.legalStatus !== 'micro_entreprise' && (
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-400">
                            {pickLocalized(lang, {
                              fr: 'Taux TVA (%)',
                              ru: 'Ставка НДС / TVA (%)',
                              hy: 'ԱԱՀ / TVA դրույք (%)',
                              ka: 'დღგ / TVA განაკვეთი (%)',
                            })}
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={taxDefaultsDraft.vatRatePercent}
                            onChange={(e) =>
                              setTaxDefaultsDraft((prev) => ({
                                ...prev,
                                vatRatePercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white tabular-nums"
                          />
                        </div>
                      )}
                  </div>

                  <p className="text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5">
                    {t('taxAccountantDisclaimer')}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* 8. COMPREHENSIVE UI & COPYWRITING CUSTOMIZATION STUDIO */}
        {activeTab === 'texts' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">
                  {isRu ? 'Студия UI, макета и текстов' : 'Studio UI, Mise en page & Textes'}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {isRu
                    ? 'Глобальное управление отступами, скруглениями, отчётом продажи и всеми текстами (settings/ui_customization)'
                    : 'Contrôle global des rayons, espacements, fiches véhicules et libellés (settings/ui_customization)'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAllTexts}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Сбросить тексты' : 'Réinitialiser textes'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveUiAndTexts}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition whitespace-nowrap shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Сохранить UI и тексты' : 'Enregistrer UI & Textes'}</span>
                </button>
              </div>
            </div>

            {/* Section A: Vehicle Detail & Sale Ledger Layout Tokens + Live Preview */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-white">
                      {isRu
                        ? 'Токены макета карточки авто и P&L'
                        : 'Tokens de mise en page (Fiche & P&L)'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        cardBorderRadius: DEFAULT_SYSTEM_THEME_CONFIG.cardBorderRadius,
                        buttonBorderRadius: DEFAULT_SYSTEM_THEME_CONFIG.buttonBorderRadius,
                        cardPadding: DEFAULT_SYSTEM_THEME_CONFIG.cardPadding,
                        sectionGap: DEFAULT_SYSTEM_THEME_CONFIG.sectionGap,
                      }))
                    }
                    className="text-[11px] font-semibold text-slate-400 hover:text-amber-400 transition"
                  >
                    {isRu ? 'Сбросить макет' : 'Réinitialiser layout'}
                  </button>
                </div>

                {/* Card Radius */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {isRu ? 'Скругление карточек (--ag-card-radius)' : 'Rayon des cartes (--ag-card-radius)'}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['6px', '12px', '16px', '24px'] as const).map((r) => {
                      const active = draftConfig.cardBorderRadius === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() =>
                            setDraftConfig((prev) => ({ ...prev, cardBorderRadius: r }))
                          }
                          className={`py-2 px-2 rounded-lg text-xs font-bold border transition ${
                            active
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Button Radius */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {isRu ? 'Скругление кнопок и вкладок (--ag-button-radius)' : 'Rayon des boutons & onglets (--ag-button-radius)'}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['6px', '10px', '12px', '16px'] as ButtonBorderRadius[]).map((r) => {
                      const active = (draftConfig.buttonBorderRadius || '12px') === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() =>
                            setDraftConfig((prev) => ({ ...prev, buttonBorderRadius: r }))
                          }
                          className={`py-2 px-2 rounded-lg text-xs font-bold border transition ${
                            active
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Card Padding Density */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {isRu ? 'Внутренние отступы карточек (--ag-card-padding)' : 'Marge interne des cartes (--ag-card-padding)'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'compact', labelFr: 'Compact', labelRu: 'Компакт' },
                        { id: 'comfortable', labelFr: 'Confort', labelRu: 'Стандарт' },
                        { id: 'spacious', labelFr: 'Spacieux', labelRu: 'Просторно' },
                      ] as { id: CardPaddingDensity; labelFr: string; labelRu: string }[]
                    ).map((opt) => {
                      const active = (draftConfig.cardPadding || 'comfortable') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setDraftConfig((prev) => ({ ...prev, cardPadding: opt.id }))
                          }
                          className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition ${
                            active
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {isRu ? opt.labelRu : opt.labelFr} ({CARD_PADDING_VALUES[opt.id]})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section Gap */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {isRu ? 'Интервал между секциями (--ag-section-gap)' : 'Espacement des sections (--ag-section-gap)'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['16px', '24px', '32px'] as SectionGapSize[]).map((gap) => {
                      const active = (draftConfig.sectionGap || '24px') === gap;
                      return (
                        <button
                          key={gap}
                          type="button"
                          onClick={() =>
                            setDraftConfig((prev) => ({ ...prev, sectionGap: gap }))
                          }
                          className={`py-2 px-2 rounded-lg text-xs font-bold border transition ${
                            active
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {gap}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Section B: Live Preview of Vehicle Detail & Sale Ledger */}
              <div className="xl:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-bold text-white">
                      {isRu ? 'Предпросмотр карточки авто и P&L' : 'Aperçu Fiche Véhicule & P&L'}
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {theme === 'light' ? (isRu ? 'Светлая' : 'Clair') : isRu ? 'Тёмная' : 'Sombre'}
                  </span>
                </div>

                <div
                  className="border border-[var(--border)] bg-[var(--background)] p-4 flex flex-col"
                  style={{
                    borderRadius: draftConfig.cardBorderRadius,
                    gap: draftConfig.sectionGap || '24px',
                  }}
                >
                  <div
                    className="bg-[var(--ag-detail-bg)] border border-[var(--border)] shadow-sm"
                    style={{
                      borderRadius: draftConfig.cardBorderRadius,
                      padding: CARD_PADDING_VALUES[draftConfig.cardPadding || 'comfortable'],
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <span
                        className="text-xs font-bold text-[var(--ag-detail-heading)]"
                        style={
                          resolveLocalizedColor('pnlBannerTitle', textOverrides)
                            ? { color: resolveLocalizedColor('pnlBannerTitle', textOverrides) }
                            : undefined
                        }
                      >
                        {resolveLocalizedLabel(
                          'pnlBannerTitle',
                          lang,
                          translations[lang].pnlBannerTitle,
                          textOverrides
                        )}
                      </span>
                      <span
                        className="px-3 py-1 text-[11px] font-bold bg-[var(--primary)] text-[var(--primary-foreground)]"
                        style={{
                          borderRadius: draftConfig.buttonBorderRadius || '12px',
                          ...(resolveLocalizedColor('recordSaleBtn', textOverrides)
                            ? { color: resolveLocalizedColor('recordSaleBtn', textOverrides) }
                            : {}),
                        }}
                      >
                        {resolveLocalizedLabel(
                          'recordSaleBtn',
                          lang,
                          translations[lang].recordSaleBtn,
                          textOverrides
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2.5 rounded-lg bg-[var(--ag-metric-bg)] border border-[var(--border)]">
                        <div
                          className="text-[10px] text-[var(--muted-foreground)] truncate"
                          style={
                            resolveLocalizedColor('purchasePriceLabel', textOverrides)
                              ? { color: resolveLocalizedColor('purchasePriceLabel', textOverrides) }
                              : undefined
                          }
                        >
                          {resolveLocalizedLabel(
                            'purchasePriceLabel',
                            lang,
                            translations[lang].purchasePriceLabel,
                            textOverrides
                          )}
                        </div>
                        <div className="text-xs font-bold text-[var(--foreground)] tabular-nums mt-0.5">
                          3 000 €
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[var(--ag-metric-bg)] border border-[var(--border)]">
                        <div
                          className="text-[10px] text-[var(--muted-foreground)] truncate"
                          style={
                            resolveLocalizedColor('workshopRepairsLabel', textOverrides)
                              ? { color: resolveLocalizedColor('workshopRepairsLabel', textOverrides) }
                              : undefined
                          }
                        >
                          {resolveLocalizedLabel(
                            'workshopRepairsLabel',
                            lang,
                            translations[lang].workshopRepairsLabel,
                            textOverrides
                          )}
                        </div>
                        <div className="text-xs font-bold text-[var(--foreground)] tabular-nums mt-0.5">
                          500 €
                        </div>
                      </div>
                      <div
                        className="p-2.5 rounded-lg border"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--ag-profit-color) 12%, var(--ag-metric-bg))',
                          borderColor: 'color-mix(in srgb, var(--ag-profit-color) 40%, var(--border))',
                        }}
                      >
                        <div
                          className="text-[10px] truncate font-semibold"
                          style={{
                            color:
                              resolveLocalizedColor('netProfitLabel', textOverrides) ||
                              'var(--ag-profit-color)',
                          }}
                        >
                          {resolveLocalizedLabel(
                            'netProfitLabel',
                            lang,
                            translations[lang].netProfitLabel,
                            textOverrides
                          )}
                        </div>
                        <div
                          className="text-xs font-bold tabular-nums mt-0.5"
                          style={{ color: 'var(--ag-profit-color)' }}
                        >
                          +1 275 €
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mini Sale Ledger Preview */}
                  <div
                    className="bg-[var(--ag-receipt-bg)] border border-[var(--border)]"
                    style={{
                      borderRadius: draftConfig.cardBorderRadius,
                      padding: CARD_PADDING_VALUES[draftConfig.cardPadding || 'comfortable'],
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)] mb-2">
                      <span
                        className="text-[11px] font-bold text-[var(--ag-detail-heading)]"
                        style={
                          resolveLocalizedColor('saleReportTitle', textOverrides)
                            ? { color: resolveLocalizedColor('saleReportTitle', textOverrides) }
                            : undefined
                        }
                      >
                        {resolveLocalizedLabel(
                          'saleReportTitle',
                          lang,
                          translations[lang].saleReportTitle,
                          textOverrides
                        ).includes('{vehicle}')
                          ? resolveLocalizedLabel(
                              'saleReportTitle',
                              lang,
                              translations[lang].saleReportTitle,
                              textOverrides
                            ).replace('{vehicle}', 'Peugeot 207')
                          : `${resolveLocalizedLabel(
                              'saleReportTitle',
                              lang,
                              translations[lang].saleReportTitle,
                              textOverrides
                            )} (Peugeot 207)`}
                      </span>
                      <span
                        className="px-2 py-0.5 text-[10px] font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]"
                        style={{ borderRadius: draftConfig.buttonBorderRadius || '12px' }}
                      >
                        {resolveLocalizedLabel('tabOverview', lang, translations[lang].tabOverview, textOverrides)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span
                        className="text-[var(--foreground)]"
                        style={
                          resolveLocalizedColor('saleReportNetProfit', textOverrides)
                            ? { color: resolveLocalizedColor('saleReportNetProfit', textOverrides) }
                            : undefined
                        }
                      >
                        {resolveLocalizedLabel(
                          'saleReportNetProfit',
                          lang,
                          translations[lang].saleReportNetProfit,
                          textOverrides
                        )}
                      </span>
                      <span className="tabular-nums" style={{ color: 'var(--ag-profit-color)' }}>
                        +1 275 €
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section C: Category Filter Pills & Full Translation Key Table */}
            <div className="flex flex-wrap items-center gap-1.5">
              {TRANSLATION_CATEGORIES.map((cat) => {
                const active = selectedTextCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedTextCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition whitespace-nowrap ${
                      active
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {isRu ? cat.labelRu : cat.labelFr} ({translationCategoryCounts[cat.id]})
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={textSearch}
                  onChange={(e) => setTextSearch(e.target.value)}
                  placeholder={isRu ? 'Поиск по ключу или тексту...' : 'Rechercher une clé ou un texte...'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-400 tabular-nums">
                  {isRu ? `Показано: ${allTranslationKeys.length}` : `Affichés : ${allTranslationKeys.length}`}
                </span>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyModifiedTexts}
                    onChange={(e) => setOnlyModifiedTexts(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                  />
                  <span>{isRu ? 'Только изменённые' : 'Modifiés uniquement'}</span>
                </label>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full table-fixed text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-950 z-10 border-b border-slate-800">
                  <tr className="text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-3 w-40">{isRu ? 'Ключ' : 'Clé'}</th>
                    <th className="py-3 px-3">{isRu ? 'Французский (FR)' : 'Français (FR)'}</th>
                    <th className="py-3 px-3">{isRu ? 'Русский (RU)' : 'Russe (RU)'}</th>
                    <th className="py-3 px-3 w-36">{isRu ? 'Цвет текста' : 'Couleur'}</th>
                    <th className="py-3 px-3 text-right w-14">{isRu ? 'Сброс' : 'Reset'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {allTranslationKeys.map((key) => {
                    const custom = textOverrides[key];
                    const hasCustomColor = Boolean(custom?.color?.trim());
                    const isModified = Boolean(
                      custom?.fr?.trim() || custom?.ru?.trim() || hasCustomColor
                    );
                    const safeColorVal =
                      custom?.color && /^#[0-9a-fA-F]{6}$/.test(custom.color)
                        ? custom.color
                        : '#f8fafc';
                    const catId = getTranslationKeyCategory(key);
                    const catObj = TRANSLATION_CATEGORIES.find((c) => c.id === catId);
                    return (
                      <tr key={key} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 align-top">
                          <div
                            className={`font-mono text-[11px] font-semibold truncate ${
                              isModified ? 'text-amber-400' : 'text-slate-300'
                            }`}
                            title={key}
                          >
                            {key}
                          </div>
                          {catObj && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">
                              {isRu ? catObj.labelRu : catObj.labelFr}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 align-top space-y-1">
                          <input
                            type="text"
                            aria-label={`${key} FR`}
                            value={custom?.fr ?? ''}
                            onChange={(e) => handleTextOverrideChange(key, 'fr', e.target.value)}
                            placeholder={translations.fr[key]}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            style={hasCustomColor ? { color: custom?.color } : undefined}
                          />
                          <div className="text-[10px] text-slate-500 truncate">
                            {translations.fr[key]}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top space-y-1">
                          <input
                            type="text"
                            aria-label={`${key} RU`}
                            value={custom?.ru ?? ''}
                            onChange={(e) => handleTextOverrideChange(key, 'ru', e.target.value)}
                            placeholder={translations.ru[key]}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            style={hasCustomColor ? { color: custom?.color } : undefined}
                          />
                          <div className="text-[10px] text-slate-500 truncate">
                            {translations.ru[key]}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              aria-label={`${key} color`}
                              value={safeColorVal}
                              onChange={(e) =>
                                handleTextOverrideChange(key, 'color', e.target.value)
                              }
                              className="w-7 h-7 rounded-lg bg-transparent border border-slate-700 cursor-pointer p-0.5 shrink-0"
                            />
                            <input
                              type="text"
                              aria-label={`${key} color hex`}
                              value={custom?.color ?? ''}
                              maxLength={9}
                              placeholder="Auto"
                              onChange={(e) =>
                                handleTextOverrideChange(key, 'color', e.target.value)
                              }
                              className="w-[74px] bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-200 placeholder-slate-500 tabular-nums focus:outline-none focus:border-amber-500"
                            />
                            {hasCustomColor && (
                              <button
                                type="button"
                                onClick={() => handleTextOverrideChange(key, 'color', '')}
                                title={isRu ? 'Сбросить цвет' : 'Réinitialiser couleur'}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top text-right">
                          {isModified && (
                            <button
                              type="button"
                              onClick={() => handleResetSingleText(key)}
                              title={isRu ? 'Сбросить' : 'Réinitialiser'}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
