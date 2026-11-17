import React, { useState } from 'react';
import {
  Briefcase,
  User as UserIcon,
  Plus,
  ArrowRight,
  Car,
  X,
  Check,
} from 'lucide-react';
import {
  AppUserProfileType,
  GarageWorkspace,
  LegalStatus,
  TaxRegime,
  Vehicle,
} from '../types/garage';
import { computeGarageCardStats, filterVehiclesByGarage } from '../utils/garageUtils';
import { resolveUserProfileType } from '../utils/frenchTaxEngine';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

interface GarageSelectorProps {
  garages: GarageWorkspace[];
  allVehicles: Vehicle[];
  onSelectGarage: (garageId: string) => void;
  onCreateGarage: (input: {
    name: string;
    profileType?: AppUserProfileType;
    entityType: 'morale' | 'physique';
    legalStatus?: LegalStatus;
    city?: string;
    siret?: string;
    taxRegime?: TaxRegime;
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
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [profileType, setProfileType] = useState<AppUserProfileType>('micro_entrepreneur');
  const [city, setCity] = useState('');
  const [siret, setSiret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const isParticulier = profileType === 'particulier';
      await onCreateGarage({
        name: name.trim(),
        profileType,
        entityType: 'physique',
        legalStatus: isParticulier ? 'particulier' : 'micro_entreprise',
        city: city.trim(),
        siret: isParticulier ? '' : siret.trim(),
        taxRegime: isParticulier ? 'none' : 'micro',
        taxRatePercent: isParticulier ? 0 : 13.3,
      });
      setName('');
      setCity('');
      setSiret('');
      setProfileType('micro_entrepreneur');
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 py-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] ag-card-surface p-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] tracking-tight">
            {t('selectGarageTitle')}
          </h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {t('selectGarageSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold whitespace-nowrap bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('createGarageBtn')}</span>
        </button>
      </div>

      {/* Garage Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {garages.map((garage) => {
          const garageVehicles = filterVehiclesByGarage(allVehicles, garage.id);
          const stats = computeGarageCardStats(garageVehicles);
          const resolvedProfile = resolveUserProfileType(garage);
          const isParticulier = resolvedProfile === 'particulier';

          return (
            <div
              key={garage.id}
              className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] rounded-[var(--ag-card-radius)] ag-card-surface p-4 flex flex-col justify-between gap-4 transition-all"
            >
              <div className="space-y-3">
                {/* Card Top: Icon + Name + Profile Type */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center shrink-0">
                      {isParticulier ? (
                        <UserIcon className="w-5 h-5 text-sky-500" />
                      ) : (
                        <Briefcase className="w-5 h-5 text-[var(--primary)]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-[var(--foreground)] truncate">
                        {garage.name}
                      </h2>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">
                        {isParticulier
                          ? t('profileBadgeParticulier')
                          : t('profileBadgeMicro')}
                        {garage.city ? ` · ${garage.city}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Operational Stock Indicators */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border)] tabular-nums">
                  <div className="bg-[var(--surface-muted)] rounded-xl p-2 border border-[var(--border)]">
                    <p className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
                      <Car className="w-3 h-3 text-[var(--muted-foreground)] shrink-0" />
                      <span className="truncate">
                        {L('En stock', 'В наличии', 'Պահեստում', 'საწყობში')}
                      </span>
                    </p>
                    <p className="text-sm font-bold text-[var(--foreground)] mt-0.5">
                      {stats.activeStockCount}
                    </p>
                  </div>

                  <div className="bg-[var(--surface-muted)] rounded-xl p-2 border border-[var(--border)]">
                    <p
                      className="text-[11px] text-[var(--muted-foreground)] truncate"
                      title={L(
                        'En prép. / réparation',
                        'В подготовке / ремонте',
                        'Նախապատրաստում / վերանորոգում',
                        'მომზადება / რემონტი'
                      )}
                    >
                      {t('garagePrepRepair')}
                    </p>
                    <p className="text-sm font-bold text-[var(--warning)] mt-0.5">
                      {stats.prepOrRepairCount}
                    </p>
                  </div>

                  <div className="bg-[var(--surface-muted)] rounded-xl p-2 border border-[var(--border)]">
                    <p className="text-[11px] text-[var(--muted-foreground)] truncate" title={t('statusForSale')}>
                      {t('headerForSale')}
                    </p>
                    <p className="text-sm font-bold text-[var(--success)] mt-0.5">
                      {stats.forSaleCount}
                    </p>
                  </div>
                </div>
              </div>

              {/* Enter Garage CTA */}
              <button
                type="button"
                onClick={() => onSelectGarage(garage.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:bg-[var(--primary)] text-[var(--foreground)] hover:text-[var(--primary-foreground)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
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
          className="min-h-[195px] bg-[var(--card)] border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] rounded-[var(--ag-card-radius)] ag-card-surface p-4 flex flex-col items-center justify-center text-center gap-2.5 transition-all group"
        >
          <div className="w-11 h-11 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center transition-colors">
            <Plus className="w-5 h-5 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">
              {L(
                '+ Créer un nouvel espace',
                '+ Создать новый профиль',
                '+ Ստեղծել նոր պրոֆիլ',
                '+ ახალი სივრცის შექმნა'
              )}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 max-w-[220px]">
              {L(
                'Stock, suivi financier et documents Cerfa 15776*02 dédiés',
                'Отдельный склад, расчёт прибыли и документы Cerfa 15776*02',
                'Առանձին պահեստ, ֆինանսներ և Cerfa 15776*02 փաստաթղթեր',
                'ცალკე საწყობი, ფინანსები და Cerfa 15776*02 დოკუმენტები'
              )}
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
          <div className="w-full max-w-md bg-[var(--ag-modal-bg)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
              <h2 id="create-garage-title" className="text-base font-bold text-[var(--foreground)]">
                {L(
                  'Créer un nouvel espace',
                  'Новый профиль / пространство',
                  'Նոր պրոֆիլ / ավտոսրահ',
                  'ახალი პროფილი / სივრცე'
                )}
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                aria-label={t('closeBtn')}
                className="p-1.5 rounded-[var(--ag-button-radius)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-3.5">
              <div data-testid="create-garage-profile-picker">
                <label className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1.5">
                  {t('profileSwitchLabel')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="create-garage-profile-particulier"
                    onClick={() => setProfileType('particulier')}
                    className={`p-2.5 rounded-[var(--ag-button-radius)] border text-left transition ${
                      profileType === 'particulier'
                        ? 'bg-[var(--primary)]/15 text-[var(--foreground)] border-[var(--primary)]'
                        : 'bg-[var(--background)] text-[var(--secondary-foreground)] border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <UserIcon className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <span className="truncate">{t('profileParticulierTitle')}</span>
                    </div>
                    <p className="text-[10px] text-[var(--muted-foreground)] mt-1 line-clamp-2">
                      {t('profileParticulierDesc')}
                    </p>
                  </button>
                  <button
                    type="button"
                    data-testid="create-garage-profile-micro"
                    onClick={() => setProfileType('micro_entrepreneur')}
                    className={`p-2.5 rounded-[var(--ag-button-radius)] border text-left transition ${
                      profileType === 'micro_entrepreneur'
                        ? 'bg-[var(--primary)]/15 text-[var(--foreground)] border-[var(--primary)]'
                        : 'bg-[var(--background)] text-[var(--secondary-foreground)] border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Briefcase className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                      <span className="truncate">{t('profileMicroTitle')}</span>
                    </div>
                    <p className="text-[10px] text-[var(--muted-foreground)] mt-1 line-clamp-2">
                      {t('profileMicroDesc')}
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-garage-name"
                  className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1"
                >
                  {profileType === 'micro_entrepreneur'
                    ? L(
                        'Nom commercial / Activité *',
                        'Название деятельности / ИП *',
                        'Գործունեության անվանում *',
                        'საქმიანობის დასახელება *'
                      )
                    : L(
                        'Nom & Prénom du vendeur *',
                        'Имя и Фамилия *',
                        'Անուն և ազգանուն *',
                        'სახელი და გვარი *'
                      )}
                </label>
                <input
                  id="new-garage-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    profileType === 'micro_entrepreneur'
                      ? 'ex. Lyon Auto Select'
                      : 'ex. Jean Dupont'
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
                    {L('Ville / Commune', 'Город', 'Քաղաք', 'ქალაქი')}
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

                {profileType === 'micro_entrepreneur' && (
                  <div>
                    <label
                      htmlFor="new-garage-siret"
                      className="block text-xs font-semibold text-[var(--secondary-foreground)] mb-1"
                    >
                      SIRET ({L('optionnel', 'необязательно', 'ոչ պարտադիր', 'არასავალდებულო')})
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
                  {t('cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)] transition disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {L(
                      'Créer et ouvrir',
                      'Создать и открыть',
                      'Ստեղծել և բացել',
                      'შექმნა და გახსნა'
                    )}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

