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

export type LayoutMode = 'classic' | 'sidebar';
export type UserLayoutPreference = 'global' | LayoutMode;

export type LegalStatus =
  | 'micro_entreprise'
  | 'sarl'
  | 'sas'
  | 'eurl'
  | 'sasu'
  | 'ei'
  | 'other';

export type TaxRegime = 'sarl' | 'sas' | 'micro' | 'custom' | 'none';

export type VatRegime = 'tva_marge' | 'tva_total' | 'franchise_base' | 'custom';

export type IsRateMode = 'progressive_15_25' | 'standard_25' | 'reduced_15' | 'custom';

export interface TaxEffectiveDates {
  urssaf: string;
  is: string;
  vat: string;
}

export interface FrenchTaxConfiguration {
  legalStatus: LegalStatus;
  businessTaxRegime: TaxRegime;
  // Micro-entreprise (Achat / Revente)
  socialContributionRate: number;      // Default: 12.3%
  versementLiberatoireEnabled: boolean;
  versementLiberatoireRate: number;    // Default: 1%
  microBicAbattementPercent: number;   // Default: 71% for achat/revente
  microBicIncomeTaxRate: number;       // Default: 11% estimated IR rate when VL is NO
  // SARL / SAS Corporate Tax (Impôt sur les Sociétés - IS)
  isRateMode: IsRateMode;              // Default: 'progressive_15_25'
  corporateTaxRateReduced: number;     // Default: 15%
  corporateTaxRateStandard: number;    // Default: 25%
  corporateTaxCustomRate: number;      // Custom IS rate
  reducedIsEligible: boolean;          // Default: true (turnover < 10M€, etc.)
  reducedIsThreshold: number;          // Default: 42500 €
  annualTaxableProfit: number;         // Company annual taxable profit for IS calculation
  financialYear: number;               // e.g. 2026
  // French VAT (TVA)
  vatRegime: VatRegime;                // Default: 'tva_marge'
  vatRatePercent: number;              // Default: 20%
  // Versioning / Effective Dates
  effectiveDates: TaxEffectiveDates;
  lastModifiedAt?: string;
  lastModifiedBy?: string;
}

export interface IsCalculationHistoryEntry {
  id: string;
  financialYear: number;
  legalStatus: LegalStatus;
  annualTaxableProfit: number;
  reducedIsEligible: boolean;
  isRateMode: IsRateMode;
  bracket15Base: number;
  bracket15Tax: number;
  bracket25Base: number;
  bracket25Tax: number;
  totalIsTax: number;
  effectiveRatePercent: number;
  calculatedAt: string;
  recordedBy?: string;
  notes?: string;
}

export interface TaxSettingsAuditEntry {
  id: string;
  timestamp: string;
  actorEmail: string;
  summary: string;
  changes: { field: string; oldValue: string; newValue: string }[];
}

export interface TransactionTaxSnapshot {
  legalStatus: LegalStatus;
  taxRegime: TaxRegime;
  taxLabel: string;
  vatRegime: VatRegime;
  vatRatePercent: number;
  vatBaseAmount: number;
  vatAmount: number;
  htAmount: number;
  ttcAmount: number;
  vatLegalMention: string;
  salePrice: number;
  purchasePrice: number;
  repairCostTotal: number;
  generalExpensesTotal: number;
  profitBeforeTaxes: number;
  urssafRate: number;
  urssafAmount: number;
  versementLiberatoireEnabled: boolean;
  versementLiberatoireRate: number;
  versementLiberatoireAmount: number;
  microBicEstimatedTax: number;
  corporateIsContextNote: string;
  corporateTaxEstimatedAmount: number;
  totalTaxAmount: number;
  netProfitAfterTax: number;
  effectiveDate: string;
  capturedAt: string;
  isHistoricalSnapshot: true;
  disclaimerNote: string;
}

