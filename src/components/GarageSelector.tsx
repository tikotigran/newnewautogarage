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
  }) => Promise<void>;
}

export const GarageSelector: React.FC<GarageSelectorProps> = ({
  garages,
  allVehicles,
  onSelectGarage,
  onCreateGarage,
}) => {
  const { lang } = useI18n();
  const isRu = lang === 'ru';

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<'morale' | 'physique'>('morale');
  const [city, setCity] = useState('');
  const [siret, setSiret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      });
      setName('');
      setCity('');
      setSiret('');
      setEntityType('morale');
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl ag-card-surface p-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isRu ? 'Выберите гараж / рабочее пространство' : 'Sélectionner un garage'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isRu
              ? 'Управляйте несколькими независимыми автосалонами с полной изоляцией инвентаря, расходов и бланков Cerfa.'
              : 'Gérez plusieurs établissements automobiles indépendants avec isolation complète des véhicules, frais et profils Cerfa.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{isRu ? 'Создать новый гараж' : 'Créer un nouveau garage'}</span>
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
              className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl ag-card-surface p-5 flex flex-col justify-between gap-5 transition-all"
            >
              <div className="space-y-4">
                {/* Card Top: Icon + Name + Entity Type */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                      {isMorale ? (
                        <Building2 className="w-5 h-5 text-amber-400" />
                      ) : (
                        <UserIcon className="w-5 h-5 text-sky-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-white truncate">
                        {garage.name}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
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
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 tabular-nums">
                  <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/60">
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Car className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{isRu ? 'В наличии' : 'En stock'}</span>
                    </p>
                    <p className="text-base font-bold text-white mt-1">
                      {stats.activeStockCount}
                    </p>
                  </div>

                  <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/60">
                    <p className="text-[11px] text-slate-400 truncate" title={isRu ? 'В подготовке / ремонте' : 'En prép. / réparation'}>
                      {isRu ? '🛠️ Подгот. / рем.' : '🛠️ Prép. / rép.'}
                    </p>
                    <p className="text-base font-bold text-amber-400 mt-1">
                      {stats.prepOrRepairCount}
                    </p>
                  </div>

                  <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/60">
                    <p className="text-[11px] text-slate-400 truncate" title={isRu ? 'В продаже' : 'En vente'}>
                      {isRu ? '🏷️ В продаже' : '🏷️ En vente'}
                    </p>
                    <p className="text-base font-bold text-emerald-400 mt-1">
                      {stats.forSaleCount}
                    </p>
                  </div>
                </div>
              </div>

              {/* Enter Garage CTA */}
              <button
                type="button"
                onClick={() => onSelectGarage(garage.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-amber-500 text-white hover:text-slate-950 border border-slate-700 hover:border-amber-500 transition-colors"
              >
                <span>{isRu ? 'Войти в гараж' : 'Accéder au garage'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {/* + Create New Garage Card */}
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="min-h-[220px] bg-slate-900/40 hover:bg-slate-900 border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl ag-card-surface p-6 flex flex-col items-center justify-center text-center gap-3 transition-all group"
        >
          <div className="w-12 h-12 rounded-2xl bg-slate-800 group-hover:bg-amber-500/15 border border-slate-700 group-hover:border-amber-500/40 flex items-center justify-center transition-colors">
            <Plus className="w-6 h-6 text-slate-400 group-hover:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              {isRu ? '+ Создать новый гараж' : '+ Créer un nouveau garage'}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
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
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-garage-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 id="create-garage-title" className="text-base font-bold text-white">
                {isRu ? 'Новый гараж / автосалон' : 'Créer un nouveau garage'}
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                aria-label={isRu ? 'Закрыть' : 'Fermer'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {isRu ? 'Юридический статус' : 'Forme juridique / Statut'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEntityType('morale')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                      entityType === 'morale'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    {isRu ? 'Юрлицо (Мораль)' : 'Personne morale'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntityType('physique')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                      entityType === 'physique'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    {isRu ? 'Физлицо (Частник)' : 'Personne physique'}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-garage-name"
                  className="block text-xs font-semibold text-slate-300 mb-1"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-garage-city"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {isRu ? 'Город' : 'Ville / Commune'}
                  </label>
                  <input
                    id="new-garage-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Lyon"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {entityType === 'morale' && (
                  <div>
                    <label
                      htmlFor="new-garage-siret"
                      className="block text-xs font-semibold text-slate-300 mb-1"
                    >
                      SIRET
                    </label>
                    <input
                      id="new-garage-siret"
                      type="text"
                      value={siret}
                      onChange={(e) => setSiret(e.target.value)}
                      placeholder="14 chiffres"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  {isRu ? 'Отмена' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition disabled:opacity-60"
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
