import {
  Purchase,
  PurchaseCategory,
  PurchasePaymentMethod,
  Supplier,
  SupplierType,
  Vehicle,
} from '../types/garage';
import {
  calculateSaleTaxReport,
  getRealizedSalePrice,
  roundToTwo,
  TaxRegime,
} from './finance';
import { DEFAULT_GARAGE_ID } from './garageUtils';
import { Language, pickLocalized } from './i18nUtils';

export interface SupplierTypeMeta {
  id: SupplierType;
  labelFr: string;
  labelRu: string;
  labelHy: string;
  labelKa: string;
  isVehicleSource: boolean;
}

export const SUPPLIER_TYPES: SupplierTypeMeta[] = [
  {
    id: 'private_seller',
    labelFr: 'Particuliers',
    labelRu: 'Частные продавцы',
    labelHy: 'Մասնավոր վաճառողներ',
    labelKa: 'კერძო გამყიდველები',
    isVehicleSource: true,
  },
  {
    id: 'dealership',
    labelFr: 'Concessions / Garages',
    labelRu: 'Автосалоны',
    labelHy: 'Ավտոսրահներ',
    labelKa: 'ავტოსალონები',
    isVehicleSource: true,
  },
  {
    id: 'auction',
    labelFr: 'Enchères / Ventes pro',
    labelRu: 'Аукционы',
    labelHy: 'Աճուրդներ',
    labelKa: 'აუქციონები',
    isVehicleSource: true,
  },
  {
    id: 'parts_supplier',
    labelFr: 'Fournisseurs de pièces',
    labelRu: 'Поставщики запчастей',
    labelHy: 'Պահեստամասերի մատակարարներ',
    labelKa: 'სათადარიგო ნაწილების მომწოდებლები',
    isVehicleSource: false,
  },
  {
    id: 'workshop',
    labelFr: 'Ateliers / Mécanique',
    labelRu: 'Автомастерские',
    labelHy: 'Ավտոարհեստանոցներ',
    labelKa: 'ავტოსახელოსნოები',
    isVehicleSource: false,
  },
  {
    id: 'transport_company',
    labelFr: 'Transporteurs / Logistique',
    labelRu: 'Транспортные компании',
    labelHy: 'Տրանսպորտային ընկերություններ',
    labelKa: 'სატრანსპორტო კომპანიები',
    isVehicleSource: false,
  },
];

export const PAYMENT_METHODS: {
  id: PurchasePaymentMethod;
  labelFr: string;
  labelRu: string;
  labelHy: string;
  labelKa: string;
}[] = [
  {
    id: 'bank_transfer',
    labelFr: 'Virement bancaire',
    labelRu: 'Банковский перевод',
    labelHy: 'Բանկային փոխանցում',
    labelKa: 'საბანკო გადარიცხვა',
  },
  {
    id: 'card',
    labelFr: 'Carte bancaire',
    labelRu: 'Банковская карта',
    labelHy: 'Բանկային քարտ',
    labelKa: 'საბანკო ბარათი',
  },
  {
    id: 'cash',
    labelFr: 'Espèces',
    labelRu: 'Наличные',
    labelHy: 'Կանխիկ',
    labelKa: 'ნაღდი ფული',
  },
  {
    id: 'check',
    labelFr: 'Chèque',
    labelRu: 'Чек',
    labelHy: 'Չեկ',
    labelKa: 'ჩეკი',
  },
  {
    id: 'financing',
    labelFr: 'Financement / Crédit',
    labelRu: 'Кредит / Лизинг',
    labelHy: 'Վարկ / Լիզինգ',
    labelKa: 'კრედიტი / ლიზინგი',
  },
  {
    id: 'other',
    labelFr: 'Autre',
    labelRu: 'Другое',
    labelHy: 'Այլ',
    labelKa: 'სხვა',
  },
];

