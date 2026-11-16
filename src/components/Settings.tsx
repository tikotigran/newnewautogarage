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
  Wrench,
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
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';
import {
  FrenchTaxConfiguration,
  GarageSettings,
  IsCalculationHistoryEntry,
  IsRateMode,
  LayoutMode,
  LegalStatus,
  TaxRegime,
  TaxSettingsAuditEntry,
  UserLayoutPreference,
  VatRegime,
  Vehicle,
} from '../types/garage';
import { ThemedSelect } from './ThemedSelect';
import {
  DEFAULT_GARAGE_SETTINGS,
  getGarageSettings,
  fetchGarageSettingsFromCloud,
  getDefaultTaxRateForRegime,
  saveGarageSettings,
  exportGarageDatabase,
  importGarageDatabase,
  clearLocalGarageCache,
} from '../services/garageService';
import { logEntityChange, logUserActivity } from '../services/auditAndBackupService';
import { computeEntityFieldDiffs } from '../utils/exportBackup';
import { getSuperAdminTaxDefaults, getSystemThemeConfig } from '../services/adminService';
import {
  calculateCorporateIS,
  calculateFrenchVat,
  calculateMicroEntrepriseTaxes,
  calculateVehicleProfitBeforeTaxes,
  FRENCH_TAX_DEFAULTS,
  getTaxRegimeDisplayLabel,
  getTodayIsoDate,
  mapLegalStatusToTaxRegime,
  mapTaxRegimeToLegalStatus,
  normalizeFrenchTaxConfig,
  roundCurrency,
} from '../utils/frenchTaxEngine';
import { useI18n } from '../i18n/I18nContext';
import { Language, SUPPORTED_LANGUAGES } from '../utils/i18nUtils';
import {
  validateGarageSettings,
  serializeBackupPayload,
  parseBackupPayload,
  vehiclesToCsv,
} from '../utils/settingsUtils';

const LANGUAGE_FLAGS: Record<Language, string> = {
  fr: '🇫🇷',
  ru: '🇷🇺',
  ka: '🇬🇪',
  hy: '🇦🇲',
};

