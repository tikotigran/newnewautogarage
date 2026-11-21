import { GeneralExpense, RepairTask, Vehicle } from '../types/garage';
import { Language, pickLocalized } from './i18nUtils';
import { roundToTwo } from './finance';

export interface QuickExpensePreset {
  id: string;
  category: string;
  chipLabel: Record<Language, string>;
  description: Record<Language, string>;
  defaultAmount?: number;
}

export const QUICK_EXPENSE_PRESETS: QuickExpensePreset[] = [
  {
    id: 'ct',
    category: 'controle_technique',
    chipLabel: {
      fr: 'CT',
      ru: 'CT',
      hy: 'CT',
      ka: 'CT',
    },
    description: {
      fr: 'Contrôle Technique (CT)',
      ru: 'Техосмотр (CT)',
      hy: 'Տեխզննում (CT)',
      ka: 'ტექდათვალიერება (CT)',
    },
    defaultAmount: 85,
  },
  {
    id: 'tires',
    category: 'other',
    chipLabel: {
      fr: 'Pneus',
      ru: 'Шины',
      hy: 'Անվադողեր',
      ka: 'საბურავები',
    },
    description: {
      fr: 'Pneus & montage',
      ru: 'Шины и шиномонтаж',
      hy: 'Անվադողեր և մոնտաժ',
      ka: 'საბურავები და მონტაჟი',
    },
    defaultAmount: 220,
  },
  {
    id: 'parts_repair',
    category: 'other',
    chipLabel: {
      fr: 'Pièces / Réparation',
      ru: 'Запчасти / Ремонт',
      hy: 'Պահեստամասեր / Վերանորոգում',
      ka: 'ნაწილები / შეკეთება',
    },
    description: {
      fr: 'Pièces détachées & réparation',
      ru: 'Запчасти и ремонт',
      hy: 'Պահեստամասեր և վերանորոգում',
      ka: 'სათადარიგო ნაწილები და შეკეთება',
    },
    defaultAmount: 150,
  },
  {
    id: 'oil_filters',
    category: 'other',
    chipLabel: {
      fr: 'Vidange & Filtres',
      ru: 'Масло и фильтры',
      hy: 'Յուղ և ֆիլտրեր',
      ka: 'ზეთი და ფილტრები',
    },
    description: {
      fr: 'Vidange moteur & filtres',
      ru: 'Замена масла и фильтров',
      hy: 'Շարժիչի յուղ և ֆիլտրեր',
      ka: 'ძრავის ზეთი და ფილტრები',
    },
    defaultAmount: 95,
  },
  {
    id: 'detailing',
    category: 'detailing',
    chipLabel: {
      fr: 'Detailing',
      ru: 'Мойка / Детейлинг',
      hy: 'Լվացում',
      ka: 'რეცხვა',
    },
    description: {
      fr: 'Préparation esthétique & lavage',
      ru: 'Мойка и детейлинг салона',
      hy: 'Լվացում և սրահի մաքրում',
      ka: 'ავტოსამრეცხაო და დეტეილინგი',
    },
    defaultAmount: 70,
  },
  {
    id: 'transport',
    category: 'transport',
    chipLabel: {
      fr: 'Transport',
      ru: 'Доставка',
      hy: 'Տեղափոխում',
      ka: 'ტრანსპორტი',
    },
    description: {
      fr: 'Transport / rapatriement véhicule',
      ru: 'Доставка / эвакуатор',
      hy: 'Ավտոմեքենայի տեղափոխում',
      ka: 'ტრანსპორტირება / ევაკუატორი',
    },
    defaultAmount: 180,
  },
];

export interface QuickExpenseCategoryOption {
  value: string;
  label: Record<Language, string>;
}

export const QUICK_EXPENSE_CATEGORIES: QuickExpenseCategoryOption[] = [
  {
    value: 'controle_technique',
    label: {
      fr: 'Contrôle Technique',
      ru: 'Техосмотр (CT)',
      hy: 'Տեխզննում (CT)',
      ka: 'ტექდათვალიერება (CT)',
    },
  },
  {
    value: 'transport',
    label: {
      fr: 'Transport / Convoyage',
      ru: 'Доставка / Перегон',
      hy: 'Տեղափոխում',
      ka: 'ტრანსპორტირება',
    },
  },
  {
    value: 'detailing',
    label: {
      fr: 'Lavage / Detailing',
      ru: 'Мойка / Детейлинг',
      hy: 'Լվացում / Դեթեյլինգ',
      ka: 'რეცხვა / დეტეილინგი',
    },
  },
  {
    value: 'fuel',
    label: {
      fr: 'Carburant',
      ru: 'Топливо',
      hy: 'Վառելիք',
      ka: 'საწვავი',
    },
  },
  {
    value: 'admin',
    label: {
      fr: 'Frais administratifs',
      ru: 'Оформление / Документы',
      hy: 'Փաստաթղթերի ծախսեր',
      ka: 'ადმინისტრაციული ხარჯები',
    },
  },
  {
    value: 'insurance',
    label: {
      fr: 'Assurance',
      ru: 'Страховка',
      hy: 'Ապահովագրություն',
      ka: 'დაზღვევა',
    },
  },
  {
    value: 'other',
    label: {
      fr: 'Pièces / Entretien / Autre',
      ru: 'Запчасти / Обслуживание / Прочее',
      hy: 'Պահեստամասեր / Սպասարկում / Այլ',
      ka: 'ნაწილები / მომსახურება / სხვა',
    },
  },
];

