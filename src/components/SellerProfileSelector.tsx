import React, { useMemo, useState } from 'react';
import { Building2, Check, Loader2, Plus, User, X } from 'lucide-react';
import {
  GarageSettings,
  SellerProfileEntry,
  VehiclePurchaseStatus,
} from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { ThemedSelect } from './ThemedSelect';
import { LocaleDateInput } from './LocaleDateInput';
import { saveGarageSettings } from '../services/garageService';
import {
  ensureBusinessProfiles,
  ensurePersonalProfiles,
  getSellerProfileDisplayName,
  syncSellerProfileArraysToSettings,
  upsertSellerProfileEntry,
} from '../utils/profileSeparationUtils';
import {
  validateBusinessProfileEntry,
  validatePersonalProfileEntry,
} from '../utils/settingsUtils';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';

const STREET_TYPES = [
  'Rue',
  'Avenue',
  'Boulevard',
  'Impasse',
  'Allée',
  'Chemin',
  'Place',
  'Route',
  'Cours',
  'Square',
];

interface SellerProfileSelectorProps {
  purchaseStatus: VehiclePurchaseStatus;
  selectedProfileId?: string;
  garageSettings: GarageSettings;
  userId?: string;
  garageId?: string | null;
  onSelectProfileId: (profileId: string | undefined) => void;
  onSettingsUpdated?: (nextSettings: GarageSettings) => void;
  testIdPrefix?: string;
  compact?: boolean;
}

