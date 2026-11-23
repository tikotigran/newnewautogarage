import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Car, ChevronRight, Plus, Receipt, Search, TrendingUp, X } from 'lucide-react';
import { Vehicle, VehicleStatus } from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { Language, pickLocalized } from '../utils/i18nUtils';
import { formatMileageKm } from '../utils/inventoryUtils';
import {
  filterQuickCreateVehicles,
  QuickCreateVehicleAction,
} from '../utils/quickCreateUtils';

interface QuickVehiclePickerModalProps {
  isOpen: boolean;
  action: QuickCreateVehicleAction | null;
  vehicles: Vehicle[];
  onSelectVehicle: (vehicle: Vehicle) => void;
  onClose: () => void;
  onAddVehicle?: () => void;
}

function getStatusBadge(
  status: VehicleStatus,
  lang: Language
): { label: string; className: string } {
  switch (status) {
    case 'for_sale':
      return {
        label: pickLocalized(lang, {
          fr: 'En vente',
          ru: 'В продаже',
          hy: 'Վաճառվում է',
          ka: 'იყიდება',
        }),
        className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      };
    case 'repair':
      return {
        label: pickLocalized(lang, {
          fr: 'En réparation',
          ru: 'В ремонте',
          hy: 'Վերանորոգման մեջ',
          ka: 'შეკეთებაში',
        }),
        className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      };
    case 'sold':
      return {
        label: pickLocalized(lang, {
          fr: 'Vendu',
          ru: 'Продан',
          hy: 'Վաճառված',
          ka: 'გაყიდული',
        }),
        className: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      };
    case 'preparation':
    default:
      return {
        label: pickLocalized(lang, {
          fr: 'En préparation',
          ru: 'Подготовка',
          hy: 'Նախապատրաստում',
          ka: 'მომზადება',
        }),
        className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      };
  }
}

