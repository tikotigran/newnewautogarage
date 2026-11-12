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
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';
import { GarageSettings, Vehicle } from '../types/garage';
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
import { getSystemThemeConfig } from '../services/adminService';
import { useI18n } from '../i18n/I18nContext';
import {
  validateGarageSettings,
  serializeBackupPayload,
  parseBackupPayload,
  vehiclesToCsv,
} from '../utils/settingsUtils';

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
}) => {
  const { lang, setLang } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      const current = getGarageSettings();
      const resolvedRegime = current.taxRegime || 'sarl';
      const resolvedRate =
        typeof current.taxRatePercent === 'number' && !Number.isNaN(current.taxRatePercent)
          ? current.taxRatePercent
          : getDefaultTaxRateForRegime(resolvedRegime);
      setSettings({
        ...DEFAULT_GARAGE_SETTINGS,
        ...current,
        theme,
        defaultMarginPercent: current.defaultMarginPercent ?? 20,
        currency: current.currency || 'EUR',
        taxRegime: resolvedRegime,
        taxRatePercent: resolvedRate,
      });
      setErrors({});
      setStatusMessage(null);
      setConfirmClearCache(false);
      setMobileMenuOpen(false);

      if (userId) {
        fetchGarageSettingsFromCloud(userId).then((cloudSettings) => {
          setSettings((prev) => ({
            ...prev,
            ...cloudSettings,
            theme,
            defaultMarginPercent: cloudSettings.defaultMarginPercent ?? prev.defaultMarginPercent ?? 20,
            currency: cloudSettings.currency || prev.currency || 'EUR',
            taxRegime: cloudSettings.taxRegime || prev.taxRegime || 'sarl',
            taxRatePercent:
              typeof cloudSettings.taxRatePercent === 'number' && !Number.isNaN(cloudSettings.taxRatePercent)
                ? cloudSettings.taxRatePercent
                : prev.taxRatePercent ?? 15,
          }));
        });
      }
    }
  }, [isOpen, theme, userId]);

  if (!isOpen) return null;

  const isRu = lang === 'ru';
  const systemConfig = getSystemThemeConfig();
  const resolvedEmail = userEmail || auth.currentUser?.email || settings.email || 'garage@autogarage.fr';

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

    const resolvedRegime = settings.taxRegime || 'sarl';
    const resolvedTaxRate =
      resolvedRegime === 'none'
        ? 0
        : typeof settings.taxRatePercent === 'number' && !Number.isNaN(settings.taxRatePercent)
        ? Math.max(0, settings.taxRatePercent)
        : getDefaultTaxRateForRegime(resolvedRegime);

    const updatedSettings: GarageSettings = {
      ...settings,
      siret: (settings.siret || '').trim(),
      postalCode: (settings.postalCode || '').replace(/\s+/g, ''),
      taxRegime: resolvedRegime,
      taxRatePercent: resolvedTaxRate,
      theme,
    };

    await saveGarageSettings(updatedSettings, userId);
    if (onSettingsSaved) onSettingsSaved(updatedSettings);
    setStatusMessage({
      type: 'success',
      text: isRu
        ? 'Настройки сохранены и синхронизированы с Cerfa 15776*02 и P&L.'
        : 'Paramètres enregistrés et synchronisés avec Cerfa 15776*02 et P&L.',
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
    'w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-xs font-semibold text-slate-300 mb-1';
  const siretDigits = (settings.siret || '').replace(/\s+/g, '');

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
                    <select
                      id="settings-street-type"
                      value={settings.streetType || 'Rue'}
                      onChange={(e) => setSettings({ ...settings, streetType: e.target.value })}
                      className={inputClass}
                    >
                      {STREET_TYPES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
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
                    <select
                      id="settings-cerfa-template"
                      value={settings.defaultCerfaTemplate || 'cerfa_15776_02'}
                      onChange={(e) =>
                        setSettings({ ...settings, defaultCerfaTemplate: e.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="cerfa_15776_02">
                        Cerfa N° 15776*02 — Certificat de cession d'un véhicule d'occasion (Officiel)
                      </option>
                    </select>
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

            {/* 3. FINANCE & TAXES */}
            {activeTab === 'finance' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isRu ? 'Финансы и Налоги' : 'Finances, Marges & TVA'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRu
                      ? 'Настройка маржи по умолчанию, налоговых формулировок НДС (TVA) и валюты.'
                      : 'Paramètres de marge par défaut, mentions fiscales de TVA et devise.'}
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
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
                      <select
                        id="settings-currency"
                        value={settings.currency || 'EUR'}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            currency: e.target.value as GarageSettings['currency'],
                          })
                        }
                        className={inputClass}
                      >
                        <option value="EUR">EUR (€) — Euro</option>
                        <option value="CHF">CHF — Franc suisse</option>
                        <option value="GBP">GBP (£) — Livre sterling</option>
                        <option value="USD">USD ($) — Dollar US</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="settings-tva" className={labelClass}>
                      {isRu ? 'Налоговая пометка НДС в счетах (TVA)' : 'Mention TVA (Factures)'}
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800/80">
                    <div>
                      <label htmlFor="settings-tax-regime" className={labelClass}>
                        {isRu ? 'Налоговый режим (для отчёта P&L)' : 'Régime fiscal (Calcul P&L)'}
                      </label>
                      <select
                        id="settings-tax-regime"
                        value={settings.taxRegime || 'sarl'}
                        onChange={(e) => {
                          const nextRegime = e.target.value as 'sarl' | 'micro' | 'custom' | 'none';
                          const defaultRate =
                            nextRegime === 'sarl'
                              ? 15
                              : nextRegime === 'micro'
                              ? 12.3
                              : nextRegime === 'none'
                              ? 0
                              : settings.taxRatePercent ?? 15;
                          setSettings({
                            ...settings,
                            taxRegime: nextRegime,
                            taxRatePercent: defaultRate,
                          });
                        }}
                        className={inputClass}
                      >
                        <option value="sarl">
                          {isRu ? 'SARL / SAS (IS 15%)' : 'SARL / SAS (IS 15%)'}
                        </option>
                        <option value="micro">
                          {isRu ? 'Micro-entreprise (12.3%)' : 'Micro-entreprise (12.3%)'}
                        </option>
                        <option value="custom">
                          {isRu ? 'Своя ставка (%)' : 'Taux personnalisé (%)'}
                        </option>
                        <option value="none">
                          {isRu ? 'Без налога (0%)' : 'Exonéré / 0%'}
                        </option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="settings-tax-rate" className={labelClass}>
                        {isRu ? 'Ставка налога на прибыль (%)' : 'Taux d’imposition (%)'}
                      </label>
                      <input
                        id="settings-tax-rate"
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        disabled={settings.taxRegime === 'none'}
                        value={settings.taxRatePercent ?? 15}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            taxRatePercent: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className={`${inputClass} tabular-nums font-bold disabled:opacity-50`}
                      />
                    </div>
                  </div>
                </div>

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
            )}

            {/* 4. APPEARANCE */}
            {activeTab === 'appearance' && (
              <div className="space-y-5">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      {theme === 'dark' ? (
                        <Moon className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Sun className="w-4 h-4 text-amber-500" />
                      )}
                      <span>{isRu ? 'Тема оформления' : 'Thème d’affichage'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onThemeChange('dark')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
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
                        onClick={() => onThemeChange('light')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
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

                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <Languages className="w-4 h-4 text-blue-400" />
                      <span>{isRu ? 'Язык интерфейса' : 'Langue de l’interface'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setLang('fr')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                          lang === 'fr'
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        🇫🇷 Français (FR)
                      </button>
                      <button
                        type="button"
                        onClick={() => setLang('ru')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                          lang === 'ru'
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        🇷🇺 Русский (RU)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Compact Grid / List Default View */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-white">
                    {isRu ? 'Режим отображения инвентаря по умолчанию' : 'Mode d’affichage par défaut du parc'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('grid')}
                      className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-2 ${
                        defaultViewMode === 'grid'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                      <span>{isRu ? 'Компактная сетка (Grid)' : 'Grille Compacte (Grid)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('list')}
                      className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-2 ${
                        defaultViewMode === 'list'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <List className="w-4 h-4" />
                      <span>{isRu ? 'Табличный список (List)' : 'Vue Liste (Tableau)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. SECURITY & ACCOUNT */}
            {activeTab === 'security' && (
              <div className="space-y-5">
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