export const PURCHASE_CATEGORIES: {
  id: PurchaseCategory;
  labelFr: string;
  labelRu: string;
  labelHy: string;
  labelKa: string;
}[] = [
  {
    id: 'vehicle',
    labelFr: 'Achat véhicule',
    labelRu: 'Покупка автомобиля',
    labelHy: 'Ավտոմեքենայի գնում',
    labelKa: 'ავტომობილის შესყიდვა',
  },
  {
    id: 'parts',
    labelFr: 'Pièces détachées',
    labelRu: 'Запчасти',
    labelHy: 'Պահեստամասեր',
    labelKa: 'სათადარიგო ნაწილები',
  },
  {
    id: 'repair',
    labelFr: 'Prestation atelier',
    labelRu: 'Услуги автомастерской',
    labelHy: 'Արհեստանոցի ծառայություններ',
    labelKa: 'ავტოსახელოსნოს მომსახურება',
  },
  {
    id: 'transport',
    labelFr: 'Transport / Convoyage',
    labelRu: 'Доставка / Эвакуатор',
    labelHy: 'Առաքում / Էվակուատոր',
    labelKa: 'ტრანსპორტირება / ევაკუატორი',
  },
  {
    id: 'other',
    labelFr: 'Autre achat',
    labelRu: 'Прочая закупка',
    labelHy: 'Այլ գնում',
    labelKa: 'სხვა შესყიდვა',
  },
];

export function getSupplierTypeLabel(type: SupplierType, lang: Language): string {
  const found = SUPPLIER_TYPES.find((t) => t.id === type);
  if (!found) return type;
  return pickLocalized(lang, {
    fr: found.labelFr,
    ru: found.labelRu,
    hy: found.labelHy,
    ka: found.labelKa,
  });
}

export function getPaymentMethodLabel(method: PurchasePaymentMethod, lang: Language): string {
  const found = PAYMENT_METHODS.find((m) => m.id === method);
  if (!found) return method;
  return pickLocalized(lang, {
    fr: found.labelFr,
    ru: found.labelRu,
    hy: found.labelHy,
    ka: found.labelKa,
  });
}

export function getPurchaseCategoryLabel(category: PurchaseCategory, lang: Language): string {
  const found = PURCHASE_CATEGORIES.find((c) => c.id === category);
  if (!found) return category;
  return pickLocalized(lang, {
    fr: found.labelFr,
    ru: found.labelRu,
    hy: found.labelHy,
    ka: found.labelKa,
  });
}

export function filterSuppliersByGarage(
  suppliers: Supplier[],
  activeGarageId: string | null
): Supplier[] {
  if (!activeGarageId) return suppliers;
  return suppliers.filter((s) =>
    s.garageId ? s.garageId === activeGarageId : activeGarageId === DEFAULT_GARAGE_ID
  );
}

export function filterPurchasesByGarage(
  purchases: Purchase[],
  activeGarageId: string | null
): Purchase[] {
  if (!activeGarageId) return purchases;
  return purchases.filter((p) =>
    p.garageId ? p.garageId === activeGarageId : activeGarageId === DEFAULT_GARAGE_ID
  );
}

export function validateSupplierInput(input: {
  name: string;
  type: SupplierType;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  siret?: string;
  notes?: string;
}): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) {
    errors.push('name_required');
  } else if (name.length > 120) {
    errors.push('name_too_long');
  }
  if (!SUPPLIER_TYPES.some((t) => t.id === input.type)) {
    errors.push('invalid_type');
  }
  if (input.email && input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.push('invalid_email');
  }
  return errors;
}

export function validatePurchaseInput(input: {
  supplierId: string;
  category: PurchaseCategory;
  description: string;
  amount: number;
  date: string;
  paymentMethod: PurchasePaymentMethod;
}): string[] {
  const errors: string[] = [];
  if (!input.supplierId.trim()) errors.push('supplier_required');
  if (!input.description.trim()) errors.push('description_required');
  if (input.description.trim().length > 240) errors.push('description_too_long');
  if (Number.isNaN(Number(input.amount)) || Number(input.amount) < 0) {
    errors.push('invalid_amount');
  }
  if (!input.date.trim()) errors.push('date_required');
  if (!PAYMENT_METHODS.some((m) => m.id === input.paymentMethod)) {
    errors.push('invalid_payment_method');
  }
  if (!PURCHASE_CATEGORIES.some((c) => c.id === input.category)) {
    errors.push('invalid_category');
  }
  return errors;
}

