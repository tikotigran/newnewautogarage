export type VehicleStatus = 'preparation' | 'repair' | 'for_sale' | 'sold';

export type RepairTaskStatus = 'todo' | 'in_progress' | 'done';

export type GeneralExpenseCategory =
  | 'transport'
  | 'controle_technique'
  | 'detailing'
  | 'admin'
  | 'fuel'
  | 'insurance'
  | 'other';

export interface VehicleDocument {
  id: string;
  name: string;
  url: string;
  date: string;
  type: string;
}

export interface GarageSettings {
  garageId?: string;
  entityType?: 'morale' | 'physique';
  name: string;
  lastName?: string;
  firstName?: string;
  sex?: 'M' | 'F' | '';
  siret: string;
  streetNumber: string;
  streetExtension?: string;
  streetType?: string;
  streetName: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  legalForm?: string;
  tvaMention?: string;
  defaultCerfaTemplate?: string;
  theme?: 'dark' | 'light';
  defaultMarginPercent?: number;
  taxRegime?: 'sarl' | 'micro' | 'custom' | 'none';
  taxRatePercent?: number;
  currency?: 'EUR' | 'USD' | 'CHF' | 'GBP';
}

export interface BuyerInfo {
  fullName: string;
  isCompany?: boolean;
  siret?: string;
  birthDate?: string;      // Né(e) le ... for Cerfa 15776
  birthPlace?: string;     // à ... for Cerfa 15776
  streetNumber?: string;   // N° de la voie
  streetName?: string;     // Nom de la voie
  postalCode?: string;     // Code postal
  city?: string;           // Commune
  address: string;         // Full combined address
  phone: string;
  email: string;
  salePrice: number;
  saleDate: string;
  saleTime?: string;       // e.g. "14:30"
}

