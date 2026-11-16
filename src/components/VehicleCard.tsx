import React from 'react';
import {
  Calendar,
  Gauge,
  ArrowRight,
  Edit,
} from 'lucide-react';
import { Vehicle, VehicleStatus } from '../types/garage';
import { formatEuro, formatDate } from '../utils/finance';
import {
  computeVehicleInventoryFinancials,
  formatMileageKm,
  VehicleInventoryFinancials,
} from '../utils/inventoryUtils';
import { useI18n } from '../i18n/I18nContext';
import { VehiclePhotoPlaceholder } from './VehiclePhotoPlaceholder';
import { ThemedSelect } from './ThemedSelect';

interface VehicleCardProps {
  vehicle: Vehicle;
  financials?: VehicleInventoryFinancials;
  onSelect: (vehicle: Vehicle) => void;
  onEdit?: (vehicle: Vehicle) => void;
  onQuickStatusChange: (vehicleId: string, newStatus: VehicleStatus) => void;
  onOpenSellModal: (vehicle: Vehicle) => void;
}

export const VehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  financials,
  onSelect,
  onEdit,
  onQuickStatusChange,
  onOpenSellModal,
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
  const fin = financials ?? computeVehicleInventoryFinancials(vehicle);

  const hasPhoto = Boolean(vehicle.photos && vehicle.photos.length > 0);
  const photoUrl = hasPhoto ? vehicle.photos[0] : '';

  return (
    <div
      data-testid={`inventory-card-${vehicle.id}`}
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

        {/* Registration Number tag */}
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
            <span className="text-[var(--foreground)] font-semibold truncate tabular-nums">
              {formatMileageKm(vehicle.mileage, lang)}
            </span>
          </div>
          <div className="flex items-center gap-1 truncate justify-end">
            <Calendar className="w-3 h-3 text-[var(--muted-foreground)] shrink-0" />
            <span className="text-[var(--secondary-foreground)] truncate tabular-nums">
              {formatDate(vehicle.purchaseDate)}
            </span>
          </div>
        </div>

        {/* Investment Breakdown: Purchase Price, Expenses & Total Invested */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--muted-foreground)]">{t('cardPurchase')}</span>
            <span className="text-[var(--foreground)] font-semibold tabular-nums">
              {formatEuro(fin.purchasePrice)}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--muted-foreground)]">{t('cardExpenses')}</span>
            <span className="text-[var(--secondary-foreground)] font-semibold tabular-nums">
              {formatEuro(fin.totalExpenses)}
            </span>
          </div>

          <div className="pt-1.5 mt-1 border-t border-dashed border-[var(--border)] flex items-center justify-between text-xs">
            <span className="text-[var(--foreground)] font-bold">{t('cardTotalInvested')}</span>
            <span className="text-[var(--primary)] font-extrabold tabular-nums">
              {formatEuro(fin.totalInvested)}
            </span>
          </div>
        </div>

        {/* Bottom Action Footer */}
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
          {/* Quick status selector */}
          <ThemedSelect<VehicleStatus>
            testId={`card-status-select-${vehicle.id}`}
            ariaLabel={t('statusLabel')}
            stopPropagation
            value={vehicle.status}
            onChange={(newStatus) => {
              if (newStatus === 'sold' && vehicle.status !== 'sold') {
                onOpenSellModal(vehicle);
              } else {
                onQuickStatusChange(vehicle.id, newStatus);
              }
            }}
            options={[
              { value: 'preparation', label: `🛠️ ${t('statusPreparation')}` },
              { value: 'repair', label: `🔧 ${t('statusRepair')}` },
              { value: 'for_sale', label: `🏷️ ${t('statusForSale')}` },
              { value: 'sold', label: `✅ ${t('statusSold')}` },
            ]}
            triggerClassName="text-[11px] font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] rounded-lg px-2 py-1 border border-[var(--border)] max-w-[132px]"
          />

          <div className="flex items-center gap-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(vehicle);
                }}
                aria-label={`${t('editVehicleTitle')}: ${vehicle.make} ${vehicle.model}`}
                title={t('editVehicleTitle')}
                className="p-1.5 rounded-lg bg-[var(--surface-muted)] hover:border-[var(--primary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition"
              >
                <Edit className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
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
    </div>
  );
};

