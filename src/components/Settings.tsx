import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Building2,
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
  FileSpreadsheet,
  Sparkles,
  User,
  KeyRound,
  Calculator,
  History,
  Crown,
  Globe,
  Landmark,
  Receipt,
  ImagePlus,
  RefreshCw,
  PenTool,
  Send,
  Calendar,
  AlertTriangle,
  ArrowLeft,
  Plus,
  Edit3,
  Star,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';
import {
  FrenchTaxConfiguration,
  GarageSettings,
  GeneralExpense,
  Purchase,
  RepairTask,
  SellerProfileEntry,
  StatusProfileData,
  SubscriptionPlan,
  TaxSettingsAuditEntry,
  UserProfile,
  Vehicle,
} from '../types/garage';
import { SubscriptionPlanTab } from './SubscriptionPlanTab';
import { SignaturePad } from './SignaturePad';
import { ThemedSelect } from './ThemedSelect';
import { LocaleDateInput } from './LocaleDateInput';
import { formatFrenchDate } from '../utils/cerfa15776';
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
  getTodayIsoDate,
  normalizeFrenchTaxConfig,
  roundCurrency,
} from '../utils/frenchTaxEngine';
import {
  deleteSellerProfileEntry,
  ensureBusinessProfiles,
  ensurePersonalProfiles,
  getSellerProfileDisplayName,
  setDefaultSellerProfileEntry,
  syncSellerProfileArraysToSettings,
  upsertSellerProfileEntry,
} from '../utils/profileSeparationUtils';
import { useI18n } from '../i18n/I18nContext';
import { getIntlLocale, pickLocalized } from '../utils/i18nUtils';
import { AnalyticsTimeRange, CustomDateRange } from '../utils/analytics';
import {
  buildAccountantMailtoUrl,
  buildExpensesJournalCsv,
  buildSalesJournalCsv,
  normalizeHexColor,
  parseBackupPayload,
  serializeBackupPayload,
  validateEmail,
  validateGarageSettings,
  validateHexColor,
  validatePersonalProfileEntry,
  vehiclesToCsv,
} from '../utils/settingsUtils';
import { processLogoImageFile } from '../utils/imageHelpers';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';

export type SettingsTab =
  | 'company'
  | 'branding'
  | 'accounting'
  | 'taxes_backup'
  | 'templates'
  | 'finance'
  | 'appearance'
  | 'subscription'
  | 'security';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  userProfile?: UserProfile | null;
  subscriptionPlans?: SubscriptionPlan[];
  allVehiclesCount?: number;
  activeGarageId?: string | null;
  vehicles?: Vehicle[];
  repairs?: RepairTask[];
  expenses?: GeneralExpense[];
  purchases?: Purchase[];
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  onSettingsSaved?: (newSettings: GarageSettings) => void;
  onPlanUpdated?: (updatedProfile: UserProfile) => void;
  onSubscriptionToast?: (text: string) => void;
  onOpenAlignerMode?: () => void;
  userEmail?: string | null;
  userRole?: string;
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

type PrimarySettingsTab = 'company' | 'branding' | 'accounting' | 'taxes_backup';

function resolveDisplayTab(tab: SettingsTab): PrimarySettingsTab | 'subscription' {
  if (tab === 'subscription') return 'subscription';
  if (tab === 'branding' || tab === 'templates') return 'branding';
  if (tab === 'accounting') return 'accounting';
  if (
    tab === 'taxes_backup' ||
    tab === 'finance' ||
    tab === 'security' ||
    tab === 'appearance'
  ) {
    return 'taxes_backup';
  }
  return 'company';
}