export interface GarageSettings {
  garageId?: string;
  entityType?: 'morale' | 'physique';
  legalStatus?: LegalStatus;
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
  layoutMode?: UserLayoutPreference;
  defaultMarginPercent?: number;
  taxRegime?: TaxRegime;
  taxRatePercent?: number;
  currency?: 'EUR' | 'USD' | 'CHF' | 'GBP';
  frenchTaxConfig?: FrenchTaxConfiguration;
  isCalculationHistory?: IsCalculationHistoryEntry[];
  taxAuditHistory?: TaxSettingsAuditEntry[];
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
  vatRegime?: VatRegime;
  vatRatePercent?: number;
  taxSnapshot?: TransactionTaxSnapshot;
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
  fuelType?: string;
  gearbox?: string;
  typeVariantVersion?: string; // (D.2) Type, variante, version
  nationalGenre?: string;      // (J.1) Genre national
  bodyType?: string;           // (J.3) Carrosserie
  formulaNumber?: string;      // Numéro de formule
  certificateDate?: string;    // (I) Date du certificat d'immatriculation
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
  labelHy: string;
  labelKa: string;
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
    labelHy: 'Յուղի և ֆիլտրերի փոխարինում (յուղի, օդի, սրահի)',
    labelKa: 'ზეთისა და ფილტრების შეცვლა (ზეთის, ჰაერის, სალონის)',
    labelEn: 'Oil & Filter Service',
    defaultCategory: 'Moteur',
    estimatedParts: 85,
    estimatedLabor: 60,
  },
  {
    id: 'timing_belt',
    labelFr: 'Kit Distribution & Pompe à eau',
    labelRu: 'Комплект ремня ГРМ и водяной насос (помпа)',
    labelHy: 'ԳՐՄ գոտու հավաքածու և ջրի պոմպ',
    labelKa: 'ძრავის ღვედის (ГРМ) კომპლექტი და წყლის ტუმბო (პომპა)',
    labelEn: 'Timing Belt & Water Pump',
    defaultCategory: 'Moteur',
    estimatedParts: 220,
    estimatedLabor: 250,
  },
  {
    id: 'clutch',
    labelFr: 'Remplacement Embrayage & Butée',
    labelRu: 'Замена сцепления и выжимного подшипника',
    labelHy: 'Կցորդման համակարգի և առանցքակալի փոխարինում',
    labelKa: 'გადაბმულობის კომპლექტის და საკისრის შეცვლა',
    labelEn: 'Clutch Replacement',
    defaultCategory: 'Transmission',
    estimatedParts: 280,
    estimatedLabor: 320,
  },
  {
    id: 'brake_pads',
    labelFr: 'Disques & Plaquettes de frein avant/arrière',
    labelRu: 'Тормозные диски и колодки (перед / зад)',
    labelHy: 'Արգելակման սկավառակներ և կոճղակներ (առջև / հետև)',
    labelKa: 'სამუხრუჭე დისკები და ხუნდები (წინა / უკანა)',
    labelEn: 'Brake Discs & Pads',
    defaultCategory: 'Freinage',
    estimatedParts: 140,
    estimatedLabor: 80,
  },
  {
    id: 'diagnostics',
    labelFr: 'Diagnostic valise OBD & Effacement défauts',
    labelRu: 'Компьютерная диагностика OBD и сброс ошибок',
    labelHy: 'Համակարգչային OBD ախտորոշում և սխալների մաքրում',
    labelKa: 'კომპიუტერული OBD დიაგნოსტიკა და შეცდომების წაშლა',
    labelEn: 'OBD Diagnostics Scan',
    defaultCategory: 'Électronique',
    estimatedParts: 0,
    estimatedLabor: 50,
  },
  {
    id: 'controle_technique_prep',
    labelFr: 'Pré-Contrôle Technique & Réglage feux',
    labelRu: 'Подготовка к техосмотру и регулировка фар',
    labelHy: 'Նախապատրաստում տեխզննմանը և լուսարձակների կարգավորում',
    labelKa: 'ტექდათვალიერებისთვის მომზადება და ფარების რეგულირება',
    labelEn: 'Pre-MOT Inspection',
    defaultCategory: 'Contrôle',
    estimatedParts: 30,
    estimatedLabor: 60,
  },
  {
    id: 'detailing',
    labelFr: 'Nettoyage Intérieur/Extérieur & Polissage carrosserie',
    labelRu: 'Химчистка салона, полировка и детейлинг кузова',
    labelHy: 'Սրահի քիմմաքրում, փայլեցում և թափքի դեթեյլինգ',
    labelKa: 'სალონის ქიმწმენდა, პოლირება და დეტეილინგი',
    labelEn: 'Detailing & Polish',
    defaultCategory: 'Esthétique',
    estimatedParts: 45,
    estimatedLabor: 120,
  },
  {
    id: 'tires',
    labelFr: 'Remplacement Train de pneus & Géométrie',
    labelRu: 'Замена комплекта шин и сход-развал',
    labelHy: 'Անվադողերի փոխարինում և անվաբացքի կարգավորում',
    labelKa: 'საბურავების შეცვლა და თვლების გაწონასწორება/развал',
    labelEn: 'Tires & Alignment',
    defaultCategory: 'Châssis',
    estimatedParts: 180,
    estimatedLabor: 70,
  },
  {
    id: 'battery',
    labelFr: 'Remplacement Batterie 12V & Test alternateur',
    labelRu: 'Замена аккумулятора 12V и проверка генератора',
    labelHy: '12V մարտկոցի փոխարինում և գեներատորի ստուգում',
    labelKa: '12V აკუმულატორის შეცვლა და გენერატორის შემოწმება',
    labelEn: 'Battery Replacement',
    defaultCategory: 'Électrique',
    estimatedParts: 110,
    estimatedLabor: 30,
  },
];

