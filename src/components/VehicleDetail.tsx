import React, { useState, useEffect } from 'react';
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
  Image as ImageIcon,
} from 'lucide-react';
import {
  Vehicle,
  VehicleStatus,
  RepairTask,
  RepairTaskStatus,
  GeneralExpense,
  GeneralExpenseCategory,
  DynamicExpenseCategory,
  FeatureFlagsConfig,
  TASK_PRESETS,
} from '../types/garage';
import { formatEuro, formatDate, calculateVehicleFinancials, calculateSaleTaxReport, getEffectiveSalePrice } from '../utils/finance';
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
import { VehiclePhotoPlaceholder } from './VehiclePhotoPlaceholder';

interface VehicleDetailProps {
  vehicle: Vehicle;
  onBack: () => void;
  onOpenEdit: (vehicle: Vehicle) => void;
  onOpenSellModal: (vehicle: Vehicle) => void;
  onDeleteVehicle: (vehicleId: string) => void;
  userId: string;
  featureFlags?: FeatureFlagsConfig;
}

export const VehicleDetail: React.FC<VehicleDetailProps> = ({
  vehicle,
  onBack,
  onOpenEdit,
  onOpenSellModal,
  onDeleteVehicle,
  userId,
  featureFlags = DEFAULT_FEATURE_FLAGS,
}) => {
  const { t, lang, getTextStyle } = useI18n();
  const [activeTab, setActiveTab] = useState<'overview' | 'repairs' | 'expenses' | 'documents'>('overview');
  const [repairs, setRepairs] = useState<RepairTask[]>([]);
  const [expenses, setExpenses] = useState<GeneralExpense[]>([]);
  const [isLoadingSubdata, setIsLoadingSubdata] = useState(true);
  const [showCerfaWizard, setShowCerfaWizard] = useState(false);

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

    const unsubRepairs = subscribeRepairs(vehicle.id, (loadedRepairs) => {
      setRepairs(loadedRepairs);
    });

    const unsubExpenses = subscribeExpenses(vehicle.id, (loadedExpenses) => {
      setExpenses(loadedExpenses);
      setIsLoadingSubdata(false);
    });

    return () => {
      unsubRepairs();
      unsubExpenses();
    };
  }, [vehicle.id]);

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

  const isSold = vehicle.status === 'sold';
  const effectiveSalePrice = getEffectiveSalePrice(vehicle);
  const hasSalePrice = effectiveSalePrice > 0;
  const saleReport = hasSalePrice
    ? calculateSaleTaxReport({
        salePrice: effectiveSalePrice,
        purchasePrice: vehicle.purchasePrice,
        repairCostTotal: fin.repairCostTotal,
        generalExpensesTotal: fin.generalExpensesTotal,
        taxRegime: garageSettings.taxRegime,
        taxRatePercent: garageSettings.taxRatePercent,
      })
    : null;

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
    setTaskTitle(lang === 'ru' ? preset.labelRu : preset.labelFr);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-[var(--surface-muted)] border border-[var(--border)] rounded-[var(--ag-button-radius)] transition"
            title={t('backToFleet')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--foreground)] tracking-tight">
                {vehicle.make} {vehicle.model}
              </h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] tabular-nums">
                {vehicle.year}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusBadge.bg}`}>
                {statusBadge.label}
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
              <span>VIN : {vehicle.vin}</span>
              <span>·</span>
              <span>{vehicle.mileage.toLocaleString(lang === 'ru' ? 'ru-RU' : 'fr-FR')} km</span>
              <span>·</span>
              <span className="text-[var(--secondary-foreground)]">{vehicle.trim || 'Standard'}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons: Status selector, Edit, Sell, Delete */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Dynamic Lifecycle Status Selector */}
          <div className="flex items-center bg-[var(--background)] p-1 rounded-[var(--ag-button-radius)] border border-[var(--border)]">
            <span className="text-[11px] text-[var(--muted-foreground)] px-2 font-medium">{t('statusLabel')}</span>
            <select
              value={vehicle.status}
              onChange={(e) => handleStatusChange(e.target.value as VehicleStatus)}
              className="text-xs font-bold bg-[var(--surface-muted)] text-[var(--foreground)] rounded-lg px-2.5 py-1.5 border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] cursor-pointer"
            >
              <option value="preparation">🛠️ {t('statusPreparation')}</option>
              <option value="repair">🔧 {t('statusRepair')}</option>
              <option value="for_sale">🏷️ {t('statusForSale')}</option>
              <option value="sold">✅ {t('statusSold')}</option>
            </select>
          </div>

          {!isSold ? (
            <button
              onClick={() => onOpenSellModal(vehicle)}
              className="px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span style={getTextStyle('recordSaleBtn')}>{t('recordSaleBtn')}</span>
            </button>
          ) : (
            <button
              onClick={() => generateSalesInvoicePDF(vehicle)}
              className="px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span style={getTextStyle('invoicePdfBtn')}>{t('invoicePdfBtn')}</span>
            </button>
          )}

          <button
            onClick={() => onOpenEdit(vehicle)}
            className="p-2 text-[var(--secondary-foreground)] hover:text-[var(--foreground)] bg-[var(--surface-muted)] border border-[var(--border)] rounded-[var(--ag-button-radius)] transition"
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
            className="p-2 text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-[var(--ag-button-radius)] transition border border-red-500/30"
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
                  hasSalePrice ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
                }`}
              >
                {hasSalePrice ? formatEuro(effectiveSalePrice) : '—'}
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {isSold ? t('soldTo', { name: vehicle.buyerInfo?.fullName || 'Client' }) : t('inListing')}
              </span>
            </div>

            {/* 6. Bénéfice Net (Marge P&L & ROI) */}
            <div
              className={`p-3 rounded-xl border ${
                !hasSalePrice
                  ? 'bg-[var(--ag-metric-bg)] border-[var(--border)] text-[var(--muted-foreground)]'
                  : ''
              }`}
              style={
                hasSalePrice
                  ? fin.netProfit >= 0
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
              {hasSalePrice ? (
                <>
                  <div className="text-base sm:text-lg font-black tabular-nums">
                    {fin.netProfit >= 0 ? '+' : ''}
                    {formatEuro(fin.netProfit)}
                  </div>
                  <span className="text-[10px] font-mono font-bold block tabular-nums">
                    {t('marginPercent', { val: fin.marginPercentage.toFixed(1) })} | {t('roiPercent', { val: fin.roiPercentage.toFixed(1) })}
                  </span>
                </>
              ) : (
                <div className="text-base sm:text-lg font-mono font-bold text-[var(--muted-foreground)]">
                  —
                </div>
              )}
            </div>
          </div>

          {/* Structured Sale Financial Report (Gross Margin -> Tax by Settings -> Net Profit) */}
          {saleReport && (
            <div
              data-testid="sale-financial-report"
              className="mt-4 bg-[var(--ag-receipt-bg)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] font-mono text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--border)]">
                <span
                  style={getTextStyle('saleReportTitle')}
                  className="font-bold text-[var(--ag-detail-heading)]"
                >
                  {t('saleReportTitle', { vehicle: `${vehicle.make} ${vehicle.model}` })}
                </span>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {t('saleReportRegime', { regime: saleReport.taxLabel })}
                </span>
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
              </div>
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
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs sm:text-sm font-bold transition whitespace-nowrap ${
            activeTab === 'documents'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{t('tabDocuments')}</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & PHOTOS */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Photo Gallery & Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main Photo & Carousel */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-hidden shadow-sm">
              <div className="relative h-72 sm:h-96 w-full bg-[var(--background)]">
                {vehicle.photos && vehicle.photos.length > 0 ? (
                  <img
                    src={vehicle.photos[0]}
                    alt={vehicle.model}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <VehiclePhotoPlaceholder variant="detail" />
                )}
                <div className="absolute top-4 right-4 bg-[var(--card)]/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-[var(--foreground)] border border-[var(--border)]">
                  {vehicle.photos.length} Photo{vehicle.photos.length > 1 ? 's' : ''}
                </div>
              </div>

              {/* Thumbnails */}
              {vehicle.photos.length > 1 && (
                <div className="p-4 bg-[var(--surface-muted)] border-t border-[var(--border)] flex gap-3 overflow-x-auto">
                  {vehicle.photos.map((p, idx) => (
                    <img
                      key={idx}
                      src={p}
                      alt={`Vue ${idx + 1}`}
                      className="w-20 h-14 rounded-lg object-cover border border-[var(--border)] shrink-0 cursor-pointer hover:border-[var(--primary)] transition"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Technical Specifications Summary Card */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-sm space-y-4">
              <h3 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[var(--primary)]" />
                {t('techSpecTitle')}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('make')}</span>
                  <span className="text-[var(--foreground)] font-bold text-sm">{vehicle.make}</span>
                </div>
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('model')}</span>
                  <span className="text-[var(--foreground)] font-bold text-sm">{vehicle.model}</span>
                </div>
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('year')}</span>
                  <span className="text-[var(--foreground)] font-bold text-sm tabular-nums">{vehicle.year}</span>
                </div>
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('mileage')}</span>
                  <span className="text-[var(--foreground)] font-bold text-sm tabular-nums">
                    {vehicle.mileage.toLocaleString(lang === 'ru' ? 'ru-RU' : 'fr-FR')} km
                  </span>
                </div>
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('vinFieldLabel')}</span>
                  <span className="text-[var(--primary)] font-mono font-bold text-xs break-all">{vehicle.vin}</span>
                </div>
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('plateFieldLabel')}</span>
                  <span className="text-blue-500 font-mono font-bold text-sm">
                    {vehicle.registrationNumber || '—'}
                  </span>
                </div>
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('purchaseDate')}</span>
                  <span className="text-[var(--foreground)] font-bold text-sm tabular-nums">{formatDate(vehicle.purchaseDate)}</span>
                </div>
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('purchasePriceLabel')}</span>
                  <span className="text-[var(--foreground)] font-bold text-sm tabular-nums">
                    {formatEuro(vehicle.purchasePrice)}
                  </span>
                </div>
                <div className="bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] block">{t('targetSalePriceInput')}</span>
                  <span className="text-[var(--foreground)] font-bold text-sm tabular-nums">
                    {vehicle.targetSalePrice > 0 ? formatEuro(vehicle.targetSalePrice) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Buyer Info & Quick Checklist Status */}
          <div className="space-y-6">
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
                    onClick={() => generateSalesInvoicePDF(vehicle)}
                    className="w-full mt-2 py-2 px-3 rounded-[var(--ag-button-radius)] bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center justify-center gap-2 transition whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('downloadInvoicePdf')}</span>
                  </button>
                </div>
              ) : (
                <div className="bg-[var(--surface-muted)] p-5 rounded-xl border border-[var(--border)] text-center space-y-3">
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
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 shadow-sm space-y-3">
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
      )}

      {/* TAB 2: REPAIR WORKS & TASKS MODULE (TO-DO CHECKLIST) */}
      {featureFlags.repairChecklist && activeTab === 'repairs' && (
        <div className="space-y-6">
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
                      {lang === 'ru' ? preset.labelRu : preset.labelFr}
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
                  <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                    {t('taskStatusLabel')}
                  </label>
                  <select
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value as RepairTaskStatus)}
                    className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] cursor-pointer"
                  >
                    <option value="todo">{t('taskTodo')}</option>
                    <option value="in_progress">{t('taskInProgress')}</option>
                    <option value="done">{t('taskDone')}</option>
                  </select>
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
                          <select
                            value={task.status}
                            onChange={(e) =>
                              updateRepairTask(vehicle.id, task.id, {
                                status: e.target.value as RepairTaskStatus,
                              })
                            }
                            className={`text-xs font-bold rounded-lg px-2.5 py-1 border cursor-pointer ${
                              task.status === 'done'
                                ? 'bg-emerald-500/10 text-[var(--success)] border-emerald-500/30'
                                : task.status === 'in_progress'
                                ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                                : 'bg-amber-500/10 text-[var(--warning)] border-amber-500/30'
                            }`}
                          >
                            <option value="todo">{t('taskTodo')}</option>
                            <option value="in_progress">{t('taskInProgress')}</option>
                            <option value="done">{t('taskDone')}</option>
                          </select>
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
        <div className="space-y-6">
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
                  <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1">
                    {t('expenseCategoryLabel')}
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setExpenseCategory(nextId);
                      const found = dynamicCategories.find((c) => c.id === nextId);
                      if (found?.defaultAmount && found.defaultAmount > 0 && expenseAmount === '') {
                        setExpenseAmount(found.defaultAmount);
                      }
                    }}
                    className="w-full px-3.5 py-2 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {dynamicCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {lang === 'ru' ? cat.labelRu : cat.labelFr}
                      </option>
                    ))}
                  </select>
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
                        ? (lang === 'ru' ? catInfo.labelRu : catInfo.labelFr)
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

      {/* TAB 4: SALES & DOCUMENT GENERATION MODULE */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] shadow-sm space-y-6">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Doc 1: Facture de Vente Véhicule d'Occasion */}
              <div className="bg-[var(--surface-muted)] border border-[var(--border)] hover:border-[var(--primary)] rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between space-y-4 shadow-sm transition">
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
                  onClick={() => generateSalesInvoicePDF(vehicle)}
                  className="w-full py-2.5 px-4 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('downloadInvoiceBtn')}</span>
                </button>
              </div>

              {/* Doc 2: Certificat de Cession Cerfa 15776*02 */}
              {featureFlags.cerfaGenerator && (
                <div className="bg-[var(--surface-muted)] border border-[var(--border)] hover:border-blue-500/50 rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between space-y-4 shadow-sm transition">
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
                <div className="bg-[var(--surface-muted)] border border-[var(--border)] hover:border-emerald-500/50 rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between space-y-4 shadow-sm transition">
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
                    onClick={() => generateVehicleFinancialReportPDF(vehicle, repairs, expenses)}
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
                    <span className="text-[var(--foreground)] font-bold">{vehicle.buyerInfo.fullName}</span>
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

      {/* Cerfa 15776*02 Multi-Step Wizard */}
      <Cerfa15776Modal
        isOpen={showCerfaWizard}
        onClose={() => setShowCerfaWizard(false)}
        vehicle={vehicle}
      />
    </div>
  );
};