function triggerCsvDownload(csvBody: string, fileName: string): void {
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  userId,
  userProfile = null,
  subscriptionPlans,
  allVehiclesCount,
  activeGarageId,
  vehicles = [],
  repairs = [],
  expenses = [],
  purchases = [],
  theme,
  onThemeChange,
  onSettingsSaved,
  onPlanUpdated,
  onSubscriptionToast,
  onOpenAlignerMode,
  userEmail,
  userRole = 'user',
  variant = 'modal',
  activeTab: controlledActiveTab,
  onTabChange,
}) => {
  const { lang, t } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });
  const intlLocale = getIntlLocale(lang);

  const [internalActiveTab, setInternalActiveTab] = useState<SettingsTab>('company');
  const rawActiveTab = controlledActiveTab ?? internalActiveTab;
  const displayTab = resolveDisplayTab(rawActiveTab);

  const setActiveTab = (tab: SettingsTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  const [settings, setSettings] = useState<GarageSettings>(DEFAULT_GARAGE_SETTINGS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [isSavingSignature, setIsSavingSignature] = useState(false);

  // Accounting export period state
  const [exportRange, setExportRange] = useState<AnalyticsTimeRange>('month');
  const [customExportRange, setCustomExportRange] = useState<CustomDateRange>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const firstOfMonth = `${today.slice(0, 7)}-01`;
    return { startDate: firstOfMonth, endDate: today };
  });

  const [simPurchase, setSimPurchase] = useState<number>(2000);
  const [simRepairs, setSimRepairs] = useState<number>(5000);
  const [simSale, setSimSale] = useState<number>(5000);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
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

  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [editingPersonalDraft, setEditingPersonalDraft] = useState<SellerProfileEntry | null>(null);
  const [personalErrors, setPersonalErrors] = useState<Record<string, string>>({});
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    if (isOpen || isPage) {
      hasProfileEditsRef.current = false;
      const current = getGarageSettings(targetGarageId);
      const globalDefaults = getSuperAdminTaxDefaults();
      const normalizedTaxConfig = normalizeFrenchTaxConfig(
        {
          ...current,
          profileType: 'micro_entrepreneur',
          legalStatus: 'micro_entreprise',
          taxRegime: 'micro',
        },
        globalDefaults
      );
      const resolvedRate = roundCurrency(
        normalizedTaxConfig.socialContributionRate +
          (normalizedTaxConfig.versementLiberatoireEnabled
            ? normalizedTaxConfig.versementLiberatoireRate
            : 0)
      );
      const bizList = ensureBusinessProfiles(current);
      const persList = ensurePersonalProfiles(current);
      const synced = syncSellerProfileArraysToSettings(
        {
          ...DEFAULT_GARAGE_SETTINGS,
          ...current,
          defaultCerfaTemplate: 'cerfa_15776_02',
          garageId: targetGarageId,
          theme,
          defaultMarginPercent: current.defaultMarginPercent ?? 20,
          currency: current.currency || 'EUR',
          brandPrimaryColor: current.brandPrimaryColor || '#0f172a',
          brandSecondaryColor: current.brandSecondaryColor || '#f59e0b',
          taxRatePercent: resolvedRate,
          frenchTaxConfig: {
            ...normalizedTaxConfig,
            legalStatus: 'micro_entreprise',
            businessTaxRegime: 'micro',
          },
          isCalculationHistory: current.isCalculationHistory || [],
          taxAuditHistory: current.taxAuditHistory || [],
        },
        bizList,
        persList
      );
      setSettings(synced);
      const defBiz = bizList.find((b) => b.isDefault) || bizList[0];
      setSelectedBusinessId(defBiz?.id || 'biz_default');
      setEditingPersonalDraft(null);
      setPersonalErrors({});
      setErrors({});
      setStatusMessage(null);
      setConfirmClearCache(false);

      if (userId) {
        fetchGarageSettingsFromCloud(userId, targetGarageId).then((cloudSettings) => {
          if (isCancelled || hasProfileEditsRef.current) return;
          const cloudTaxConfig = normalizeFrenchTaxConfig(
            {
              ...cloudSettings,
              profileType: 'micro_entrepreneur',
              legalStatus: 'micro_entreprise',
              taxRegime: 'micro',
            },
            globalDefaults
          );
          const cloudRate = roundCurrency(
            cloudTaxConfig.socialContributionRate +
              (cloudTaxConfig.versementLiberatoireEnabled
                ? cloudTaxConfig.versementLiberatoireRate
                : 0)
          );
          const cloudBizList = ensureBusinessProfiles(cloudSettings);
          const cloudPersList = ensurePersonalProfiles(cloudSettings);
          setSettings((prev) =>
            syncSellerProfileArraysToSettings(
              {
                ...prev,
                ...cloudSettings,
                defaultCerfaTemplate: 'cerfa_15776_02',
                theme,
                defaultMarginPercent:
                  cloudSettings.defaultMarginPercent ?? prev.defaultMarginPercent ?? 20,
                currency: cloudSettings.currency || prev.currency || 'EUR',
                brandPrimaryColor:
                  cloudSettings.brandPrimaryColor || prev.brandPrimaryColor || '#0f172a',
                brandSecondaryColor:
                  cloudSettings.brandSecondaryColor || prev.brandSecondaryColor || '#f59e0b',
                taxRatePercent: cloudRate,
                frenchTaxConfig: {
                  ...cloudTaxConfig,
                  legalStatus: 'micro_entreprise',
                  businessTaxRegime: 'micro',
                },
                isCalculationHistory:
                  cloudSettings.isCalculationHistory || prev.isCalculationHistory || [],
                taxAuditHistory: cloudSettings.taxAuditHistory || prev.taxAuditHistory || [],
              },
              cloudBizList,
              cloudPersList
            )
          );
          const defCloudBiz = cloudBizList.find((b) => b.isDefault) || cloudBizList[0];
          if (defCloudBiz?.id) setSelectedBusinessId(defCloudBiz.id);
        });
      }
    }
    return () => {
      isCancelled = true;
    };
  }, [isOpen, isPage, theme, userId, targetGarageId]);

  const resolvedEmail = userEmail || auth.currentUser?.email || settings.email || 'user@localhost';
  const resolvedUserId = userId || auth.currentUser?.uid || 'garage_pro_dealer';
  const businessProfilesList = useMemo(
    () => ensureBusinessProfiles(settings),
    [settings]
  );
  const personalProfilesList = useMemo(
    () => ensurePersonalProfiles(settings),
    [settings]
  );
  const activeBusinessProfile = useMemo(
    () =>
      businessProfilesList.find((b) => b.id === selectedBusinessId) ||
      businessProfilesList.find((b) => b.isDefault) ||
      businessProfilesList[0] ||
      null,
    [businessProfilesList, selectedBusinessId]
  );
  const activeBusinessFields: StatusProfileData = activeBusinessProfile || {
    name: settings.name || '',
    siret: settings.siret || '',
    streetNumber: settings.streetNumber || '',
    streetExtension: settings.streetExtension || '',
    streetType: settings.streetType || '',
    streetName: settings.streetName || '',
    postalCode: settings.postalCode || '',
    city: settings.city || '',
    country: settings.country || '',
    phone: settings.phone || '',
    email: settings.email || '',
    vatNumber: settings.vatNumber || '',
    iban: settings.iban || '',
    legalForm: settings.legalForm || 'Micro-entrepreneur',
    tvaMention: settings.tvaMention || 'TVA non applicable, art. 293 B du CGI',
  };
  const taxConfig: FrenchTaxConfiguration = normalizeFrenchTaxConfig({
    ...settings,
    profileType: 'micro_entrepreneur',
    legalStatus: 'micro_entreprise',
    taxRegime: 'micro',
  });

  // Live CSV journal calculations for Tab 3
  const salesJournalResult = useMemo(
    () =>
      buildSalesJournalCsv({
        vehicles,
        garageSettings: settings,
        timeRange: exportRange,
        customRange: customExportRange,
      }),
    [vehicles, settings, exportRange, customExportRange]
  );

  const expensesJournalResult = useMemo(
    () =>
      buildExpensesJournalCsv({
        vehicles,
        repairs,
        expenses,
        purchases,
        timeRange: exportRange,
        customRange: customExportRange,
      }),
    [vehicles, repairs, expenses, purchases, exportRange, customExportRange]
  );

  if (!isPage && !isOpen) return null;

  const periodLabels: Record<AnalyticsTimeRange, string> = {
    today: L("Aujourd'hui", 'Сегодня', 'Այսօր', 'დღეს'),
    week: L('Cette semaine', 'Эта неделя', 'Այս շաբաթ', 'ეს კვირა'),
    month: L('Ce mois', 'Этот месяц', 'Այս ամիս', 'ეს თვე'),
    '3months': L('3 mois', '3 месяца', '3 ամիս', '3 თვე'),
    '6months': L('6 mois', '6 месяцев', '6 ամիս', '6 თვე'),
    quarter: L('Trimestre', 'Квартал', 'Եռամսյակ', 'კვარტალი'),
    year: L('Année', 'Год', 'Տարի', 'წელი'),
    custom: L('Personnalisé', 'Произвольный период', 'Այլ ժամկետ', 'არჩევითი'),
    all: L('Tout', 'Всё время', 'Ամբողջը', 'სულ'),
  };

  const activePeriodLabel =
    exportRange === 'custom'
      ? `${customExportRange.startDate} → ${customExportRange.endDate}`
      : periodLabels[exportRange];

  const updateBusinessField = (patch: Partial<StatusProfileData>) => {
    hasProfileEditsRef.current = true;
    setSettings((prev) => {
      const currentBiz = ensureBusinessProfiles(prev);
      const currentPers = ensurePersonalProfiles(prev);
      const targetId =
        selectedBusinessId && currentBiz.some((b) => b.id === selectedBusinessId)
          ? selectedBusinessId
          : currentBiz[0]?.id || 'biz_default';
      const existing = currentBiz.find((b) => b.id === targetId);
      const upserted = upsertSellerProfileEntry(
        currentBiz,
        {
          ...(existing || activeBusinessFields),
          ...patch,
          id: targetId,
          isDefault: existing ? existing.isDefault : currentBiz.length === 0,
        },
        'micro'
      );
      return syncSellerProfileArraysToSettings(prev, upserted.list, currentPers);
    });
  };

  const handleAddBusinessProfile = () => {
    hasProfileEditsRef.current = true;
    const currentBiz = ensureBusinessProfiles(settings);
    const currentPers = ensurePersonalProfiles(settings);
    const created = upsertSellerProfileEntry(
      currentBiz,
      {
        name: L('Nouvelle entreprise', 'Новая компания', 'Նոր ընկերություն', 'ახალი კომპანია'),
        country: 'France',
        isDefault: currentBiz.length === 0,
      },
      'micro'
    );
    const next = syncSellerProfileArraysToSettings(settings, created.list, currentPers);
    setSettings(next);
    setSelectedBusinessId(created.saved.id);
    setErrors({});
  };

  const handleSetDefaultBusinessProfile = async (id: string) => {
    hasProfileEditsRef.current = true;
    const nextBiz = setDefaultSellerProfileEntry(businessProfilesList, id, 'micro');
    const next = syncSellerProfileArraysToSettings(settings, nextBiz, personalProfilesList);
    setSettings(next);
    await saveGarageSettings(next, userId, targetGarageId);
    if (onSettingsSaved) onSettingsSaved(next);
  };

  const handleDeleteBusinessProfile = async (id: string) => {
    hasProfileEditsRef.current = true;
    const nextBiz = deleteSellerProfileEntry(businessProfilesList, id, 'micro');
    const next = syncSellerProfileArraysToSettings(settings, nextBiz, personalProfilesList);
    setSettings(next);
    setSelectedBusinessId(nextBiz[0]?.id || 'biz_default');
    await saveGarageSettings(next, userId, targetGarageId);
    if (onSettingsSaved) onSettingsSaved(next);
  };

  const handleOpenNewPersonalDraft = () => {
    setPersonalErrors({});
    setEditingPersonalDraft({
      id: '',
      name: '',
      lastName: '',
      firstName: '',
      sex: 'M',
      birthDate: '',
      birthPlace: '',
      siret: '',
      streetNumber: '',
      streetExtension: '',
      streetType: '',
      streetName: '',
      postalCode: '',
      city: '',
      country: 'France',
      phone: '',
      email: '',
      isDefault: personalProfilesList.length === 0,
    });
  };

  const handleSavePersonalDraft = async () => {
    if (!editingPersonalDraft || isSavingPersonal) return;
    const vErrors = validatePersonalProfileEntry(editingPersonalDraft);
    if (Object.keys(vErrors).length > 0) {
      setPersonalErrors(vErrors);
      return;
    }
    setIsSavingPersonal(true);
    setPersonalErrors({});
    hasProfileEditsRef.current = true;
    try {
      const upserted = upsertSellerProfileEntry(
        personalProfilesList,
        {
          ...editingPersonalDraft,
          lastName: (editingPersonalDraft.lastName || '').trim().toUpperCase(),
          firstName: (editingPersonalDraft.firstName || '').trim(),
          birthDate: (editingPersonalDraft.birthDate || '').trim(),
          birthPlace: (editingPersonalDraft.birthPlace || '').trim(),
          postalCode: (editingPersonalDraft.postalCode || '').replace(/\s+/g, ''),
          city: (editingPersonalDraft.city || '').trim(),
        },
        'particulier'
      );
      const next = syncSellerProfileArraysToSettings(
        { ...settings, garageId: targetGarageId, theme },
        businessProfilesList,
        upserted.list
      );
      setSettings(next);
      await saveGarageSettings(next, userId, targetGarageId);
      if (onSettingsSaved) onSettingsSaved(next);
      setEditingPersonalDraft(null);
      setStatusMessage({
        type: 'success',
        text: L(
          'Profil particulier enregistré et disponible pour vos véhicules.',
          'Личный профиль продавца сохранён и доступен при выборе на автомобилях.',
          'Անհատական պրոֆիլը պահպանված է։',
          'პირადი პროფილი შენახულია.'
        ),
      });
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const handleSetDefaultPersonalProfile = async (id: string) => {
    hasProfileEditsRef.current = true;
    const nextPers = setDefaultSellerProfileEntry(personalProfilesList, id, 'particulier');
    const next = syncSellerProfileArraysToSettings(
      { ...settings, garageId: targetGarageId, theme },
      businessProfilesList,
      nextPers
    );
    setSettings(next);
    await saveGarageSettings(next, userId, targetGarageId);
    if (onSettingsSaved) onSettingsSaved(next);
  };

  const handleDeletePersonalProfile = async (id: string) => {
    hasProfileEditsRef.current = true;
    const nextPers = deleteSellerProfileEntry(personalProfilesList, id, 'particulier');
    const next = syncSellerProfileArraysToSettings(
      { ...settings, garageId: targetGarageId, theme },
      businessProfilesList,
      nextPers
    );
    setSettings(next);
    if (editingPersonalDraft?.id === id) setEditingPersonalDraft(null);
    await saveGarageSettings(next, userId, targetGarageId);
    if (onSettingsSaved) onSettingsSaved(next);
  };

  const updateSettingsField = (patch: Partial<GarageSettings>) => {
    hasProfileEditsRef.current = true;
    setSettings((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const persistImmediatePatch = async (
    patch: Partial<GarageSettings>,
    feedbackText?: string
  ) => {
    hasProfileEditsRef.current = true;
    const merged: GarageSettings = {
      ...settings,
      ...patch,
      garageId: targetGarageId,
      theme,
    };
    setSettings(merged);
    await saveGarageSettings(merged, userId, targetGarageId);
    if (onSettingsSaved) onSettingsSaved(merged);
    if (feedbackText) {
      setStatusMessage({ type: 'success', text: feedbackText });
    }
  };

  const updateTaxConfig = (
    patch: Partial<FrenchTaxConfiguration>,
    extraSettingsPatch?: Partial<GarageSettings>
  ) => {
    hasProfileEditsRef.current = true;
    const nextConfig = normalizeFrenchTaxConfig({
      ...settings,
      ...extraSettingsPatch,
      profileType: 'micro_entrepreneur',
      entityType: 'physique',
      legalStatus: 'micro_entreprise',
      taxRegime: 'micro',
      frenchTaxConfig: {
        ...taxConfig,
        ...patch,
        legalStatus: 'micro_entreprise',
        businessTaxRegime: 'micro',
        effectiveDates: {
          ...taxConfig.effectiveDates,
          ...(patch.effectiveDates || {}),
        },
      },
    });
    const syncedRate = roundCurrency(
      nextConfig.socialContributionRate +
        (nextConfig.versementLiberatoireEnabled ? nextConfig.versementLiberatoireRate : 0)
    );

    setSettings((prev) => ({
      ...prev,
      ...extraSettingsPatch,
      profileType: 'micro_entrepreneur',
      entityType: 'physique',
      legalStatus: 'micro_entreprise',
      taxRegime: 'micro',
      taxRatePercent: syncedRate,
      frenchTaxConfig: nextConfig,
    }));
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetBizId = activeBusinessProfile?.id || 'biz_default';

    if (displayTab === 'company') {
      const validationErrors = validateGarageSettings({
        ...settings,
        ...activeBusinessFields,
        profileType: 'micro_entrepreneur',
        entityType: 'physique',
        legalStatus: 'micro_entreprise',
        taxRegime: 'micro',
      });
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) {
        setStatusMessage({
          type: 'error',
          text: L(
            'Veuillez corriger les champs signalés (nom, code postal, IBAN ou e-mail).',
            'Проверьте выделенные поля (имя, индекс, IBAN или e-mail).',
            'Ստուգեք նշված դաշտերը (անուն, ինդեքս, IBAN կամ էլ․ փոստ)։',
            'შეამოწმეთ მონიშნული ველები (სახელი, ინდექსი, IBAN ან ელფოსტა).'
          ),
        });
        return;
      }
    } else if (displayTab === 'accounting') {
      if (settings.accountantEmail?.trim() && !validateEmail(settings.accountantEmail)) {
        const msg = L(
          "L'adresse e-mail de l'expert-comptable est invalide.",
          'Некорректный e-mail бухгалтера.',
          'Հաշվապահի էլ․ փոստի հասցեն սխալ է։',
          'ბუღალტრის ელფოსტა არასწორია.'
        );
        setErrors({ accountantEmail: msg });
        setStatusMessage({ type: 'error', text: msg });
        return;
      }
      setErrors({});
    } else if (displayTab === 'branding') {
      const brandErrors: Record<string, string> = {};
      if (settings.brandPrimaryColor?.trim() && !validateHexColor(settings.brandPrimaryColor)) {
        brandErrors.brandPrimaryColor = L(
          'Couleur hexadécimale invalide (ex. #0f172a).',
          'Некорректный HEX-цвет (напр. #0f172a).',
          'Անվավեր HEX գույն (#0f172a)։',
          'არასწორი HEX ფერი (#0f172a).'
        );
      }
      if (settings.brandSecondaryColor?.trim() && !validateHexColor(settings.brandSecondaryColor)) {
        brandErrors.brandSecondaryColor = L(
          'Couleur hexadécimale invalide (ex. #f59e0b).',
          'Некорректный HEX-цвет (напр. #f59e0b).',
          'Անվավեր HEX գույն (#f59e0b)։',
          'არასწორი HEX ფერი (#f59e0b).'
        );
      }
      setErrors(brandErrors);
      if (Object.keys(brandErrors).length > 0) {
        setStatusMessage({
          type: 'error',
          text: Object.values(brandErrors)[0],
        });
        return;
      }
    } else {
      setErrors({});
    }

    const normalizedTax = normalizeFrenchTaxConfig({
      ...settings,
      profileType: 'micro_entrepreneur',
      entityType: 'physique',
      legalStatus: 'micro_entreprise',
      taxRegime: 'micro',
      frenchTaxConfig: {
        ...taxConfig,
        legalStatus: 'micro_entreprise',
        businessTaxRegime: 'micro',
        vatRegime: 'franchise_base',
        vatRatePercent: 0,
      },
    });
    const resolvedTaxRate = roundCurrency(
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

    const cleanedBizEntry: Partial<SellerProfileEntry> = {
      ...activeBusinessFields,
      id: targetBizId,
      isDefault: activeBusinessProfile ? activeBusinessProfile.isDefault : true,
      siret: (activeBusinessFields.siret || '').trim(),
      legalForm: activeBusinessFields.legalForm || 'Micro-entrepreneur',
      tvaMention: 'TVA non applicable, art. 293 B du CGI',
      postalCode: (activeBusinessFields.postalCode || '').replace(/\s+/g, ''),
      country: (activeBusinessFields.country || '').trim(),
      vatNumber: (activeBusinessFields.vatNumber || '').trim().toUpperCase(),
      iban: (activeBusinessFields.iban || '').replace(/\s+/g, ' ').trim().toUpperCase(),
    };

    const upsertedBiz = upsertSellerProfileEntry(
      businessProfilesList,
      cleanedBizEntry,
      'micro'
    );

    const scopedUpdatedSettings: GarageSettings = syncSellerProfileArraysToSettings(
      {
        ...settings,
        garageId: targetGarageId,
        defaultCerfaTemplate: 'cerfa_15776_02',
        taxRatePercent: resolvedTaxRate,
        frenchTaxConfig: normalizedTax,
        taxAuditHistory: nextAuditHistory,
        brandPrimaryColor: normalizeHexColor(settings.brandPrimaryColor, '#0f172a'),
        brandSecondaryColor: normalizeHexColor(settings.brandSecondaryColor, '#f59e0b'),
        accountantEmail: (settings.accountantEmail || '').trim(),
        theme,
      },
      upsertedBiz.list,
      personalProfilesList
    );

    setSettings(scopedUpdatedSettings);
    await saveGarageSettings(scopedUpdatedSettings, userId, targetGarageId);

    const diffs = computeEntityFieldDiffs(
      prevSettings as unknown as Record<string, unknown>,
      scopedUpdatedSettings as unknown as Record<string, unknown>,
      [
        'name',
        'siret',
        'streetName',
        'postalCode',
        'city',
        'country',
        'vatNumber',
        'iban',
        'email',
        'accountantEmail',
        'brandPrimaryColor',
        'brandSecondaryColor',
        'legalStatus',
        'taxRegime',
        'taxRatePercent',
        'tvaMention',
        'currency',
      ]
    );
    void logUserActivity({
      userId: resolvedUserId,
      garageId: scopedUpdatedSettings.garageId,
      actorEmail: resolvedEmail,
      action: taxDiffs.length > 0 ? 'tax_settings_updated' : 'settings_updated',
      entityType: 'settings',
      entityId: scopedUpdatedSettings.garageId || 'garage_default',
      targetLabel: scopedUpdatedSettings.name,
      details: `${diffs.length + taxDiffs.length} champ(s) modifié(s)`,
    });
    if (diffs.length > 0 || taxDiffs.length > 0) {
      void logEntityChange({
        userId: resolvedUserId,
        garageId: scopedUpdatedSettings.garageId,
        actorEmail: resolvedEmail,
        operation: 'update',
        entityType: 'settings',
        entityId: scopedUpdatedSettings.garageId || 'garage_default',
        entityLabel: scopedUpdatedSettings.name,
        changes: [...diffs, ...taxDiffs],
      });
    }
    if (onSettingsSaved) onSettingsSaved(scopedUpdatedSettings);
    setStatusMessage({
      type: 'success',
      text: L(
        'Paramètres enregistrés et synchronisés sur vos documents.',
        'Настройки сохранены и синхронизированы с документами.',
        'Կարգավորումները պահպանված և համաժամեցված են։',
        'პარამეტრები შენახულია და სინქრონიზებულია.'
      ),
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingLogo(true);
    try {
      const processedUrl = await processLogoImageFile(file);
      await persistImmediatePatch(
        { logoDataUrl: processedUrl },
        L(
          'Logo enregistré et prêt pour vos factures et rapports.',
          'Логотип загружен и сохранён для ваших счетов и отчётов.',
          'Լոգոն բեռնված և պահպանված է։',
          'ლოგო ატვირთულია და შენახულია.'
        )
      );
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : L(
                'Impossible de traiter le logo.',
                'Ошибка загрузки логотипа.',
                'Լոգոյի բեռնման սխալ։',
                'ლოგოს ატვირთვის შეცდომა.'
              ),
      });
    } finally {
      setIsProcessingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    await persistImmediatePatch(
      { logoDataUrl: '' },
      L(
        'Logo supprimé.',
        'Логотип удалён.',
        'Լոգոն հեռացված է։',
        'ლოგო წაშლილია.'
      )
    );
  };

  const handleSaveSignature = async (dataUrl: string) => {
    setIsSavingSignature(true);
    try {
      await persistImmediatePatch(
        { signatureDataUrl: dataUrl },
        L(
          'Signature enregistrée et activée sur vos factures & Cerfa.',
          'Подпись сохранена и добавлена в счета-фактуры и бланки Cerfa.',
          'Ստորագրությունը պահպանված է։',
          'ხელმოწერა შენახულია.'
        )
      );
    } finally {
      setIsSavingSignature(false);
    }
  };

  const handleRemoveSignature = async () => {
    setIsSavingSignature(true);
    try {
      await persistImmediatePatch(
        { signatureDataUrl: '' },
        L(
          'Signature supprimée.',
          'Подпись удалена.',
          'Ստորագրությունը հեռացված է։',
          'ხელმოწერა წაშლილია.'
        )
      );
    } finally {
      setIsSavingSignature(false);
    }
  };

  const handleDownloadSalesJournal = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(salesJournalResult.csv, `Journal_Ventes_${stamp}.csv`);
    setStatusMessage({
      type: 'success',
      text: L(
        `Journal des ventes exporté (${salesJournalResult.count} vente(s)).`,
        `Журнал продаж скачан (${salesJournalResult.count} продаж).`,
        `Վաճառքների մատյանը արտահանվեց (${salesJournalResult.count})։`,
        `გაყიდვების ჟურნალი ჩამოიტვირთა (${salesJournalResult.count}).`
      ),
    });
  };

  const handleDownloadExpensesJournal = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(expensesJournalResult.csv, `Depenses_${stamp}.csv`);
    setStatusMessage({
      type: 'success',
      text: L(
        `Export des dépenses téléchargé (${expensesJournalResult.count} ligne(s)).`,
        `Таблица расходов скачана (${expensesJournalResult.count} записей).`,
        `Ծախսերի մատյանը արտահանվեց (${expensesJournalResult.count})։`,
        `ხარჯების ჟურნალი ჩამოიტვირთა (${expensesJournalResult.count}).`
      ),
    });
  };

  const handleSendToAccountant = () => {
    const targetEmail = (settings.accountantEmail || '').trim();
    if (!targetEmail || !validateEmail(targetEmail)) {
      const msg = L(
        "Renseignez une adresse e-mail valide pour l'expert-comptable avant d'envoyer.",
        'Укажите корректный e-mail бухгалтера перед отправкой.',
        'Նշեք հաշվապահի վավեր էլ․ փոստը։',
        'მიუთითეთ ბუღალტრის სწორი ელფოსტა.'
      );
      setErrors((prev) => ({ ...prev, accountantEmail: msg }));
      setStatusMessage({ type: 'error', text: msg });
      return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(salesJournalResult.csv, `Journal_Ventes_${stamp}.csv`);
    triggerCsvDownload(expensesJournalResult.csv, `Depenses_${stamp}.csv`);

    const mailtoUrl = buildAccountantMailtoUrl({
      accountantEmail: targetEmail,
      garageName: settings.name || `${settings.firstName || ''} ${settings.lastName || ''}`.trim(),
      siret: settings.siret,
      periodLabel: activePeriodLabel,
      soldCount: salesJournalResult.count,
      totalRevenue: salesJournalResult.totalRevenue,
      expensesCount: expensesJournalResult.count,
      totalExpenses: expensesJournalResult.totalAmount,
      lang,
    });

    const mailLink = document.createElement('a');
    mailLink.href = mailtoUrl;
    document.body.appendChild(mailLink);
    mailLink.click();
    document.body.removeChild(mailLink);

    setStatusMessage({
      type: 'success',
      text: L(
        `Les 2 CSV ont été téléchargés et le message pré-rempli pour ${targetEmail} est prêt.`,
        `Оба CSV-файла скачаны, открыто письмо для ${targetEmail}.`,
        `Երկու CSV ֆայլերը ներբեռնվել են, և նամակը պատրաստ է ${targetEmail}-ի համար։`,
        `ორივე CSV ჩამოტვირთულია და წერილი მზადაა (${targetEmail}).`
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
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : L(
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
    const stamp = new Date().toISOString().split('T')[0];
    triggerCsvDownload(csv, `AutoGarage_Vehicules_${stamp}.csv`);
    void logUserActivity({
      userId: resolvedUserId,
      garageId: settings.garageId,
      actorEmail: resolvedEmail,
      action: 'export_csv',
      targetLabel: `AutoGarage_Vehicules_${stamp}.csv`,
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

  const primaryTabs: {
    id: PrimarySettingsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'company',
      label: L('Entreprise', 'Компания', 'Ընկերություն', 'კომպանիა'),
      icon: Building2,
    },
    {
      id: 'branding',
      label: L(
        'Identité visuelle & Signature',
        'Брендинг и подпись',
        'Բրենդինգ և ստորագրություն',
        'ბრენდინგი და ხელმოწერა'
      ),
      icon: Palette,
    },
    {
      id: 'accounting',
      label: L(
        'Comptabilité & Export',
        'Учёт и экспорт',
        'Հաշվապահություն և արտահանում',
        'ბუღალტერია და ექსპორტი'
      ),
      icon: Receipt,
    },
    {
      id: 'taxes_backup',
      label: L(
        'Taxes & Sauvegarde',
        'Налоги и бэкап',
        'Հարկեր և պահուստավորում',
        'გადასახადები და ასლი'
      ),
      icon: Coins,
    },
  ];

  const inputClass =
    'w-full h-9 px-3.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-xs font-semibold text-slate-300 mb-1';
  const siretDigits = (activeBusinessFields.siret || '').replace(/\s+/g, '');
  const safePrimaryHex = normalizeHexColor(settings.brandPrimaryColor, '#0f172a');
  const safeSecondaryHex = normalizeHexColor(settings.brandSecondaryColor, '#f59e0b');

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

  const tabBar = (
    <div
      role="tablist"
      aria-label={L('Onglets des paramètres', 'Вкладки настроек', 'Կարգավորումների ներդիրներ', 'პარამეტრების ჩანართები')}
      data-testid="settings-tabs-bar"
      className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-950/80 border border-slate-800 overflow-x-auto no-scrollbar"
    >
      {primaryTabs.map((tab) => {
        const Icon = tab.icon;
        const active = displayTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`settings-tab-${tab.id}`}
            onClick={() => {
              setErrors({});
              setStatusMessage(null);
              setActiveTab(tab.id);
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              active
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  const mainContent = (
    <div className="space-y-4">
      {displayTab === 'subscription' ? (
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <button
            type="button"
            data-testid="settings-back-from-subscription"
            onClick={() => setActiveTab('company')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-slate-200 hover:text-white border border-slate-800 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{L('Retour aux paramètres', 'Назад к настройкам', 'Վերադառնալ', 'უკან პარამეტრებში')}</span>
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
            <Crown className="w-3.5 h-3.5" />
            <span>{L('Abonnement & Forfait', 'Тариф и подписка', 'Սակագին', 'ტარიფი')}</span>
          </span>
        </div>
      ) : (
        tabBar
      )}

      {statusMessage && (
        <div
          role={statusMessage.type === 'error' ? 'alert' : 'status'}
          data-testid="settings-status-banner"
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

      {/* ============================================================
          TAB 1: ENTREPRISE / КОМПАНИЯ (Company Details & Banking)
      ============================================================ */}
      {displayTab === 'company' && (
        <form
          id="company-settings-form"
          data-testid="settings-panel-company"
          onSubmit={handleSaveSettings}
          className="space-y-4"
        >
          <div>
            <h3 className="text-base font-bold text-white">
              {L(
                "Coordonnées de l'entreprise & Banque",
                'Реквизиты компании и банковский счёт',
                'Ընկերության տվյալներ և բանկային ռեկվիզիտներ',
                'კომპანიის რეკვიზიტები და საბანკო ანგარიში'
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {L(
                'Ces informations pré-remplissent automatiquement vos factures, documents Factur-X et formulaires Cerfa 15776*02.',
                'Эти данные автоматически подставляются в счета-фактуры, Factur-X и бланки Cerfa 15776*02.',
                'Այս տվյալները ավտոմատ կիրառվում են հաշիվներում, Factur-X և Cerfa 15776*02 ձևաթղթերում։',
                'ეს მონაცემები ავტომატურად ივსება ინვოისებში, Factur-X-სა და Cerfa 15776*02 ფორმებში.'
              )}
            </p>
          </div>

          {/* Section 1: Business Profile(s) */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {L(
                      'Profil professionnel (Micro-entreprise / Entreprise)',
                      'Профессиональный профиль (Компания / ИП)',
                      'Բիզնես պրոֆիլ (ԱՁ / Ընկերություն)',
                      'ბიზნეს პროფილი (კომპანია / ი/მ)'
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {L(
                      'Utilisé pour les véhicules marqués « Activité pro » (SIRET, URSSAF et factures B2B/B2C).',
                      'Используется для авто с отметкой «Проф. деятельность» (SIRET, налоги URSSAF и счета).',
                      'Օգտագործվում է «Մասնագիտական» մեքենաների համար։',
                      'გამოიყენება «პროფ. საქმიანობა» ავტომობილებისთვის.'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {businessProfilesList.length > 0 && (
                  <ThemedSelect
                    testId="settings-business-profile-select"
                    ariaLabel={L('Choisir une entreprise', 'Выбрать компанию', 'Ընտրել ընկերություն', 'აირჩიეთ კომპანია')}
                    value={activeBusinessProfile?.id || ''}
                    onChange={(val) => {
                      setErrors({});
                      setSelectedBusinessId(val);
                    }}
                    options={businessProfilesList.map((b) => ({
                      value: b.id,
                      label: `${getSellerProfileDisplayName(b, 'micro') || L('Entreprise sans nom', 'Без названия', 'Անանուն', 'უსახელო')}${
                        b.isDefault ? L(' (par défaut)', ' (осн.)', ' (հիմն.)', ' (ძირ.)') : ''
                      }`,
                    }))}
                    triggerClassName="h-8 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-white"
                  />
                )}
                <button
                  type="button"
                  data-testid="settings-add-business-profile-btn"
                  onClick={handleAddBusinessProfile}
                  className="h-8 px-2.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 transition inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{L('Ajouter', 'Добавить', 'Ավելացնել', 'დამატება')}</span>
                </button>
                {activeBusinessProfile && !activeBusinessProfile.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefaultBusinessProfile(activeBusinessProfile.id)}
                    className="h-8 px-2.5 rounded-xl text-[11px] font-semibold bg-slate-950 text-slate-300 border border-slate-800 hover:text-white transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Star className="w-3 h-3 text-amber-400" />
                    <span>{L('Par défaut', 'Основной', 'Հիմնական', 'ძირითადი')}</span>
                  </button>
                )}
                {activeBusinessProfile && businessProfilesList.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteBusinessProfile(activeBusinessProfile.id)}
                    className="h-8 px-2.5 rounded-xl text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="settings-company-name" className={labelClass}>
                  {L(
                    "Nom de l'entreprise / Garage *",
                    'Название компании / Автосалона *',
                    'Ընկերության անվանում *',
                    'კომპანიის დასახელება *'
                  )}
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="settings-company-name"
                    type="text"
                    value={activeBusinessFields.name || ''}
                    onChange={(e) => updateBusinessField({ name: e.target.value })}
                    placeholder="ex. Garage Prestige Lyon"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                {errors.name && <p className="text-[11px] text-red-400 mt-1">{errors.name}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="settings-siret" className="text-xs font-semibold text-slate-300">
                    {L(
                      'Numéro SIRET (14 chiffres)',
                      'SIRET / Идентификатор (14 цифр)',
                      'SIRET համար (14 նիշ)',
                      'SIRET ნომერი (14 ციფრი)'
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
                    value={activeBusinessFields.siret || ''}
                    onChange={(e) => updateBusinessField({ siret: e.target.value })}
                    placeholder="ex. 123 456 789 00012"
                    className={`${inputClass} pl-9 font-mono`}
                  />
                </div>
                {errors.siret && <p className="text-[11px] text-red-400 mt-1">{errors.siret}</p>}
              </div>
            </div>

            {/* Split Address Fields */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div className="col-span-1">
                <label htmlFor="settings-street-num" className={labelClass}>
                  {L('N° de voie *', 'Дом № *', 'Շենք № *', 'ნომერი *')}
                </label>
                <input
                  id="settings-street-num"
                  type="text"
                  required
                  value={activeBusinessFields.streetNumber || ''}
                  onChange={(e) => updateBusinessField({ streetNumber: e.target.value })}
                  placeholder="ex. 24"
                  className={`${inputClass}${errors.streetNumber ? ' border-red-500 ring-2 ring-red-500/20' : ''}`}
                />
                {errors.streetNumber && (
                  <p className="text-[11px] text-red-400 mt-1">{errors.streetNumber}</p>
                )}
              </div>

              <div className="col-span-1">
                <label htmlFor="settings-street-ext" className={labelClass}>
                  {L('Extension', 'Корпус/лит.', 'Կցորդ', 'დამატება')}
                </label>
                <input
                  id="settings-street-ext"
                  type="text"
                  value={activeBusinessFields.streetExtension || ''}
                  onChange={(e) => updateBusinessField({ streetExtension: e.target.value })}
                  placeholder="bis, ter"
                  className={inputClass}
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="settings-street-type" className={labelClass}>
                  {L('Type de voie', 'Тип улицы', 'Տեսակ', 'ქუჩის ტიპი')}
                </label>
                <ThemedSelect
                  id="settings-street-type"
                  testId="settings-street-type-select"
                  ariaLabel={L('Type de voie', 'Тип улицы', 'Տեսակ', 'ქუჩის ტიპი')}
                  value={activeBusinessFields.streetType || ''}
                  onChange={(val) => updateBusinessField({ streetType: val })}
                  options={[
                    { value: '', label: '—' },
                    ...STREET_TYPES.map((st) => ({ value: st, label: st })),
                  ]}
                  triggerClassName={inputClass}
                />
              </div>

              <div className="col-span-2 sm:col-span-3">
                <label htmlFor="settings-street-name" className={labelClass}>
                  {L('Adresse / Nom de la voie *', 'Улица / Адрес *', 'Փողոց / Հասցե *', 'ქუჩის დასახელება *')}
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="settings-street-name"
                    type="text"
                    required
                    value={activeBusinessFields.streetName || ''}
                    onChange={(e) => updateBusinessField({ streetName: e.target.value })}
                    placeholder="ex. de la République"
                    className={`${inputClass} pl-9${errors.streetName ? ' border-red-500 ring-2 ring-red-500/20' : ''}`}
                  />
                </div>
                {errors.streetName && (
                  <p className="text-[11px] text-red-400 mt-1">{errors.streetName}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="settings-postal-code" className={labelClass}>
                  {L('Code postal *', 'Индекс *', 'Փոստային ինդեքս *', 'საფოსტო კოდი *')}
                </label>
                <input
                  id="settings-postal-code"
                  type="text"
                  maxLength={5}
                  value={activeBusinessFields.postalCode || ''}
                  onChange={(e) => updateBusinessField({ postalCode: e.target.value })}
                  placeholder="ex. 69007"
                  className={`${inputClass} font-mono`}
                />
                {errors.postalCode && <p className="text-[11px] text-red-400 mt-1">{errors.postalCode}</p>}
              </div>

              <div>
                <label htmlFor="settings-city" className={labelClass}>
                  {L('Ville *', 'Город *', 'Քաղաք *', 'ქალაქი *')}
                </label>
                <input
                  id="settings-city"
                  type="text"
                  value={activeBusinessFields.city || ''}
                  onChange={(e) => updateBusinessField({ city: e.target.value })}
                  placeholder="ex. Lyon"
                  className={inputClass}
                />
                {errors.city && <p className="text-[11px] text-red-400 mt-1">{errors.city}</p>}
              </div>

              <div>
                <label htmlFor="settings-country" className={labelClass}>
                  {L('Pays', 'Страна', 'Երկիր', 'ქვეყანა')}
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="settings-country"
                    type="text"
                    value={activeBusinessFields.country || ''}
                    onChange={(e) => updateBusinessField({ country: e.target.value })}
                    placeholder="ex. France"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>
            </div>

            {/* Contact Phone & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="settings-phone" className={labelClass}>
                  {L('Téléphone', 'Телефон', 'Հեռախոս', 'ტელეფონი')}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="settings-phone"
                    type="tel"
                    value={activeBusinessFields.phone || ''}
                    onChange={(e) => updateBusinessField({ phone: e.target.value })}
                    placeholder="ex. 06 12 34 56 78"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="settings-email" className={labelClass}>
                  {L('E-mail professionnel *', 'Рабочий e-mail *', 'Աշխատանքային էլ․ փոստ *', 'სამუშაო ელფოსტა *')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="settings-email"
                    type="email"
                    value={activeBusinessFields.email || ''}
                    onChange={(e) => updateBusinessField({ email: e.target.value })}
                    placeholder="ex. contact@mongarage.fr"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                {errors.email && <p className="text-[11px] text-red-400 mt-1">{errors.email}</p>}
              </div>
            </div>

            {/* VAT & Banking Details */}
            <div className="pt-2 border-t border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Landmark className="w-4 h-4 text-amber-400" />
                <span>
                  {L(
                    'TVA & Coordonnées bancaires (Facturation)',
                    'НДС и банковские реквизиты (для счетов)',
                    'ԱԱՀ և բանկային տվյալներ',
                    'დღგ და საბანკო რეკვიზიტები'
                  )}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="settings-vat-number" className={labelClass}>
                    {L(
                      'N° TVA (optionnel)',
                      'НДС / N° TVA (опционально)',
                      'ԱԱՀ համար (ըստ ցանկության)',
                      'დღგ ნომერი (არასავალდებულო)'
                    )}
                  </label>
                  <div className="relative">
                    <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="settings-vat-number"
                      type="text"
                      value={activeBusinessFields.vatNumber || ''}
                      onChange={(e) => updateBusinessField({ vatNumber: e.target.value.toUpperCase() })}
                      placeholder="ex. FR12345678901"
                      className={`${inputClass} pl-9 font-mono`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="settings-iban" className={labelClass}>
                    {L('IBAN / RIB', 'IBAN / RIB', 'IBAN / RIB', 'IBAN / RIB')}
                  </label>
                  <input
                    id="settings-iban"
                    type="text"
                    value={activeBusinessFields.iban || ''}
                    onChange={(e) => updateBusinessField({ iban: e.target.value.toUpperCase() })}
                    placeholder="ex. FR76 3000 6000 0112 3456 7890 189"
                    className={`${inputClass} font-mono`}
                  />
                  {errors.iban && <p className="text-[11px] text-red-400 mt-1">{errors.iban}</p>}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                data-testid="settings-save-company-btn"
                className="h-9 px-5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{L('Enregistrer l’entreprise', 'Сохранить компанию', 'Պահպանել ընկերությունը', 'კომპანიის შენახვა')}</span>
              </button>
            </div>
          </div>

          {/* Section 2: Multiple Personal Profiles (Particulier) */}
          <div
            data-testid="settings-personal-profiles-section"
            className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-sky-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {L(
                      'Profils Particuliers (Vente privée)',
                      'Личные профили продавцов (Частная продажа)',
                      'Անհատ վաճառողների պրոֆիլներ',
                      'პირადი გამყიდველის პროფილები'
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {L(
                      'Enregistrez plusieurs personnes physiques (ex. gérant, conjoint, frère) pour les sélectionner par véhicule et pré-remplir le Cerfa sans SIRET.',
                      'Добавляйте одного или нескольких частных продавцов (владелец, брат, супруга) для выбора на конкретном авто и заполнения Cerfa без SIRET.',
                      'Ավելացրեք մեկ կամ մի քանի անհատ վաճառողների՝ մեքենաներին կցելու համար։',
                      'დაამატეთ ერთი ან მეტი კერძო გამყიდველი ავტომობილებზე ასარჩევად.'
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="settings-add-personal-profile-btn"
                onClick={handleOpenNewPersonalDraft}
                className="h-8 px-3 rounded-xl text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/40 hover:bg-sky-500/25 transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {L(
                    'Ajouter un profil particulier',
                    'Добавить личный профиль',
                    'Ավելացնել անհատական պրոֆիլ',
                    'პირადი პროფილის დამატება'
                  )}
                </span>
              </button>
            </div>

            {personalProfilesList.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-dashed border-slate-800 text-xs text-slate-400">
                {L(
                  'Aucun profil particulier enregistré pour le moment. Cliquez sur « Ajouter un profil particulier ».',
                  'Личные профили пока не добавлены. Нажмите «Добавить личный профиль».',
                  'Անհատական պրոֆիլներ դեռ չկան։ Սեղմեք «Ավելացնել անհատական պրոֆիլ»։',
                  'პირადი პროფილები ჯერ არ არის დამატებული.'
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {personalProfilesList.map((entry) => {
                  const fullAddress = [
                    [entry.streetNumber, entry.streetExtension, entry.streetType, entry.streetName]
                      .filter(Boolean)
                      .join(' '),
                    [entry.postalCode, entry.city, entry.country].filter(Boolean).join(' '),
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <div
                      key={entry.id}
                      data-testid={`settings-personal-profile-card-${entry.id}`}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {getSellerProfileDisplayName(entry, 'particulier')}
                          </span>
                          {entry.sex && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300">
                              {entry.sex}
                            </span>
                          )}
                          {(entry.birthDate || entry.birthPlace) && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                              {entry.birthDate ? formatFrenchDate(entry.birthDate) : ''}
                              {entry.birthDate && entry.birthPlace ? ` · ${entry.birthPlace}` : entry.birthPlace || ''}
                            </span>
                          )}
                          {entry.isDefault && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                              {L('Par défaut', 'Основной', 'Հիմնական', 'ძირითადი')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {fullAddress ||
                            L('Adresse non renseignée', 'Адрес не указан', 'Հասցեն նշված չէ', 'მისამართი მითითებული არ არის')}
                          {entry.phone ? ` · ${entry.phone}` : ''}
                          {entry.email ? ` · ${entry.email}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!entry.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultPersonalProfile(entry.id)}
                            className="h-7 px-2 rounded-lg text-[11px] font-semibold bg-slate-900 text-slate-300 border border-slate-800 hover:text-white transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Star className="w-3 h-3 text-sky-400" />
                            <span>{L('Par défaut', 'Основной', 'Հիմնական', 'ძირითადი')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid={`settings-edit-personal-${entry.id}`}
                          onClick={() => {
                            setPersonalErrors({});
                            setEditingPersonalDraft({ ...entry });
                          }}
                          className="h-7 px-2 rounded-lg text-[11px] font-semibold bg-slate-900 text-slate-200 border border-slate-800 hover:bg-slate-800 transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>{L('Modifier', 'Изменить', 'Խմբագրել', 'შეცვლა')}</span>
                        </button>
                        <button
                          type="button"
                          data-testid={`settings-delete-personal-${entry.id}`}
                          onClick={() => handleDeletePersonalProfile(entry.id)}
                          className="h-7 px-2 rounded-lg text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {editingPersonalDraft && (
              <div
                data-testid="settings-personal-profile-editor"
                className="p-3.5 rounded-xl bg-slate-950 border border-sky-500/40 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-sky-300">
                    {editingPersonalDraft.id
                      ? L('Modifier le profil particulier', 'Редактировать личный профиль', 'Խմբագրել անհատական պրոֆիլը', 'პირადი პროფილის რედაქტირება')
                      : L('Nouveau profil particulier', 'Новый личный профиль', 'Նոր անհատական պրոֆիլ', 'ახალი პირადი პროფილი')}
                  </span>
                </div>

                {Object.values(personalErrors).length > 0 && (
                  <p className="text-[11px] text-red-400">
                    {Object.values(personalErrors)[0]}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="personal-draft-lastname" className={labelClass}>
                      {L('Nom *', 'Фамилия (Nom) *', 'Ազգանուն *', 'გვარი *')}
                    </label>
                    <input
                      id="personal-draft-lastname"
                      data-testid="personal-draft-lastname"
                      type="text"
                      value={editingPersonalDraft.lastName || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, lastName: e.target.value.toUpperCase() } : prev
                        )
                      }
                      placeholder="ex. MARTIN"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="personal-draft-firstname" className={labelClass}>
                      {L('Prénom *', 'Имя (Prénom) *', 'Անուն *', 'სახელი *')}
                    </label>
                    <input
                      id="personal-draft-firstname"
                      data-testid="personal-draft-firstname"
                      type="text"
                      value={editingPersonalDraft.firstName || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, firstName: e.target.value } : prev
                        )
                      }
                      placeholder="ex. Luc"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <span className={labelClass}>{L('Sexe (M / F)', 'Пол (M / F)', 'Սեռ (M / F)', 'სქესი (M / F)')}</span>
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label={L('Sexe (M / F)', 'Пол (M / F)', 'Սեռ (M / F)', 'სქესი (M / F)')}>
                      {(['M', 'F'] as const).map((sx) => (
                        <button
                          key={sx}
                          type="button"
                          data-testid={`personal-draft-sex-${sx}`}
                          aria-pressed={editingPersonalDraft.sex === sx}
                          onClick={() =>
                            setEditingPersonalDraft((prev) =>
                              prev ? { ...prev, sex: prev.sex === sx ? '' : sx } : prev
                            )
                          }
                          className={`h-9 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            editingPersonalDraft.sex === sx
                              ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          {sx === 'M'
                            ? `M · ${L('Homme', 'Муж.', 'Ար.', 'მამრ.')}`
                            : `F · ${L('Femme', 'Жен.', 'Իգ.', 'მდედ.')}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="personal-draft-birth-date" className={labelClass}>
                      {L('Date de naissance (Né(e) le)', 'Дата рождения', 'Ծննդյան ամսաթիվ', 'დაბადების თარიღი')}
                    </label>
                    <LocaleDateInput
                      id="personal-draft-birth-date"
                      testId="personal-draft-birth-date"
                      ariaLabel={L('Date de naissance', 'Дата рождения', 'Ծննդյան ամսաթիվ', 'დაბადების თარიღი')}
                      value={editingPersonalDraft.birthDate || ''}
                      onChange={(iso) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, birthDate: iso } : prev
                        )
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="personal-draft-birth-place" className={labelClass}>
                      {L('Lieu de naissance (à)', 'Место рождения', 'Ծննդավայր', 'დაბადების ადგილი')}
                    </label>
                    <input
                      id="personal-draft-birth-place"
                      data-testid="personal-draft-birth-place"
                      type="text"
                      value={editingPersonalDraft.birthPlace || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, birthPlace: e.target.value } : prev
                        )
                      }
                      placeholder={L('ex. Lyon (69)', 'напр. Lyon (69)', 'օր.՝ Lyon (69)', 'მაგ. Lyon (69)')}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                  <div className="col-span-1">
                    <label className={labelClass}>{L('N° de voie', 'Дом №', 'Շենք №', '№')}</label>
                    <input
                      type="text"
                      data-testid="personal-draft-street-number"
                      value={editingPersonalDraft.streetNumber || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, streetNumber: e.target.value } : prev
                        )
                      }
                      placeholder="15"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-1">
                    <label className={labelClass}>{L('Type de voie', 'Тип', 'Տեսակ', 'ტიპი')}</label>
                    <ThemedSelect
                      ariaLabel={L('Type de voie', 'Тип улицы', 'Տեսակ', 'ქუჩის ტიპი')}
                      value={editingPersonalDraft.streetType || ''}
                      onChange={(val) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, streetType: val } : prev
                        )
                      }
                      options={[
                        { value: '', label: '—' },
                        ...STREET_TYPES.map((st) => ({ value: st, label: st })),
                      ]}
                      triggerClassName={inputClass}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-2">
                    <label className={labelClass}>{L('Nom de la voie', 'Улица', 'Փողոց', 'ქუჩა')}</label>
                    <input
                      type="text"
                      data-testid="personal-draft-street-name"
                      value={editingPersonalDraft.streetName || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, streetName: e.target.value } : prev
                        )
                      }
                      placeholder="Victor Hugo"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-1">
                    <label className={labelClass}>{L('Code postal', 'Индекс', 'Ինդեքս', 'ინდექსი')}</label>
                    <input
                      type="text"
                      maxLength={5}
                      data-testid="personal-draft-postal"
                      value={editingPersonalDraft.postalCode || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, postalCode: e.target.value } : prev
                        )
                      }
                      placeholder="69002"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div className="col-span-1">
                    <label className={labelClass}>{L('Ville', 'Город', 'Քաղաք', 'ქალაქი')}</label>
                    <input
                      type="text"
                      data-testid="personal-draft-city"
                      value={editingPersonalDraft.city || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, city: e.target.value } : prev
                        )
                      }
                      placeholder="Lyon"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{L('Téléphone', 'Телефон', 'Հեռախոս', 'ტელეფონი')}</label>
                    <input
                      type="tel"
                      data-testid="personal-draft-phone"
                      value={editingPersonalDraft.phone || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, phone: e.target.value } : prev
                        )
                      }
                      placeholder="06 11 22 33 44"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>E-mail</label>
                    <input
                      type="email"
                      data-testid="personal-draft-email"
                      value={editingPersonalDraft.email || ''}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, email: e.target.value } : prev
                        )
                      }
                      placeholder="prenom@exemple.fr"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingPersonalDraft.isDefault)}
                      onChange={(e) =>
                        setEditingPersonalDraft((prev) =>
                          prev ? { ...prev, isDefault: e.target.checked } : prev
                        )
                      }
                      className="rounded border-slate-700 bg-slate-900 text-sky-500"
                    />
                    <span>
                      {L(
                        'Définir comme profil particulier par défaut',
                        'Использовать как основной личный профиль по умолчанию',
                        'Օգտագործել որպես հիմնական անհատական պրոֆիլ',
                        'გამოყენება ძირითად პირად პროფილად'
                      )}
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPersonalErrors({});
                        setEditingPersonalDraft(null);
                      }}
                      className="h-8 px-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer"
                    >
                      {L('Annuler', 'Отмена', 'Չեղարկել', 'გაუქმება')}
                    </button>
                    <button
                      type="button"
                      data-testid="personal-draft-save-btn"
                      disabled={isSavingPersonal}
                      onClick={handleSavePersonalDraft}
                      className="h-8 px-4 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{L('Enregistrer le profil', 'Сохранить профиль', 'Պահպանել պրոֆիլը', 'პროფილის შენახვა')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      )}

      {/* ============================================================
          TAB 2: IDENTITÉ VISUELLE & SIGNATURE (Branding & Signature)
      ============================================================ */}
      {displayTab === 'branding' && (
        <div data-testid="settings-panel-branding" className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">
              {L(
                'Identité visuelle & Signature numérique',
                'Брендинг компании и цифровая подпись',
                'Կազմակերպության բրենդինգ և թվային ստորագրություն',
                'კომპანიის ბრենდინგი და ციფრული ხელმოწერა'
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {L(
                'Personnalisez l’en-tête de vos factures PDF et signez directement vos documents officiels.',
                'Персонализируйте шапку PDF-счетов и добавьте подпись для счетов и бланков Cerfa.',
                'Անհատականացրեք PDF հաշիվները և ավելացրեք Ձեր ստորագրությունը։',
                'მოარგეთ PDF ინვოისები და დაამატეთ ხელმოწერა დოკუმენტებში.'
              )}
            </p>
          </div>

          {/* 1. Logo Upload Card */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-amber-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {L("Logo de l'entreprise", 'Логотип компании', 'Ընկերության լոգո', 'კომპანიის ლოგო')}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {L(
                      'Formats PNG, JPG ou WEBP — affiché en haut de vos factures et bilans PDF.',
                      'Форматы PNG, JPG или WEBP — отображается в шапке счетов-фактур и отчётов.',
                      'PNG, JPG կամ WEBP ձևաչափեր՝ հաշիվների վերնագրում։',
                      'PNG, JPG ან WEBP ფორმატები — აისახება ინვოისების თავსართში.'
                    )}
                  </p>
                </div>
              </div>

              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                data-testid="settings-logo-input"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {settings.logoDataUrl ? (
                <div className="h-20 px-4 rounded-xl bg-white border border-slate-700 flex items-center justify-center shrink-0">
                  <img
                    src={settings.logoDataUrl}
                    alt="Logo garage"
                    data-testid="settings-logo-preview"
                    className="max-h-16 max-w-[180px] object-contain"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="h-20 px-5 rounded-xl border border-dashed border-slate-700 bg-slate-950/70 hover:border-amber-500/60 text-slate-400 hover:text-slate-200 transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span className="text-[11px] font-medium">
                    {L('Aucun logo importé', 'Логотип не загружен', 'Լոգո չկա', 'ლოგო არ არის')}
                  </span>
                </button>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="settings-logo-upload-btn"
                  disabled={isProcessingLogo}
                  onClick={() => logoInputRef.current?.click()}
                  className="h-9 px-3.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {settings.logoDataUrl ? (
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>
                    {isProcessingLogo
                      ? L('Traitement...', 'Обработка...', 'Մշակում...', 'დამუშავება...')
                      : settings.logoDataUrl
                      ? L('Remplacer le logo', 'Заменить логотип', 'Փոխարինել լոգոն', 'ლოგოს შეცვლა')
                      : L('Importer un logo', 'Загрузить логотип', 'Վերբեռնել լոգո', 'ლოგოს ატვირთვა')}
                  </span>
                </button>

                {settings.logoDataUrl && (
                  <button
                    type="button"
                    data-testid="settings-logo-remove-btn"
                    onClick={handleRemoveLogo}
                    className="h-9 px-3.5 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{L('Supprimer', 'Удалить', 'Հեռացնել', 'წაშლა')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. Brand Accent Color Picker + Live Document Preview */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-amber-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {L('Couleurs de marque (Documents PDF)', 'Цвета бренда (для PDF-документов)', 'Բրենդի գույներ (PDF)', 'ბრენდის ფერები (PDF)')}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {L(
                      'Appliquées à la bannière et aux liserés de vos factures et bilans financiers.',
                      'Используются в шапке и акцентах ваших счетов-фактур и финансовых отчётов.',
                      'Կիրառվում են հաշիվների և ֆինանսական հաշվետվությունների վրա։',
                      'გამოიყენება ინვოისებისა და ფინანსური ანგარიშების თავსართში.'
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="settings-brand-reset-btn"
                onClick={() =>
                  updateSettingsField({
                    brandPrimaryColor: '#0f172a',
                    brandSecondaryColor: '#f59e0b',
                  })
                }
                className="text-[11px] font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                {L('Réinitialiser par défaut', 'Сбросить цвета', 'Վերականգնել', 'განულება')}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="settings-brand-primary-hex" className={labelClass}>
                  {L('Couleur principale', 'Основной цвет', 'Հիմնական գույն', 'ძირითადი ფერი')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={L('Sélecteur couleur principale', 'Основной цвет', 'Հիմնական գույն', 'ძირითადი ფერი')}
                    data-testid="settings-brand-primary-color"
                    value={safePrimaryHex}
                    onChange={(e) => updateSettingsField({ brandPrimaryColor: e.target.value })}
                    className="w-10 h-9 rounded-xl bg-slate-950 border border-slate-800 p-1 cursor-pointer shrink-0"
                  />
                  <input
                    id="settings-brand-primary-hex"
                    data-testid="settings-brand-primary-hex"
                    type="text"
                    value={settings.brandPrimaryColor || '#0f172a'}
                    onChange={(e) => updateSettingsField({ brandPrimaryColor: e.target.value })}
                    placeholder="#0f172a"
                    className={`${inputClass} font-mono`}
                  />
                </div>
                {errors.brandPrimaryColor && (
                  <p className="text-[11px] text-red-400 mt-1">{errors.brandPrimaryColor}</p>
                )}
              </div>

              <div>
                <label htmlFor="settings-brand-secondary-hex" className={labelClass}>
                  {L("Couleur d'accent", 'Акцентный цвет', 'Շեշտադրման գույն', 'აქცენტის ფერი')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={L("Sélecteur couleur d'accent", 'Акцентный цвет', 'Շեշտադրման գույն', 'აქცენტის ფერი')}
                    data-testid="settings-brand-secondary-color"
                    value={safeSecondaryHex}
                    onChange={(e) => updateSettingsField({ brandSecondaryColor: e.target.value })}
                    className="w-10 h-9 rounded-xl bg-slate-950 border border-slate-800 p-1 cursor-pointer shrink-0"
                  />
                  <input
                    id="settings-brand-secondary-hex"
                    data-testid="settings-brand-secondary-hex"
                    type="text"
                    value={settings.brandSecondaryColor || '#f59e0b'}
                    onChange={(e) => updateSettingsField({ brandSecondaryColor: e.target.value })}
                    placeholder="#f59e0b"
                    className={`${inputClass} font-mono`}
                  />
                </div>
                {errors.brandSecondaryColor && (
                  <p className="text-[11px] text-red-400 mt-1">{errors.brandSecondaryColor}</p>
                )}
              </div>
            </div>

            {/* Live Invoice Header Preview */}
            <div
              data-testid="settings-brand-preview"
              className="rounded-xl overflow-hidden border border-slate-700"
            >
              <div
                style={{ backgroundColor: safePrimaryHex }}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-white/75">
                    {L('Aperçu en-tête facture PDF', 'Предпросмотр шапки PDF-счёта', 'PDF վերնագրի նախադիտում', 'PDF თავსართის ნიმუში')}
                  </span>
                  <span className="block text-sm font-extrabold text-white truncate">
                    {settings.name?.trim() || 'AutoGarage Manager'}
                  </span>
                </div>
                {settings.logoDataUrl && (
                  <img
                    src={settings.logoDataUrl}
                    alt="Aperçu logo"
                    className="h-9 w-auto max-w-[110px] object-contain bg-white/95 rounded px-1.5 py-0.5"
                  />
                )}
              </div>
              <div style={{ backgroundColor: safeSecondaryHex }} className="h-1.5 w-full" />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                data-testid="settings-save-branding-btn"
                onClick={() => handleSaveSettings()}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{L('Enregistrer', 'Сохранить', 'Պահպանել', 'შენახვა')}</span>
              </button>
            </div>
          </div>

          {/* 3. Owner Digital Signature Pad */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <PenTool className="w-4 h-4 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold text-white">
                  {L(
                    'Signature numérique du gérant / vendeur',
                    'Цифровая подпись владельца / продавца',
                    'Վաճառողի թվային ստորագրություն',
                    'მფლობელის ციფრული ხელმოწერა'
                  )}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {L(
                    'Signez dans le cadre ci-dessous. Votre signature est apposée automatiquement sur les factures et Cerfa 15776*02.',
                    'Распишитесь в поле ниже. Подпись автоматически добавляется в счета-фактуры и формуляры Cerfa 15776*02.',
                    'Ստորագրեք ստորև՝ հաշիվների և Cerfa ձևաթղթերի ավտոմատ լրացման համար։',
                    'მოაწერეთ ხელი ქვემოთ ინვოისებსა და Cerfa 15776*02-ზე ავტომატური დასმისთვის.'
                  )}
                </p>
              </div>
            </div>

            <SignaturePad
              value={settings.signatureDataUrl}
              onSave={handleSaveSignature}
              onClearSaved={handleRemoveSignature}
              isSaving={isSavingSignature}
            />
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 3: COMPTABILITÉ & EXPORT (Accounting & Exports)
      ============================================================ */}
      {displayTab === 'accounting' && (
        <div data-testid="settings-panel-accounting" className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">
              {L(
                'Comptabilité & Export expert-comptable',
                'Бухгалтерский учёт и экспорт CSV',
                'Հաշվապահություն և CSV արտահանում',
                'ბუღალტერია და CSV ექსპორტი'
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {L(
                'Générez vos journaux de ventes et de dépenses par période et préparez l’envoi à votre comptable.',
                'Выгружайте журналы продаж и расходов за период и отправляйте сводку вашему бухгалтеру.',
                'Արտահանեք վաճառքների և ծախսերի մատյանները և ուղարկեք հաշվապահին։',
                'გაიტანეთ გაყიდვებისა და ხარჯების ჟურნალები და მოამზადეთ წერილი ბუღალტრისთვის.'
              )}
            </p>
          </div>

          {/* 1. Accountant Email */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="settings-accountant-email" className={labelClass}>
                  {L(
                    "E-mail de l'expert-comptable",
                    'E-mail бухгалтера',
                    'Հաշվապահի էլ․ փոստ',
                    'ბუღალტრის ელფოსტა'
                  )}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="settings-accountant-email"
                    data-testid="settings-accountant-email-input"
                    type="email"
                    value={settings.accountantEmail || ''}
                    onChange={(e) => {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.accountantEmail;
                        return next;
                      });
                      updateSettingsField({ accountantEmail: e.target.value });
                    }}
                    placeholder="ex. cabinet@expert-comptable.fr"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                {errors.accountantEmail && (
                  <p className="text-[11px] text-red-400 mt-1">{errors.accountantEmail}</p>
                )}
              </div>

              <button
                type="button"
                data-testid="settings-save-accountant-btn"
                onClick={() => handleSaveSettings()}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{L('Enregistrer', 'Сохранить', 'Պահպանել', 'შენახვა')}</span>
              </button>
            </div>
          </div>

          {/* 2. Period Selector & CSV Export Cards */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>{L("Période d'export", 'Период выгрузки', 'Արտահանման ժամկետ', 'ექსპორტის პერიოდი')}</span>
              </div>

              <div
                data-testid="settings-export-period-bar"
                className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800"
              >
                {(['month', 'quarter', 'year', 'all', 'custom'] as const).map((rng) => {
                  const active = exportRange === rng;
                  return (
                    <button
                      key={rng}
                      type="button"
                      data-testid={`settings-export-period-${rng}`}
                      onClick={() => setExportRange(rng)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        active
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {periodLabels[rng]}
                    </button>
                  );
                })}
              </div>
            </div>

            {exportRange === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <div>
                  <label htmlFor="export-start-date" className={labelClass}>
                    {L('Date de début', 'Дата начала', 'Սկզբի ամսաթիվ', 'დაწყების თარიღი')}
                  </label>
                  <input
                    id="export-start-date"
                    type="date"
                    value={customExportRange.startDate}
                    onChange={(e) =>
                      setCustomExportRange((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="export-end-date" className={labelClass}>
                    {L('Date de fin', 'Дата окончания', 'Ավարտի ամսաթիվ', 'დასრულების თარიღი')}
                  </label>
                  <input
                    id="export-end-date"
                    type="date"
                    value={customExportRange.endDate}
                    onChange={(e) =>
                      setCustomExportRange((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* Two Journal Summary Cards + Quick Download Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {L('Journal des ventes', 'Журнал продаж', 'Վաճառքների մատյան', 'გაყიდვების ჟურნალი')}
                    </span>
                    <span
                      data-testid="settings-sales-journal-count"
                      className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold tabular-nums"
                    >
                      {salesJournalResult.count}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                    {L('CA encaissé', 'Выручка', 'Շրջանառություն', 'ბრუნვა')} :{' '}
                    <strong className="text-slate-200">
                      {salesJournalResult.totalRevenue.toLocaleString(intlLocale)} €
                    </strong>{' '}
                    • {L('Marge brute', 'Валовая маржа', 'Համախառն մարժա', 'მთლიანი მარჟა')} :{' '}
                    <strong className="text-emerald-400">
                      {salesJournalResult.totalGrossProfit.toLocaleString(intlLocale)} €
                    </strong>
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="settings-export-sales-csv-btn"
                  onClick={handleDownloadSalesJournal}
                  className="w-full h-9 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {L('Télécharger Journal des ventes (CSV)', 'Скачать Журнал продаж (CSV)', 'Ներբեռնել վաճառքները (CSV)', 'გაყიდვების ჟურნალი (CSV)')}
                  </span>
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {L('Dépenses (Atelier, frais, achats)', 'Расходы (ремонт, траты, закупки)', 'Ծախսեր', 'ხარჯები')}
                    </span>
                    <span
                      data-testid="settings-expenses-journal-count"
                      className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold tabular-nums"
                    >
                      {expensesJournalResult.count}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                    {L('Total dépenses sur la période', 'Сумма расходов за период', 'Ընդամենը ծախսեր', 'სულ ხარჯები')} :{' '}
                    <strong className="text-amber-300">
                      {expensesJournalResult.totalAmount.toLocaleString(intlLocale)} €
                    </strong>
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="settings-export-expenses-csv-btn"
                  onClick={handleDownloadExpensesJournal}
                  className="w-full h-9 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    {L('Télécharger Dépenses (CSV)', 'Скачать Расходы (CSV)', 'Ներբեռնել ծախսերը (CSV)', 'ხარჯების ჩამოტვირთვა (CSV)')}
                  </span>
                </button>
              </div>
            </div>

            {/* Email Accountant Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <p className="text-[11px] text-slate-400">
                {L(
                  'Télécharge les 2 fichiers CSV et ouvre votre messagerie avec le récapitulatif pré-rempli.',
                  'Скачивает оба CSV-файла и открывает письмо с готовой сводкой для бухгалтера.',
                  'Ներբեռնում է 2 CSV ֆայլերը և բացում է պատրաստի էլ․ նամակը։',
                  'ტვირთავს ორივე CSV-ს და ხსნის მზა წერილს ბუღალტრისთვის.'
                )}
              </p>

              <button
                type="button"
                data-testid="settings-send-accountant-btn"
                onClick={handleSendToAccountant}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-2 shadow-sm cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {L(
                    "Préparer l'e-mail & CSV comptable",
                    'Скачать CSV и открыть письмо бухгалтеру',
                    'Նամակ և CSV հաշվապահին',
                    'წერილი და CSV ბუღალტერს'
                  )}
                </span>
              </button>
            </div>
          </div>

          {/* 3. Mandatory Informational Disclaimer */}
          <div
            data-testid="settings-accounting-disclaimer"
            className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px] text-amber-100/90">
              {L(
                "Note informative : Ces exports CSV sont des récapitulatifs de gestion indicatifs destinés à faciliter la transmission à votre expert-comptable. Ils ne constituent pas un Fichier des Écritures Comptables (FEC) certifié et ne remplacent pas vos déclarations fiscales ou comptables officielles.",
                'Информационное примечание: экспортируемые CSV-журналы носят справочный характер для управленческого учёта и передачи бухгалтеру. Они не заменяют официальную бухгалтерскую и налоговую отчётность.',
                'Տեղեկատվական նշում․ Այս CSV արտահանումները տեղեկատվական ամփոփագրեր են և չեն փոխարինում պաշտոնական հաշվապահական կամ հարկային հայտարարագրերին։',
                'საინფორმაციო შენიშვნა: ეს CSV ექსპორტები წარმოადგენს საორიენტაციო მართვის შეჯამებას და არ ცვლის ოფიციალურ ბუღალტრულ ან საგადასახადო დეკლარაციებს.'
              )}
            </p>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 4: TAXES & SAUVEGARDE / НАЛОГИ И БЭКАП
      ============================================================ */}
      {displayTab === 'taxes_backup' && (
        <div data-testid="settings-panel-taxes-backup" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-white">
                {L(
                  'Taxes, Sauvegarde JSON & Compte',
                  'Налоги, бэкап (JSON) и аккаунт',
                  'Հարկեր, պահուստավորում (JSON) և հաշիվ',
                  'გადასახადები, JSON ასლი და ანგარიში'
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {L(
                  'Paramètres fiscaux URSSAF, simulateur de marge, sauvegarde complète JSON et gestion de session.',
                  'Ставки URSSAF, целевая маржа, симулятор сделки, экспорт/импорт JSON и безопасность аккаунта.',
                  'URSSAF դրույքներ, նպատակային մարժա, JSON պահուստավորում և անվտանգություն։',
                  'URSSAF განაკვეთები, სამიზნე მარჟა, JSON ასლი და ანგარიშის მართვა.'
                )}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-bold text-amber-300">
              {`${t('profileBadgeMicro')} (${combinedMicroRate}%)`}
            </span>
          </div>

          {/* 1. Tax, Margin & Currency Card */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" />
                <span>
                  {L(
                    'Paramètres fiscaux Pro (URSSAF), Marge & Devise',
                    'Налоги URSSAF (проф. сделки), целевая маржа и валюта',
                    'Բիզնես հարկային դրույքներ (URSSAF), մարժա և արժույթ',
                    'ბიზნეს გადასახადები (URSSAF), მარჟა და ვალუტა'
                  )}
                </span>
              </h4>
              <button
                type="button"
                data-testid="settings-save-taxes-btn"
                onClick={() => handleSaveSettings()}
                className="h-8 px-3.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{L('Enregistrer', 'Сохранить', 'Պահպանել', 'შენახვა')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="settings-default-margin" className={labelClass}>
                  {L('Marge cible indicative (%)', 'Целевая маржа (%)', 'Նպատակային մարժա (%)', 'სამიზნე მარჟა (%)')}
                </label>
                <input
                  id="settings-default-margin"
                  type="number"
                  min={0}
                  max={200}
                  step="any"
                  value={settings.defaultMarginPercent ?? 20}
                  onChange={(e) =>
                    updateSettingsField({
                      defaultMarginPercent: Number(e.target.value) || 0,
                    })
                  }
                  className={`${inputClass} tabular-nums font-bold`}
                />
              </div>

              <div>
                <label htmlFor="settings-currency" className={labelClass}>
                  {L('Devise principale', 'Валюта расчётов', 'Արժույթ', 'ვალუტა')}
                </label>
                <ThemedSelect<NonNullable<GarageSettings['currency']>>
                  id="settings-currency"
                  testId="settings-currency-select"
                  ariaLabel={L('Devise principale', 'Валюта расчётов', 'Արժույթ', 'ვალუტა')}
                  value={settings.currency || 'EUR'}
                  onChange={(val) => updateSettingsField({ currency: val })}
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

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="settings-urssaf-rate" className={labelClass}>
                    {L('Cotisations URSSAF (%)', 'Соцвзносы URSSAF (%)', 'URSSAF (%)', 'URSSAF (%)')}
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
                    {L('Versement libératoire', 'Налог VL (Versement libératoire)', 'VL հարկ', 'VL გადასახადი')}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="settings-vl-yes"
                      onClick={() => updateTaxConfig({ versementLiberatoireEnabled: true })}
                      className={`h-9 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        taxConfig.versementLiberatoireEnabled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {L('Oui', 'Да', 'Այո', 'დიახ')}
                    </button>
                    <button
                      type="button"
                      data-testid="settings-vl-no"
                      onClick={() => updateTaxConfig({ versementLiberatoireEnabled: false })}
                      className={`h-9 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        !taxConfig.versementLiberatoireEnabled
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {L('Non', 'Нет', 'Ոչ', 'არა')}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="settings-vl-rate" className={labelClass}>
                    {L('Taux VL (%)', 'Ставка VL (%)', 'VL (%)', 'VL (%)')}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                  <div>
                    <label htmlFor="settings-micro-abattement" className={labelClass}>
                      {L('Abattement Micro-BIC (%)', 'Вычет Micro-BIC (%)', 'Micro-BIC (%)', 'Micro-BIC (%)')}
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
                      {L('Taux IR estimé (%)', 'Ставка IR (%)', 'IR (%)', 'IR (%)')}
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
              )}

              {/* Compact Live Simulator with clear labels above every field */}
              <div
                data-testid="settings-tax-simulator"
                className="pt-3 border-t border-slate-800 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Calculator className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {L(
                      'Simulateur rapide Micro-entreprise',
                      'Быстрый симулятор проф. сделки',
                      'Գործարքի սիմուլյատոր',
                      'გარიგების სიმულატორი'
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="settings-sim-purchase" className={labelClass}>
                      {L("Prix d'achat (€)", 'Цена покупки (€)', 'Գնման գին (€)', 'შესყიდვის ფასი (€)')}
                    </label>
                    <input
                      id="settings-sim-purchase"
                      type="number"
                      data-testid="sim-purchase-input"
                      value={simPurchase}
                      onChange={(e) => setSimPurchase(Math.max(0, Number(e.target.value) || 0))}
                      className={`${inputClass} tabular-nums font-bold`}
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-sim-repairs" className={labelClass}>
                      {L('Réparations / Frais (€)', 'Ремонт и расходы (€)', 'Վերանորոգում (€)', 'რემონტი და ხარჯი (€)')}
                    </label>
                    <input
                      id="settings-sim-repairs"
                      type="number"
                      data-testid="sim-repairs-input"
                      value={simRepairs}
                      onChange={(e) => setSimRepairs(Math.max(0, Number(e.target.value) || 0))}
                      className={`${inputClass} tabular-nums font-bold`}
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-sim-sale" className={labelClass}>
                      {L('Prix de vente (€)', 'Цена продажи (€)', 'Վաճառքի գին (€)', 'გაყიდვის ფასი (€)')}
                    </label>
                    <input
                      id="settings-sim-sale"
                      type="number"
                      data-testid="sim-sale-input"
                      value={simSale}
                      onChange={(e) => setSimSale(Math.max(0, Number(e.target.value) || 0))}
                      className={`${inputClass} tabular-nums font-bold`}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 tabular-nums">
                  <span data-testid="sim-urssaf-amount">
                    URSSAF: {simMicro.urssafAmount.toLocaleString(intlLocale)} €
                  </span>
                  <span
                    data-testid="sim-net-after-tax"
                    className={`font-bold ${
                      simNetAfterTaxes >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    Net: {simNetAfterTaxes >= 0 ? '+' : ''}
                    {simNetAfterTaxes.toLocaleString(intlLocale)} €
                  </span>
                </div>
              </div>
            </div>

            {settings.taxAuditHistory && settings.taxAuditHistory.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {L('Dernières modifications fiscales', 'История изменений ставок', 'Վերջին փոփոխություններ', 'ბოლო ცვლილებები')}
                  </span>
                </div>
                {settings.taxAuditHistory.slice(0, 3).map((audit) => (
                  <p key={audit.id} className="text-[11px] text-slate-400 truncate">
                    {audit.timestamp.slice(0, 16).replace('T', ' ')} — {audit.summary}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* 2. JSON Full Backup & Restore + Cerfa Alignment Preview */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                {L(
                  'Sauvegarde & Restauration des données (JSON / CSV)',
                  'Резервное копирование и восстановление (JSON / CSV)',
                  'Տվյալների պահուստավորում և վերականգնում (JSON / CSV)',
                  'მონაცემთა სარეზერვო ასლი და აღდგენა (JSON / CSV)'
                )}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {L(
                  'Exportez l’intégralité de votre parc et historique en JSON ou restaurez une sauvegarde précédente.',
                  'Сохраните полную резервную копию базы авто и настроек в JSON или восстановите данные из файла.',
                  'Արտահանեք կամ վերականգնեք ամբողջ տվյալների բազան JSON ձևաչափով։',
                  'შეინახეთ სრული ბაზა JSON ფორმატში ან აღადგინეთ არსებული ფაილიდან.'
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="settings-export-json-btn"
                onClick={handleExportJson}
                className="h-9 px-3.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{L('Exporter Base (JSON)', 'Экспорт БД (JSON)', 'Արտահանել (JSON)', 'ექსპორტი (JSON)')}</span>
              </button>

              <button
                type="button"
                data-testid="settings-export-vehicles-csv-btn"
                onClick={handleExportCsv}
                className="h-9 px-3.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>{L('Catalogue Véhicules (CSV)', 'Каталог авто (CSV)', 'Ավտոմեքենաներ (CSV)', 'ავტომობილები (CSV)')}</span>
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
                data-testid="settings-import-json-btn"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>{L('Importer Base (JSON)', 'Импорт БД (JSON)', 'Ներմուծել (JSON)', 'იმპორტი (JSON)')}</span>
              </button>

              {onOpenAlignerMode && (
                <button
                  type="button"
                  data-testid="settings-open-cerfa-preview-btn"
                  onClick={() => {
                    onClose();
                    onOpenAlignerMode();
                  }}
                  className="h-9 px-3.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {L('Aperçu Cerfa', 'Предпросмотр Cerfa', 'Cerfa նախադիտում', 'Cerfa ნახვა')} (X:{cerfaCalibration.cerfa_15776_02.offsets.offsetX})
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* 3. Account & Local Cache Card */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200 font-semibold truncate">{resolvedEmail}</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold uppercase text-amber-300 shrink-0">
                  {userRole === 'superadmin' ? 'SUPERADMIN' : settings.legalStatus || 'micro_entreprise'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="settings-password-reset-btn"
                  onClick={handlePasswordReset}
                  className="h-8 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>{L('Mot de passe', 'Сброс пароля', 'Գաղտնաբառ', 'პაროლი')}</span>
                </button>

                {!confirmClearCache ? (
                  <button
                    type="button"
                    data-testid="settings-clear-cache-btn"
                    onClick={() => setConfirmClearCache(true)}
                    className="h-8 px-3 rounded-lg text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{L('Vider cache local', 'Сбросить кэш', 'Մաքրել քեշը', 'ქეშის წაშლა')}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmClearCache(false)}
                      className="h-8 px-2.5 rounded-lg text-xs bg-slate-800 text-slate-300 cursor-pointer"
                    >
                      {L('Annuler', 'Отмена', 'Չեղարկել', 'გაუქმება')}
                    </button>
                    <button
                      type="button"
                      data-testid="settings-confirm-clear-cache-btn"
                      onClick={handleConfirmClearCache}
                      className="h-8 px-2.5 rounded-lg text-xs font-bold bg-red-600 text-white cursor-pointer"
                    >
                      {L('Confirmer', 'Очистить', 'Հաստատել', 'დადასტურება')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          SUBSCRIPTION TAB (reachable from Upgrade Plan / profile badge)
      ============================================================ */}
      {displayTab === 'subscription' && (
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
    </div>
  );

  if (isPage) {
    return (
      <div data-testid="settings-page-view" className="space-y-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-[var(--foreground)]">
                  {L('Paramètres & Profil', 'Настройки и профиль', 'Կարգավորումներ և պրոֆիլ', 'პარამეტრები და პროფილი')}
                </h2>
                {settings.name?.trim() && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--primary)] truncate max-w-[200px]">
                    {settings.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {L(
                  'Entreprise, banque, identité visuelle, signature, exports comptables & taxes',
                  'Реквизиты компании, IBAN, брендинг, подпись, учёт и налоги/бэкап',
                  'Ընկերություն, բանկ, բրենդինգ, ստորագրություն, հարկեր և պահուստ',
                  'კომპანია, ბანკი, ბრენდინგი, ხელმოწერა, გადასახადები და ასლი'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="settings-page-close-btn"
            onClick={onClose}
            className="h-9 px-3.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]/80 text-[var(--foreground)] border border-[var(--border)] transition flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{L('Retour au parc', 'Назад в парк', 'Վերադառնալ', 'უკან')}</span>
          </button>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
          {mainContent}
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
      <div className="bg-[var(--ag-modal-bg)] border border-slate-800 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col h-[92vh] max-h-[820px]">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-base sm:text-lg font-bold text-white">
                {L('Paramètres & Profil', 'Настройки и профиль', 'Կարգավորումներ և պրոֆիլ', 'პარამეტრები და პროფილი')}
              </h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {L(
                  'Entreprise, Identité visuelle & Signature, Comptabilité & Export, Taxes & Sauvegarde',
                  'Компания, Брендинг и подпись, Учёт и экспорт, Налоги и бэкап',
                  'Ընկերություն, Բրենդինգ, Հաշվապահություն, Հարկեր և պահուստ',
                  'კომპანია, ბრენდინგი და ხელმოწერა, ბუღალტერია, გადასახადები'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={L('Fermer', 'Закрыть', 'Փակել', 'დახურვა')}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 bg-slate-950/30">
          {mainContent}
        </div>
      </div>
    </div>
  );
};
