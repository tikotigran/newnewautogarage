import React, { useState } from 'react';
import {
  Briefcase,
  User as UserIcon,
  Plus,
  ArrowRight,
  Car,
  X,
  Check,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import {
  AppUserProfileType,
  GarageWorkspace,
  LegalStatus,
  TaxRegime,
  Vehicle,
} from '../types/garage';
import {
  canDeleteGarage,
  computeGarageCardStats,
  filterVehiclesByGarage,
} from '../utils/garageUtils';
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
  onUpdateGarage?: (
    garageId: string,
    input: {
      name: string;
      profileType: AppUserProfileType;
      city?: string;
      siret?: string;
    }
  ) => Promise<void>;
  onDeleteGarage?: (garageId: string) => Promise<void>;
}

export const GarageSelector: React.FC<GarageSelectorProps> = ({
  garages,
  allVehicles,
  onSelectGarage,
  onCreateGarage,
  onUpdateGarage,
  onDeleteGarage,
}) => {
  const { lang, t } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGarage, setEditingGarage] = useState<GarageWorkspace | null>(null);
  const [deletingGarage, setDeletingGarage] = useState<GarageWorkspace | null>(null);
  const [name, setName] = useState('');
  const [profileType, setProfileType] = useState<AppUserProfileType>('micro_entrepreneur');
  const [city, setCity] = useState('');
  const [siret, setSiret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingGarage(null);
    setName('');
    setCity('');
    setSiret('');
    setProfileType('micro_entrepreneur');
    setActionError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (garage: GarageWorkspace) => {
    const resolved = resolveUserProfileType(garage);
    setEditingGarage(garage);
    setName(garage.name || '');
    setCity(garage.city || '');
    setSiret(resolved === 'particulier' ? '' : garage.siret || '');
    setProfileType(resolved);
    setActionError(null);
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    if (isSubmitting) return;
    setIsFormOpen(false);
    setEditingGarage(null);
    setActionError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const isParticulier = profileType === 'particulier';
      if (editingGarage && onUpdateGarage) {
        await onUpdateGarage(editingGarage.id, {
          name: name.trim(),
          profileType,
          city: city.trim(),
          siret: isParticulier ? '' : siret.trim(),
        });
      } else {
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
      }
      setName('');
      setCity('');
      setSiret('');
      setProfileType('micro_entrepreneur');
      setEditingGarage(null);
      setIsFormOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : L(
              'Erreur lors de l’enregistrement.',
              'Ошибка при сохранении данных.',
              'Պահպանման սխալ։',
              'შენახვის შეცდომა.'
            )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingGarage || !onDeleteGarage) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await onDeleteGarage(deletingGarage.id);
      setDeletingGarage(null);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : L(
              'Erreur lors de la suppression.',
              'Ошибка при удалении гаража.',
              'Ջնջման սխալ։',
              'წაშლის შეცდომა.'
            )
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const deletingGarageVehiclesCount = deletingGarage
    ? filterVehiclesByGarage(allVehicles, deletingGarage.id).length
    : 0;

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
          data-testid="create-garage-header-btn"
          onClick={openCreateModal}
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
          const deleteCheck = canDeleteGarage(garages, garage.id);

          return (
            <div
              key={garage.id}
              data-testid={`garage-card-${garage.id}`}
              className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] rounded-[var(--ag-card-radius)] ag-card-surface p-4 flex flex-col justify-between gap-4 transition-all"
            >
              <div className="space-y-3">
                {/* Card Top: Icon + Name + Profile Type + Edit/Delete Actions */}
                <div className="flex items-start justify-between gap-2">
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

                  {/* Edit & Delete Garage Buttons */}
                  {(onUpdateGarage || onDeleteGarage) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {onUpdateGarage && (
                        <button
                          type="button"
                          data-testid={`garage-edit-btn-${garage.id}`}
                          onClick={() => openEditModal(garage)}
                          aria-label={L(
                            `Modifier ${garage.name}`,
                            `Редактировать ${garage.name}`,
                            `Խմբագրել ${garage.name}`,
                            `რედაქტირება ${garage.name}`
                          )}
                          title={L(
                            'Modifier les informations',
                            'Редактировать данные',
                            'Խմբագրել տվյալները',
                            'მონაცեմების რედაქტირება'
                          )}
                          className="p-1.5 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDeleteGarage && (
                        <button
                          type="button"
                          data-testid={`garage-delete-btn-${garage.id}`}
                          disabled={!deleteCheck.allowed}
                          onClick={() => {
                            setActionError(null);
                            setDeletingGarage(garage);
                          }}
                          aria-label={L(
                            `Supprimer ${garage.name}`,
                            `Удалить ${garage.name}`,
                            `Ջնջել ${garage.name}`,
                            `წაშლა ${garage.name}`
                          )}
                          title={
                            deleteCheck.allowed
                              ? L(
                                  'Supprimer cet espace',
                                  'Удалить гараж',
                                  'Ջնջել ավտոսրահը',
                                  'გარაჟის წაშლა'
                                )
                              : L(
                                  'Impossible de supprimer le dernier espace actif',
                                  'Нельзя удалить единственный оставшийся гараж',
                                  'Չի կարելի ջնջել վերջին մնացած ավտոսրահը',
                                  'ბოლო გარაჟის წაშლა შეუძლებელია'
                                )
                          }
                          className={`p-1.5 rounded-lg border transition ${
                            deleteCheck.allowed
                              ? 'bg-[var(--surface-muted)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10'
                              : 'bg-[var(--surface-muted)]/50 border-[var(--border)]/60 text-[var(--muted-foreground)]/40 cursor-not-allowed'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
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
                data-testid={`garage-enter-btn-${garage.id}`}
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
          data-testid="create-garage-card-btn"
          onClick={openCreateModal}
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

      {/* Create / Edit Garage Modal */}
      {isFormOpen && (
        <div
          data-testid="garage-form-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="garage-form-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFormModal();
          }}
        >
          <div className="w-full max-w-md bg-[var(--ag-modal-bg)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
              <h2 id="garage-form-title" className="text-base font-bold text-[var(--foreground)]">
                {editingGarage
                  ? L(
                      'Modifier cet espace',
                      'Редактировать гараж',
                      'Խմբագրել ավտոսրահը',
                      'გარაჟის რედაქტირება'
                    )
                  : L(
                      'Créer un nouvel espace',
                      'Новый профиль / пространство',
                      'Նոր պրոֆիլ / ավտոսրահ',
                      'ახალი პროფილი / სივრცე'
                    )}
              </h2>
              <button
                type="button"
                onClick={closeFormModal}
                aria-label={t('closeBtn')}
                className="p-1.5 rounded-[var(--ag-button-radius)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-3.5">
              {actionError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {actionError}
                </div>
              )}

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
                  data-testid="garage-form-name-input"
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
                    data-testid="garage-form-city-input"
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
                      data-testid="garage-form-siret-input"
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
                  onClick={closeFormModal}
                  className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--secondary-foreground)] border border-[var(--border)] transition"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  type="submit"
                  data-testid="garage-form-submit-btn"
                  disabled={isSubmitting || !name.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)] transition disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {editingGarage
                      ? L('Enregistrer', 'Сохранить', 'Պահպանել', 'შენახვა')
                      : L(
                          'Créer',
                          'Создать',
                          'Ստեղծել',
                          'შექმნა'
                        )}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Garage Confirmation Modal */}
      {deletingGarage && (
        <div
          data-testid="delete-garage-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-garage-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setDeletingGarage(null);
            }
          }}
        >
          <div className="w-full max-w-md bg-[var(--ag-modal-bg)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h2 id="delete-garage-title" className="text-base font-bold text-[var(--foreground)]">
                  {L(
                    'Supprimer cet espace ?',
                    'Удалить гараж?',
                    'Ջնջե՞լ ավտոսրահը',
                    'წავშალოთ გარაჟი?'
                  )}
                </h2>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingGarage(null)}
                aria-label={t('closeBtn')}
                className="p-1.5 rounded-[var(--ag-button-radius)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              {actionError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
                  {actionError}
                </div>
              )}

              <div className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <p className="font-bold text-sm text-[var(--foreground)]">
                  {deletingGarage.name}
                </p>
                <p className="text-[var(--muted-foreground)] mt-0.5">
                  {resolveUserProfileType(deletingGarage) === 'particulier'
                    ? t('profileBadgeParticulier')
                    : t('profileBadgeMicro')}
                  {deletingGarage.city ? ` · ${deletingGarage.city}` : ''}
                </p>
              </div>

              {deletingGarageVehiclesCount > 0 ? (
                <p className="text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 leading-relaxed">
                  {L(
                    `Attention : cet espace contient ${deletingGarageVehiclesCount} véhicule(s). La suppression effacera définitivement cet espace et ses véhicules associés.`,
                    `Внимание: в этом гараже есть ${deletingGarageVehiclesCount} авто. При удалении будут удалены сам гараж, его настройки и связанные автомобили.`,
                    `Ուշադրություն․ այս ավտոսրահում կա ${deletingGarageVehiclesCount} մեքենա։ Ջնջումը կհեռացնի նաև կապված մեքենաները։`,
                    `ყურადღება: ამ გარაჟში არის ${deletingGarageVehiclesCount} ავტომობილი. წაშლა გააქრობს მასთან დაკავშირებულ მანქანებსაც.`
                  )}
                </p>
              ) : (
                <p className="text-[var(--secondary-foreground)] leading-relaxed">
                  {L(
                    'Cet espace est vide (0 véhicule). Vous pouvez le supprimer en toute sécurité sans affecter vos autres espaces.',
                    'Этот гараж пуст (0 авто). Его можно безопасно удалить — остальные профили и данные не пострадают.',
                    'Այս ավտոսրահը դատարկ է (0 մեքենա)։ Այն կարելի է անվտանգ ջնջել։',
                    'ეს გარაჟი ცარიელია (0 მანქანა). მისი წაშლა უსაფრთხოა.'
                  )}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeletingGarage(null)}
                  className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--secondary-foreground)] border border-[var(--border)] transition"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  type="button"
                  data-testid="confirm-delete-garage-btn"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isDeleting
                      ? t('loading')
                      : L('Supprimer définitivement', 'Удалить гараж', 'Ջնջել', 'წაშლა')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

