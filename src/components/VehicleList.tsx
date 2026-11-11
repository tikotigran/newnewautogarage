import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
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
  FileCheck,
} from 'lucide-react';
import { FeatureFlagsConfig, Vehicle, VehicleStatus } from '../types/garage';
import { DEFAULT_FEATURE_FLAGS } from '../utils/adminUtils';
import { VehicleCard } from './VehicleCard';
import { useI18n } from '../i18n/I18nContext';
import { formatEuro, getEffectiveSalePrice } from '../utils/finance';

interface VehicleListProps {
  vehicles: Vehicle[];
  onSelectVehicle: (vehicle: Vehicle) => void;
  onNewVehicle: () => void;
  onQuickStatusChange: (vehicleId: string, newStatus: VehicleStatus) => void;
  onOpenSellModal: (vehicle: Vehicle) => void;
  onOpenCerfa?: (vehicle: Vehicle) => void;
  onSeedData: () => void;
  isSeeding: boolean;
  featureFlags?: FeatureFlagsConfig;
}

const VIEW_MODE_STORAGE_KEY = 'autogarage_inventory_view';

export const VehicleList: React.FC<VehicleListProps> = ({
  vehicles,
  onSelectVehicle,
  onNewVehicle,
  onQuickStatusChange,
  onOpenSellModal,
  onOpenCerfa,
  onSeedData,
  isSeeding,
  featureFlags = DEFAULT_FEATURE_FLAGS,
}) => {
  const { t, lang } = useI18n();
  const isRu = lang === 'ru';
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'margin' | 'mileage'>('date');
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

  // Filter & Sort Logic
  const filteredVehicles = useMemo(() => {
    return vehicles
      .filter((v) => {
        // Status filter
        if (selectedStatus !== 'all' && v.status !== selectedStatus) {
          return false;
        }
        // Search query filter (Make, Model, Trim, VIN)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchMake = v.make.toLowerCase().includes(q);
          const matchModel = v.model.toLowerCase().includes(q);
          const matchTrim = (v.trim || '').toLowerCase().includes(q);
          const matchVin = v.vin.toLowerCase().includes(q);
          const matchReg = (v.registrationNumber || '').toLowerCase().includes(q);
          if (!matchMake && !matchModel && !matchTrim && !matchVin && !matchReg) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price') {
          return (b.purchasePrice || 0) - (a.purchasePrice || 0);
        }
        if (sortBy === 'margin') {
          return (b.netProfit || 0) - (a.netProfit || 0);
        }
        if (sortBy === 'mileage') {
          return (b.mileage || 0) - (a.mileage || 0);
        }
        // default by creation date
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [vehicles, selectedStatus, searchQuery, sortBy]);

  // Counts for each tab
  const counts = {
    all: vehicles.length,
    preparation: vehicles.filter((v) => v.status === 'preparation').length,
    repair: vehicles.filter((v) => v.status === 'repair').length,
    for_sale: vehicles.filter((v) => v.status === 'for_sale').length,
    sold: vehicles.filter((v) => v.status === 'sold').length,
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar: Search & Status Filters */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl space-y-4">
        {/* Search & Sort Row */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                {t('clearSearch')}
              </button>
            )}
          </div>

          {/* Sort & View Mode Switcher */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5" />
                {t('sortBy')}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs font-semibold bg-slate-950 text-slate-200 border border-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="date">{t('sortRecent')}</option>
                {featureFlags.pnlCalculator && <option value="margin">{t('sortMargin')}</option>}
                <option value="price">{t('sortPrice')}</option>
                <option value="mileage">{t('sortMileage')}</option>
              </select>
            </div>

            {/* Grid / List View Switcher */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => handleViewModeChange('grid')}
                aria-label="Grid View"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === 'grid'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{isRu ? 'Сетка' : 'Grid'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('list')}
                aria-label="List View"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === 'list'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>{isRu ? 'Список' : 'List'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedStatus('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'all'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span>{t('statusAll')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
              {counts.all}
            </span>
          </button>

          <button
            onClick={() => setSelectedStatus('preparation')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'preparation'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3 h-3 text-amber-400" />
            <span>{t('statusPreparation')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
              {counts.preparation}
            </span>
          </button>

          <button
            onClick={() => setSelectedStatus('repair')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'repair'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Wrench className="w-3 h-3 text-blue-400" />
            <span>{t('statusRepair')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
              {counts.repair}
            </span>
          </button>

          <button
            onClick={() => setSelectedStatus('for_sale')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'for_sale'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Tag className="w-3 h-3 text-emerald-400" />
            <span>{t('statusForSale')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
              {counts.for_sale}
            </span>
          </button>

          <button
            onClick={() => setSelectedStatus('sold')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === 'sold'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-purple-400" />
            <span>{t('statusSold')}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
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
                onSelect={onSelectVehicle}
                onQuickStatusChange={onQuickStatusChange}
                onOpenSellModal={onOpenSellModal}
                showPnl={featureFlags.pnlCalculator}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 font-bold">Photo</th>
                    <th className="py-3 px-3 font-bold">{isRu ? 'Автомобиль / Год' : 'Véhicule / Année'}</th>
                    <th className="py-3 px-3 font-bold">{isRu ? 'Госномер' : 'Immatriculation'}</th>
                    <th className="py-3 px-3 font-bold text-right">{isRu ? 'Пробег' : 'Kilométrage'}</th>
                    <th className="py-3 px-3 font-bold">{isRu ? 'Статус' : 'Statut'}</th>
                    <th className="py-3 px-3 font-bold text-right">{isRu ? 'Закупка' : 'Prix d’achat'}</th>
                    <th className="py-3 px-3 font-bold text-right">{isRu ? 'Продажа' : 'Prix de vente'}</th>
                    {featureFlags.pnlCalculator && (
                      <th className="py-3 px-3 font-bold text-right">{isRu ? 'Маржа (P&L)' : 'Marge Nette'}</th>
                    )}
                    <th className="py-3 px-3 font-bold text-right">{isRu ? 'Действия' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredVehicles.map((v) => {
                    const salePrice = getEffectiveSalePrice(v);
                    const hasSalePrice = salePrice > 0;
                    const hasPhoto = v.photos && v.photos.length > 0;
                    return (
                      <tr
                        key={v.id}
                        onClick={() => onSelectVehicle(v)}
                        className="hover:bg-slate-800/50 transition cursor-pointer"
                      >
                        <td className="py-2 px-3">
                          {hasPhoto ? (
                            <img
                              src={v.photos[0]}
                              alt={`${v.make} ${v.model}`}
                              className="w-12 h-9 rounded-lg object-cover border border-slate-700"
                            />
                          ) : (
                            <div className="w-12 h-9 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600">
                              <Car className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{v.make} {v.model}</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono text-[10px] font-bold">
                              {v.year}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {v.trim || 'Standard'}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {v.registrationNumber ? (
                            <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-200 border border-slate-700 font-bold text-[11px]">
                              {v.registrationNumber}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                          {v.mileage.toLocaleString(lang === 'ru' ? 'ru-RU' : 'fr-FR')} km
                        </td>
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={v.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as VehicleStatus;
                              if (newStatus === 'sold' && v.status !== 'sold') {
                                onOpenSellModal(v);
                              } else {
                                onQuickStatusChange(v.id, newStatus);
                              }
                            }}
                            className="text-[11px] font-semibold bg-slate-950 text-slate-200 rounded-lg px-2 py-1 border border-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer"
                          >
                            <option value="preparation">🛠️ {t('statusPreparation')}</option>
                            <option value="repair">🔧 {t('statusRepair')}</option>
                            <option value="for_sale">🏷️ {t('statusForSale')}</option>
                            <option value="sold">✅ {t('statusSold')}</option>
                          </select>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                          {formatEuro(v.purchasePrice)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">
                          {hasSalePrice ? (
                            <span className="text-white">{formatEuro(salePrice)}</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        {featureFlags.pnlCalculator && (
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            {hasSalePrice ? (
                              <>
                                <span
                                  className={`font-mono font-extrabold ${
                                    v.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}
                                >
                                  {v.netProfit >= 0 ? '+' : ''}{formatEuro(v.netProfit)}
                                </span>
                                <span className="block text-[10px] text-slate-500 font-mono">
                                  {v.marginPercentage.toFixed(1)}%
                                </span>
                              </>
                            ) : (
                              <span className="font-mono text-slate-500">—</span>
                            )}
                          </td>
                        )}
                        <td className="py-2 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectVehicle(v)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition"
                            >
                              {isRu ? 'Досье' : 'Dossier'}
                            </button>
                            {featureFlags.cerfaGenerator && onOpenCerfa && (
                              <button
                                type="button"
                                onClick={() => onOpenCerfa(v)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition inline-flex items-center gap-1"
                              >
                                <FileCheck className="w-3 h-3" />
                                <span>Cerfa</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* Empty State */
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Car className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white">
            {searchQuery || selectedStatus !== 'all'
              ? t('emptyFilteredTitle')
              : t('emptyTitle')}
          </h3>
          <p className="text-sm text-slate-400">
            {searchQuery || selectedStatus !== 'all'
              ? t('emptyFilteredSubtitle')
              : t('emptySubtitle')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={onNewVehicle}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('addVehicleBtn')}</span>
            </button>

            {vehicles.length === 0 && (
              <button
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
