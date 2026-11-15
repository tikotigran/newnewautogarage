import React, { useEffect, useMemo, useState } from 'react';
import {
  Wrench,
  Fuel,
  Sparkles,
  FileText,
  Truck,
  Coins,
  Calendar,
  ArrowRight,
  BarChart3,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  Award,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  PiggyBank,
} from 'lucide-react';
import { Vehicle, RepairTask, GeneralExpense, FeatureFlagsConfig, GarageSettings } from '../types/garage';
import { getGarageSettings, subscribeAllFleetExpensesAndRepairs } from '../services/garageService';
import {
  AgingTier,
  AnalyticsExpenseCategoryId,
  AnalyticsTimeRange,
  computeDealershipAnalytics,
} from '../utils/analytics';
import { DEFAULT_FEATURE_FLAGS } from '../utils/adminUtils';
import { formatEuro } from '../utils/finance';
import { useI18n } from '../i18n/I18nContext';

interface AnalyticsViewProps {
  vehicles: Vehicle[];
  onSelectVehicle: (vehicle: Vehicle) => void;
  featureFlags?: FeatureFlagsConfig;
}

const CATEGORY_ICONS: Record<AnalyticsExpenseCategoryId, React.ReactNode> = {
  parts_labor: <Wrench className="w-4 h-4" />,
  fuel: <Fuel className="w-4 h-4" />,
  detailing: <Sparkles className="w-4 h-4" />,
  registration: <FileText className="w-4 h-4" />,
  transport: <Truck className="w-4 h-4" />,
  other: <Coins className="w-4 h-4" />,
};

