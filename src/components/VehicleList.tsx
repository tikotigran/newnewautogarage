import React, { useState, useMemo } from 'react';
import {
  Search,
  PlusCircle,
  Car,
  Wrench,
  Archive,
  Sparkles,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag,
  Clock,
  LayoutGrid,
  List,
  Edit,
  Menu,
  Crown,
  Plus,
} from 'lucide-react';
import {
  AppUserProfileType,
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
  computeActiveInventoryStatusCounts,
  computeInventorySummaryTotals,
  computeVehicleInventoryFinancials,
  filterVehiclesByInventoryScope,
  formatListTrimSubtitle,
  formatMileageKm,
  getVehicleTransactionBadgeInfo,
  InventoryScope,
  InventorySortField,
  InventoryTableSortColumn,
  InventoryTableSortState,
  InventoryTransactionFilter,
  matchesVehicleSearch,
  matchesVehicleTransactionType,
  sortInventoryVehicles,
  sortInventoryVehiclesByColumn,
  toggleTableSortState,
  VehicleInventoryFinancials,
} from '../utils/inventoryUtils';
import { ThemedSelect } from './ThemedSelect';
import { pickLocalized } from '../utils/i18nUtils';
import { resolveVehicleQuickFlags } from '../utils/quickListUtils';
import { QuickVehicleExpenseModal } from './QuickVehicleExpenseModal';