export interface SupplierSummary {
  supplier: Supplier;
  purchasesCount: number;
  totalSpent: number;
  lastPurchaseDate: string | null;
  linkedVehicleIds: string[];
  soldVehiclesCount: number;
  realizedNetProfit: number;
  realizedInvestedOnSold: number;
  roiPercent: number | null;
  deals: Purchase[];
}

export interface ChannelProfitabilityRow {
  type: SupplierType;
  labelFr: string;
  labelRu: string;
  labelHy: string;
  labelKa: string;
  isVehicleSource: boolean;
  suppliersCount: number;
  purchasesCount: number;
  vehiclePurchasesCount: number;
  totalSpent: number;
  linkedVehiclesCount: number;
  soldVehiclesCount: number;
  realizedRevenue: number;
  realizedGrossProfit: number;
  realizedNetProfit: number;
  averageNetProfitPerCar: number | null;
  roiPercent: number | null;
}

export interface ChannelAnalyticsResult {
  channels: ChannelProfitabilityRow[];
  bestVehicleChannel: ChannelProfitabilityRow | null;
  totalPurchasesCount: number;
  totalPurchasesSpend: number;
  totalVehiclesSourced: number;
}

function getVehicleProfitForReport(
  v: Vehicle,
  taxRegime: TaxRegime,
  taxRatePercent?: number
) {
  const salePrice = getRealizedSalePrice(v);
  const purchasePrice = Number(v.purchasePrice) || 0;
  const repairCostTotal = Number(v.repairCostTotal) || 0;
  const generalExpensesTotal = Number(v.generalExpensesTotal) || 0;
  const totalInvested = roundToTwo(purchasePrice + repairCostTotal + generalExpensesTotal);
  if (salePrice <= 0) {
    return {
      isSold: false,
      revenue: 0,
      grossProfit: 0,
      netProfit: 0,
      totalInvested,
    };
  }
  const report = calculateSaleTaxReport({
    salePrice,
    purchasePrice,
    repairCostTotal,
    generalExpensesTotal,
    taxRegime,
    taxRatePercent,
    vatRegime: v.buyerInfo?.vatRegime,
    vatRatePercent: v.buyerInfo?.vatRatePercent,
    taxSnapshot: v.buyerInfo?.taxSnapshot,
  });
  return {
    isSold: true,
    revenue: report.salePrice,
    grossProfit: report.grossMargin,
    netProfit: report.netProfitAfterTax,
    totalInvested,
  };
}

export function computeSupplierSummaries(params: {
  suppliers: Supplier[];
  purchases: Purchase[];
  vehicles: Vehicle[];
  taxRegime?: TaxRegime;
  taxRatePercent?: number;
}): SupplierSummary[] {
  const { suppliers, purchases, vehicles, taxRegime = 'sarl', taxRatePercent } = params;
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  return suppliers
    .map((supplier) => {
      const deals = purchases
        .filter((p) => p.supplierId === supplier.id)
        .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));

      const totalSpent = roundToTwo(
        deals.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      );
      const lastPurchaseDate = deals[0]?.date || null;

      const linkedVehicleIdSet = new Set<string>();
      for (const d of deals) {
        if (d.vehicleId && (d.category === 'vehicle' || vehicleMap.has(d.vehicleId))) {
          linkedVehicleIdSet.add(d.vehicleId);
        }
      }

      // Focus realized profit ROI on vehicles sourced from this supplier (category === 'vehicle')
      const sourcedVehicleIdSet = new Set<string>();
      for (const d of deals) {
        if (d.vehicleId && d.category === 'vehicle') {
          sourcedVehicleIdSet.add(d.vehicleId);
        }
      }

      let soldVehiclesCount = 0;
      let realizedNetProfit = 0;
      let realizedInvestedOnSold = 0;

      for (const vId of sourcedVehicleIdSet) {
        const veh = vehicleMap.get(vId);
        if (!veh) continue;
        const prof = getVehicleProfitForReport(veh, taxRegime, taxRatePercent);
        if (prof.isSold) {
          soldVehiclesCount += 1;
          realizedNetProfit = roundToTwo(realizedNetProfit + prof.netProfit);
          realizedInvestedOnSold = roundToTwo(realizedInvestedOnSold + prof.totalInvested);
        }
      }

      const roiPercent =
        soldVehiclesCount > 0 && realizedInvestedOnSold > 0
          ? roundToTwo((realizedNetProfit / realizedInvestedOnSold) * 100)
          : null;

      return {
        supplier,
        purchasesCount: deals.length,
        totalSpent,
        lastPurchaseDate,
        linkedVehicleIds: Array.from(linkedVehicleIdSet),
        soldVehiclesCount,
        realizedNetProfit,
        realizedInvestedOnSold,
        roiPercent,
        deals,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);
}