export interface Vehicle {
  id: string;
  userId: string;
  garageId?: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  mileage: number;
  vin: string;
  registrationNumber?: string;
  purchaseDate: string;
  purchasePrice: number;
  targetSalePrice: number;
  status: VehicleStatus;
  photos: string[];
  documents: VehicleDocument[];
  buyerInfo?: BuyerInfo;
  repairCostTotal: number;
  generalExpensesTotal: number;
  totalExpenses: number;
  totalInvested: number;
  netProfit: number;
  marginPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface RepairTask {
  id: string;
  vehicleId: string;
  userId: string;
  garageId?: string;
  title: string;
  status: RepairTaskStatus;
  partsCost: number;
  laborCost: number;
  totalCost: number;
  categoryPreset?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneralExpense {
  id: string;
  vehicleId: string;
  userId: string;
  garageId?: string;
  category: GeneralExpenseCategory | string;
  description: string;
  amount: number;
  date: string;
  receiptUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskPreset {
  id: string;
  labelFr: string;
  labelRu: string;
  labelEn: string;
  defaultCategory: string;
  estimatedParts?: number;
  estimatedLabor?: number;
}

export const TASK_PRESETS: TaskPreset[] = [
  {
    id: 'oil_change',
    labelFr: 'Vidange & Filtres (Huile, Air, Habitacle)',
    labelRu: 'Замена масла и фильтров (масляный, воздушный, салонный)',
    labelEn: 'Oil & Filter Service',
    defaultCategory: 'Moteur',
    estimatedParts: 85,
    estimatedLabor: 60,
  },
  {
    id: 'timing_belt',
    labelFr: 'Kit Distribution & Pompe à eau',
    labelRu: 'Комплект ремня ГРМ и водяной насос (помпа)',
    labelEn: 'Timing Belt & Water Pump',
    defaultCategory: 'Moteur',
    estimatedParts: 220,
    estimatedLabor: 250,
  },
  {
    id: 'clutch',
    labelFr: 'Remplacement Embrayage & Butée',
    labelRu: 'Замена сцепления и выжимного подшипника',
    labelEn: 'Clutch Replacement',
    defaultCategory: 'Transmission',
    estimatedParts: 280,
    estimatedLabor: 320,
  },
  {
    id: 'brake_pads',
    labelFr: 'Disques & Plaquettes de frein avant/arrière',
    labelRu: 'Тормозные диски и колодки (перед / зад)',
    labelEn: 'Brake Discs & Pads',
    defaultCategory: 'Freinage',
    estimatedParts: 140,
    estimatedLabor: 80,
  },
  {
    id: 'diagnostics',
    labelFr: 'Diagnostic valise OBD & Effacement défauts',
    labelRu: 'Компьютерная диагностика OBD и сброс ошибок',
    labelEn: 'OBD Diagnostics Scan',
    defaultCategory: 'Électronique',
    estimatedParts: 0,
    estimatedLabor: 50,
  },
  {
    id: 'controle_technique_prep',
    labelFr: 'Pré-Contrôle Technique & Réglage feux',
    labelRu: 'Подготовка к техосмотру и регулировка фар',
    labelEn: 'Pre-MOT Inspection',
    defaultCategory: 'Contrôle',
    estimatedParts: 30,
    estimatedLabor: 60,
  },
  {
    id: 'detailing',
    labelFr: 'Nettoyage Intérieur/Extérieur & Polissage carrosserie',
    labelRu: 'Химчистка салона, полировка и детейлинг кузова',
    labelEn: 'Detailing & Polish',
    defaultCategory: 'Esthétique',
    estimatedParts: 45,
    estimatedLabor: 120,
  },
  {
    id: 'tires',
    labelFr: 'Remplacement Train de pneus & Géométrie',
    labelRu: 'Замена комплекта шин и сход-развал',
    labelEn: 'Tires & Alignment',
    defaultCategory: 'Châssis',
    estimatedParts: 180,
    estimatedLabor: 70,
  },
  {
    id: 'battery',
    labelFr: 'Remplacement Batterie 12V & Test alternateur',
    labelRu: 'Замена аккумулятора 12V и проверка генератора',
    labelEn: 'Battery Replacement',
    defaultCategory: 'Électrique',
    estimatedParts: 110,
    estimatedLabor: 30,
  },
];

export const EXPENSE_CATEGORIES: { id: GeneralExpenseCategory; labelFr: string; labelRu: string; icon: string }[] = [
  { id: 'transport', labelFr: 'Transport / Rapatriement', labelRu: 'Доставка / Эвакуатор', icon: 'Truck' },
  { id: 'fuel', labelFr: 'Carburant', labelRu: 'Топливо', icon: 'Fuel' },
  { id: 'controle_technique', labelFr: 'Contrôle Technique', labelRu: 'Техосмотр (Contrôle Technique)', icon: 'FileCheck' },
  { id: 'detailing', labelFr: 'Lavage / Detailing', labelRu: 'Мойка / Детейлинг', icon: 'Sparkles' },
  { id: 'admin', labelFr: 'Frais Administratifs / Carte Grise', labelRu: 'Госпошлины / Оформление документов', icon: 'FileText' },
  { id: 'insurance', labelFr: 'Assurance garage / Flotte transit', labelRu: 'Страховка автопарка / Транзит', icon: 'ShieldCheck' },
  { id: 'other', labelFr: 'Autre dépense', labelRu: 'Прочие расходы', icon: 'Coins' },
];

export type UserRole = 'user' | 'superadmin';
export type SubscriptionPlanId = 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'canceled';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  garageName: string;
  role: UserRole;
  planId: SubscriptionPlanId;
  vehicleLimit: number;
  activeVehiclesCount: number;
  subscriptionStatus: SubscriptionStatus;
  mrrAmount: number;
  lastPaymentDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  priceMonthly: number;
  vehicleLimit: number;
  featuresFr: string[];
  featuresRu: string[];
}

export interface CerfaGlobalAdjustments {
  offsetX: number;
  offsetY: number;
  fontSizeDelta: number;
  defaultTemplate: string;
}

export interface SystemThemeConfig {
  primaryAccentColor: string;
  cardBorderRadius: '6px' | '12px' | '16px' | '24px';
  defaultInventoryViewMode: 'grid' | 'list';
  cerfaAdjustments: CerfaGlobalAdjustments;
  updatedAt?: string;
  updatedBy?: string;
}

export interface GarageWorkspace {
  id: string;
  userId: string;
  name: string;
  entityType: 'morale' | 'physique';
  city?: string;
  siret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DynamicExpenseCategory {
  id: string;
  labelFr: string;
  labelRu: string;
  icon: string;
  defaultAmount?: number;
  order: number;
}

export interface FeatureFlagsConfig {
  cerfaGenerator: boolean;
  pnlCalculator: boolean;
  expenseAnalytics: boolean;
  multiGarage: boolean;
  repairChecklist: boolean;
}

export type GlobalTextOverrides = Record<string, { fr?: string; ru?: string }>;