function getDefaultCustomDates(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function getAgingBadgeClasses(tier: AgingTier): string {
  switch (tier) {
    case 'critical':
      return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
    case 'aging':
      return 'bg-orange-500/15 text-orange-500 border-orange-500/30';
    case 'watch':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    default:
      return 'bg-[var(--surface-muted)] text-[var(--muted-foreground)] border-[var(--border)]';
  }
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  vehicles,
  onSelectVehicle,
  featureFlags = DEFAULT_FEATURE_FLAGS,
}) => {
  const { lang, t, getTextStyle } = useI18n();
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('month');
  const defaultDates = useMemo(() => getDefaultCustomDates(), []);
  const [customStartDate, setCustomStartDate] = useState<string>(defaultDates.startDate);
  const [customEndDate, setCustomEndDate] = useState<string>(defaultDates.endDate);
  const [selectedCategoryId, setSelectedCategoryId] = useState<AnalyticsExpenseCategoryId | null>(null);
  const [garageSettings, setGarageSettings] = useState<GarageSettings>(() => getGarageSettings());
  const [fleetData, setFleetData] = useState<{
    repairs: RepairTask[];
    expenses: GeneralExpense[];
  }>({ repairs: [], expenses: [] });

  useEffect(() => {
    const syncSettings = () => setGarageSettings(getGarageSettings());
    syncSettings();
    window.addEventListener('autogarage_settings_updated', syncSettings);
    return () => window.removeEventListener('autogarage_settings_updated', syncSettings);
  }, []);

  useEffect(() => {
    const unsub = subscribeAllFleetExpensesAndRepairs(vehicles, (data) => {
      setFleetData(data);
    });
    return () => unsub();
  }, [vehicles]);

  const report = useMemo(() => {
    return computeDealershipAnalytics({
      vehicles,
      repairs: fleetData.repairs,
      expenses: fleetData.expenses,
      timeRange,
      customRange:
        timeRange === 'custom'
          ? { startDate: customStartDate, endDate: customEndDate }
          : undefined,
      taxRegime: garageSettings.taxRegime,
      taxRatePercent: garageSettings.taxRatePercent,
    });
  }, [
    vehicles,
    fleetData.repairs,
    fleetData.expenses,
    timeRange,
    customStartDate,
    customEndDate,
    garageSettings.taxRegime,
    garageSettings.taxRatePercent,
  ]);

  const analytics = report.expenseBreakdown;
  const { inventory, salesPerformance, monthlySnapshot, cashFlow } = report;

  const timeRanges: { id: AnalyticsTimeRange; label: string }[] = [
    { id: 'today', label: t('periodToday') },
    { id: 'week', label: t('periodWeek') },
    { id: 'month', label: t('periodMonth') },
    { id: 'quarter', label: t('periodQuarter') },
    { id: 'year', label: t('periodYear') },
    { id: 'custom', label: t('periodCustom') },
    { id: 'all', label: t('periodAll') },
  ];

  const activeCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    return analytics.categories.find((c) => c.id === selectedCategoryId) || null;
  }, [analytics.categories, selectedCategoryId]);

  const displayedVehicles = useMemo(() => {
    if (activeCategory) {
      return activeCategory.vehicleContributions;
    }
    const byVeh = new Map<
      string,
      {
        vehicleId: string;
        vehicleName: string;
        year: number;
        registrationNumber?: string;
        vin: string;
        amount: number;
        entryCount: number;
      }
    >();
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    for (const entry of analytics.entries) {
      const v = vehicleMap.get(entry.vehicleId);
      const prev = byVeh.get(entry.vehicleId) || {
        vehicleId: entry.vehicleId,
        vehicleName: v ? `${v.make} ${v.model}` : entry.vehicleId,
        year: v?.year || 0,
        registrationNumber: v?.registrationNumber,
        vin: v?.vin || '',
        amount: 0,
        entryCount: 0,
      };
      byVeh.set(entry.vehicleId, {
        ...prev,
        amount: Math.round((prev.amount + entry.amount + Number.EPSILON) * 100) / 100,
        entryCount: prev.entryCount + 1,
      });
    }
    return Array.from(byVeh.values())
      .map((item) => ({
        ...item,
        percentageOfCategory:
          analytics.totalSpent > 0
            ? Math.round(((item.amount / analytics.totalSpent) * 100 + Number.EPSILON) * 100) / 100
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeCategory, analytics.entries, analytics.totalSpent, vehicles]);

  const maxCashFlowBucket = useMemo(() => {
    let maxVal = 0;
    for (const b of cashFlow.series) {
      if (b.inflow > maxVal) maxVal = b.inflow;
      if (b.outflow > maxVal) maxVal = b.outflow;
    }
    return maxVal;
  }, [cashFlow.series]);

  const getStatusLabel = (status: Vehicle['status']) => {
    switch (status) {
      case 'preparation':
        return t('statusPreparation');
      case 'repair':
        return t('statusRepair');
      case 'for_sale':
        return t('statusForSale');
      case 'sold':
        return t('statusSold');
    }
  };

  return (
    <div className="space-y-6" data-testid="analytics-page">
      {/* Header & Period Switcher */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-5 h-5 shrink-0" style={{ color: 'var(--ag-chart-accent)' }} />
              <h1
                style={getTextStyle('analyticsTitle')}
                className="text-xl font-bold text-[var(--foreground)] tracking-tight"
              >
                {t('analyticsTitle')}
              </h1>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{t('analyticsSubtitle')}</p>
          </div>

          {/* 7-option Period Segmented Control (Today, Week, Month, Quarter, Year, Custom, All) */}
          <div
            className="flex flex-wrap items-center gap-1 bg-[var(--background)] p-1 rounded-[var(--ag-button-radius)] border border-[var(--border)]"
            role="group"
            aria-label="Period selector"
            data-testid="analytics-period-selector"
          >
            <span className="px-2 text-[var(--muted-foreground)] hidden sm:inline-flex items-center">
              <Calendar className="w-3.5 h-3.5" />
            </span>
            {timeRanges.map((tr) => (
              <button
                key={tr.id}
                type="button"
                data-testid={`period-btn-${tr.id}`}
                onClick={() => setTimeRange(tr.id)}
                aria-pressed={timeRange === tr.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  timeRange === tr.id
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {timeRange === 'custom' && (
          <div
            className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border)]"
            data-testid="analytics-custom-date-range"
          >
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--secondary-foreground)]">
              <span>{t('customDateStart')}</span>
              <input
                type="date"
                data-testid="custom-start-date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--secondary-foreground)]">
              <span>{t('customDateEnd')}</span>
              <input
                type="date"
                data-testid="custom-end-date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </label>
          </div>
        )}
      </div>

      {/* SECTION 1: Strictly Separated 3 Financial Pillars (Revenue / Gross Profit / Net Profit) */}
      {featureFlags.pnlCalculator && (
        <section className="space-y-3" data-testid="analytics-three-pillars">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('analyticsPillarsHeading')}
            </h2>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-[var(--surface-muted)] text-[var(--secondary-foreground)] border border-[var(--border)] tabular-nums">
              {t('saleReportRegime', { regime: salesPerformance.taxLabel })}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. REVENUE */}
            <div
              data-testid="pillar-revenue"
              className="bg-[var(--card)] border border-sky-500/30 rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-sky-500">
                    {t('pillarRevenueLabel')}
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-sky-500 shrink-0" />
                </div>
                <p
                  data-testid="pillar-revenue-value"
                  className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] tabular-nums mt-2"
                >
                  {formatEuro(salesPerformance.revenue)}
                </p>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-2 tabular-nums">
                {t('pillarRevenueHint', { count: salesPerformance.soldCount })}
              </p>
            </div>

            {/* 2. GROSS PROFIT */}
            <div
              data-testid="pillar-gross-profit"
              className="bg-[var(--card)] border border-indigo-500/30 rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-indigo-400">
                    {t('pillarGrossProfitLabel')}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-indigo-400">
                    {salesPerformance.grossMarginPercent}%
                  </span>
                </div>
                <p
                  data-testid="pillar-gross-profit-value"
                  className="text-2xl sm:text-3xl font-bold tabular-nums mt-2"
                  style={{
                    color:
                      salesPerformance.grossProfit >= 0
                        ? 'var(--foreground)'
                        : 'var(--ag-expense-color)',
                  }}
                >
                  {salesPerformance.grossProfit > 0 ? '+' : ''}
                  {formatEuro(salesPerformance.grossProfit)}
                </p>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                {t('pillarGrossProfitHint')}
              </p>
            </div>

            {/* 3. NET PROFIT (After expenses & taxes) */}
            <div
              data-testid="pillar-net-profit"
              className="bg-[var(--card)] border border-emerald-500/40 rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--ag-profit-color)' }}>
                    <TrendingUp className="w-3.5 h-3.5" />
                    {t('pillarNetProfitLabel')}
                  </span>
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{
                      color:
                        salesPerformance.netProfit >= 0
                          ? 'var(--ag-profit-color)'
                          : 'var(--ag-expense-color)',
                    }}
                  >
                    {salesPerformance.netMarginPercent}%
                  </span>
                </div>
                <p
                  data-testid="pillar-net-profit-value"
                  className="text-2xl sm:text-3xl font-bold tabular-nums mt-2"
                  style={{
                    color:
                      salesPerformance.netProfit >= 0
                        ? 'var(--ag-profit-color)'
                        : 'var(--ag-expense-color)',
                  }}
                >
                  {salesPerformance.netProfit > 0 ? '+' : ''}
                  {formatEuro(salesPerformance.netProfit)}
                </p>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-2 tabular-nums">
                {t('pillarNetProfitHint', {
                  regime: salesPerformance.taxLabel,
                  tax: formatEuro(salesPerformance.taxAmount),
                })}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 2: Warehouse Stock Value, Invested Capital, Potential Profit & Monthly/Unit Economics */}
      <section className="space-y-4" data-testid="analytics-kpi-grid">
        {/* Stock & Capital Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            data-testid="kpi-stock-value"
            className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--muted-foreground)] font-medium">
                {t('analyticsStockValueTitle')}
              </p>
              <Package className="w-4 h-4 text-[var(--muted-foreground)]" />
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums mt-1">
              {formatEuro(inventory.totalStockValue)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 tabular-nums">
              {t('analyticsStockValueHint', { count: inventory.activeCount })}
              {inventory.unpricedCount > 0 && (
                <> · {t('analyticsUnpricedNote', { count: inventory.unpricedCount })}</>
              )}
            </p>
          </div>

          <div
            data-testid="kpi-invested-capital"
            className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--muted-foreground)] font-medium">
                {t('analyticsInvestedTitle')}
              </p>
              <Wallet className="w-4 h-4" style={{ color: 'var(--ag-chart-accent)' }} />
            </div>
            <p
              className="text-2xl font-bold tabular-nums mt-1"
              style={{ color: 'var(--ag-chart-accent)' }}
            >
              {formatEuro(inventory.totalInvestedInStock)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              {t('analyticsInvestedHint')}
            </p>
          </div>

          <div
            data-testid="kpi-potential-profit"
            className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--muted-foreground)] font-medium">
                {t('analyticsPotentialProfitTitle')}
              </p>
              <PiggyBank className="w-4 h-4" style={{ color: 'var(--ag-profit-color)' }} />
            </div>
            <p
              className="text-2xl font-bold tabular-nums mt-1"
              style={{
                color:
                  inventory.totalPotentialProfit >= 0
                    ? 'var(--ag-profit-color)'
                    : 'var(--ag-expense-color)',
              }}
            >
              {inventory.totalPotentialProfit > 0 ? '+' : ''}
              {formatEuro(inventory.totalPotentialProfit)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 tabular-nums">
              {t('analyticsPotentialProfitHint', { count: inventory.pricedCount })}
            </p>
          </div>
        </div>

        {/* Monthly Snapshot & Unit Velocity Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            data-testid="kpi-monthly-revenue"
            className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4"
          >
            <p className="text-xs text-[var(--muted-foreground)] font-medium">
              {t('analyticsMonthlyRevenueTitle')}
            </p>
            <p className="text-xl font-bold text-[var(--foreground)] tabular-nums mt-1">
              {formatEuro(monthlySnapshot.monthlyRevenue)}
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)] mt-1 tabular-nums">
              {t('analyticsMonthlyRevenueHint', { count: monthlySnapshot.monthlySoldCount })}
            </p>
          </div>

          <div
            data-testid="kpi-monthly-expenses"
            className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4"
          >
            <p className="text-xs text-[var(--muted-foreground)] font-medium">
              {t('analyticsMonthlyExpensesTitle')}
            </p>
            <p
              className="text-xl font-bold tabular-nums mt-1"
              style={{ color: 'var(--ag-expense-color)' }}
            >
              {formatEuro(monthlySnapshot.monthlyExpenses)}
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
              {t('analyticsMonthlyExpensesHint')}
            </p>
          </div>

          <div
            data-testid="kpi-avg-margin"
            className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4"
          >
            <p className="text-xs text-[var(--muted-foreground)] font-medium">
              {t('analyticsAvgMarginTitle')}
            </p>
            <p
              className="text-xl font-bold tabular-nums mt-1"
              style={{
                color:
                  salesPerformance.averageNetMarginEuro >= 0
                    ? 'var(--ag-profit-color)'
                    : 'var(--ag-expense-color)',
              }}
            >
              {salesPerformance.soldCount > 0
                ? `${salesPerformance.averageNetMarginEuro > 0 ? '+' : ''}${formatEuro(salesPerformance.averageNetMarginEuro)}`
                : '—'}
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)] mt-1 tabular-nums">
              {salesPerformance.soldCount > 0
                ? `${t('analyticsAvgMarginHint', {
                    gross: formatEuro(salesPerformance.averageGrossMarginEuro),
                  })} (${salesPerformance.netMarginPercent}%)`
                : t('analyticsNoSalesPeriod')}
            </p>
          </div>

          <div
            data-testid="kpi-avg-sale-time"
            className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--muted-foreground)] font-medium">
                {t('analyticsAvgSaleTimeTitle')}
              </p>
              <Clock className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            </div>
            <p className="text-xl font-bold text-[var(--foreground)] tabular-nums mt-1">
              {salesPerformance.averageDaysToSell !== null
                ? t('analyticsDaysUnit', { days: salesPerformance.averageDaysToSell })
                : '—'}
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)] mt-1 tabular-nums">
              {report.averageDaysInStock !== null
                ? t('analyticsAvgStockAgeHint', { days: report.averageDaysInStock })
                : t('analyticsAllStockFresh')}
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 3: Cash Flow Panel */}
      <section
        data-testid="analytics-cash-flow"
        className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              <Wallet className="w-4 h-4" style={{ color: 'var(--ag-chart-accent)' }} />
              <span>{t('analyticsCashFlowTitle')}</span>
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {t('analyticsCashFlowSubtitle')}
            </p>
          </div>
        </div>

        {/* Inflow / Outflow / Net Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
              <span>{t('analyticsCashInflow')}</span>
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl font-bold text-emerald-500 tabular-nums mt-1">
              +{formatEuro(cashFlow.inflow)}
            </p>
          </div>

          <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
              <span>{t('analyticsCashOutflow')}</span>
              <ArrowDownRight className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-xl font-bold text-rose-500 tabular-nums mt-1">
              -{formatEuro(cashFlow.outflow)}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)] tabular-nums">
              <span>{t('analyticsOutflowPurchases')}:</span>
              <span className="text-right font-semibold text-[var(--secondary-foreground)]">
                {formatEuro(cashFlow.vehiclePurchasesOutflow)}
              </span>
              <span>{t('analyticsOutflowRepairs')}:</span>
              <span className="text-right font-semibold text-[var(--secondary-foreground)]">
                {formatEuro(cashFlow.repairsOutflow)}
              </span>
              <span>{t('analyticsOutflowExpenses')}:</span>
              <span className="text-right font-semibold text-[var(--secondary-foreground)]">
                {formatEuro(cashFlow.generalExpensesOutflow)}
              </span>
              <span>{t('analyticsOutflowTaxes')}:</span>
              <span className="text-right font-semibold text-[var(--secondary-foreground)]">
                {formatEuro(cashFlow.taxesOutflow)}
              </span>
            </div>
          </div>

          <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
              <span>{t('analyticsCashNet')}</span>
              {cashFlow.netCashFlow >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-rose-500" />
              )}
            </div>
            <p
              data-testid="cash-flow-net-value"
              className="text-2xl font-bold tabular-nums mt-1"
              style={{
                color:
                  cashFlow.netCashFlow >= 0
                    ? 'var(--ag-profit-color)'
                    : 'var(--ag-expense-color)',
              }}
            >
              {cashFlow.netCashFlow > 0 ? '+' : ''}
              {formatEuro(cashFlow.netCashFlow)}
            </p>
            <div className="h-1.5 w-full rounded-full bg-[var(--surface-muted)] overflow-hidden mt-3 flex">
              {cashFlow.inflow + cashFlow.outflow > 0 && (
                <>
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${(cashFlow.inflow / (cashFlow.inflow + cashFlow.outflow)) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-rose-500"
                    style={{
                      width: `${(cashFlow.outflow / (cashFlow.inflow + cashFlow.outflow)) * 100}%`,
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Cash Flow Timeline Bars */}
        {cashFlow.series.length > 0 && (
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-end gap-4 text-[11px] text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                {t('analyticsCashInflow')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                {t('analyticsCashOutflow')}
              </span>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="flex items-end gap-3 min-w-max h-36 px-2 pt-4 pb-1 bg-[var(--background)] rounded-xl border border-[var(--border)]">
                {cashFlow.series.map((bucket) => {
                  const inflowPct =
                    maxCashFlowBucket > 0 ? Math.max(4, Math.round((bucket.inflow / maxCashFlowBucket) * 100)) : 0;
                  const outflowPct =
                    maxCashFlowBucket > 0 ? Math.max(4, Math.round((bucket.outflow / maxCashFlowBucket) * 100)) : 0;
                  return (
                    <div
                      key={bucket.key}
                      className="flex flex-col items-center gap-1.5 min-w-[46px]"
                      title={`${bucket.label}: +${formatEuro(bucket.inflow)} / -${formatEuro(bucket.outflow)} (Net: ${formatEuro(bucket.net)})`}
                    >
                      <div className="flex items-end gap-1 h-24 w-full justify-center">
                        <div
                          className="w-3 rounded-t bg-emerald-500/85 transition-all"
                          style={{ height: bucket.inflow > 0 ? `${inflowPct}%` : '2px' }}
                        />
                        <div
                          className="w-3 rounded-t bg-rose-500/85 transition-all"
                          style={{ height: bucket.outflow > 0 ? `${outflowPct}%` : '2px' }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-[var(--muted-foreground)] tabular-nums">
                        {bucket.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 4: Rankings — Most Profitable Vehicles & Aging Unsold Stock */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Top Most Profitable Sold Vehicles (6 cols) */}
        <div
          data-testid="analytics-top-profitable"
          className="lg:col-span-6 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] space-y-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{t('analyticsTopProfitableTitle')}</span>
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {t('analyticsTopProfitableSubtitle')}
              </p>
            </div>
          </div>

          {report.mostProfitableVehicles.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)] py-8 text-center bg-[var(--background)] rounded-xl border border-[var(--border)]">
              {t('analyticsNoSalesPeriod')}
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {report.mostProfitableVehicles.slice(0, 6).map((item, idx) => {
                const fullVehicle = vehicles.find((v) => v.id === item.vehicleId);
                return (
                  <div
                    key={item.vehicleId}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--foreground)] inline-flex items-center justify-center shrink-0 tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                          {item.vehicleName}{' '}
                          {item.year > 0 && (
                            <span className="text-xs font-normal text-[var(--muted-foreground)]">
                              ({item.year})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums mt-1 flex flex-wrap items-center gap-x-2">
                        <span>{item.registrationNumber || item.saleDate || '—'}</span>
                        {item.daysToSell !== null && (
                          <span>· {t('analyticsSoldInDays', { days: item.daysToSell })}</span>
                        )}
                      </div>
                      <div className="text-[11px] tabular-nums mt-1 flex flex-wrap gap-x-3 text-[var(--muted-foreground)]">
                        <span>
                          {t('analyticsColRevenue')}:{' '}
                          <strong className="text-[var(--foreground)]">{formatEuro(item.revenue)}</strong>
                        </span>
                        <span>
                          {t('analyticsColGross')}:{' '}
                          <strong className="text-[var(--secondary-foreground)]">{formatEuro(item.grossProfit)}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-left sm:text-right tabular-nums">
                        <div
                          className="text-sm font-bold"
                          style={{
                            color:
                              item.netProfit >= 0
                                ? 'var(--ag-profit-color)'
                                : 'var(--ag-expense-color)',
                          }}
                        >
                          {item.netProfit > 0 ? '+' : ''}
                          {formatEuro(item.netProfit)}
                        </div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">
                          {t('analyticsColNet')} · {item.netMarginPercent}%
                        </div>
                      </div>

                      {fullVehicle && (
                        <button
                          type="button"
                          onClick={() => onSelectVehicle(fullVehicle)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--primary)] border border-[var(--border)] transition-colors whitespace-nowrap"
                        >
                          <span>{t('analyticsOpenDossier')}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Aging / Slow-Moving Unsold Vehicles (6 cols) */}
        <div
          data-testid="analytics-aging-stock"
          className="lg:col-span-6 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] space-y-4"
        >
          <div>
            <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{t('analyticsAgingStockTitle')}</span>
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5 tabular-nums">
              {t('analyticsAgingStockSubtitle', { count: report.slowMovingCount })}
            </p>
          </div>

          {report.agingUnsoldVehicles.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)] py-8 text-center bg-[var(--background)] rounded-xl border border-[var(--border)]">
              {t('analyticsAllStockFresh')}
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {report.agingUnsoldVehicles.slice(0, 6).map((item) => {
                const fullVehicle = vehicles.find((v) => v.id === item.vehicleId);
                return (
                  <div
                    key={item.vehicleId}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                          {item.vehicleName}{' '}
                          {item.year > 0 && (
                            <span className="text-xs font-normal text-[var(--muted-foreground)]">
                              ({item.year})
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md border tabular-nums ${getAgingBadgeClasses(
                            item.ageTier
                          )}`}
                        >
                          {t('analyticsDaysInStock', { days: item.daysInStock })}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums mt-1">
                        {item.registrationNumber ? `${item.registrationNumber} · ` : ''}
                        {getStatusLabel(item.status)} · {t('cardInvested')}:{' '}
                        {formatEuro(item.totalInvested)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-left sm:text-right tabular-nums">
                        <div className="text-xs font-semibold text-[var(--foreground)]">
                          {item.targetSalePrice > 0 ? formatEuro(item.targetSalePrice) : '—'}
                        </div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">
                          {t('cardTarget')}
                        </div>
                      </div>

                      {fullVehicle && (
                        <button
                          type="button"
                          onClick={() => onSelectVehicle(fullVehicle)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--primary)] border border-[var(--border)] transition-colors whitespace-nowrap"
                        >
                          <span>{t('analyticsOpenDossier')}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 5: Operational Expenses Breakdown & Contributors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]">
          <p className="text-xs text-[var(--muted-foreground)] font-medium">{t('analyticsTotalSpent')}</p>
          <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums mt-1">
            {formatEuro(analytics.totalSpent)}
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1 tabular-nums">
            {t('analyticsEntriesCount', { count: analytics.totalEntries })}
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]">
          <p className="text-xs text-[var(--muted-foreground)] font-medium">{t('analyticsImpactedVehicles')}</p>
          <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: 'var(--ag-chart-accent)' }}>
            {analytics.impactedVehiclesCount}{' '}
            <span className="text-sm font-normal text-[var(--muted-foreground)]">/ {vehicles.length}</span>
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            {t('totalFleet')} {vehicles.length}
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]">
          <p className="text-xs text-[var(--muted-foreground)] font-medium">{t('analyticsTopCategory')}</p>
          {analytics.topCategory ? (
            <>
              <p className="text-lg font-bold text-[var(--foreground)] mt-1 truncate">
                {lang === 'ru' ? analytics.topCategory.labelRu : analytics.topCategory.labelFr}
              </p>
              <p className="text-xs text-emerald-500 font-semibold tabular-nums mt-1">
                {formatEuro(analytics.topCategory.amount)} · {analytics.topCategory.percentage}%
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)] mt-2">—</p>
          )}
        </div>
      </div>

      {analytics.totalSpent === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-8 text-center">
          <p className="text-sm font-semibold text-[var(--secondary-foreground)]">{t('analyticsNoExpensesPeriod')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Category Breakdown (7 cols) */}
          <div className="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] space-y-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[var(--foreground)]">{t('analyticsBreakdownTitle')}</h2>
              {selectedCategoryId && (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('analyticsResetFilter')}</span>
                </button>
              )}
            </div>

            <div className="h-3.5 w-full rounded-full bg-[var(--background)] overflow-hidden flex border border-[var(--border)]">
              {analytics.categories
                .filter((c) => c.percentage > 0)
                .map((cat) => (
                  <div
                    key={cat.id}
                    style={{
                      width: `${Math.max(cat.percentage, 2)}%`,
                      backgroundColor: cat.barColorHex,
                    }}
                    title={`${lang === 'ru' ? cat.labelRu : cat.labelFr}: ${formatEuro(cat.amount)} (${cat.percentage}%)`}
                    className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                  />
                ))}
            </div>

            <div className="divide-y divide-[var(--border)]">
              {analytics.categories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                const label = lang === 'ru' ? cat.labelRu : cat.labelFr;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(isSelected ? null : cat.id)}
                    aria-pressed={isSelected}
                    className={`w-full text-left py-3 px-3 -mx-3 rounded-[var(--ag-button-radius)] transition-colors flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-[var(--surface-muted)] ring-1 ring-[var(--ag-chart-accent)]'
                        : 'hover:bg-[var(--ag-table-row-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${cat.barColorHex}22`, color: cat.barColorHex }}
                        >
                          {CATEGORY_ICONS[cat.id]}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--foreground)] truncate">
                            {label}
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                            {t('analyticsEntriesCount', { count: cat.entryCount })}
                            {cat.topVehicle && (
                              <>
                                {' · '}
                                <span className="text-[var(--secondary-foreground)]">
                                  {cat.topVehicle.vehicleName} ({formatEuro(cat.topVehicle.amount)})
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 tabular-nums">
                        <div className="text-sm font-bold text-[var(--foreground)]">
                          {formatEuro(cat.amount)}
                        </div>
                        <div className="text-xs font-semibold text-[var(--muted-foreground)]">
                          {cat.percentage}%
                        </div>
                      </div>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-[var(--background)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor: cat.barColorHex,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Vehicle Contributors Filter Panel (5 cols) */}
          <div className="lg:col-span-5 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)] space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[var(--foreground)]">
                  {t('analyticsContributorsTitle')}
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {activeCategory
                    ? (lang === 'ru' ? activeCategory.labelRu : activeCategory.labelFr)
                    : t('analyticsAllCategories')}
                </p>
              </div>
              {activeCategory && (
                <span className="text-xs font-bold tabular-nums text-[var(--primary)]">
                  {formatEuro(activeCategory.amount)}
                </span>
              )}
            </div>

            {displayedVehicles.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] py-6 text-center">
                {t('analyticsNoExpensesPeriod')}
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {displayedVehicles.map((item) => {
                  const fullVehicle = vehicles.find((v) => v.id === item.vehicleId);
                  return (
                    <div
                      key={item.vehicleId}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--foreground)] truncate">
                          {item.vehicleName}{' '}
                          {item.year > 0 && (
                            <span className="text-xs font-normal text-[var(--muted-foreground)]">
                              ({item.year})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums mt-0.5">
                          {item.registrationNumber || item.vin || '—'} ·{' '}
                          {t('analyticsEntriesCount', { count: item.entryCount })}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right tabular-nums">
                          <div className="text-sm font-bold text-[var(--foreground)]">
                            {formatEuro(item.amount)}
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)]">
                            {activeCategory
                              ? t('analyticsShareOfCategory', { val: item.percentageOfCategory })
                              : t('analyticsShareOfTotal', { val: item.percentageOfCategory })}
                          </div>
                        </div>

                        {fullVehicle && (
                          <button
                            type="button"
                            onClick={() => onSelectVehicle(fullVehicle)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--primary)] border border-[var(--border)] transition-colors whitespace-nowrap"
                          >
                            <span>{t('analyticsOpenDossier')}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