export type SettingsTab = 'company' | 'templates' | 'finance' | 'appearance' | 'security';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  vehicles?: Vehicle[];
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  onSettingsSaved?: (newSettings: GarageSettings) => void;
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
  vehicles = [],
  theme,
  onThemeChange,
  onSettingsSaved,
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
  const { lang, setLang } = useI18n();
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

  const isPage = variant === 'page';

  useEffect(() => {
    if (isOpen || isPage) {
      const current = getGarageSettings();
      const globalDefaults = getSuperAdminTaxDefaults();
      const normalizedTaxConfig = normalizeFrenchTaxConfig(current, globalDefaults);
      const resolvedRegime = current.taxRegime || normalizedTaxConfig.businessTaxRegime || 'sarl';
      const resolvedRate =
        resolvedRegime === 'micro'
          ? roundCurrency(
              normalizedTaxConfig.socialContributionRate +
                (normalizedTaxConfig.versementLiberatoireEnabled
                  ? normalizedTaxConfig.versementLiberatoireRate
                  : 0)
            )
          : typeof current.taxRatePercent === 'number' && !Number.isNaN(current.taxRatePercent)
          ? current.taxRatePercent
          : getDefaultTaxRateForRegime(resolvedRegime);
      setSettings({
        ...DEFAULT_GARAGE_SETTINGS,
        ...current,
        theme,
        defaultMarginPercent: current.defaultMarginPercent ?? 20,
        currency: current.currency || 'EUR',
        legalStatus: current.legalStatus || normalizedTaxConfig.legalStatus,
        taxRegime: resolvedRegime,
        taxRatePercent: resolvedRate,
        frenchTaxConfig: normalizedTaxConfig,
        isCalculationHistory: current.isCalculationHistory || [],
        taxAuditHistory: current.taxAuditHistory || [],
      });
      setErrors({});
      setStatusMessage(null);
      setConfirmClearCache(false);
      setMobileMenuOpen(false);

      if (userId) {
        fetchGarageSettingsFromCloud(userId).then((cloudSettings) => {
          const cloudTaxConfig = normalizeFrenchTaxConfig(cloudSettings, globalDefaults);
          setSettings((prev) => ({
            ...prev,
            ...cloudSettings,
            theme,
            defaultMarginPercent: cloudSettings.defaultMarginPercent ?? prev.defaultMarginPercent ?? 20,
            currency: cloudSettings.currency || prev.currency || 'EUR',
            legalStatus: cloudSettings.legalStatus || cloudTaxConfig.legalStatus,
            taxRegime: cloudSettings.taxRegime || cloudTaxConfig.businessTaxRegime || 'sarl',
            taxRatePercent:
              typeof cloudSettings.taxRatePercent === 'number' && !Number.isNaN(cloudSettings.taxRatePercent)
                ? cloudSettings.taxRatePercent
                : prev.taxRatePercent ?? 15,
            frenchTaxConfig: cloudTaxConfig,
            isCalculationHistory: cloudSettings.isCalculationHistory || prev.isCalculationHistory || [],
            taxAuditHistory: cloudSettings.taxAuditHistory || prev.taxAuditHistory || [],
          }));
        });
      }
    }
  }, [isOpen, isPage, theme, userId]);

  if (!isPage && !isOpen) return null;

  const isRu = lang === 'ru';
  const systemConfig = getSystemThemeConfig();
  const resolvedEmail = userEmail || auth.currentUser?.email || settings.email || 'garage@autogarage.fr';
  const resolvedUserId = userId || auth.currentUser?.uid || 'garage_pro_dealer';
  const taxConfig: FrenchTaxConfiguration = normalizeFrenchTaxConfig(settings);

  const updateTaxConfig = (
    patch: Partial<FrenchTaxConfiguration>,
    extraSettingsPatch?: Partial<GarageSettings>
  ) => {
    const nextConfig = normalizeFrenchTaxConfig({
      ...settings,
      ...extraSettingsPatch,
      frenchTaxConfig: {
        ...taxConfig,
        ...patch,
        effectiveDates: {
          ...taxConfig.effectiveDates,
          ...(patch.effectiveDates || {}),
        },
      },
    });
    const syncedRate =
      nextConfig.businessTaxRegime === 'micro'
        ? roundCurrency(
            nextConfig.socialContributionRate +
              (nextConfig.versementLiberatoireEnabled ? nextConfig.versementLiberatoireRate : 0)
          )
        : nextConfig.businessTaxRegime === 'none'
        ? 0
        : nextConfig.businessTaxRegime === 'custom'
        ? nextConfig.corporateTaxCustomRate
        : nextConfig.isRateMode === 'standard_25' || !nextConfig.reducedIsEligible
        ? nextConfig.corporateTaxRateStandard
        : nextConfig.corporateTaxRateReduced;

    setSettings((prev) => ({
      ...prev,
      ...extraSettingsPatch,
      legalStatus: nextConfig.legalStatus,
      taxRegime: nextConfig.businessTaxRegime,
      taxRatePercent: syncedRate,
      frenchTaxConfig: nextConfig,
    }));
  };

  const handleRecordIsHistory = async () => {
    const isResult = calculateCorporateIS({
      annualTaxableProfit: taxConfig.annualTaxableProfit,
      config: taxConfig,
    });
    const entry: IsCalculationHistoryEntry = {
      id: `is_${Date.now()}`,
      financialYear: taxConfig.financialYear || new Date().getFullYear(),
      legalStatus: taxConfig.legalStatus,
      annualTaxableProfit: isResult.annualTaxableProfit,
      reducedIsEligible: isResult.reducedIsEligible,
      isRateMode: isResult.isRateMode,
      bracket15Base: isResult.bracket15Base,
      bracket15Tax: isResult.bracket15Tax,
      bracket25Base: isResult.bracket25Base,
      bracket25Tax: isResult.bracket25Tax,
      totalIsTax: isResult.totalIsTax,
      effectiveRatePercent: isResult.effectiveRatePercent,
      calculatedAt: new Date().toISOString(),
      recordedBy: resolvedEmail,
    };
    const nextHistory = [entry, ...(settings.isCalculationHistory || [])].slice(0, 50);
    const updated = { ...settings, isCalculationHistory: nextHistory };
    setSettings(updated);
    await saveGarageSettings(updated, userId);
    void logUserActivity({
      userId: resolvedUserId,
      garageId: updated.garageId,
      actorEmail: resolvedEmail,
      action: 'is_calculation_recorded',
      entityType: 'settings',
      entityId: updated.garageId || 'garage_default',
      targetLabel: `IS ${entry.financialYear} — ${entry.totalIsTax.toFixed(2)} €`,
      details: `Résultat: ${entry.annualTaxableProfit.toFixed(2)} € | IS: ${entry.totalIsTax.toFixed(2)} €`,
    });
    setStatusMessage({
      type: 'success',
      text: isRu
        ? `Расчёт налога IS за ${entry.financialYear} г. (${entry.totalIsTax.toFixed(2)} €) сохранён в историю.`
        : `Calcul IS ${entry.financialYear} (${entry.totalIsTax.toFixed(2)} €) enregistré dans l’historique.`,
    });
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (activeTab === 'company') {
      const validationErrors = validateGarageSettings(settings);
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) {
        setStatusMessage({
          type: 'error',
          text: isRu
            ? 'Проверьте корректность полей профиля компании (SIRET 14 цифр, индекс 5 цифр).'
            : 'Veuillez corriger les erreurs dans le profil entreprise (SIRET 14 chiffres, code postal 5 chiffres).',
        });
        return;
      }
    }

    const normalizedTax = normalizeFrenchTaxConfig(settings);
    const resolvedRegime = normalizedTax.businessTaxRegime || 'sarl';
    const resolvedTaxRate =
      resolvedRegime === 'none'
        ? 0
        : resolvedRegime === 'micro'
        ? roundCurrency(
            normalizedTax.socialContributionRate +
              (normalizedTax.versementLiberatoireEnabled ? normalizedTax.versementLiberatoireRate : 0)
          )
        : typeof settings.taxRatePercent === 'number' && !Number.isNaN(settings.taxRatePercent)
        ? Math.max(0, settings.taxRatePercent)
        : getDefaultTaxRateForRegime(resolvedRegime);

    const prevSettings = getGarageSettings();
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
        'isRateMode',
        'corporateTaxRateReduced',
        'corporateTaxRateStandard',
        'corporateTaxCustomRate',
        'reducedIsEligible',
        'annualTaxableProfit',
        'financialYear',
        'vatRegime',
        'vatRatePercent',
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

    const updatedSettings: GarageSettings = {
      ...settings,
      siret: (settings.siret || '').trim(),
      postalCode: (settings.postalCode || '').replace(/\s+/g, ''),
      legalStatus: normalizedTax.legalStatus,
      taxRegime: resolvedRegime,
      taxRatePercent: resolvedTaxRate,
      frenchTaxConfig: normalizedTax,
      taxAuditHistory: nextAuditHistory,
      theme,
      layoutMode: layoutPreference,
    };

    setSettings(updatedSettings);
    await saveGarageSettings(updatedSettings, userId);
    const diffs = computeEntityFieldDiffs(
      prevSettings as unknown as Record<string, unknown>,
      updatedSettings as unknown as Record<string, unknown>,
      ['name', 'siret', 'streetName', 'postalCode', 'city', 'email', 'legalStatus', 'taxRegime', 'taxRatePercent', 'tvaMention', 'currency']
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
      text: isRu
        ? 'Настройки сохранены и синхронизированы с Cerfa 15776*02, НДС и P&L (исторические продажи не изменены).'
        : 'Paramètres enregistrés et synchronisés avec Cerfa 15776*02, TVA et P&L (ventes historiques préservées).',
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
      text: isRu
        ? `Вид инвентаря по умолчанию: ${mode === 'grid' ? 'Сетка' : 'Список'}.`
        : `Affichage par défaut mis à jour : ${mode === 'grid' ? 'Grille' : 'Liste'}.`,
    });
  };

  const handlePasswordReset = async () => {
    if (!auth.currentUser?.email) {
      setStatusMessage({
        type: 'error',
        text: isRu
          ? 'Сброс пароля доступен только при активной сессии Firebase Email.'
          : 'La réinitialisation du mot de passe nécessite une session Firebase Email active.',
      });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      setStatusMessage({
        type: 'success',
        text: isRu
          ? `Письмо для сброса пароля отправлено на ${auth.currentUser.email}.`
          : `Un e-mail de réinitialisation a été envoyé à ${auth.currentUser.email}.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || (isRu ? 'Ошибка отправки письма.' : 'Erreur lors de l’envoi.'),
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
      text: isRu ? 'Резервная копия JSON скачана.' : 'Sauvegarde JSON téléchargée avec succès.',
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
      text: isRu ? 'Таблица CSV экспортирована.' : 'Export CSV des véhicules téléchargé.',
    });
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBackupPayload(text);
      await importGarageDatabase(parsed, userId);
      const refreshed = getGarageSettings();
      setSettings(refreshed);
      if (refreshed.theme) onThemeChange(refreshed.theme);
      if (onSettingsSaved) onSettingsSaved(refreshed);
      setStatusMessage({
        type: 'success',
        text: isRu
          ? `Восстановлено автомобилей: ${parsed.vehicles.length}.`
          : `Base restaurée avec succès (${parsed.vehicles.length} véhicule(s)).`,
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
      text: isRu
        ? 'Локальный кэш очищен, настройки сброшены по умолчанию.'
        : 'Cache local vidé et paramètres réinitialisés par défaut.',
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
      label: isRu ? 'Профиль Гаража / ИП' : 'Profil Garage / EI',
      shortLabel: isRu ? 'Профиль' : 'Profil',
      icon: Building2,
    },
    {
      id: 'templates',
      label: isRu ? 'Бланки и Настройки Cerfa' : 'Modèles & Cerfa',
      shortLabel: 'Cerfa',
      icon: FileText,
    },
    {
      id: 'finance',
      label: isRu ? 'Финансы и Налоги' : 'Finances & TVA',
      shortLabel: isRu ? 'Финансы' : 'Finances',
      icon: Coins,
    },
    {
      id: 'appearance',
      label: isRu ? 'Внешний вид' : 'Apparence',
      shortLabel: isRu ? 'Вид' : 'Thème',
      icon: Palette,
    },
    {
      id: 'security',
      label: isRu ? 'Безопасность и Аккаунт' : 'Sécurité & Compte',
      shortLabel: isRu ? 'Аккаунт' : 'Compte',
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

            {/* 1. GARAGE PROFILE / EI */}
            {activeTab === 'company' && (
              <form id="company-settings-form" onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isRu ? 'Профиль Гаража / ИП' : 'Profil du Garage / Entreprise'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRu
                      ? 'Реквизиты продавца, юридический статус (Personne Morale / Physique) и адрес для Cerfa.'
                      : 'Coordonnées vendeur, statut juridique (Personne morale / physique) et adresse Cerfa.'}
                  </p>
                </div>

                {/* Entity Type Switch */}
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <span className="block text-xs font-bold text-slate-300">
                    {isRu ? 'Статус продавца (Forme Juridique)' : 'Statut du vendeur (Ancien Propriétaire)'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setErrors({});
                        setSettings({ ...settings, entityType: 'morale' });
                      }}
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                        (settings.entityType || 'morale') === 'morale'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <Building2 className="w-4 h-4 shrink-0" />
                      <span>
                        {isRu ? 'Personne morale (Компания / Гараж)' : 'Personne morale (Professionnel / Garage)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErrors({});
                        setSettings({ ...settings, entityType: 'physique' });
                      }}
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                        settings.entityType === 'physique'
                          ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <User className="w-4 h-4 shrink-0" />
                      <span>
                        {isRu ? 'Personne physique (Частное лицо)' : 'Personne physique (Particulier)'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Live Cerfa Header Preview */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-start justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                        {isRu ? 'Предпросмотр: Раздел 2 (Ancien Propriétaire)' : 'Aperçu Section 2 Cerfa 15776*02'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          settings.entityType === 'physique'
                            ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {settings.entityType === 'physique' ? '☑ Personne physique' : '☑ Personne morale'}
                      </span>
                    </div>
                    {settings.entityType === 'physique' ? (
                      <>
                        <p className="font-bold text-white text-sm">
                          {[settings.lastName, settings.firstName]
                            .filter(Boolean)
                            .join(' ')
                            .trim()
                            .toUpperCase() || 'NOM PRÉNOM'}
                          {settings.sex ? ` (${settings.sex})` : ''}
                        </p>
                        <p className="text-slate-400">
                          {isRu ? 'Частное лицо (Particulier) — без SIRET' : 'Particulier — Sans numéro SIRET'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-white text-sm">{settings.name || 'AutoGarage Manager SARL'}</p>
                        <p className="text-slate-400">
                          SIRET : <span className="font-mono">{settings.siret || '—'}</span>
                        </p>
                      </>
                    )}
                    <p className="text-slate-400">
                      {[settings.streetNumber, settings.streetExtension, settings.streetType, settings.streetName]
                        .filter(Boolean)
                        .join(' ')}{' '}
                      — {settings.postalCode} {settings.city}
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-400">
                    <p>{settings.phone}</p>
                    <p>{settings.email}</p>
                  </div>
                </div>

                {/* Conditional Identity Fields */}
                {settings.entityType === 'physique' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="settings-last-name" className={labelClass}>
                        {isRu ? 'Фамилия (Nom) *' : 'Nom *'}
                      </label>
                      <input
                        id="settings-last-name"
                        type="text"
                        value={settings.lastName || ''}
                        onChange={(e) => setSettings({ ...settings, lastName: e.target.value.toUpperCase() })}
                        placeholder="DUPONT"
                        className={inputClass}
                      />
                      {errors.lastName && <p className="text-[11px] text-red-400 mt-1">{errors.lastName}</p>}
                    </div>

                    <div>
                      <label htmlFor="settings-first-name" className={labelClass}>
                        {isRu ? 'Имя (Prénom) *' : 'Prénom *'}
                      </label>
                      <input
                        id="settings-first-name"
                        type="text"
                        value={settings.firstName || ''}
                        onChange={(e) => setSettings({ ...settings, firstName: e.target.value })}
                        placeholder="Jean"
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
                              setSettings({ ...settings, sex: settings.sex === sx ? '' : sx })
                            }
                            className={`py-2 rounded-xl text-xs font-bold border transition ${
                              settings.sex === sx
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            {sx === 'M' ? 'M (Homme)' : 'F (Femme)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="settings-company-name" className={labelClass}>
                        {isRu ? 'Название компании (Raison Sociale) *' : 'Raison Sociale *'}
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          id="settings-company-name"
                          type="text"
                          value={settings.name}
                          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                          placeholder="AutoGarage Manager SARL"
                          className={`${inputClass} pl-9`}
                        />
                      </div>
                      {errors.name && <p className="text-[11px] text-red-400 mt-1">{errors.name}</p>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="settings-siret" className="text-xs font-semibold text-slate-300">
                          {isRu ? 'Номер SIRET (14 цифр) *' : 'N° SIRET (14 chiffres) *'}
                        </label>
                        <span
                          className={`text-[10px] font-mono ${
                            siretDigits.length === 14 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {siretDigits.length}/14
                        </span>
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          id="settings-siret"
                          type="text"
                          value={settings.siret}
                          onChange={(e) => setSettings({ ...settings, siret: e.target.value })}
                          placeholder="894 123 456 00012"
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
                      N° de voie
                    </label>
                    <input
                      id="settings-street-num"
                      type="text"
                      value={settings.streetNumber}
                      onChange={(e) => setSettings({ ...settings, streetNumber: e.target.value })}
                      placeholder="12"
                      className={inputClass}
                    />
                  </div>

                  <div className="col-span-1">
                    <label htmlFor="settings-street-ext" className={labelClass}>
                      Extension
                    </label>
                    <input
                      id="settings-street-ext"
                      type="text"
                      value={settings.streetExtension || ''}
                      onChange={(e) => setSettings({ ...settings, streetExtension: e.target.value })}
                      placeholder="bis, ter"
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
                      value={settings.streetType || 'Rue'}
                      onChange={(val) => setSettings({ ...settings, streetType: val })}
                      options={STREET_TYPES.map((st) => ({ value: st, label: st }))}
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
                        value={settings.streetName}
                        onChange={(e) => setSettings({ ...settings, streetName: e.target.value })}
                        placeholder="de l’Industrie"
                        className={`${inputClass} pl-9`}
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
                      onChange={(e) => setSettings({ ...settings, postalCode: e.target.value })}
                      placeholder="75011"
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
                      onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                      placeholder="Paris"
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
                        onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                        placeholder="01 45 88 90 00"
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
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                        placeholder="contact@autogarage.fr"
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                    {errors.email && <p className="text-[11px] text-red-400 mt-1">{errors.email}</p>}
                  </div>
                </div>

                {(settings.entityType || 'morale') === 'morale' && (
                  <div>
                    <label htmlFor="settings-legal-form" className={labelClass}>
                      Forme juridique
                    </label>
                    <div className="relative">
                      <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        id="settings-legal-form"
                        type="text"
                        value={settings.legalForm || ''}
                        onChange={(e) => setSettings({ ...settings, legalForm: e.target.value })}
                        placeholder="SARL au capital de 10 000 €"
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <p>
                    {isRu
                      ? 'Сохранение автоматически обновляет Раздел 2 (Ancien propriétaire) в мастере и PDF-генераторе Cerfa 15776*02 без перезагрузки страницы.'
                      : 'Ces coordonnées pré-remplissent automatiquement la section 2 (Ancien propriétaire) du Cerfa 15776*02 et de vos factures sans rechargement.'}
                  </p>
                </div>
              </form>
            )}

            {/* 2. DOCUMENT TEMPLATES & CERFA */}
            {activeTab === 'templates' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isRu ? 'Бланки и Настройки Cerfa' : 'Modèles & Paramètres Cerfa'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRu
                      ? 'Выбор официального бланка по умолчанию и калибровка смещения PDF.'
                      : 'Configuration du formulaire Cerfa par défaut et calibration de l’impression PDF.'}
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {isRu ? 'Шаблон Cerfa по умолчанию' : 'Modèle Cerfa par défaut'}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isRu
                        ? 'Официальный правительственный бланк для оформления продажи автомобиля'
                        : 'Formulaire gouvernemental officiel utilisé pour la génération des certificats de cession'}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="settings-cerfa-template" className={labelClass}>
                      {isRu ? 'Активный шаблон PDF' : 'Modèle de document actif'}
                    </label>
                    <ThemedSelect
                      id="settings-cerfa-template"
                      testId="settings-cerfa-template-select"
                      ariaLabel={isRu ? 'Активный шаблон PDF' : 'Modèle de document actif'}
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

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1 max-w-md">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-amber-400" />
                        <span>
                          {isRu ? 'Калибровка координат PDF (Aligner Mode)' : 'Calibration des coordonnées PDF (Aligner Mode)'}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        {isRu
                          ? 'Откройте интерактивный режим выравнивания для точной подгонки X/Y координат текста на бланке Cerfa 15776*02.'
                          : 'Ouvrez l’outil visuel d’alignement pour ajuster en temps réel les positions X/Y sur le formulaire Cerfa 15776*02.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenAlignerMode) {
                          onClose();
                          onOpenAlignerMode();
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-2 shadow-lg shadow-amber-500/20"
                    >
                      <span>🔧 Aligner Mode</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-500 block">Offset X</span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {systemConfig.cerfaAdjustments.offsetX} pt
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-500 block">Offset Y</span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {systemConfig.cerfaAdjustments.offsetY} pt
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-500 block">{isRu ? 'Шрифт Δ' : 'Police Δ'}</span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {systemConfig.cerfaAdjustments.fontSizeDelta} pt
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. FINANCE & FRENCH TAX ENGINE */}
            {activeTab === 'finance' && (() => {
              const simPnl = calculateVehicleProfitBeforeTaxes({
                salePrice: simSale,
                purchasePrice: simPurchase,
                repairCostTotal: simRepairs,
                generalExpensesTotal: 0,
              });
              const simVat = calculateFrenchVat({
                salePrice: simSale,
                purchasePrice: simPurchase,
                vatRegime: taxConfig.vatRegime,
                vatRatePercent: taxConfig.vatRatePercent,
              });
              const simMicro = calculateMicroEntrepriseTaxes({
                turnover: simSale,
                config: taxConfig,
              });
              const isBreakdown = calculateCorporateIS({
                annualTaxableProfit: taxConfig.annualTaxableProfit,
                config: taxConfig,
              });
              const combinedMicroRate = roundCurrency(
                taxConfig.socialContributionRate +
                  (taxConfig.versementLiberatoireEnabled ? taxConfig.versementLiberatoireRate : 0)
              );

              return (
                <div className="space-y-5" data-testid="settings-finance-panel">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {isRu
                        ? 'Финансы и Налоговый движок (Франция)'
                        : 'Finances & Fiscalité Automobile (France)'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isRu
                        ? 'Настройка юридической формы (Micro-entreprise, SARL, SAS), URSSAF, Versement libératoire, прогрессивного IS и режимов НДС (TVA).'
                        : 'Configuration du statut juridique (Micro-entreprise, SARL, SAS), URSSAF, Versement libératoire, IS progressif et régimes de TVA.'}
                    </p>
                  </div>

                  {/* Accountability Disclaimer */}
                  <div
                    data-testid="settings-tax-disclaimer"
                    className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200"
                  >
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p>{isRu ? FRENCH_TAX_DEFAULTS.DISCLAIMER_RU : FRENCH_TAX_DEFAULTS.DISCLAIMER_FR}</p>
                  </div>

                  {/* Card 1: Legal Status, Regime & General Margin */}
                  <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="settings-legal-status" className={labelClass}>
                          {isRu ? 'Юридический статус (Франция)' : 'Statut juridique (France)'}
                        </label>
                        <ThemedSelect<LegalStatus>
                          id="settings-legal-status"
                          testId="settings-legal-status-select"
                          ariaLabel={isRu ? 'Юридический статус (Франция)' : 'Statut juridique (France)'}
                          value={taxConfig.legalStatus}
                          onChange={(nextStatus) => {
                            const mappedRegime = mapLegalStatusToTaxRegime(nextStatus);
                            updateTaxConfig({
                              legalStatus: nextStatus,
                              businessTaxRegime: mappedRegime,
                            });
                          }}
                          options={[
                            {
                              value: 'micro_entreprise',
                              label: isRu
                                ? 'Micro-entreprise (Achat / Revente)'
                                : 'Micro-entreprise (Achat / Revente)',
                            },
                            { value: 'sarl', label: 'SARL (Société à responsabilité limitée)' },
                            { value: 'sas', label: 'SAS (Société par actions simplifiée)' },
                            { value: 'eurl', label: 'EURL' },
                            { value: 'sasu', label: 'SASU' },
                            { value: 'ei', label: 'EI (Entreprise Individuelle)' },
                            { value: 'other', label: isRu ? 'Другое' : 'Autre structure' },
                          ]}
                          triggerClassName={inputClass}
                        />
                      </div>

                      <div>
                        <label htmlFor="settings-tax-regime" className={labelClass}>
                          {isRu ? 'Налоговый режим расчётов P&L' : 'Régime fiscal de calcul P&L'}
                        </label>
                        <ThemedSelect<TaxRegime>
                          id="settings-tax-regime"
                          testId="settings-tax-regime-select"
                          ariaLabel={isRu ? 'Налоговый режим расчётов P&L' : 'Régime fiscal de calcul P&L'}
                          value={taxConfig.businessTaxRegime}
                          onChange={(nextRegime) => {
                            const nextStatus =
                              nextRegime === 'micro' || nextRegime === 'sarl' || nextRegime === 'sas'
                                ? mapTaxRegimeToLegalStatus(nextRegime, settings.entityType)
                                : taxConfig.legalStatus;
                            updateTaxConfig({
                              businessTaxRegime: nextRegime,
                              legalStatus: nextStatus,
                            });
                          }}
                          options={[
                            {
                              value: 'sarl',
                              label: isRu
                                ? 'SARL — IS прогрессивный (15% / 25%)'
                                : 'SARL — IS progressif (15% / 25%)',
                            },
                            {
                              value: 'sas',
                              label: isRu
                                ? 'SAS — IS прогрессивный (15% / 25%)'
                                : 'SAS — IS progressif (15% / 25%)',
                            },
                            {
                              value: 'micro',
                              label: isRu
                                ? 'Micro-entreprise — на оборот (12.3% / 13.3%)'
                                : 'Micro-entreprise — sur CA (12.3% / 13.3%)',
                            },
                            {
                              value: 'custom',
                              label: isRu ? 'Своя ставка (%)' : 'Taux personnalisé (%)',
                            },
                            {
                              value: 'none',
                              label: isRu ? 'Без налога (0%)' : 'Sans impôt estimé (0%)',
                            },
                          ]}
                          triggerClassName={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="settings-default-margin" className={labelClass}>
                          {isRu ? 'Целевая маржа по умолчанию (%)' : 'Marge cible par défaut (%)'}
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
                          {isRu ? 'Валюта расчётов' : 'Devise principale'}
                        </label>
                        <ThemedSelect<NonNullable<GarageSettings['currency']>>
                          id="settings-currency"
                          testId="settings-currency-select"
                          ariaLabel={isRu ? 'Валюта расчётов' : 'Devise principale'}
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

                  {/* Card 2A: MICRO-ENTREPRISE — ACHAT / REVENTE */}
                  {taxConfig.businessTaxRegime === 'micro' && (
                    <div
                      data-testid="settings-micro-panel"
                      className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            {isRu
                              ? 'Micro-entreprise — Achat / Revente (налогообложение по обороту CA)'
                              : 'Micro-entreprise — Achat / Revente (calcul sur Chiffre d’Affaires)'}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {isRu
                              ? 'Взносы URSSAF (по умолч. 12.3%) и Versement libératoire (1%) считаются от цены продажи (CA), без вычета закупки и ремонта.'
                              : 'Les cotisations URSSAF (12,3% par défaut) et le Versement libératoire (1%) s’appliquent au chiffre d’affaires encaissé, sans déduire achat ni réparations.'}
                          </p>
                        </div>
                        <span
                          data-testid="settings-micro-combined-badge"
                          className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30 tabular-nums"
                        >
                          {isRu
                            ? `Итого на оборот: ${combinedMicroRate}%`
                            : `Taux combiné CA : ${combinedMicroRate}%`}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label htmlFor="settings-urssaf-rate" className={labelClass}>
                            {isRu ? 'Соцвзносы URSSAF (%)' : 'Cotisations URSSAF (%)'}
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
                            {isRu ? 'Versement libératoire (1%)' : 'Versement libératoire'}
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              data-testid="settings-vl-yes"
                              onClick={() => updateTaxConfig({ versementLiberatoireEnabled: true })}
                              className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                                taxConfig.versementLiberatoireEnabled
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                              }`}
                            >
                              {isRu ? 'ДА (YES)' : 'OUI'}
                            </button>
                            <button
                              type="button"
                              data-testid="settings-vl-no"
                              onClick={() => updateTaxConfig({ versementLiberatoireEnabled: false })}
                              className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                                !taxConfig.versementLiberatoireEnabled
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                              }`}
                            >
                              {isRu ? 'НЕТ (NO)' : 'NON'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="settings-vl-rate" className={labelClass}>
                            {isRu ? 'Ставка VL (%)' : 'Taux Versement libératoire (%)'}
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
                        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                            <Info className="w-4 h-4 shrink-0" />
                            <span>
                              {isRu
                                ? 'Versement libératoire отключён: применяется только 12.3% URSSAF. Подоходный налог (Micro-BIC) оценивается отдельно (без +1%).'
                                : 'Versement libératoire désactivé : seul le taux URSSAF est déduit. L’impôt sur le revenu Micro-BIC est estimé séparément (jamais +1% automatique).'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="settings-micro-abattement" className={labelClass}>
                                {isRu
                                  ? 'Вычет Micro-BIC Achat/Revente (%)'
                                  : 'Abattement forfaitaire Micro-BIC (%)'}
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
                                {isRu
                                  ? 'Оценочная ставка подоходного IR (%)'
                                  : 'Taux marginal IR estimé (%)'}
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
                          {isRu ? 'Дата вступления в силу (URSSAF)' : 'Date d’effet (URSSAF)'}
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
                  )}

                  {/* Card 2B: SARL / SAS — IMPÔT SUR LES SOCIÉTÉS (IS) */}
                  {(taxConfig.businessTaxRegime === 'sarl' ||
                    taxConfig.businessTaxRegime === 'sas') && (
                    <div
                      data-testid="settings-corporate-is-panel"
                      className="p-5 rounded-2xl bg-slate-900 border border-indigo-500/30 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            {isRu
                              ? `${taxConfig.businessTaxRegime.toUpperCase()} — Налог на прибыль компаний (Impôt sur les Sociétés — IS)`
                              : `${taxConfig.businessTaxRegime.toUpperCase()} — Impôt sur les Sociétés (IS progressif annuel)`}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {isRu
                              ? 'Считается от годовой налогооблагаемой прибыли компании: 15% до 42 500 € (при праве на льготу) и 25% свыше. При убытке = 0 €.'
                              : 'Calculé sur le résultat fiscal annuel global : 15% jusqu’à 42 500 € (si éligible) puis 25% au-delà. Résultat négatif/nul = 0 €.'}
                          </p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          {getTaxRegimeDisplayLabel(taxConfig)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label htmlFor="settings-is-mode" className={labelClass}>
                            {isRu ? 'Режим расчёта IS' : 'Mode de calcul IS'}
                          </label>
                          <ThemedSelect<IsRateMode>
                            id="settings-is-mode"
                            testId="settings-is-mode-select"
                            ariaLabel={isRu ? 'Режим расчёта IS' : 'Mode de calcul IS'}
                            value={taxConfig.isRateMode}
                            onChange={(mode) => updateTaxConfig({ isRateMode: mode })}
                            options={[
                              {
                                value: 'progressive_15_25',
                                label: isRu
                                  ? 'Прогрессивный (15% ≤ 42 500 € / 25%)'
                                  : 'Progressif PME (15% ≤ 42 500 € / 25%)',
                              },
                              { value: 'standard_25', label: 'Standard (25%)' },
                              { value: 'reduced_15', label: isRu ? 'Льготный (15%)' : 'Taux réduit (15%)' },
                              { value: 'custom', label: isRu ? 'Своя ставка (%)' : 'Taux personnalisé (%)' },
                            ]}
                            triggerClassName={inputClass}
                          />
                        </div>

                        <div>
                          <span className={labelClass}>
                            {isRu ? 'Право на льготу 15% (PME)' : 'Éligible taux réduit 15% PME'}
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              data-testid="settings-is-eligible-yes"
                              onClick={() => updateTaxConfig({ reducedIsEligible: true })}
                              className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                                taxConfig.reducedIsEligible
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                              }`}
                            >
                              {isRu ? 'ДА (YES)' : 'OUI'}
                            </button>
                            <button
                              type="button"
                              data-testid="settings-is-eligible-no"
                              onClick={() => updateTaxConfig({ reducedIsEligible: false })}
                              className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                                !taxConfig.reducedIsEligible
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                              }`}
                            >
                              {isRu ? 'НЕТ (NO)' : 'NON'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="settings-is-year" className={labelClass}>
                            {isRu ? 'Отчётный год' : 'Exercice fiscal'}
                          </label>
                          <input
                            id="settings-is-year"
                            type="number"
                            min={2020}
                            max={2040}
                            value={taxConfig.financialYear}
                            onChange={(e) =>
                              updateTaxConfig({
                                financialYear: Number(e.target.value) || new Date().getFullYear(),
                              })
                            }
                            className={`${inputClass} tabular-nums font-bold`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label htmlFor="settings-is-reduced-rate" className={labelClass}>
                            {isRu ? 'Льготная ставка (%)' : 'Taux réduit (%)'}
                          </label>
                          <input
                            id="settings-is-reduced-rate"
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={taxConfig.corporateTaxRateReduced}
                            onChange={(e) =>
                              updateTaxConfig({
                                corporateTaxRateReduced: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className={`${inputClass} tabular-nums font-bold`}
                          />
                        </div>
                        <div>
                          <label htmlFor="settings-is-standard-rate" className={labelClass}>
                            {isRu ? 'Стандартная ставка (%)' : 'Taux standard (%)'}
                          </label>
                          <input
                            id="settings-is-standard-rate"
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={taxConfig.corporateTaxRateStandard}
                            onChange={(e) =>
                              updateTaxConfig({
                                corporateTaxRateStandard: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className={`${inputClass} tabular-nums font-bold`}
                          />
                        </div>
                        <div>
                          <label htmlFor="settings-is-threshold" className={labelClass}>
                            {isRu ? 'Порог 15% (€)' : 'Plafond 15% (€)'}
                          </label>
                          <input
                            id="settings-is-threshold"
                            type="number"
                            min={0}
                            step="500"
                            value={taxConfig.reducedIsThreshold}
                            onChange={(e) =>
                              updateTaxConfig({
                                reducedIsThreshold: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className={`${inputClass} tabular-nums font-bold`}
                          />
                        </div>
                        <div>
                          <label htmlFor="settings-annual-profit" className={labelClass}>
                            {isRu ? 'Годовая прибыль (€)' : 'Bénéfice annuel imposable (€)'}
                          </label>
                          <input
                            id="settings-annual-profit"
                            data-testid="settings-annual-profit-input"
                            type="number"
                            step="500"
                            value={taxConfig.annualTaxableProfit}
                            onChange={(e) =>
                              updateTaxConfig({
                                annualTaxableProfit: Number(e.target.value) || 0,
                              })
                            }
                            className={`${inputClass} tabular-nums font-bold`}
                          />
                        </div>
                      </div>

                      {/* Live Progressive IS Bracket Breakdown */}
                      <div
                        data-testid="settings-is-breakdown"
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-200">
                            {isRu
                              ? `Расчёт годового налога IS (${taxConfig.financialYear})`
                              : `Simulation Impôt sur les Sociétés (${taxConfig.financialYear})`}
                          </span>
                          <button
                            type="button"
                            data-testid="settings-record-is-history-btn"
                            onClick={handleRecordIsHistory}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition"
                          >
                            {isRu ? 'Сохранить расчёт в историю' : 'Enregistrer ce calcul annuel'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {isRu
                                ? `До ${taxConfig.reducedIsThreshold.toLocaleString('fr-FR')} € (${taxConfig.corporateTaxRateReduced}%)`
                                : `Tranche ≤ ${taxConfig.reducedIsThreshold.toLocaleString('fr-FR')} € (${taxConfig.corporateTaxRateReduced}%)`}
                            </span>
                            <span className="font-bold text-white tabular-nums">
                              {isBreakdown.bracket15Tax.toLocaleString('fr-FR')} €
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {isRu
                                ? `Свыше (${taxConfig.corporateTaxRateStandard}%)`
                                : `Tranche > plafond (${taxConfig.corporateTaxRateStandard}%)`}
                            </span>
                            <span className="font-bold text-white tabular-nums">
                              {isBreakdown.bracket25Tax.toLocaleString('fr-FR')} €
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {isRu ? 'Итого IS к уплате' : 'Total IS estimé'}
                            </span>
                            <span
                              data-testid="settings-is-total-value"
                              className="font-extrabold text-amber-400 tabular-nums"
                            >
                              {isBreakdown.totalIsTax.toLocaleString('fr-FR')} €
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {isRu ? 'Прибыль после IS' : 'Résultat net après IS'}
                            </span>
                            <span className="font-extrabold text-emerald-400 tabular-nums">
                              {isBreakdown.netProfitAfterIs.toLocaleString('fr-FR')} €
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Card 2C: Custom rate */}
                  {taxConfig.businessTaxRegime === 'custom' && (
                    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="settings-tax-rate" className={labelClass}>
                          {isRu ? 'Пользовательская ставка (%)' : 'Taux d’imposition personnalisé (%)'}
                        </label>
                        <input
                          id="settings-tax-rate"
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={taxConfig.corporateTaxCustomRate}
                          onChange={(e) =>
                            updateTaxConfig({
                              corporateTaxCustomRate: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className={`${inputClass} tabular-nums font-bold`}
                        />
                      </div>
                      <div>
                        <label htmlFor="settings-is-effective-date" className={labelClass}>
                          {isRu ? 'Дата вступления в силу' : 'Date d’effet'}
                        </label>
                        <input
                          id="settings-is-effective-date"
                          type="date"
                          value={taxConfig.effectiveDates.is || getTodayIsoDate()}
                          onChange={(e) =>
                            updateTaxConfig({
                              effectiveDates: { ...taxConfig.effectiveDates, is: e.target.value },
                            })
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>
                  )}

                  {/* Card 3: French VAT (TVA) Regimes */}
                  <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {isRu
                          ? 'Режимы НДС во Франции (TVA — по умолчанию для сделок и счетов)'
                          : 'Régimes de TVA France (par défaut pour factures & cessions)'}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isRu
                          ? 'Отделяется от URSSAF и IS. Для каждого автомобиля можно выбрать индивидуальный режим TVA при оформлении продажи.'
                          : 'Strictement séparée de l’URSSAF et de l’IS. Modifiable au cas par cas lors de la vente d’un véhicule.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label htmlFor="settings-vat-regime" className={labelClass}>
                          {isRu ? 'Режим TVA по умолчанию' : 'Régime TVA par défaut'}
                        </label>
                        <ThemedSelect<VatRegime>
                          id="settings-vat-regime"
                          testId="settings-vat-regime-select"
                          ariaLabel={isRu ? 'Режим TVA по умолчанию' : 'Régime TVA par défaut'}
                          value={taxConfig.vatRegime}
                          onChange={(nextVat) => {
                            const nextRate = nextVat === 'franchise_base' ? 0 : taxConfig.vatRatePercent || 20;
                            const autoMention =
                              nextVat === 'franchise_base'
                                ? 'TVA non applicable, art. 293 B du CGI'
                                : nextVat === 'tva_marge'
                                ? 'Régime particulier - Biens d’occasion - TVA sur la marge (Art. 297 A du CGI)'
                                : `TVA standard ${nextRate}% sur le prix total TTC (Art. 256 du CGI)`;
                            updateTaxConfig(
                              { vatRegime: nextVat, vatRatePercent: nextRate },
                              { tvaMention: autoMention }
                            );
                          }}
                          options={[
                            {
                              value: 'tva_marge',
                              label: isRu
                                ? 'TVA на маржу — Art. 297 A CGI (б/у авто)'
                                : 'TVA sur la marge (Art. 297 A CGI)',
                            },
                            {
                              value: 'tva_total',
                              label: isRu
                                ? 'Стандартный TVA 20% на всю цену'
                                : 'TVA sur prix total (Standard 20%)',
                            },
                            {
                              value: 'franchise_base',
                              label: isRu
                                ? 'Franchise en base (0% TVA — Art. 293 B CGI)'
                                : 'Franchise en base de TVA (0% — Art. 293 B CGI)',
                            },
                            {
                              value: 'custom',
                              label: isRu ? 'Своя ставка TVA (%)' : 'Taux de TVA personnalisé (%)',
                            },
                          ]}
                          triggerClassName={inputClass}
                        />
                      </div>

                      <div>
                        <label htmlFor="settings-vat-rate" className={labelClass}>
                          {isRu ? 'Ставка TVA (%)' : 'Taux TVA (%)'}
                        </label>
                        <input
                          id="settings-vat-rate"
                          data-testid="settings-vat-rate-input"
                          type="number"
                          min={0}
                          max={50}
                          step="0.1"
                          disabled={taxConfig.vatRegime === 'franchise_base'}
                          value={taxConfig.vatRegime === 'franchise_base' ? 0 : taxConfig.vatRatePercent}
                          onChange={(e) =>
                            updateTaxConfig({
                              vatRatePercent: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className={`${inputClass} tabular-nums font-bold disabled:opacity-45`}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="settings-tva" className={labelClass}>
                        {isRu ? 'Юридическая формулировка TVA в счетах' : 'Mention légale TVA (Factures & Factur-X)'}
                      </label>
                      <input
                        id="settings-tva"
                        type="text"
                        value={settings.tvaMention || ''}
                        onChange={(e) => setSettings({ ...settings, tvaMention: e.target.value })}
                        placeholder="TVA sur marge — Article 297 A du CGI"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {/* Card 4: Live Interactive French Tax Simulator */}
                  <div
                    data-testid="settings-tax-simulator"
                    className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-amber-400" />
                      <h4 className="text-sm font-bold text-white">
                        {isRu
                          ? 'Симулятор сделки (проверка разделения прибыли, URSSAF, IS и TVA)'
                          : 'Simulateur en direct (Séparation Résultat / URSSAF / IR / IS / TVA)'}
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="sim-purchase" className={labelClass}>
                          {isRu ? 'Покупка авто (€)' : 'Achat véhicule (€)'}
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
                          {isRu ? 'Ремонт и расходы (€)' : 'Réparations & frais (€)'}
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
                          {isRu ? 'Цена продажи (€ TTC)' : 'Prix de vente (€ TTC)'}
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

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-[11px] text-slate-400 block">
                          {isRu ? 'Прибыль до налогов' : 'Profit avant impôts'}
                        </span>
                        <span
                          data-testid="sim-profit-before-tax"
                          className={`font-extrabold tabular-nums ${
                            simPnl.profitBeforeTaxes >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {simPnl.profitBeforeTaxes.toLocaleString('fr-FR')} €
                        </span>
                      </div>

                      {taxConfig.businessTaxRegime === 'micro' ? (
                        <>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              URSSAF ({taxConfig.socialContributionRate}% CA)
                            </span>
                            <span
                              data-testid="sim-urssaf-amount"
                              className="font-extrabold text-amber-400 tabular-nums"
                            >
                              {simMicro.urssafAmount.toLocaleString('fr-FR')} €
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {taxConfig.versementLiberatoireEnabled
                                ? `VL (${taxConfig.versementLiberatoireRate}% CA)`
                                : isRu
                                ? `IR отд. (${taxConfig.microBicAbattementPercent}% вычет)`
                                : `IR Micro-BIC séparé`}
                            </span>
                            <span
                              data-testid="sim-vl-or-ir-amount"
                              className="font-extrabold text-sky-400 tabular-nums"
                            >
                              {(taxConfig.versementLiberatoireEnabled
                                ? simMicro.versementLiberatoireAmount
                                : simMicro.separateMicroBicIncomeTax
                              ).toLocaleString('fr-FR')}{' '}
                              €
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {isRu ? 'Итого URSSAF + VL' : 'Total cotis. Micro'}
                            </span>
                            <span
                              data-testid="sim-micro-total-tax"
                              className="font-extrabold text-white tabular-nums"
                            >
                              {simMicro.totalSocialAndVlAmount.toLocaleString('fr-FR')} €
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {isRu ? 'НДС (TVA)' : 'TVA transaction'}
                            </span>
                            <span className="font-extrabold text-sky-400 tabular-nums">
                              {simVat.vatAmount.toLocaleString('fr-FR')} €
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {isRu ? 'База HT' : 'Montant HT'}
                            </span>
                            <span className="font-extrabold text-white tabular-nums">
                              {simVat.htAmount.toLocaleString('fr-FR')} €
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                            <span className="text-[11px] text-slate-400 block">
                              {isRu ? 'Налог IS (годовой)' : 'Contexte IS annuel'}
                            </span>
                            <span className="font-semibold text-indigo-300 text-[11px]">
                              {isRu
                                ? 'По годовой прибыли компании'
                                : 'Calculé sur résultat annuel'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Card 5: History (IS Calculations & Tax Settings Audit Trail) */}
                  {((settings.isCalculationHistory && settings.isCalculationHistory.length > 0) ||
                    (settings.taxAuditHistory && settings.taxAuditHistory.length > 0)) && (
                    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-white">
                        <History className="w-4 h-4 text-amber-400" />
                        <span>
                          {isRu
                            ? 'Журнал изменений налоговых настроек и история расчётов IS'
                            : 'Historique fiscal (Calculs IS & Journal des modifications)'}
                        </span>
                      </div>

                      {settings.isCalculationHistory && settings.isCalculationHistory.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-slate-400">
                            {isRu ? 'История расчётов IS:' : 'Calculs IS enregistrés :'}
                          </p>
                          {settings.isCalculationHistory.slice(0, 5).map((item) => (
                            <div
                              key={item.id}
                              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] flex flex-wrap items-center justify-between gap-2"
                            >
                              <span className="font-bold text-white">
                                {item.financialYear} — {item.annualTaxableProfit.toLocaleString('fr-FR')} €
                              </span>
                              <span className="text-amber-400 font-bold tabular-nums">
                                IS : {item.totalIsTax.toLocaleString('fr-FR')} € ({item.effectiveRatePercent}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {settings.taxAuditHistory && settings.taxAuditHistory.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-slate-400">
                            {isRu ? 'Аудит изменений параметров:' : 'Audit des modifications fiscales :'}
                          </p>
                          {settings.taxAuditHistory.slice(0, 5).map((audit) => (
                            <div
                              key={audit.id}
                              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] space-y-0.5"
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

                  {/* Backup & Data Export */}
                  <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {isRu ? 'Экспорт и резервное копирование' : 'Export comptable & Sauvegarde'}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isRu
                          ? 'Выгрузите базу автомобилей в JSON или CSV для бухгалтерии.'
                          : 'Exportez vos véhicules et bilans en JSON ou CSV pour votre comptabilité.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleExportJson}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>{isRu ? 'Экспорт БД (JSON)' : 'Exporter Base (JSON)'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportCsv}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition flex items-center gap-2 border border-slate-700"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        <span>{isRu ? 'Экспорт авто (CSV)' : 'Exporter Véhicules (CSV)'}</span>
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
                        className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition flex items-center gap-2 border border-slate-700"
                      >
                        <Upload className="w-4 h-4 text-amber-400" />
                        <span>{isRu ? 'Импорт БД (JSON)' : 'Importer Base (JSON)'}</span>
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
                    {isRu ? 'Внешний вид' : 'Apparence & Affichage'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRu
                      ? 'Выбор темы, языка интерфейса и вида автопарка по умолчанию.'
                      : 'Préférence de thème, langue de l’interface et vue par défaut du parc.'}
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
                    <span>{isRu ? 'Тема оформления' : 'Thème d’affichage'}</span>
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
                    <span>{isRu ? 'Язык интерфейса' : 'Langue de l’interface'}</span>
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
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
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
                        {isRu
                          ? 'Новый дизайн / Макет интерфейса (Layout)'
                          : 'Nouveau Design / Disposition de l’interface'}
                      </span>
                    </div>
                    {layoutPreference !== 'global' && onLayoutPreferenceChange && (
                      <button
                        type="button"
                        onClick={() => {
                          onLayoutPreferenceChange('global');
                          setStatusMessage({
                            type: 'success',
                            text: isRu
                              ? 'Сброшено к глобальному макету платформы.'
                              : 'Réinitialisé sur la disposition globale.',
                          });
                        }}
                        className="text-[11px] font-semibold text-amber-400 hover:underline"
                      >
                        {isRu
                          ? `По умолчанию (${globalLayoutMode === 'sidebar' ? 'Sidebar' : 'Classic'})`
                          : `Par défaut (${globalLayoutMode === 'sidebar' ? 'Sidebar' : 'Classique'})`}
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
                          text: isRu
                            ? 'Включён классический макет (Top-Nav).'
                            : 'Disposition classique (Top-Nav) activée.',
                        });
                      }}
                      className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer ${
                        effectiveLayoutMode === 'classic'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <PanelTop className="w-3.5 h-3.5" />
                      <span>{isRu ? 'Классическая шапка' : 'En-tête Classique'}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="settings-layout-sidebar"
                      onClick={() => {
                        onLayoutPreferenceChange?.('sidebar');
                        setStatusMessage({
                          type: 'success',
                          text: isRu
                            ? 'Включён новый дизайн (Sidebar Layout).'
                            : 'Nouveau design (Sidebar Layout) activé.',
                        });
                      }}
                      className={`h-9 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer ${
                        effectiveLayoutMode === 'sidebar'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <PanelLeft className="w-3.5 h-3.5" />
                      <span>{isRu ? 'Новый дизайн (Sidebar)' : 'Nouveau Design (Sidebar)'}</span>
                    </button>
                  </div>
                </div>

                {/* Compact Grid / List Default View */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold text-white">
                    {isRu ? 'Режим отображения инвентаря по умолчанию' : 'Mode d’affichage par défaut du parc'}
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
                      <span>{isRu ? 'Компактная сетка (Grid)' : 'Grille Compacte (Grid)'}</span>
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
                      <span>{isRu ? 'Табличный список (List)' : 'Vue Liste (Tableau)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. SECURITY & ACCOUNT */}
            {activeTab === 'security' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isRu ? 'Безопасность и Аккаунт' : 'Sécurité & Compte'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRu
                      ? 'Управление паролем, ролью доступа, активной сессией и локальным кэшем.'
                      : 'Gestion du mot de passe, rôle d’accès, session active et cache local.'}
                  </p>
                </div>

                {/* Account & Role Card */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-slate-400 block">
                        {isRu ? 'Активный аккаунт' : 'Compte actif'}
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
                      {userRole === 'superadmin' ? 'SUPERADMIN' : isRu ? 'Пользователь (User)' : 'Utilisateur'}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">
                      {isRu
                        ? 'Отправить ссылку для смены пароля на ваш Email'
                        : 'Envoyer un lien de réinitialisation de mot de passe par e-mail'}
                    </div>
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isRu ? 'Сменить пароль' : 'Réinitialiser mot de passe'}</span>
                    </button>
                  </div>
                </div>

                {/* Clear Local Cache with inline confirmation */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-white">
                    {isRu ? 'Сброс локального кэша' : 'Réinitialisation du cache local'}
                  </h4>
                  {!confirmClearCache ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearCache(true)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{isRu ? 'Очистить локальный кэш' : 'Vider le cache local'}</span>
                    </button>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-red-300 font-semibold">
                        {isRu
                          ? 'Подтвердить удаление локальных данных (авто, расходы, настройки)?'
                          : 'Confirmer la suppression du cache local (véhicules, dépenses, paramètres) ?'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmClearCache(false)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white"
                        >
                          {isRu ? 'Отмена' : 'Annuler'}
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmClearCache}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white"
                        >
                          {isRu ? 'Да, очистить' : 'Confirmer'}
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
                  {isRu ? 'Настройки гаража' : 'Paramètres du Garage'}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--primary)] truncate max-w-[200px]">
                  {settings.name || 'AutoGarage Manager'}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {isRu
                  ? 'Реквизиты компании, налоговый режим (SARL/Micro/Custom), валюта, заметки TVA и резервное копирование'
                  : 'Coordonnées entreprise, régime fiscal (SARL/Micro/Personnalisé), devise, mention TVA et sauvegarde'}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="settings-page-save-top"
            onClick={() => handleSaveSettings()}
            className="h-9 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isRu ? 'Сохранить настройки' : 'Enregistrer les paramètres'}</span>
          </button>
        </div>

        {/* Full-Width Natural-Scrolling Workspace Content */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 sm:p-5 space-y-4">
          {mainContent}

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end">
            <button
              type="button"
              data-testid="settings-page-save-bottom"
              onClick={() => handleSaveSettings()}
              className="h-9 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isRu ? 'Сохранить настройки' : 'Enregistrer les paramètres'}</span>
            </button>
          </div>
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
              aria-label={isRu ? 'Меню настроек' : 'Menu des paramètres'}
              className="md:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-base sm:text-lg font-bold text-white">
                {isRu ? 'Настройки AutoGarage Manager' : 'Paramètres AutoGarage Manager'}
              </h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {isRu
                  ? 'Профиль гаража, бланки Cerfa, финансы, внешний вид и безопасность'
                  : 'Profil garage, modèles Cerfa, finances, apparence et sécurité'}
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
                  {isRu ? 'РАЗДЕЛЫ НАСТРОЕК' : 'SECTIONS'}
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
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
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

          {/* Desktop Fixed Left Sidebar (Matching SuperAdmin Panel UX) */}
          <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-slate-900/95 border-r border-slate-800 p-4 space-y-4 overflow-y-auto">
            <div className="px-2 pb-2 border-b border-slate-800">
              <p className="text-[11px] font-bold tracking-wider text-amber-400">
                {isRu ? 'КОНФИГУРАЦИЯ' : 'CONFIGURATION'}
              </p>
              <p className="text-xs font-bold text-white mt-0.5 truncate">
                {settings.name || 'AutoGarage Manager'}
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
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
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
          <section className="flex-1 min-w-0 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-950/30">
            {mainContent}
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition"
          >
            {isRu ? 'Закрыть' : 'Fermer'}
          </button>
          <button
            type="button"
            onClick={() => handleSaveSettings()}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isRu ? 'Сохранить настройки' : 'Enregistrer les paramètres'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