export function computeChannelProfitability(params: {
  suppliers: Supplier[];
  purchases: Purchase[];
  vehicles: Vehicle[];
  taxRegime?: TaxRegime;
  taxRatePercent?: number;
}): ChannelAnalyticsResult {
  const { suppliers, purchases, vehicles, taxRegime = 'sarl', taxRatePercent } = params;
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  const channels: ChannelProfitabilityRow[] = SUPPLIER_TYPES.map((meta) => {
    const channelSuppliers = suppliers.filter((s) => s.type === meta.id);
    const channelPurchases = purchases.filter((p) => {
      const effectiveType = supplierMap.get(p.supplierId)?.type || p.supplierType;
      return effectiveType === meta.id;
    });

    const totalSpent = roundToTwo(
      channelPurchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    );

    const vehiclePurchases = channelPurchases.filter((p) => p.category === 'vehicle');
    const sourcedVehicleIds = new Set<string>();
    for (const vp of vehiclePurchases) {
      if (vp.vehicleId) sourcedVehicleIds.add(vp.vehicleId);
    }

    let soldVehiclesCount = 0;
    let realizedRevenue = 0;
    let realizedGrossProfit = 0;
    let realizedNetProfit = 0;
    let totalSoldInvested = 0;

    for (const vId of sourcedVehicleIds) {
      const veh = vehicleMap.get(vId);
      if (!veh) continue;
      const prof = getVehicleProfitForReport(veh, taxRegime, taxRatePercent);
      if (prof.isSold) {
        soldVehiclesCount += 1;
        realizedRevenue = roundToTwo(realizedRevenue + prof.revenue);
        realizedGrossProfit = roundToTwo(realizedGrossProfit + prof.grossProfit);
        realizedNetProfit = roundToTwo(realizedNetProfit + prof.netProfit);
        totalSoldInvested = roundToTwo(totalSoldInvested + prof.totalInvested);
      }
    }

    const averageNetProfitPerCar =
      soldVehiclesCount > 0 ? roundToTwo(realizedNetProfit / soldVehiclesCount) : null;
    const roiPercent =
      soldVehiclesCount > 0 && totalSoldInvested > 0
        ? roundToTwo((realizedNetProfit / totalSoldInvested) * 100)
        : null;

    return {
      type: meta.id,
      labelFr: meta.labelFr,
      labelRu: meta.labelRu,
      labelHy: meta.labelHy,
      labelKa: meta.labelKa,
      isVehicleSource: meta.isVehicleSource,
      suppliersCount: channelSuppliers.length,
      purchasesCount: channelPurchases.length,
      vehiclePurchasesCount: vehiclePurchases.length,
      totalSpent,
      linkedVehiclesCount: sourcedVehicleIds.size,
      soldVehiclesCount,
      realizedRevenue,
      realizedGrossProfit,
      realizedNetProfit,
      averageNetProfitPerCar,
      roiPercent,
    };
  });

  const soldVehicleChannels = channels
    .filter((c) => c.soldVehiclesCount > 0)
    .sort((a, b) => b.realizedNetProfit - a.realizedNetProfit);

  const totalPurchasesCount = purchases.length;
  const totalPurchasesSpend = roundToTwo(
    purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  );
  const totalVehiclesSourced = new Set(
    purchases.filter((p) => p.category === 'vehicle' && p.vehicleId).map((p) => p.vehicleId!)
  ).size;

  return {
    channels,
    bestVehicleChannel: soldVehicleChannels[0] || null,
    totalPurchasesCount,
    totalPurchasesSpend,
    totalVehiclesSourced,
  };
}