export const QuickVehiclePickerModal: React.FC<QuickVehiclePickerModalProps> = ({
  isOpen,
  action,
  vehicles,
  onSelectVehicle,
  onClose,
  onAddVehicle,
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [isOpen, action]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredVehicles = useMemo(
    () => filterQuickCreateVehicles(vehicles, searchQuery),
    [vehicles, searchQuery]
  );

  if (!isOpen || !action) return null;

  const isSales = action === 'sales';

  const modalTitle = isSales
    ? L(
        'Sélectionner un véhicule à vendre',
        'Выберите автомобиль для продажи',
        'Ընտրեք մեքենա վաճառքի համար',
        'აირჩიეთ ავტომობილი გასაყიდად'
      )
    : L(
        'Sélectionner un véhicule pour la dépense',
        'Выберите автомобиль для расхода',
        'Ընտրեք մեքենա ծախսի համար',
        'აირჩიეთ ავტომობილი ხარჯისთვის'
      );

  const modalSubtitle = isSales
    ? L(
        'Choisissez le véhicule concerné pour ouvrir la clôture de vente.',
        'Укажите автомобиль, чтобы открыть оформление продажи.',
        'Ընտրեք մեքենան վաճառքի ձևակերպումը բացելու համար։',
        'აირჩიეთ ავტომობილი გაყიდვის ფორმის გასახსნელად.'
      )
    : L(
        'Choisissez le véhicule auquel ajouter une dépense.',
        'Укажите автомобиль, к которому нужно добавить расход.',
        'Ընտրեք մեքենան, որին պետք է ավելացնել ծախս։',
        'აირჩიეთ ავტომობილი, რომელზეც დაემატება ხარჯი.'
      );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-vehicle-picker-title"
        data-testid="quick-vehicle-picker-modal"
        className="w-full max-w-xl bg-[var(--ag-modal-bg)] border border-[var(--border)] rounded-[var(--ag-modal-radius)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between gap-3 bg-[var(--card)]/70">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isSales
                  ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
              }`}
            >
              {isSales ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <Receipt className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="quick-vehicle-picker-title"
                className="text-base font-bold text-[var(--foreground)] leading-snug"
              >
                {modalTitle}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {modalSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="quick-picker-close-btn"
            aria-label={L('Fermer', 'Закрыть', 'Փակել', 'დახურვა')}
            className="p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-5 pt-4 pb-3 border-b border-[var(--border)] bg-[var(--card)]/30">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="quick-picker-search-input"
              placeholder={L(
                'Rechercher par marque, modèle ou plaque (AA-123-BB)...',
                'Поиск по марке, модели или госномеру (AA-123-BB)...',
                'Որոնել ըստ մակնիշի, մոդելի կամ պետհամարանիշի...',
                'ძებნა მარკით, მოდელით ან სახ. ნომრით...'
              )}
              className="w-full h-10 pl-10 pr-9 rounded-xl bg-[var(--background)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={L('Effacer', 'Очистить', 'Մաքրել', 'გასუფთავება')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
            <span>
              {L(
                `${filteredVehicles.length} véhicule(s)`,
                `Найдено автомобилей: ${filteredVehicles.length}`,
                `Հասանելի մեքենաներ՝ ${filteredVehicles.length}`,
                `ნაპოვნი ავტომობილი: ${filteredVehicles.length}`
              )}
            </span>
          </div>
        </div>

        {/* Vehicle List */}
        <div
          data-testid="quick-picker-vehicle-list"
          className="flex-1 overflow-y-auto p-3 space-y-1.5"
        >
          {vehicles.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center mx-auto text-[var(--muted-foreground)]">
                <Car className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-[var(--muted-foreground)]">
                {isSales
                  ? L(
                      'Aucun véhicule disponible à la vente dans ce garage.',
                      'В этом гараже нет доступных непроданных автомобилей.',
                      'Այս ավտոտնակում վաճառքի համար հասանելի մեքենա չկա։',
                      'ამ გარაჟში გასაყიდი ავტომობილი არ არის.'
                    )
                  : L(
                      'Aucun véhicule enregistré dans ce garage.',
                      'В этом гараже пока нет добавленных автомобилей.',
                      'Այս ավտոտնակում դեռ ավելացված մեքենաներ չկան։',
                      'ამ გარაჟში ავტომობილები ჯერ არ არის დამატებული.'
                    )}
              </p>
              {onAddVehicle && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAddVehicle();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {L(
                      'Ajouter un véhicule',
                      'Добавить автомобиль',
                      'Ավելացնել մեքենա',
                      'ავტომობილის დამატება'
                    )}
                  </span>
                </button>
              )}
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-2.5">
              <p className="text-sm font-medium text-[var(--muted-foreground)]">
                {L(
                  'Aucun véhicule ne correspond à votre recherche.',
                  'По вашему запросу автомобили не найдены.',
                  'Ձեր որոնմանը համապատասխան մեքենաներ չեն գտնվել։',
                  'თქვენს ძიებასთან შესაბამისი ავტომობილი ვერ მოიძებნა.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer"
              >
                {L('Réinitialiser la recherche', 'Сбросить поиск', 'Մաքրել որոնումը', 'ძებნის გასუფთავება')}
              </button>
            </div>
          ) : (
            filteredVehicles.map((vehicle) => {
              const statusBadge = getStatusBadge(vehicle.status, lang);
              const plate = (vehicle.registrationNumber || '').trim();
              const photo = vehicle.photos?.[0];

              return (
                <button
                  key={vehicle.id}
                  type="button"
                  data-testid={`quick-picker-vehicle-row-${vehicle.id}`}
                  onClick={() => onSelectVehicle(vehicle)}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--card)]/70 hover:bg-[var(--surface-muted)] border border-[var(--border)]/70 hover:border-[var(--primary)]/50 transition text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-10 rounded-lg bg-[var(--background)] border border-[var(--border)] overflow-hidden flex items-center justify-center shrink-0">
                      {photo ? (
                        <img
                          src={photo}
                          alt={`${vehicle.make} ${vehicle.model}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Car className="w-4 h-4 text-[var(--muted-foreground)]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[var(--foreground)] truncate">
                          {vehicle.make} {vehicle.model}
                        </span>
                        {vehicle.year ? (
                          <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                            {vehicle.year}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold tracking-wider bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]">
                          {plate || L('Sans plaque', 'Без номера', 'Առանց համարի', 'ნომრის გარეშե')}
                        </span>
                        <span className="text-[11px] text-[var(--muted-foreground)]">
                          {formatMileageKm(vehicle.mileage, lang)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.className}`}
                    >
                      {statusBadge.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--primary)] group-hover:translate-x-0.5 transition" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