export const SellerProfileSelector: React.FC<SellerProfileSelectorProps> = ({
  purchaseStatus,
  selectedProfileId,
  garageSettings,
  userId,
  garageId,
  onSelectProfileId,
  onSettingsUpdated,
  testIdPrefix = 'seller-profile',
  compact = false,
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const isPersonal = purchaseStatus === 'particulier';
  const businessList = useMemo(
    () => ensureBusinessProfiles(garageSettings),
    [garageSettings]
  );
  const personalList = useMemo(
    () => ensurePersonalProfiles(garageSettings),
    [garageSettings]
  );
  const activeList: SellerProfileEntry[] = isPersonal ? personalList : businessList;

  const effectiveSelectedId = useMemo(() => {
    if (selectedProfileId && activeList.some((item) => item.id === selectedProfileId)) {
      return selectedProfileId;
    }
    const def = activeList.find((item) => item.isDefault) || activeList[0];
    return def?.id || '';
  }, [activeList, selectedProfileId]);

  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [inlineErrors, setInlineErrors] = useState<Record<string, string>>({});

  // Inline creation fields
  const [companyName, setCompanyName] = useState('');
  const [siret, setSiret] = useState('');
  const [iban, setIban] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [sex, setSex] = useState<'M' | 'F' | ''>('M');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [streetType, setStreetType] = useState('');
  const [streetName, setStreetName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const resetInlineForm = () => {
    setCompanyName('');
    setSiret('');
    setIban('');
    setLastName('');
    setFirstName('');
    setSex('M');
    setBirthDate('');
    setBirthPlace('');
    setStreetNumber('');
    setStreetType('');
    setStreetName('');
    setPostalCode('');
    setCity('');
    setPhone('');
    setEmail('');
    setInlineErrors({});
  };

  const handleSaveInline = async () => {
    if (isSaving) return;
    const validationErrors = isPersonal
      ? validatePersonalProfileEntry({ lastName, firstName, postalCode, email })
      : validateBusinessProfileEntry({ name: companyName, siret, postalCode, email, iban });

    if (Object.keys(validationErrors).length > 0) {
      setInlineErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    setInlineErrors({});
    try {
      const targetGarageId = garageId || garageSettings.garageId || DEFAULT_GARAGE_ID;
      let nextBusinessList = businessList;
      let nextPersonalList = personalList;
      let createdId = '';

      if (isPersonal) {
        const res = upsertSellerProfileEntry(
          personalList,
          {
            lastName: lastName.trim().toUpperCase(),
            firstName: firstName.trim(),
            sex,
            birthDate: birthDate.trim(),
            birthPlace: birthPlace.trim(),
            streetNumber: streetNumber.trim(),
            streetType: streetType.trim(),
            streetName: streetName.trim(),
            postalCode: postalCode.replace(/\s+/g, ''),
            city: city.trim(),
            country: 'France',
            phone: phone.trim(),
            email: email.trim(),
            isDefault: personalList.length === 0,
          },
          'particulier'
        );
        nextPersonalList = res.list;
        createdId = res.saved.id;
      } else {
        const res = upsertSellerProfileEntry(
          businessList,
          {
            name: companyName.trim(),
            siret: siret.trim(),
            iban: iban.replace(/\s+/g, ' ').trim().toUpperCase(),
            streetNumber: streetNumber.trim(),
            streetType: streetType.trim(),
            streetName: streetName.trim(),
            postalCode: postalCode.replace(/\s+/g, ''),
            city: city.trim(),
            country: 'France',
            phone: phone.trim(),
            email: email.trim(),
            isDefault: businessList.length === 0,
          },
          'micro'
        );
        nextBusinessList = res.list;
        createdId = res.saved.id;
      }

      const nextSettings = syncSellerProfileArraysToSettings(
        {
          ...garageSettings,
          garageId: targetGarageId,
        },
        nextBusinessList,
        nextPersonalList
      );

      await saveGarageSettings(nextSettings, userId, targetGarageId);
      onSettingsUpdated?.(nextSettings);
      onSelectProfileId(createdId);
      resetInlineForm();
      setIsAdding(false);
    } finally {
      setIsSaving(false);
    }
  };

  const options = activeList.map((entry) => {
    const title = getSellerProfileDisplayName(entry, purchaseStatus);
    const meta = isPersonal
      ? [entry.city, entry.postalCode].filter(Boolean).join(' ')
      : [entry.siret ? `SIRET ${entry.siret}` : '', entry.city].filter(Boolean).join(' · ');
    const defaultTag = entry.isDefault
      ? L(' (par défaut)', ' (осн.)', ' (հիմն.)', ' (ძირ.)')
      : '';
    return {
      value: entry.id,
      label: `${title || (isPersonal ? 'Particulier' : 'Entreprise')}${defaultTag}${
        meta ? ` — ${meta}` : ''
      }`,
    };
  });

  const emptyLabel = isPersonal
    ? L(
        'Aucun profil particulier — cliquez sur + Ajouter',
        'Нет личных профилей — нажмите + Добавить',
        'Անձնական պրոֆիլ չկա — սեղմեք + Ավելացնել',
        'პირადი პროფილი არ არის — დააჭირეთ + დამატება'
      )
    : L(
        'Aucune entreprise — cliquez sur + Ajouter',
        'Нет юрлиц — нажмите + Добавить',
        'Ընկերություն չկա — սեղմեք + Ավելացնել',
        'კომპანია არ არის — დააჭირეთ + დამატება'
      );

  const inlineInputClass =
    'w-full h-8 px-2.5 py-1 bg-[var(--background)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]';

  return (
    <div
      data-testid={`${testIdPrefix}-container`}
      className={compact ? 'space-y-2' : 'space-y-2.5 pt-1'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--secondary-foreground)]">
          {isPersonal ? (
            <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          ) : (
            <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span>
            {isPersonal
              ? L(
                  'Vendeur particulier (Cerfa & facture)',
                  'Личный профиль продавца (Cerfa и договор)',
                  'Անհատ վաճառողի պրոֆիլ',
                  'პირადი გამყიდველის პროფილი'
                )
              : L(
                  'Entité professionnelle (Cerfa & facture)',
                  'Профиль компании (Cerfa и счёт)',
                  'Բիզնես պրոֆիլ',
                  'ბიზნես პროფილი'
                )}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          {options.length > 0 ? (
            <ThemedSelect
              testId={`${testIdPrefix}-select`}
              ariaLabel={
                isPersonal
                  ? L('Choisir un profil particulier', 'Выбрать личный профиль', 'Ընտրել անհատական պրոֆիլ', 'აირჩიეთ პირადი პროფილი')
                  : L('Choisir une entreprise', 'Выбрать профиль компании', 'Ընտրել բիզնես պրոֆիլ', 'აირჩიეთ კომპანიის პროფილი')
              }
              value={effectiveSelectedId}
              onChange={(val) => onSelectProfileId(val || undefined)}
              options={options}
              triggerClassName="w-full h-9 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--foreground)]"
            />
          ) : (
            <div
              data-testid={`${testIdPrefix}-empty`}
              className="w-full h-9 px-3 flex items-center rounded-xl bg-[var(--background)] border border-dashed border-[var(--border)] text-[11px] text-[var(--muted-foreground)] truncate"
            >
              {emptyLabel}
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid={`${testIdPrefix}-add-btn`}
          onClick={() => {
            setInlineErrors({});
            setIsAdding((prev) => !prev);
          }}
          className={`h-9 px-3 rounded-xl text-xs font-bold border transition inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
            isAdding
              ? 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]'
              : 'bg-[var(--primary)]/12 text-[var(--primary)] border-[var(--primary)]/40 hover:bg-[var(--primary)]/20'
          }`}
        >
          {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>
            {isAdding
              ? L('Fermer', 'Закрыть', 'Փակել', 'დახურვა')
              : L('Ajouter', 'Добавить', 'Ավելացնել', 'დამატება')}
          </span>
        </button>
      </div>

      {isAdding && (
        <div
          data-testid={`${testIdPrefix}-inline-form`}
          className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[var(--foreground)]">
              {isPersonal
                ? L(
                    'Nouveau profil particulier',
                    'Новый личный профиль продавца',
                    'Նոր անհատական պրոֆիլ',
                    'ახალი პირადი პროფილი'
                  )
                : L(
                    'Nouveau profil professionnel',
                    'Новый профиль компании / ИП',
                    'Նոր բիզնես պրոֆիլ',
                    'ახალი კომპანიის პროფილი'
                  )}
            </span>
          </div>

          {Object.values(inlineErrors).length > 0 && (
            <p className="text-[11px] text-red-400">
              {Object.values(inlineErrors)[0]}
            </p>
          )}

          {isPersonal ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                  {L('Nom *', 'Фамилия *', 'Ազգանուն *', 'გვარი *')}
                </label>
                <input
                  type="text"
                  data-testid={`${testIdPrefix}-new-lastname`}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.toUpperCase())}
                  placeholder="ex. DUPONT"
                  className={inlineInputClass}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                  {L('Prénom *', 'Имя *', 'Անուն *', 'სახელი *')}
                </label>
                <input
                  type="text"
                  data-testid={`${testIdPrefix}-new-firstname`}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="ex. Jean"
                  className={inlineInputClass}
                />
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                  {L('Sexe (M / F)', 'Пол (M / F)', 'Սեռ (M / F)', 'სქესი (M / F)')}
                </span>
                <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={L('Sexe (M / F)', 'Пол (M / F)', 'Սեռ (M / F)', 'სქესი (M / F)')}>
                  {(['M', 'F'] as const).map((sx) => (
                    <button
                      key={sx}
                      type="button"
                      data-testid={`${testIdPrefix}-new-sex-${sx}`}
                      aria-pressed={sex === sx}
                      onClick={() => setSex(sex === sx ? '' : sx)}
                      className={`h-8 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        sex === sx
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                          : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {sx}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                  {L("Nom de l'entreprise *", 'Название компании *', 'Ընկերության անվանում *', 'კომპანიის დასახელება *')}
                </label>
                <input
                  type="text"
                  data-testid={`${testIdPrefix}-new-company`}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="ex. AutoLyon Pro"
                  className={inlineInputClass}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                  SIRET
                </label>
                <input
                  type="text"
                  data-testid={`${testIdPrefix}-new-siret`}
                  value={siret}
                  onChange={(e) => setSiret(e.target.value)}
                  placeholder="123 456 789 00012"
                  className={`${inlineInputClass} font-mono`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                  IBAN
                </label>
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value.toUpperCase())}
                  placeholder="FR76..."
                  className={`${inlineInputClass} font-mono`}
                />
              </div>
            </div>
          )}

          {isPersonal && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                  {L('Date de naissance', 'Дата рождения', 'Ծննդյան ամսաթիվ', 'დაბადების თარიღი')}
                </label>
                <LocaleDateInput
                  testId={`${testIdPrefix}-new-birth-date`}
                  ariaLabel={L('Date de naissance', 'Дата рождения', 'Ծննդյան ամսաթիվ', 'დაბადების თარიღი')}
                  value={birthDate}
                  onChange={setBirthDate}
                  className={inlineInputClass}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                  {L('Lieu de naissance', 'Место рождения', 'Ծննդավայր', 'დაბადების ადგილი')}
                </label>
                <input
                  type="text"
                  data-testid={`${testIdPrefix}-new-birth-place`}
                  value={birthPlace}
                  onChange={(e) => setBirthPlace(e.target.value)}
                  placeholder={L('ex. Lyon (69)', 'напр. Lyon (69)', 'օր.՝ Lyon (69)', 'მაგ. Lyon (69)')}
                  className={inlineInputClass}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <div className="col-span-1">
              <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                {L('N°', 'Дом №', 'Շենք', '№')}
              </label>
              <input
                type="text"
                data-testid={`${testIdPrefix}-new-street-number`}
                value={streetNumber}
                onChange={(e) => setStreetNumber(e.target.value)}
                placeholder="12"
                className={inlineInputClass}
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                {L('Voie', 'Тип', 'Տեսակ', 'ტიპი')}
              </label>
              <ThemedSelect
                ariaLabel={L('Type de voie', 'Тип улицы', 'Տեսակ', 'ქუჩის ტიპი')}
                value={streetType}
                onChange={setStreetType}
                options={[
                  { value: '', label: '—' },
                  ...STREET_TYPES.map((st) => ({ value: st, label: st })),
                ]}
                triggerClassName={inlineInputClass}
              />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                {L('Adresse', 'Улица', 'Փողոց', 'ქუჩა')}
              </label>
              <input
                type="text"
                data-testid={`${testIdPrefix}-new-street-name`}
                value={streetName}
                onChange={(e) => setStreetName(e.target.value)}
                placeholder="Victor Hugo"
                className={inlineInputClass}
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                {L('CP', 'Индекс', 'Ինդեքս', 'ინდექსი')}
              </label>
              <input
                type="text"
                maxLength={5}
                data-testid={`${testIdPrefix}-new-postal`}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="69001"
                className={`${inlineInputClass} font-mono`}
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                {L('Ville', 'Город', 'Քաղաք', 'ქალაქი')}
              </label>
              <input
                type="text"
                data-testid={`${testIdPrefix}-new-city`}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Lyon"
                className={inlineInputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                {L('Téléphone', 'Телефон', 'Հեռախոս', 'ტელეფონი')}
              </label>
              <input
                type="tel"
                data-testid={`${testIdPrefix}-new-phone`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 11 22 33 44"
                className={inlineInputClass}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">
                E-mail
              </label>
              <input
                type="email"
                data-testid={`${testIdPrefix}-new-email`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@exemple.fr"
                className={inlineInputClass}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                resetInlineForm();
                setIsAdding(false);
              }}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition cursor-pointer"
            >
              {L('Annuler', 'Отмена', 'Չեղարկել', 'გაუქმება')}
            </button>
            <button
              type="button"
              data-testid={`${testIdPrefix}-inline-save-btn`}
              disabled={isSaving}
              onClick={handleSaveInline}
              className="h-8 px-3.5 rounded-lg text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{L('Enregistrer le profil', 'Сохранить профиль', 'Պահպանել պրոֆիլը', 'პროფილის შენახვა')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