export const EXPENSE_CATEGORIES: {
  id: GeneralExpenseCategory;
  labelFr: string;
  labelRu: string;
  labelHy: string;
  labelKa: string;
  icon: string;
}[] = [
  {
    id: 'transport',
    labelFr: 'Transport / Rapatriement',
    labelRu: 'Доставка / Эвакуатор',
    labelHy: 'Տեղափոխում / Էվակուատոր',
    labelKa: 'ტრანსპორტირება / ევაკუატორი',
    icon: 'Truck',
  },
  {
    id: 'fuel',
    labelFr: 'Carburant',
    labelRu: 'Топливо',
    labelHy: 'Վառելիք',
    labelKa: 'საწვავი',
    icon: 'Fuel',
  },
  {
    id: 'controle_technique',
    labelFr: 'Contrôle Technique',
    labelRu: 'Техосмотр (Contrôle Technique)',
    labelHy: 'Տեխզննում (Contrôle Technique)',
    labelKa: 'ტექდათვალიერება (Contrôle Technique)',
    icon: 'FileCheck',
  },
  {
    id: 'detailing',
    labelFr: 'Lavage / Detailing',
    labelRu: 'Мойка / Детейлинг',
    labelHy: 'Լվացում / Դեթեյլինգ',
    labelKa: 'რეცხვა / დეტეილინგი',
    icon: 'Sparkles',
  },
  {
    id: 'admin',
    labelFr: 'Frais Administratifs / Carte Grise',
    labelRu: 'Госпошлины / Оформление документов',
    labelHy: 'Պետտուրքեր / Փաստաթղթերի ձևակերպում',
    labelKa: 'ადმინისტრაციული ხარჯები / Carte Grise',
    icon: 'FileText',
  },
  {
    id: 'insurance',
    labelFr: 'Assurance garage / Flotte transit',
    labelRu: 'Страховка автопарка / Транзит',
    labelHy: 'Ավտոպարկի ապահովագրություն / Տրանզիտ',
    labelKa: 'ავტოპარკის დაზღვევა / ტრანზიტი',
    icon: 'ShieldCheck',
  },
  {
    id: 'other',
    labelFr: 'Autre dépense',
    labelRu: 'Прочие расходы',
    labelHy: 'Այլ ծախսեր',
    labelKa: 'სხვა ხარჯები',
    icon: 'Coins',
  },
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
  featuresHy?: string[];
  featuresKa?: string[];
}

export interface CerfaGlobalAdjustments {
  offsetX: number;
  offsetY: number;
  fontSizeDelta: number;
  defaultTemplate: string;
}

export interface ThemePaletteTokens {
  background: string;
  card: string;
  surfaceMuted: string;
  primary: string;
  primaryForeground: string;
  foreground: string;
  secondaryForeground: string;
  mutedForeground: string;
  border: string;
  success: string;
  warning: string;
  // Section-by-section tokens
  headerBg?: string;
  headerText?: string;
  headerBorder?: string;
  navActiveBg?: string;
  navActiveText?: string;
  detailContainerBg?: string;
  metricBoxBg?: string;
  saleReceiptBg?: string;
  detailHeadingColor?: string;
  profitColor?: string;
  expenseColor?: string;
  tableHeaderBg?: string;
  tableRowHover?: string;
  chartAccent?: string;
  modalBg?: string;
}

export type CardPaddingDensity = 'compact' | 'comfortable' | 'spacious';
export type ButtonBorderRadius = '6px' | '10px' | '12px' | '16px';
export type SectionGapSize = '16px' | '24px' | '32px';

export interface SystemThemeConfig {
  primaryAccentColor: string;
  cardBorderRadius: '6px' | '12px' | '16px' | '24px';
  buttonBorderRadius?: ButtonBorderRadius;
  cardPadding?: CardPaddingDensity;
  sectionGap?: SectionGapSize;
  defaultInventoryViewMode: 'grid' | 'list';
  layoutMode?: LayoutMode;
  cerfaAdjustments: CerfaGlobalAdjustments;
  lightPalette?: ThemePaletteTokens;
  darkPalette?: ThemePaletteTokens;
  updatedAt?: string;
  updatedBy?: string;
}

export interface GarageWorkspace {
  id: string;
  userId: string;
  name: string;
  entityType: 'morale' | 'physique';
  legalStatus?: LegalStatus;
  city?: string;
  siret?: string;
  taxRegime?: TaxRegime;
  taxRatePercent?: number;
  frenchTaxConfig?: FrenchTaxConfiguration;
  createdAt: string;
  updatedAt: string;
}

