import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Building2,
  FileText,
  Coins,
  Palette,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  Hash,
  Scale,
  Download,
  Upload,
  Trash2,
  Sun,
  Moon,
  Languages,
  FileSpreadsheet,
  Sparkles,
  User,
  LayoutGrid,
  List,
  KeyRound,
  Menu,
  PanelLeft,
  PanelTop,
  Calculator,
  History,
  ShieldAlert,
  Info,
  ChevronDown,
  ChevronRight,
  Crown,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';
import {
  AppUserProfileType,
  FrenchTaxConfiguration,
  GarageSettings,
  LayoutMode,
  StatusProfileData,
  SubscriptionPlan,
  TaxSettingsAuditEntry,
  UserLayoutPreference,
  UserProfile,
  Vehicle,
} from '../types/garage';
import { SubscriptionPlanTab } from './SubscriptionPlanTab';
import { ThemedSelect } from './ThemedSelect';
import {
  DEFAULT_GARAGE_SETTINGS,
  getGarageSettings,
  fetchGarageSettingsFromCloud,
  saveGarageSettings,
  exportGarageDatabase,
  importGarageDatabase,
  clearLocalGarageCache,
} from '../services/garageService';
import { logEntityChange, logUserActivity } from '../services/auditAndBackupService';
import { computeEntityFieldDiffs } from '../utils/exportBackup';
import {
  getCerfaTemplatesCalibration,
  getSuperAdminTaxDefaults,
  subscribeCerfaTemplatesCalibration,
} from '../services/adminService';
import {
  calculateMicroEntrepriseTaxes,
  calculateVehicleProfitBeforeTaxes,
  FRENCH_TAX_DEFAULTS,
  getTodayIsoDate,
  normalizeFrenchTaxConfig,
  resolveUserProfileType,
  roundCurrency,
} from '../utils/frenchTaxEngine';
import {
  switchGarageSettingsProfile,
  syncActiveProfileOnEdit,
} from '../utils/profileSeparationUtils';
import { useI18n } from '../i18n/I18nContext';
import { getIntlLocale, Language, pickLocalized, SUPPORTED_LANGUAGES } from '../utils/i18nUtils';
import {
  validateGarageSettings,
  serializeBackupPayload,
  parseBackupPayload,
  vehiclesToCsv,
} from '../utils/settingsUtils';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';

const LANGUAGE_FLAGS: Record<Language, string> = {
  fr: '🇫🇷',
  ru: '🇷🇺',
  ka: '🇬🇪',
  hy: '🇦🇲',
};

export type SettingsTab = 'company' | 'templates' | 'finance' | 'appearance' | 'subscription' | 'security';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  userProfile?: UserProfile | null;
  subscriptionPlans?: SubscriptionPlan[];
  allVehiclesCount?: number;
  activeGarageId?: string | null;
  vehicles?: Vehicle[];
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  onSettingsSaved?: (newSettings: GarageSettings) => void;
  onPlanUpdated?: (updatedProfile: UserProfile) => void;
  onSubscriptionToast?: (text: string) => void;
  onOpenAlignerMode?: () => void;
  userEmail?: string | null;
  userRole?: string;
  layoutPreference?: UserLayoutPreference;
  effectiveLayoutMode?: LayoutMode;
  globalLayoutMode?: LayoutMode;
  onLayoutPreferenceChange?: (pref: UserLayoutPreference) => void;
  variant?: 'modal' | 'page';
  activeTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
}

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

