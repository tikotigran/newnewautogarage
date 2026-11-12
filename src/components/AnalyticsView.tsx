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
} from 'lucide-react';
import { Vehicle, RepairTask, GeneralExpense, FeatureFlagsConfig } from '../types/garage';
import { subscribeAllFleetExpensesAndRepairs } from '../services/garageService';
import {
  AnalyticsExpenseCategoryId,
  AnalyticsTimeRange,
  computeFleetExpenseAnalytics,
} from '../utils/analytics';
import { DEFAULT_FEATURE_FLAGS } from '../utils/adminUtils';
import { formatEuro, hasDefinedSalePrice, roundToTwo } from '../utils/finance';
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

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  vehicles,
  onSelectVehicle,
  featureFlags = DEFAULT_FEATURE_FLAGS,
}) => {
  const { lang, t } = useI18n();
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<AnalyticsExpenseCategoryId | null>(null);
  const [fleetData, setFleetData] = useState<{
    repairs: RepairTask[];
    expenses: GeneralExpense[];
  }>({ repairs: [], expenses: [] });

  useEffect(() => {
    const unsub = subscribeAllFleetExpensesAndRepairs(vehicles, (data) => {
      setFleetData(data);
    });
    return () => unsub();
  }, [vehicles]);

  const analytics = useMemo(() => {
    return computeFleetExpenseAnalytics({
      vehicles,
      repairs: fleetData.repairs,
      expenses: fleetData.expenses,
      timeRange,
    });
  }, [vehicles, fleetData.repairs, fleetData.expenses, timeRange]);

  const pnlSummary = useMemo(() => {
    const soldVehicles = vehicles.filter((v) => v.status === 'sold');
    const activeVehicles = vehicles.filter((v) => v.status !== 'sold');
    const realizedRevenue = roundToTwo(
      soldVehicles.reduce((sum, v) => sum + (Number(v.buyerInfo?.salePrice) || 0), 0)
    );
    const realizedProfit = roundToTwo(
      soldVehicles.reduce(
        (sum, v) => sum + (hasDefinedSalePrice(v) ? Number(v.netProfit) || 0 : 0),
        0
      )
    );
    const soldInvested = roundToTwo(
      soldVehicles.reduce((sum, v) => sum + (Number(v.totalInvested) || 0), 0)
    );
    const avgRoi =
      soldInvested > 0 ? Math.round(((realizedProfit / soldInvested) * 100 + Number.EPSILON) * 10) / 10 : 0;
    const activeInvested = roundToTwo(
      activeVehicles.reduce((sum, v) => sum + (Number(v.totalInvested) || 0), 0)
    );
    return {
      soldCount: soldVehicles.length,
      activeCount: activeVehicles.length,
      realizedRevenue,
      realizedProfit,
      avgRoi,
      activeInvested,
    };
  }, [vehicles]);

  const timeRanges: { id: AnalyticsTimeRange; label: string }[] = [
    { id: 'month', label: t('periodMonth') },
    { id: '3months', label: t('period3Months') },
    { id: '6months', label: t('period6Months') },
    { id: 'year', label: t('periodYear') },
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
    // Aggregate all vehicles across all categories for the selected period
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

  return (
    <div className="space-y-6">
      {/* Header & Time Range Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-[var(--ag-card-padding)]">
        <div>
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-[var(--primary)] shrink-0" />
            <h1 className="text-xl font-bold text-[var(--foreground)] tracking-tight">
              {t('analyticsTitle')}
            </h1>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">{t('analyticsSubtitle')}</p>
        </div>

        {/* Time Range Segmented Control */}
        <div
          className="flex flex-wrap items-center gap-1 bg-[var(--background)] p-1 rounded-[var(--ag-button-radius)] border border-[var(--border)]"
          role="group"
          aria-label="Time range filter"
        >
          <span className="px-2 text-[var(--muted-foreground)] hidden sm:inline-flex items-center">
            <Calendar className="w-3.5 h-3.5" />
          </span>
          {timeRanges.map((tr) => (
            <button
              key={tr.id}
              type="button"
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

      {/* P&L & Revenue Summary (Restricted to Analytics Dashboard) */}
      {featureFlags.pnlCalculator && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="analytics-pnl-summary">
          <div className="bg-[var(--card)] border border-emerald-500/30 rounded-[var(--ag-card-radius)] p-4">
            <p className="text-xs text-[var(--muted-foreground)] font-medium flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[var(--success)]" />
              <span>{t('realizedProfit')}</span>
            </p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${pnlSummary.realizedProfit >= 0 ? 'text-[var(--success)]' : 'text-red-500'}`}>
              {pnlSummary.realizedProfit >= 0 ? '+' : ''}{formatEuro(pnlSummary.realizedProfit)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 tabular-nums">
              {lang === 'ru'
                ? `Продано: ${pnlSummary.soldCount} авто · ROI: ${pnlSummary.avgRoi}%`
                : `Vendus : ${pnlSummary.soldCount} véh. · ROI : ${pnlSummary.avgRoi}%`}
            </p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
            <p className="text-xs text-[var(--muted-foreground)] font-medium">
              {t('analyticsRevenueTitle')}
            </p>
            <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums mt-1">
              {formatEuro(pnlSummary.realizedRevenue)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 tabular-nums">
              {lang === 'ru' ? `${pnlSummary.soldCount} завершённых сделок` : `${pnlSummary.soldCount} ventes clôturées`}
            </p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
            <p className="text-xs text-[var(--muted-foreground)] font-medium">{t('capitalInvested')}</p>
            <p className="text-2xl font-bold text-[var(--primary)] tabular-nums mt-1">
              {formatEuro(pnlSummary.activeInvested)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 tabular-nums">
              {lang === 'ru'
                ? `${pnlSummary.activeCount} авто в наличии`
                : `${pnlSummary.activeCount} véhicules en stock`}
            </p>
          </div>
        </div>
      )}

      {/* Summary KPI Strip */}
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
          <p className="text-2xl font-bold text-[var(--primary)] tabular-nums mt-1">
            {analytics.impactedVehiclesCount} <span className="text-sm font-normal text-[var(--muted-foreground)]">/ {vehicles.length}</span>
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

      {/* Main Content: Category Breakdown + Vehicle Contributors */}
      {analytics.totalSpent === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-10 text-center">
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

            {/* Stacked Proportional Bar */}
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

            {/* Category List */}
            <div className="divide-y divide-[var(--border)]">
              {analytics.categories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                const label = lang === 'ru' ? cat.labelRu : cat.labelFr;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setSelectedCategoryId(isSelected ? null : cat.id)
                    }
                    aria-pressed={isSelected}
                    className={`w-full text-left py-3 px-3 -mx-3 rounded-[var(--ag-button-radius)] transition-colors flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-[var(--surface-muted)] ring-1 ring-[var(--primary)]'
                        : 'hover:bg-[var(--surface-muted)]/60'
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

                    {/* Individual Horizontal Progress Bar */}
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
