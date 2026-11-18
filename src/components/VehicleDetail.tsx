import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Wrench,
  DollarSign,
  TrendingUp,
  Calendar,
  Gauge,
  Tag,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  FileText,
  Download,
  AlertCircle,
  AlertTriangle,
  Truck,
  Sparkles,
  ShieldCheck,
  Coins,
  FileCheck,
  Edit,
  Upload,
  UserCheck,
  ExternalLink,
  ChevronRight,
  ListCheck,
  Receipt,
  Layers,
  FolderOpen,
  Image as ImageIcon,
} from 'lucide-react';
import {
  AppUserProfileType,
  Vehicle,
  VehicleStatus,
  RepairTask,
  RepairTaskStatus,
  GeneralExpense,
  GeneralExpenseCategory,
  DynamicExpenseCategory,
  FeatureFlagsConfig,
  GarageDocument,
  GarageDocumentCategory,
  DocumentHistoryEvent,
  Purchase,
  TASK_PRESETS,
} from '../types/garage';
import { ThemedSelect } from './ThemedSelect';
import {
  formatEuro,
  formatDate,
  calculateVehicleFinancials,
  calculateSaleTaxReport,
  getRealizedSalePrice,
  canDisplaySaleFinancialReport,
} from '../utils/finance';
import {
  subscribeRepairs,
  subscribeExpenses,
  addRepairTask,
  updateRepairTask,
  deleteRepairTask,
  addGeneralExpense,
  updateGeneralExpense,
  deleteGeneralExpense,
  syncVehicleFinancials,
  updateVehicle,
  getGarageSettings,
} from '../services/garageService';
import { subscribeDynamicExpenseCategories } from '../services/adminService';
import {
  DEFAULT_DYNAMIC_EXPENSE_CATEGORIES,
  DEFAULT_FEATURE_FLAGS,
} from '../utils/adminUtils';
import {
  generateSalesInvoicePDF,
  generateVehicleFinancialReportPDF,
} from '../utils/pdfGenerator';
import { Cerfa15776Modal } from './Cerfa15776Modal';
import { useI18n } from '../i18n/I18nContext';
import { getIntlLocale, pickLocalized } from '../utils/i18nUtils';
import {
  resolveDealSellerProfileType,
  resolveEffectiveSettingsForDeal,
  resolveUserProfileType,
} from '../utils/frenchTaxEngine';
import { VehiclePhotoPlaceholder } from './VehiclePhotoPlaceholder';
import {
  computeMissingDocumentReminders,
  DOCUMENT_CATEGORIES,
  extractUniqueClients,
  filterDocumentsForVehicle,
  getDocumentCategoryCounts,
  getDocumentCategoryLabel,
} from '../utils/documents';
import { triggerDocumentDownload } from '../utils/documentFileHelpers';
import { deleteGarageDocument } from '../services/documentService';
import { DocumentCard } from './DocumentCard';
import { DocumentUploadModal, DocumentUploadPreset } from './DocumentUploadModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';

interface VehicleDetailProps {
  vehicle: Vehicle;
  onBack: () => void;
  onOpenEdit: (vehicle: Vehicle) => void;
  onOpenSellModal: (vehicle: Vehicle) => void;
  onDeleteVehicle: (vehicleId: string) => void;
  userId: string;
  userEmail?: string | null;
  activeGarageId?: string | null;
  documents?: GarageDocument[];
  documentHistory?: DocumentHistoryEvent[];
  purchases?: Purchase[];
  vehicles?: Vehicle[];
  featureFlags?: FeatureFlagsConfig;
  profileType?: AppUserProfileType;
  onValidationToast?: (message: string) => void;
}

