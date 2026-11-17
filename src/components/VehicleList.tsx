import React, { useState, useMemo } from 'react';
import {
  Search,
  PlusCircle,
  Car,
  Wrench,
  CheckCircle2,
  Sparkles,
  ArrowUpDown,
  Tag,
  Clock,
  LayoutGrid,
  List,
  Edit,
  Menu,
} from 'lucide-react';
import {
  FeatureFlagsConfig,
  GeneralExpense,
  RepairTask,
  Vehicle,
  VehicleStatus,
} from '../types/garage';
import { DEFAULT_FEATURE_FLAGS } from '../utils/adminUtils';
import { VehicleCard } from './VehicleCard';
import { useI18n } from '../i18n/I18nContext';
import { formatEuro } from '../utils/finance';
import {
  computeInventorySummaryTotals,
  computeVehicleInventoryFinancials,
  formatMileageKm,
  InventorySortField,
  matchesVehicleSearch,
  sortInventoryVehicles,
  VehicleInventoryFinancials,
} from '../utils/inventoryUtils';
import { ThemedSelect } from './ThemedSelect';

interface VehicleListProps {
  vehicles: Vehicle[];
  repairs?: RepairTask[];
  expenses?: GeneralExpense[];
  onSelectVehicle: (vehicle: Vehicle) => void;
  onEditVehicle?: (vehicle: Vehicle) => void;
  onNewVehicle: () => void;
  onQuickStatusChange: (vehicleId: string, newStatus: VehicleStatus) => void;
  onOpenSellModal: (vehicle: Vehicle) => void;
  onOpenCerfa?: (vehicle: Vehicle) => void;
  onSeedData: () => void;
  isSeeding: boolean;
  featureFlags?: FeatureFlagsConfig;
  onOpenMobileSidebar?: () => void;
}

const VIEW_MODE_STORAGE_KEY = 'autogarage_inventory_view';