export interface DynamicExpenseCategory {
  id: string;
  labelFr: string;
  labelRu: string;
  labelHy?: string;
  labelKa?: string;
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

export type GlobalTextOverrides = Record<
  string,
  { fr?: string; ru?: string; hy?: string; ka?: string; color?: string }
>;

export type SupplierType =
  | 'private_seller'
  | 'dealership'
  | 'auction'
  | 'parts_supplier'
  | 'workshop'
  | 'transport_company';

export type PurchasePaymentMethod =
  | 'bank_transfer'
  | 'card'
  | 'cash'
  | 'check'
  | 'financing'
  | 'other';

export type PurchaseCategory =
  | 'vehicle'
  | 'parts'
  | 'repair'
  | 'transport'
  | 'other';

export interface PurchaseDocument {
  id: string;
  name: string;
  url: string;
  date: string;
  kind: 'invoice' | 'vehicle_doc' | 'other';
}

export interface Supplier {
  id: string;
  userId: string;
  garageId?: string;
  name: string;
  type: SupplierType;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  siret?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Purchase {
  id: string;
  userId: string;
  garageId?: string;
  supplierId: string;
  supplierName: string;
  supplierType: SupplierType;
  vehicleId?: string;
  vehicleLabel?: string;
  category: PurchaseCategory;
  description: string;
  amount: number;
  date: string;
  paymentMethod: PurchasePaymentMethod;
  invoiceNumber?: string;
  invoiceProofName?: string;
  invoiceProofUrl?: string;
  vehicleDocuments: PurchaseDocument[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type GarageDocumentCategory =
  | 'carte_grise'
  | 'certificat_cession'
  | 'controle_technique'
  | 'facture_achat'
  | 'facture_reparation'
  | 'facture_vente'
  | 'photos_vehicule'
  | 'contrats'
  | 'justificatif_paiement'
  | 'documents_administratifs';

export type DocumentBindingType = 'vehicle' | 'client';

export type DocumentHistoryAction =
  | 'uploaded'
  | 'updated'
  | 'downloaded'
  | 'linked'
  | 'deleted';

export interface DocumentHistoryEvent {
  id: string;
  userId: string;
  garageId?: string;
  documentId: string;
  documentTitle: string;
  category: GarageDocumentCategory;
  action: DocumentHistoryAction;
  timestamp: string;
  actorEmail?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  clientName?: string;
  details?: string;
}

export interface GarageDocument {
  id: string;
  userId: string;
  garageId?: string;
  title: string;
  category: GarageDocumentCategory;
  bindingType: DocumentBindingType;
  vehicleId?: string;
  vehicleLabel?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  documentDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserActivityAction =
  | 'export_csv'
  | 'export_excel'
  | 'export_pdf'
  | 'export_facturx'
  | 'backup_created'
  | 'backup_restored'
  | 'vehicle_created'
  | 'vehicle_updated'
  | 'vehicle_sold'
  | 'vehicle_deleted'
  | 'supplier_created'
  | 'purchase_created'
  | 'document_uploaded'
  | 'settings_updated'
  | 'tax_settings_updated'
  | 'is_calculation_recorded'
  | 'auth_login';

export interface UserActivityLog {
  id: string;
  userId: string;
  garageId?: string;
  actorEmail: string;
  action: UserActivityAction;
  entityType?: ChangeLogEntityType;
  entityId?: string;
  targetLabel: string;
  details?: string;
  timestamp: string;
}

export type ChangeLogOperation = 'create' | 'update' | 'delete' | 'restore';

export type ChangeLogEntityType =
  | 'vehicle'
  | 'repair'
  | 'expense'
  | 'supplier'
  | 'purchase'
  | 'document'
  | 'settings'
  | 'backup';

export interface ChangeLogFieldDiff {
  field: string;
  oldValue: string;
  newValue: string;
}

export interface ChangeLogEntry {
  id: string;
  userId: string;
  garageId?: string;
  actorEmail: string;
  operation: ChangeLogOperation;
  entityType: ChangeLogEntityType;
  entityId: string;
  entityLabel: string;
  changes: ChangeLogFieldDiff[];
  timestamp: string;
}

export type BackupRestoreMode = 'merge' | 'replace';

export interface FullGarageBackupV2 {
  version: 2;
  exportedAt: string;
  garageId?: string;
  actorEmail?: string;
  vehicles: Vehicle[];
  repairs: RepairTask[];
  expenses: GeneralExpense[];
  suppliers: Supplier[];
  purchases: Purchase[];
  documents: GarageDocument[];
  documentHistory: DocumentHistoryEvent[];
  settings: GarageSettings;
}

export interface BackupSnapshotCounts {
  vehicles: number;
  repairs: number;
  expenses: number;
  suppliers: number;
  purchases: number;
  documents: number;
}

export interface BackupSnapshotRecord {
  id: string;
  userId: string;
  garageId?: string;
  label: string;
  actorEmail: string;
  createdAt: string;
  sizeBytes: number;
  counts: BackupSnapshotCounts;
  payloadJson?: string;
}