interface VehicleListProps {
  vehicles: Vehicle[];
  repairs?: RepairTask[];
  expenses?: GeneralExpense[];
  onSelectVehicle: (vehicle: Vehicle) => void;
  onEditVehicle?: (vehicle: Vehicle) => void;
  onNewVehicle: () => void;
  onQuickStatusChange: (vehicleId: string, newStatus: VehicleStatus) => void;
  onQuickToggleField?: (
    vehicleId: string,
    field: 'ctPassed' | 'docsCompleted',
    value: boolean
  ) => void | Promise<void>;
  onAddQuickExpense?: (
    vehicleId: string,
    payload: { category: string; description: string; amount: number; date: string }
  ) => Promise<void>;
  onDeleteQuickExpense?: (vehicleId: string, expenseId: string) => Promise<void>;
  onDeleteQuickRepair?: (vehicleId: string, repairId: string) => Promise<void>;
  onOpenSellModal: (vehicle: Vehicle) => void;
  onOpenCerfa?: (vehicle: Vehicle) => void;
  onSeedData: () => void;
  isSeeding: boolean;
  featureFlags?: FeatureFlagsConfig;
  onOpenMobileSidebar?: () => void;
  vehicleLimit?: number;
  totalOwnedVehiclesCount?: number;
  currentPlanName?: string;
  upgradePlanName?: string;
  onOpenUpgradePlan?: () => void;
  profileType?: AppUserProfileType;
  inventoryScope?: InventoryScope;
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
  onQuickToggleField,
  onAddQuickExpense,
  onDeleteQuickExpense,
  onDeleteQuickRepair,
  onOpenSellModal,
  onSeedData,
  isSeeding,
  onOpenMobileSidebar,
  vehicleLimit,
  totalOwnedVehiclesCount,
  currentPlanName = 'Starter',
  upgradePlanName = 'Pro',
  onOpenUpgradePlan,
  profileType = 'micro_entrepreneur',
  inventoryScope = 'active',
}) => {
  const isSoldView = inventoryScope === 'sold';
  const { t, lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });
  const [quickExpenseVehicleId, setQuickExpenseVehicleId] = useState<string | null>(null);
  const usedVehiclesCount = totalOwnedVehiclesCount ?? vehicles.length;
  const isFiniteQuota = typeof vehicleLimit === 'number' && vehicleLimit < 9999;
  const isAtVehicleLimit = isFiniteQuota && usedVehiclesCount >= (vehicleLimit as number);
  const handleAddVehicleAction = () => {
    if (isAtVehicleLimit && onOpenUpgradePlan) {
      onOpenUpgradePlan();
      return;
    }
    onNewVehicle();
  };
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [transactionTypeFilter, setTransactionTypeFilter] =
    useState<InventoryTransactionFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<InventorySortField>('date');
  const [tableSort, setTableSort] = useState<InventoryTableSortState | null>(null);
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

  const scopedVehicles = useMemo(
    () => filterVehiclesByInventoryScope(vehicles, inventoryScope),
    [vehicles, inventoryScope]
  );

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
    for (const v of scopedVehicles) {
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
  }, [scopedVehicles, repairs, expenses]);

  // First apply transaction-type filter (Micro-entreprise vs Particulier)
  const transactionFilteredVehicles = useMemo(
    () =>
      scopedVehicles.filter((v) =>
        matchesVehicleTransactionType(v, transactionTypeFilter, profileType)
      ),
    [scopedVehicles, transactionTypeFilter, profileType]
  );

  // Filter & Sort Logic (supports registration number & mileage search + column header sorting)
  const filteredVehicles = useMemo(() => {
    const filtered = transactionFilteredVehicles.filter((v) => {
      if (!isSoldView && selectedStatus !== 'all' && v.status !== selectedStatus) {
        return false;
      }
      return matchesVehicleSearch(v, searchQuery);
    });
    if (tableSort) {
      return sortInventoryVehiclesByColumn(filtered, tableSort, financialsById);
    }
    return sortInventoryVehicles(filtered, sortBy, financialsById);
  }, [
    transactionFilteredVehicles,
    isSoldView,
    selectedStatus,
    searchQuery,
    sortBy,
    tableSort,
    financialsById,
  ]);

  const summaryTotals = useMemo(() => {
    const items = filteredVehicles.map(
      (v) => financialsById.get(v.id) || computeVehicleInventoryFinancials(v)
    );
    return computeInventorySummaryTotals(items);
  }, [filteredVehicles, financialsById]);

  // Dynamic counts for each active status tab reflecting active transaction-type filter
  const counts = useMemo(
    () => computeActiveInventoryStatusCounts(transactionFilteredVehicles),
    [transactionFilteredVehicles]
  );

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
      triggerClassName="text-[11px] font-semibold bg-[var(--background)] text-[var(--foreground)] rounded-lg px-1.5 py-1 border border-[var(--border)] gap-1"
    />
  );

  const yesLabel = L('Oui', 'Да', 'Այո', 'დიახ');
  const noLabel = L('Non', 'Нет', 'Ոչ', 'არა');
  const docsHeaderLabel = L('Dossier', 'Оформлено', 'Ձևակերպված', 'გაფორმებული');

  const renderQuickBoolSelect = (
    v: Vehicle,
    field: 'ctPassed' | 'docsCompleted',
    testIdPrefix: string
  ) => {
    const flags = resolveVehicleQuickFlags(v);
    const active = flags[field];
    return (
      <ThemedSelect<'yes' | 'no'>
        testId={`${testIdPrefix}-${v.id}`}
        ariaLabel={field === 'ctPassed' ? 'CT' : docsHeaderLabel}
        stopPropagation
        value={active ? 'yes' : 'no'}
        onChange={(next) => {
          onQuickToggleField?.(v.id, field, next === 'yes');
        }}
        options={[
          { value: 'yes', label: yesLabel },
          { value: 'no', label: noLabel },
        ]}
        menuClassName="min-w-[108px]"
        triggerClassName={`text-[11px] rounded-lg px-1.5 py-1 border whitespace-nowrap gap-1 ${
          active
            ? 'font-bold bg-emerald-500/15 text-emerald-400 border-emerald-500/35'
            : 'font-semibold bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
        }`}
      />
    );
  };

  const quickExpenseVehicle = quickExpenseVehicleId
    ? vehicles.find((v) => v.id === quickExpenseVehicleId) || null
    : null;
  const quickExpenseFinancials = quickExpenseVehicle
    ? financialsById.get(quickExpenseVehicle.id) ||
      computeVehicleInventoryFinancials(quickExpenseVehicle)
    : null;

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
            {isSoldView ? <Archive className="w-4 h-4" /> : <Car className="w-4 h-4" />}
          </div>
          <h1
            data-testid="page-header-title"
            className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--foreground)] leading-tight break-words"
          >
            {isSoldView ? t('navSoldVehicles') : t('navInventory')}
          </h1>
        </div>

        {isSoldView ? (
          <span
            data-testid="sold-vehicles-header-count"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] tabular-nums shrink-0"
          >
            <Archive className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>
              {L(
                `${summaryTotals.vehicleCount} ${summaryTotals.vehicleCount === 1 ? 'véhicule' : 'véhicules'}`,
                `${summaryTotals.vehicleCount} авто`,
                `${summaryTotals.vehicleCount} մեքենա`,
                `${summaryTotals.vehicleCount} ავტო`
              )}
            </span>
          </span>
        ) : (
          <button
            type="button"
            data-testid="page-header-new-vehicle"
            onClick={handleAddVehicleAction}
            className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto h-9 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 shadow-sm transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>{t('newVehicle')}</span>
          </button>
        )}
      </div>

      {/* Starter Plan Vehicle Quota Notice */}
      {!isSoldView && isAtVehicleLimit && (
        <div
          data-testid="vehicle-quota-banner"
          className="bg-[var(--card)] border border-[var(--primary)]/50 rounded-[var(--ag-card-radius)] p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center shrink-0 mt-0.5">
              <Crown className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--foreground)] tabular-nums">
                {pickLocalized(lang, {
                  fr: `Limite du forfait ${currentPlanName} atteinte (${usedVehiclesCount} / ${vehicleLimit} véhicules)`,
                  ru: `Достигнут лимит тарифа ${currentPlanName} (${usedVehiclesCount} / ${vehicleLimit} авто)`,
                  hy: `${currentPlanName} սակագնի սահմանաչափը սպառվել է (${usedVehiclesCount} / ${vehicleLimit} մեքենա)`,
                  ka: `${currentPlanName} ტარიფის ლიმიტი ამოწურულია (${usedVehiclesCount} / ${vehicleLimit} ავტო)`,
                })}
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                {pickLocalized(lang, {
                  fr: `Passez au forfait ${upgradePlanName} pour un stock élargi, tous les Cerfa et les fournisseurs.`,
                  ru: `Перейдите на тариф ${upgradePlanName} для расширенного склада, всех бланков Cerfa и учёта поставщиков.`,
                  hy: `Անցեք ${upgradePlanName} սակագնին՝ ընդլայնված ավտոպարկի և բոլոր Cerfa ձևաթղթերի համար։`,
                  ka: `გადადით ${upgradePlanName} ტარიფზე გაფართოებული საწყობისა და ყველა Cerfa ფორმისთვის.`,
                })}
              </p>
            </div>
          </div>
          {onOpenUpgradePlan && (
            <button
              type="button"
              data-testid="vehicle-quota-upgrade-btn"
              onClick={onOpenUpgradePlan}
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>
                {pickLocalized(lang, {
                  fr: `Passer à ${upgradePlanName}`,
                  ru: `Перейти на ${upgradePlanName}`,
                  hy: `Անցնել ${upgradePlanName}-ի`,
                  ka: `${upgradePlanName}-ზე გადასვლა`,
                })}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Controls Bar: Search & Status Filters */}
      <div className="bg-[var(--card)] rounded-[var(--ag-card-radius)] border border-[var(--border)] p-3.5 sm:p-4 shadow-sm space-y-3">
        {/* Search, Transaction Type, Sort & View Mode Row */}
        <div
          data-testid="inventory-toolbar-row"
          className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between"
        >
          <div className="relative flex-1 min-w-0">
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

          {/* Transaction Type Filter, Sort & View Mode Switcher */}
          <div className="flex flex-wrap md:flex-nowrap items-center justify-between md:justify-end gap-2 shrink-0">
            <ThemedSelect<InventoryTransactionFilter>
              testId="inventory-transaction-type-filter"
              ariaLabel={L(
                'Filtrer par type de transaction',
                'Фильтр по типу сделки',
                'Զտել ըստ գործարքի տեսակի',
                'გარიგების ტიპის ფილტრი'
              )}
              value={transactionTypeFilter}
              onChange={setTransactionTypeFilter}
              options={[
                {
                  value: 'all',
                  triggerLabel: L('Type : Tous', 'Тип: Все', 'Տեսակ՝ Բոլորը', 'ტიპი: ყველა'),
                  label: L('Tous', 'Все', 'Բոլորը', 'ყველა'),
                },
                {
                  value: 'micro',
                  label: L(
                    'Pro (Micro-entreprise)',
                    'Фирма (Micro-entreprise)',
                    'Ընկերություն (Micro-entreprise)',
                    'ფირმა (Micro-entreprise)'
                  ),
                },
                {
                  value: 'particulier',
                  label: L(
                    'Particulier',
                    'Частные (Particulier)',
                    'Անհատ (Particulier)',
                    'კერძო (Particulier)'
                  ),
                },
              ]}
              menuClassName="min-w-[220px]"
              triggerClassName="h-9 text-xs font-semibold bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-1.5 max-w-[190px] whitespace-nowrap"
            />

            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1 shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{t('sortBy')}</span>
              </span>
              <ThemedSelect
                testId="vehicle-list-sort-select"
                ariaLabel={t('sortBy')}
                value={sortBy}
                onChange={(val) => {
                  setSortBy(val as InventorySortField);
                  setTableSort(null);
                }}
                options={[
                  { value: 'date', label: t('sortRecent') },
                  { value: 'invested', label: t('sortInvested') },
                  { value: 'price', label: t('sortPrice') },
                  { value: 'mileage', label: t('sortMileage') },
                ]}
                triggerClassName="h-9 text-xs font-semibold bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-1.5 max-w-[180px] md:max-w-[165px] xl:max-w-none"
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

        {/* Status Filter Tabs (Active Inventory only) */}
        {!isSoldView && (
          <div
            data-testid="vehicle-status-filter-bar"
            className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              data-testid="status-filter-all"
              onClick={() => setSelectedStatus('all')}
              className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
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
              data-testid="status-filter-preparation"
              onClick={() => setSelectedStatus('preparation')}
              className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
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
              data-testid="status-filter-repair"
              onClick={() => setSelectedStatus('repair')}
              className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
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
              data-testid="status-filter-for_sale"
              onClick={() => setSelectedStatus('for_sale')}
              className={`px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
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
          </div>
        )}
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
            {/* Desktop & Tablet 8-Column Active Inventory Table */}
            <div className="hidden md:block bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-sm overflow-hidden">
              <div className="overflow-x-auto" data-testid="inventory-table-scroll-wrapper">
                <table
                  data-testid="active-inventory-table"
                  className="w-full text-left border-collapse text-xs"
                >
                  <thead>
                    <tr className="bg-[var(--ag-table-header-bg)] border-b border-[var(--border)] text-[10.5px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      {(
                        [
                          {
                            column: 'vehicle',
                            label: t('thVehicle'),
                            align: 'left',
                            pad: 'px-2.5',
                          },
                          {
                            column: 'mileage',
                            label: L('Km', 'Пробег', 'Վազք', 'გარბენი'),
                            title: t('thMileageKm'),
                            align: 'right',
                            pad: 'px-1.5',
                          },
                          {
                            column: 'status',
                            label: t('thStatus'),
                            align: 'left',
                            pad: 'px-1.5',
                          },
                          {
                            column: 'ct',
                            label: 'CT',
                            align: 'center',
                            pad: 'px-1.5',
                          },
                          {
                            column: 'docs',
                            label: docsHeaderLabel,
                            align: 'center',
                            pad: 'px-1.5',
                          },
                          {
                            column: 'purchasePrice',
                            label: L('Achat (€)', 'Покупка (€)', 'Գնում (€)', 'შესყიდვა (€)'),
                            title: t('thPurchasePriceEur'),
                            align: 'right',
                            pad: 'px-1.5',
                          },
                          {
                            column: 'expenses',
                            label: L('Frais (€)', 'Расходы (€)', 'Ծախսեր (€)', 'ხარჯები (€)'),
                            title: t('thExpensesEur'),
                            align: 'right',
                            pad: 'px-1.5',
                          },
                          {
                            column: 'totalInvested',
                            label: L('Total (€)', 'Вложено (€)', 'Ներդրված (€)', 'სულ (€)'),
                            title: t('thTotalInvestedEur'),
                            align: 'right',
                            pad: 'px-2.5',
                          },
                        ] as Array<{
                          column: InventoryTableSortColumn;
                          label: string;
                          title?: string;
                          align: 'left' | 'center' | 'right';
                          pad: string;
                        }>
                      ).map((col) => {
                        const isActive = tableSort?.column === col.column;
                        const ariaSort = isActive
                          ? tableSort.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none';
                        const justifyClass =
                          col.align === 'right'
                            ? 'justify-end'
                            : col.align === 'center'
                            ? 'justify-center'
                            : 'justify-start';
                        return (
                          <th
                            key={col.column}
                            aria-sort={ariaSort}
                            className={`py-2.5 ${col.pad} font-bold whitespace-nowrap ${
                              col.align === 'right'
                                ? 'text-right'
                                : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                            }`}
                          >
                            <button
                              type="button"
                              data-testid={`list-sort-header-${col.column}`}
                              title={col.title || col.label}
                              onClick={() =>
                                setTableSort((prev) => toggleTableSortState(prev, col.column))
                              }
                              className={`inline-flex items-center ${justifyClass} gap-0.5 whitespace-nowrap uppercase tracking-wide font-bold transition-colors cursor-pointer select-none ${
                                isActive
                                  ? 'text-[var(--primary)]'
                                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              <span>{col.label}</span>
                              {isActive ? (
                                tableSort.direction === 'asc' ? (
                                  <ArrowUp className="w-2.5 h-2.5 shrink-0" />
                                ) : (
                                  <ArrowDown className="w-2.5 h-2.5 shrink-0" />
                                )
                              ) : (
                                <ArrowUpDown className="w-2.5 h-2.5 shrink-0 opacity-55" />
                              )}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredVehicles.map((v) => {
                      const fin =
                        financialsById.get(v.id) || computeVehicleInventoryFinancials(v);
                      const hasPhoto = Boolean(v.photos && v.photos.length > 0);
                      const trimSubtitle = formatListTrimSubtitle(v.trim, 15);
                      const txBadge = getVehicleTransactionBadgeInfo(v, lang, profileType);
                      return (
                        <tr
                          key={v.id}
                          data-testid={`inventory-row-${v.id}`}
                          onClick={() => onSelectVehicle(v)}
                          className="hover:bg-[var(--ag-table-row-hover)] transition cursor-pointer group"
                        >
                          {/* 1. Vehicle (photo, brand/model/year/inline tx badge/edit, plate pill + trim/engine) */}
                          <td className="py-2.5 px-2.5">
                            <div className="flex items-center gap-2 min-w-[175px] max-w-[265px] min-[1360px]:max-w-[325px]">
                              {hasPhoto ? (
                                <img
                                  src={v.photos[0]}
                                  alt={`${v.make} ${v.model}`}
                                  className="w-12 h-9 rounded-lg object-cover border border-[var(--border)] shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-9 rounded-lg bg-[var(--background)] border border-[var(--border)] flex items-center justify-center shrink-0 text-[var(--muted-foreground)]">
                                  <Car className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-1 flex-nowrap min-w-0">
                                  <span className="font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors truncate">
                                    {v.make} {v.model}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] font-mono text-[10px] font-bold tabular-nums shrink-0">
                                    {v.year}
                                  </span>
                                  <span
                                    data-testid={`list-row-tx-inline-badge-${v.id}`}
                                    className={`text-[10px] leading-none font-medium px-1.5 py-0.5 rounded border shrink-0 ${
                                      txBadge.mode === 'micro'
                                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                        : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                    }`}
                                  >
                                    {txBadge.label}
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
                                      className="p-0.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--surface-muted)] transition opacity-70 group-hover:opacity-100 shrink-0"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {v.registrationNumber && (
                                    <span
                                      data-testid={`list-row-plate-${v.id}`}
                                      className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] leading-none shrink-0"
                                    >
                                      {v.registrationNumber}
                                    </span>
                                  )}
                                  <span
                                    data-testid={`list-row-trim-${v.id}`}
                                    title={trimSubtitle.full}
                                    className="text-[11px] text-[var(--muted-foreground)] truncate"
                                  >
                                    {trimSubtitle.display}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Mileage (km) */}
                          <td className="py-2.5 px-1.5 text-right font-mono text-[var(--secondary-foreground)] whitespace-nowrap tabular-nums">
                            {formatMileageKm(v.mileage, lang)}
                          </td>

                          {/* 3. Status */}
                          <td className="py-2.5 px-1.5" onClick={(e) => e.stopPropagation()}>
                            {renderStatusSelect(v, 'list')}
                          </td>

                          {/* 4. CT Quick Toggle */}
                          <td className="py-2.5 px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                            {renderQuickBoolSelect(v, 'ctPassed', 'list-ct-select')}
                          </td>

                          {/* 5. Docs / Dossier Quick Toggle */}
                          <td className="py-2.5 px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                            {renderQuickBoolSelect(v, 'docsCompleted', 'list-docs-select')}
                          </td>

                          {/* 6. Purchase Price (€) */}
                          <td className="py-2.5 px-1.5 text-right font-mono font-semibold text-[var(--foreground)] whitespace-nowrap tabular-nums">
                            {formatEuro(fin.purchasePrice)}
                          </td>

                          {/* 7. Expenses (€) + Quick Add (+) */}
                          <td
                            className="py-2.5 px-1.5 text-right font-mono text-[var(--secondary-foreground)] whitespace-nowrap tabular-nums"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              <span data-testid={`list-row-expenses-${v.id}`}>
                                {formatEuro(fin.totalExpenses)}
                              </span>
                              {onAddQuickExpense && (
                                <button
                                  type="button"
                                  data-testid={`list-quick-expense-btn-${v.id}`}
                                  aria-label={L(
                                    'Ajouter une dépense rapide',
                                    'Быстро добавить расход',
                                    'Ավելացնել արագ ծախս',
                                    'ხარჯის სწრაფად დამატება'
                                  )}
                                  title={L(
                                    'Ajouter une dépense',
                                    'Добавить расход',
                                    'Ավելացնել ծախս',
                                    'ხარჯის დამატება'
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQuickExpenseVehicleId(v.id);
                                  }}
                                  className="w-6 h-6 rounded-md bg-[var(--surface-muted)] hover:bg-[var(--primary)] text-[var(--foreground)] hover:text-[var(--primary-foreground)] border border-[var(--border)] inline-flex items-center justify-center transition cursor-pointer shrink-0"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* 8. Total Invested (€) */}
                          <td
                            data-testid={`list-row-invested-${v.id}`}
                            className="py-2.5 px-2.5 text-right font-mono font-extrabold text-[var(--primary)] whitespace-nowrap tabular-nums"
                          >
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
                      <td colSpan={5} className="py-3 px-2.5 text-[var(--foreground)]">
                        {t('thTotalSummary', { count: summaryTotals.vehicleCount })}
                      </td>
                      <td
                        data-testid="list-total-purchase"
                        className="py-3 px-1.5 text-right font-mono text-[var(--foreground)] whitespace-nowrap tabular-nums"
                      >
                        {formatEuro(summaryTotals.totalPurchasePrice)}
                      </td>
                      <td
                        data-testid="list-total-expenses"
                        className="py-3 px-1.5 text-right font-mono text-[var(--secondary-foreground)] whitespace-nowrap tabular-nums"
                      >
                        {formatEuro(summaryTotals.totalExpenses)}
                      </td>
                      <td
                        data-testid="list-total-invested"
                        className="py-3 px-2.5 text-right font-mono font-black text-[var(--primary)] whitespace-nowrap tabular-nums"
                      >
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
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-[var(--muted-foreground)] block truncate">
                          {t('cardExpenses')}
                        </span>
                        <div className="inline-flex items-center gap-1">
                          <span className="font-mono font-semibold text-[var(--secondary-foreground)]">
                            {formatEuro(fin.totalExpenses)}
                          </span>
                          {onAddQuickExpense && (
                            <button
                              type="button"
                              onClick={() => setQuickExpenseVehicleId(v.id)}
                              aria-label={L('Ajouter une dépense', 'Добавить расход', 'Ավելացնել ծախս', 'ხარჯის დამატება')}
                              className="w-5 h-5 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--primary)] inline-flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                        </div>
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

                    <div className="flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {renderStatusSelect(v, 'mobile-list')}
                        <div className="inline-flex items-center gap-1">
                          <span className="text-[10px] font-bold text-[var(--muted-foreground)]">CT</span>
                          {renderQuickBoolSelect(v, 'ctPassed', 'mobile-list-ct-select')}
                        </div>
                        <div className="inline-flex items-center gap-1">
                          <span className="text-[10px] font-bold text-[var(--muted-foreground)]">{docsHeaderLabel}</span>
                          {renderQuickBoolSelect(v, 'docsCompleted', 'mobile-list-docs-select')}
                        </div>
                      </div>
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
        <div
          data-testid={isSoldView ? 'sold-vehicles-empty-state' : 'inventory-empty-state'}
          className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-6 text-center max-w-xl mx-auto space-y-3.5"
        >
          <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/10 border border-[var(--primary)]/25 text-[var(--primary)] flex items-center justify-center mx-auto">
            {isSoldView ? <Archive className="w-8 h-8" /> : <Car className="w-8 h-8" />}
          </div>
          <h3 className="text-xl font-bold text-[var(--foreground)]">
            {searchQuery || (!isSoldView && selectedStatus !== 'all') || transactionTypeFilter !== 'all'
              ? t('emptyFilteredTitle')
              : isSoldView
              ? L(
                  'Aucun véhicule vendu',
                  'Проданных автомобилей пока нет',
                  'Վաճառված մեքենաներ դեռ չկան',
                  'გაყიდული ავტომობილები ჯერ არ არის'
                )
              : t('emptyTitle')}
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {searchQuery || (!isSoldView && selectedStatus !== 'all') || transactionTypeFilter !== 'all'
              ? t('emptyFilteredSubtitle')
              : isSoldView
              ? L(
                  'Les véhicules marqués comme « Vendu » apparaîtront automatiquement ici.',
                  'Автомобили со статусом «Продано» будут автоматически переноситься в этот раздел.',
                  '«Վաճառված է» կարգավիճակով մեքենաները ավտոմատ կերպով կհայտնվեն այստեղ։',
                  '«გაყიდული» სტატუსის მქონე ავტომობილები ავტომატურად გადმოვა აქ.'
                )
              : t('emptySubtitle')}
          </p>

          {!isSoldView && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleAddVehicleAction}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t('addVehicleBtn')}</span>
              </button>

              {scopedVehicles.length === 0 && vehicles.length === 0 && (
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
          )}
        </div>
      )}

      {onAddQuickExpense && onDeleteQuickExpense && (
        <QuickVehicleExpenseModal
          isOpen={Boolean(quickExpenseVehicle)}
          vehicle={quickExpenseVehicle}
          expenses={expenses}
          repairs={repairs}
          totalExpenses={quickExpenseFinancials?.totalExpenses ?? 0}
          totalInvested={quickExpenseFinancials?.totalInvested ?? 0}
          onClose={() => setQuickExpenseVehicleId(null)}
          onAddExpense={onAddQuickExpense}
          onDeleteExpense={onDeleteQuickExpense}
          onDeleteRepair={onDeleteQuickRepair}
        />
      )}
    </div>
  );
};

