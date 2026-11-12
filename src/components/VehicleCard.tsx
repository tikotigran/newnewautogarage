import React from 'react';
import {
  Wrench,
  TrendingUp,
  Calendar,
  Gauge,
  Tag,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  AlertCircle,
  Truck,
  Image as ImageIcon,
} from 'lucide-react';
import { Vehicle, VehicleStatus } from '../types/garage';
import { formatEuro, formatDate, getEffectiveSalePrice } from '../utils/finance';
import { useI18n } from '../i18n/I18nContext';
import { VehiclePhotoPlaceholder } from './VehiclePhotoPlaceholder';

interface VehicleCardProps {
  vehicle: Vehicle;
  onSelect: (vehicle: Vehicle) => void;
  onQuickStatusChange: (vehicleId: string, newStatus: VehicleStatus) => void;
  onOpenSellModal: (vehicle: Vehicle) => void;
  showPnl?: boolean;
}

export const VehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  onSelect,
  onQuickStatusChange,
  onOpenSellModal,
  showPnl = true,
}) => {
  const { t, lang } = useI18n();

  const getStatusBadge = (status: VehicleStatus) => {
    switch (status) {
      case 'preparation':
        return {
          label: t('statusPreparation'),
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          dot: 'bg-amber-400',
        };
      case 'repair':
        return {
          label: t('statusRepair'),
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          dot: 'bg-blue-400',
        };
      case 'for_sale':
        return {
          label: t('statusForSale'),
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-400',
        };
      case 'sold':
        return {
          label: t('statusSold'),
          bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          dot: 'bg-purple-400',
        };
      default:
        return {
          label: status,
          bg: 'bg-slate-700 text-slate-300 border-slate-600',
          dot: 'bg-slate-400',
        };
    }
  };

  const statusBadge = getStatusBadge(vehicle.status);
  const isSold = vehicle.status === 'sold';
  const effectivePrice = getEffectiveSalePrice(vehicle);
  const hasSalePrice = effectivePrice > 0;

  const hasPhoto = Boolean(vehicle.photos && vehicle.photos.length > 0);
  const photoUrl = hasPhoto ? vehicle.photos[0] : '';

  return (
    <div
      onClick={() => onSelect(vehicle)}
      className="group bg-[var(--card)] rounded-[var(--ag-card-radius)] ag-card-surface border border-[var(--border)] hover:border-[var(--primary)] shadow-sm transition-all duration-300 overflow-hidden flex flex-col cursor-pointer"
    >
      {/* Top Image Preview with Overlaid Badges */}
      <div className="relative h-32 w-full bg-[var(--background)] overflow-hidden">
        {hasPhoto ? (
          <img
            src={photoUrl}
            alt={`${vehicle.make} ${vehicle.model}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <VehiclePhotoPlaceholder variant="card" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none"></div>

        {/* Status Badge */}
        <div className="absolute top-2.5 left-2.5">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border backdrop-blur-md ${statusBadge.bg}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`}></span>
            {statusBadge.label}
          </span>
        </div>

        {/* Registration Number tag (VIN kept inside VehicleDetail) */}
        {vehicle.registrationNumber && (
          <div className="absolute top-2.5 right-2.5">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-900/90 !text-white border border-slate-700/80 shadow backdrop-blur-sm">
              {vehicle.registrationNumber}
            </span>
          </div>
        )}

        {/* Bottom overlay: Make, Model & Year */}
        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold !text-white tracking-tight truncate group-hover:text-[var(--primary)] transition-colors">
              {vehicle.make} {vehicle.model}
            </h3>
            <p className="text-[11px] !text-slate-200 font-medium truncate">
              {vehicle.trim || 'Standard'}
            </p>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow shrink-0">
            {vehicle.year}
          </span>
        </div>
      </div>

      {/* Body: Compact Specifications */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
        {/* Specs row */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-[var(--muted-foreground)] bg-[var(--surface-muted)] px-2 py-1.5 rounded-lg border border-[var(--border)]">
          <div className="flex items-center gap-1 truncate">
            <Gauge className="w-3 h-3 text-[var(--muted-foreground)] shrink-0" />
            <span className="text-[var(--foreground)] font-semibold truncate">
              {vehicle.mileage.toLocaleString(lang === 'ru' ? 'ru-RU' : 'fr-FR')} km
            </span>
          </div>
          <div className="flex items-center gap-1 truncate justify-end">
            <Calendar className="w-3 h-3 text-[var(--muted-foreground)] shrink-0" />
            <span className="text-[var(--secondary-foreground)] truncate">
              {formatDate(vehicle.purchaseDate)}
            </span>
          </div>
        </div>

        {/* Financial Ledger Snapshot */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--muted-foreground)]">{t('cardInvested')}</span>
            <span className="text-[var(--primary)] font-bold tabular-nums">
              {formatEuro(vehicle.totalInvested)}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--muted-foreground)]">
              {isSold ? t('cardSold') : t('cardTarget')}
            </span>
            <span className={`font-extrabold text-xs tabular-nums ${hasSalePrice ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
              {hasSalePrice ? formatEuro(effectivePrice) : '—'}
            </span>
          </div>

          {/* Net Margin & ROI Box */}
          {showPnl && (
            <div
              className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between ${
                !hasSalePrice
                  ? 'bg-[var(--surface-muted)] border-[var(--border)] text-[var(--muted-foreground)]'
                  : vehicle.netProfit >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-[var(--success)]'
                  : 'bg-red-500/10 border-red-500/30 text-red-500'
              }`}
            >
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">{t('netMargin')}</span>
              </div>
              <div className="text-right">
                {hasSalePrice ? (
                  <>
                    <div className="text-xs font-extrabold leading-tight tabular-nums">
                      {vehicle.netProfit >= 0 ? '+' : ''}{formatEuro(vehicle.netProfit)}
                    </div>
                    <div className="text-[10px] opacity-80 font-mono leading-tight tabular-nums">
                      {vehicle.marginPercentage.toFixed(1)}%
                    </div>
                  </>
                ) : (
                  <div className="text-xs font-mono font-bold text-[var(--muted-foreground)]">—</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
          {/* Quick status selector */}
          <select
            value={vehicle.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const newStatus = e.target.value as VehicleStatus;
              if (newStatus === 'sold' && vehicle.status !== 'sold') {
                onOpenSellModal(vehicle);
              } else {
                onQuickStatusChange(vehicle.id, newStatus);
              }
            }}
            className="text-[11px] font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] rounded-lg px-2 py-1 border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] cursor-pointer max-w-[125px]"
          >
            <option value="preparation">🛠️ {t('statusPreparation')}</option>
            <option value="repair">🔧 {t('statusRepair')}</option>
            <option value="for_sale">🏷️ {t('statusForSale')}</option>
            <option value="sold">✅ {t('statusSold')}</option>
          </select>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(vehicle);
            }}
            className="flex items-center gap-1 text-[11px] font-bold text-[var(--primary)] transition-colors whitespace-nowrap"
          >
            <span>{t('dossierBtn')}</span>
            <ArrowRight className="w-3 h-3 transform group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};