const VIEW_MODE_STORAGE_KEY = 'autogarage_inventory_view';

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  userId,
  userProfile = null,
  subscriptionPlans,
  allVehiclesCount,
  activeGarageId,
  vehicles = [],
  theme,
  onThemeChange,
  onSettingsSaved,
  onPlanUpdated,
  onSubscriptionToast,
  onOpenAlignerMode,
  userEmail,
  userRole = 'user',
  layoutPreference = 'global',
  effectiveLayoutMode = 'classic',
  globalLayoutMode = 'classic',
  onLayoutPreferenceChange,
  variant = 'modal',
  activeTab: controlledActiveTab,
  onTabChange,
}) => {
  const { lang, setLang, t } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });
  const intlLocale = getIntlLocale(lang);
  const [internalActiveTab, setInternalActiveTab] = useState<SettingsTab>('company');
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = (tab: SettingsTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState<GarageSettings>(DEFAULT_GARAGE_SETTINGS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [isAdvancedTaxOpen, setIsAdvancedTaxOpen] = useState(false);
  const [defaultViewMode, setDefaultViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'list' || saved === 'grid') return saved;
    } catch {
      // ignore
    }
    return 'grid';
  });
  const [simPurchase, setSimPurchase] = useState<number>(2000);
  const [simRepairs, setSimRepairs] = useState<number>(5000);
  const [simSale, setSimSale] = useState<number>(5000);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cerfaCalibration, setCerfaCalibration] = useState(() =>
    getCerfaTemplatesCalibration()
  );

  useEffect(() => {
    const unsub = subscribeCerfaTemplatesCalibration((cal) => {
      setCerfaCalibration(cal);
    });
    return () => unsub();
  }, []);

  const isPage = variant === 'page';
  const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
  const hasProfileEditsRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;
    if (isOpen || isPage) {
      hasProfileEditsRef.current = false;
      const current = getGarageSettings(targetGarageId);
      const globalDefaults = getSuperAdminTaxDefaults();
      const resolvedProfile = resolveUserProfileType(current);
      const profileStatus = resolvedProfile === 'particulier' ? 'particulier' : 'micro_entreprise';
      const profileRegime = resolvedProfile === 'particulier' ? 'none' : 'micro';
      const normalizedTaxConfig = normalizeFrenchTaxConfig(
        {
          ...current,
          profileType: resolvedProfile,
          legalStatus: profileStatus,
          taxRegime: profileRegime,
        },
        globalDefaults
      );
      const resolvedRate =
        resolvedProfile === 'particulier'
          ? 0
          : roundCurrency(
              normalizedTaxConfig.socialContributionRate +
                (normalizedTaxConfig.versementLiberatoireEnabled
                  ? normalizedTaxConfig.versementLiberatoireRate
                  : 0)
            );
      setSettings({
        ...DEFAULT_GARAGE_SETTINGS,
        ...current,
        garageId: targetGarageId,
        theme,
        profileType: resolvedProfile,
        entityType: 'physique',
        defaultMarginPercent: current.defaultMarginPercent ?? 20,
        currency: current.currency || 'EUR',
        legalStatus: profileStatus,
        taxRegime: profileRegime,
        taxRatePercent: resolvedRate,
        frenchTaxConfig: {
          ...normalizedTaxConfig,
          legalStatus: profileStatus,
          businessTaxRegime: profileRegime,
        },
        isCalculationHistory: current.isCalculationHistory || [],
        taxAuditHistory: current.taxAuditHistory || [],
      });
      setErrors({});
      setStatusMessage(null);
      setConfirmClearCache(false);
      setMobileMenuOpen(false);
      setIsAdvancedTaxOpen(false);

      if (userId) {
        fetchGarageSettingsFromCloud(userId, targetGarageId).then((cloudSettings) => {
          if (isCancelled || hasProfileEditsRef.current) return;
          const cloudProfile = resolveUserProfileType(cloudSettings);
          const cloudStatus = cloudProfile === 'particulier' ? 'particulier' : 'micro_entreprise';
          const cloudRegime = cloudProfile === 'particulier' ? 'none' : 'micro';
          const cloudTaxConfig = normalizeFrenchTaxConfig(
            {
              ...cloudSettings,
              profileType: cloudProfile,
              legalStatus: cloudStatus,
              taxRegime: cloudRegime,
            },
            globalDefaults
          );
          const cloudRate =
            cloudProfile === 'particulier'
              ? 0
              : roundCurrency(
                  cloudTaxConfig.socialContributionRate +
                    (cloudTaxConfig.versementLiberatoireEnabled
                      ? cloudTaxConfig.versementLiberatoireRate
                      : 0)
                );
          setSettings((prev) => ({
            ...prev,
            ...cloudSettings,
            theme,
            profileType: cloudProfile,
            entityType: 'physique',
            defaultMarginPercent: cloudSettings.defaultMarginPercent ?? prev.defaultMarginPercent ?? 20,
            currency: cloudSettings.currency || prev.currency || 'EUR',
            legalStatus: cloudStatus,
            taxRegime: cloudRegime,
            taxRatePercent: cloudRate,
            frenchTaxConfig: {
              ...cloudTaxConfig,
              legalStatus: cloudStatus,
              businessTaxRegime: cloudRegime,
            },
            isCalculationHistory: cloudSettings.isCalculationHistory || prev.isCalculationHistory || [],
            taxAuditHistory: cloudSettings.taxAuditHistory || prev.taxAuditHistory || [],
          }));
        });
      }
    }
    return () => {
      isCancelled = true;
    };
  }, [isOpen, isPage, theme, userId, targetGarageId]);

  if (!isPage && !isOpen) return null;

  const resolvedEmail = userEmail || auth.currentUser?.email || settings.email || 'user@localhost';
  const resolvedUserId = userId || auth.currentUser?.uid || 'garage_pro_dealer';
  const activeProfileType: AppUserProfileType = resolveUserProfileType(settings);
  const taxConfig: FrenchTaxConfiguration = normalizeFrenchTaxConfig({
    ...settings,
    profileType: activeProfileType,
    legalStatus: activeProfileType === 'particulier' ? 'particulier' : 'micro_entreprise',
    taxRegime: activeProfileType === 'particulier' ? 'none' : 'micro',
  });

  const handleSelectProfileType = async (targetProfile: AppUserProfileType) => {
    hasProfileEditsRef.current = true;
    setErrors({});
    const nextSettings = switchGarageSettingsProfile(
      {
        ...settings,
        garageId: targetGarageId,
        theme,
        layoutMode: layoutPreference,
      },
      targetProfile
    );
    setSettings(nextSettings);
    await saveGarageSettings(nextSettings, userId, targetGarageId);
    if (onSettingsSaved) onSettingsSaved(nextSettings);
    setStatusMessage({
      type: 'success',
      text:
        targetProfile === 'particulier'
          ? L(
              'Mode Particulier activé : aucun calcul URSSAF, TVA ou impôt professionnel.',
              'Режим «Частное лицо» (Particulier) активирован: налоги URSSAF и VL отключены.',
              'Particulier ռեժիմը միացված է՝ URSSAF և TVA հարկեր չկան։',
              'Particulier რეჟიმი ჩართულია: URSSAF და TVA გათიშულია.'
            )
          : L(
              'Mode Micro-entrepreneur activé.',
              'Режим Micro-entrepreneur активирован.',
              'Micro-entrepreneur ռեժիմը միացված է։',
              'Micro-entrepreneur რეჟიმი ჩართულია.'
            ),
    });
  };

  const updateProfileField = (patch: Partial<StatusProfileData>) => {
    hasProfileEditsRef.current = true;
    setSettings((prev) => syncActiveProfileOnEdit(prev, patch));
  };

  const updateTaxConfig = (
    patch: Partial<FrenchTaxConfiguration>,
    extraSettingsPatch?: Partial<GarageSettings>
  ) => {
    const targetProfile: AppUserProfileType = activeProfileType;
    const enforcedStatus = targetProfile === 'particulier' ? 'particulier' : 'micro_entreprise';
    const enforcedRegime = targetProfile === 'particulier' ? 'none' : 'micro';
    const nextConfig = normalizeFrenchTaxConfig({
      ...settings,
      ...extraSettingsPatch,
      profileType: targetProfile,
      entityType: 'physique',
      legalStatus: enforcedStatus,
      taxRegime: enforcedRegime,
      frenchTaxConfig: {
        ...taxConfig,
        ...patch,
        legalStatus: enforcedStatus,
        businessTaxRegime: enforcedRegime,
        effectiveDates: {
          ...taxConfig.effectiveDates,
          ...(patch.effectiveDates || {}),
        },
      },
    });
    const syncedRate =
      targetProfile === 'particulier'
        ? 0
        : roundCurrency(
            nextConfig.socialContributionRate +
              (nextConfig.versementLiberatoireEnabled ? nextConfig.versementLiberatoireRate : 0)
          );

    setSettings((prev) => ({
      ...prev,
      ...extraSettingsPatch,
      profileType: targetProfile,
      entityType: 'physique',
      legalStatus: enforcedStatus,
      taxRegime: enforcedRegime,
      taxRatePercent: syncedRate,
      frenchTaxConfig: nextConfig,
    }));
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetProfile = resolveUserProfileType(settings);
    const enforcedStatus = targetProfile === 'particulier' ? 'particulier' : 'micro_entreprise';
    const enforcedRegime = targetProfile === 'particulier' ? 'none' : 'micro';

    if (activeTab === 'company') {
      const validationErrors = validateGarageSettings({
        ...settings,
        profileType: targetProfile,
        entityType: 'physique',
        legalStatus: enforcedStatus,
        taxRegime: enforcedRegime,
      });
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) {
        setStatusMessage({
          type: 'error',
          text: L(
            'Veuillez corriger les erreurs du profil (nom, code postal 5 chiffres, e-mail).',
            'Проверьте корректность полей профиля (имя, почтовый индекс 5 цифр, email).',
            'Ստուգեք պրոֆիլի դաշտերը (անուն, փոստային ինդեքս 5 նիշ, էլ․ փոստ)։',
            'შეამოწმეთ პროფილის ველები (სახელი, 5-ნიშნა საფოსტო კოდი, ელფოსტა).'
          ),
        });
        return;
      }
    }

    const normalizedTax = normalizeFrenchTaxConfig({
      ...settings,
      profileType: targetProfile,
      entityType: 'physique',
      legalStatus: enforcedStatus,
      taxRegime: enforcedRegime,
      frenchTaxConfig: {
        ...taxConfig,
        legalStatus: enforcedStatus,
        businessTaxRegime: enforcedRegime,
        vatRegime: 'franchise_base',
        vatRatePercent: 0,
      },
    });
    const resolvedTaxRate =
      targetProfile === 'particulier'
        ? 0
        : roundCurrency(
            normalizedTax.socialContributionRate +
              (normalizedTax.versementLiberatoireEnabled ? normalizedTax.versementLiberatoireRate : 0)
          );

    const prevSettings = getGarageSettings(targetGarageId);
    const prevTaxConfig = normalizeFrenchTaxConfig(prevSettings);
    const taxDiffs = computeEntityFieldDiffs(
      prevTaxConfig as unknown as Record<string, unknown>,
      normalizedTax as unknown as Record<string, unknown>,
      [
        'legalStatus',
        'businessTaxRegime',
        'socialContributionRate',
        'versementLiberatoireEnabled',
        'versementLiberatoireRate',
        'microBicAbattementPercent',
        'microBicIncomeTaxRate',
      ]
    );

    const nextAuditHistory: TaxSettingsAuditEntry[] =
      taxDiffs.length > 0
        ? [
            {
              id: `tax_audit_${Date.now()}`,
              timestamp: new Date().toISOString(),
              actorEmail: resolvedEmail,
              summary: taxDiffs.map((d) => `${d.field}: ${d.oldValue} → ${d.newValue}`).join(' | '),
              changes: taxDiffs.map((d) => ({
                field: String(d.field),
                oldValue: String(d.oldValue ?? ''),
                newValue: String(d.newValue ?? ''),
              })),
            },
            ...(settings.taxAuditHistory || []),
          ].slice(0, 100)
        : settings.taxAuditHistory || [];

    const updatedSettings: GarageSettings = syncActiveProfileOnEdit(
      {
        ...settings,
        profileType: targetProfile,
        entityType: 'physique',
        legalStatus: enforcedStatus,
        taxRegime: enforcedRegime,
        taxRatePercent: resolvedTaxRate,
        frenchTaxConfig: normalizedTax,
        taxAuditHistory: nextAuditHistory,
        theme,
        layoutMode: layoutPreference,
      },
      {
        siret: targetProfile === 'particulier' ? '' : (settings.siret || '').trim(),
        legalForm: targetProfile === 'particulier' ? '' : settings.legalForm || 'Micro-entrepreneur',
        tvaMention:
          targetProfile === 'particulier'
            ? ''
            : 'TVA non applicable, art. 293 B du CGI',
        postalCode: (settings.postalCode || '').replace(/\s+/g, ''),
      }
    );

    const scopedUpdatedSettings: GarageSettings = {
      ...updatedSettings,
      garageId: targetGarageId,
    };
    setSettings(scopedUpdatedSettings);
    await saveGarageSettings(scopedUpdatedSettings, userId, targetGarageId);
    const diffs = computeEntityFieldDiffs(
      prevSettings as unknown as Record<string, unknown>,
      updatedSettings as unknown as Record<string, unknown>,
      ['profileType', 'name', 'siret', 'streetName', 'postalCode', 'city', 'email', 'legalStatus', 'taxRegime', 'taxRatePercent', 'tvaMention', 'currency']
    );
    void logUserActivity({
      userId: resolvedUserId,
      garageId: updatedSettings.garageId,
      actorEmail: resolvedEmail,
      action: taxDiffs.length > 0 ? 'tax_settings_updated' : 'settings_updated',
      entityType: 'settings',
      entityId: updatedSettings.garageId || 'garage_default',
      targetLabel: updatedSettings.name,
      details: `${diffs.length + taxDiffs.length} champ(s) modifié(s)`,
    });
    if (diffs.length > 0 || taxDiffs.length > 0) {
      void logEntityChange({
        userId: resolvedUserId,
        garageId: updatedSettings.garageId,
        actorEmail: resolvedEmail,
        operation: 'update',
        entityType: 'settings',
        entityId: updatedSettings.garageId || 'garage_default',
        entityLabel: updatedSettings.name,
        changes: [...diffs, ...taxDiffs],
      });
    }
    if (onSettingsSaved) onSettingsSaved(updatedSettings);
    setStatusMessage({
      type: 'success',
      text: L(
        'Paramètres enregistrés et synchronisés (véhicules et ventes historiques conservés).',
        'Настройки сохранены и синхронизированы (автомобили и история продаж сохранены).',
        'Կարգավորումները պահպանված և համաժամեցված են (տվյալները և վաճառքների պատմությունը պահպանվում են)։',
        'პარამეტრები შენახულია და სინქრონიზებულია (ავტომობილები და გაყიდვების ისტორია შენარჩუნებულია).'
      ),
    });
  };

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setDefaultViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
    setStatusMessage({
      type: 'success',
      text: L(
        `Affichage par défaut mis à jour : ${mode === 'grid' ? 'Grille' : 'Liste'}.`,
        `Вид инвентаря по умолчанию: ${mode === 'grid' ? 'Сетка' : 'Список'}.`,
        `Լռելյայն տեսքը թարմացված է՝ ${mode === 'grid' ? 'Ցանց' : 'Ցանկ'}։`,
        `ნაგულისხმევი ხედი განახლდა: ${mode === 'grid' ? 'ბადე' : 'სია'}.`
      ),
    });
  };

  const handlePasswordReset = async () => {
    if (!auth.currentUser?.email) {
      setStatusMessage({
        type: 'error',
        text: L(
          'La réinitialisation du mot de passe nécessite une session Firebase Email active.',
          'Сброс пароля доступен только при активной сессии Firebase Email.',
          'Գաղտնաբառի վերականգնման համար անհրաժեշտ է ակտիվ Firebase էլ․ փոստի սեսիա։',
          'პაროლის აღდგენა საჭიროებს აქტიურ Firebase Email სესიას.'
        ),
      });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      setStatusMessage({
        type: 'success',
        text: L(
          `Un e-mail de réinitialisation a été envoyé à ${auth.currentUser.email}.`,
          `Письмо для сброса пароля отправлено на ${auth.currentUser.email}.`,
          `Վերականգնման նամակն ուղարկվել է ${auth.currentUser.email} հասցեին։`,
          `აღდგენის წერილი გაიგზავნა მისამართზე ${auth.currentUser.email}.`
        ),
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text:
          err?.message ||
          L(
            'Erreur lors de l’envoi.',
            'Ошибка отправки письма.',
            'Ուղարկման սխալ։',
            'გაგზავნის შეცდომა.'
          ),
      });
    }
  };

  const handleExportJson = () => {
    const payload = exportGarageDatabase(vehicles);
    const json = serializeBackupPayload(payload);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AutoGarage_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    void logUserActivity({
      userId: resolvedUserId,
      garageId: settings.garageId,
      actorEmail: resolvedEmail,
      action: 'backup_created',
      entityType: 'backup',
      targetLabel: `AutoGarage_Backup_${new Date().toISOString().split('T')[0]}.json`,
      details: `${vehicles.length} véhicules`,
    });
    setStatusMessage({
      type: 'success',
      text: L(
        'Sauvegarde JSON téléchargée avec succès.',
        'Резервная копия JSON скачана.',
        'JSON պահուստային պատճենը ներբեռնվեց։',
        'JSON სარეზერვო ასლი ჩამოიტვირთა.'
      ),
    });
  };

  const handleExportCsv = () => {
    const csv = vehiclesToCsv(vehicles);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AutoGarage_Vehicules_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    void logUserActivity({
      userId: resolvedUserId,
      garageId: settings.garageId,
      actorEmail: resolvedEmail,
      action: 'export_csv',
      targetLabel: `AutoGarage_Vehicules_${new Date().toISOString().split('T')[0]}.csv`,
      details: `${vehicles.length} véhicules`,
    });
    setStatusMessage({
      type: 'success',
      text: L(
        'Export CSV des véhicules téléchargé.',
        'Таблица CSV экспортирована.',
        'Ավտոմեքենաների CSV արտահանումը ներբեռնվեց։',
        'ავტომობილების CSV ექსპორტი ჩამოიტვირთა.'
      ),
    });
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBackupPayload(text);
      await importGarageDatabase(parsed, userId);
      const refreshed = getGarageSettings(targetGarageId);
      setSettings(refreshed);
      if (refreshed.theme) onThemeChange(refreshed.theme);
      if (onSettingsSaved) onSettingsSaved(refreshed);
      setStatusMessage({
        type: 'success',
        text: L(
          `Base restaurée avec succès (${parsed.vehicles.length} véhicule(s)).`,
          `Восстановлено автомобилей: ${parsed.vehicles.length}.`,
          `Տվյալների բազան վերականգնված է (${parsed.vehicles.length} մեքենա)։`,
          `ბაზა აღდგენილია (${parsed.vehicles.length} ავტომობილი).`
        ),
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur lors de l’importation.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmClearCache = () => {
    clearLocalGarageCache();
    setSettings({ ...DEFAULT_GARAGE_SETTINGS, theme });
    setConfirmClearCache(false);
    if (onSettingsSaved) onSettingsSaved(DEFAULT_GARAGE_SETTINGS);
    setStatusMessage({
      type: 'success',
      text: L(
        'Cache local vidé et paramètres réinitialisés par défaut.',
        'Локальный кэш очищен, настройки сброшены по умолчанию.',
        'Տեղային քեշը մաքրված է, կարգավորումները վերականգնված են։',
        'ლოკალური ქეში გასუფთავდა და პარამეტრები განულდა.'
      ),
    });
  };

  const navItems: {
    id: SettingsTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'company',
      label: L('Profil & Statut', 'Профиль и статус', 'Պրոֆիլ և կարգավիճակ', 'პროფილი და სტატუსი'),
      shortLabel: L('Profil', 'Профиль', 'Պրոֆիլ', 'პროფილი'),
      icon: Building2,
    },
    {
      id: 'templates',
      label: L('Modèles & Cerfa', 'Бланки и Cerfa', 'Ձևաթղթեր և Cerfa', 'ბლანკები და Cerfa'),
      shortLabel: 'Cerfa',
      icon: FileText,
    },
    {
      id: 'finance',
      label: L('Finances & Estimations', 'Финансы и расчёты', 'Ֆինանսներ և հաշվարկներ', 'ფინანსები და გათვლები'),
      shortLabel: L('Finances', 'Финансы', 'Ֆինանսներ', 'ფინანსები'),
      icon: Coins,
    },
    {
      id: 'appearance',
      label: L('Apparence', 'Внешний вид', 'Արտաքին տեսք', 'გარეგნობა'),
      shortLabel: L('Thème', 'Вид', 'Տեսք', 'იერსახე'),
      icon: Palette,
    },
    {
      id: 'subscription',
      label: L('Abonnement & Forfait', 'Тариф и подписка', 'Սակագին և բաժանորդագրություն', 'ტარიფი და გამოწერა'),
      shortLabel: L('Forfait', 'Тариф', 'Սակագին', 'ტარიფი'),
      icon: Crown,
    },
    {
      id: 'security',
      label: L('Sécurité & Compte', 'Безопасность и Аккаунт', 'Անվտանգություն և հաշիվ', 'უსაფრთხოება და ანგარიში'),
      shortLabel: L('Compte', 'Аккаунт', 'Հաշիվ', 'ანგარიში'),
      icon: ShieldCheck,
    },
  ];

  const inputClass =
    'w-full h-9 px-3.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-xs font-semibold text-slate-300 mb-1';
  const siretDigits = (settings.siret || '').replace(/\s+/g, '');

  const mainContent = (
    <>
      {statusMessage && (
        <div
          className={`rounded-xl p-3.5 text-xs flex items-center gap-2.5 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

            {/* 1. USER PROFILE / SELLER DETAILS */}
            {activeTab === 'company' && (
              <form id="company-settings-form" onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {L(
                      'Profil utilisateur & Coordonnées Cerfa',
                      'Профиль пользователя и реквизиты Cerfa',
                      'Օգտատիրոջ պրոֆիլ և Cerfa տվյալներ',
                      'მომხმარებლის პროფილი და Cerfa მონაცემები'
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {L(
                      'Choisissez votre type de profil (Particulier ou Micro-entrepreneur) et renseignez vos coordonnées pour le Cerfa.',
                      'Выберите тип профиля (Particulier или Micro-entrepreneur) и заполните данные продавца для Cerfa.',
                      'Ընտրեք Ձեր պրոֆիլի տեսակը (Particulier կամ Micro-entrepreneur) և լրացրեք Cerfa տվյալները։',
                      'აირჩიეთ პროფილის ტიპი (Particulier ან Micro-entrepreneur) და შეავსეთ Cerfa მონაცემები.'
                    )}
                  </p>
                </div>

                {/* 2-Profile Switch (STRICTLY Particulier vs Micro-entrepreneur) */}
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <span className="block text-xs font-bold text-slate-300">
                    {t('profileSwitchLabel')}
                  </span>
                  <div
                    data-testid="settings-profile-picker"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                  >
                    <button
                      type="button"
                      data-testid="settings-profile-particulier"
                      onClick={() => handleSelectProfileType('particulier')}
                      className={`flex items-start gap-2.5 p-3 rounded-xl text-left border transition cursor-pointer ${
                        activeProfileType === 'particulier'
                          ? 'bg-blue-600/20 text-blue-200 border-blue-500/60 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <User className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="block text-xs font-bold text-white">
                          {t('profileParticulierTitle')}
                        </span>
                        <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">
                          {t('profileParticulierDesc')}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      data-testid="settings-profile-micro"
                      onClick={() => handleSelectProfileType('micro_entrepreneur')}
                      className={`flex items-start gap-2.5 p-3 rounded-xl text-left border transition cursor-pointer ${
                        activeProfileType === 'micro_entrepreneur'
                          ? 'bg-amber-500/15 text-amber-200 border-amber-500/60 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <div className="min-w-0">
                        <span className="block text-xs font-bold text-white">
                          {t('profileMicroTitle')}
                        </span>
                        <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">
                          {t('profileMicroDesc')}
                        </span>
                      </div>
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-300/90 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('profileNonDestructiveNotice')}</span>
                  </p>
                </div>

                {/* Live Cerfa Header Preview */}
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-start justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                        {L(
                          'Aperçu Section 2 Cerfa 15776*02',
                          'Предпросмотр: Раздел 2 Cerfa 15776*02',
                          'Նախադիտում․ Բաժին 2 Cerfa 15776*02',
                          'წინასწარი ნახვა: ნაწილი 2 Cerfa 15776*02'
                        )}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          activeProfileType === 'particulier'
                            ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {activeProfileType === 'particulier'
                          ? t('profileBadgeParticulier')
                          : t('profileBadgeMicro')}
                      </span>
                    </div>
                    {activeProfileType === 'particulier' ? (
                      <>
                        <p className="font-bold text-white text-sm">
                          {[settings.lastName, settings.firstName]
                            .filter(Boolean)
                            .join(' ')
                            .trim()
                            .toUpperCase() ||
                            settings.name ||
                            L(
                              'Nom & Prénom non renseignés',
                              'ФИО не указаны',
                              'Անուն և ազգանունը նշված չեն',
                              'სახელი და გვარი მითითებული არ არის'
                            )}
                          {settings.sex ? ` (${settings.sex})` : ''}
                        </p>
                        <p className="text-slate-400">
                          {L(
                            'Particulier — Vendeur non professionnel',
                            'Частное лицо — непрофессиональный продавец',
                            'Ֆիզիկական անձ — ոչ պրոֆեսիոնալ վաճառող',
                            'კერძო პირი — არაპროფესիონალი გამყიდველი'
                          )}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-white text-sm">
                          {settings.name ||
                            L(
                              'Nom commercial non renseigné',
                              'Название не указано',
                              'Անվանումը նշված չէ',
                              'დასახელება მითითებული არ არის'
                            )}
                        </p>
                        <p className="text-slate-400">
                          SIRET : <span className="font-mono">{settings.siret || L('Optionnel / Non renseigné', 'Не указан', 'Նշված չէ', 'არ არის მითითებული')}</span>
                        </p>
                      </>
                    )}
                    {(() => {
                      const addrStreet = [
                        settings.streetNumber,
                        settings.streetExtension,
                        settings.streetType,
                        settings.streetName,
                      ]
                        .filter(Boolean)
                        .join(' ');
                      const addrCity = [settings.postalCode, settings.city]
                        .filter(Boolean)
                        .join(' ');
                      const fullAddr = [addrStreet, addrCity].filter(Boolean).join(' — ');
                      return (
                        <p className="text-slate-400">
                          {fullAddr ||
                            L(
                              'Adresse non renseignée',
                              'Адрес не указан',
                              'Հասցեն նշված չէ',
                              'მისამართი მითითებული არ არის'
                            )}
                        </p>
                      );
                    })()}
                  </div>
                  {(settings.phone || settings.email) && (
                    <div className="text-right text-[11px] text-slate-400">
                      {settings.phone && <p>{settings.phone}</p>}
                      {settings.email && <p>{settings.email}</p>}
                    </div>
                  )}
                </div>

                {/* Conditional Identity Fields */}
                {activeProfileType === 'particulier' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="settings-last-name" className={labelClass}>
                        {L('Nom *', 'Фамилия (Nom) *', 'Ազգանուն *', 'გვარი *')}
                      </label>
                      <input
                        id="settings-last-name"
                        type="text"
                        value={settings.lastName || ''}
                        onChange={(e) => updateProfileField({ lastName: e.target.value.toUpperCase() })}
                        placeholder="ex. Martin"
                        className={inputClass}
                      />
                      {errors.lastName && <p className="text-[11px] text-red-400 mt-1">{errors.lastName}</p>}
                    </div>

                    <div>
                      <label htmlFor="settings-first-name" className={labelClass}>
                        {L('Prénom *', 'Имя (Prénom) *', 'Անուն *', 'სახელი *')}
                      </label>
                      <input
                        id="settings-first-name"
                        type="text"
                        value={settings.firstName || ''}
                        onChange={(e) => updateProfileField({ firstName: e.target.value })}
                        placeholder="ex. Jean"
                        className={inputClass}
                      />
                      {errors.firstName && <p className="text-[11px] text-red-400 mt-1">{errors.firstName}</p>}
                    </div>

                    <div>
                      <span className={labelClass}>Sexe (M / F)</span>
                      <div className="grid grid-cols-2 gap-2">
                        {(['M', 'F'] as const).map((sx) => (
                          <button
                            key={sx}
                            type="button"
                            onClick={() =>
                              updateProfileField({ sex: settings.sex === sx ? '' : sx })
                            }
                            className={`h-9 rounded-xl text-xs font-bold border transition ${
                              settings.sex === sx
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            {sx === 'M' ? 'M' : 'F'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="settings-company-name" className={labelClass}>
                        {L(
                          'Nom commercial / Activité *',
                          'Название деятельности / Псевдоним *',
                          'Առևտրային անվանում *',
                          'სავაჭრო სახელი *'
                        )}
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          id="settings-company-name"
                          type="text"
                          value={settings.name}
                          onChange={(e) => updateProfileField({ name: e.target.value })}
                          placeholder="ex. Mon Garage Auto"
                          className={`${inputClass} pl-9`}
                        />
                      </div>
                      {errors.name && <p className="text-[11px] text-red-400 mt-1">{errors.name}</p>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="settings-siret" className="text-xs font-semibold text-slate-300">
                          {L(
                            'N° SIRET (14 chiffres, optionnel)',
                            'Номер SIRET (14 цифр, опционально)',
                            'SIRET համար (14 նիշ, ըստ ցանկության)',
                            'SIRET ნომერი (14 ციფრი, არასავალდებულო)'
                          )}
                        </label>
                        {siretDigits.length > 0 && (
                          <span
                            className={`text-[10px] font-mono ${
                              siretDigits.length === 14 ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {siretDigits.length}/14
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          id="settings-siret"
                          type="text"
                          value={settings.siret}
                          onChange={(e) => updateProfileField({ siret: e.target.value })}
                          placeholder="ex. 123 456 789 00012"
                          className={`${inputClass} pl-9 font-mono`}
                        />
                      </div>
                      {errors.siret && <p className="text-[11px] text-red-400 mt-1">{errors.siret}</p>}
                    </div>
                  </div>
                )}

                {/* Split Address Fields */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="col-span-1">
                    <label htmlFor="settings-street-num" className={labelClass}>
                      N° de voie *
                    </label>
                    <input
                      id="settings-street-num"
                      type="text"
                      required
                      value={settings.streetNumber}
                      onChange={(e) => updateProfileField({ streetNumber: e.target.value })}
                      placeholder="ex. 24"
                      className={`${inputClass}${errors.streetNumber ? ' border-red-500 ring-2 ring-red-500/20' : ''}`}
                    />
                    {errors.streetNumber && <p className="text-[11px] text-red-400 mt-1">{errors.streetNumber}</p>}
                  </div>

                  <div className="col-span-1">
                    <label htmlFor="settings-street-ext" className={labelClass}>
                      Extension
                    </label>
                    <input
                      id="settings-street-ext"
                      type="text"
                      value={settings.streetExtension || ''}
                      onChange={(e) => updateProfileField({ streetExtension: e.target.value })}
                      placeholder="ex. bis, ter"
                      className={inputClass}
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="settings-street-type" className={labelClass}>
                      Type de voie
                    </label>
                    <ThemedSelect
                      id="settings-street-type"
                      testId="settings-street-type-select"
                      ariaLabel="Type de voie"
                      value={settings.streetType || ''}
                      onChange={(val) => updateProfileField({ streetType: val })}
                      options={[
                        { value: '', label: '—' },
                        ...STREET_TYPES.map((st) => ({ value: st, label: st })),
                      ]}
                      triggerClassName={inputClass}
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-3">
                    <label htmlFor="settings-street-name" className={labelClass}>
                      Nom de la voie *
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        id="settings-street-name"
                        type="text"
                        required
                        value={settings.streetName}
                        onChange={(e) => updateProfileField({ streetName: e.target.value })}
                        placeholder="ex. Avenue de la République"
                        className={`${inputClass} pl-9${errors.streetName ? ' border-red-500 ring-2 ring-red-500/20' : ''}`}
                      />
                    </div>
                    {errors.streetName && <p className="text-[11px] text-red-400 mt-1">{errors.streetName}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="settings-postal-code" className={labelClass}>
                      Code postal (5 chiffres) *
                    </label>
                    <input
                      id="settings-postal-code"
                      type="text"
                      maxLength={5}
                      value={settings.postalCode}
                      onChange={(e) => updateProfileField({ postalCode: e.target.value })}
                      placeholder="ex. 75020"
                      className={`${inputClass} font-mono`}
                    />
                    {errors.postalCode && <p className="text-[11px] text-red-400 mt-1">{errors.postalCode}</p>}
                  </div>

                  <div>
                    <label htmlFor="settings-city" className={labelClass}>
                      Commune / Ville *
                    </label>
                    <input
                      id="settings-city"
                      type="text"
                      value={settings.city}
                      onChange={(e) => updateProfileField({ city: e.target.value })}
                      placeholder="ex. Lyon"
                      className={inputClass}
                    />
                    {errors.city && <p className="text-[11px] text-red-400 mt-1">{errors.city}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="settings-phone" className={labelClass}>
                      Téléphone
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        id="settings-phone"
                        type="tel"
                        value={settings.phone}
                        onChange={(e) => updateProfileField({ phone: e.target.value })}
                        placeholder="ex. 06 12 34 56 78"
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="settings-email" className={labelClass}>
                      Adresse E-mail *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        id="settings-email"
                        type="email"
                        value={settings.email}
                        onChange={(e) => updateProfileField({ email: e.target.value })}
                        placeholder="ex. contact@mongarage.fr"
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                    {errors.email && <p className="text-[11px] text-red-400 mt-1">{errors.email}</p>}
                  </div>
                </div>

                {activeProfileType === 'micro_entrepreneur' && (
                  <div>
                    <label htmlFor="settings-legal-form" className={labelClass}>
                      {L('Statut / Mention activité', 'Юридическая отметка', 'Իրավական նշում', 'იურიდიული სტატუსი')}
                    </label>
                    <div className="relative">
                      <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        id="settings-legal-form"
                        type="text"
                        value={settings.legalForm || ''}
                        onChange={(e) => updateProfileField({ legalForm: e.target.value })}
                        placeholder="ex. Micro-entrepreneur"
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <p>
                    {L(
                      'Ces coordonnées pré-remplissent automatiquement la section 2 (Ancien propriétaire) du Cerfa 15776*02 sans rechargement.',
                      'Сохранение автоматически обновляет Раздел 2 (Ancien propriétaire) в мастере и PDF-генераторе Cerfa 15776*02.',
                      'Պահպանումը ավտոմատ թարմացնում է Cerfa 15776*02-ի Բաժին 2-ը։',
                      'შენახვა ავტომატურად განაახლებს Cerfa 15776*02-ის მე-2 ნაწილს.'
                    )}
                  </p>
                </div>
              </form>
            )}

            {/* 2. DOCUMENT TEMPLATES & CERFA */}
            {activeTab === 'templates' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {L('Modèles & Paramètres Cerfa', 'Бланки и Настройки Cerfa', 'Cerfa ձևաթղթեր և կարգավորումներ', 'Cerfa ბლანკები და პარამეტრები')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {L(
                      'Configuration du formulaire Cerfa par défaut et calibration de l’impression PDF.',
                      'Выбор официального бланка по умолчанию и калибровка смещения PDF.',
                      'Լռելյայն Cerfa ձևաթղթի ընտրություն և PDF տպագրության կարգավորում։',
                      'ნაგულისხმევი Cerfa ბლანკის არჩევა და PDF ბეჭდვის კალიბრაცია.'
                    )}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {L('Modèle Cerfa par défaut', 'Шаблон Cerfa по умолчанию', 'Լռելյայն Cerfa ձևաթուղթ', 'ნაგულისხმევი Cerfa შაბლონი')}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {L(
                        'Formulaire gouvernemental officiel utilisé pour la génération des certificats de cession',
                        'Официальный правительственный бланк для оформления продажи автомобиля',
                        'Պաշտոնական ձևաթուղթ ավտոմեքենայի վաճառքի ձևակերպման համար',
                        'ოფიციალური სამთავრობო ფორმა ავტომობილის გაყიდვის გასაფორმებლად'
                      )}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="settings-cerfa-template" className={labelClass}>
                      {L('Modèle de document actif', 'Активный шаблон PDF', 'Ակտիվ PDF ձևաթուղթ', 'აქტიური PDF შაბლონი')}
                    </label>
                    <ThemedSelect
                      id="settings-cerfa-template"
                      testId="settings-cerfa-template-select"
                      ariaLabel={L('Modèle de document actif', 'Активный шаблон PDF', 'Ակտիվ PDF ձևաթուղթ', 'აქტიური PDF შაბლონი')}
                      value={settings.defaultCerfaTemplate || 'cerfa_15776_02'}
                      onChange={(val) =>
                        setSettings({ ...settings, defaultCerfaTemplate: val })
                      }
                      options={[
                        {
                          value: 'cerfa_15776_02',
                          label: "Cerfa N° 15776*02 — Certificat de cession d'un véhicule d'occasion (Officiel)",
                        },
                      ]}
                      triggerClassName={inputClass}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 max-w-md">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span>
                          {L(
                            'Calibration globale Cerfa (Superadmin)',
                            'Глобальная калибровка Cerfa (Superadmin)',
                            'Cerfa գլոբալ կարգավորում (Superadmin)',
                            'Cerfa გლობალური კალიბრაცია (Superadmin)'
                          )}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        {L(
                          'Les coordonnées et décalages sont synchronisés depuis le cloud (platform_settings/cerfa_templates) pour l’aperçu et l’export PDF.',
                          'Координаты полей и смещения автоматически синхронизируются из облака для предпросмотра и PDF-экспорта.',
                          'Դաշտերի կոորդինատները համաժամեցվում են ամպից նախադիտման և PDF արտահանման համար։',
                          'ველების კოორდინატები სინქრონიზდება ღრუბლიდან წინასწარი ნახვისა და PDF ექსპორტისთვის.'
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      data-testid="settings-open-cerfa-preview-btn"
                      onClick={() => {
                        if (onOpenAlignerMode) {
                          onClose();
                          onOpenAlignerMode();
                        }
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-2 shadow-lg shadow-blue-600/20"
                    >
                      <span>{L('Aperçu & Export Cerfa', 'Предпросмотр и экспорт Cerfa', 'Cerfa նախադիտում և արտահանում', 'Cerfa ნახვა და ექსპორტი')}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-500 block">Offset X</span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {cerfaCalibration.cerfa_15776_02.offsets.offsetX} pt
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-500 block">Offset Y</span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {cerfaCalibration.cerfa_15776_02.offsets.offsetY} pt
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-500 block">{L('Police Δ', 'Шрифт Δ', 'Տառաչափ Δ', 'შრიფტი Δ')}</span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {cerfaCalibration.cerfa_15776_02.offsets.fontSizeDelta} pt
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. FINANCE & PROFILE-AWARE ESTIMATES */}
            {activeTab === 'finance' && (() => {
              const simPnl = calculateVehicleProfitBeforeTaxes({
                salePrice: simSale,
                purchasePrice: simPurchase,
                repairCostTotal: simRepairs,
                generalExpensesTotal: 0,
              });
              const simMicro = calculateMicroEntrepriseTaxes({
                turnover: simSale,
                config: taxConfig,
              });
              const simNetAfterTaxes = roundCurrency(
                simPnl.profitBeforeTaxes - simMicro.totalSocialAndVlAmount
              );
              const combinedMicroRate = roundCurrency(
                taxConfig.socialContributionRate +
                  (taxConfig.versementLiberatoireEnabled ? taxConfig.versementLiberatoireRate : 0)
              );

              return (
                <div className="space-y-4" data-testid="settings-finance-panel">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {L(
                          'Finances & Mode de calcul',
                          'Финансы и режим расчётов',
                          'Ֆինանսներ և հաշվարկի ռեժիմ',
                          'ფინანსები და გამოთვლის რეჟიმი'
                        )}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {activeProfileType === 'particulier'
                          ? L(
                              'Mode Particulier : suivi simple achat, dépenses, vente et résultat net sans calculs fiscaux professionnels.',
                              'Режим Particulier: простой расчёт покупки, расходов, продажи и результата без профессиональных налогов.',
                              'Particulier ռեժիմ․ գնման, ծախսերի, վաճառքի և արդյունքի պարզ հաշվարկ առանց պրոֆեսիոնալ հարկերի։',
                              'Particulier რეჟიმი: შესყიდვის, ხარჯების, გაყიდვისა და შედეგის მარტივი გათვლა პროფესიული გადასახადების გარეშე.'
                            )
                          : L(
                              'Mode Micro-entrepreneur : P&L simplifié sur chiffre d’affaires et estimation interne des cotisations.',
                              'Режим Micro-entrepreneur: упрощённый P&L от оборота и внутренняя оценка взносов.',
                              'Micro-entrepreneur ռեժիմ․ պարզեցված P&L շրջանառությունից և վճարումների ներքին գնահատական։',
                              'Micro-entrepreneur რეჟიმი: გამარტივებული P&L ბრუნვიდან და შენატანების შიდა შეფასება.'
                            )}
                      </p>
                    </div>

                    {/* Quick 2-Profile Switcher inside Finance */}
                    <div
                      data-testid="settings-finance-profile-switch"
                      className="inline-flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 gap-1"
                    >
                      <button
                        type="button"
                        data-testid="settings-finance-profile-particulier"
                        onClick={() => handleSelectProfileType('particulier')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          activeProfileType === 'particulier'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {t('profileBadgeParticulier')}
                      </button>
                      <button
                        type="button"
                        data-testid="settings-finance-profile-micro"
                        onClick={() => handleSelectProfileType('micro_entrepreneur')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          activeProfileType === 'micro_entrepreneur'
                            ? 'bg-amber-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {t('profileBadgeMicro')}
                      </button>
                    </div>
                  </div>

                  {activeProfileType === 'particulier' ? (
                    /* PARTICULIER: Clean financial formula + Margin & Currency only — ZERO URSSAF / TVA / IS */
                    <div
                      data-testid="settings-particulier-finance-card"
                      className="p-4 rounded-2xl bg-slate-900 border border-blue-500/30 space-y-4"
                    >
                      <div className="flex items-start gap-2.5">
                        <User className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white">
                            {t('profileParticulierTitle')} — {L('Calcul financier simple', 'Простой финансовый расчёт', 'Պարզ ֆինանսական հաշվարկ', 'მარტივი ფინანსური გათვლა')}
                          </h4>
                          <p className="text-xs text-slate-300">
                            {L(
                              'Formule appliquée : Prix de vente − Prix d’achat − Réparations & Dépenses = Résultat net. Aucune cotisation URSSAF ni TVA n’est calculée.',
                              'Формула расчёта: Цена продажи − Покупка − Ремонт и расходы = Финансовый результат. Взносы URSSAF и TVA не применяются.',
                              'Բանաձև՝ Վաճառքի գին − Գնում − Վերանորոգում և ծախսեր = Արդյունք։ URSSAF և TVA չեն հաշվարկվում։',
                              'ფორმულა: გაყიდვის ფასი − შესყიდვა − რემონტი და ხარჯები = ფინანსური შედეგი. URSSAF და TVA არ ითვლება.'
                            )}
                          </p>
                          <p className="text-[11px] text-emerald-300/90">
                            {t('profileNonDestructiveNotice')}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                        <div>
                          <label htmlFor="settings-default-margin" className={labelClass}>
                            {L('Marge cible indicative (%)', 'Целевой ориентир маржи (%)', 'Նպատակային մարժա (%)', 'სამიზნე მარჟა (%)')}
                          </label>
                          <input
                            id="settings-default-margin"
                            type="number"
                            min={0}
                            max={200}
                            step="any"
                            value={settings.defaultMarginPercent ?? 20}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                defaultMarginPercent: Number(e.target.value) || 0,
                              })
                            }
                            className={`${inputClass} tabular-nums font-bold`}
                          />
                        </div>

                        <div>
                          <label htmlFor="settings-currency" className={labelClass}>
                            {L('Devise d’affichage', 'Валюта расчётов', 'Արժույթ', 'ვალუტა')}
                          </label>
                          <ThemedSelect<NonNullable<GarageSettings['currency']>>
                            id="settings-currency"
                            testId="settings-currency-select"
                            ariaLabel={L('Devise d’affichage', 'Валюта расчётов', 'Արժույթ', 'ვალუტა')}
                            value={settings.currency || 'EUR'}
                            onChange={(val) =>
                              setSettings({
                                ...settings,
                                currency: val,
                              })
                            }
                            options={[
                              { value: 'EUR', label: 'EUR (€) — Euro' },
                              { value: 'CHF', label: 'CHF — Franc suisse' },
                              { value: 'GBP', label: 'GBP (£) — Livre sterling' },
                              { value: 'USD', label: 'USD ($) — Dollar US' },
                            ]}
                            triggerClassName={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* MICRO-ENTREPRENEUR: Internal estimate banner + clean summary + collapsed-by-default detailed accordion */
                    <>
                      <div
                        data-testid="settings-tax-disclaimer"
                        className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200"
                      >
                        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                              {t('taxEstimateBadge')}
                            </span>
                            <span className="font-semibold text-amber-100">
                              {t('taxEstimateDisclaimerShort')}
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-200/80">
                            {L(
                              FRENCH_TAX_DEFAULTS.DISCLAIMER_FR,
                              FRENCH_TAX_DEFAULTS.DISCLAIMER_RU,
                              FRENCH_TAX_DEFAULTS.DISCLAIMER_HY,
                              FRENCH_TAX_DEFAULTS.DISCLAIMER_KA
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Simplified P&L Overview + Currency/Margin */}
                      <div
                        data-testid="settings-micro-summary-card"
                        className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-white">
                              {t('profileMicroTitle')} — {L('Synthèse P&L simplifiée', 'Упрощённый расчёт P&L', 'Պարզեցված P&L ամփոփում', 'გამარტივებული P&L შეჯამება')}
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {L(
                                'Basé sur le chiffre d’affaires (prix de vente). Ajustez les taux précis dans le panneau avancé ci-dessous si besoin.',
                                'Расчёт по обороту (цене продажи). При необходимости измените ставки в раскрывающемся разделе ниже.',
                                'Հաշվարկը կատարվում է շրջանառությունից (վաճառքի գնից)։ Դրույքաչափերը կարող եք փոխել ստորև։',
                                'გამოთვლა ეფუძნება ბრუნვას (გაყიდვის ფასს). ზუსტი განაკვეთების შეცვლა შეგიძლიათ ქვემოთ.'
                              )}
                            </p>
                          </div>
                          <span
                            data-testid="settings-micro-combined-badge"
                            className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30 tabular-nums"
                          >
                            {L(
                              `Taux CA estimé : ${combinedMicroRate}%`,
                              `Ставка от оборота: ${combinedMicroRate}%`,
                              `Շրջանառության դրույք՝ ${combinedMicroRate}%`,
                              `ბრუნვის განაკვეთი: ${combinedMicroRate}%`
                            )}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label htmlFor="settings-default-margin" className={labelClass}>
                              {L('Marge cible par défaut (%)', 'Целевая маржа по умолчанию (%)', 'Լռելյայն նպատակային մարժա (%)', 'ნაგულისხმევი სამიზნე მარჟა (%)')}
                            </label>
                            <input
                              id="settings-default-margin"
                              type="number"
                              min={0}
                              max={200}
                              step="any"
                              value={settings.defaultMarginPercent ?? 20}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  defaultMarginPercent: Number(e.target.value) || 0,
                                })
                              }
                              className={`${inputClass} tabular-nums font-bold`}
                            />
                          </div>

                          <div>
                            <label htmlFor="settings-currency" className={labelClass}>
                              {L('Devise principale', 'Валюта расчётов', 'Հիմնական արժույթ', 'ძირითადი ვალუტა')}
                            </label>
                            <ThemedSelect<NonNullable<GarageSettings['currency']>>
                              id="settings-currency"
                              testId="settings-currency-select"
                              ariaLabel={L('Devise principale', 'Валюта расчётов', 'Հիմնական արժույթ', 'ძირითადი ვალუტა')}
                              value={settings.currency || 'EUR'}
                              onChange={(val) =>
                                setSettings({
                                  ...settings,
                                  currency: val,
                                })
                              }
                              options={[
                                { value: 'EUR', label: 'EUR (€) — Euro' },
                                { value: 'CHF', label: 'CHF — Franc suisse' },
                                { value: 'GBP', label: 'GBP (£) — Livre sterling' },
                                { value: 'USD', label: 'USD ($) — Dollar US' },
                              ]}
                              triggerClassName={inputClass}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Collapsed-by-default Advanced Tax & TVA Accordion */}
                      <div
                        data-testid="settings-advanced-tax-accordion"
                        className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden"
                      >
                        <button
                          type="button"
                          data-testid="settings-advanced-tax-toggle"
                          aria-expanded={isAdvancedTaxOpen}
                          onClick={() => setIsAdvancedTaxOpen((prev) => !prev)}
                          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-800/40 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Calculator className="w-4 h-4 text-amber-400 shrink-0" />
                            <div className="min-w-0">
                              <span className="block text-xs sm:text-sm font-bold text-white truncate">
                                {t('taxAdvancedAccordionTitle')}
                              </span>
                              <span className="block text-[11px] text-slate-400 truncate">
                                URSSAF {taxConfig.socialContributionRate}% •{' '}
                                {taxConfig.versementLiberatoireEnabled
                                  ? `VL +${taxConfig.versementLiberatoireRate}%`
                                  : L('IR Micro-BIC séparé', 'IR Micro-BIC отдельно', 'IR Micro-BIC առանձին', 'IR Micro-BIC ცალკე')}
                              </span>
                            </div>
                          </div>
                          {isAdvancedTaxOpen ? (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                        </button>

                        {isAdvancedTaxOpen && (
                          <div
                            data-testid="settings-advanced-tax-body"
                            className="px-4 pb-4 pt-2 border-t border-slate-800 space-y-4"
                          >
                            {/* URSSAF & Versement Libératoire */}
                            <div
                              data-testid="settings-micro-panel"
                              className="p-4 rounded-xl bg-slate-950/70 border border-amber-500/25 space-y-3"
                            >
                              <div>
                                <h4 className="text-xs font-bold text-white">
                                  {L(
                                    'Micro-entreprise — Achat / Revente (estimation sur CA)',
                                    'Micro-entreprise — Achat / Revente (оценка по обороту CA)',
                                    'Micro-entreprise — Առք / Վաճառք (շրջանառությունից)',
                                    'Micro-entreprise — ყიდვა / გაყიდვა (ბრუნვიდან)'
                                  )}
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {L(
                                    'Les cotisations URSSAF (12,3% par défaut) et le Versement libératoire (1% optionnel) s’appliquent au chiffre d’affaires encaissé.',
                                    'Взносы URSSAF (по умолч. 12.3%) и Versement libératoire (1% опционально) рассчитываются от цены продажи (CA).',
                                    'URSSAF (լռելյայն 12.3%) և Versement libératoire (1% ըստ ընտրության) հաշվարկվում են շրջանառությունից։',
                                    'URSSAF (ნაგულისხმევი 12.3%) და Versement libératoire (1% არჩევითი) ითვლება გაყიდვის ბრუნვიდან.'
                                  )}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label htmlFor="settings-urssaf-rate" className={labelClass}>
                                    {L('Cotisations URSSAF (%)', 'Соцвзносы URSSAF (%)', 'URSSAF վճարումներ (%)', 'URSSAF შენატანები (%)')}
                                  </label>
                                  <input
                                    id="settings-urssaf-rate"
                                    data-testid="settings-urssaf-rate-input"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.1"
                                    value={taxConfig.socialContributionRate}
                                    onChange={(e) =>
                                      updateTaxConfig({
                                        socialContributionRate: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                    className={`${inputClass} tabular-nums font-bold`}
                                  />
                                </div>

                                <div>
                                  <span className={labelClass}>
                                    {L('Versement libératoire', 'Versement libératoire (1%)', 'Versement libératoire', 'Versement libératoire')}
                                  </span>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      data-testid="settings-vl-yes"
                                      onClick={() => updateTaxConfig({ versementLiberatoireEnabled: true })}
                                      className={`h-9 px-3 rounded-xl text-xs font-bold border transition ${
                                        taxConfig.versementLiberatoireEnabled
                                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                                      }`}
                                    >
                                      {L('OUI', 'ДА', 'ԱՅՈ', 'დიახ')}
                                    </button>
                                    <button
                                      type="button"
                                      data-testid="settings-vl-no"
                                      onClick={() => updateTaxConfig({ versementLiberatoireEnabled: false })}
                                      className={`h-9 px-3 rounded-xl text-xs font-bold border transition ${
                                        !taxConfig.versementLiberatoireEnabled
                                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                                      }`}
                                    >
                                      {L('NON', 'НЕТ', 'ՈՉ', 'არა')}
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <label htmlFor="settings-vl-rate" className={labelClass}>
                                    {L('Taux VL (%)', 'Ставка VL (%)', 'VL դրույք (%)', 'VL განაკვეთი (%)')}
                                  </label>
                                  <input
                                    id="settings-vl-rate"
                                    data-testid="settings-vl-rate-input"
                                    type="number"
                                    min={0}
                                    max={50}
                                    step="0.1"
                                    disabled={!taxConfig.versementLiberatoireEnabled}
                                    value={taxConfig.versementLiberatoireRate}
                                    onChange={(e) =>
                                      updateTaxConfig({
                                        versementLiberatoireRate: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                    className={`${inputClass} tabular-nums font-bold disabled:opacity-45`}
                                  />
                                </div>
                              </div>

                              {!taxConfig.versementLiberatoireEnabled && (
                                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                                  <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                                    <Info className="w-4 h-4 shrink-0" />
                                    <span>
                                      {L(
                                        'Versement libératoire désactivé : seul le taux URSSAF est appliqué. L’impôt sur le revenu Micro-BIC est estimé séparément (sans +1%).',
                                        'Versement libératoire отключён: применяется только ставка URSSAF. Подоходный налог Micro-BIC оценивается отдельно (без +1%).',
                                        'Versement libératoire-ն անջատված է՝ կիրառվում է միայն URSSAF-ը։ Micro-BIC եկամտահարկը գնահատվում է առանձին։',
                                        'Versement libératoire გამორთულია: გამოიყენება მხოლოდ URSSAF. Micro-BIC საშემოსავლო გადასახადი ითვლება ცალკე.'
                                      )}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label htmlFor="settings-micro-abattement" className={labelClass}>
                                        {L(
                                          'Abattement forfaitaire Micro-BIC (%)',
                                          'Вычет Micro-BIC Achat/Revente (%)',
                                          'Micro-BIC նվազեցում (%)',
                                          'Micro-BIC გამოქვითვა (%)'
                                        )}
                                      </label>
                                      <input
                                        id="settings-micro-abattement"
                                        type="number"
                                        min={0}
                                        max={100}
                                        step="1"
                                        value={taxConfig.microBicAbattementPercent}
                                        onChange={(e) =>
                                          updateTaxConfig({
                                            microBicAbattementPercent: Math.min(
                                              100,
                                              Math.max(0, Number(e.target.value) || 0)
                                            ),
                                          })
                                        }
                                        className={`${inputClass} tabular-nums font-bold`}
                                      />
                                    </div>
                                    <div>
                                      <label htmlFor="settings-micro-ir-rate" className={labelClass}>
                                        {L(
                                          'Taux marginal IR estimé (%)',
                                          'Оценочная ставка подоходного IR (%)',
                                          'Գնահատված IR դրույք (%)',
                                          'სავარაუდო IR განაკვეთი (%)'
                                        )}
                                      </label>
                                      <input
                                        id="settings-micro-ir-rate"
                                        type="number"
                                        min={0}
                                        max={60}
                                        step="0.5"
                                        value={taxConfig.microBicIncomeTaxRate}
                                        onChange={(e) =>
                                          updateTaxConfig({
                                            microBicIncomeTaxRate: Math.max(0, Number(e.target.value) || 0),
                                          })
                                        }
                                        className={`${inputClass} tabular-nums font-bold`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div>
                                <label htmlFor="settings-urssaf-effective-date" className={labelClass}>
                                  {L('Date d’effet (URSSAF)', 'Дата вступления в силу (URSSAF)', 'Գործողության ամսաթիվ (URSSAF)', 'ძალაში შესვლის თარიღი (URSSAF)')}
                                </label>
                                <input
                                  id="settings-urssaf-effective-date"
                                  type="date"
                                  value={taxConfig.effectiveDates.urssaf || getTodayIsoDate()}
                                  onChange={(e) =>
                                    updateTaxConfig({
                                      effectiveDates: {
                                        ...taxConfig.effectiveDates,
                                        urssaf: e.target.value,
                                      },
                                    })
                                  }
                                  className={`${inputClass} sm:max-w-xs`}
                                />
                              </div>
                            </div>

                            {/* Live Interactive Micro-entrepreneur Simulator */}
                            <div
                              data-testid="settings-tax-simulator"
                              className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Calculator className="w-4 h-4 text-amber-400" />
                                  <h4 className="text-xs font-bold text-white">
                                    {L(
                                      'Simulateur en direct (Estimation interne)',
                                      'Симулятор сделки (Внутренняя оценка)',
                                      'Գործարքի սիմուլյատոր (Ներքին գնահատական)',
                                      'გარიგების სიმულატორი (შიდა შეფასება)'
                                    )}
                                  </h4>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  {t('taxEstimateBadge')}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label htmlFor="sim-purchase" className={labelClass}>
                                    {L('Achat véhicule (€)', 'Покупка авто (€)', 'Գնում (€)', 'შესყიდვა (€)')}
                                  </label>
                                  <input
                                    id="sim-purchase"
                                    data-testid="sim-purchase-input"
                                    type="number"
                                    value={simPurchase}
                                    onChange={(e) => setSimPurchase(Math.max(0, Number(e.target.value) || 0))}
                                    className={`${inputClass} tabular-nums font-bold`}
                                  />
                                </div>
                                <div>
                                  <label htmlFor="sim-repairs" className={labelClass}>
                                    {L('Réparations & frais (€)', 'Ремонт и расходы (€)', 'Վերանորոգում և ծախսեր (€)', 'რემონტი და ხარჯები (€)')}
                                  </label>
                                  <input
                                    id="sim-repairs"
                                    data-testid="sim-repairs-input"
                                    type="number"
                                    value={simRepairs}
                                    onChange={(e) => setSimRepairs(Math.max(0, Number(e.target.value) || 0))}
                                    className={`${inputClass} tabular-nums font-bold`}
                                  />
                                </div>
                                <div>
                                  <label htmlFor="sim-sale" className={labelClass}>
                                    {L('Prix de vente (€ TTC)', 'Цена продажи (€ TTC)', 'Վաճառքի գին (€ TTC)', 'გაყიდვის ფასი (€ TTC)')}
                                  </label>
                                  <input
                                    id="sim-sale"
                                    data-testid="sim-sale-input"
                                    type="number"
                                    value={simSale}
                                    onChange={(e) => setSimSale(Math.max(0, Number(e.target.value) || 0))}
                                    className={`${inputClass} tabular-nums font-bold`}
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                                  <span className="text-[11px] text-slate-400 block">
                                    {L('Profit avant taxes', 'Прибыль до налогов', 'Շահույթ մինչև հարկերը', 'მოგება გადასახადებამდე')}
                                  </span>
                                  <span
                                    data-testid="sim-profit-before-tax"
                                    className={`font-extrabold tabular-nums ${
                                      simPnl.profitBeforeTaxes >= 0 ? 'text-emerald-400' : 'text-red-400'
                                    }`}
                                  >
                                    {simPnl.profitBeforeTaxes.toLocaleString(intlLocale)} €
                                  </span>
                                </div>

                                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                                  <span className="text-[11px] text-slate-400 block">
                                    URSSAF ({taxConfig.socialContributionRate}% CA)
                                  </span>
                                  <span
                                    data-testid="sim-urssaf-amount"
                                    className="font-extrabold text-amber-400 tabular-nums"
                                  >
                                    {simMicro.urssafAmount.toLocaleString(intlLocale)} €
                                  </span>
                                </div>

                                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                                  <span className="text-[11px] text-slate-400 block">
                                    {taxConfig.versementLiberatoireEnabled
                                      ? `VL (${taxConfig.versementLiberatoireRate}% CA)`
                                      : L('IR Micro-BIC séparé', 'IR отд. (Micro-BIC)', 'IR առանձին', 'IR ცალკე')}
                                  </span>
                                  <span
                                    data-testid="sim-vl-or-ir-amount"
                                    className="font-extrabold text-sky-400 tabular-nums"
                                  >
                                    {(taxConfig.versementLiberatoireEnabled
                                      ? simMicro.versementLiberatoireAmount
                                      : simMicro.separateMicroBicIncomeTax
                                    ).toLocaleString(intlLocale)}{' '}
                                    €
                                  </span>
                                </div>

                                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                                  <span className="text-[11px] text-slate-400 block">
                                    {L('Net estimé après cotisations', 'Оценочный чистый результат', 'Գնահատված զուտ արդյունք', 'სავარაუდო წმინდა შედეგი')}
                                  </span>
                                  <span
                                    data-testid="sim-net-after-tax"
                                    className={`font-extrabold tabular-nums ${
                                      simNetAfterTaxes >= 0 ? 'text-emerald-400' : 'text-red-400'
                                    }`}
                                  >
                                    {simNetAfterTaxes >= 0 ? '+' : ''}
                                    {simNetAfterTaxes.toLocaleString(intlLocale)} €
                                  </span>
                                </div>
                              </div>
                            </div>

                            {settings.taxAuditHistory && settings.taxAuditHistory.length > 0 && (
                              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-white">
                                  <History className="w-4 h-4 text-amber-400" />
                                  <span>
                                    {L(
                                      'Journal des modifications de paramètres',
                                      'Журнал изменений параметров',
                                      'Կարգավորումների փոփոխությունների մատյան',
                                      'პარამეტრების ცვლილებების ჟურნალი'
                                    )}
                                  </span>
                                </div>
                                {settings.taxAuditHistory.slice(0, 5).map((audit) => (
                                  <div
                                    key={audit.id}
                                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-0.5"
                                  >
                                    <div className="flex items-center justify-between text-slate-400">
                                      <span>{audit.actorEmail}</span>
                                      <span>{audit.timestamp.slice(0, 16).replace('T', ' ')}</span>
                                    </div>
                                    <p className="text-slate-200 truncate">{audit.summary}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Backup & Data Export */}
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {L('Export comptable & Sauvegarde', 'Экспорт и резервное копирование', 'Արտահանում և պահուստավորում', 'ექსპორტი და სარეზერვო ასლი')}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {L(
                          'Exportez vos véhicules et bilans en JSON ou CSV.',
                          'Выгрузите базу автомобилей в JSON или CSV.',
                          'Արտահանեք ավտոմեքենաների բազան JSON կամ CSV ձևաչափով։',
                          'გაატანეთ ავტომობილების ბაზა JSON ან CSV ფორმატში.'
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={handleExportJson}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>{L('Exporter Base (JSON)', 'Экспорт БД (JSON)', 'Արտահանել (JSON)', 'ექსპორტი (JSON)')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportCsv}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition flex items-center gap-2 border border-slate-700"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        <span>{L('Exporter Véhicules (CSV)', 'Экспорт авто (CSV)', 'Արտահանել (CSV)', 'ექსპორტი (CSV)')}</span>
                      </button>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleImportJson}
                        className="hidden"
                        id="settings-import-json-input"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition flex items-center gap-2 border border-slate-700"
                      >
                        <Upload className="w-4 h-4 text-amber-400" />
                        <span>{L('Importer Base (JSON)', 'Импорт БД (JSON)', 'Ներմուծել (JSON)', 'იმპორტი (JSON)')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 4. APPEARANCE */}
            {activeTab === 'appearance' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {L('Apparence & Affichage', 'Внешний вид', 'Արտաքին տեսք', 'გარეგნობა და ჩვენება')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {L(
                      'Préférence de thème, langue de l’interface et vue par défaut du parc.',
                      'Выбор темы, языка интерфейса и вида автопарка по умолчанию.',
                      'Թեմայի, ինտերֆեյսի լեզվի և լռելյայն տեսքի ընտրություն։',
                      'თემის, ინტერფეისის ენისა და ნაგულისხმევი ხედის არჩევა.'
                    )}
                  </p>
                </div>

                {/* Theme Card */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    {theme === 'dark' ? (
                      <Moon className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Sun className="w-4 h-4 text-amber-500" />
                    )}
                    <span>{L('Thème d’affichage', 'Тема оформления', 'Թեմա', 'თემა')}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:max-w-md gap-2">
                    <button
                      type="button"
                      data-testid="settings-theme-dark"
                      onClick={() => onThemeChange('dark')}
                      className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark Mode</span>
                    </button>
                    <button
                      type="button"
                      data-testid="settings-theme-light"
                      onClick={() => onThemeChange('light')}
                      className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        theme === 'light'
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>Light Mode</span>
                    </button>
                  </div>
                </div>

                {/* 4-Language Interface Card */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Languages className="w-4 h-4 text-blue-400" />
                    <span>{L('Langue de l’interface', 'Язык интерфейса', 'Ինտերֆեյսի լեզուն', 'ინტერფეისის ენა')}</span>
                  </div>
                  <div
                    data-testid="settings-language-grid"
                    className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                  >
                    {SUPPORTED_LANGUAGES.map((option) => {
                      const active = lang === option.code;
                      return (
                        <button
                          key={option.code}
                          type="button"
                          data-testid={`settings-lang-${option.code}`}
                          onClick={() => setLang(option.code)}
                          className={`h-9 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          <span aria-hidden="true">{LANGUAGE_FLAGS[option.code]}</span>
                          <span className="truncate">
                            {option.nativeLabel} ({option.shortCode})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Layout Switcher: Classic Top-Nav vs Modern Sidebar Layout */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <PanelLeft className="w-4 h-4 text-amber-400" />
                      <span>
                        {L(
                          'Disposition de l’interface',
                          'Макет интерфейса (Layout)',
                          'Ինտերֆեյսի դասավորություն',
                          'ინტერფეისის განლაგება'
                        )}
                      </span>
                    </div>
                    {layoutPreference !== 'global' && onLayoutPreferenceChange && (
                      <button
                        type="button"
                        onClick={() => {
                          onLayoutPreferenceChange('global');
                          setStatusMessage({
                            type: 'success',
                            text: L(
                              'Réinitialisé sur la disposition globale.',
                              'Сброшено к глобальному макету платформы.',
                              'Վերականգնված է գլոբալ դասավորությունը։',
                              'აღდგენილია გლობალური განლაგება.'
                            ),
                          });
                        }}
                        className="text-[11px] font-semibold text-amber-400 hover:underline"
                      >
                        {L(
                          `Par défaut (${globalLayoutMode === 'sidebar' ? 'Sidebar' : 'Classique'})`,
                          `По умолчанию (${globalLayoutMode === 'sidebar' ? 'Sidebar' : 'Classic'})`,
                          `Լռելյայն (${globalLayoutMode === 'sidebar' ? 'Sidebar' : 'Classic'})`,
                          `ნაგულისხმევი (${globalLayoutMode === 'sidebar' ? 'Sidebar' : 'Classic'})`
                        )}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      data-testid="settings-layout-classic"
                      onClick={() => {
                        onLayoutPreferenceChange?.('classic');
                        setStatusMessage({
                          type: 'success',
                          text: L(
                            'Disposition classique (Top-Nav) activée.',
                            'Включён классический макет (Top-Nav).',
                            'Դասական տեսքը միացված է։',
                            'კლასიკური განლაგება ჩართულია.'
                          ),
                        });
                      }}
                      className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer ${
                        effectiveLayoutMode === 'classic'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <PanelTop className="w-3.5 h-3.5" />
                      <span>{L('En-tête Classique', 'Классическая шапка', 'Դասական վերնագիր', 'კლასიკური მენიუ')}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="settings-layout-sidebar"
                      onClick={() => {
                        onLayoutPreferenceChange?.('sidebar');
                        setStatusMessage({
                          type: 'success',
                          text: L(
                            'Nouveau design (Sidebar Layout) activé.',
                            'Включён новый дизайн (Sidebar Layout).',
                            'Կողմնային ընտրացանկը միացված է։',
                            'გვერდითი მენიუ ჩართულია.'
                          ),
                        });
                      }}
                      className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer ${
                        effectiveLayoutMode === 'sidebar'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <PanelLeft className="w-3.5 h-3.5" />
                      <span>{L('Nouveau Design (Sidebar)', 'Новый дизайн (Sidebar)', 'Նոր դիզայն (Sidebar)', 'ახალი დიზაინი (Sidebar)')}</span>
                    </button>
                  </div>
                </div>

                {/* Compact Grid / List Default View */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold text-white">
                    {L(
                      'Mode d’affichage par défaut du parc',
                      'Режим отображения инвентаря по умолчанию',
                      'Ավտոպարկի լռելյայն տեսքը',
                      'ავტოპარკის ნაგულისხმევი ხედი'
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('grid')}
                      className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer ${
                        defaultViewMode === 'grid'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>{L('Grille Compacte (Grid)', 'Компактная сетка (Grid)', 'Ցանց (Grid)', 'ბადე (Grid)')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('list')}
                      className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer ${
                        defaultViewMode === 'list'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>{L('Vue Liste (Tableau)', 'Табличный список (List)', 'Ցանկ (List)', 'ცხრილი (List)')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4B. SUBSCRIPTION & PLAN MANAGEMENT */}
            {activeTab === 'subscription' && (
              <SubscriptionPlanTab
                userId={resolvedUserId}
                userProfile={userProfile}
                plans={subscriptionPlans}
                activeVehiclesCount={allVehiclesCount ?? vehicles.length}
                onPlanUpdated={(updated) => {
                  onPlanUpdated?.(updated);
                }}
                onNotify={(type, text) => {
                  setStatusMessage({ type, text });
                  if (type === 'success') {
                    onSubscriptionToast?.(text);
                  }
                }}
              />
            )}

            {/* 5. SECURITY & ACCOUNT */}
            {activeTab === 'security' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {L('Sécurité & Compte', 'Безопасность и Аккаунт', 'Անվտանգություն և հաշիվ', 'უსაფრთხოება და ანგარიში')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {L(
                      'Gestion du mot de passe, rôle d’accès, session active et cache local.',
                      'Управление паролем, ролью доступа, активной сессией и локальным кэшем.',
                      'Գաղտնաբառի, մուտքի դերի և տեղային քեշի կառավարում։',
                      'პაროლის, წვდომის როლის და ლოკალური ქეშის მართვა.'
                    )}
                  </p>
                </div>

                {/* Account & Role Card */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-slate-400 block">
                        {L('Compte actif', 'Активный аккаунт', 'Ակտիվ հաշիվ', 'აქტიური ანგარიში')}
                      </span>
                      <span className="text-sm font-bold text-white">{resolvedEmail}</span>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        userRole === 'superadmin'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                      }`}
                    >
                      {userRole === 'superadmin'
                        ? 'SUPERADMIN'
                        : activeProfileType === 'particulier'
                        ? t('profileBadgeParticulier')
                        : t('profileBadgeMicro')}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">
                      {L(
                        'Envoyer un lien de réinitialisation de mot de passe par e-mail',
                        'Отправить ссылку для смены пароля на ваш Email',
                        'Ուղարկել գաղտնաբառի փոփոխման հղումը էլ․ փոստով',
                        'გააგზავნეთ პაროლის აღდგენის ბმული ელფოსტაზე'
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>{L('Réinitialiser mot de passe', 'Сменить пароль', 'Փոխել գաղտնաբառը', 'პაროლის შეცვლა')}</span>
                    </button>
                  </div>
                </div>

                {/* Clear Local Cache with inline confirmation */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-white">
                    {L('Réinitialisation du cache local', 'Сброс локального кэша', 'Տեղային քեշի մաքրում', 'ლოკალური ქეშის განულება')}
                  </h4>
                  {!confirmClearCache ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearCache(true)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{L('Vider le cache local', 'Очистить локальный кэш', 'Մաքրել տեղային քեշը', 'ლოკალური ქეშის გასუფთავება')}</span>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-red-300 font-semibold">
                        {L(
                          'Confirmer la suppression du cache local (véhicules, dépenses, paramètres) ?',
                          'Подтвердить удаление локальных данных (авто, расходы, настройки)?',
                          'Հաստատե՞լ տեղային տվյալների ջնջումը։',
                          'დავადასტუროთ ლოკალური მონაცემების წაშლა?'
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmClearCache(false)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white"
                        >
                          {L('Annuler', 'Отмена', 'Չեղարկել', 'გაუქმება')}
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmClearCache}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white"
                        >
                          {L('Confirmer', 'Да, очистить', 'Հաստատել', 'დადასტურება')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
    </>
  );

  if (isPage) {
    return (
      <div data-testid="settings-page-view" className="space-y-4">
        {/* Full-Page Header */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-[var(--foreground)]">
                  {L('Paramètres du Garage', 'Настройки гаража', 'Ավտոսրահի կարգավորումներ', 'გარაჟის პარამეტრები')}
                </h2>
                {settings.name?.trim() && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--primary)] truncate max-w-[200px]">
                    {settings.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {L(
                  'Profil (Particulier / Micro-entrepreneur), devise, Cerfa et sauvegarde',
                  'Профиль (Particulier / Micro-entrepreneur), валюта, Cerfa и резервное копирование',
                  'Պրոֆիլ (Particulier / Micro-entrepreneur), արժույթ, Cerfa և պահուստավորում',
                  'პროფილი (Particulier / Micro-entrepreneur), ვალუტა, Cerfa და სარეზერვო ასლი'
                )}
              </p>
            </div>
          </div>

          {activeTab !== 'subscription' && (
            <button
              type="button"
              data-testid="settings-page-save-top"
              onClick={() => handleSaveSettings()}
              className="h-9 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{L('Enregistrer les paramètres', 'Сохранить настройки', 'Պահպանել կարգավորումները', 'პარამეტრების შენახვა')}</span>
            </button>
          )}
        </div>

        {/* Full-Width Natural-Scrolling Workspace Content */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-4">
          {mainContent}

          {activeTab !== 'subscription' && (
            <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end">
              <button
                type="button"
                data-testid="settings-page-save-bottom"
                onClick={() => handleSaveSettings()}
                className="h-9 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{L('Enregistrer les paramètres', 'Сохранить настройки', 'Պահպանել կարգավորումները', 'პარამეტრების შენახვა')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-[var(--ag-modal-bg)] border border-slate-800 rounded-3xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col h-[92vh] max-h-[820px]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={L('Menu des paramètres', 'Меню настроек', 'Կարգավորումների մենյու', 'პარამეტრების მენიუ')}
              className="md:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-base sm:text-lg font-bold text-white">
                {L('Paramètres du Garage', 'Настройки гаража', 'Ավտոսրահի կարգավորումներ', 'გარაჟის პარამეტრები')}
              </h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {L(
                  'Profil, modèles Cerfa, finances, apparence et sécurité',
                  'Профиль, бланки Cerfa, финансы, внешний вид и безопасность',
                  'Պրոֆիլ, Cerfa ձևաթղթեր, ֆինանսներ և անվտանգություն',
                  'პროფილი, Cerfa ბლანკები, ფინანსები და უსაფრთხოება'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les paramètres"
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile/Tablet Compact Icon Bar */}
        <div className="md:hidden px-3 py-2 bg-slate-950/50 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-slate-300 border border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* 2-Column Body: Left Sidebar + Right Content Panel */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 relative overflow-hidden">
          {/* Mobile Slide-Out Drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden absolute inset-0 z-20 flex">
              <aside className="w-64 bg-slate-900 border-r border-slate-800 p-4 space-y-2 shadow-2xl">
                <p className="text-[11px] font-bold tracking-wider text-amber-400 px-2 pb-2 border-b border-slate-800">
                  {L('SECTIONS', 'РАЗДЕЛЫ НАСТРОЕК', 'ԲԱԺԻՆՆԵՐ', 'სექციები')}
                </p>
                <nav className="space-y-1" aria-label="Settings mobile navigation">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </aside>
              <div
                className="flex-1 bg-slate-950/60"
                onClick={() => setMobileMenuOpen(false)}
              />
            </div>
          )}

          {/* Desktop Fixed Left Sidebar */}
          <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-slate-900/95 border-r border-slate-800 p-4 space-y-4 overflow-y-auto">
            <div className="px-2 pb-2 border-b border-slate-800">
              <p className="text-[11px] font-bold tracking-wider text-amber-400">
                {L('CONFIGURATION', 'КОНФИГУРАЦИЯ', 'ԿԱՐԳԱՎՈՐՈՒՄ', 'კონფიგურაცია')}
              </p>
              <p className="text-xs font-bold text-white mt-0.5 truncate">
                {settings.name || L('Nouvel espace', 'Новый профиль', 'Նոր պրոֆիլ', 'ახალი სივრცე')}
              </p>
            </div>

            <nav className="space-y-1 flex-1" aria-label="Settings navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Right Content Area */}
          <section className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-950/30">
            {mainContent}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition"
          >
            {L('Fermer', 'Закрыть', 'Փակել', 'დახურვა')}
          </button>
          {activeTab !== 'subscription' && (
            <button
              type="button"
              onClick={() => handleSaveSettings()}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{L('Enregistrer les paramètres', 'Сохранить настройки', 'Պահպանել կարգավորումները', 'პარამეტრების შენახვა')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
