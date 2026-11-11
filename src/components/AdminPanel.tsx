import React, { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import {
  DynamicExpenseCategory,
  FeatureFlagsConfig,
  GlobalTextOverrides,
  SubscriptionPlan,
  SubscriptionPlanId,
  SubscriptionStatus,
  SystemThemeConfig,
  UserProfile,
  UserRole,
} from '../types/garage';
import {
  ACCENT_COLOR_PRESETS,
  computeAdminDashboardMetrics,
  DEFAULT_DYNAMIC_EXPENSE_CATEGORIES,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_SYSTEM_THEME_CONFIG,
  sortExpenseCategories,
} from '../utils/adminUtils';
import {
  getSubscriptionPlans,
  saveDynamicExpenseCategories,
  saveFeatureFlags,
  saveGlobalTextOverrides,
  saveSubscriptionPlans,
  saveSystemThemeConfig,
  subscribeAllUserAccounts,
  subscribeDynamicExpenseCategories,
  subscribeFeatureFlags,
  subscribeGlobalTextOverrides,
  updateUserAccount,
} from '../services/adminService';
import { formatEuro } from '../utils/finance';
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
  onBackToApp: () => void;
  onSignIn: () => void;
  onOpenAlignerMode: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isSuperAdmin,
  currentUserUid,
  systemConfig,
  onBackToApp,
  onSignIn,
  onOpenAlignerMode,
}) => {
  const { lang } = useI18n();
  const isRu = lang === 'ru';

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => getSubscriptionPlans());
  const [searchQuery, setSearchQuery] = useState('');
  const [draftConfig, setDraftConfig] = useState<SystemThemeConfig>(systemConfig);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Dynamic Expense Categories state
  const [expenseCategories, setExpenseCategories] = useState<DynamicExpenseCategory[]>(
    DEFAULT_DYNAMIC_EXPENSE_CATEGORIES
  );
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [catFormFr, setCatFormFr] = useState('');
  const [catFormRu, setCatFormRu] = useState('');
  const [catFormIcon, setCatFormIcon] = useState('Truck');
  const [catFormDefaultAmount, setCatFormDefaultAmount] = useState<number>(0);

  // Feature Flags state
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsConfig>(DEFAULT_FEATURE_FLAGS);

  // Global Text Overrides state
  const [textOverrides, setTextOverrides] = useState<GlobalTextOverrides>({});
  const [textSearch, setTextSearch] = useState('');
  const [onlyModifiedTexts, setOnlyModifiedTexts] = useState(false);

  useEffect(() => {
    setDraftConfig(systemConfig);
  }, [systemConfig]);

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
    return () => {
      unsubAccounts();
      unsubExpenses();
      unsubFeatures();
      unsubTexts();
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
              <span>{isRu ? 'Вернуться в автопарк' : 'Retour au parc'}</span>
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

  const handleSaveGlobalConfig = async (nextConfig: SystemThemeConfig = draftConfig) => {
    await saveSystemThemeConfig(nextConfig, currentUserUid);
    // Sync default inventory view mode if user hasn't set one or wants global default
    try {
      localStorage.setItem('autogarage_inventory_view', nextConfig.defaultInventoryViewMode);
    } catch {
      // ignore
    }
    showSavedFeedback(
      isRu ? 'Глобальная конфигурация сохранена' : 'Configuration globale enregistrée'
    );
  };

  const handleResetConfig = async () => {
    setDraftConfig(DEFAULT_SYSTEM_THEME_CONFIG);
    await handleSaveGlobalConfig(DEFAULT_SYSTEM_THEME_CONFIG);
  };

  const handlePlanChange = async (uid: string, planId: SubscriptionPlanId) => {
    const plan = plans.find((p) => p.id === planId);
    await updateUserAccount(uid, {
      planId,
      vehicleLimit: plan?.vehicleLimit ?? 5,
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

  const handlePlanPriceUpdate = (planId: SubscriptionPlanId, priceMonthly: number) => {
    const updated = plans.map((p) =>
      p.id === planId ? { ...p, priceMonthly: Math.max(0, priceMonthly) } : p
    );
    setPlans(updated);
    saveSubscriptionPlans(updated);
  };

  // Expense Category CRUD & Ordering handlers
  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCatFormFr('');
    setCatFormRu('');
    setCatFormIcon('Truck');
    setCatFormDefaultAmount(0);
  };

  const handleEditCategory = (cat: DynamicExpenseCategory) => {
    setEditingCategoryId(cat.id);
    setCatFormFr(cat.labelFr);
    setCatFormRu(cat.labelRu);
    setCatFormIcon(cat.icon || 'Coins');
    setCatFormDefaultAmount(cat.defaultAmount || 0);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catFormFr.trim() && !catFormRu.trim()) return;

    const labelFr = catFormFr.trim() || catFormRu.trim();
    const labelRu = catFormRu.trim() || catFormFr.trim();

    let next: DynamicExpenseCategory[];
    if (editingCategoryId) {
      next = expenseCategories.map((c) =>
        c.id === editingCategoryId
          ? {
              ...c,
              labelFr,
              labelRu,
              icon: catFormIcon,
              defaultAmount: Math.max(0, Number(catFormDefaultAmount) || 0),
            }
          : c
      );
    } else {
      const slugBase = labelFr
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const newId = `${slugBase || 'cat'}_${Date.now().toString().slice(-4)}`;
      const maxOrder = expenseCategories.reduce((m, c) => Math.max(m, c.order || 0), 0);
      next = [
        ...expenseCategories,
        {
          id: newId,
          labelFr,
          labelRu,
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

  // Feature Flags handlers
  const handleToggleFeatureFlag = async (key: keyof FeatureFlagsConfig) => {
    const updated: FeatureFlagsConfig = {
      ...featureFlags,
      [key]: !featureFlags[key],
    };
    setFeatureFlags(updated);
    await saveFeatureFlags(updated, currentUserUid);
    showSavedFeedback(isRu ? 'Модуль обновлён' : 'Module mis à jour');
  };

  const handleResetFeatureFlags = async () => {
    setFeatureFlags(DEFAULT_FEATURE_FLAGS);
    await saveFeatureFlags(DEFAULT_FEATURE_FLAGS, currentUserUid);
    showSavedFeedback(isRu ? 'Все функции включены' : 'Toutes les fonctions activées');
  };

  // Global Text Overrides handlers
  const handleTextOverrideChange = (key: string, field: 'fr' | 'ru', value: string) => {
    setTextOverrides((prev) => ({
      ...prev,
      [key]: {
        fr: field === 'fr' ? value : prev[key]?.fr ?? '',
        ru: field === 'ru' ? value : prev[key]?.ru ?? '',
      },
    }));
  };

  const handleSaveTextOverrides = async (nextOverrides: GlobalTextOverrides = textOverrides) => {
    const cleaned: GlobalTextOverrides = {};
    for (const [k, v] of Object.entries(nextOverrides)) {
      if ((v.fr && v.fr.trim() !== '') || (v.ru && v.ru.trim() !== '')) {
        cleaned[k] = { fr: v.fr || '', ru: v.ru || '' };
      }
    }
    setTextOverrides(cleaned);
    await saveGlobalTextOverrides(cleaned, currentUserUid);
    showSavedFeedback(isRu ? 'Тексты применены глобально' : 'Textes appliqués globalement');
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

  const allTranslationKeys = useMemo(() => {
    const keys = Object.keys(translations.fr) as (keyof typeof translations.fr)[];
    const q = textSearch.trim().toLowerCase();
    return keys.filter((k) => {
      const hasOverride = Boolean(
        textOverrides[k]?.fr?.trim() || textOverrides[k]?.ru?.trim()
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
  }, [textSearch, onlyModifiedTexts, textOverrides]);

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
      label: isRu ? 'Редактор текстов' : 'Éditeur de textes',
      icon: <Type className="w-4 h-4" />,
    },
    {
      id: 'design',
      label: isRu ? 'Дизайн и брендинг' : 'Design & Branding',
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
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-64 shrink-0 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between px-2 pb-3 border-b border-slate-800">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-amber-400">SUPERADMIN</p>
            <h2 className="text-sm font-bold text-white mt-0.5">AutoGarage Console</h2>
          </div>
          <button
            type="button"
            onClick={onBackToApp}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title={isRu ? 'Выйти из админки' : 'Quitter la console'}
            aria-label={isRu ? 'Выйти из админки' : 'Quitter la console'}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-1" aria-label="SuperAdmin navigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
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

        {saveNotice && (
          <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <section className="flex-1 w-full min-w-0 space-y-6">
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
                        <div className="font-semibold text-white">{acc.garageName}</div>
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
                        <select
                          aria-label={`Plan for ${acc.garageName}`}
                          value={acc.planId}
                          onChange={(e) =>
                            handlePlanChange(acc.uid, e.target.value as SubscriptionPlanId)
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                        >
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
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
                        <select
                          aria-label={`Status for ${acc.garageName}`}
                          value={acc.subscriptionStatus}
                          onChange={(e) =>
                            handleStatusChange(acc.uid, e.target.value as SubscriptionStatus)
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                        >
                          <option value="active">{isRu ? 'Активен' : 'Actif'}</option>
                          <option value="trial">{isRu ? 'Триал' : 'Essai'}</option>
                          <option value="past_due">{isRu ? 'Просрочен' : 'Impayé'}</option>
                          <option value="canceled">{isRu ? 'Отменён' : 'Annulé'}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. DESIGN & THEME CUSTOMIZER ENGINE */}
        {activeTab === 'design' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">
                  {isRu ? 'Система дизайна и тем' : 'Système de Design & Thème Global'}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {isRu
                    ? 'Динамическое управление CSS-переменными, скруглением карточек и видом инвентаря по умолчанию'
                    : 'Modification dynamique des variables CSS globales, rayons de cartes et vue par défaut'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Сбросить' : 'Réinitialiser'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveGlobalConfig()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Применить глобально' : 'Enregistrer & Appliquer'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
                {/* Primary Accent Color */}
                <div className="space-y-2.5">
                  <label className="block text-xs font-bold text-white">
                    {isRu ? 'Основной акцентный цвет (--ag-accent)' : 'Couleur d’accent principale (--ag-accent)'}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {ACCENT_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() =>
                          setDraftConfig({ ...draftConfig, primaryAccentColor: preset.hex })
                        }
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                          draftConfig.primaryAccentColor === preset.hex
                            ? 'border-white bg-slate-800 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full"
                          style={{ backgroundColor: preset.hex }}
                        />
                        <span>{preset.name}</span>
                      </button>
                    ))}
                    <input
                      type="color"
                      aria-label="Custom accent color"
                      value={draftConfig.primaryAccentColor}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, primaryAccentColor: e.target.value })
                      }
                      className="w-9 h-9 rounded-lg bg-slate-950 border border-slate-700 cursor-pointer p-0.5"
                    />
                  </div>
                </div>

                {/* Card Border Radius */}
                <div className="space-y-2.5">
                  <label className="block text-xs font-bold text-white">
                    {isRu ? 'Скругление карточек (--ag-card-radius)' : 'Rayon des bordures de cartes (--ag-card-radius)'}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['6px', '12px', '16px', '24px'] as const).map((rad) => (
                      <button
                        key={rad}
                        type="button"
                        onClick={() =>
                          setDraftConfig({ ...draftConfig, cardBorderRadius: rad })
                        }
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                          draftConfig.cardBorderRadius === rad
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {rad}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default Inventory View Mode */}
                <div className="space-y-2.5">
                  <label className="block text-xs font-bold text-white">
                    {isRu ? 'Режим отображения инвентаря по умолчанию' : 'Mode d’affichage par défaut de l’inventaire'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftConfig({ ...draftConfig, defaultInventoryViewMode: 'grid' })
                      }
                      className={`py-2.5 px-4 rounded-xl text-xs font-semibold border transition ${
                        draftConfig.defaultInventoryViewMode === 'grid'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {isRu ? 'Компактная сетка (Grid)' : 'Grille Compacte (Grid)'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftConfig({ ...draftConfig, defaultInventoryViewMode: 'list' })
                      }
                      className={`py-2.5 px-4 rounded-xl text-xs font-semibold border transition ${
                        draftConfig.defaultInventoryViewMode === 'list'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {isRu ? 'Табличный список (List)' : 'Vue Liste / Tableau'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-xs font-bold text-slate-400">
                  {isRu ? 'Предпросмотр темы в реальном времени' : 'Aperçu en direct'}
                </h2>
                <div
                  className="bg-slate-950 border border-slate-800 p-4 space-y-3 transition-all"
                  style={{ borderRadius: draftConfig.cardBorderRadius }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Peugeot 208 GT</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded text-slate-950"
                      style={{ backgroundColor: draftConfig.primaryAccentColor }}
                    >
                      2021
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">1.2 PureTech 130ch · 48 500 km</p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-400">Marge Nette</span>
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: draftConfig.primaryAccentColor }}
                    >
                      +3 700 €
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  CSS: --ag-accent: {draftConfig.primaryAccentColor} · --ag-card-radius: {draftConfig.cardBorderRadius}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4. SUBSCRIPTION & BILLING */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white">
                {isRu ? 'Подписки и биллинг' : 'Abonnements & Facturation'}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {isRu
                  ? 'Настройка тарифов SaaS и контроль статусов оплаты'
                  : 'Configuration des plans tarifaires et suivi des statuts de paiement'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white">{plan.name}</h2>
                    <span className="text-xs font-semibold text-amber-400 tabular-nums">
                      {metrics.planCounts[plan.id] || 0} {isRu ? 'акк.' : 'comptes'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      aria-label={`Monthly price for ${plan.name}`}
                      value={plan.priceMonthly}
                      onChange={(e) =>
                        handlePlanPriceUpdate(plan.id, Number(e.target.value) || 0)
                      }
                      className="w-24 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-lg font-bold text-white tabular-nums"
                    />
                    <span className="text-xs text-slate-400">€ / {isRu ? 'мес' : 'mois'}</span>
                  </div>

                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {(isRu ? plan.featuresRu : plan.featuresFr).map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

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
                {accounts.map((acc) => (
                  <div
                    key={acc.uid}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-semibold text-white">{acc.garageName}</span>
                      <span className="text-slate-400 ml-2">({acc.planId})</span>
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
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 5. TEMPLATE & CERFA CONFIGURATOR */}
        {activeTab === 'cerfa' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">
                  {isRu ? 'Конфигуратор шаблонов и Cerfa' : 'Configurateur de Modèles & Cerfa'}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {isRu
                    ? 'Глобальная калибровка смещения PDF и запуск визуального выравнивания'
                    : 'Ajustements globaux d’alignement PDF Cerfa 15776*02 pour tous les garages'}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenAlignerMode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition"
              >
                <Sliders className="w-4 h-4" />
                <span>{isRu ? 'Открыть Aligner Mode' : 'Ouvrir Aligner Mode'}</span>
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isRu ? 'Глобальное смещение X (pt)' : 'Décalage global X (pt)'}
                  </label>
                  <input
                    type="number"
                    value={draftConfig.cerfaAdjustments.offsetX}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        cerfaAdjustments: {
                          ...draftConfig.cerfaAdjustments,
                          offsetX: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isRu ? 'Глобальное смещение Y (pt)' : 'Décalage global Y (pt)'}
                  </label>
                  <input
                    type="number"
                    value={draftConfig.cerfaAdjustments.offsetY}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        cerfaAdjustments: {
                          ...draftConfig.cerfaAdjustments,
                          offsetY: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isRu ? 'Коррекция шрифта (pt)' : 'Ajustement taille police (pt)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={draftConfig.cerfaAdjustments.fontSizeDelta}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        cerfaAdjustments: {
                          ...draftConfig.cerfaAdjustments,
                          fontSizeDelta: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => handleSaveGlobalConfig()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Сохранить настройки Cerfa' : 'Enregistrer la config Cerfa'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Название (FR) *' : 'Nom (FR) *'}
                  </label>
                  <input
                    type="text"
                    required
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
                    value={catFormRu}
                    onChange={(e) => setCatFormRu(e.target.value)}
                    placeholder="напр. Диагностика / Подбор"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Иконка' : 'Icône'}
                  </label>
                  <select
                    aria-label="Category icon"
                    value={catFormIcon}
                    onChange={(e) => setCatFormIcon(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Truck">Truck (Эвакуатор / Transport)</option>
                    <option value="Fuel">Fuel (Топливо / Carburant)</option>
                    <option value="FileCheck">FileCheck (Техосмотр / CT)</option>
                    <option value="Sparkles">Sparkles (Мойка / Detailing)</option>
                    <option value="FileText">FileText (Carte Grise / Документы)</option>
                    <option value="ShieldCheck">ShieldCheck (Страховка / Assurance)</option>
                    <option value="Wrench">Wrench (Запчасти / Pièces)</option>
                    <option value="Coins">Coins (Прочее / Autre)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {isRu ? 'Сумма по умолчанию (€)' : 'Montant par défaut (€)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={catFormDefaultAmount}
                    onChange={(e) => setCatFormDefaultAmount(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
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
                      <td className="py-2.5 px-4 text-amber-400 font-mono text-[11px]">{cat.icon}</td>
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
                    ? 'Мгновенное включение/отключение модулей для всех пользователей платформы (/system_config/features)'
                    : 'Activation ou désactivation instantanée des modules pour tous les utilisateurs (/system_config/features)'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetFeatureFlags}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isRu ? 'Включить все' : 'Tout activer'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  {
                    key: 'cerfaGenerator',
                    titleRu: 'Генератор Cerfa 15776*02 и Aligner Mode',
                    titleFr: 'Générateur Cerfa 15776*02 & Aligner Mode',
                    descRu: 'Скрывает кнопку Cerfa в таблице и блок Cerfa во вкладке Документы.',
                    descFr: 'Masque le bouton Cerfa dans la liste et la carte Cerfa dans Documents.',
                  },
                  {
                    key: 'pnlCalculator',
                    titleRu: 'Калькулятор маржи P&L в реальном времени',
                    titleFr: 'Calculateur P&L & Rentabilité en temps réel',
                    descRu: 'Скрывает общую маржу в шапке, блоки прибыли на карточках и P&L баннер в досье.',
                    descFr: 'Masque la marge globale, les blocs P&L sur les cartes et le bandeau P&L.',
                  },
                  {
                    key: 'expenseAnalytics',
                    titleRu: 'Детальная аналитика и разбивка расходов',
                    titleFr: 'Analytique détaillée & Répartition des dépenses',
                    descRu: 'Скрывает вкладку «Аналитика» в навигации и отключает страницу графиков.',
                    descFr: 'Masque l’onglet « Analytique » dans la barre de navigation.',
                  },
                  {
                    key: 'multiGarage',
                    titleRu: 'Мульти-гараж и переключатель рабочих пространств',
                    titleFr: 'Multi-Garage & Sélecteur d’espaces de travail',
                    descRu: 'Отключает экран выбора гаража и выпадающий список переключения в шапке.',
                    descFr: 'Désactive l’écran de sélection et le sélecteur de garage dans l’en-tête.',
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
          </div>
        )}

        {/* 8. GLOBAL LABEL & TEXT CUSTOMIZER */}
        {activeTab === 'texts' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">
                  {isRu ? 'Редактор надписей и текстов' : 'Éditeur Global de Textes & Libellés'}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {isRu
                    ? 'Динамическое переопределение заголовков, кнопок и подсказок без пересборки (/system_config/texts)'
                    : 'Personnalisez dynamiquement les libellés, boutons et en-têtes (/system_config/texts)'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAllTexts}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Сбросить все' : 'Tout réinitialiser'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTextOverrides()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Сохранить тексты' : 'Enregistrer les textes'}</span>
                </button>
              </div>
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

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full table-fixed text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-950 z-10 border-b border-slate-800">
                  <tr className="text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-3 w-36">{isRu ? 'Ключ' : 'Clé'}</th>
                    <th className="py-3 px-3">{isRu ? 'Французский (FR)' : 'Français (FR)'}</th>
                    <th className="py-3 px-3">{isRu ? 'Русский (RU)' : 'Russe (RU)'}</th>
                    <th className="py-3 px-3 text-right w-16">{isRu ? 'Сброс' : 'Reset'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {allTranslationKeys.slice(0, 80).map((key) => {
                    const custom = textOverrides[key];
                    const isModified = Boolean(custom?.fr?.trim() || custom?.ru?.trim());
                    return (
                      <tr key={key} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 align-top truncate">
                          <span
                            className={`font-mono text-[11px] font-semibold ${
                              isModified ? 'text-amber-400' : 'text-slate-300'
                            }`}
                          >
                            {key}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 align-top space-y-1">
                          <input
                            type="text"
                            aria-label={`${key} FR`}
                            value={custom?.fr ?? ''}
                            onChange={(e) => handleTextOverrideChange(key, 'fr', e.target.value)}
                            placeholder={translations.fr[key]}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
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
                          />
                          <div className="text-[10px] text-slate-500 truncate">
                            {translations.ru[key]}
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