export const VehicleDetail: React.FC<VehicleDetailProps> = ({
  vehicle,
  onBack,
  onOpenEdit,
  onOpenSellModal,
  onDeleteVehicle,
  userId,
  userEmail = null,
  activeGarageId = null,
  documents = [],
  documentHistory = [],
  purchases = [],
  vehicles: allVehicles = [],
  featureFlags = DEFAULT_FEATURE_FLAGS,
  profileType: propProfileType,
  onValidationToast,
}) => {
  const { t, lang, getTextStyle } = useI18n();
  const [activeTab, setActiveTab] = useState<'overview' | 'repairs' | 'expenses' | 'documents'>('overview');
  const [repairs, setRepairs] = useState<RepairTask[]>([]);
  const [expenses, setExpenses] = useState<GeneralExpense[]>([]);
  const [repairsLoaded, setRepairsLoaded] = useState(false);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [isLoadingSubdata, setIsLoadingSubdata] = useState(true);
  const [showCerfaWizard, setShowCerfaWizard] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  // Vehicle documents vault state
  const [docCategoryFilter, setDocCategoryFilter] = useState<'all' | GarageDocumentCategory>('all');
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<GarageDocument | null>(null);
  const [docUploadPreset, setDocUploadPreset] = useState<DocumentUploadPreset | null>(null);
  const [previewDoc, setPreviewDoc] = useState<GarageDocument | null>(null);

  // Inline Carte Grise / Cerfa technical editor state
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [specReg, setSpecReg] = useState(vehicle.registrationNumber || '');
  const [specVin, setSpecVin] = useState(vehicle.vin || '');
  const [specMileage, setSpecMileage] = useState<number | ''>(vehicle.mileage ?? 0);
  const [specFuel, setSpecFuel] = useState(vehicle.fuelType || '');
  const [specGearbox, setSpecGearbox] = useState(vehicle.gearbox || '');
  const [specD2, setSpecD2] = useState(vehicle.typeVariantVersion || '');
  const [specJ1, setSpecJ1] = useState(vehicle.nationalGenre || 'VP');
  const [specJ3, setSpecJ3] = useState(vehicle.bodyType || '');
  const [specFormula, setSpecFormula] = useState(vehicle.formulaNumber || '');
  const [specCertDate, setSpecCertDate] = useState(vehicle.certificateDate || '');
  const [specSaving, setSpecSaving] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);

  useEffect(() => {
    setSpecReg(vehicle.registrationNumber || '');
    setSpecVin(vehicle.vin || '');
    setSpecMileage(vehicle.mileage ?? 0);
    setSpecFuel(vehicle.fuelType || '');
    setSpecGearbox(vehicle.gearbox || '');
    setSpecD2(vehicle.typeVariantVersion || '');
    setSpecJ1(vehicle.nationalGenre || 'VP');
    setSpecJ3(vehicle.bodyType || '');
    setSpecFormula(vehicle.formulaNumber || '');
    setSpecCertDate(vehicle.certificateDate || '');
    setSpecError(null);
  }, [vehicle]);

  useEffect(() => {
    setActivePhotoIndex(0);
    setDocCategoryFilter('all');
  }, [vehicle.id]);

  // Scoped vehicle documents & handlers
  const modalVehicles = useMemo(
    () =>
      allVehicles.some((v) => v.id === vehicle.id)
        ? allVehicles
        : [vehicle, ...allVehicles],
    [allVehicles, vehicle]
  );

  const vehicleDocuments = useMemo(
    () => filterDocumentsForVehicle(documents, vehicle.id),
    [documents, vehicle.id]
  );

  const docCategoryCounts = useMemo(
    () => getDocumentCategoryCounts(vehicleDocuments),
    [vehicleDocuments]
  );

  useEffect(() => {
    if (docCategoryFilter !== 'all' && docCategoryCounts[docCategoryFilter] === 0) {
      setDocCategoryFilter('all');
    }
  }, [docCategoryFilter, docCategoryCounts]);

  const filteredVehicleDocuments = useMemo(
    () =>
      docCategoryFilter === 'all'
        ? vehicleDocuments
        : vehicleDocuments.filter((d) => d.category === docCategoryFilter),
    [vehicleDocuments, docCategoryFilter]
  );

  const vehiclePurchases = useMemo(
    () => purchases.filter((p) => p.vehicleId === vehicle.id),
    [purchases, vehicle.id]
  );

  const vehicleMissingReminders = useMemo(
    () =>
      computeMissingDocumentReminders({
        vehicles: [vehicle],
        documents: vehicleDocuments,
        purchases: vehiclePurchases,
      }),
    [vehicle, vehicleDocuments, vehiclePurchases]
  );

  const uniqueClients = useMemo(
    () => extractUniqueClients(modalVehicles, documents),
    [modalVehicles, documents]
  );

  const openDocCreateModal = (presetOverrides?: Partial<DocumentUploadPreset>) => {
    setEditingDoc(null);
    setDocUploadPreset({
      vehicleId: vehicle.id,
      clientName: vehicle.buyerInfo?.fullName || undefined,
      bindingType: 'vehicle',
      ...presetOverrides,
    });
    setIsDocModalOpen(true);
  };

  const openDocEditModal = (docItem: GarageDocument) => {
    setEditingDoc(docItem);
    setDocUploadPreset(null);
    setIsDocModalOpen(true);
  };

  const handleDownloadDocument = async (docItem: GarageDocument) => {
    await triggerDocumentDownload(docItem, userEmail);
  };

  const handleDeleteDocument = async (docItem: GarageDocument) => {
    await deleteGarageDocument(docItem, userEmail || undefined);
    if (previewDoc?.id === docItem.id) {
      setPreviewDoc(null);
    }
  };

  // New repair task form state
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPartsCost, setTaskPartsCost] = useState<number | ''>('');
  const [taskLaborCost, setTaskLaborCost] = useState<number | ''>('');
  const [taskStatus, setTaskStatus] = useState<RepairTaskStatus>('todo');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskPresetKey, setTaskPresetKey] = useState<string>('');

  // New general expense form state
  const [dynamicCategories, setDynamicCategories] = useState<DynamicExpenseCategory[]>(
    DEFAULT_DYNAMIC_EXPENSE_CATEGORIES
  );
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<GeneralExpenseCategory | string>('transport');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseReceipt, setExpenseReceipt] = useState('');

  useEffect(() => {
    const unsubCats = subscribeDynamicExpenseCategories((cats) => {
      setDynamicCategories(cats);
      if (cats.length > 0 && !cats.some((c) => c.id === expenseCategory)) {
        setExpenseCategory(cats[0].id);
      }
    });
    return () => unsubCats();
  }, []);

  useEffect(() => {
    if (!featureFlags.repairChecklist && activeTab === 'repairs') {
      setActiveTab('overview');
    }
  }, [featureFlags.repairChecklist, activeTab]);

  // Real-time subscriptions for repairs and expenses
  useEffect(() => {
    setIsLoadingSubdata(true);
    setRepairsLoaded(false);
    setExpensesLoaded(false);

    const unsubRepairs = subscribeRepairs(vehicle.id, (loadedRepairs) => {
      setRepairs(loadedRepairs);
      setRepairsLoaded(true);
    });

    const unsubExpenses = subscribeExpenses(vehicle.id, (loadedExpenses) => {
      setExpenses(loadedExpenses);
      setExpensesLoaded(true);
      setIsLoadingSubdata(false);
    });

    return () => {
      unsubRepairs();
      unsubExpenses();
    };
  }, [vehicle.id]);

  // Keep parent vehicle financials synchronized when subcollection rows exist
  useEffect(() => {
    if (!repairsLoaded || !expensesLoaded) return;
    if (repairs.length === 0 && expenses.length === 0) return;
    void syncVehicleFinancials(vehicle, repairs, expenses);
  }, [repairsLoaded, expensesLoaded, repairs, expenses, vehicle]);

  // Derived financials calculated in real-time on every state change
  const fin = calculateVehicleFinancials({
    purchasePrice: vehicle.purchasePrice,
    targetSalePrice: vehicle.targetSalePrice,
    finalSalePrice: vehicle.buyerInfo?.salePrice,
    repairs,
    expenses,
  });

  const [garageSettings, setGarageSettings] = useState(() => getGarageSettings(vehicle.garageId));

  useEffect(() => {
    setGarageSettings(getGarageSettings(vehicle.garageId));
    const onSettingsUpdated = () => {
      setGarageSettings(getGarageSettings(vehicle.garageId));
    };
    window.addEventListener('autogarage_settings_updated', onSettingsUpdated);
    return () => window.removeEventListener('autogarage_settings_updated', onSettingsUpdated);
  }, [vehicle.garageId]);

  const activeProfileType: AppUserProfileType =
    propProfileType === 'particulier'
      ? 'particulier'
      : resolveUserProfileType(garageSettings);
  const dealProfileType: AppUserProfileType = resolveDealSellerProfileType(
    vehicle,
    garageSettings,
    activeProfileType
  );
  const isParticulier = dealProfileType === 'particulier';
  const dealEffectiveSettings = resolveEffectiveSettingsForDeal({
    vehicle,
    garageSettings,
    fallbackProfileType: activeProfileType,
  });
  const isSold = vehicle.status === 'sold';
  const realizedSalePrice = getRealizedSalePrice(vehicle);
  const hasRealizedSale = canDisplaySaleFinancialReport(vehicle);
  const displaySalePrice = isSold
    ? realizedSalePrice
    : Number(vehicle.targetSalePrice) || 0;
  const hasDisplaySalePrice = displaySalePrice > 0;

  const existingSnap = vehicle.buyerInfo?.taxSnapshot;
  const snapMatchesDeal =
    Boolean(existingSnap?.isHistoricalSnapshot) &&
    (!vehicle.buyerInfo?.sellerProfileType ||
      (isParticulier
        ? existingSnap?.taxRegime === 'none' || existingSnap?.legalStatus === 'particulier'
        : existingSnap?.taxRegime === 'micro' || existingSnap?.legalStatus === 'micro_entreprise')) &&
    Math.round(((existingSnap?.repairCostTotal || 0) + Number.EPSILON) * 100) / 100 === fin.repairCostTotal &&
    Math.round(((existingSnap?.generalExpensesTotal || 0) + Number.EPSILON) * 100) / 100 === fin.generalExpensesTotal;

  const rawSaleReport = hasRealizedSale
    ? calculateSaleTaxReport({
        salePrice: realizedSalePrice,
        purchasePrice: vehicle.purchasePrice,
        repairCostTotal: fin.repairCostTotal,
        generalExpensesTotal: fin.generalExpensesTotal,
        taxRegime: isParticulier ? 'none' : dealEffectiveSettings.taxRegime,
        taxRatePercent: isParticulier ? 0 : dealEffectiveSettings.taxRatePercent,
        frenchTaxConfig: dealEffectiveSettings.frenchTaxConfig,
        vatRegime: vehicle.buyerInfo?.vatRegime,
        vatRatePercent: vehicle.buyerInfo?.vatRatePercent,
        taxSnapshot: isParticulier ? undefined : snapMatchesDeal ? existingSnap : undefined,
      })
    : null;
  const saleReport =
    rawSaleReport && isParticulier
      ? {
          ...rawSaleReport,
          taxRegime: 'none' as const,
          taxRatePercent: 0,
          taxLabel: 'Particulier (Sans fiscalité professionnelle)',
          taxAmount: 0,
          netProfitAfterTax: rawSaleReport.grossMargin,
          urssafAmount: 0,
          versementLiberatoireEnabled: false,
          versementLiberatoireAmount: 0,
          microBicEstimatedTax: 0,
          corporateIsContextNote: '',
          vatRegime: 'franchise_base' as const,
          vatRatePercent: 0,
          vatAmount: 0,
          htAmount: rawSaleReport.salePrice,
          vatLegalMention: '',
          isHistoricalSnapshot: false,
          disclaimerNote: '',
        }
      : rawSaleReport;
  const showParticulierSimplifiedReport = Boolean(
    saleReport && (isParticulier || saleReport.taxRegime === 'none')
  );
  const cardNetProfit =
    hasRealizedSale && saleReport ? saleReport.netProfitAfterTax : fin.netProfit;
  const cardMarginPercentage =
    hasRealizedSale && saleReport
      ? saleReport.salePrice > 0
        ? Math.round(((cardNetProfit / saleReport.salePrice) * 100 + Number.EPSILON) * 100) / 100
        : 0
      : fin.marginPercentage;
  const cardRoiPercentage =
    hasRealizedSale && saleReport
      ? fin.totalInvested > 0
        ? Math.round(((cardNetProfit / fin.totalInvested) * 100 + Number.EPSILON) * 100) / 100
        : 0
      : fin.roiPercentage;

  // Lifecycle status switcher
  const handleStatusChange = async (newStatus: VehicleStatus) => {
    if (newStatus === 'sold' && !isSold) {
      onOpenSellModal(vehicle);
    } else {
      await updateVehicle(vehicle.id, { status: newStatus });
    }
  };

  // Add repair task handler
  const handleCreateRepairTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    await addRepairTask(vehicle.id, userId, {
      title: taskTitle.trim(),
      status: taskStatus,
      partsCost: Number(taskPartsCost) || 0,
      laborCost: Number(taskLaborCost) || 0,
      categoryPreset: taskPresetKey || undefined,
      notes: taskNotes.trim() || undefined,
    });

    // Reset task form
    setTaskTitle('');
    setTaskPartsCost('');
    setTaskLaborCost('');
    setTaskStatus('todo');
    setTaskNotes('');
    setTaskPresetKey('');
    setShowAddTask(false);
  };

  // Preset selection helper
  const handleSelectPreset = (preset: (typeof TASK_PRESETS)[0]) => {
    setTaskTitle(
      pickLocalized(lang, {
        fr: preset.labelFr,
        ru: preset.labelRu,
        hy: preset.labelHy,
        ka: preset.labelKa,
      })
    );
    setTaskPartsCost(preset.estimatedParts || 0);
    setTaskLaborCost(preset.estimatedLabor || 0);
    setTaskPresetKey(preset.id);
  };

  // Add general expense handler
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc.trim() || expenseAmount === '') return;

    await addGeneralExpense(vehicle.id, userId, {
      category: expenseCategory,
      description: expenseDesc.trim(),
      amount: Number(expenseAmount),
      date: expenseDate,
      receiptUrl: expenseReceipt.trim() || undefined,
    });

    // Reset expense form
    setExpenseDesc('');
    setExpenseAmount('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setExpenseReceipt('');
    setShowAddExpense(false);
  };

  const getStatusBadge = (status: VehicleStatus) => {
    switch (status) {
      case 'preparation':
        return { label: t('statusPreparation'), bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'repair':
        return { label: t('statusRepair'), bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
      case 'for_sale':
        return { label: t('statusForSale'), bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'sold':
        return { label: t('statusSold'), bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' };
      default:
        return { label: status, bg: 'bg-slate-700 text-slate-300 border-slate-600' };
    }
  };

  const statusBadge = getStatusBadge(vehicle.status);

  return (
    <div className="space-y-[var(--ag-section-gap)]">
      {/* Top Breadcrumb & Actions Bar */}
      <div
        data-testid="vehicle-detail-header"
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] py-3 px-4 shadow-sm"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-[var(--surface-muted)] border border-[var(--border)] rounded-[var(--ag-button-radius)] transition shrink-0"
            title={t('backToFleet')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--foreground)] tracking-tight">
                {vehicle.make} {vehicle.model}
              </h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] tabular-nums">
                {vehicle.year}
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] flex flex-wrap items-center gap-2 mt-0.5 font-mono tabular-nums">
              {vehicle.registrationNumber && (
                <>
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 border border-blue-500/30 font-bold">
                    {vehicle.registrationNumber}
                  </span>
                  <span>·</span>
                </>
              )}
              <span>{vehicle.mileage.toLocaleString(getIntlLocale(lang))} km</span>
            </p>
          </div>
        </div>

        {/* Action Buttons: Status selector, Edit, Sell, Delete */}
        <div
          data-testid="vehicle-detail-actions"
          className="flex flex-nowrap items-center gap-2 shrink-0"
        >
          {/* Dynamic Lifecycle Status Selector */}
          <div className="flex items-center bg-[var(--background)] p-1 rounded-[var(--ag-button-radius)] border border-[var(--border)] shrink-0">
            <span className="text-[11px] text-[var(--muted-foreground)] px-2 font-medium whitespace-nowrap">
              {t('statusLabel')}
            </span>
            <ThemedSelect<VehicleStatus>
              testId="vehicle-detail-status-select"
              ariaLabel={t('statusLabel')}
              value={vehicle.status}
              onChange={(val) => handleStatusChange(val)}
              options={[
                { value: 'preparation', label: `🛠️ ${t('statusPreparation')}` },
                { value: 'repair', label: `🔧 ${t('statusRepair')}` },
                { value: 'for_sale', label: `🏷️ ${t('statusForSale')}` },
                { value: 'sold', label: `✅ ${t('statusSold')}` },
              ]}
              triggerClassName="text-xs font-bold bg-[var(--surface-muted)] text-[var(--foreground)] rounded-lg px-2.5 py-1.5 border border-[var(--border)] whitespace-nowrap"
            />
          </div>

          {!isSold ? (
            <button
              onClick={() => onOpenSellModal(vehicle)}
              className="px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span style={getTextStyle('recordSaleBtn')}>{t('recordSaleBtn')}</span>
            </button>
          ) : (
            <button
              onClick={() => generateSalesInvoicePDF(vehicle, garageSettings)}
              className="px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span style={getTextStyle('invoicePdfBtn')}>{t('invoicePdfBtn')}</span>
            </button>
          )}

          <button
            onClick={() => onOpenEdit(vehicle)}
            className="p-2 text-[var(--secondary-foreground)] hover:text-[var(--foreground)] bg-[var(--surface-muted)] border border-[var(--border)] rounded-[var(--ag-button-radius)] transition shrink-0"
            title={t('editVehicleTitle')}
          >
            <Edit className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (confirm(t('confirmDelete', { make: vehicle.make, model: vehicle.model }))) {
                onDeleteVehicle(vehicle.id);
              }
            }}
            className="p-2 text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-[var(--ag-button-radius)] transition border border-red-500/30 shrink-0"
            title={t('deleteVehicleTitle')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Real-time Financial Margin & P&L Banner */}
      {featureFlags.pnlCalculator && (
        <div
          data-testid="vehicle-financial-dashboard"
          className="bg-[var(--ag-detail-bg)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-sm"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--ag-detail-heading)] mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5" style={getTextStyle('pnlBannerTitle')}>
              <TrendingUp className="w-4 h-4" />
              {t('pnlBannerTitle')}
            </span>
            <span className="text-[11px] font-mono text-[var(--muted-foreground)] font-normal">
              {t('pnlBannerFormula')}
            </span>
          </div>

          {/* 6 Key Financial Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. Prix d'achat */}
            <div className="bg-[var(--ag-metric-bg)] p-3 rounded-xl border border-[var(--border)]">
              <span
                style={getTextStyle('purchasePriceLabel')}
                className="text-[11px] text-[var(--muted-foreground)] block mb-1"
              >
                {t('purchasePriceLabel')}
              </span>
              <div className="text-base sm:text-lg font-bold text-[var(--foreground)] tabular-nums">
                {formatEuro(vehicle.purchasePrice)}
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                {t('acquiredOn', { date: formatDate(vehicle.purchaseDate) })}
              </span>
            </div>

            {/* 2. Travaux Réparations (Pièces + MO) */}
            <div className="bg-[var(--ag-metric-bg)] p-3 rounded-xl border border-[var(--border)]">
              <span
                style={getTextStyle('workshopRepairsLabel')}
                className="text-[11px] text-[var(--muted-foreground)] block mb-1"
              >
                {t('workshopRepairsLabel')}
              </span>
              <div className="text-base sm:text-lg font-bold text-[var(--warning)] tabular-nums">
                {formatEuro(fin.repairCostTotal)}
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                {t('partsAndLaborBreakdown', { parts: formatEuro(fin.repairPartsTotal), labor: formatEuro(fin.repairLaborTotal) })}
              </span>
            </div>

            {/* 3. Frais Généraux Non-Réparations */}
            <div className="bg-[var(--ag-metric-bg)] p-3 rounded-xl border border-[var(--border)]">
              <span
                style={getTextStyle('generalExpensesLabel')}
                className="text-[11px] text-[var(--muted-foreground)] block mb-1"
              >
                {t('generalExpensesLabel')}
              </span>
              <div className="text-base sm:text-lg font-bold text-[var(--foreground)] tabular-nums">
                {formatEuro(fin.generalExpensesTotal)}
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                {t('expensesCount', { count: expenses.length })}
              </span>
            </div>

            {/* 4. Total Capital Investi */}
            <div
              className="p-3 rounded-xl border"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--primary) 12%, var(--ag-metric-bg))',
                borderColor: 'color-mix(in srgb, var(--primary) 35%, var(--border))',
              }}
            >
              <span
                style={getTextStyle('totalCapitalInvestedLabel')}
                className="text-[11px] text-[var(--primary)] font-semibold block mb-1"
              >
                {t('totalCapitalInvestedLabel')}
              </span>
              <div className="text-base sm:text-lg font-black text-[var(--primary)] tabular-nums">
                {formatEuro(fin.totalInvested)}
              </div>
              <span className="text-[10px] text-[var(--secondary-foreground)] tabular-nums">
                {t('expensesSum', { val: formatEuro(fin.totalExpenses) })}
              </span>
            </div>

            {/* 5. Prix de Vente (Visé ou Réalisé) */}
            <div className="bg-[var(--ag-metric-bg)] p-3 rounded-xl border border-[var(--border)]">
              <span className="text-[11px] text-[var(--muted-foreground)] block mb-1">
                {isSold ? t('realizedSalePrice') : t('targetSalePrice')}
              </span>
              <div
                className={`text-base sm:text-lg font-bold tabular-nums ${
                  hasDisplaySalePrice ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
                }`}
              >
                {hasDisplaySalePrice ? formatEuro(displaySalePrice) : '—'}
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {isSold ? t('soldTo', { name: vehicle.buyerInfo?.fullName || 'Client' }) : t('inListing')}
              </span>
            </div>

            {/* 6. Bénéfice Net (Marge P&L & ROI - Uniquement après vente validée) */}
            <div
              data-testid="vehicle-net-profit-card"
              className={`p-3 rounded-xl border ${
                !hasRealizedSale
                  ? 'bg-[var(--ag-metric-bg)] border-[var(--border)] text-[var(--muted-foreground)]'
                  : ''
              }`}
              style={
                hasRealizedSale
                  ? cardNetProfit >= 0
                    ? {
                        backgroundColor: 'color-mix(in srgb, var(--ag-profit-color) 12%, var(--ag-metric-bg))',
                        borderColor: 'color-mix(in srgb, var(--ag-profit-color) 40%, var(--border))',
                        color: 'var(--ag-profit-color)',
                      }
                    : {
                        backgroundColor: 'color-mix(in srgb, var(--ag-expense-color) 12%, var(--ag-metric-bg))',
                        borderColor: 'color-mix(in srgb, var(--ag-expense-color) 40%, var(--border))',
                        color: 'var(--ag-expense-color)',
                      }
                  : undefined
              }
            >
              <span
                style={getTextStyle('netProfitLabel')}
                className="text-[11px] font-semibold block mb-1"
              >
                {t('netProfitLabel')}
              </span>
              {hasRealizedSale ? (
                <>
                  <div className="text-base sm:text-lg font-black tabular-nums">
                    {cardNetProfit >= 0 ? '+' : ''}
                    {formatEuro(cardNetProfit)}
                  </div>
                  <span className="text-[10px] font-mono font-bold block tabular-nums">
                    {t('marginPercent', { val: cardMarginPercentage.toFixed(1) })} | {t('roiPercent', { val: cardRoiPercentage.toFixed(1) })}
                  </span>
                </>
              ) : (
                <>
                  <div className="text-base sm:text-lg font-mono font-bold text-[var(--muted-foreground)]">
                    —
                  </div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block">
                    {t('netProfitPendingHint')}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Structured Sale Financial Report (ONLY when status === 'sold' AND salePrice > 0) */}
          {saleReport ? (
            <div
              data-testid="sale-financial-report"
              className="mt-4 bg-[var(--ag-receipt-bg)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] font-mono text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--border)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    style={getTextStyle('saleReportTitle')}
                    className="font-bold text-[var(--ag-detail-heading)]"
                  >
                    {t('saleReportTitle', { vehicle: `${vehicle.make} ${vehicle.model}` })}
                  </span>
                  {saleReport.isHistoricalSnapshot && (
                    <span
                      data-testid="sale-snapshot-locked-badge"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] font-bold"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>{t('taxSnapshotLockedBadge')}</span>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {!showParticulierSimplifiedReport && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 font-sans">
                      {t('taxEstimateBadge')}
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    {showParticulierSimplifiedReport
                      ? t('profileBadgeParticulier')
                      : t('saleReportRegime', { regime: saleReport.taxLabel })}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 tabular-nums">
                <div className="flex items-center justify-between text-[var(--secondary-foreground)]">
                  <span>+ {t('saleReportSalePrice')}</span>
                  <span className="font-bold text-[var(--foreground)]">{formatEuro(saleReport.salePrice)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--secondary-foreground)]">
                  <span>- {t('saleReportPurchase')}</span>
                  <span className="font-semibold" style={{ color: 'var(--ag-expense-color)' }}>
                    -{formatEuro(saleReport.purchasePrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[var(--secondary-foreground)]">
                  <span>- {t('saleReportRepairs')}</span>
                  <span className="font-semibold" style={{ color: 'var(--ag-expense-color)' }}>
                    -{formatEuro(saleReport.repairCostTotal)}
                  </span>
                </div>
                {saleReport.generalExpensesTotal > 0 && (
                  <div className="flex items-center justify-between text-[var(--secondary-foreground)]">
                    <span>- {t('saleReportExpenses')}</span>
                    <span className="font-semibold" style={{ color: 'var(--ag-expense-color)' }}>
                      -{formatEuro(saleReport.generalExpensesTotal)}
                    </span>
                  </div>
                )}

                {!showParticulierSimplifiedReport && (
                  <>
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-dashed border-[var(--border)] text-[var(--foreground)]">
                      <span className="font-semibold">
                        = {t('saleReportGrossMargin')}
                      </span>
                      <span
                        className="font-bold"
                        style={{
                          color:
                            saleReport.grossMargin >= 0
                              ? 'var(--warning)'
                              : 'var(--ag-expense-color)',
                        }}
                      >
                        {formatEuro(saleReport.grossMargin)}
                      </span>
                    </div>

                    {/* Separated VAT (TVA) breakdown (archived corporate/VAT snapshots only) */}
                    {saleReport.isHistoricalSnapshot &&
                      (saleReport.taxRegime === 'sarl' ||
                        saleReport.taxRegime === 'sas' ||
                        saleReport.vatAmount > 0) && (
                        <div
                          data-testid="sale-report-vat-row"
                          className="flex flex-wrap items-center justify-between gap-2 text-[var(--muted-foreground)] bg-[var(--surface-muted)]/60 rounded-lg px-2.5 py-1.5 border border-[var(--border)]"
                        >
                          <span>
                            TVA (
                            {saleReport.vatRegime === 'tva_marge'
                              ? pickLocalized(lang, {
                                  fr: 'Sur la marge (Art. 297 A)',
                                  ru: 'На маржу (Art. 297 A CGI)',
                                  hy: 'Մարժայի վրա (Art. 297 A)',
                                  ka: 'მარჟაზე (Art. 297 A)',
                                })
                              : saleReport.vatRegime === 'tva_total'
                              ? pickLocalized(lang, {
                                  fr: `Sur prix total (${saleReport.vatRatePercent}%)`,
                                  ru: `На общую цену (${saleReport.vatRatePercent}%)`,
                                  hy: `Ընդհանուր գնից (${saleReport.vatRatePercent}%)`,
                                  ka: `სრულ ფასზე (${saleReport.vatRatePercent}%)`,
                                })
                              : saleReport.vatRegime === 'franchise_base'
                              ? pickLocalized(lang, {
                                  fr: 'Franchise en base (Art. 293 B)',
                                  ru: 'Franchise en base (0%)',
                                  hy: 'Franchise en base (0%)',
                                  ka: 'Franchise en base (0%)',
                                })
                              : `${saleReport.vatRatePercent}%`}
                            ) · HT {formatEuro(saleReport.htAmount)}
                          </span>
                          <span className="font-semibold text-blue-400">
                            {formatEuro(saleReport.vatAmount)}
                          </span>
                        </div>
                      )}

                    {saleReport.taxRegime === 'micro' ? (
                      <>
                        <div className="flex items-center justify-between text-[var(--secondary-foreground)]">
                          <span>
                            -{' '}
                            {pickLocalized(lang, {
                              fr: 'Cotisations URSSAF (sur CA)',
                              ru: 'Взносы URSSAF (с оборота CA)',
                              hy: 'URSSAF վճարներ (շրջանառությունից)',
                              ka: 'URSSAF შენატანები (ბრუნვიდან CA)',
                            })}
                          </span>
                          <span className="font-semibold" style={{ color: 'var(--ag-expense-color)' }}>
                            -{formatEuro(saleReport.urssafAmount)}
                          </span>
                        </div>
                        {saleReport.versementLiberatoireEnabled ? (
                          <div className="flex items-center justify-between text-[var(--secondary-foreground)]">
                            <span>
                              -{' '}
                              {pickLocalized(lang, {
                                fr: 'Versement libératoire (sur CA)',
                                ru: 'Versement libératoire (с оборота CA)',
                                hy: 'Versement libératoire (շրջանառությունից)',
                                ka: 'Versement libératoire (ბრუნვიდან CA)',
                              })}
                            </span>
                            <span className="font-semibold" style={{ color: 'var(--ag-expense-color)' }}>
                              -{formatEuro(saleReport.versementLiberatoireAmount)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-[var(--muted-foreground)]">
                            <span>
                              ℹ{' '}
                              {pickLocalized(lang, {
                                fr: 'IR Micro-BIC estimé séparément (abattement 71%, hors URSSAF)',
                                ru: 'Подоходный IR Micro-BIC отдельно (вычет 71%, не включён в URSSAF)',
                                hy: 'IR Micro-BIC առանձին գնահատական (71% նվազեցում, URSSAF-ից դուրս)',
                                ka: 'IR Micro-BIC ცალკე შეფასება (71% გამოქვითვა, URSSAF-ის გარეთ)',
                              })}
                            </span>
                            <span className="font-semibold text-amber-400">
                              {formatEuro(saleReport.microBicEstimatedTax)}
                            </span>
                          </div>
                        )}
                      </>
                    ) : saleReport.isHistoricalSnapshot && (saleReport.taxRegime === 'sarl' || saleReport.taxRegime === 'sas') ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--muted-foreground)]">
                        <span>
                          - {t('saleReportTax', { regime: saleReport.taxLabel })}
                        </span>
                        <span className="text-[11px] font-semibold text-amber-400">
                          {pickLocalized(lang, {
                            fr: 'Archive fiscale société (calcul IS annuel)',
                            ru: 'Архивный расчёт по прошлому режиму компании',
                            hy: 'Պատմական կորպորատիվ հարկային գրառում',
                            ka: 'ისტორიული კორპორატიული საგადასახადო ჩანაწერი',
                          })}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[var(--secondary-foreground)]">
                        <span>
                          - {t('saleReportTax', { regime: saleReport.taxLabel })}
                        </span>
                        <span
                          className="font-semibold"
                          style={{
                            color:
                              saleReport.taxAmount > 0
                                ? 'var(--ag-expense-color)'
                                : 'var(--muted-foreground)',
                          }}
                        >
                          {saleReport.taxAmount > 0 ? `-${formatEuro(saleReport.taxAmount)}` : formatEuro(0)}
                        </span>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between pt-2 mt-2 border-t border-[var(--border)] text-sm">
                  <span
                    style={getTextStyle('saleReportNetProfit')}
                    className="font-bold text-[var(--foreground)]"
                  >
                    = {t('saleReportNetProfit')}
                  </span>
                  <span
                    className="font-black"
                    style={{
                      color:
                        saleReport.netProfitAfterTax >= 0
                          ? 'var(--ag-profit-color)'
                          : 'var(--ag-expense-color)',
                    }}
                  >
                    {formatEuro(saleReport.netProfitAfterTax)}
                  </span>
                </div>

                {!showParticulierSimplifiedReport && (
                  <p className="pt-2 text-[10px] font-sans leading-relaxed text-[var(--muted-foreground)] border-t border-[var(--border)]/60">
                    {t('taxAccountantDisclaimer')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div
              data-testid="sale-report-pending"
              className="mt-4 bg-[var(--ag-receipt-bg)] border border-dashed border-[var(--border)] rounded-[var(--ag-card-radius)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 text-[var(--muted-foreground)] min-w-0">
                <Receipt className="w-4 h-4 shrink-0 text-[var(--primary)]" />
                <span>{t('saleReportPendingNotice')}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenSellModal(vehicle)}
                className="px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] transition whitespace-nowrap shrink-0"
              >
                {t('recordSaleBtn')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs sm:text-sm font-bold transition whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{t('tabOverview')}</span>
        </button>

        {featureFlags.repairChecklist && (
          <button
            onClick={() => setActiveTab('repairs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs sm:text-sm font-bold transition whitespace-nowrap ${
              activeTab === 'repairs'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
            }`}
          >
            <ListCheck className="w-4 h-4" />
            <span>{t('tabRepairs', { count: repairs.length })}</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center gap-2 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs sm:text-sm font-bold transition whitespace-nowrap ${
            activeTab === 'expenses'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>{t('tabExpenses', { count: expenses.length })}</span>
        </button>

        <button
          type="button"
          data-testid="vehicle-tab-documents"
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs sm:text-sm font-bold transition whitespace-nowrap ${
            activeTab === 'documents'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{t('tabDocuments')}</span>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums ${
              activeTab === 'documents'
                ? 'bg-black/20 text-[var(--primary-foreground)]'
                : 'bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]'
            }`}
          >
            {vehicleDocuments.length}
          </span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & PHOTOS */}
      {activeTab === 'overview' && (() => {
        const photos = vehicle.photos || [];
        const safePhotoIndex = activePhotoIndex < photos.length ? activePhotoIndex : 0;
        const primaryLabel = pickLocalized(lang, {
          fr: 'Caractéristiques principales',
          ru: 'Основные характеристики',
          hy: 'Հիմնական տվյալներ',
          ka: 'ძირითადი მახასიათებლები',
        });
        const cerfaLabel = pickLocalized(lang, {
          fr: 'Immatriculation & Carte Grise',
          ru: 'Регистрация и Carte Grise',
          hy: 'Գրանցում և Carte Grise',
          ka: 'რეგისტრაცია და Carte Grise',
        });

        const generalSpecs = [
          { label: t('make'), value: vehicle.make || '—' },
          { label: t('model'), value: vehicle.model || '—' },
          { label: t('year'), value: String(vehicle.year || '—'), tabular: true },
          {
            label: t('mileage'),
            value: `${(vehicle.mileage ?? 0).toLocaleString(getIntlLocale(lang))} km`,
            tabular: true,
          },
          { label: t('fuelTypeLabel'), value: vehicle.fuelType || '—' },
          { label: t('gearboxLabel'), value: vehicle.gearbox || '—' },
          {
            label: t('purchaseDate'),
            value: vehicle.purchaseDate ? formatDate(vehicle.purchaseDate) : '—',
            tabular: true,
          },
          {
            label: t('purchasePriceLabel'),
            value: formatEuro(vehicle.purchasePrice),
            tabular: true,
            emphasize: true,
          },
        ];

        const cerfaSpecs = [
          {
            label: t('plateFieldLabel'),
            value: vehicle.registrationNumber || '—',
            mono: true,
            tone: vehicle.registrationNumber ? 'plate' : 'muted',
          },
          {
            label: t('vinFieldLabel'),
            value: vehicle.vin || '—',
            mono: true,
            tone: vehicle.vin ? 'accent' : 'muted',
          },
          {
            label: t('d2TypeLabel'),
            value: vehicle.typeVariantVersion || '—',
            mono: true,
          },
          {
            label: t('j1GenreLabel'),
            value: vehicle.nationalGenre || '—',
            mono: true,
          },
          {
            label: t('j3BodyLabel'),
            value: vehicle.bodyType || '—',
            mono: true,
          },
          {
            label: t('formulaNumberLabel'),
            value: vehicle.formulaNumber || '—',
            mono: true,
          },
          {
            label: t('certificateDateLabel'),
            value: vehicle.certificateDate ? formatDate(vehicle.certificateDate) : '—',
            tabular: true,
          },
        ];

        return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Compact Photo Gallery & Two-Column Spec Table */}
          <div className="lg:col-span-2 space-y-4">
            {/* Compact Photo Gallery (240px-256px) & Horizontal Thumbnail Strip */}
            <div
              data-testid="vehicle-photo-gallery"
              className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-hidden shadow-sm"
            >
              <div className="relative h-[240px] sm:h-[256px] w-full bg-[var(--background)]">
                {photos.length > 0 ? (
                  <>
                    <img
                      src={photos[safePhotoIndex]}
                      alt={`${vehicle.make} ${vehicle.model}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {photos.length > 1 && (
                      <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-slate-950/75 backdrop-blur-sm text-[11px] font-semibold text-white tabular-nums border border-white/10">
                        {safePhotoIndex + 1} / {photos.length}
                      </div>
                    )}
                  </>
                ) : (
                  <VehiclePhotoPlaceholder variant="detail" />
                )}
              </div>

              {/* Sleek Horizontal Thumbnail Strip */}
              {photos.length > 1 && (
                <div className="px-3 py-2 bg-[var(--surface-muted)]/60 border-t border-[var(--border)] flex items-center gap-2 overflow-x-auto">
                  {photos.map((p, idx) => {
                    const isSelected = idx === safePhotoIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePhotoIndex(idx)}
                        aria-label={`${vehicle.make} ${vehicle.model} ${idx + 1}`}
                        aria-pressed={isSelected}
                        className={`relative w-16 h-11 rounded-lg overflow-hidden shrink-0 border transition ${
                          isSelected
                            ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/30 opacity-100'
                            : 'border-[var(--border)] opacity-75 hover:opacity-100 hover:border-[var(--primary)]/60'
                        }`}
                      >
                        <img
                          src={p}
                          alt={`${vehicle.make} ${vehicle.model} ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Technical Specifications & Carte Grise Summary Card */}
            <div
              data-testid="vehicle-tech-specs-card"
              className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
                <h3 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <span>{t('techSpecTitle')}</span>
                </h3>
                <button
                  type="button"
                  data-testid="vehicle-detail-edit-carte-grise"
                  onClick={() => {
                    setSpecError(null);
                    setIsEditingSpecs((prev) => !prev);
                  }}
                  className="px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--primary)] border border-[var(--border)] transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>
                    {isEditingSpecs
                      ? pickLocalized(lang, {
                          fr: 'Fermer l’édition',
                          ru: 'Закрыть редактор',
                          hy: 'Փակել խմբագրիչը',
                          ka: 'რედაქტორის დახურვა',
                        })
                      : pickLocalized(lang, {
                          fr: 'Compléter Carte Grise (Cerfa)',
                          ru: 'Дополнить данные (Cerfa / ПТС)',
                          hy: 'Լրացնել Carte Grise (Cerfa)',
                          ka: 'Carte Grise-ის შევსება (Cerfa)',
                        })}
                  </span>
                </button>
              </div>

              {isEditingSpecs ? (
                <form
                  data-testid="vehicle-detail-specs-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const cleanedVin = specVin.replace(/\s+/g, '').toUpperCase();
                    if (cleanedVin.length > 0 && !/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanedVin)) {
                      setSpecError(
                        pickLocalized(lang, {
                          fr: 'Le VIN doit contenir exactement 17 caractères (hors I, O, Q).',
                          ru: 'VIN должен содержать ровно 17 символов (без I, O, Q).',
                          hy: 'VIN կոդը պետք է ունենա ուղիղ 17 նիշ (առանց I, O, Q)։',
                          ka: 'VIN კოდი უნდა შეიცავდეს ზუსტად 17 სიმბოლოს (I, O, Q-ის გარეშე).',
                        })
                      );
                      return;
                    }
                    setSpecSaving(true);
                    setSpecError(null);
                    try {
                      await updateVehicle(vehicle.id, {
                        registrationNumber: specReg.trim().toUpperCase(),
                        vin: cleanedVin,
                        mileage: specMileage === '' ? 0 : Math.max(0, Number(specMileage)),
                        fuelType: specFuel.trim(),
                        gearbox: specGearbox.trim(),
                        typeVariantVersion: specD2.trim(),
                        nationalGenre: specJ1.trim() || 'VP',
                        bodyType: specJ3.trim().toUpperCase(),
                        formulaNumber: specFormula.replace(/\s+/g, '').toUpperCase(),
                        certificateDate: specCertDate.trim(),
                      });
                      setIsEditingSpecs(false);
                    } catch (err: unknown) {
                      setSpecError(err instanceof Error ? err.message : 'Erreur de sauvegarde');
                    } finally {
                      setSpecSaving(false);
                    }
                  }}
                  className="space-y-4 bg-[var(--background)]/50 border border-[var(--border)] rounded-2xl p-4"
                >
                  {specError && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/40 rounded-xl text-xs text-red-400">
                      {specError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label htmlFor="detail-spec-reg" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('plateFieldLabel')}
                      </label>
                      <input
                        id="detail-spec-reg"
                        type="text"
                        value={specReg}
                        onChange={(e) => setSpecReg(e.target.value.toUpperCase())}
                        placeholder="AB-123-CD"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-vin" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        VIN (E)
                      </label>
                      <input
                        id="detail-spec-vin"
                        type="text"
                        maxLength={17}
                        value={specVin}
                        onChange={(e) => setSpecVin(e.target.value.replace(/\s+/g, '').toUpperCase())}
                        placeholder="VF3UPHNK0MT129841"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-mileage" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('mileage')} (km)
                      </label>
                      <input
                        id="detail-spec-mileage"
                        type="number"
                        min={0}
                        value={specMileage}
                        onChange={(e) => setSpecMileage(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-fuel" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('fuelTypeLabel')}
                      </label>
                      <input
                        id="detail-spec-fuel"
                        type="text"
                        value={specFuel}
                        onChange={(e) => setSpecFuel(e.target.value)}
                        placeholder="Essence / Diesel"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-gearbox" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('gearboxLabel')}
                      </label>
                      <input
                        id="detail-spec-gearbox"
                        type="text"
                        value={specGearbox}
                        onChange={(e) => setSpecGearbox(e.target.value)}
                        placeholder="Manuelle / Automatique"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-d2" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('d2TypeLabel')}
                      </label>
                      <input
                        id="detail-spec-d2"
                        type="text"
                        value={specD2}
                        onChange={(e) => setSpecD2(e.target.value)}
                        placeholder="UPHNK-01"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-j1" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('j1GenreLabel')}
                      </label>
                      <input
                        id="detail-spec-j1"
                        type="text"
                        value={specJ1}
                        onChange={(e) => setSpecJ1(e.target.value.toUpperCase())}
                        placeholder="VP / CTTE"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] uppercase"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-j3" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('j3BodyLabel')}
                      </label>
                      <input
                        id="detail-spec-j3"
                        type="text"
                        value={specJ3}
                        onChange={(e) => setSpecJ3(e.target.value.toUpperCase())}
                        placeholder="CI / BREAK"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] uppercase"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-formula" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('formulaNumberLabel')}
                      </label>
                      <input
                        id="detail-spec-formula"
                        type="text"
                        value={specFormula}
                        onChange={(e) => setSpecFormula(e.target.value.toUpperCase())}
                        placeholder="2021AB12345"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label htmlFor="detail-spec-certdate" className="block font-semibold text-[var(--secondary-foreground)] mb-1">
                        {t('certificateDateLabel')}
                      </label>
                      <input
                        id="detail-spec-certdate"
                        type="date"
                        value={specCertDate}
                        onChange={(e) => setSpecCertDate(e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingSpecs(false)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      {t('cancelBtn')}
                    </button>
                    <button
                      type="submit"
                      data-testid="vehicle-detail-specs-save"
                      disabled={specSaving}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow"
                    >
                      {specSaving ? t('loading') : t('updateVehicleBtn')}
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  data-testid="vehicle-specs-two-column"
                  className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4"
                >
                  {/* Left Group: Основные характеристики */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--muted-foreground)] pb-2 mb-1 border-b border-[var(--border)]">
                      {primaryLabel}
                    </h4>
                    <dl className="divide-y divide-[var(--border)]/40">
                      {generalSpecs.map((item) => (
                        <div
                          key={item.label}
                          className="py-2 flex items-baseline justify-between gap-4 text-sm"
                        >
                          <dt className="text-[var(--muted-foreground)] shrink-0">
                            {item.label}
                          </dt>
                          <dd
                            className={`text-right truncate ${
                              item.emphasize
                                ? 'font-bold text-[var(--foreground)]'
                                : 'font-medium text-[var(--foreground)]'
                            } ${item.tabular ? 'tabular-nums' : ''}`}
                          >
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {/* Right Group: Регистрация и Carte Grise */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--muted-foreground)] pb-2 mb-1 border-b border-[var(--border)]">
                      {cerfaLabel}
                    </h4>
                    <dl className="divide-y divide-[var(--border)]/40">
                      {cerfaSpecs.map((item) => (
                        <div
                          key={item.label}
                          className="py-2 flex items-baseline justify-between gap-4 text-sm"
                        >
                          <dt className="text-[var(--muted-foreground)] shrink-0">
                            {item.label}
                          </dt>
                          <dd
                            className={`text-right ${
                              item.mono ? 'font-mono text-xs sm:text-sm' : ''
                            } ${item.tabular ? 'tabular-nums' : ''} ${
                              item.tone === 'plate'
                                ? 'font-bold text-blue-500'
                                : item.tone === 'accent'
                                ? 'font-bold text-[var(--primary)] break-all'
                                : item.tone === 'muted'
                                ? 'text-[var(--muted-foreground)]'
                                : 'font-medium text-[var(--foreground)] break-all'
                            }`}
                          >
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Buyer Info & Quick Checklist Status */}
          <div className="space-y-4">
            {/* Buyer Card if Sold or Prompt to Sell */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-sm space-y-4">
              <h3 className="text-base font-bold text-[var(--foreground)] flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <UserCheck className="w-4 h-4 text-purple-500 shrink-0" />
                  <span className="truncate">{t('commercialStatusTitle')}</span>
                </span>
                {isSold && (
                  <span className="text-xs font-bold text-purple-500 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/30 whitespace-nowrap shrink-0">
                    {t('saleValidated')}
                  </span>
                )}
              </h3>

              {isSold && vehicle.buyerInfo ? (
                <div className="space-y-3 bg-[var(--surface-muted)] p-4 rounded-xl border border-[var(--border)] text-xs">
                  <div>
                    <span className="text-[var(--muted-foreground)] block">{t('buyer')}</span>
                    <span className="text-[var(--foreground)] font-bold text-sm">
                      {vehicle.buyerInfo.fullName}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[var(--muted-foreground)] block">{t('phone')}</span>
                      <span className="text-[var(--secondary-foreground)]">{vehicle.buyerInfo.phone}</span>
                    </div>
                    <div>
                      <span className="text-[var(--muted-foreground)] block">{t('saleDateLabel')}</span>
                      <span className="text-[var(--secondary-foreground)] tabular-nums">{formatDate(vehicle.buyerInfo.saleDate)}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)] block">{t('email')}</span>
                    <span className="text-[var(--secondary-foreground)] truncate block">{vehicle.buyerInfo.email}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)] block">{t('billingAddress')}</span>
                    <span className="text-[var(--secondary-foreground)] block">{vehicle.buyerInfo.address}</span>
                  </div>
                  <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
                    <span className="text-[var(--muted-foreground)] font-semibold">{t('netSalePrice')}</span>
                    <span className="text-base font-black text-[var(--success)] tabular-nums">
                      {formatEuro(vehicle.buyerInfo.salePrice)}
                    </span>
                  </div>

                  {/* Quick Export Button */}
                  <button
                    onClick={() => generateSalesInvoicePDF(vehicle, garageSettings)}
                    className="w-full mt-2 py-2 px-3 rounded-[var(--ag-button-radius)] bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center justify-center gap-2 transition whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('downloadInvoicePdf')}</span>
                  </button>
                </div>
              ) : (
                <div className="bg-[var(--surface-muted)] p-4 rounded-xl border border-[var(--border)] text-center space-y-3">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {t('inStockNotice', { status: statusBadge.label })}
                  </p>
                  <button
                    onClick={() => onOpenSellModal(vehicle)}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t('recordSaleAndDetails')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Repairs Checklist Progress */}
            {featureFlags.repairChecklist && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
                  <ListCheck className="w-4 h-4 text-[var(--primary)]" />
                  {t('repairsProgressTitle')}
                </h3>
                <span className="text-xs text-[var(--muted-foreground)] font-mono tabular-nums">
                  {t('completedCount', { done: repairs.filter((r) => r.status === 'done').length, total: repairs.length })}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-[var(--surface-muted)] overflow-hidden border border-[var(--border)]">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${repairs.length > 0 ? (repairs.filter((r) => r.status === 'done').length / repairs.length) * 100 : 0}%`,
                    backgroundColor: 'var(--primary)',
                  }}
                ></div>
              </div>

              {/* Top 3 tasks preview */}
              <div className="space-y-2 pt-1">
                {repairs.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            task.status === 'done'
                              ? 'var(--success)'
                              : task.status === 'in_progress'
                              ? '#3b82f6'
                              : 'var(--warning)',
                        }}
                      ></span>
                      <span className="text-[var(--foreground)] truncate">{task.title}</span>
                    </div>
                    <span className="text-[var(--primary)] font-bold shrink-0 ml-2 tabular-nums">
                      {formatEuro(task.totalCost)}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setActiveTab('repairs')}
                className="w-full py-2 text-xs font-bold text-[var(--primary)] flex items-center justify-center gap-1 transition pt-1"
              >
                <span>{t('manageAllRepairs', { count: repairs.length })}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* TAB 2: REPAIR WORKS & TASKS MODULE (TO-DO CHECKLIST) */}
      {featureFlags.repairChecklist && activeTab === 'repairs' && (
        <div className="space-y-4">
          {/* Header & Add Task CTA */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]">
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                <Wrench className="w-5 h-5 text-[var(--primary)]" />
                {t('repairChecklistTitle', { count: repairs.length })}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('repairChecklistSubtitle')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddTask(!showAddTask)}
                className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t('newRepairBtn')}</span>
              </button>
            </div>
          </div>

          {/* Add Task Form (Expanded) */}
          {showAddTask && (
            <form
              onSubmit={handleCreateRepairTask}
              className="bg-[var(--card)] border border-[var(--primary)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-lg space-y-4 animate-in fade-in zoom-in-95"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-[var(--primary)]" />
                  {t('addRepairOperation')}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  {t('closeForm')}
                </button>
              </div>

              {/* Template Presets Buttons */}
              <div>
                <label className="block text-xs font-semibold text-[var(--muted-foreground)] mb-1.5">
                  {t('presetsHelp')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        taskPresetKey === preset.id
                          ? 'bg-[var(--surface-muted)] border-[var(--primary)] text-[var(--primary)] font-bold'
                          : 'bg-[var(--background)] border-[var(--border)] text-[var(--secondary-foreground)] hover:bg-[var(--surface-muted)]'
                      }`}
                    >
                      {pickLocalized(lang, {
                        fr: preset.labelFr,
                        ru: preset.labelRu,
                        hy: preset.labelHy,
                        ka: preset.labelKa,
                      })}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task Title */}
              <div>
                <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                  {t('taskTitleLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={t('taskTitlePlaceholder')}
                  className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              {/* Cost Breakdown: Separate Parts Cost (€) and Labor Cost (€) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                    {t('partsCostLabel')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={taskPartsCost}
                    onChange={(e) => setTaskPartsCost(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                    {t('laborCostLabel')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={taskLaborCost}
                    onChange={(e) => setTaskLaborCost(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="new-repair-status-select" className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                    {t('taskStatusLabel')}
                  </label>
                  <ThemedSelect<RepairTaskStatus>
                    id="new-repair-status-select"
                    testId="new-repair-status-select"
                    ariaLabel={t('taskStatusLabel')}
                    value={taskStatus}
                    onChange={(val) => setTaskStatus(val)}
                    options={[
                      { value: 'todo', label: t('taskTodo') },
                      { value: 'in_progress', label: t('taskInProgress') },
                      { value: 'done', label: t('taskDone') },
                    ]}
                    triggerClassName="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)]"
                  />
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                  {t('taskNotesLabel')}
                </label>
                <input
                  type="text"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder={t('taskNotesPlaceholder')}
                  className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="px-4 py-2 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-[var(--ag-button-radius)] transition"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('saveOperationBtn')}</span>
                </button>
              </div>
            </form>
          )}

          {/* Table / List of Repair Tasks */}
          {repairs.length > 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[var(--background)] border-b border-[var(--border)] text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
                      <th className="py-3 px-4">{t('thTaskDesc')}</th>
                      <th className="py-3 px-4">{t('thStatus')}</th>
                      <th className="py-3 px-4 text-right">{t('thPartsCost')}</th>
                      <th className="py-3 px-4 text-right">{t('thLaborCost')}</th>
                      <th className="py-3 px-4 text-right">{t('thTotalTask')}</th>
                      <th className="py-3 px-4 text-center">{t('thActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-xs">
                    {repairs.map((task) => (
                      <tr key={task.id} className="hover:bg-[var(--surface-muted)] transition">
                        {/* Title and notes */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[var(--foreground)] text-sm">{task.title}</div>
                          {task.notes && (
                            <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{task.notes}</div>
                          )}
                        </td>

                        {/* Status Toggle Badge */}
                        <td className="py-3.5 px-4">
                          <ThemedSelect<RepairTaskStatus>
                            testId={`repair-status-select-${task.id}`}
                            ariaLabel={`${t('thStatus')} - ${task.title}`}
                            value={task.status}
                            onChange={(nextStatus) =>
                              updateRepairTask(vehicle.id, task.id, {
                                status: nextStatus,
                              })
                            }
                            options={[
                              { value: 'todo', label: t('taskTodo') },
                              { value: 'in_progress', label: t('taskInProgress') },
                              { value: 'done', label: t('taskDone') },
                            ]}
                            triggerClassName={`text-xs font-bold rounded-lg px-2.5 py-1 border ${
                              task.status === 'done'
                                ? 'bg-emerald-500/15 text-[var(--success)] border-emerald-500/35'
                                : task.status === 'in_progress'
                                ? 'bg-blue-500/15 text-blue-500 border-blue-500/35'
                                : 'bg-amber-500/15 text-[var(--warning)] border-amber-500/35'
                            }`}
                          />
                        </td>

                        {/* Parts Cost Input */}
                        <td className="py-3.5 px-4 text-right">
                          <input
                            type="number"
                            min={0}
                            value={task.partsCost}
                            onChange={(e) =>
                              updateRepairTask(vehicle.id, task.id, {
                                partsCost: Number(e.target.value) || 0,
                              })
                            }
                            className="w-20 px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded-lg text-right font-mono text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] tabular-nums"
                          />
                        </td>

                        {/* Labor Cost Input */}
                        <td className="py-3.5 px-4 text-right">
                          <input
                            type="number"
                            min={0}
                            value={task.laborCost}
                            onChange={(e) =>
                              updateRepairTask(vehicle.id, task.id, {
                                laborCost: Number(e.target.value) || 0,
                              })
                            }
                            className="w-20 px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded-lg text-right font-mono text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] tabular-nums"
                          />
                        </td>

                        {/* Total Cost for this task */}
                        <td className="py-3.5 px-4 text-right font-bold text-[var(--primary)] font-mono text-sm tabular-nums">
                          {formatEuro(task.totalCost)}
                        </td>

                        {/* Delete button */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => deleteRepairTask(vehicle.id, task.id)}
                            className="p-1.5 text-[var(--muted-foreground)] hover:text-red-500 rounded-lg hover:bg-[var(--surface-muted)] transition"
                            title={t('deleteTooltip')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Aggregation summary footer */}
                  <tfoot>
                    <tr className="bg-[var(--surface-muted)] font-bold border-t border-[var(--border)] text-xs">
                      <td colSpan={2} className="py-3 px-4 text-[var(--secondary-foreground)]">
                        {t('totalCumulativeRepairs', { count: repairs.length })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[var(--secondary-foreground)] tabular-nums">
                        {formatEuro(fin.repairPartsTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[var(--secondary-foreground)] tabular-nums">
                        {formatEuro(fin.repairLaborTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-base text-[var(--primary)] tabular-nums">
                        {formatEuro(fin.repairCostTotal)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--surface-muted)] text-[var(--primary)] flex items-center justify-center mx-auto border border-[var(--border)]">
                <Wrench className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[var(--foreground)]">{t('emptyRepairsTitle')}</h3>
              <p className="text-xs text-[var(--muted-foreground)] max-w-md mx-auto">
                {t('emptyRepairsSubtitle')}
              </p>
              <button
                onClick={() => setShowAddTask(true)}
                className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] transition"
              >
                {t('addFirstTask')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GENERAL EXPENSES MODULE (NON-REPAIR FINANCIAL EXPENSES) */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {/* Header & Add CTA */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]">
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-500" />
                {t('generalExpensesTitle', { count: expenses.length })}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('generalExpensesSubtitle')}
              </p>
            </div>

            <button
              onClick={() => setShowAddExpense(!showAddExpense)}
              className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t('newExpenseBtn')}</span>
            </button>
          </div>

          {/* Add Expense Form */}
          {showAddExpense && (
            <form
              onSubmit={handleCreateExpense}
              className="bg-[var(--card)] border border-blue-500/40 rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-lg space-y-4 animate-in fade-in zoom-in-95"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-500" />
                  {t('recordExpenseTitle')}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  {t('closeForm')}
                </button>
              </div>

              {/* Category & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="new-expense-category-select" className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                    {t('expenseCategoryLabel')}
                  </label>
                  <ThemedSelect
                    id="new-expense-category-select"
                    testId="new-expense-category-select"
                    ariaLabel={t('expenseCategoryLabel')}
                    value={expenseCategory}
                    onChange={(nextId) => {
                      setExpenseCategory(nextId);
                      const found = dynamicCategories.find((c) => c.id === nextId);
                      if (found?.defaultAmount && found.defaultAmount > 0 && expenseAmount === '') {
                        setExpenseAmount(found.defaultAmount);
                      }
                    }}
                    options={dynamicCategories.map((cat) => ({
                      value: cat.id,
                      label: pickLocalized(lang, {
                        fr: cat.labelFr,
                        ru: cat.labelRu,
                        hy: cat.labelHy || cat.labelFr,
                        ka: cat.labelKa || cat.labelFr,
                      }),
                    }))}
                    triggerClassName="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                    {t('expenseAmountLabel')}
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="ex. 120"
                    className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] focus:outline-none focus:border-blue-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                    {t('expenseDateLabel')}
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                  {t('expenseDescLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  placeholder={t('expenseDescPlaceholder')}
                  className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Receipt Reference or attachment note */}
              <div>
                <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                  {t('expenseReceiptLabel')}
                </label>
                <input
                  type="text"
                  value={expenseReceipt}
                  onChange={(e) => setExpenseReceipt(e.target.value)}
                  placeholder="ex. Facture N° 2026-89 Dekra..."
                  className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  className="px-4 py-2 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-[var(--ag-button-radius)] transition"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('saveExpenseBtn')}</span>
                </button>
              </div>
            </form>
          )}

          {/* List of General Expenses */}
          {expenses.length > 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[var(--background)] border-b border-[var(--border)] text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
                      <th className="py-3 px-4">{t('thCategory')}</th>
                      <th className="py-3 px-4">{t('thDescription')}</th>
                      <th className="py-3 px-4">{t('thDate')}</th>
                      <th className="py-3 px-4 text-right">{t('thAmount')}</th>
                      <th className="py-3 px-4 text-center">{t('thActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-xs">
                    {expenses.map((expense) => {
                      const catInfo = dynamicCategories.find((c) => c.id === expense.category);
                      const catLabel = catInfo
                        ? pickLocalized(lang, {
                            fr: catInfo.labelFr,
                            ru: catInfo.labelRu,
                            hy: catInfo.labelHy || catInfo.labelFr,
                            ka: catInfo.labelKa || catInfo.labelFr,
                          })
                        : expense.category;
                      return (
                        <tr key={expense.id} className="hover:bg-[var(--surface-muted)] transition">
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]">
                              {catLabel}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-[var(--foreground)]">{expense.description}</div>
                            {expense.receiptUrl && (
                              <div className="text-[11px] text-[var(--muted-foreground)]">
                                Réf : {expense.receiptUrl}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-[var(--secondary-foreground)] tabular-nums">{formatDate(expense.date)}</td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-sm text-[var(--foreground)] tabular-nums">
                            {formatEuro(expense.amount)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => deleteGeneralExpense(vehicle.id, expense.id)}
                              className="p-1.5 text-[var(--muted-foreground)] hover:text-red-500 rounded-lg hover:bg-[var(--surface-muted)] transition"
                              title={t('deleteTooltip')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Aggregation summary */}
                  <tfoot>
                    <tr className="bg-[var(--surface-muted)] font-bold border-t border-[var(--border)] text-xs">
                      <td colSpan={3} className="py-3 px-4 text-[var(--secondary-foreground)]">
                        {t('totalCumulativeExpenses', { count: expenses.length })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-base text-[var(--foreground)] tabular-nums">
                        {formatEuro(fin.generalExpensesTotal)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto border border-blue-500/20">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[var(--foreground)]">{t('emptyExpensesTitle')}</h3>
              <p className="text-xs text-[var(--muted-foreground)] max-w-md mx-auto">
                {t('emptyExpensesSubtitle')}
              </p>
              <button
                onClick={() => setShowAddExpense(true)}
                className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                {t('addFirstExpense')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: VEHICLE DOCUMENTS VAULT & SALES PDF GENERATION */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {/* Vehicle-Scoped Documents Vault */}
          <div
            data-testid="vehicle-documents-vault"
            className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-sm space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-[var(--primary)]" />
                  <span>{t('carDocsSectionTitle')}</span>
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] tabular-nums">
                    {vehicleDocuments.length}
                  </span>
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  {t('carDocsSectionSubtitle')}
                </p>
              </div>

              <button
                type="button"
                data-testid="vehicle-upload-doc-btn"
                onClick={() => openDocCreateModal()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition whitespace-nowrap shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span>{t('uploadDocForCarBtn')}</span>
              </button>
            </div>

            {/* Missing Documents Quick-Upload Bar for this Vehicle */}
            {vehicleMissingReminders.length > 0 && (
              <div
                data-testid="vehicle-missing-docs-strip"
                className="bg-amber-500/5 border border-amber-500/25 rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {t('carDocsMissingTitle')} ({vehicleMissingReminders.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {vehicleMissingReminders.map((rem) => (
                    <button
                      key={rem.id}
                      type="button"
                      data-testid={`vehicle-missing-upload-${rem.category}`}
                      onClick={() => openDocCreateModal({ category: rem.category })}
                      title={pickLocalized(lang, {
                        fr: rem.reasonFr,
                        ru: rem.reasonRu,
                        hy: rem.reasonHy,
                        ka: rem.reasonKa,
                      })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition hover:opacity-90 ${
                        rem.severity === 'high'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                      <span>{getDocumentCategoryLabel(rem.category, lang)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category Filter Chips */}
            {vehicleDocuments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="vehicle-doc-filter-all"
                  onClick={() => setDocCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
                    docCategoryFilter === 'all'
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                      : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--primary)]/50'
                  }`}
                >
                  {t('docsAllCategories')} ({docCategoryCounts.all})
                </button>
                {DOCUMENT_CATEGORIES.filter((cat) => docCategoryCounts[cat.id] > 0).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    data-testid={`vehicle-doc-filter-${cat.id}`}
                    onClick={() => setDocCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold border transition ${
                      docCategoryFilter === cat.id
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                        : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--primary)]/50'
                    }`}
                  >
                    {getDocumentCategoryLabel(cat.id, lang)} ({docCategoryCounts[cat.id]})
                  </button>
                ))}
              </div>
            )}

            {/* Vehicle Document Cards Grid or Empty State */}
            {filteredVehicleDocuments.length > 0 ? (
              <div
                data-testid="vehicle-documents-grid"
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              >
                {filteredVehicleDocuments.map((docItem) => (
                  <DocumentCard
                    key={docItem.id}
                    doc={docItem}
                    boundVehicle={vehicle}
                    showVehicleLink={false}
                    onPreview={(d) => setPreviewDoc(d)}
                    onDownload={handleDownloadDocument}
                    onEdit={openDocEditModal}
                    onDelete={handleDeleteDocument}
                  />
                ))}
              </div>
            ) : (
              <div
                data-testid="vehicle-documents-empty"
                className="bg-[var(--background)] border border-dashed border-[var(--border)] rounded-[var(--ag-card-radius)] p-8 text-center space-y-3"
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center mx-auto border border-[var(--primary)]/20">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--foreground)]">
                  {t('carDocsEmptyTitle')}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)] max-w-md mx-auto">
                  {t('carDocsEmptySubtitle')}
                </p>
                <button
                  type="button"
                  onClick={() => openDocCreateModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t('uploadDocForCarBtn')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Official Sales & Administrative PDF Generation */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[var(--primary)]" />
                {t('officialDocumentsTitle')}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                {t('officialDocumentsSubtitle')}
              </p>
            </div>

            {/* Document Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Doc 1: Facture de Vente Véhicule d'Occasion */}
              <div className="bg-[var(--surface-muted)] border border-[var(--border)] hover:border-[var(--primary)] rounded-[var(--ag-card-radius)] p-4 flex flex-col justify-between space-y-4 shadow-sm transition">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-[var(--primary)] flex items-center justify-center border border-amber-500/20">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-[var(--foreground)] text-sm">
                    {t('docInvoiceTitle')}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {t('docInvoiceDesc')}
                  </p>
                </div>
                <button
                  onClick={() => generateSalesInvoicePDF(vehicle, garageSettings)}
                  className="w-full py-2.5 px-4 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('downloadInvoiceBtn')}</span>
                </button>
              </div>

              {/* Doc 2: Certificat de Cession Cerfa 15776*02 */}
              {featureFlags.cerfaGenerator && (
                <div className="bg-[var(--surface-muted)] border border-[var(--border)] hover:border-blue-500/50 rounded-[var(--ag-card-radius)] p-4 flex flex-col justify-between space-y-4 shadow-sm transition">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-[var(--foreground)] text-sm">
                      {t('docCerfaTitle')}
                    </h3>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {t('docCerfaDesc')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCerfaWizard(true)}
                    className="w-full py-2.5 px-4 rounded-[var(--ag-button-radius)] text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>{t('downloadCerfaBtn')}</span>
                  </button>
                </div>
              )}

              {/* Doc 3: Fiche Bilan Financier P&L Détaillé */}
              {featureFlags.pnlCalculator && (
                <div className="bg-[var(--surface-muted)] border border-[var(--border)] hover:border-emerald-500/50 rounded-[var(--ag-card-radius)] p-4 flex flex-col justify-between space-y-4 shadow-sm transition">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-[var(--success)] flex items-center justify-center border border-emerald-500/20">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-[var(--foreground)] text-sm">
                      {t('docPnlTitle')}
                    </h3>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {t('docPnlDesc')}
                    </p>
                  </div>
                  <button
                    onClick={() => generateVehicleFinancialReportPDF(vehicle, repairs, expenses, garageSettings)}
                    className="w-full py-2.5 px-4 rounded-[var(--ag-button-radius)] text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('downloadPnlBtn')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Buyer information recap & modify button */}
            <div className="pt-4 border-t border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  {t('registeredBuyerCoords')}
                </h3>
                <button
                  onClick={() => onOpenSellModal(vehicle)}
                  className="text-xs font-bold text-[var(--primary)]"
                >
                  {vehicle.buyerInfo ? t('editBuyerCoords') : t('fillBuyerCoords')}
                </button>
              </div>

              {vehicle.buyerInfo ? (
                <div className="bg-[var(--background)] p-4 rounded-2xl border border-[var(--border)] text-xs grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-[var(--muted-foreground)] block">{t('buyer')}</span>
                    <span className="text-[var(--foreground)] font-bold block">{vehicle.buyerInfo.fullName}</span>
                    <span
                      data-testid="buyer-recap-seller-regime"
                      className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isParticulier
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {isParticulier ? 'Particulier (0 €)' : 'Micro-entrepreneur'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)] block">{t('phone')} & {t('email')}</span>
                    <span className="text-[var(--secondary-foreground)] block">{vehicle.buyerInfo.phone}</span>
                    <span className="text-[var(--muted-foreground)] block truncate">{vehicle.buyerInfo.email}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)] block">{t('billingAddress')}</span>
                    <span className="text-[var(--secondary-foreground)] block">{vehicle.buyerInfo.address}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)] block">{t('netSalePrice')}</span>
                    <span className="text-[var(--success)] font-extrabold text-sm block tabular-nums">
                      {formatEuro(vehicle.buyerInfo.salePrice)}
                    </span>
                    <span className="text-[var(--muted-foreground)] text-[10px] tabular-nums">le {formatDate(vehicle.buyerInfo.saleDate)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[var(--muted-foreground)] italic">
                  {t('noBuyerYet')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Document Upload / Edit Modal */}
      <DocumentUploadModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        editingDoc={editingDoc}
        preset={docUploadPreset}
        vehicles={modalVehicles}
        uniqueClients={uniqueClients}
        userId={userId}
        userEmail={userEmail}
        activeGarageId={activeGarageId}
      />

      {/* Vehicle Document Preview Modal */}
      <DocumentPreviewModal
        doc={previewDoc}
        historyEvents={documentHistory}
        onClose={() => setPreviewDoc(null)}
        onDownload={handleDownloadDocument}
      />

      {/* Cerfa 15776*02 Multi-Step Wizard */}
      <Cerfa15776Modal
        isOpen={showCerfaWizard}
        onClose={() => setShowCerfaWizard(false)}
        vehicle={vehicle}
        userId={userId}
        onValidationToast={onValidationToast}
      />
    </div>
  );
};