export interface QuickExpenseValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    category: string;
    description: string;
    amount: number;
    date: string;
  };
}

export function validateQuickExpenseInput(params: {
  category: string;
  description: string;
  rawAmount: string | number;
  date?: string;
  lang: Language;
}): QuickExpenseValidationResult {
  const description = params.description.trim();
  const parsedAmount =
    typeof params.rawAmount === 'number'
      ? params.rawAmount
      : Number(String(params.rawAmount).replace(',', '.').trim());

  if (!description) {
    return {
      valid: false,
      error: pickLocalized(params.lang, {
        fr: 'Veuillez saisir une description de dépense.',
        ru: 'Укажите описание расхода.',
        hy: 'Մուտքագրեք ծախսի նկարագրությունը։',
        ka: 'შეიყვანეთ ხარჯის აღწერა.',
      }),
    };
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return {
      valid: false,
      error: pickLocalized(params.lang, {
        fr: 'Veuillez saisir un montant valide supérieur à 0 €.',
        ru: 'Укажите корректную сумму больше 0 €.',
        hy: 'Մուտքագրեք 0 €-ից մեծ գումար։',
        ka: 'შეიყვანეთ 0 €-ზე მეტი თანხა.',
      }),
    };
  }

  const safeCategory =
    /^[a-zA-Z0-9_\-]+$/.test(params.category.trim()) ? params.category.trim() : 'other';
  const safeDate =
    params.date && params.date.trim()
      ? params.date.trim()
      : new Date().toISOString().slice(0, 10);

  return {
    valid: true,
    normalized: {
      category: safeCategory,
      description: description.slice(0, 200),
      amount: roundToTwo(parsedAmount),
      date: safeDate,
    },
  };
}

export interface UnifiedVehicleCostRow {
  id: string;
  source: 'expense' | 'repair';
  category: string;
  title: string;
  amount: number;
  date: string;
  createdAtMs: number;
}

function parseMs(iso?: string): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeVehicleCostRows(
  vehicleId: string,
  expenses: GeneralExpense[],
  repairs: RepairTask[]
): UnifiedVehicleCostRow[] {
  const seenExpenseIds = new Set<string>();
  const rows: UnifiedVehicleCostRow[] = [];

  for (const exp of expenses) {
    if (exp.vehicleId !== vehicleId) continue;
    if (exp.id) {
      if (seenExpenseIds.has(exp.id)) continue;
      seenExpenseIds.add(exp.id);
    }
    rows.push({
      id: exp.id,
      source: 'expense',
      category: exp.category || 'other',
      title: exp.description,
      amount: roundToTwo(Math.max(0, Number(exp.amount) || 0)),
      date: exp.date || '',
      createdAtMs: parseMs(exp.createdAt) || parseMs(exp.date),
    });
  }

  const seenRepairIds = new Set<string>();
  for (const rep of repairs) {
    if (rep.vehicleId !== vehicleId) continue;
    if (rep.id) {
      if (seenRepairIds.has(rep.id)) continue;
      seenRepairIds.add(rep.id);
    }
    const parts = Number(rep.partsCost) || 0;
    const labor = Number(rep.laborCost) || 0;
    const cost = parts > 0 || labor > 0 ? parts + labor : Number(rep.totalCost) || 0;
    rows.push({
      id: rep.id,
      source: 'repair',
      category: 'repair',
      title: rep.title,
      amount: roundToTwo(Math.max(0, cost)),
      date: rep.date || '',
      createdAtMs: parseMs(rep.createdAt) || parseMs(rep.date),
    });
  }

  rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return rows;
}

export function resolveVehicleQuickFlags(
  vehicle: Pick<Vehicle, 'ctPassed' | 'docsCompleted'>
): { ctPassed: boolean; docsCompleted: boolean } {
  return {
    ctPassed: Boolean(vehicle.ctPassed),
    docsCompleted: Boolean(vehicle.docsCompleted),
  };
}
