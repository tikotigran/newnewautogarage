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
  cleanGlobalTextOverrides,
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
  getPlanDisplayName,
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
import { Language, pickLocalized } from '../utils/i18nUtils';
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
  const L = <T,>(fr: T, ru: T, hy: T, ka: T): T => pickLocalized(lang, { fr, ru, hy, ka });

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => getSubscriptionPlans());
  const [plansDraft, setPlansDraft] = useState<SubscriptionPlan[]>(() => getSubscriptionPlans());
  const [isPlansDirty, setIsPlansDirty] = useState(false);
  const plansDirtyRef = useRef(false);
  const [isSavingPlans, setIsSavingPlans] = useState(false);
  const [planFeaturesLang, setPlanFeaturesLang] = useState<Language>(() => lang);
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
          textOverrides[k]?.hy?.trim() ||
          textOverrides[k]?.ka?.trim() ||
          textOverrides[k]?.color?.trim()
      );
      if (onlyModifiedTexts && !hasOverride) return false;
      if (!q) return true;
      return (
        k.toLowerCase().includes(q) ||
        translations.fr[k].toLowerCase().includes(q) ||
        translations.ru[k].toLowerCase().includes(q) ||
        translations.hy[k].toLowerCase().includes(q) ||
        translations.ka[k].toLowerCase().includes(q) ||
        (textOverrides[k]?.fr || '').toLowerCase().includes(q) ||
        (textOverrides[k]?.ru || '').toLowerCase().includes(q) ||
        (textOverrides[k]?.hy || '').toLowerCase().includes(q) ||
        (textOverrides[k]?.ka || '').toLowerCase().includes(q)
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
              {L(
                'Accès Restreint (403)',
                'Доступ ограничен (403)',
                'Մուտքը սահմանափակված է (403)',
                'წვდომა შეზღუდულია (403)'
              )}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {L(
                'La section /admin est strictement réservée aux comptes disposant du rôle superadmin.',
                'Раздел /admin доступен только пользователям с ролью superadmin.',
                '/admin բաժինը հասանելի է միայն superadmin դեր ունեցող օգտատերերին։',
                '/admin განყოფილება ხელმისაწვდომია მხოლოდ superadmin როლის მქონე მომხმარებლებისთვის.'
              )}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onSignIn}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {L(
                  'Connexion SuperAdmin',
                  'Войти как SuperAdmin',
                  'Մուտք որպես SuperAdmin',
                  'შესვლა როგორც SuperAdmin'
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={onBackToApp}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>
                {L(
                  'Retour au garage',
                  'Вернуться в гараж',
                  'Վերադառնալ ավտոսրահ',
                  'გარაჟში დაბრუნება'
                )}
              </span>
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

  const cleanTextOverridesMap = (raw: GlobalTextOverrides): GlobalTextOverrides =>
    cleanGlobalTextOverrides(raw);

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
      L(
        'Branding et palettes appliqués globalement',
        'Брендинг и палитра сохранены глобально',
        'Բրենդինգն ու գունապնակը պահպանվեցին գլոբալ',
        'ბრენდინგი და პალიტრა გლობალურად შენახულია'
      )
    );
  };

  const handleResetConfig = async () => {
    const reset = resolveSystemThemeConfig(DEFAULT_SYSTEM_THEME_CONFIG);
    setDraftConfig(reset);
    await handleSaveGlobalConfig(reset);
    showSavedFeedback(
      L(
        'Couleurs réinitialisées par défaut',
        'Сброшено к стандартным цветам',
        'Վերականգնված է լռելյայն գույներով',
        'ნაგულისხმევი ფერები აღდგენილია'
      )
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
    showSavedFeedback(
      L('Forfait mis à jour', 'Тариф обновлён', 'Սակագինը թարմացվել է', 'ტარიფი განახლებულია')
    );
  };

  const handleRoleToggle = async (uid: string, currentRole: UserRole) => {
    const nextRole: UserRole = currentRole === 'superadmin' ? 'user' : 'superadmin';
    await updateUserAccount(uid, { role: nextRole });
    showSavedFeedback(
      L('Rôle mis à jour', 'Роль обновлена', 'Դերը թարմացվել է', 'როლი განახლებულია')
    );
  };

  const handleStatusChange = async (uid: string, subscriptionStatus: SubscriptionStatus) => {
    await updateUserAccount(uid, { subscriptionStatus });
    showSavedFeedback(
      L(
        'Statut de paiement mis à jour',
        'Статус оплаты обновлён',
        'Վճարման կարգավիճակը թարմացվել է',
        'გადახდის სტატუსი განახლებულია'
      )
    );
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

  type PlanFeaturesFieldKey = 'featuresFr' | 'featuresRu' | 'featuresHy' | 'featuresKa';

  const handleUpdatePlanFeature = (
    planId: SubscriptionPlanId,
    fieldKey: PlanFeaturesFieldKey,
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
    fieldKey: PlanFeaturesFieldKey
  ) => {
    updatePlanDraft(planId, (plan) => {
      const current = [...(plan[fieldKey] || [])];
      const defaultLine =
        fieldKey === 'featuresRu'
          ? 'Новая функция тарифа'
          : fieldKey === 'featuresHy'
          ? 'Սակագնի նոր հնարավորություն'
          : fieldKey === 'featuresKa'
          ? 'ტარიფის ახალი ფუნქცია'
          : 'Nouvelle fonctionnalité';
      current.push(defaultLine);
      return { ...plan, [fieldKey]: current };
    });
  };

  const handleRemovePlanFeature = (
    planId: SubscriptionPlanId,
    fieldKey: PlanFeaturesFieldKey,
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
        L(
          'Forfaits et limites enregistrés dans le cloud',
          'Тарифы и лимиты сохранены в облаке',
          'Սակագներն ու սահմանաչափերը պահպանվել են ամպում',
          'ტარიფები და ლიმიტები შენახულია ღრუბელში'
        )
      );
    } catch (err) {
      console.error('Failed to save subscription plans:', err);
      showSavedFeedback(
        L(
          'Erreur lors de la sauvegarde des forfaits',
          'Ошибка сохранения тарифов в Firestore',
          'Սակագները Firestore-ում պահպանելու սխալ',
          'ტარიფების Firestore-ში შენახვის შეცდომა'
        )
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
      L(
        'Réinitialisé — cliquez sur « Enregistrer »',
        'Сброшено к шаблону — нажмите «Сохранить изменения»',
        'Վերականգնված է — սեղմեք «Պահպանել փոփոխությունները»',
        'განულებულია — დააჭირეთ «ცვლილებების შენახვას»'
      )
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
            L(
              `Une catégorie avec l’ID « ${idResolution.id} » existe déjà.`,
              `Категория с ID «${idResolution.id}» уже существует.`,
              `«${idResolution.id}» ID-ով կատեգորիան արդեն գոյություն ունի։`,
              `კატეგორია ID-ით «${idResolution.id}» უკვე არსებობს.`
            )
          );
        } else if (idResolution.error === 'too_long') {
          setCatFormError(
            L(
              'L’ID de la catégorie ne doit pas dépasser 64 caractères.',
              'ID категории не должен превышать 64 символа.',
              'Կատեգորիայի ID-ն չպետք է գերազանցի 64 նիշը։',
              'კატეგორიის ID არ უნდა აღემატებოდეს 64 სიმბოლოს.'
            )
          );
        } else {
          setCatFormError(
            L(
              'L’ID doit contenir uniquement lettres, chiffres, « _ » ou « - » (1–64 caractères).',
              'ID должен содержать латинские буквы, цифры, «_» или «-» (1–64 символа).',
              'ID-ն պետք է պարունակի միայն լատինատառեր, թվեր, «_» կամ «-» (1–64 նիշ)։',
              'ID უნდა შეიცავდეს მხოლოდ ლათინურ ასოებს, ციფრებს, «_» ან «-» (1–64 სიმბოლო).'
            )
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
    showSavedFeedback(
      L(
        'Catégorie enregistrée',
        'Категория сохранена',
        'Կատեգորիան պահպանվել է',
        'კატეგორია შენახულია'
      )
    );
  };

  const handleDeleteCategory = async (id: string) => {
    const next = expenseCategories
      .filter((c) => c.id !== id)
      .map((c, idx) => ({ ...c, order: idx + 1 }));
    setExpenseCategories(next);
    await saveDynamicExpenseCategories(next, currentUserUid);
    if (editingCategoryId === id) resetCategoryForm();
    showSavedFeedback(
      L(
        'Catégorie supprimée',
        'Категория удалена',
        'Կատեգորիան ջնջվել է',
        'კატეგორია წაშლილია'
      )
    );
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
    showSavedFeedback(
      L(
        'Ordre mis à jour',
        'Порядок обновлён',
        'Հերթականությունը թարմացվել է',
        'რიგითობა განახლებულია'
      )
    );
  };

  const handleResetCategories = async () => {
    setExpenseCategories(DEFAULT_DYNAMIC_EXPENSE_CATEGORIES);
    await saveDynamicExpenseCategories(DEFAULT_DYNAMIC_EXPENSE_CATEGORIES, currentUserUid);
    resetCategoryForm();
    showSavedFeedback(
      L(
        'Catégories réinitialisées',
        'Категории сброшены',
        'Կատեգորիաները վերականգնված են',
        'კატეგორიები განულებულია'
      )
    );
  };

  // Feature Flags handlers (persisted globally in platform_settings/feature_flags)
  const persistFeatureFlagsWithFeedback = async (nextFlags: FeatureFlagsConfig) => {
    setIsSavingFeatureFlags(true);
    try {
      await saveFeatureFlags(nextFlags, currentUserUid);
      showSavedFeedback(
        L(
          'Paramètres des fonctions enregistrés dans le cloud',
          'Настройки функций сохранены в облаке',
          'Գործառույթների կարգավորումները պահպանվել են ամպում',
          'ფუნქციების პარამეტრები შენახულია ღრუბელში'
        )
      );
    } catch (err) {
      console.error('Failed to save feature flags:', err);
      showSavedFeedback(
        L(
          'Erreur lors de la sauvegarde dans Firestore',
          'Ошибка сохранения настроек функций в Firestore',
          'Firestore-ում պահպանման սխալ',
          'Firestore-ში შენახვის შეცდომა'
        )
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
        L(
          'Paramètres fiscaux par défaut enregistrés (/settings/tax_defaults)',
          'Налоговые настройки по умолчанию сохранены (/settings/tax_defaults)',
          'Հարկային լռելյայն կարգավորումները պահպանված են (/settings/tax_defaults)',
          'საგადასახადო ნაგულისხმევი პარამეტრები შენახულია (/settings/tax_defaults)'
        )
      );
    } catch (err) {
      console.error('Failed to save tax defaults:', err);
      showSavedFeedback(
        L(
          'Erreur lors de la sauvegarde des barèmes fiscaux dans Firestore',
          'Ошибка сохранения налоговых настроек в Firestore',
          'Հարկային դրույքները Firestore-ում պահպանելու սխալ',
          'საგადასახადო განაკვეთების Firestore-ში შენახვის შეცდომა'
        )
      );
    }
  };

  const handleResetTaxDefaults = async () => {
    const fresh = createDefaultFrenchTaxConfig('micro_entreprise');
    setTaxDefaultsDraft(fresh);
    try {
      await saveSuperAdminTaxDefaults(fresh, currentUserUid);
      showSavedFeedback(
        L(
          'Réinitialisé aux barèmes français (Micro 12,3% + 1% · Franchise en base)',
          'Сброшено к стандартам Франции (Micro 12.3% + 1% · Franchise en base)',
          'Վերականգնված է ֆրանսիական ստանդարտներով (Micro 12.3% + 1% · Franchise en base)',
          'აღდგენილია ფრანგული სტანდარტებით (Micro 12.3% + 1% · Franchise en base)'
        )
      );
    } catch (err) {
      console.error('Failed to reset tax defaults:', err);
      showSavedFeedback(
        L(
          'Erreur lors de la réinitialisation des barèmes fiscaux dans Firestore',
          'Ошибка сброса налоговых настроек в Firestore',
          'Հարկային դրույքները վերականգնելու սխալ',
          'საგადასახადო განაკვეთების განულების შეცდომა'
        )
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
      showSavedFeedback(
        L(
          'Calibration Cerfa enregistrée dans le cloud',
          'Калибровка полей Cerfa сохранена в облаке',
          'Cerfa դաշտերի կալիբրացիան պահպանված է ամպում',
          'Cerfa ველების კალიბრაცია შენახულია ღრუბელში'
        )
      );
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
  const handleTextOverrideChange = (
    key: string,
    field: 'fr' | 'ru' | 'hy' | 'ka' | 'color',
    value: string
  ) => {
    setTextOverrides((prev) => ({
      ...prev,
      [key]: {
        fr: field === 'fr' ? value : prev[key]?.fr ?? '',
        ru: field === 'ru' ? value : prev[key]?.ru ?? '',
        hy: field === 'hy' ? value : prev[key]?.hy ?? '',
        ka: field === 'ka' ? value : prev[key]?.ka ?? '',
        color: field === 'color' ? value : prev[key]?.color ?? '',
      },
    }));
  };

  const handleSaveTextOverrides = async (nextOverrides: GlobalTextOverrides = textOverrides) => {
    const cleaned = cleanTextOverridesMap(nextOverrides);
    setTextOverrides(cleaned);
    await saveGlobalTextOverrides(cleaned, currentUserUid);
    showSavedFeedback(
      L(
        'Textes et couleurs appliqués',
        'Тексты и цвета применены глобально',
        'Տեքստերն ու գույները կիրառվեցին գլոբալ',
        'ტექსტები და ფერები გლობალურად გამოყენებულია'
      )
    );
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
      L(
        'UI & textes appliqués globalement',
        'Настройки UI и тексты сохранены глобально',
        'UI և տեքստերի կարգավորումները պահպանված են գլոբալ',
        'UI და ტექსტების პარამეტრები გლობალურად შენახულია'
      )
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
    showSavedFeedback(
      L(
        'Tous les textes réinitialisés',
        'Все тексты сброшены',
        'Բոլոր տեքստերը վերականգնված են',
        'ყველა ტექსტი განულებულია'
      )
    );
  };

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'dashboard',
      label: L('Tableau de bord', 'Дашборд', 'Վահանակ', 'მართვის პანელი'),
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'users',
      label: L('Utilisateurs & Garages', 'Пользователи и гаражи', 'Օգտատերեր և սրահներ', 'მომხმარებლები და გარაჟები'),
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'expenses',
      label: L('Catégories de frais', 'Категории расходов', 'Ծախսերի կատեգորիաներ', 'ხარჯების კატეგორიები'),
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      id: 'features',
      label: L('Contrôle des fonctions', 'Управление функциями', 'Գործառույթների կառավարում', 'ფუნქციების მართვა'),
      icon: <ToggleRight className="w-4 h-4" />,
    },
    {
      id: 'texts',
      label: L('UI & Text Customization', 'UI и Тексты', 'UI և Տեքստեր', 'UI და ტექსტები'),
      icon: <Type className="w-4 h-4" />,
    },
    {
      id: 'design',
      label: L('Design & Branding', 'Дизайн и Брендинг', 'Դիզայն և Բրենդինգ', 'დიზაინი და ბრენდინგი'),
      icon: <Palette className="w-4 h-4" />,
    },
    {
      id: 'billing',
      label: L('Abonnements & Billing', 'Подписки и биллинг', 'Բաժանորդագրություններ', 'გამოწერები და ბილინგი'),
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: 'cerfa',
      label: L('Modèles & Cerfa', 'Шаблоны и Cerfa', 'Ձևանմուշներ և Cerfa', 'შაბლონები და Cerfa'),
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
            <span>
              {L(
                'Retour au garage',
                'Вернуться в гараж',
                'Վերադառնալ ավտոսրահ',
                'გარაჟში დაბრუნება'
              )}
            </span>
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
                {L(
                  'Vue globale de la plateforme',
                  'Панель управления платформой',
                  'Հարթակի կառավարման վահանակ',
                  'პლატფორმის მართვის პანელი'
                )}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {L(
                  'Indicateurs clés SaaS, garages actifs et revenus mensuels récurrents (MRR)',
                  'Ключевые показатели SaaS, активные автосалоны и ежемесячная выручка MRR',
                  'SaaS հիմնական ցուցանիշներ, ակտիվ սրահներ և ամսական MRR եկամուտ',
                  'SaaS ძირითადი მაჩვენებლები, აქტიური გარაჟები და ყოველთვიური MRR შემოსავალი'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{L('Total Utilisateurs', 'Всего пользователей', 'Ընդամենը օգտատերեր', 'სულ მომხმარებლები')}</span>
                  <Users className="w-4 h-4 text-sky-400" />
                </div>
                <p className="text-2xl font-bold text-white tabular-nums mt-2">
                  {metrics.totalUsers}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {metrics.trialAccounts} {L('en essai', 'на триале', 'փորձնականում', 'საცდელზე')}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{L('Garages Actifs', 'Активные гаражи', 'Ակտիվ սրահներ', 'აქტიური გარაჟები')}</span>
                  <Building2 className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-2xl font-bold text-white tabular-nums mt-2">
                  {metrics.activeGarages}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {metrics.pastDueAccounts} {L('impayés', 'просрочка оплаты', 'ժամկետանց', 'ვადაგადაცილებული')}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{L('Revenu Mensuel (MRR)', 'Выручка MRR', 'Ամսական MRR', 'ყოველთვიური MRR')}</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-bold text-emerald-400 tabular-nums mt-2">
                  {formatEuro(metrics.monthlyRevenueMRR)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {L('Abonnements actifs', 'По активным подпискам', 'Ակտիվ բաժանորդագրություններից', 'აქტიური გამოწერებიდან')}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{L('Véhicules gérés', 'Авто на платформе', 'Հաշվառված մեքենաներ', 'მართული ავტომობილები')}</span>
                  <Car className="w-4 h-4 text-indigo-400" />
                </div>
                <p className="text-2xl font-bold text-white tabular-nums mt-2">
                  {metrics.totalActiveVehicles}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {L('Inventaire cumulé', 'Суммарный инвентарь', 'Ընդհանուր պաշար', 'ჯამური ინვენტარი')}
                </p>
              </div>
            </div>

            {/* Plan Distribution */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white">
                {L('Répartition des abonnements', 'Распределение по тарифам', 'Բաժանորդագրությունների բաշխում', 'გამოწერების განაწილება')}
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
                        {formatEuro(plan.priceMonthly)} / {L('mois', 'мес', 'ամիս', 'თვე')}
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
                  {L('Utilisateurs & Garages', 'Пользователи и гаражи', 'Օգտատերեր և սրահներ', 'მომხმარებლები და გარაჟები')}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {L(
                    'Gestion des comptes, inspection des parcs et attribution des limites',
                    'Управление аккаунтами, проверка инвентаря и назначение лимитов',
                    'Հաշիվների կառավարում, ավտոպարկի ստուգում և սահմանաչափեր',
                    'ანგარიშების მართვა, პარკის შემოწმება და ლიმიტების დაყენება'
                  )}
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={L(
                    'Rechercher compte ou garage...',
                    'Поиск по имени, email, гаражу...',
                    'Որոնել ըստ անվան, email-ի կամ սրահի...',
                    'ძებნა სახელით, email-ით ან გარაჟით...'
                  )}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">{L('Compte / Garage', 'Аккаунт / Гараж', 'Հաշիվ / Սրահ', 'ანგარიში / გარაჟი')}</th>
                    <th className="py-3 px-4">{L('Rôle', 'Роль', 'Դեր', 'როლი')}</th>
                    <th className="py-3 px-4">{L('Forfait', 'Тариф', 'Սակագին', 'ტარიფი')}</th>
                    <th className="py-3 px-4 text-right">{L('Stock / Limite', 'Инвентарь / Лимит', 'Պաշար / Սահմանաչափ', 'საწყობი / ლიმიტი')}</th>
                    <th className="py-3 px-4">{L('Statut', 'Статус', 'Կարգավիճակ', 'სტატუსი')}</th>
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
                          options={plans.map((p) => ({ value: p.id, label: getPlanDisplayName(p, lang) }))}
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
                            { value: 'active', label: L('Actif', 'Активен', 'Ակտիվ', 'აქტიური') },
                            { value: 'trial', label: L('Essai', 'Триал', 'Փորձնական', 'საცდელი') },
                            { value: 'past_due', label: L('Impayé', 'Просрочен', 'Ժամկետանց', 'ვადაგადაცილებული') },
                            { value: 'canceled', label: L('Annulé', 'Отменён', 'Չեղարկված', 'გაუქმებული') },
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
            titleFr: string;
            titleRu: string;
            titleHy: string;
            titleKa: string;
            previewTarget: 'card' | 'vehicle_detail' | 'header_table';
            rows: {
              key: keyof ThemePaletteTokens;
              cssVar: string;
              labelFr: string;
              labelRu: string;
              labelHy: string;
              labelKa: string;
            }[];
          }[] = [
            {
              id: 'header',
              titleFr: 'En-tête & Navigation',
              titleRu: 'Шапка и Навигация',
              titleHy: 'Վերնագիր և Նավիգացիա',
              titleKa: 'სათაური და ნავიგაცია',
              previewTarget: 'header_table',
              rows: [
                { key: 'headerBg', cssVar: '--ag-header-bg', labelFr: 'Fond barre supérieure', labelRu: 'Фон верхней шапки', labelHy: 'Վերին գոտու ֆոն', labelKa: 'ზედა ზოლის ფონი' },
                { key: 'headerText', cssVar: '--ag-header-text', labelFr: 'Texte & icônes en-tête', labelRu: 'Текст шапки и иконки', labelHy: 'Վերնագրի տեքստ և պատկերակներ', labelKa: 'სათაურის ტექსტი და ხატულები' },
                { key: 'headerBorder', cssVar: '--ag-header-border', labelFr: 'Bordure inférieure', labelRu: 'Нижняя граница шапки', labelHy: 'Ստորին եզրագիծ', labelKa: 'ქვედა ჩარჩო' },
                { key: 'navActiveBg', cssVar: '--ag-nav-active-bg', labelFr: 'Fond onglet actif', labelRu: 'Фон активной вкладки', labelHy: 'Ակտիվ ներդիրի ֆոն', labelKa: 'აქტიური ჩანართის ფონი' },
                { key: 'navActiveText', cssVar: '--ag-nav-active-text', labelFr: 'Texte onglet actif', labelRu: 'Текст активной вкладки', labelHy: 'Ակտիվ ներդիրի տեքստ', labelKa: 'აქტიური ჩანართის ტექსტი' },
              ],
            },
            {
              id: 'cards',
              titleFr: 'Cartes d’inventaire & Fond',
              titleRu: 'Карточки склада и Общий фон',
              titleHy: 'Ավտոպարկի քարտեր և Ֆոն',
              titleKa: 'ინვენტარის ბარათები და ფონი',
              previewTarget: 'card',
              rows: [
                { key: 'background', cssVar: '--background', labelFr: 'Fond de page (Canvas)', labelRu: 'Фон страницы (Canvas)', labelHy: 'Էջի ֆոն (Canvas)', labelKa: 'გვერდის ფონი (Canvas)' },
                { key: 'card', cssVar: '--card', labelFr: 'Surface des cartes (Card)', labelRu: 'Фон карточек (Card)', labelHy: 'Քարտերի ֆոն (Card)', labelKa: 'ბარათების ფონი (Card)' },
                { key: 'surfaceMuted', cssVar: '--surface-muted', labelFr: 'Surface secondaire / champ', labelRu: 'Вторичная панель / инпут', labelHy: 'Երկրորդական վահանակ / դաշտ', labelKa: 'მეორადი პანელი / ველი' },
                { key: 'primary', cssVar: '--primary', labelFr: 'Couleur principale / CTA', labelRu: 'Основной акцент / кнопки', labelHy: 'Հիմնական շեշտադրում / կոճակներ', labelKa: 'ძირითადი აქცენტი / ღილაკები' },
                { key: 'foreground', cssVar: '--foreground', labelFr: 'Titres (Texte principal)', labelRu: 'Заголовки (Primary Text)', labelHy: 'Վերնագրեր (Primary Text)', labelKa: 'სათაურები (Primary Text)' },
                { key: 'secondaryForeground', cssVar: '--secondary-foreground', labelFr: 'Texte courant', labelRu: 'Основной текст', labelHy: 'Հիմնական տեքստ', labelKa: 'ძირითადი ტექსტი' },
                { key: 'mutedForeground', cssVar: '--muted-foreground', labelFr: 'Textes secondaires', labelRu: 'Приглушённые подписи', labelHy: 'Երկրորդական գրառումներ', labelKa: 'მეორადი წარწერები' },
                { key: 'border', cssVar: '--border', labelFr: 'Bordures & séparateurs', labelRu: 'Рамки и разделители', labelHy: 'Եզրագծեր և բաժանիչներ', labelKa: 'ჩარჩოები და გამყოფები' },
                { key: 'success', cssVar: '--success', labelFr: 'Succès / En vente', labelRu: 'Успех / В продаже', labelHy: 'Հաջողություն / Վաճառքում', labelKa: 'წარმატება / გაყიდვაში' },
                { key: 'warning', cssVar: '--warning', labelFr: 'Préparation / Alerte', labelRu: 'Подготовка / Внимание', labelHy: 'Նախապատրաստում / Զգուշացում', labelKa: 'მომზადება / ყურადღება' },
              ],
            },
            {
              id: 'vehicle_detail',
              titleFr: 'Fiche Véhicule & Rapport P&L',
              titleRu: 'Страница авто и Финансовый отчёт',
              titleHy: 'Մեքենայի էջ և P&L հաշվետվություն',
              titleKa: 'ავტომობილის გვერდი და P&L ანგარიში',
              previewTarget: 'vehicle_detail',
              rows: [
                { key: 'detailContainerBg', cssVar: '--ag-detail-bg', labelFr: 'Fond bilan P&L véhicule', labelRu: 'Контейнер баланса P&L', labelHy: 'P&L հաշվեկշռի ֆոն', labelKa: 'P&L ბალანსის ფონი' },
                { key: 'detailHeadingColor', cssVar: '--ag-detail-heading', labelFr: 'Titre bilan & rapport', labelRu: 'Заголовок баланса и отчёта', labelHy: 'Հաշվեկշռի և հաշվետվության վերնագիր', labelKa: 'ბალანსისა და ანგარიშის სათაური' },
                { key: 'metricBoxBg', cssVar: '--ag-metric-bg', labelFr: 'Fond blocs métriques', labelRu: 'Фон мини-карточек (Закупка/Ремонт)', labelHy: 'Չափիչ բլոկների ֆոն', labelKa: 'მეტრიკის ბლოკების ფონი' },
                { key: 'saleReceiptBg', cssVar: '--ag-receipt-bg', labelFr: 'Fond reçu financier', labelRu: 'Фон чека продажи (Receipt)', labelHy: 'Վաճառքի անդորրագրի ֆոն', labelKa: 'გაყიდვის ქვითრის ფონი' },
                { key: 'profitColor', cssVar: '--ag-profit-color', labelFr: 'Profit positif (+€)', labelRu: 'Положительная прибыль (+€)', labelHy: 'Դրական շահույթ (+€)', labelKa: 'დადებითი მოგება (+€)' },
                { key: 'expenseColor', cssVar: '--ag-expense-color', labelFr: 'Coûts & taxes (-€)', labelRu: 'Затраты и налоги (-€)', labelHy: 'Ծախսեր և հարկեր (-€)', labelKa: 'ხარჯები და გადასახადები (-€)' },
              ],
            },
            {
              id: 'analytics_tables',
              titleFr: 'Analytique, Tableaux & Modales',
              titleRu: 'Аналитика, Таблицы и Модалки',
              titleHy: 'Վերլուծություն, Աղյուսակներ և Մոդալներ',
              titleKa: 'ანალიტიკა, ცხრილები და მოდალები',
              previewTarget: 'header_table',
              rows: [
                { key: 'tableHeaderBg', cssVar: '--ag-table-header-bg', labelFr: 'En-tête des tableaux', labelRu: 'Шапка таблиц списка', labelHy: 'Աղյուսակների վերնագիր', labelKa: 'ცხრილების სათაური' },
                { key: 'tableRowHover', cssVar: '--ag-table-row-hover', labelFr: 'Survol ligne tableau', labelRu: 'Подсветка строки при наведении', labelHy: 'Տողի լուսավորում (hover)', labelKa: 'მწკრივის გამოკვეთა (hover)' },
                { key: 'chartAccent', cssVar: '--ag-chart-accent', labelFr: 'Accent graphiques & KPI', labelRu: 'Акцент графиков и KPI', labelHy: 'Գրաֆիկների և KPI շեշտադրում', labelKa: 'გრაფიკების და KPI აქცენტი' },
                { key: 'modalBg', cssVar: '--ag-modal-bg', labelFr: 'Fond des fenêtres modales', labelRu: 'Фон модальных окон', labelHy: 'Մոդալ պատուհանների ֆոն', labelKa: 'მოდალური ფანჯრების ფონი' },
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
                title={L(
                  `Cliquer pour modifier «${translationKey}»`,
                  `Нажмите для редактирования «${translationKey}»`,
                  `Սեղմեք՝ խմբագրելու «${translationKey}»`,
                  `დააჭირეთ «${translationKey}»-ის რედაქტირებისთვის`
                )}
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
                        {L('Préparation', 'В подготовке', 'Նախապատրաստում', 'მომზადება')}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${palette.success} 14%, transparent)`,
                          borderColor: `color-mix(in srgb, ${palette.success} 35%, transparent)`,
                          color: palette.success,
                        }}
                      >
                        {L('En vente', 'В продаже', 'Վաճառքում', 'გაყიდვაში')}
                      </span>
                    </div>
                  </div>

                  <div
                    className="p-2.5 rounded-xl border flex items-center justify-between"
                    style={{ backgroundColor: palette.surfaceMuted, borderColor: palette.border }}
                  >
                    <span className="text-xs font-medium" style={{ color: palette.secondaryForeground }}>
                      {L('Prix affiché', 'Цена продажи', 'Վաճառքի գին', 'გასაყიდი ფასი')}
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
                      {L('Voir fiche', 'Открыть карту', 'Բացել քարտը', 'ბარათის ნახვა')}
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
                          {L('Vente', 'Продажа', 'Վաճառք', 'გაყიდვა')}
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
                      {L('Parc (8)', 'Склад (8)', 'Ավտոպարկ (8)', 'პარკი (8)')}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px]" style={{ color: headerText }}>
                      {L('Analytique', 'Аналитика', 'Վերլուծություն', 'ანალიტიკა')}
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
                    <span>{L('Véhicule', 'Авто', 'Մեքենա', 'ავტო')}</span>
                    <span className="text-right">{L('Atelier', 'Ремонт', 'Վերանոր.', 'შეკეთ.')}</span>
                    <span className="text-right">{L('Marge', 'Прибыль', 'Շահույթ', 'მოგება')}</span>
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
                      {L('Fenêtre Modale', 'Модальное окно', 'Մոդալ պատուհան', 'მოდალური ფანჯარა')}
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
                          ? L('Thème Clair (Light Palette)', 'Светлая тема (Light Theme)', 'Լուսավոր թեմա (Light Theme)', 'ნათელი თემა (Light Theme)')
                          : L('Thème Sombre (Dark Palette)', 'Тёмная тема (Dark Theme)', 'Մուգ թեմա (Dark Theme)', 'მուգი თემა (Dark Theme)')}
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        {isLightCol
                          ? L('Mode jour pour postes lumineux', 'Дневной режим интерфейса и отчётов', 'Ցերեկային ռեժիմ և հաշվետվություններ', 'დღის რეჟიმი და ანგარიშები')
                          : L('Mode nuit et contrastes élevés', 'Ночной режим и контрастные акценты', 'Գիշերային ռեժիմ և բարձր կոնտրաստ', 'ღამის რეჟიმი და მაღალი კონტრასტი')}
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
                          ? L('Actif', 'Активна сейчас', 'Ակտիվ է', 'აქტიურია')
                          : L('Tester en direct', 'Включить на сайте', 'Փորձարկել կայքում', 'საიტზე ჩართვა')}
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
                          {L(group.titleFr, group.titleRu, group.titleHy, group.titleKa)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreviewPage(group.previewTarget)}
                          className="text-[10px] font-semibold text-slate-400 hover:text-white transition"
                        >
                          {L('Voir aperçu', 'Показать в превью', 'Տեսնել նախադիտումը', 'გადახედვაში ჩვენება')}
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
                                  {L(row.labelFr, row.labelRu, row.labelHy, row.labelKa)}
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
                        ? L('Aperçu Thème Clair', 'Предпросмотр светлой темы', 'Լուսավոր թեմայի նախադիտում', 'ნათელი თემის გადახედვა')
                        : L('Aperçu Thème Sombre', 'Предпросмотр тёмной темы', 'Մուգ թեմայի նախադիտում', 'მუქი თემის გადახედვა')}
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
                    {L('Design & Branding Studio', 'Дизайн и Брендинг', 'Դիզայն և Բրենդինգ', 'დიზაინი და ბრენდინგი')}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    {L(
                      'Contrôle complet des couleurs par section : en-tête, cartes, fiche véhicule, reçu P&L, tableaux et modales',
                      'Посекционная настройка цветов для шапки, карточек, страницы авто, чека P&L, таблиц и модальных окон',
                      'Բաժին առ բաժին գույների կարգավորում՝ վերնագիր, քարտեր, մեքենայի էջ, P&L կտրոն, աղյուսակներ և մոդալներ',
                      'ფერების სრული მართვა სექციების მიხედვით: სათაური, ბარათები, ავტო-გვერდი, P&L ქვითარი და ცხრილები'
                    )}
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
                          ? L('Sombre', 'Тёмная', 'Մուգ', 'მუქი')
                          : L('Clair', 'Светлая', 'Լուսավոր', 'ნათელი')}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleResetConfig}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{L('Réinitialiser par défaut', 'Сбросить по умолчанию', 'Վերականգնել լռելյայնը', 'ნაგულისხმევის დაბრუნება')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveGlobalConfig(resolvedDraft, true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{L('Enregistrer & Appliquer', 'Применить глобально', 'Պահպանել և կիրառել', 'შენახვა და გამოყენება')}</span>
                  </button>
                </div>
              </div>

              {/* Quick Dual-Theme Brand Presets */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">
                      {L('Préréglages de marque (Clair + Sombre)', 'Готовые палитры бренда (Light + Dark)', 'Բրենդի պատրաստի գունապնակներ (Light + Dark)', 'ბრენდის მზა პალიტრები (Light + Dark)')}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {L('Aperçu instantané sans rechargement', 'Изменения применяются к предпросмотру мгновенно', 'Փոփոխությունները կիրառվում են անմիջապես նախադիտումում', 'ცვლილებები მყისიერად აისახება გადახედვაში')}
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
                        <span>{L(preset.nameFr, preset.nameRu, preset.nameHy, preset.nameKa)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section Filter & Multi-Page Preview Switcher Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">
                    {L('Section :', 'Секция:', 'Բաժին՝', 'სექცია:')}
                  </span>
                  {(
                    [
                      { id: 'all', labelFr: 'Toutes', labelRu: 'Все секции', labelHy: 'Բոլոր բաժինները', labelKa: 'ყველა სექცია', target: null },
                      { id: 'header', labelFr: 'En-tête & Nav', labelRu: 'Шапка и Навигация', labelHy: 'Վերնագիր և Նավ', labelKa: 'სათაური და ნავ.', target: 'header_table' },
                      { id: 'cards', labelFr: 'Cartes Stock', labelRu: 'Карточки склада', labelHy: 'Պահեստի քարտեր', labelKa: 'ბარათები', target: 'card' },
                      { id: 'vehicle_detail', labelFr: 'Fiche & Reçu P&L', labelRu: 'Страница авто и Чек', labelHy: 'Մեքենայի էջ և P&L', labelKa: 'ავტო და P&L', target: 'vehicle_detail' },
                      { id: 'analytics_tables', labelFr: 'Analytique & Modales', labelRu: 'Аналитика, Таблицы и Модалки', labelHy: 'Վերլուծություն և Մոդալներ', labelKa: 'ანალიტიკა და მოდალები', target: 'header_table' },
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
                        {L(sec.labelFr, sec.labelRu, sec.labelHy, sec.labelKa)}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">
                    {L('Aperçu écran :', 'Превью экрана:', 'Էկրանի նախադիտում՝', 'ეკრანის გადახედვა:')}
                  </span>
                  {(
                    [
                      { id: 'card', labelFr: 'Carte Stock', labelRu: 'Карточка авто', labelHy: 'Մեքենայի քարտ', labelKa: 'ავტო ბარათი' },
                      { id: 'vehicle_detail', labelFr: 'Fiche & Reçu P&L', labelRu: 'Страница авто и Чек', labelHy: 'Մեքենայի էջ և P&L', labelKa: 'ავტო და P&L' },
                      { id: 'header_table', labelFr: 'En-tête & Tableau', labelRu: 'Шапка и Таблица', labelHy: 'Վերնագիր և Աղյուսակ', labelKa: 'სათაური და ცხრილი' },
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
                        {L(pg.labelFr, pg.labelRu, pg.labelHy, pg.labelKa)}
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
                        {L('Édition rapide texte & couleur :', 'Быстрое редактирование текста и цвета:', 'Տեքստի և գույնի արագ խմբագրում՝', 'ტექსტისა და ფერის სწრაფი რედაქტირება:')}
                      </span>
                      <span className="text-xs font-mono text-amber-400">{selectedTypedKey}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPreviewKey(null)}
                      className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
                    >
                      {L('Fermer', 'Закрыть', 'Փակել', 'დახურვა')}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                    <div className="lg:col-span-2">
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
                    <div className="lg:col-span-2">
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
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        HY
                      </label>
                      <input
                        type="text"
                        aria-label={`Quick edit ${selectedTypedKey} HY`}
                        value={selectedOverrideEntry?.hy ?? ''}
                        onChange={(e) =>
                          handleTextOverrideChange(selectedTypedKey, 'hy', e.target.value)
                        }
                        placeholder={translations.hy[selectedTypedKey]}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        KA
                      </label>
                      <input
                        type="text"
                        aria-label={`Quick edit ${selectedTypedKey} KA`}
                        value={selectedOverrideEntry?.ka ?? ''}
                        onChange={(e) =>
                          handleTextOverrideChange(selectedTypedKey, 'ka', e.target.value)
                        }
                        placeholder={translations.ka[selectedTypedKey]}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        {L('Couleur', 'Цвет текста', 'Տեքստի գույն', 'ტექსტის ფერი')}
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
                            title={L('Réinitialiser couleur', 'Сбросить цвет', 'Վերականգնել գույնը', 'ფერის განულება')}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="lg:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveTextOverrides(textOverrides)}
                        className="w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition whitespace-nowrap"
                      >
                        {L('Enregistrer', 'Сохранить', 'Պահպանել', 'შენახვა')}
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
                    {L('Rayon des bordures de cartes (--ag-card-radius)', 'Скругление карточек (--ag-card-radius)', 'Քարտերի եզրերի կլորացում (--ag-card-radius)', 'ბარათების კუთხეები (--ag-card-radius)')}
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
                    {L('Vue par défaut de l’inventaire', 'Вид инвентаря по умолчанию', 'Ավտոպարկի լռելյայն տեսք', 'ინვენტარის ნაგულისხმევი ხედი')}
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
                      {L('Grille (Grid)', 'Сетка (Grid)', 'Ցանց (Grid)', 'ბადე (Grid)')}
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
                      {L('Liste (List)', 'Список (List)', 'Ցանկ (List)', 'სია (List)')}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-2">
                  <p className="text-xs font-bold text-white">
                    {L(
                      `Variables CSS actives (${theme === 'light' ? 'Light' : 'Dark'})`,
                      `Активные CSS-токены (${theme === 'light' ? 'Light' : 'Dark'})`,
                      `Ակտիվ CSS թոքեններ (${theme === 'light' ? 'Light' : 'Dark'})`,
                      `აქტიური CSS ტოკენები (${theme === 'light' ? 'Light' : 'Dark'})`
                    )}
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
          const featuresFieldKey: 'featuresFr' | 'featuresRu' | 'featuresHy' | 'featuresKa' =
            planFeaturesLang === 'ru'
              ? 'featuresRu'
              : planFeaturesLang === 'hy'
              ? 'featuresHy'
              : planFeaturesLang === 'ka'
              ? 'featuresKa'
              : 'featuresFr';
          const moduleToggleDefs: {
            key: keyof PlanModulesConfig;
            labelFr: string;
            labelRu: string;
            labelHy: string;
            labelKa: string;
          }[] = [
            {
              key: 'cerfaAutofill',
              labelFr: 'Auto-remplissage & PDF Cerfa 15776*02',
              labelRu: 'Автозаполнение и PDF Cerfa 15776*02',
              labelHy: 'Cerfa 15776*02 ավտոլրացում և PDF',
              labelKa: 'Cerfa 15776*02 ავტოშევსება და PDF',
            },
            {
              key: 'suppliers',
              labelFr: 'Fournisseurs & pièces',
              labelRu: 'Поставщики и запчасти',
              labelHy: 'Մատակարարներ և պահեստամասեր',
              labelKa: 'მომწოდებლები და ნაწილები',
            },
            {
              key: 'analytics',
              labelFr: 'Analytique & P&L',
              labelRu: 'Аналитика и P&L',
              labelHy: 'Վերլուծություն և P&L',
              labelKa: 'ანალიტიკა და P&L',
            },
            {
              key: 'exportsBackup',
              labelFr: 'Exports & sauvegardes',
              labelRu: 'Экспорт и бэкап',
              labelHy: 'Արտահանում և պահուստավորում',
              labelKa: 'ექსპორტი და სარეზერვო ასლი',
            },
            {
              key: 'multiGarage',
              labelFr: 'Mode Multi-garages',
              labelRu: 'Режим Мультигараж',
              labelHy: 'Մուլտի-ավտոսրահ ռեժիմ',
              labelKa: 'მულტი-გარაჟის რეჟიმი',
            },
          ];

          return (
            <div className="space-y-6">
              {/* Top Header with Global Save Changes CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {L('Abonnements & Facturation', 'Подписки и биллинг', 'Բաժանորդագրություններ և վճարումներ', 'გამოწერები და ბილინგი')}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    {L(
                      'Modifiez noms, sous-titres, tarifs, quotas véhicules, modules et avantages en FR/RU/HY/KA (platform_settings/subscription_plans)',
                      'Редактируйте названия, подзаголовки, цены, лимиты авто, модули и преимущества в FR/RU/HY/KA (platform_settings/subscription_plans)',
                      'Խմբագրեք անվանումները, ենթավերնագրերը, գները, սահմանաչափերը և առավելությունները FR/RU/HY/KA լեզուներով (platform_settings/subscription_plans)',
                      'შეცვალეთ სახელები, ქვესათაურები, ფასები, ლიმიტები, მოდულები და უპირატესობები FR/RU/HY/KA ენებზე (platform_settings/subscription_plans)'
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div
                    role="group"
                    aria-label={L('Langue des avantages', 'Язык списка преимуществ', 'Առավելությունների լեզու', 'უპირატესობების ენა')}
                    className="inline-flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px]"
                  >
                    {(['fr', 'ru', 'hy', 'ka'] as Language[]).map((code) => (
                      <button
                        key={code}
                        type="button"
                        data-testid={`admin-plan-features-lang-${code}`}
                        onClick={() => setPlanFeaturesLang(code)}
                        className={`px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                          planFeaturesLang === code
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {code.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    data-testid="admin-reset-plans-btn"
                    onClick={handleResetPlansDraft}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{L('Réinitialiser', 'Сбросить', 'Վերականգնել', 'განულება')}</span>
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
                      {L('Enregistrer les modifications', 'Сохранить изменения', 'Պահպանել փոփոխությունները', 'ცვლილებების შენახვა')}
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
                                <span>{L('Populaire', 'Популярный', 'Հայտնի', 'პოპულარული')}</span>
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-amber-400 tabular-nums">
                            {metrics.planCounts[plan.id] || 0} {L('comptes', 'акк.', 'հաշիվ', 'ანგარიში')}
                          </span>
                        </div>

                        {/* Monthly Price + 4-Language Plan Name */}
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                            <div className="sm:col-span-7">
                              <label
                                htmlFor={`admin-plan-name-${plan.id}`}
                                className="block text-[11px] font-semibold text-slate-400 mb-1"
                              >
                                {L('Nom du forfait (FR)', 'Название (FR)', 'Անվանում (FR)', 'სახელი (FR)')}
                              </label>
                              <input
                                id={`admin-plan-name-${plan.id}`}
                                data-testid={`admin-plan-name-${plan.id}`}
                                type="text"
                                value={plan.nameFr ?? plan.name}
                                onChange={(e) =>
                                  updatePlanDraft(plan.id, (curr) => ({
                                    ...curr,
                                    name: e.target.value,
                                    nameFr: e.target.value,
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
                                {L('Prix (€ / mois)', 'Цена (€ / мес)', 'Գին (€ / ամիս)', 'ფასი (€ / თვე)')}
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

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label
                                htmlFor={`admin-plan-name-${plan.id}-ru`}
                                className="block text-[10px] font-semibold text-slate-400 mb-1"
                              >
                                {L('Nom (RU)', 'Название (RU)', 'Անվանում (RU)', 'სახელი (RU)')}
                              </label>
                              <input
                                id={`admin-plan-name-${plan.id}-ru`}
                                data-testid={`admin-plan-name-${plan.id}-ru`}
                                type="text"
                                value={plan.nameRu ?? ''}
                                onChange={(e) =>
                                  updatePlanDraft(plan.id, (curr) => ({
                                    ...curr,
                                    nameRu: e.target.value,
                                  }))
                                }
                                className="w-full h-8 bg-slate-950 border border-slate-800 rounded-lg px-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`admin-plan-name-${plan.id}-hy`}
                                className="block text-[10px] font-semibold text-slate-400 mb-1"
                              >
                                {L('Nom (HY)', 'Название (HY)', 'Անվանում (HY)', 'სახელი (HY)')}
                              </label>
                              <input
                                id={`admin-plan-name-${plan.id}-hy`}
                                data-testid={`admin-plan-name-${plan.id}-hy`}
                                type="text"
                                value={plan.nameHy ?? ''}
                                onChange={(e) =>
                                  updatePlanDraft(plan.id, (curr) => ({
                                    ...curr,
                                    nameHy: e.target.value,
                                  }))
                                }
                                className="w-full h-8 bg-slate-950 border border-slate-800 rounded-lg px-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`admin-plan-name-${plan.id}-ka`}
                                className="block text-[10px] font-semibold text-slate-400 mb-1"
                              >
                                {L('Nom (KA)', 'Название (KA)', 'Անվանում (KA)', 'სახელი (KA)')}
                              </label>
                              <input
                                id={`admin-plan-name-${plan.id}-ka`}
                                data-testid={`admin-plan-name-${plan.id}-ka`}
                                type="text"
                                value={plan.nameKa ?? ''}
                                onChange={(e) =>
                                  updatePlanDraft(plan.id, (curr) => ({
                                    ...curr,
                                    nameKa: e.target.value,
                                  }))
                                }
                                className="w-full h-8 bg-slate-950 border border-slate-800 rounded-lg px-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 4-Language Plan Subtitle / Tagline */}
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          <span className="block text-[11px] font-semibold text-slate-400">
                            {L('Sous-titre / Description du forfait', 'Подзаголовок / описание тарифа', 'Սակագնի ենթավերնագիր / նկարագրություն', 'ტარიფის ქვესათაური / აღწერა')}
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label
                                htmlFor={`admin-plan-tagline-${plan.id}-fr`}
                                className="block text-[10px] font-semibold text-slate-500 mb-1"
                              >
                                FR
                              </label>
                              <input
                                id={`admin-plan-tagline-${plan.id}-fr`}
                                data-testid={`admin-plan-tagline-${plan.id}-fr`}
                                type="text"
                                value={plan.taglineFr ?? ''}
                                onChange={(e) =>
                                  updatePlanDraft(plan.id, (curr) => ({
                                    ...curr,
                                    taglineFr: e.target.value,
                                  }))
                                }
                                className="w-full h-8 bg-slate-950 border border-slate-800 rounded-lg px-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`admin-plan-tagline-${plan.id}-ru`}
                                className="block text-[10px] font-semibold text-slate-500 mb-1"
                              >
                                RU
                              </label>
                              <input
                                id={`admin-plan-tagline-${plan.id}-ru`}
                                data-testid={`admin-plan-tagline-${plan.id}-ru`}
                                type="text"
                                value={plan.taglineRu ?? ''}
                                onChange={(e) =>
                                  updatePlanDraft(plan.id, (curr) => ({
                                    ...curr,
                                    taglineRu: e.target.value,
                                  }))
                                }
                                className="w-full h-8 bg-slate-950 border border-slate-800 rounded-lg px-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`admin-plan-tagline-${plan.id}-hy`}
                                className="block text-[10px] font-semibold text-slate-500 mb-1"
                              >
                                HY
                              </label>
                              <input
                                id={`admin-plan-tagline-${plan.id}-hy`}
                                data-testid={`admin-plan-tagline-${plan.id}-hy`}
                                type="text"
                                value={plan.taglineHy ?? ''}
                                onChange={(e) =>
                                  updatePlanDraft(plan.id, (curr) => ({
                                    ...curr,
                                    taglineHy: e.target.value,
                                  }))
                                }
                                className="w-full h-8 bg-slate-950 border border-slate-800 rounded-lg px-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`admin-plan-tagline-${plan.id}-ka`}
                                className="block text-[10px] font-semibold text-slate-500 mb-1"
                              >
                                KA
                              </label>
                              <input
                                id={`admin-plan-tagline-${plan.id}-ka`}
                                data-testid={`admin-plan-tagline-${plan.id}-ka`}
                                type="text"
                                value={plan.taglineKa ?? ''}
                                onChange={(e) =>
                                  updatePlanDraft(plan.id, (curr) => ({
                                    ...curr,
                                    taglineKa: e.target.value,
                                  }))
                                }
                                className="w-full h-8 bg-slate-950 border border-slate-800 rounded-lg px-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Vehicle Limit + Unlimited Toggle */}
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`admin-plan-limit-${plan.id}`}
                              className="text-[11px] font-semibold text-slate-400"
                            >
                              {L('Limite de véhicules', 'Лимит автомобилей', 'Մեքենաների սահմանաչափ', 'ავტომობილების ლიმიტი')}
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
                              <span>{L('Illimité', 'Безлимит', 'Անսահմանափակ', 'ულიმიტო')}</span>
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
                            placeholder={isUnlimited ? L('∞ Illimité', '∞ Безлимит', '∞ Անսահմանափակ', '∞ ულიმიტო') : '5'}
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
                            {L('Badge « Populaire »', 'Бейдж «Популярный»', '«Հայտնի» նշան', 'ბეიჯი «პოპულარული»')}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(plan.isPopular)}
                            aria-label={`${L('Populaire', 'Популярный тариф', 'Հայտնի սակագին', 'პოპულარული ტარიფი')} ${getPlanDisplayName(plan, lang)}`}
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
                            {L('Modules inclus dans le forfait', 'Доступные функции тарифа', 'Սակագնում ներառված մոդուլներ', 'ტარიფში შემავალი მოდულები')}
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
                                    {L(mod.labelFr, mod.labelRu, mod.labelHy, mod.labelKa)}
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
                              {L(
                                `Points affichés (${planFeaturesLang.toUpperCase()})`,
                                `Список преимуществ (${planFeaturesLang.toUpperCase()})`,
                                `Առավելությունների ցանկ (${planFeaturesLang.toUpperCase()})`,
                                `უპირატესობების სია (${planFeaturesLang.toUpperCase()})`
                              )}
                            </span>
                            <button
                              type="button"
                              data-testid={`admin-plan-add-feature-${plan.id}`}
                              onClick={() => handleAddPlanFeature(plan.id, featuresFieldKey)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{L('Ajouter', 'Добавить пункт', 'Ավելացնել կետ', 'დამატება')}</span>
                            </button>
                          </div>

                          <div className="space-y-2">
                            {featuresList.map((feat, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  data-testid={`admin-plan-feature-${plan.id}-${idx}`}
                                  aria-label={`${getPlanDisplayName(plan, planFeaturesLang)} feature ${idx + 1} (${planFeaturesLang.toUpperCase()})`}
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
                                  aria-label={L('Supprimer', 'Удалить пункт', 'Հեռացնել', 'წაშლა')}
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
                                {L(
                                  'Aucun point — cliquez sur « Ajouter ».',
                                  'Нет добавленных пунктов — нажмите «Добавить пункт».',
                                  'Կետեր չկան — սեղմեք «Ավելացնել կետ»։',
                                  'პუნქტები არ არის — დააჭირეთ «დამატებას».'
                                )}
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
                    {L('Journal des paiements', 'Статусы платежей', 'Վճարումների կարգավիճակներ', 'გადახდების სტატუსები')}
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
                            ({matchedPlan ? getPlanDisplayName(matchedPlan, lang) : acc.planId})
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
                      {L('Calibration du modèle Cerfa 15776*02', 'Калибровка бланка Cerfa 15776*02', 'Cerfa 15776*02 ձևաթղթի կալիբրացիա', 'Cerfa 15776*02 ბლანკის კალიბრაცია')}
                    </h1>
                    <span
                      data-testid="admin-cerfa-dummy-badge"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>
                        {L(
                          'Données de test complètes • indépendant du stock',
                          '100% тестовых данных • без привязки к гаражу',
                          '100% փորձնական տվյալներ • անկախ պահեստից',
                          '100% სატესტო მონაცემები • მარაგისგან დამოუკიდებელი'
                        )}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {L(
                      'Calibration cloud des coordonnées (x, y, police) avec surbrillance du champ sélectionné (platform_settings/cerfa_templates)',
                      'Облачная калибровка координат полей (x, y, шрифт) с подсветкой выбранного поля на живом бланке (platform_settings/cerfa_templates)',
                      'Դաշտերի կոորդինատների ամպային կալիբրացիա (x, y, տառաչափ)՝ ընտրված դաշտի լուսավորմամբ (platform_settings/cerfa_templates)',
                      'ველების კოორდინატების ღრუბლოვანი კალიბრაცია (x, y, შრიფტი) არჩეული ველის მონიშვნით (platform_settings/cerfa_templates)'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAlignerMode}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition self-start"
                >
                  <Sliders className="w-4 h-4" />
                  <span>{L('Ouvrir Aligner Mode', 'Открыть Aligner Mode', 'Բացել Aligner Mode', 'Aligner Mode-ის გახსნა')}</span>
                </button>
              </div>

              {/* Active Official Template Banner */}
              <div
                data-testid="admin-cerfa-tpl-cerfa_15776_02"
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border bg-amber-500/10 border-amber-500/50 text-white"
              >
                <div>
                  <p className="text-sm font-bold text-amber-400">
                    Cerfa N° 15776*02 — {L('Certificat de cession d’un véhicule d’occasion', 'Акт передачи ТС (Certificat de cession)', 'ՏՄ հանձնման վկայական (Certificat de cession)', 'ავტომობილის გადაცემის აქტი (Certificat de cession)')}
                  </p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {L(
                      'Modèle gouvernemental officiel actif (Exemplaires 1 & 2)',
                      'Единый поддерживаемый правительственный шаблон PDF (экземпляры 1 и 2)',
                      'Պաշտոնական կառավարական PDF ձևանմուշ (Օրինակ 1 և 2)',
                      'ოფიციალური სამთავრობო PDF შაბლონი (ეგზემპლარები 1 და 2)'
                    )}
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
                        {L('Décalages globaux du modèle', 'Глобальные смещения шаблона', 'Ձևանմուշի ընդհանուր շեղումներ', 'შაბლონის გლობალური წანაცვლება')}
                      </h2>
                      <button
                        type="button"
                        data-testid="admin-cerfa-reset-tpl-btn"
                        onClick={handleResetSelectedCerfaTemplate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{L('Réinitialiser modèle', 'Сбросить шаблон', 'Վերականգնել ձևանմուշը', 'შაბლონის განულება')}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="admin-cerfa-offset-x"
                          className="block text-[11px] font-semibold text-slate-300 mb-1"
                        >
                          {L('Décalage X', 'Смещение X', 'Շեղում X', 'წანაცვლება X')}
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
                          {L('Décalage Y', 'Смещение Y', 'Շեղում Y', 'წანაცვლება Y')}
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
                          {L('Police Δ', 'Шрифт Δ', 'Տառաչափ Δ', 'შრიფტი Δ')}
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
                        {L(
                          'Calibration précise des coordonnées (pt)',
                          'Точная калибровка координат поля (pt)',
                          'Դաշտի կոորդինատների ճշգրիտ կալիբրացիա (pt)',
                          'ველის კოორდინატების ზუსტი კალიბრაცია (pt)'
                        )}
                      </h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {L(
                          'Le champ actif est surligné en ambre/rouge sur l’aperçu à droite',
                          'Выбранное поле подсвечивается янтарно-красной рамкой на бланке справа',
                          'Ընտրված դաշտը լուսավորվում է աջ կողմի նախադիտման վրա',
                          'არჩეული ველი მონიშნულია მარჯვენა წინასწარ ხედზე'
                        )}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="admin-cerfa-field-select"
                          className="block text-xs font-semibold text-slate-300 mb-1.5"
                        >
                          {L('Champ du document', 'Поле документа', 'Փաստաթղթի դաշտ', 'დოკუმენტის ველი')}
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
                              {L('Taille (pt)', 'Шрифт (pt)', 'Չափս (pt)', 'ზომა (pt)')}
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
                            {L('Ajuster X :', 'Сдвиг X:', 'Տեղաշարժ X՝', 'წანაცვლება X:')}
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
                            {L('Ajuster Y :', 'Сдвиг Y:', 'Տեղաշարժ Y՝', 'წანაცვლება Y:')}
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
                        <span>{L('Enregistrer', 'Сохранить', 'Պահպանել', 'შენახვა')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Live PDF Preview with Full Dummy Test Data & Highlighted Selected Field */}
                <div className="xl:col-span-7">
                  <CerfaLivePreviewSheet
                    title={L(
                      'Aperçu en direct Cerfa N° 15776*02',
                      'Живой предпросмотр Cerfa N° 15776*02',
                      'Cerfa N° 15776*02 ուղիղ նախադիտում',
                      'Cerfa N° 15776*02 ცოცხალი წინასწარი ხედი'
                    )}
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
                  {L('Gestion des catégories de dépenses', 'Управление категориями расходов', 'Ծախսերի կատեգորիաների կառավարում', 'ხარჯების კატეგორიების მართვა')}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {L(
                    'Créez, renommez et ordonnez les catégories globales de dépenses (/system_config/expenses)',
                    'Создавайте, переименовывайте, настраивайте иконки, суммы по умолчанию и порядок отображения (/system_config/expenses)',
                    'Ստեղծեք, վերանվանեք և կարգավորեք պատկերակները, լռելյայն գումարները և հերթականությունը (/system_config/expenses)',
                    'შექმენით, გადაარქვით და დაალაგეთ ხარჯების გლობალური კატეგორიები (/system_config/expenses)'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetCategories}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{L('Réinitialiser', 'Сбросить по умолчанию', 'Վերականգնել լռելյայնը', 'ნაგულისხმევის დაბრუნება')}</span>
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
                    ? L('Modifier la catégorie', 'Редактировать категорию', 'Խմբագրել կատեգորիան', 'კატეგორიის რედაქტირება')
                    : L('Ajouter une nouvelle catégorie', 'Добавить новую категорию', 'Ավելացնել նոր կատեգորիա', 'ახალი კატეგორიის დამატება')}
                </h2>
                {editingCategoryId && (
                  <button
                    type="button"
                    onClick={resetCategoryForm}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    {L('Annuler', 'Отмена', 'Չեղարկել', 'გაუქმება')}
                  </button>
                )}
              </div>

              {/* Multilingual Labels: FR, RU, HY, KA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {L('Nom (FR) *', 'Название (FR) *', 'Անվանում (FR) *', 'სახელი (FR) *')}
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
                    {L('Nom (RU) *', 'Название (RU) *', 'Անվանում (RU) *', 'სახელი (RU) *')}
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
                    {L('Nom (HY)', 'Название (HY)', 'Անվանում (HY)', 'სახელი (HY)')}
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
                    {L('Nom (KA)', 'Название (KA)', 'Անվանում (KA)', 'სახელი (KA)')}
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
                    {L('ID catégorie (optionnel)', 'ID категории (опционально)', 'Կատեգորիայի ID (ըստ ցանկության)', 'კატეგორიის ID (არასავალდებულო)')}
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
                    placeholder={L(
                      'Auto depuis le nom (ex. diagnostic_auto)',
                      'Авто из названия (напр. diagnostic_auto)',
                      'Ավտոմատ անունից (օր. diagnostic_auto)',
                      'ავტო სახელიდან (მაგ. diagnostic_auto)'
                    )}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    {editingCategoryId
                      ? L(
                          'ID verrouillé après création',
                          'ID существующей категории фиксирован',
                          'Գոյություն ունեցող կատեգորիայի ID-ն ֆիքսված է',
                          'არსებული კატეგორიის ID დაფიქსირებულია'
                        )
                      : catFormId.trim()
                      ? `${L('ID normalisé', 'Будет сохранён', 'Կպահպանվի որպես', 'შეინახება როგორც')}: ${normalizeExpenseCategorySlug(catFormId) || '—'}`
                      : L(
                          'Lettres, chiffres, _ ou - (1–64 car.)',
                          'Латиница, цифры, _ или - (1–64 симв.)',
                          'Լատինատառ, թվեր, _ կամ - (1–64 նշան)',
                          'ლათინური ასოები, ციფრები, _ ან - (1–64 სიმბ.)'
                        )}
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {L('Montant par défaut (€)', 'Сумма по умолчанию (€)', 'Լռելյայն գումար (€)', 'ნაგულისხმევი თანხა (€)')}
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
                    {L('Aperçu en direct', 'Предпросмотр', 'Ուղիղ նախադիտում', 'ცოცხალი წინასწარი ხედი')}
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
                        {L(catFormFr, catFormRu, catFormHy, catFormKa) ||
                          catFormFr ||
                          catFormRu ||
                          L('Nouvelle catégorie', 'Новая категория', 'Նոր կատեգորիա', 'ახალი კატეგორია')}
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
                    {L('Icône de la catégorie', 'Иконка категории', 'Կատեգորիայի պատկերակ', 'კატეგორიის ხატულა')}
                  </label>
                  <span className="text-[11px] font-mono text-amber-400" data-testid="admin-cat-selected-icon">
                    {catFormIcon}
                  </span>
                </div>
                <div
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2"
                  role="radiogroup"
                  aria-label={L('Icône de la catégorie', 'Иконка категории', 'Կատեգորիայի պատկերակ', 'კატეგორიის ხატულა')}
                >
                  {EXPENSE_CATEGORY_ICON_OPTIONS.map((opt) => {
                    const isSelected = catFormIcon === opt.id;
                    const optLabel = L(opt.labelFr, opt.labelRu, opt.labelHy, opt.labelKa);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-testid={`admin-cat-icon-${opt.id}`}
                        onClick={() => setCatFormIcon(opt.id)}
                        title={optLabel}
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
                            {optLabel}
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
                      ? L('Mettre à jour', 'Сохранить изменения', 'Պահպանել փոփոխությունները', 'ცვლილებების შენახვა')
                      : L('Créer la catégorie', 'Создать категорию', 'Ստեղծել կատեգորիա', 'კატეგორიის შექმნა')}
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
                    <th className="py-3 px-4">{L('Nom (FR)', 'Название (FR)', 'Անվանում (FR)', 'სახელი (FR)')}</th>
                    <th className="py-3 px-4">{L('Nom (RU)', 'Название (RU)', 'Անվանում (RU)', 'სახელი (RU)')}</th>
                    <th className="py-3 px-4">{L('Nom (HY)', 'Название (HY)', 'Անվանում (HY)', 'სახელი (HY)')}</th>
                    <th className="py-3 px-4">{L('Nom (KA)', 'Название (KA)', 'Անվանում (KA)', 'სახელი (KA)')}</th>
                    <th className="py-3 px-4">{L('Icône', 'Иконка', 'Պատկերակ', 'ხატულა')}</th>
                    <th className="py-3 px-4 text-right">{L('Défaut', 'По умолч.', 'Լռելյայն', 'ნაგულისხმევი')}</th>
                    <th className="py-3 px-4 text-right">{L('Actions', 'Действия', 'Գործողություններ', 'მოქმედებები')}</th>
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
                            title={L('Monter', 'Выше', 'Բարձրացնել', 'ზემოთ')}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === expenseCategories.length - 1}
                            onClick={() => handleMoveCategory(idx, 1)}
                            title={L('Descendre', 'Ниже', 'Իջեցնել', 'ქვემოთ')}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditCategory(cat)}
                            title={L('Modifier', 'Редактировать', 'Խմբագրել', 'რედაქტირება')}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            title={L('Supprimer', 'Удалить', 'Հեռացնել', 'წაშლა')}
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
                  {L('Contrôle Global des Fonctions', 'Управление функциями (Feature Controls)', 'Ֆունկցիաների գլոբալ կառավարում', 'ფუნქციების გლობალური მართვა')}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {L(
                    'Activation ou désactivation instantanée des modules pour tous les utilisateurs (platform_settings/feature_flags)',
                    'Мгновенное включение/отключение модулей для всех пользователей платформы (platform_settings/feature_flags)',
                    'Մոդուլների ակնթարթային միացում/անջատում հարթակի բոլոր օգտատերերի համար (platform_settings/feature_flags)',
                    'მოდულების მყისიერი ჩართვა/გამორთვა პლატფორმის ყველა მომხმარებლისთვის (platform_settings/feature_flags)'
                  )}
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
                  <span>{L('Tout activer', 'Включить все', 'Միացնել բոլորը', 'ყველას ჩართვა')}</span>
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
                  <span>{L('Enregistrer', 'Сохранить изменения', 'Պահպանել փոփոխությունները', 'ცვლილებების შენახვა')}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  {
                    key: 'multiGarage',
                    titleFr: 'Multi-Garage & Sélecteur d’espaces de travail',
                    titleRu: 'Multi-garage / Мультигараж и переключатель пространств',
                    titleHy: 'Multi-garage / Բազմագարաժ և աշխատանքային տիրույթների ընտրիչ',
                    titleKa: 'Multi-garage / მრავალფარეხი და სივრცეების გადამრთველი',
                    descFr: 'Masque la création/sélection multi-garages et charge directement le garage principal.',
                    descRu: 'При отключении скрывает «+ Создать новый гараж» и «РАБОЧИЙ ГАРАЖ», автоматически загружая основной гараж пользователя.',
                    descHy: 'Անջատելիս թաքցնում է «+ Ստեղծել նոր գարաժ» և «ԱՇԽԱՏԱՆՔԱՅԻՆ ԳԱՐԱԺ» բաժինները՝ բեռնելով հիմնական գարաժը։',
                    descKa: 'გამორთვისას მალავს «+ ახალი ავტოფარეხის შექმნა»-ს და პირდაპირ ტვირთავს მთავარ ავტოფარეხს.',
                  },
                  {
                    key: 'expenseAnalytics',
                    titleFr: 'Analytique détaillée & Graphiques P&L',
                    titleRu: 'Аналитика и P&L (графики и разбивка расходов)',
                    titleHy: 'Վերլուծություն և P&L (գրաֆիկներ և ծախսերի բաշխում)',
                    titleKa: 'ანალიტიკა და P&L (გრაფიკები და ხარჯების დეტალიზაცია)',
                    descFr: 'Masque l’onglet « Analytique & P&L » et bloque l’accès au module.',
                    descRu: 'Скрывает раздел «Аналитика и P&L» в боковом меню и блокирует прямой доступ к графикам.',
                    descHy: 'Թաքցնում է «Վերլուծություն և P&L» բաժինը կողային ընտրացանկում և արգելափակում մուտքը գրաֆիկներին։',
                    descKa: 'მალავს «ანალიტიკა და P&L» ჩანართს გვერდითა მენიუში და ბლოკავს გრაფიკებზე წვდომას.',
                  },
                  {
                    key: 'suppliersModule',
                    titleFr: 'Fournisseurs & Achats',
                    titleRu: 'Поставщики и закупки',
                    titleHy: 'Մատակարարներ և գնումներ',
                    titleKa: 'მომწოდებლები და შესყიდვები',
                    descFr: 'Masque l’onglet « Fournisseurs & Achats » et bloque l’accès au module.',
                    descRu: 'Скрывает раздел «Поставщики и закупки» в боковом меню и блокирует доступ к модулю.',
                    descHy: 'Թաքցնում է «Մատակարարներ և գնումներ» բաժինը և արգելափակում մուտքը մոդուլին։',
                    descKa: 'მალავს «მომწოდებლები და შესყიდვები» ჩანართს და ბლოკავს მოდულზე წვდომას.',
                  },
                  {
                    key: 'documentsModule',
                    titleFr: 'Documents (Coffre-fort documentaire)',
                    titleRu: 'Документы (хранилище досье и файлов)',
                    titleHy: 'Փաստաթղթեր (ֆայլերի և գործերի պահոց)',
                    titleKa: 'დოკუმენტები (დოსიეების და ფაილების საცავი)',
                    descFr: 'Masque l’onglet « Documents » et bloque l’accès au coffre-fort.',
                    descRu: 'Скрывает раздел «Документы» в боковом меню и блокирует доступ к хранилищу документов.',
                    descHy: 'Թաքցնում է «Փաստաթղթեր» բաժինը և արգելափակում փաստաթղթերի պահոցի մուտքը։',
                    descKa: 'მალავს «დოკუმენტები» ჩანართს და ბლოკავს საცავზე წვდომას.',
                  },
                  {
                    key: 'cerfaGenerator',
                    titleFr: 'Générateur Cerfa 15776*02 & Aligner Mode',
                    titleRu: 'Документы Cerfa 15776*02 и Aligner Mode',
                    titleHy: 'Cerfa 15776*02 գեներատոր և Aligner Mode',
                    titleKa: 'Cerfa 15776*02 გენერატორი და Aligner Mode',
                    descFr: 'Masque le bouton Cerfa dans les fiches véhicules et Documents.',
                    descRu: 'Скрывает генерацию и кнопки Cerfa в карточке автомобиля и разделе Документы.',
                    descHy: 'Թաքցնում է Cerfa կոճակներն ու գեներացումը մեքենայի քարտում և Փաստաթղթեր բաժնում։',
                    descKa: 'მალავს Cerfa ღილაკებსა და გენერაციას მანქანის ბარათსა და დოკუმენტებში.',
                  },
                  {
                    key: 'exportsBackup',
                    titleFr: 'Exports & Sauvegardes (CSV / Excel / Factur-X)',
                    titleRu: 'Экспорт и Бэкап (CSV / Excel / Factur-X / Снимки)',
                    titleHy: 'Արտահանում և պահուստավորում (CSV / Excel / Factur-X)',
                    titleKa: 'ექსპორტი და სარეზერვო ასლი (CSV / Excel / Factur-X)',
                    descFr: 'Masque l’onglet « Exports & Sauvegardes » et bloque l’accès au module.',
                    descRu: 'Скрывает раздел «Экспорт и Бэкап» в боковом меню и блокирует доступ к модулю.',
                    descHy: 'Թաքցնում է «Արտահանում և պահուստավորում» բաժինը և արգելափակում մուտքը։',
                    descKa: 'მალავს «ექსპორტი და ბექაფი» ჩანართს და ბლოკავს მოდულზე წვდომას.',
                  },
                  {
                    key: 'pnlCalculator',
                    titleFr: 'Calculateur P&L & Rentabilité en temps réel',
                    titleRu: 'Калькулятор маржи P&L в карточках и досье',
                    titleHy: 'P&L շահութաբերության հաշվիչ քարտերում և գործերում',
                    titleKa: 'P&L მარჟის კალკულატორი ბარათებსა და დოსიეში',
                    descFr: 'Masque la marge globale, les blocs P&L sur les cartes et le bandeau P&L.',
                    descRu: 'Скрывает общую маржу в шапке, блоки прибыли на карточках и P&L баннер в досье.',
                    descHy: 'Թաքցնում է ընդհանուր մարժան վերնագրում, շահույթի բլոկները և P&L վահանակը։',
                    descKa: 'მალავს საერთო მარჟას, მოგების ბლოკებს ბარათებზე და P&L ბანერს.',
                  },
                  {
                    key: 'repairChecklist',
                    titleFr: 'Checklist Réparations & Travaux Atelier',
                    titleRu: 'Чек-лист ремонта и задач сервиса',
                    titleHy: 'Վերանորոգման ստուգացանկ և սպասարկման առաջադրանքներ',
                    titleKa: 'შეკეთების ჩეკ-ლისტი და სერვისის დავალებები',
                    descFr: 'Masque l’onglet « Travaux & Réparations » et le widget d’avancement.',
                    descRu: 'Скрывает вкладку «Ремонт и чек-лист» и виджет прогресса ремонта в досье.',
                    descHy: 'Թաքցնում է «Վերանորոգում և ստուգացանկ» ներդիրը և առաջընթացի վիդջեթը։',
                    descKa: 'მალავს «შეკეთება და ჩეკ-ლისტი» ჩანართს და პროგრესის ვიჯეტს.',
                  },
                ] as const
              ).map((item) => {
                const enabled = featureFlags[item.key];
                const itemTitle = L(item.titleFr, item.titleRu, item.titleHy, item.titleKa);
                const itemDesc = L(item.descFr, item.descRu, item.descHy, item.descKa);
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
                          {itemTitle}
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
                        {itemDesc}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={itemTitle}
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
                  {L('Studio UI, Mise en page & Textes', 'Студия UI, макета и текстов', 'UI, դասավորության և տեքստերի ստուդիա', 'UI-ის, განლაგებისა და ტექსტების სტუდია')}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {L(
                    'Contrôle global des rayons, espacements, fiches véhicules et libellés (settings/ui_customization)',
                    'Глобальное управление отступами, скруглениями, отчётом продажи и всеми текстами (settings/ui_customization)',
                    'Մեքենաների քարտերի բացատների, կորությունների և բոլոր տեքստերի գլոբալ կառավարում (settings/ui_customization)',
                    'ბარათების დაშორებების, მომრგვალებებისა და ყველა ტექსტის გლობალური მართვა (settings/ui_customization)'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAllTexts}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{L('Réinitialiser textes', 'Сбросить тексты', 'Վերականգնել տեքստերը', 'ტექსტების განულება')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveUiAndTexts}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition whitespace-nowrap shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{L('Enregistrer UI & Textes', 'Сохранить UI и тексты', 'Պահպանել UI-ն և տեքստերը', 'UI-ის და ტექსტების შენახვა')}</span>
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
                      {L(
                        'Tokens de mise en page (Fiche & P&L)',
                        'Токены макета карточки авто и P&L',
                        'Մեքենայի քարտի և P&L դասավորության տոկեններ',
                        'ავტომობილის ბარათისა და P&L განლაგების ტოკენები'
                      )}
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
                    {L('Réinitialiser layout', 'Сбросить макет', 'Վերականգնել դասավորությունը', 'განლაგების განულება')}
                  </button>
                </div>

                {/* Card Radius */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {L('Rayon des cartes (--ag-card-radius)', 'Скругление карточек (--ag-card-radius)', 'Քարտերի կորություն (--ag-card-radius)', 'ბარათების მომრგვალება (--ag-card-radius)')}
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
                    {L('Rayon des boutons & onglets (--ag-button-radius)', 'Скругление кнопок и вкладок (--ag-button-radius)', 'Կոճակների կորություն (--ag-button-radius)', 'ღილაკების მომრგვალება (--ag-button-radius)')}
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
                    {L('Marge interne des cartes (--ag-card-padding)', 'Внутренние отступы карточек (--ag-card-padding)', 'Քարտերի ներքին բացատ (--ag-card-padding)', 'ბარათების შიდა დაშორება (--ag-card-padding)')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'compact', labelFr: 'Compact', labelRu: 'Компакт', labelHy: 'Կոմպակտ', labelKa: 'კომპაქტური' },
                        { id: 'comfortable', labelFr: 'Confort', labelRu: 'Стандарт', labelHy: 'Ստանդարտ', labelKa: 'სტანდარტული' },
                        { id: 'spacious', labelFr: 'Spacieux', labelRu: 'Просторно', labelHy: 'Ընդարձակ', labelKa: 'თავისუფალი' },
                      ] as { id: CardPaddingDensity; labelFr: string; labelRu: string; labelHy: string; labelKa: string }[]
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
                          {L(opt.labelFr, opt.labelRu, opt.labelHy, opt.labelKa)} ({CARD_PADDING_VALUES[opt.id]})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section Gap */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {L('Espacement des sections (--ag-section-gap)', 'Интервал между секциями (--ag-section-gap)', 'Բաժինների միջակայք (--ag-section-gap)', 'სექციებს შორის დაშორება (--ag-section-gap)')}
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
                      {L('Aperçu Fiche Véhicule & P&L', 'Предпросмотр карточки авто и P&L', 'Մեքենայի քարտի և P&L նախադիտում', 'ავტომობილის ბარათისა და P&L წინასწარი ხედი')}
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {theme === 'light'
                      ? L('Clair', 'Светлая', 'Լուսավոր', 'ნათელი')
                      : L('Sombre', 'Тёмная', 'Մութ', 'მუქი')}
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
                    {L(cat.labelFr, cat.labelRu, cat.labelHy, cat.labelKa)} ({translationCategoryCounts[cat.id]})
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
                  placeholder={L(
                    'Rechercher une clé ou un texte...',
                    'Поиск по ключу или тексту...',
                    'Որոնել բանալիով կամ տեքստով...',
                    'ძიება გასაღებით ან ტექსტით...'
                  )}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-400 tabular-nums">
                  {L(
                    `Affichés : ${allTranslationKeys.length}`,
                    `Показано: ${allTranslationKeys.length}`,
                    `Ցուցադրված է՝ ${allTranslationKeys.length}`,
                    `ნაჩვენებია: ${allTranslationKeys.length}`
                  )}
                </span>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyModifiedTexts}
                    onChange={(e) => setOnlyModifiedTexts(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                  />
                  <span>{L('Modifiés uniquement', 'Только изменённые', 'Միայն փոփոխվածները', 'მხოლოდ შეცვლილები')}</span>
                </label>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full min-w-[920px] table-fixed text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-950 z-10 border-b border-slate-800">
                  <tr className="text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-2.5 w-36">{L('Clé', 'Ключ', 'Բանալի', 'გასაღები')}</th>
                    <th className="py-3 px-2">{L('Français (FR)', 'Французский (FR)', 'Ֆրանսերեն (FR)', 'ფრანგული (FR)')}</th>
                    <th className="py-3 px-2">{L('Russe (RU)', 'Русский (RU)', 'Ռուսերեն (RU)', 'რუსული (RU)')}</th>
                    <th className="py-3 px-2">{L('Arménien (HY)', 'Армянский (HY)', 'Հայերեն (HY)', 'სომხური (HY)')}</th>
                    <th className="py-3 px-2">{L('Géorgien (KA)', 'Грузинский (KA)', 'Վրացերեն (KA)', 'ქართული (KA)')}</th>
                    <th className="py-3 px-2.5 w-32">{L('Couleur', 'Цвет текста', 'Գույն', 'ფერი')}</th>
                    <th className="py-3 px-2 text-right w-12">{L('Reset', 'Сброс', 'Վերակ.', 'განულ.')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {allTranslationKeys.map((key) => {
                    const custom = textOverrides[key];
                    const hasCustomColor = Boolean(custom?.color?.trim());
                    const isModified = Boolean(
                      custom?.fr?.trim() ||
                        custom?.ru?.trim() ||
                        custom?.hy?.trim() ||
                        custom?.ka?.trim() ||
                        hasCustomColor
                    );
                    const safeColorVal =
                      custom?.color && /^#[0-9a-fA-F]{6}$/.test(custom.color)
                        ? custom.color
                        : '#f8fafc';
                    const catId = getTranslationKeyCategory(key);
                    const catObj = TRANSLATION_CATEGORIES.find((c) => c.id === catId);
                    return (
                      <tr key={key} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-2.5 align-top">
                          <div
                            className={`font-mono text-[11px] font-semibold truncate ${
                              isModified ? 'text-amber-400' : 'text-slate-300'
                            }`}
                            title={key}
                          >
                            {key}
                          </div>
                          {catObj && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 max-w-full truncate">
                              {L(catObj.labelFr, catObj.labelRu, catObj.labelHy, catObj.labelKa)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 align-top space-y-1">
                          <input
                            type="text"
                            aria-label={`${key} FR`}
                            value={custom?.fr ?? ''}
                            onChange={(e) => handleTextOverrideChange(key, 'fr', e.target.value)}
                            placeholder={translations.fr[key]}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            style={hasCustomColor ? { color: custom?.color } : undefined}
                          />
                          <div className="text-[10px] text-slate-500 truncate" title={translations.fr[key]}>
                            {translations.fr[key]}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 align-top space-y-1">
                          <input
                            type="text"
                            aria-label={`${key} RU`}
                            value={custom?.ru ?? ''}
                            onChange={(e) => handleTextOverrideChange(key, 'ru', e.target.value)}
                            placeholder={translations.ru[key]}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            style={hasCustomColor ? { color: custom?.color } : undefined}
                          />
                          <div className="text-[10px] text-slate-500 truncate" title={translations.ru[key]}>
                            {translations.ru[key]}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 align-top space-y-1">
                          <input
                            type="text"
                            aria-label={`${key} HY`}
                            value={custom?.hy ?? ''}
                            onChange={(e) => handleTextOverrideChange(key, 'hy', e.target.value)}
                            placeholder={translations.hy[key]}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            style={hasCustomColor ? { color: custom?.color } : undefined}
                          />
                          <div className="text-[10px] text-slate-500 truncate" title={translations.hy[key]}>
                            {translations.hy[key]}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 align-top space-y-1">
                          <input
                            type="text"
                            aria-label={`${key} KA`}
                            value={custom?.ka ?? ''}
                            onChange={(e) => handleTextOverrideChange(key, 'ka', e.target.value)}
                            placeholder={translations.ka[key]}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            style={hasCustomColor ? { color: custom?.color } : undefined}
                          />
                          <div className="text-[10px] text-slate-500 truncate" title={translations.ka[key]}>
                            {translations.ka[key]}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 align-top">
                          <div className="flex items-center gap-1">
                            <input
                              type="color"
                              aria-label={`${key} color`}
                              value={safeColorVal}
                              onChange={(e) =>
                                handleTextOverrideChange(key, 'color', e.target.value)
                              }
                              className="w-6 h-7 rounded-lg bg-transparent border border-slate-700 cursor-pointer p-0.5 shrink-0"
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
                              className="w-[64px] bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-[11px] font-mono text-slate-200 placeholder-slate-500 tabular-nums focus:outline-none focus:border-amber-500"
                            />
                            {hasCustomColor && (
                              <button
                                type="button"
                                onClick={() => handleTextOverrideChange(key, 'color', '')}
                                title={L('Réinitialiser couleur', 'Сбросить цвет', 'Վերականգնել գույնը', 'ფერის განულება')}
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
                              title={L('Réinitialiser', 'Сбросить', 'Վերականգնել', 'განულება')}
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
