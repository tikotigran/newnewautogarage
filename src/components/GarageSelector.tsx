import React, { useState } from 'react';
import {
  Building2,
  User as UserIcon,
  Plus,
  ArrowRight,
  Car,
  X,
  Check,
} from 'lucide-react';
import { GarageWorkspace, Vehicle } from '../types/garage';
import { computeGarageCardStats, filterVehiclesByGarage } from '../utils/garageUtils';
import { useI18n } from '../i18n/I18nContext';

interface GarageSelectorProps {
  garages: GarageWorkspace[];
  allVehicles: Vehicle[];
  onSelectGarage: (garageId: string) => void;
  onCreateGarage: (input: {
    name: string;
    entityType: 'morale' | 'physique';
    city?: string;
    siret?: string;
    taxRegime?: 'sarl' | 'micro' | 'custom' | 'none';
    taxRatePercent?: number;
  }) => Promise<void>;
}

export const GarageSelector: React.FC<GarageSelectorProps> = ({
  garages,
  allVehicles,
  onSelectGarage,
  onCreateGarage,
}) => {
  const { lang, t } = useI18n();
  const isRu = lang === 'ru';

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<'morale' | 'physique'>('morale');
  const [taxRegime, setTaxRegime] = useState<'sarl' | 'micro' | 'custom' | 'none'>('sarl');
  const [taxRatePercent, setTaxRatePercent] = useState<number>(15);
  const [city, setCity] = useState('');
  const [siret, setSiret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEntityTypeChange = (nextType: 'morale' | 'physique') => {
    setEntityType(nextType);
    if (nextType === 'physique') {
      setTaxRegime('none');
      setTaxRatePercent(0);
    } else if (taxRegime === 'none') {
      setTaxRegime('sarl');
      setTaxRatePercent(15);
    }
  };

  const handleTaxRegimeChange = (nextRegime: 'sarl' | 'micro' | 'custom' | 'none') => {
    setTaxRegime(nextRegime);
    if (nextRegime === 'sarl') {
      setTaxRatePercent(15);
    } else if (nextRegime === 'micro') {
      setTaxRatePercent(12.3);
    } else if (nextRegime === 'none') {
      setTaxRatePercent(0);
    } else if (nextRegime === 'custom' && taxRatePercent === 0) {
      setTaxRatePercent(15);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreateGarage({
        name: name.trim(),
        entityType,
        city: city.trim(),
        siret: entityType === 'morale' ? siret.trim() : '',
        taxRegime,
        taxRatePercent: taxRegime === 'none' ? 0 : Math.max(0, Number(taxRatePercent) || 0),
      });
      setName('');
      setCity('');
      setSiret('');
      setEntityType('morale');
      setTaxRegime('sarl');
      setTaxRatePercent(15);
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] ag-card-surface p-[var(--ag-card-padding)]">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">
            {t('selectGarageTitle')}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {t('selectGarageSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold whitespace-nowrap bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('createGarageBtn')}</span>
        </button>
      </div>

      {/* Garage Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {garages.map((garage) => {
          const garageVehicles = filterVehiclesByGarage(allVehicles, garage.id);
          const stats = computeGarageCardStats(garageVehicles);
          const isMorale = garage.entityType === 'morale';

          return (
            <div
              key={garage.id}
              className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] rounded-[var(--ag-card-radius)] ag-card-surface p-[var(--ag-card-padding)] flex flex-col justify-between gap-5 transition-all"
            >
              <div className="space-y-4">
                {/* Card Top: Icon + Name + Entity Type */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center shrink-0">
                      {isMorale ? (
                        <Building2 className="w-5 h-5 text-[var(--primary)]" />
                      ) : (
                        <UserIcon className="w-5 h-5 text-sky-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-[var(--foreground)] truncate">
                        {garage.name}
                      </h2>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">
                        {isMorale
                          ? isRu
                            ? 'Юрлицо (Personne morale)'
                            : 'Personne morale'
                          : isRu
                          ? 'Физлицо (Personne physique)'
                          : 'Personne physique'}
                        {garage.city ? ` · ${garage.city}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Operational Stock Indicators */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border)] tabular-nums">
                  <div className="bg-[var(--surface-muted)] rounded-xl p-2.5 border border-[var(--border)]">
                    <p className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
                      <Car className="w-3 h-3 text-[var(--muted-foreground)] shrink-0" />
                      <span className="truncate">{isRu ? 'В наличии' : 'En stock'}</span>
                    </p>
                    <p className="text-base font-bold text-[var(--foreground)] mt-1">
                      {stats.activeStockCount}
                    </p>
                  </div>

                  <div className="bg-[var(--surface-muted)] rounded-xl p-2.5 border border-[var(--border)]">
                    <p className="text-[11px] text-[var(--muted-foreground)] truncate" title={isRu ? 'В подготовке / ремонте' : 'En prép. / réparation'}>
                      {t('garagePrepRepair')}
                    </p>
                    <p className="text-base font-bold text-[var(--warning)] mt-1">
                      {stats.prepOrRepairCount}
                    </p>
                  </div>

                  <div className="bg-[var(--surface-muted)] rounded-xl p-2.5 border border-[var(--border)]">
                    <p className="text-[11px] text-[var(--muted-foreground)] truncate" title={t('statusForSale')}>
                      {t('headerForSale')}
                    </p>
                    <p className="text-base font-bold text-[var(--success)] mt-1">
                      {stats.forSaleCount}
                    </p>
                  </div>
                </div>
              </div>

              {/* Enter Garage CTA */}
              <button
                type="button"
                onClick={() => onSelectGarage(garage.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:bg-[var(--primary)] text-[var(--foreground)] hover:text-[var(--primary-foreground)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
              >
                <span>{t('enterGarageBtn')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {/* + Create New Garage Card */}
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="min-h-[220px] bg-[var(--card)] border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] rounded-[var(--ag-card-radius)] ag-card-surface p-6 flex flex-col items-center justify-center text-center gap-3 transition-all group"
        >
          <div className="w-12 h-12 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center transition-colors">
            <Plus className="w-6 h-6 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">
              {isRu ? '+ Создать новый гараж' : '+ Créer un nouveau garage'}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 max-w-[220px]">
              {isRu
                ? 'Отдельный склад, финансы и профиль Cerfa 15776*02'
                : 'Stock, finances P&L et profil Cerfa 15776*02 dédiés'}
            </p>
          </div>
        </button>
      </div>

      {/* Create New Garage Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-garage-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 id="create-garage-title" className="text-base font-bold text-[var(--foreground)]">
                {isRu ? 'Новый гараж / автосалон' : 'Créer un nouveau garage'}
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                aria-label={isRu ? 'Закрыть' : 'Fermer'}
                className="p-1.5 rounded-[var(--ag-button-radius)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1.5">
                  {isRu ? 'Юридический статус' : 'Forme juridique / Statut'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleEntityTypeChange('morale')}
                    className={`py-2 px-3 rounded-[var(--ag-button-radius)] text-xs font-semibold border transition ${
                      entityType === 'morale'
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                        : 'bg-[var(--background)] text-[var(--secondary-foreground)] border-[var(--border)]'
                    }`}
                  >
                    {isRu ? 'Юрлицо (Мораль)' : 'Personne morale'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEntityTypeChange('physique')}
                    className={`py-2 px-3 rounded-[var(--ag-button-radius)] text-xs font-semibold border transition ${
                      entityType === 'physique'
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                        : 'bg-[var(--background)] text-[var(--secondary-foreground)] border-[var(--border)]'
                    }`}
                  >
                    {isRu ? 'Физлицо (Частник)' : 'Personne physique'}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-garage-tax-regime"
                  className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1"
                >
                  {isRu ? 'Юридический статус / Налоговый режим' : 'Statut juridique / Régime fiscal'}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="new-garage-tax-regime"
                    value={taxRegime}
                    onChange={(e) =>
                      handleTaxRegimeChange(
                        e.target.value as 'sarl' | 'micro' | 'custom' | 'none'
                      )
                    }
                    className="flex-1 min-w-0 px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                  >
                    <option value="sarl">
                      {isRu ? 'SARL / SAS - IS 15% от маржи' : 'SARL / SAS - IS 15% sur la marge'}
                    </option>
                    <option value="micro">
                      {isRu ? 'Micro-entreprise - 12.3% от оборота' : 'Micro-entreprise - 12.3% du CA'}
                    </option>
                    <option value="custom">
                      {isRu ? 'Своя пользовательская ставка' : 'Taux personnalisé'}
                    </option>
                    <option value="none">
                      {isRu ? 'Частное лицо / Без налога 0%' : 'Particulier / Sans impôt 0%'}
                    </option>
                  </select>
                  {taxRegime === 'custom' && (
                    <div className="relative w-24 shrink-0">
                      <input
                        id="new-garage-tax-rate"
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        aria-label={isRu ? 'Ставка налога %' : 'Taux %'}
                        value={taxRatePercent}
                        onChange={(e) =>
                          setTaxRatePercent(Math.max(0, Number(e.target.value) || 0))
                        }
                        className="w-full px-3 py-2 pr-7 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs font-bold text-[var(--foreground)] tabular-nums focus:outline-none focus:border-[var(--primary)]"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[var(--muted-foreground)]">
                        %
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-garage-name"
                  className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1"
                >
                  {entityType === 'morale'
                    ? isRu
                      ? 'Название компании / гаража *'
                      : 'Raison sociale / Nom du garage *'
                    : isRu
                    ? 'Имя и Фамилия владельца *'
                    : 'Nom & Prénom du vendeur *'}
                </label>
                <input
                  id="new-garage-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    entityType === 'morale' ? 'ex. Lyon Auto Select SAS' : 'ex. Jean Dupont'
                  }
                  className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-garage-city"
                    className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1"
                  >
                    {isRu ? 'Город' : 'Ville / Commune'}
                  </label>
                  <input
                    id="new-garage-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Lyon"
                    className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                {entityType === 'morale' && (
                  <div>
                    <label
                      htmlFor="new-garage-siret"
                      className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1"
                    >
                      SIRET
                    </label>
                    <input
                      id="new-garage-siret"
                      type="text"
                      value={siret}
                      onChange={(e) => setSiret(e.target.value)}
                      placeholder="14 chiffres"
                      className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--secondary-foreground)] border border-[var(--border)] transition"
                >
                  {isRu ? 'Отмена' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)] transition disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isRu ? 'Создать и открыть' : 'Créer le garage'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
