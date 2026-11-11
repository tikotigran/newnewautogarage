import {
  SubscriptionPlan,
  SubscriptionPlanId,
  SystemThemeConfig,
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

export const DEFAULT_SYSTEM_THEME_CONFIG: SystemThemeConfig = {
  primaryAccentColor: '#f59e0b',
  cardBorderRadius: '16px',
  defaultInventoryViewMode: 'grid',
  cerfaAdjustments: {
    offsetX: 0,
    offsetY: 0,
    fontSizeDelta: 0,
    defaultTemplate: 'cerfa_15776_02',
  },
};

export const ACCENT_COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'Amber Gold', hex: '#f59e0b' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Cobalt Blue', hex: '#3b82f6' },
  { name: 'Crimson Rose', hex: '#f43f5e' },
  { name: 'Violet', hex: '#8b5cf6' },
];

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

export function applySystemThemeVariables(config: SystemThemeConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ag-accent', config.primaryAccentColor || '#f59e0b');
  root.style.setProperty('--ag-card-radius', config.cardBorderRadius || '16px');
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