export const VehicleList: React.FC<VehicleListProps> = ({
  vehicles,
  repairs = [],
  expenses = [],
  onSelectVehicle,
  onEditVehicle,
  onNewVehicle,
  onQuickStatusChange,
  onOpenSellModal,
  onSeedData,
  isSeeding,
  onOpenMobileSidebar,
}) => {
  const { t, lang } = useI18n();
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<InventorySortField>('date');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'list' || saved === 'grid') return saved;
    } catch {
      // ignore
    }
    return 'grid';
  });

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  // Group subcollection repair tasks & general expenses per vehicle without duplicate counting
  const financialsById = useMemo(() => {
    const repairsMap = new Map<string, RepairTask[]>();
    for (const r of repairs) {
      if (!r.vehicleId) continue;
      const list = repairsMap.get(r.vehicleId) || [];
      list.push(r);
      repairsMap.set(r.vehicleId, list);
    }

    const expensesMap = new Map<string, GeneralExpense[]>();
    for (const e of expenses) {
      if (!e.vehicleId) continue;
      const list = expensesMap.get(e.vehicleId) || [];
      list.push(e);
      expensesMap.set(e.vehicleId, list);
    }

    const result = new Map<string, VehicleInventoryFinancials>();
    for (const v of vehicles) {
      result.set(
        v.id,
        computeVehicleInventoryFinancials(
          v,
          repairsMap.get(v.id),
          expensesMap.get(v.id)
        )
      );
    }
    return result;
  }, [vehicles, repairs, expenses]);

  // Filter & Sort Logic (supports registration number & mileage search)
  const filteredVehicles = useMemo(() => {
    const filtered = vehicles.filter((v) => {
      if (selectedStatus !== 'all' && v.status !== selectedStatus) {
        return false;
      }
      return matchesVehicleSearch(v, searchQuery);
    });
    return sortInventoryVehicles(filtered, sortBy, financialsById);
  }, [vehicles, selectedStatus, searchQuery, sortBy, financialsById]);

  const summaryTotals = useMemo(() => {
    const items = filteredVehicles.map(
      (v) => financialsById.get(v.id) || computeVehicleInventoryFinancials(v)
    );
    return computeInventorySummaryTotals(items);
  }, [filteredVehicles, financialsById]);

  // Counts for each tab
  const counts = {
    all: vehicles.length,
    preparation: vehicles.filter((v) => v.status === 'preparation').length,
    repair: vehicles.filter((v) => v.status === 'repair').length,
    for_sale: vehicles.filter((v) => v.status === 'for_sale').length,
    sold: vehicles.filter((v) => v.status === 'sold').length,
  };

  const renderStatusSelect = (v: Vehicle, testIdPrefix: string) => (
    <ThemedSelect<VehicleStatus>
      testId={`${testIdPrefix}-status-select-${v.id}`}
      ariaLabel={t('thStatus')}
      stopPropagation
      value={v.status}
      onChange={(newStatus) => {
        if (newStatus === 'sold' && v.status !== 'sold') {
          onOpenSellModal(v);
        } else {
          onQuickStatusChange(v.id, newStatus);
        }
      }}
      options={[
        { value: 'preparation', label: `🛠️ ${t('statusPreparation')}` },
        { value: 'repair', label: `🔧 ${t('statusRepair')}` },
        { value: 'for_sale', label: `🏷️ ${t('statusForSale')}` },
        { value: 'sold', label: `✅ ${t('statusSold')}` },
      ]}
      triggerClassName="text-[11px] font-semibold bg-[var(--background)] text-[var(--foreground)] rounded-lg px-2 py-1 border border-[var(--border)]"
    />
  );

  return (
    <div className="space-y-4">
      {/* Page Header & Primary Action Row */}
      <div
        data-testid="inventory-page-header"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {onOpenMobileSidebar && (
            <button
              type="button"
              data-testid="sidebar-mobile-trigger"
              onClick={onOpenMobileSidebar}
              aria-label={t('openNavMenu')}
              className="lg:hidden p-2 rounded-[var(--ag-button-radius)] bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)] transition shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] flex items-center justify-center shrink-0">
            <Car className="w-4 h-4" />
          </div>
          <h1
            data-testid="page-header-title"
            className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--foreground)] leading-tight break-words"
          >
            {t('navInventory')}
          </h1>
        </div>

        <button
          type="button"
          data-testid="page-header-new-vehicle"
          onClick={onNewVehicle}
          className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto h-9 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 shadow-sm transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          <span>{t('newVehicle')}</span>
        </button>
      </div>

      {/* Controls Bar: Search & Status Filters */}
      <div className="bg-[var(--card)] rounded-[var(--ag-card-radius)] border border-[var(--border)] p-3.5 sm:p-4 shadow-sm space-y-3">
        {/* Search & Sort Row */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              data-testid="inventory-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full h-9 pl-9 pr-20 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-[var(--ag-button-radius)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                {t('clearSearch')}
              </button>
            )}
          </div>

          {/* Sort & View Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1 shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('sortBy')}</span>
              </span>
              <ThemedSelect
                testId="vehicle-list-sort-select"
                ariaLabel={t('sortBy')}
                value={sortBy}
                onChange={(val) => setSortBy(val as InventorySortField)}
                options={[
                  { value: 'date', label: t('sortRecent') },
                  { value: 'invested', label: t('sortInvested') },
                  { value: 'price', label: t('sortPrice') },
                  { value: 'mileage', label: t('sortMileage') },
                ]}
                triggerClassName="h-9 text-xs font-semibold bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-1.5 max-w-[190px] sm:max-w-none"
              />
            </div>

            {/* Grid / List View Switcher */}
            <div className="flex items-center bg-[var(--background)] p-0.5 rounded-[var(--ag-button-radius)] border border-[var(--border)] shrink-0">
              <button
                type="button"
                data-testid="inventory-view-grid-btn"
                onClick={() => handleViewModeChange('grid')}
                aria-label="Grid View"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === 'grid'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{t('viewGrid')}</span>
              </button>
              <button
                type="button"
                data-testid="inventory-view-list-btn"
                onClick={() => handleViewModeChange('list')}
                aria-label="List View"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === 'list'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>{t('viewList')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div
          data-testid="vehicle-status-filter-bar"
          className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar"
        >
          <button
            type="button"
            onClick={() => setSelectedStatus('all')}
            className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'all'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--surface-muted)] text-[var(--secondary-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <span>{t('statusAll')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/15 text-current tabular-nums">
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('preparation')}
            className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'preparation'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--surface-muted)] text-[var(--secondary-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Clock className="w-3 h-3 text-[var(--warning)]" />
            <span>{t('statusPreparation')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/15 text-current tabular-nums">
              {counts.preparation}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('repair')}
            className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'repair'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--surface-muted)] text-[var(--secondary-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Wrench className="w-3 h-3 text-blue-500" />
            <span>{t('statusRepair')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/15 text-current tabular-nums">
              {counts.repair}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('for_sale')}
            className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'for_sale'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--surface-muted)] text-[var(--secondary-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Tag className="w-3 h-3 text-[var(--success)]" />
            <span>{t('statusForSale')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/15 text-current tabular-nums">
              {counts.for_sale}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('sold')}
            className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'sold'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--surface-muted)] text-[var(--secondary-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-purple-500" />
            <span>{t('statusSold')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/15 text-current tabular-nums">
              {counts.sold}
            </span>
          </button>
        </div>
      </div>

      {/* Grid or List View of Vehicles */}
      {filteredVehicles.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredVehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                financials={financialsById.get(vehicle.id)}
                onSelect={onSelectVehicle}
                onEdit={onEditVehicle}
                onQuickStatusChange={onQuickStatusChange}
                onOpenSellModal={onOpenSellModal}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Desktop & Tablet 7-Column Active Inventory Table */}
            <div className="hidden md:block bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  data-testid="active-inventory-table"
                  className="w-full text-left border-collapse text-xs"
                >
                  <thead>
                    <tr className="bg-[var(--ag-table-header-bg)] border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      <th className="py-3 px-3.5 font-bold">{t('thVehicle')}</th>
                      <th className="py-3 px-3 font-bold">{t('thPlate')}</th>
                      <th className="py-3 px-3 font-bold text-right">{t('thMileageKm')}</th>
                      <th className="py-3 px-3 font-bold">{t('thStatus')}</th>
                      <th className="py-3 px-3 font-bold text-right">{t('thPurchasePriceEur')}</th>
                      <th className="py-3 px-3 font-bold text-right">{t('thExpensesEur')}</th>
                      <th className="py-3 px-3.5 font-bold text-right">{t('thTotalInvestedEur')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredVehicles.map((v) => {
                      const fin =
                        financialsById.get(v.id) || computeVehicleInventoryFinancials(v);
                      const hasPhoto = Boolean(v.photos && v.photos.length > 0);
                      return (
                        <tr
                          key={v.id}
                          data-testid={`inventory-row-${v.id}`}
                          onClick={() => onSelectVehicle(v)}
                          className="hover:bg-[var(--ag-table-row-hover)] transition cursor-pointer group"
                        >
                          {/* 1. Vehicle (photo, brand, model, year) */}
                          <td className="py-2.5 px-3.5">
                            <div className="flex items-center gap-3 min-w-[210px]">
                              {hasPhoto ? (
                                <img
                                  src={v.photos[0]}
                                  alt={`${v.make} ${v.model}`}
                                  className="w-12 h-9 rounded-lg object-cover border border-[var(--border)] shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-9 rounded-lg bg-[var(--background)] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] shrink-0">
                                  <Car className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
                                    {v.make} {v.model}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] font-mono text-[10px] font-bold tabular-nums">
                                    {v.year}
                                  </span>
                                  {onEditVehicle && (
                                    <button
                                      type="button"
                                      data-testid={`inventory-edit-btn-${v.id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onEditVehicle(v);
                                      }}
                                      aria-label={`${t('editVehicleTitle')}: ${v.make} ${v.model}`}
                                      title={t('editVehicleTitle')}
                                      className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--surface-muted)] transition opacity-70 group-hover:opacity-100"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <div className="text-[11px] text-[var(--muted-foreground)] truncate max-w-[220px]">
                                  {v.trim || 'Standard'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Registration Number */}
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            {v.registrationNumber ? (
                              <span className="px-2 py-0.5 rounded bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] font-bold text-[11px]">
                                {v.registrationNumber}
                              </span>
                            ) : (
                              <span className="text-[var(--muted-foreground)]">—</span>
                            )}
                          </td>

                          {/* 3. Mileage (km) */}
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--secondary-foreground)] whitespace-nowrap tabular-nums">
                            {formatMileageKm(v.mileage, lang)}
                          </td>

                          {/* 4. Status */}
                          <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                            {renderStatusSelect(v, 'list')}
                          </td>

                          {/* 5. Purchase Price (€) */}
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--foreground)] whitespace-nowrap tabular-nums">
                            {formatEuro(fin.purchasePrice)}
                          </td>

                          {/* 6. Expenses (€) */}
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--secondary-foreground)] whitespace-nowrap tabular-nums">
                            {formatEuro(fin.totalExpenses)}
                          </td>

                          {/* 7. Total Invested (€) */}
                          <td className="py-2.5 px-3.5 text-right font-mono font-extrabold text-[var(--primary)] whitespace-nowrap tabular-nums">
                            {formatEuro(fin.totalInvested)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr
                      data-testid="inventory-table-totals"
                      className="bg-[var(--ag-table-header-bg)] border-t-2 border-[var(--border)] font-bold text-xs"
                    >
                      <td colSpan={4} className="py-3 px-3.5 text-[var(--foreground)]">
                        {t('thTotalSummary', { count: summaryTotals.vehicleCount })}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--foreground)] whitespace-nowrap tabular-nums">
                        {formatEuro(summaryTotals.totalPurchasePrice)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--secondary-foreground)] whitespace-nowrap tabular-nums">
                        {formatEuro(summaryTotals.totalExpenses)}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-black text-[var(--primary)] whitespace-nowrap tabular-nums">
                        {formatEuro(summaryTotals.totalInvested)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Mobile Responsive List Cards (< md) */}
            <div className="md:hidden space-y-3" data-testid="inventory-mobile-list">
              {filteredVehicles.map((v) => {
                const fin =
                  financialsById.get(v.id) || computeVehicleInventoryFinancials(v);
                const hasPhoto = Boolean(v.photos && v.photos.length > 0);
                return (
                  <div
                    key={v.id}
                    data-testid={`inventory-mobile-row-${v.id}`}
                    onClick={() => onSelectVehicle(v)}
                    className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-3 space-y-3 shadow-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {hasPhoto ? (
                        <img
                          src={v.photos[0]}
                          alt={`${v.make} ${v.model}`}
                          className="w-14 h-11 rounded-lg object-cover border border-[var(--border)] shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-11 rounded-lg bg-[var(--background)] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] shrink-0">
                          <Car className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-[var(--foreground)] truncate">
                            {v.make} {v.model}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] font-mono text-[10px] font-bold">
                            {v.year}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-mono text-[var(--muted-foreground)] tabular-nums">
                          {v.registrationNumber && (
                            <span className="px-1.5 py-0.5 rounded bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] font-bold">
                              {v.registrationNumber}
                            </span>
                          )}
                          <span>{formatMileageKm(v.mileage, lang)}</span>
                        </div>
                      </div>
                      {onEditVehicle && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditVehicle(v);
                          }}
                          aria-label={`${t('editVehicleTitle')}: ${v.make} ${v.model}`}
                          className="p-2 rounded-lg bg-[var(--surface-muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] shrink-0"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-[var(--surface-muted)] rounded-xl p-2 border border-[var(--border)] text-[11px] tabular-nums">
                      <div>
                        <span className="text-[10px] text-[var(--muted-foreground)] block truncate">
                          {t('cardPurchase')}
                        </span>
                        <span className="font-mono font-bold text-[var(--foreground)]">
                          {formatEuro(fin.purchasePrice)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--muted-foreground)] block truncate">
                          {t('cardExpenses')}
                        </span>
                        <span className="font-mono font-semibold text-[var(--secondary-foreground)]">
                          {formatEuro(fin.totalExpenses)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[var(--primary)] font-semibold block truncate">
                          {t('cardTotalInvested')}
                        </span>
                        <span className="font-mono font-extrabold text-[var(--primary)]">
                          {formatEuro(fin.totalInvested)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                      {renderStatusSelect(v, 'mobile-list')}
                      <button
                        type="button"
                        onClick={() => onSelectVehicle(v)}
                        className="text-xs font-bold text-[var(--primary)] px-2 py-1"
                      >
                        {t('dossierBtn')} →
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Mobile Totals Summary Bar */}
              <div className="bg-[var(--ag-table-header-bg)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-3 space-y-2">
                <div className="text-xs font-bold text-[var(--foreground)]">
                  {t('thTotalSummary', { count: summaryTotals.vehicleCount })}
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums">
                  <div>
                    <span className="text-[10px] text-[var(--muted-foreground)] block">
                      {t('cardPurchase')}
                    </span>
                    <span className="font-mono font-bold text-[var(--foreground)]">
                      {formatEuro(summaryTotals.totalPurchasePrice)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--muted-foreground)] block">
                      {t('cardExpenses')}
                    </span>
                    <span className="font-mono font-semibold text-[var(--secondary-foreground)]">
                      {formatEuro(summaryTotals.totalExpenses)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[var(--primary)] font-semibold block">
                      {t('cardTotalInvested')}
                    </span>
                    <span className="font-mono font-extrabold text-[var(--primary)]">
                      {formatEuro(summaryTotals.totalInvested)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      ) : (
        /* Empty State */
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-6 text-center max-w-xl mx-auto space-y-3.5">
          <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/10 border border-[var(--primary)]/25 text-[var(--primary)] flex items-center justify-center mx-auto">
            <Car className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-[var(--foreground)]">
            {searchQuery || selectedStatus !== 'all'
              ? t('emptyFilteredTitle')
              : t('emptyTitle')}
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {searchQuery || selectedStatus !== 'all'
              ? t('emptyFilteredSubtitle')
              : t('emptySubtitle')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onNewVehicle}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('addVehicleBtn')}</span>
            </button>

            {vehicles.length === 0 && (
              <button
                type="button"
                onClick={onSeedData}
                disabled={isSeeding}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 transition flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isSeeding ? t('loading') : t('loadDemoBtn')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

