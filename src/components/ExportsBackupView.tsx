import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Code2,
  DatabaseBackup,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  GitCompare,
  History,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AppUserProfileType,
  BackupRestoreMode,
  BackupSnapshotRecord,
  ChangeLogEntry,
  DocumentHistoryEvent,
  DynamicExpenseCategory,
  FullGarageBackupV2,
  GarageDocument,
  GarageSettings,
  GeneralExpense,
  Purchase,
  RepairTask,
  Supplier,
  UserActivityLog,
  VatRegime,
  Vehicle,
} from '../types/garage';
import {
  buildProfileSettingsPatch,
  createDefaultFrenchTaxConfig,
  resolveUserProfileType,
} from '../utils/frenchTaxEngine';
import {
  getGarageSettings,
  subscribeAllFleetExpensesAndRepairs,
} from '../services/garageService';
import {
  getDynamicExpenseCategories,
  subscribeDynamicExpenseCategories,
} from '../services/adminService';
import { DEFAULT_DYNAMIC_EXPENSE_CATEGORIES } from '../utils/adminUtils';
import {
  buildFullGarageBackupV2,
  createRestorePoint,
  deleteRestorePoint,
  logUserActivity,
  restoreFullGarageBackupV2,
} from '../services/auditAndBackupService';
import {
  AnalyticsTimeRange,
  computeDealershipAnalytics,
} from '../utils/analytics';
import { formatEuro } from '../utils/finance';
import { vehiclesToCsv } from '../utils/settingsUtils';
import {
  buildFacturXInvoiceNumber,
  buildFacturXXml,
  buildFinancialWorkbookBytes,
  buildVehiclesWorkbookBytes,
  computeBackupCounts,
  financialLedgerToCsv,
  parseFullBackupPayload,
  serializeFullBackupV2,
  validateFacturXReadiness,
} from '../utils/exportBackup';
import {
  generateDealershipFinancialReportPDF,
  generateFacturXHybridPdf,
  generateVehicleFinancialReportPDF,
} from '../utils/pdfGenerator';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { ThemedSelect } from './ThemedSelect';

export type ExportsBackupTab = 'exports' | 'facturx' | 'audit' | 'backup';

interface ExportsBackupViewProps {
  vehicles: Vehicle[];
  suppliers: Supplier[];
  purchases: Purchase[];
  documents: GarageDocument[];
  documentHistory: DocumentHistoryEvent[];
  activityLogs: UserActivityLog[];
  changeLogs: ChangeLogEntry[];
  backupSnapshots: BackupSnapshotRecord[];
  userId: string;
  userEmail?: string | null;
  activeGarageId: string | null;
  profileType?: AppUserProfileType;
  onNavigateSettings?: () => void;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function formatIsoTimestamp(iso: string): string {
  if (!iso) return '—';
  return iso.replace('T', ' ').slice(0, 19);
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ExportsBackupView: React.FC<ExportsBackupViewProps> = ({
  vehicles,
  suppliers,
  purchases,
  documents,
  documentHistory,
  activityLogs,
  changeLogs,
  backupSnapshots,
  userId,
  userEmail,
  activeGarageId,
  profileType: propProfileType,
  onNavigateSettings,
}) => {
  const { lang, t } = useI18n();

  const [activeTab, setActiveTab] = useState<ExportsBackupTab>('exports');
  const [periodRange, setPeriodRange] = useState<AnalyticsTimeRange>('all');
  const [garageSettings, setGarageSettings] = useState<GarageSettings>(() =>
    getGarageSettings(activeGarageId || undefined)
  );
  const activeProfileType: AppUserProfileType =
    propProfileType === 'particulier'
      ? 'particulier'
      : resolveUserProfileType(garageSettings);
  const isParticulier = activeProfileType === 'particulier';
  const effectiveGarageSettings: GarageSettings = isParticulier
    ? {
        ...garageSettings,
        ...buildProfileSettingsPatch('particulier', garageSettings),
      }
    : garageSettings;
  const isCorporateTaxRegime =
    !isParticulier &&
    (effectiveGarageSettings.taxRegime === 'sarl' || effectiveGarageSettings.taxRegime === 'sas');
  const isVatExemptSeller = !isCorporateTaxRegime;
  const [fleetData, setFleetData] = useState<{
    repairs: RepairTask[];
    expenses: GeneralExpense[];
  }>({ repairs: [], expenses: [] });
  const [dynamicCategories, setDynamicCategories] = useState<DynamicExpenseCategory[]>(() => {
    const initial = getDynamicExpenseCategories();
    return initial.length > 0 ? initial : DEFAULT_DYNAMIC_EXPENSE_CATEGORIES;
  });

  const [selectedPdfVehicleId, setSelectedPdfVehicleId] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Factur-X state
  const [facturxVehicleId, setFacturxVehicleId] = useState<string>('');
  const [paymentMeansCode, setPaymentMeansCode] = useState<'30' | '48' | '10' | '20'>('30');
  const [vatMode, setVatMode] = useState<VatRegime>(() =>
    isVatExemptSeller
      ? 'franchise_base'
      : garageSettings.frenchTaxConfig?.vatRegime || 'tva_marge'
  );
  const [vatRatePercent, setVatRatePercent] = useState<number>(() =>
    isVatExemptSeller
      ? 0
      : garageSettings.frenchTaxConfig?.vatRatePercent ?? 20
  );
  const [showXmlPreview, setShowXmlPreview] = useState<boolean>(true);
  const [isGeneratingFacturx, setIsGeneratingFacturx] = useState(false);

  // Audit & Change Log state
  const [auditSubTab, setAuditSubTab] = useState<'activity' | 'changes'>('activity');
  const [auditSearch, setAuditSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [changeEntityFilter, setChangeEntityFilter] = useState<string>('all');

  // Backup & Restore state
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [confirmDeleteSnapshotId, setConfirmDeleteSnapshotId] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    sourceName: string;
    payload: FullGarageBackupV2;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>('merge');
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncSettings = () => setGarageSettings(getGarageSettings(activeGarageId || undefined));
    syncSettings();
    window.addEventListener('autogarage_settings_updated', syncSettings);
    return () => window.removeEventListener('autogarage_settings_updated', syncSettings);
  }, [activeGarageId]);

  useEffect(() => {
    const unsub = subscribeAllFleetExpensesAndRepairs(vehicles, setFleetData);
    return () => unsub();
  }, [vehicles]);

  useEffect(() => {
    const unsubCats = subscribeDynamicExpenseCategories((cats) => {
      if (cats && cats.length > 0) {
        setDynamicCategories(cats);
      }
    });
    return () => unsubCats();
  }, []);

  useEffect(() => {
    if (vehicles.length > 0 && !vehicles.some((v) => v.id === selectedPdfVehicleId)) {
      setSelectedPdfVehicleId(vehicles[0].id);
    }
    if (vehicles.length > 0 && !vehicles.some((v) => v.id === facturxVehicleId)) {
      const preferredSold = vehicles.find((v) => v.status === 'sold') || vehicles[0];
      setFacturxVehicleId(preferredSold.id);
    }
  }, [vehicles, selectedPdfVehicleId, facturxVehicleId]);

  const analyticsReport = useMemo(() => {
    return computeDealershipAnalytics({
      vehicles,
      repairs: fleetData.repairs,
      expenses: fleetData.expenses,
      timeRange: periodRange,
      dynamicCategories,
      taxRegime: isParticulier ? 'none' : garageSettings.taxRegime,
      taxRatePercent: isParticulier ? 0 : garageSettings.taxRatePercent,
      frenchTaxConfig: isParticulier
        ? createDefaultFrenchTaxConfig('particulier')
        : garageSettings.frenchTaxConfig,
    });
  }, [
    vehicles,
    fleetData.repairs,
    fleetData.expenses,
    periodRange,
    dynamicCategories,
    isParticulier,
    garageSettings.taxRegime,
    garageSettings.taxRatePercent,
    garageSettings.frenchTaxConfig,
  ]);

  const periodLabelMap: Record<AnalyticsTimeRange, string> = {
    today: t('periodToday'),
    week: t('periodWeek'),
    month: t('periodMonth'),
    quarter: t('periodQuarter'),
    year: t('periodYear'),
    all: t('periodAll'),
    '3months': pickLocalized(lang, { fr: '3 mois', ru: '3 мес.', hy: '3 ամիս', ka: '3 თვე' }),
    '6months': pickLocalized(lang, { fr: '6 mois', ru: '6 мес.', hy: '6 ամիս', ka: '6 თვე' }),
    custom: t('periodCustom'),
  };

  const selectedPdfVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedPdfVehicleId) || vehicles[0] || null,
    [vehicles, selectedPdfVehicleId]
  );

  const facturxVehicle = useMemo(
    () => vehicles.find((v) => v.id === facturxVehicleId) || vehicles[0] || null,
    [vehicles, facturxVehicleId]
  );

  useEffect(() => {
    if (!facturxVehicle) return;
    const explicitDealProfile = facturxVehicle.buyerInfo?.sellerProfileType;
    const isDealVatExempt =
      explicitDealProfile === 'particulier' ||
      explicitDealProfile === 'micro_entrepreneur';
    const isFrozenCorporateVat =
      !isDealVatExempt &&
      facturxVehicle.buyerInfo?.taxSnapshot?.isHistoricalSnapshot &&
      (facturxVehicle.buyerInfo.taxSnapshot.vatAmount > 0 ||
        facturxVehicle.buyerInfo.taxSnapshot.taxRegime === 'sarl' ||
        facturxVehicle.buyerInfo.taxSnapshot.taxRegime === 'sas');
    if (isDealVatExempt || (isVatExemptSeller && !isFrozenCorporateVat)) {
      setVatMode('franchise_base');
      setVatRatePercent(0);
      return;
    }
    setVatMode(
      facturxVehicle.buyerInfo?.vatRegime ||
        facturxVehicle.buyerInfo?.taxSnapshot?.vatRegime ||
        garageSettings.frenchTaxConfig?.vatRegime ||
        'tva_marge'
    );
    setVatRatePercent(
      facturxVehicle.buyerInfo?.vatRatePercent ??
        facturxVehicle.buyerInfo?.taxSnapshot?.vatRatePercent ??
        garageSettings.frenchTaxConfig?.vatRatePercent ??
        20
    );
  }, [
    facturxVehicle,
    isVatExemptSeller,
    garageSettings.frenchTaxConfig?.vatRegime,
    garageSettings.frenchTaxConfig?.vatRatePercent,
  ]);

  const facturxReadiness = useMemo(() => {
    if (!facturxVehicle) return null;
    return validateFacturXReadiness(facturxVehicle, garageSettings, lang);
  }, [facturxVehicle, garageSettings, lang]);

  const facturxXml = useMemo(() => {
    if (!facturxVehicle) return '';
    return buildFacturXXml(facturxVehicle, garageSettings, {
      paymentMeansCode,
      vatMode,
      vatRatePercent,
    });
  }, [facturxVehicle, garageSettings, paymentMeansCode, vatMode, vatRatePercent]);

  const filteredActivityLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return activityLogs.filter((log) => {
      if (activityFilter !== 'all' && log.action !== activityFilter) return false;
      if (!q) return true;
      return (
        log.targetLabel.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.details || '').toLowerCase().includes(q)
      );
    });
  }, [activityLogs, auditSearch, activityFilter]);

  const filteredChangeLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return changeLogs.filter((entry) => {
      if (changeEntityFilter !== 'all' && entry.entityType !== changeEntityFilter) return false;
      if (!q) return true;
      return (
        entry.entityLabel.toLowerCase().includes(q) ||
        entry.actorEmail.toLowerCase().includes(q) ||
        entry.operation.toLowerCase().includes(q) ||
        entry.changes.some(
          (c) =>
            c.field.toLowerCase().includes(q) ||
            c.oldValue.toLowerCase().includes(q) ||
            c.newValue.toLowerCase().includes(q)
        )
      );
    });
  }, [changeLogs, auditSearch, changeEntityFilter]);

  // Export Actions
  const handleExportFinancialCsv = async () => {
    const csv = financialLedgerToCsv(vehicles, garageSettings);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `AutoGarage_Finances_PnL_${stamp}.csv`;
    triggerBlobDownload(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), fileName);

    await logUserActivity({
      userId,
      garageId: activeGarageId,
      actorEmail: userEmail,
      action: 'export_csv',
      targetLabel: fileName,
      details: `${vehicles.length} véhicules · Revenue ${formatEuro(analyticsReport.salesPerformance.revenue)}`,
    });
    setStatusBanner({
      type: 'success',
      text: pickLocalized(lang, {
        fr: `Export financier CSV téléchargé : ${fileName}`,
        ru: `Финансовый CSV скачан: ${fileName}`,
        hy: `Ֆինանսական CSV-ն ներբեռնվեց՝ ${fileName}`,
        ka: `ფინანსური CSV ჩამოტვირთულია: ${fileName}`,
      }),
    });
  };

  const handleExportFinancialExcel = async () => {
    const bytes = buildFinancialWorkbookBytes({
      analytics: analyticsReport,
      vehicles,
      garageSettings,
      repairs: fleetData.repairs,
      expenses: fleetData.expenses,
      purchases,
      periodLabel: periodLabelMap[periodRange] || periodRange,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `AutoGarage_Finances_PnL_${stamp}.xlsx`;
    triggerBlobDownload(
      new Blob([new Uint8Array(bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      fileName
    );

    await logUserActivity({
      userId,
      garageId: activeGarageId,
      actorEmail: userEmail,
      action: 'export_excel',
      targetLabel: fileName,
      details: `3 feuilles (Synthèse P&L, Ventes & Marges, Dépenses & Achats)`,
    });
    setStatusBanner({
      type: 'success',
      text: pickLocalized(lang, {
        fr: `Classeur Excel financier téléchargé : ${fileName}`,
        ru: `Финансовая книга Excel скачана: ${fileName}`,
        hy: `Ֆինանսական Excel ֆայլը ներբեռնվեց՝ ${fileName}`,
        ka: `ფინანსური Excel ფაილი ჩამოტვირთულია: ${fileName}`,
      }),
    });
  };

  const handleExportVehiclesExcel = async () => {
    const bytes = buildVehiclesWorkbookBytes(vehicles, fleetData.repairs, fleetData.expenses);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `AutoGarage_Parc_Vehicules_${stamp}.xlsx`;
    triggerBlobDownload(
      new Blob([new Uint8Array(bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      fileName
    );

    await logUserActivity({
      userId,
      garageId: activeGarageId,
      actorEmail: userEmail,
      action: 'export_excel',
      targetLabel: fileName,
      details: `${vehicles.length} véhicules · ${fleetData.repairs.length} réparations · ${fleetData.expenses.length} frais`,
    });
    setStatusBanner({
      type: 'success',
      text: pickLocalized(lang, {
        fr: `Export Excel du parc téléchargé : ${fileName}`,
        ru: `Список авто в Excel скачан: ${fileName}`,
        hy: `Ավտոպարկի Excel ֆայլը ներբեռնվեց՝ ${fileName}`,
        ka: `ავტოპარკის Excel ფაილი ჩამოტვირთულია: ${fileName}`,
      }),
    });
  };

  const handleExportVehiclesCsv = async () => {
    const csv = vehiclesToCsv(vehicles);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `AutoGarage_Vehicules_${stamp}.csv`;
    triggerBlobDownload(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), fileName);

    await logUserActivity({
      userId,
      garageId: activeGarageId,
      actorEmail: userEmail,
      action: 'export_csv',
      targetLabel: fileName,
      details: `${vehicles.length} véhicules`,
    });
    setStatusBanner({
      type: 'success',
      text: pickLocalized(lang, {
        fr: `CSV véhicules téléchargé : ${fileName}`,
        ru: `CSV автомобилей скачан: ${fileName}`,
        hy: `Ավտոմեքենաների CSV-ն ներբեռնվեց՝ ${fileName}`,
        ka: `ავტომობილების CSV ჩამოტვირთულია: ${fileName}`,
      }),
    });
  };

  const handleExportGlobalPdf = async () => {
    generateDealershipFinancialReportPDF({
      analytics: analyticsReport,
      vehicles,
      garageSettings,
      periodLabel: periodLabelMap[periodRange] || periodRange,
    });
    await logUserActivity({
      userId,
      garageId: activeGarageId,
      actorEmail: userEmail,
      action: 'export_pdf',
      targetLabel: `Rapport P&L Concession (${periodLabelMap[periodRange] || periodRange})`,
      details: `${vehicles.length} véhicules · Net Profit ${formatEuro(analyticsReport.salesPerformance.netProfit)}`,
    });
    setStatusBanner({
      type: 'success',
      text: pickLocalized(lang, {
        fr: 'Rapport financier global PDF téléchargé.',
        ru: 'Сводный PDF-отчёт P&L сформирован.',
        hy: 'Ընդհանուր ֆինանսական PDF հաշվետվությունը ներբեռնվեց։',
        ka: 'საერთო ფინანსური PDF ანგარიში ჩამოტვირთულია.',
      }),
    });
  };

  const handleExportVehiclePdf = async () => {
    if (!selectedPdfVehicle) return;
    const vRepairs = fleetData.repairs.filter((r) => r.vehicleId === selectedPdfVehicle.id);
    const vExpenses = fleetData.expenses.filter((e) => e.vehicleId === selectedPdfVehicle.id);
    generateVehicleFinancialReportPDF(selectedPdfVehicle, vRepairs, vExpenses, garageSettings);
    await logUserActivity({
      userId,
      garageId: activeGarageId,
      actorEmail: userEmail,
      action: 'export_pdf',
      entityType: 'vehicle',
      entityId: selectedPdfVehicle.id,
      targetLabel: `Bilan ${selectedPdfVehicle.make} ${selectedPdfVehicle.model}`,
      details: `${vRepairs.length} réparations · ${vExpenses.length} frais`,
    });
    setStatusBanner({
      type: 'success',
      text: pickLocalized(lang, {
        fr: `Bilan PDF téléchargé pour ${selectedPdfVehicle.make} ${selectedPdfVehicle.model}.`,
        ru: `PDF-отчёт по ${selectedPdfVehicle.make} ${selectedPdfVehicle.model} скачан.`,
        hy: `${selectedPdfVehicle.make} ${selectedPdfVehicle.model} PDF հաշվետվությունը ներբեռնվեց։`,
        ka: `${selectedPdfVehicle.make} ${selectedPdfVehicle.model}-ის PDF ანგარიში ჩამოტვირთულია.`,
      }),
    });
  };

  // Factur-X Actions
  const handleDownloadFacturXXml = async () => {
    if (!facturxVehicle || !facturxXml) return;
    const invNum = buildFacturXInvoiceNumber(facturxVehicle);
    const fileName = `factur-x_${invNum}.xml`;
    triggerBlobDownload(new Blob([facturxXml], { type: 'application/xml;charset=utf-8' }), fileName);

    await logUserActivity({
      userId,
      garageId: activeGarageId,
      actorEmail: userEmail,
      action: 'export_facturx',
      entityType: 'vehicle',
      entityId: facturxVehicle.id,
      targetLabel: `${invNum} (XML EN 16931)`,
      details: `${facturxVehicle.make} ${facturxVehicle.model}`,
    });
    setStatusBanner({
      type: 'success',
      text: pickLocalized(lang, {
        fr: `XML Factur-X téléchargé : ${fileName}`,
        ru: `XML Factur-X скачан: ${fileName}`,
        hy: `Factur-X XML-ը ներբեռնվեց՝ ${fileName}`,
        ka: `Factur-X XML ჩამოტვირთულია: ${fileName}`,
      }),
    });
  };

  const handleDownloadFacturXHybridPdf = async () => {
    if (!facturxVehicle) return;
    try {
      setIsGeneratingFacturx(true);
      const result = await generateFacturXHybridPdf({
        vehicle: facturxVehicle,
        garageSettings,
        paymentMeansCode,
        vatMode,
        vatRatePercent,
      });
      await logUserActivity({
        userId,
        garageId: activeGarageId,
        actorEmail: userEmail,
        action: 'export_facturx',
        entityType: 'vehicle',
        entityId: facturxVehicle.id,
        targetLabel: `${result.fileName} (PDF Hybride)`,
        details: `Facture ${result.invoiceNumber} avec factur-x.xml embarqué`,
      });
      setStatusBanner({
        type: 'success',
        text: pickLocalized(lang, {
          fr: `PDF hybride Factur-X généré avec factur-x.xml embarqué : ${result.fileName}`,
          ru: `Гибридный PDF Factur-X с вложенным XML скачан: ${result.fileName}`,
          hy: `Factur-X հիբրիդային PDF-ը ներբեռնվեց՝ ${result.fileName}`,
          ka: `Factur-X ჰიბრიდული PDF ჩამოტვირთულია: ${result.fileName}`,
        }),
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : pickLocalized(lang, {
                fr: 'Erreur Factur-X PDF',
                ru: 'Ошибка генерации Factur-X PDF',
                hy: 'Factur-X PDF սխալ',
                ka: 'Factur-X PDF შეცდომა',
              }),
      });
    } finally {
      setIsGeneratingFacturx(false);
    }
  };

  // Backup & Restore Actions
  const handleDownloadFullBackupV2 = async () => {
    const backup = await buildFullGarageBackupV2({
      garageId: activeGarageId,
      actorEmail: userEmail,
      vehicles,
      suppliers,
      purchases,
      documents,
      documentHistory,
      settings: garageSettings,
    });
    const rawJson = serializeFullBackupV2(backup);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `AutoGarage_FullBackup_v2_${stamp}.json`;
    triggerBlobDownload(new Blob([rawJson], { type: 'application/json;charset=utf-8' }), fileName);

    await logUserActivity({
      userId,
      garageId: activeGarageId,
      actorEmail: userEmail,
      action: 'backup_created',
      entityType: 'backup',
      targetLabel: fileName,
      details: `${backup.vehicles.length} véhicules, ${backup.suppliers.length} fournisseurs, ${backup.documents.length} documents`,
    });

    setStatusBanner({
      type: 'success',
      text: pickLocalized(lang, {
        fr: `Sauvegarde complète v2 téléchargée : ${fileName}`,
        ru: `Полный бэкап v2 скачан: ${fileName}`,
        hy: `Ամբողջական պահուստային կրկնօրինակ v2-ը ներբեռնվեց՝ ${fileName}`,
        ka: `სრული სარეზერვო ასლი v2 ჩამოტვირთულია: ${fileName}`,
      }),
    });
  };

  const handleCreateRestorePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreatingSnapshot(true);
      const backup = await buildFullGarageBackupV2({
        garageId: activeGarageId,
        actorEmail: userEmail,
        vehicles,
        suppliers,
        purchases,
        documents,
        documentHistory,
        settings: garageSettings,
      });
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const label =
        snapshotLabel.trim() ||
        pickLocalized(lang, {
          fr: `Point de restauration ${stamp}`,
          ru: `Точка восстановления ${stamp}`,
          hy: `Վերականգնման կետ ${stamp}`,
          ka: `აღდგენის წერტილი ${stamp}`,
        });

      await createRestorePoint({
        userId,
        garageId: activeGarageId,
        label,
        actorEmail: userEmail,
        backup,
      });
      setSnapshotLabel('');
      setStatusBanner({
        type: 'success',
        text: pickLocalized(lang, {
          fr: `Point de restauration enregistré : ${label}`,
          ru: `Точка восстановления создана: ${label}`,
          hy: `Վերականգնման կետը ստեղծվեց՝ ${label}`,
          ka: `აღდგენის წერტილი შეიქმნა: ${label}`,
        }),
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : pickLocalized(lang, {
                fr: 'Erreur de sauvegarde',
                ru: 'Ошибка резервного копирования',
                hy: 'Պահուստավորման սխալ',
                ka: 'სარეზერვო ასლის შეცდომა',
              }),
      });
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseFullBackupPayload(text);
      setPendingRestore({
        sourceName: file.name,
        payload: parsed,
      });
      setStatusBanner(null);
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : pickLocalized(lang, {
                fr: 'Fichier JSON de sauvegarde invalide',
                ru: 'Некорректный JSON-файл резервной копии',
                hy: 'Անվավեր JSON պահուստային ֆայլ',
                ka: 'არასწორი JSON სარეზერვო ფაილი',
              }),
      });
    } finally {
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
    }
  };

  const handleSelectSnapshotForRestore = (snap: BackupSnapshotRecord) => {
    if (!snap.payloadJson) {
      setStatusBanner({
        type: 'error',
        text: pickLocalized(lang, {
          fr: 'Ce point de restauration ne contient pas de snapshot JSON.',
          ru: 'У этой точки восстановления отсутствует JSON-снимок.',
          hy: 'Այս վերականգնման կետում JSON պատկեր չկա։',
          ka: 'ამ აღდგენის წერტილს JSON სნეპშოტი არ აქვს.',
        }),
      });
      return;
    }
    try {
      const parsed = parseFullBackupPayload(snap.payloadJson);
      setPendingRestore({
        sourceName: snap.label,
        payload: parsed,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : pickLocalized(lang, {
                fr: 'Snapshot JSON invalide',
                ru: 'Некорректный JSON-снимок',
                hy: 'Անվավեր JSON սնեփշոթ',
                ka: 'არასწორი JSON სნეპშოტი',
              }),
      });
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    try {
      setIsRestoring(true);
      await restoreFullGarageBackupV2(pendingRestore.payload, {
        mode: restoreMode,
        userId,
        garageId: activeGarageId,
        actorEmail: userEmail,
      });
      setStatusBanner({
        type: 'success',
        text: pickLocalized(lang, {
          fr: `Restauration terminée avec succès (${pendingRestore.payload.vehicles.length} véhicules, ${pendingRestore.payload.suppliers.length} fournisseurs, ${pendingRestore.payload.documents.length} documents).`,
          ru: `Данные успешно восстановлены (${pendingRestore.payload.vehicles.length} авто, ${pendingRestore.payload.suppliers.length} поставщиков, ${pendingRestore.payload.documents.length} документов).`,
          hy: `Տվյալները հաջողությամբ վերականգնվեցին (${pendingRestore.payload.vehicles.length} մեքենա, ${pendingRestore.payload.suppliers.length} մատակարար, ${pendingRestore.payload.documents.length} փաստաթուղթ)։`,
          ka: `მონაცემები წარმატებით აღდგა (${pendingRestore.payload.vehicles.length} ავტო, ${pendingRestore.payload.suppliers.length} მომწოდებელი, ${pendingRestore.payload.documents.length} დოკუმენტი).`,
        }),
      });
      setPendingRestore(null);
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : pickLocalized(lang, {
                fr: 'Échec de la restauration',
                ru: 'Ошибка восстановления данных',
                hy: 'Վերականգնումը ձախողվեց',
                ka: 'აღდგენა ვერ მოხერხდა',
              }),
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const tabClass = (tab: ExportsBackupTab) =>
    `inline-flex items-center gap-2 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold whitespace-nowrap transition-all border ${
      activeTab === tab
        ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
        : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
    }`;

  return (
    <div data-testid="exports-backup-view" className="space-y-4">
      {/* Header & Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)]">
              <DatabaseBackup className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--foreground)]">
                {t('exportsPageTitle')}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('exportsPageSubtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            data-testid="exports-tab-reports"
            onClick={() => setActiveTab('exports')}
            className={tabClass('exports')}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t('exportsTabReports')}</span>
          </button>
          <button
            type="button"
            data-testid="exports-tab-facturx"
            onClick={() => setActiveTab('facturx')}
            className={tabClass('facturx')}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>{t('exportsTabFacturX')}</span>
          </button>
          <button
            type="button"
            data-testid="exports-tab-audit"
            onClick={() => setActiveTab('audit')}
            className={tabClass('audit')}
          >
            <History className="w-3.5 h-3.5" />
            <span>{t('exportsTabAudit')}</span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[10px] font-bold tabular-nums">
              {activityLogs.length + changeLogs.length}
            </span>
          </button>
          <button
            type="button"
            data-testid="exports-tab-backup"
            onClick={() => setActiveTab('backup')}
            className={tabClass('backup')}
          >
            <ArchiveRestore className="w-3.5 h-3.5" />
            <span>{t('exportsTabBackup')}</span>
          </button>
        </div>
      </div>

      {/* Inline Status Notification */}
      {statusBanner && (
        <div
          data-testid="exports-status-banner"
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs font-semibold ${
            statusBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-[11px] opacity-80 hover:opacity-100 underline shrink-0"
          >
            OK
          </button>
        </div>
      )}

      {/* TAB 1: EXPORTS & PDF REPORTS */}
      {activeTab === 'exports' && (
        <div className="space-y-4">
          {/* Live Separated P&L Period Preview */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Aperçu comptable avant export (Revenue / Gross Profit / Net Profit séparés)',
                    ru: 'Финансовый срез для экспорта (разделение Revenue / Gross Profit / Net Profit)',
                    hy: 'Հաշվապահական ամփոփում արտահանումից առաջ (Revenue / Gross / Net Profit)',
                    ka: 'ფინანსური მიმოხილვა ექსპორტამდე (Revenue / Gross / Net Profit)',
                  })}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Le chiffre d’affaires, la marge brute, les impôts et le bénéfice net sont exportés dans des colonnes distinctes.',
                    ru: 'Выручка, валовая прибыль, налоги и чистая прибыль рассчитываются раздельно без смешивания.',
                    hy: 'Շրջանառությունը, համախառն մարժան, հարկերը և զուտ շահույթը արտահանվում են առանձին սյունակներով։',
                    ka: 'ბრუნვა, მთლიანი მარჟა, გადასახადები და წმინდა მოგება ცალკე სვეტებად ინახება.',
                  })}
                </p>
              </div>
              <div className="w-full sm:w-56">
                <ThemedSelect
                  testId="exports-period-select"
                  ariaLabel={pickLocalized(lang, {
                    fr: 'Période du rapport',
                    ru: 'Период отчёта',
                    hy: 'Հաշվետվության ժամանակահատված',
                    ka: 'ანგარიშის პერიოდი',
                  })}
                  value={periodRange}
                  onChange={(val) => setPeriodRange(val as AnalyticsTimeRange)}
                  options={[
                    { value: 'all', label: periodLabelMap.all },
                    { value: 'today', label: periodLabelMap.today },
                    { value: 'week', label: periodLabelMap.week },
                    { value: 'month', label: periodLabelMap.month },
                    { value: 'quarter', label: periodLabelMap.quarter },
                    { value: 'year', label: periodLabelMap.year },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                  1.{' '}
                  {pickLocalized(lang, {
                    fr: "Chiffre d'affaires (Revenue)",
                    ru: 'Выручка (Revenue)',
                    hy: 'Շրջանառություն (Revenue)',
                    ka: 'შემოსავალი (Revenue)',
                  })}
                </div>
                <div className="text-lg font-extrabold text-[var(--foreground)] tabular-nums mt-1">
                  {formatEuro(analyticsReport.salesPerformance.revenue)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                  {analyticsReport.salesPerformance.soldCount}{' '}
                  {pickLocalized(lang, {
                    fr: 'vente(s)',
                    ru: 'продаж',
                    hy: 'վաճառք',
                    ka: 'გაყიდვა',
                  })}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                  2.{' '}
                  {pickLocalized(lang, {
                    fr: 'Marge brute (Gross Profit)',
                    ru: 'Валовая прибыль (Gross Profit)',
                    hy: 'Համախառն շահույթ (Gross Profit)',
                    ka: 'მთლიანი მოგება (Gross Profit)',
                  })}
                </div>
                <div className="text-lg font-extrabold text-[var(--foreground)] tabular-nums mt-1">
                  {formatEuro(analyticsReport.salesPerformance.grossProfit)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                  {analyticsReport.salesPerformance.grossMarginPercent.toFixed(1)}%
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div className="text-[11px] font-semibold text-[var(--muted-foreground)] flex items-center justify-between gap-1">
                  <span>
                    {isParticulier
                      ? t('profileBadgeParticulier')
                      : `${pickLocalized(lang, {
                          fr: 'Impôts',
                          ru: 'Налоги',
                          hy: 'Հարկեր',
                          ka: 'გადასახადები',
                        })} (${analyticsReport.salesPerformance.taxLabel})`}
                  </span>
                </div>
                <div className="text-lg font-extrabold text-amber-500 tabular-nums mt-1">
                  {formatEuro(analyticsReport.salesPerformance.taxAmount)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {isParticulier ? t('profileBadgeParticulier') : t('profileBadgeMicro')}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                  3.{' '}
                  {pickLocalized(lang, {
                    fr: 'Bénéfice net (Net Profit)',
                    ru: 'Чистая прибыль (Net Profit)',
                    hy: 'Զուտ շահույթ (Net Profit)',
                    ka: 'წმინდა მოგება (Net Profit)',
                  })}
                </div>
                <div className="text-lg font-extrabold text-emerald-500 tabular-nums mt-1">
                  {formatEuro(analyticsReport.salesPerformance.netProfit)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                  {analyticsReport.salesPerformance.netMarginPercent.toFixed(1)}%{' '}
                  {pickLocalized(lang, {
                    fr: 'marge nette',
                    ru: 'маржа',
                    hy: 'զուտ մարժա',
                    ka: 'წმინდა მარჟა',
                  })}
                </div>
              </div>
            </div>

            {!isParticulier && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[var(--muted-foreground)]">
                <span className="tabular-nums">
                  {analyticsReport.salesPerformance.vatAmount > 0 &&
                    `TVA: ${formatEuro(analyticsReport.salesPerformance.vatAmount)} · `}
                  URSSAF: {formatEuro(analyticsReport.salesPerformance.urssafAmount)} · VL:{' '}
                  {formatEuro(analyticsReport.salesPerformance.versementLiberatoireAmount)}
                  {analyticsReport.salesPerformance.corporateIsAmount > 0 &&
                    ` · IS: ${formatEuro(analyticsReport.salesPerformance.corporateIsAmount)}`}
                </span>
                <span>{t('taxAccountantDisclaimer')}</span>
              </div>
            )}
          </div>

          {/* 3 Export Pillars */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card 1: Financial CSV / Excel */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[var(--foreground)]">
                  {t('exportsFinanceCardTitle')}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                  {t('exportsFinanceCardDesc')}
                </p>
                <div className="text-[11px] text-[var(--muted-foreground)] bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2">
                  {pickLocalized(lang, {
                    fr: 'Feuilles .xlsx : Synthèse P&L, Ventes & Marges, Dépenses & Achats.',
                    ru: 'Листы .xlsx: Synthèse P&L, Ventes & Marges, Dépenses & Achats.',
                    hy: '.xlsx թերթեր՝ Synthèse P&L, Ventes & Marges, Dépenses & Achats։',
                    ka: '.xlsx ფურცლები: Synthèse P&L, Ventes & Marges, Dépenses & Achats.',
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  data-testid="export-finance-csv-btn"
                  onClick={handleExportFinancialCsv}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('exportsDownloadFinCsv')}</span>
                </button>
                <button
                  type="button"
                  data-testid="export-finance-excel-btn"
                  onClick={handleExportFinancialExcel}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{t('exportsDownloadFinExcel')}</span>
                </button>
              </div>
            </div>

            {/* Card 2: Vehicles Fleet Excel / CSV */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[var(--foreground)]">
                  {t('exportsVehiclesCardTitle')}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                  {t('exportsVehiclesCardDesc')}
                </p>
                <div className="text-[11px] text-[var(--muted-foreground)] bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 tabular-nums">
                  {vehicles.length}{' '}
                  {pickLocalized(lang, {
                    fr: 'véhicules',
                    ru: 'авто',
                    hy: 'մեքենա',
                    ka: 'ავტო',
                  })}{' '}
                  · {fleetData.repairs.length}{' '}
                  {pickLocalized(lang, {
                    fr: 'réparations',
                    ru: 'ремонтов',
                    hy: 'վերանորոգում',
                    ka: 'შეკეთება',
                  })}{' '}
                  · {fleetData.expenses.length}{' '}
                  {pickLocalized(lang, {
                    fr: 'frais',
                    ru: 'расходов',
                    hy: 'ծախս',
                    ka: 'ხარჯი',
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  data-testid="export-vehicles-excel-btn"
                  onClick={handleExportVehiclesExcel}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{t('exportsDownloadVehExcel')}</span>
                </button>
                <button
                  type="button"
                  data-testid="export-vehicles-csv-btn"
                  onClick={handleExportVehiclesCsv}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('exportsDownloadVehCsv')}</span>
                </button>
              </div>
            </div>

            {/* Card 3: PDF Reports */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)]">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[var(--foreground)]">
                  {t('exportsPdfCardTitle')}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                  {t('exportsPdfCardDesc')}
                </p>

                {vehicles.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                      {pickLocalized(lang, {
                        fr: 'Véhicule pour bilan PDF individuel',
                        ru: 'Автомобиль для PDF-досье',
                        hy: 'Մեքենա՝ անհատական PDF հաշվետվության համար',
                        ka: 'ავტომობილი ინდივიდუალური PDF-ისთვის',
                      })}
                    </label>
                    <ThemedSelect
                      testId="export-pdf-vehicle-select"
                      ariaLabel={pickLocalized(lang, {
                        fr: 'Choisir un véhicule',
                        ru: 'Выбор автомобиля',
                        hy: 'Ընտրել մեքենան',
                        ka: 'აირჩიეთ ავტომობილი',
                      })}
                      value={selectedPdfVehicle?.id || ''}
                      onChange={setSelectedPdfVehicleId}
                      options={vehicles.map((v) => ({
                        value: v.id,
                        label: `${v.make} ${v.model} (${v.year}) · ${v.registrationNumber || v.vin.slice(-6)}`,
                      }))}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  data-testid="export-global-pdf-btn"
                  onClick={handleExportGlobalPdf}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('exportsDownloadGlobalPdf')}</span>
                </button>
                <button
                  type="button"
                  data-testid="export-vehicle-pdf-btn"
                  disabled={!selectedPdfVehicle}
                  onClick={handleExportVehiclePdf}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] disabled:opacity-50 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('exportsDownloadVehiclePdf')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FRENCH E-INVOICING & FACTUR-X EN 16931 */}
      {activeTab === 'facturx' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Configuration & Readiness Column */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    {t('facturXTitle')}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {t('facturXSubtitle')}
                  </p>
                </div>
                {facturxReadiness && (
                  <span
                    data-testid="facturx-readiness-badge"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 tabular-nums ${
                      facturxReadiness.ready
                        ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                    }`}
                  >
                    {facturxReadiness.ready ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {facturxReadiness.score}/{facturxReadiness.maxScore}{' '}
                      {facturxReadiness.ready
                        ? t('facturXReadyBadge')
                        : t('facturXIncompleteBadge')}
                    </span>
                  </span>
                )}
              </div>

              {vehicles.length === 0 ? (
                <div className="p-4 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Ajoutez au moins un véhicule au stock pour préparer une facture Factur-X.',
                    ru: 'Добавьте хотя бы один автомобиль на склад для формирования счёта Factur-X.',
                    hy: 'Factur-X հաշիվ կազմելու համար ավելացրեք առնվազն մեկ մեքենա պահեստում։',
                    ka: 'Factur-X ინვოისის მოსამზადებლად დაამატეთ მინიმუმ ერთი ავტომობილი.',
                  })}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                        {pickLocalized(lang, {
                          fr: 'Véhicule / Transaction à facturer',
                          ru: 'Автомобиль / Сделка',
                          hy: 'Մեքենա / Գործարք',
                          ka: 'ავტომობილი / ტრანზაქცია',
                        })}
                      </label>
                      <ThemedSelect
                        testId="facturx-vehicle-select"
                        ariaLabel={pickLocalized(lang, {
                          fr: 'Véhicule Factur-X',
                          ru: 'Автомобиль Factur-X',
                          hy: 'Factur-X ավտոմեքենա',
                          ka: 'Factur-X ავტომობილი',
                        })}
                        value={facturxVehicle?.id || ''}
                        onChange={setFacturxVehicleId}
                        options={vehicles.map((v) => ({
                          value: v.id,
                          label: `${v.status === 'sold' ? '✓ ' : ''}${v.make} ${v.model} (${v.year}) — ${formatEuro(v.buyerInfo?.salePrice || v.targetSalePrice)}`,
                        }))}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                        {pickLocalized(lang, {
                          fr: 'Moyen de paiement (BT-81)',
                          ru: 'Способ оплаты (BT-81)',
                          hy: 'Վճարման եղանակ (BT-81)',
                          ka: 'გადახდის მეთოდი (BT-81)',
                        })}
                      </label>
                      <ThemedSelect
                        testId="facturx-payment-select"
                        ariaLabel={pickLocalized(lang, {
                          fr: 'Moyen de paiement',
                          ru: 'Способ оплаты',
                          hy: 'Վճարման եղանակ',
                          ka: 'გადახდის მეთოდი',
                        })}
                        value={paymentMeansCode}
                        onChange={(v) => setPaymentMeansCode(v as '30' | '48' | '10' | '20')}
                        options={[
                          {
                            value: '30',
                            label: pickLocalized(lang, {
                              fr: '30 — Virement SEPA',
                              ru: '30 — Перевод SEPA',
                              hy: '30 — SEPA փոխանցում',
                              ka: '30 — SEPA გადარიცხვა',
                            }),
                          },
                          {
                            value: '48',
                            label: pickLocalized(lang, {
                              fr: '48 — Carte bancaire',
                              ru: '48 — Банковская карта',
                              hy: '48 — Բանկային քարտ',
                              ka: '48 — საბანკო ბარათი',
                            }),
                          },
                          {
                            value: '20',
                            label: pickLocalized(lang, {
                              fr: '20 — Chèque de banque',
                              ru: '20 — Чек',
                              hy: '20 — Բանկային չեկ',
                              ka: '20 — საბანკო ჩეკი',
                            }),
                          },
                          {
                            value: '10',
                            label: pickLocalized(lang, {
                              fr: '10 — Espèces',
                              ru: '10 — Наличные',
                              hy: '10 — Կանխիկ',
                              ka: '10 — ნაღდი',
                            }),
                          },
                        ]}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                        {pickLocalized(lang, {
                          fr: 'Régime de TVA',
                          ru: 'Режим НДС (TVA)',
                          hy: 'ԱԱՀ ռեժիմ (TVA)',
                          ka: 'დღგ რეჟიმი (TVA)',
                        })}
                      </label>
                      {isVatExemptSeller ? (
                        <div
                          data-testid="facturx-vat-exempt-badge"
                          className="w-full px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] border border-[var(--border)] text-xs font-semibold text-[var(--foreground)]"
                        >
                          {isParticulier
                            ? pickLocalized(lang, {
                                fr: 'Particulier — Non assujetti (0%)',
                                ru: 'Particulier — Без НДС (0%)',
                                hy: 'Particulier — Առանց ԱԱՀ (0%)',
                                ka: 'Particulier — დღგ-ს გარეშე (0%)',
                              })
                            : pickLocalized(lang, {
                                fr: 'Franchise en base de TVA (0% · Art. 293 B du CGI)',
                                ru: 'Освобождение от НДС — Franchise en base (0% · Art. 293 B CGI)',
                                hy: 'ԱԱՀ-ից ազատում — Franchise en base (0% · Art. 293 B CGI)',
                                ka: 'დღგ-სგან გათავისუფლება — Franchise en base (0% · Art. 293 B CGI)',
                              })}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <ThemedSelect<VatRegime>
                            testId="facturx-vat-select"
                            ariaLabel={pickLocalized(lang, {
                              fr: 'Régime TVA',
                              ru: 'Режим НДС',
                              hy: 'ԱԱՀ ռեժիմ',
                              ka: 'დღგ რეჟიმი',
                            })}
                            value={vatMode}
                            onChange={(v) => {
                              setVatMode(v);
                              if (v === 'franchise_base') {
                                setVatRatePercent(0);
                              } else if (vatRatePercent === 0) {
                                setVatRatePercent(20);
                              }
                            }}
                            options={[
                              {
                                value: 'tva_marge',
                                label: pickLocalized(lang, {
                                  fr: 'AE — TVA sur la marge (Art. 297 A CGI)',
                                  ru: 'AE — НДС с маржи (Art. 297 A CGI)',
                                  hy: 'AE — ԱԱՀ մարժայի վրա (Art. 297 A CGI)',
                                  ka: 'AE — დღგ მარჟაზე (Art. 297 A CGI)',
                                }),
                              },
                              {
                                value: 'tva_total',
                                label: pickLocalized(lang, {
                                  fr: 'S — TVA sur le prix total (20%)',
                                  ru: 'S — НДС с полной суммы (20%)',
                                  hy: 'S — ԱԱՀ ամբողջ գումարից (20%)',
                                  ka: 'S — დღგ სრული თანხიდან (20%)',
                                }),
                              },
                              {
                                value: 'franchise_base',
                                label: pickLocalized(lang, {
                                  fr: 'E — Franchise en base (0% · Art. 293 B)',
                                  ru: 'E — Без НДС / Franchise en base (0% · Art. 293 B)',
                                  hy: 'E — Առանց ԱԱՀ / Franchise en base (0% · Art. 293 B)',
                                  ka: 'E — დღგ-ს გარეშე / Franchise en base (0% · Art. 293 B)',
                                }),
                              },
                              {
                                value: 'custom',
                                label: pickLocalized(lang, {
                                  fr: 'S — Taux TVA personnalisé (%)',
                                  ru: 'S — Своя ставка НДС (%)',
                                  hy: 'S — Հատուկ ԱԱՀ տոկոսադրույք (%)',
                                  ka: 'S — მორგებული დღგ განაკვეთი (%)',
                                }),
                              },
                            ]}
                            triggerClassName="flex-1 min-w-0"
                          />
                          {vatMode !== 'franchise_base' && (
                            <div className="relative w-20 shrink-0">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.1"
                                data-testid="facturx-vat-rate-input"
                                aria-label={pickLocalized(lang, {
                                  fr: 'Taux TVA %',
                                  ru: 'Ставка НДС %',
                                  hy: 'ԱԱՀ տոկոսադրույք %',
                                  ka: 'დღგ განაკვეთი %',
                                })}
                                value={vatRatePercent}
                                onChange={(e) =>
                                  setVatRatePercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                                }
                                className="w-full px-2.5 py-2 pr-6 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs font-bold text-[var(--foreground)] tabular-nums"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--muted-foreground)]">
                                %
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checklist */}
                  {facturxReadiness && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                        <span>
                          {pickLocalized(lang, {
                            fr: 'Contrôle des mentions obligatoires EN 16931',
                            ru: 'Контроль реквизитов EN 16931 / PPF',
                            hy: 'EN 16931 պարտադիր տվյալների ստուգում',
                            ka: 'EN 16931 სავალდებულო რეკვიზიტების შემოწმება',
                          })}
                        </span>
                        {onNavigateSettings && !facturxReadiness.ready && (
                          <button
                            type="button"
                            onClick={onNavigateSettings}
                            className="text-[var(--primary)] hover:underline normal-case font-semibold"
                          >
                            {pickLocalized(lang, {
                              fr: 'Compléter le profil →',
                              ru: 'Заполнить реквизиты профиля →',
                              hy: 'Լրացնել պրոֆիլի տվյալները →',
                              ka: 'შეავსეთ პროფილის მონაცემები →',
                            })}
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {facturxReadiness.checks.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3 px-3 py-2 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs"
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              {item.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-[var(--foreground)]">
                                  {pickLocalized(lang, {
                                    fr: item.labelFr,
                                    ru: item.labelRu,
                                    hy: item.labelHy,
                                    ka: item.labelKa,
                                  })}
                                </div>
                                <div className="text-[11px] text-[var(--muted-foreground)] truncate">
                                  {item.valuePreview}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {facturxReadiness.warnings.length > 0 && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-500 space-y-1">
                          {facturxReadiness.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2.5 pt-2">
                    <button
                      type="button"
                      data-testid="facturx-download-xml-btn"
                      onClick={handleDownloadFacturXXml}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] transition"
                    >
                      <Code2 className="w-4 h-4 text-blue-500" />
                      <span>{t('facturXDownloadXml')}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="facturx-download-pdf-btn"
                      disabled={isGeneratingFacturx}
                      onClick={handleDownloadFacturXHybridPdf}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-60 transition"
                    >
                      <FileCheck2 className="w-4 h-4" />
                      <span>{t('facturXDownloadHybrid')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right XML Inspector Column */}
          <div className="lg:col-span-6">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-3 h-full flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-[var(--primary)]" />
                  <h4 className="text-sm font-bold text-[var(--foreground)]">
                    {pickLocalized(lang, {
                      fr: 'Aperçu XML UN/CEFACT CII (factur-x.xml)',
                      ru: 'Структура XML UN/CEFACT CII (factur-x.xml)',
                      hy: 'XML UN/CEFACT CII կառուցվածք (factur-x.xml)',
                      ka: 'XML UN/CEFACT CII სტრუქტურა (factur-x.xml)',
                    })}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowXmlPreview((prev) => !prev)}
                  className="text-xs font-semibold text-[var(--primary)] hover:underline"
                >
                  {showXmlPreview
                    ? pickLocalized(lang, {
                        fr: 'Masquer',
                        ru: 'Свернуть',
                        hy: 'Թաքցնել',
                        ka: 'დამალვა',
                      })
                    : pickLocalized(lang, {
                        fr: 'Afficher',
                        ru: 'Показать',
                        hy: 'Ցուցադրել',
                        ka: 'ჩვენება',
                      })}
                </button>
              </div>

              {showXmlPreview && (
                <pre
                  data-testid="facturx-xml-preview"
                  className="flex-1 max-h-[540px] overflow-auto rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3.5 text-[11px] leading-relaxed font-mono text-[var(--foreground)]"
                >
                  {facturxXml ||
                    `<!-- ${pickLocalized(lang, {
                      fr: 'Sélectionnez un véhicule pour prévisualiser factur-x.xml',
                      ru: 'Выберите автомобиль для предпросмотра factur-x.xml',
                      hy: 'Ընտրեք ավտոմեքենա՝ factur-x.xml-ը դիտելու համար',
                      ka: 'აირჩიეთ ავტომობილი factur-x.xml-ის სანახავად',
                    })} -->`}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: USER ACTIVITY HISTORY & ENTITY CHANGE LOG */}
      {activeTab === 'audit' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="audit-subtab-activity"
                onClick={() => setAuditSubTab('activity')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                  auditSubTab === 'activity'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                    : 'bg-[var(--surface-muted)] text-[var(--muted-foreground)] border-[var(--border)]'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{t('auditActivityTitle')}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/15 text-[10px] tabular-nums">
                  {activityLogs.length}
                </span>
              </button>

              <button
                type="button"
                data-testid="audit-subtab-changes"
                onClick={() => setAuditSubTab('changes')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                  auditSubTab === 'changes'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                    : 'bg-[var(--surface-muted)] text-[var(--muted-foreground)] border-[var(--border)]'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>{t('auditChangeLogTitle')}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/15 text-[10px] tabular-nums">
                  {changeLogs.length}
                </span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-testid="audit-search-input"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder={pickLocalized(lang, {
                    fr: 'Rechercher...',
                    ru: 'Поиск по журналу...',
                    hy: 'Որոնել մատյանում...',
                    ka: 'ძებნა ჟურნალში...',
                  })}
                  className="w-full pl-8 pr-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              {auditSubTab === 'activity' ? (
                <div className="w-full sm:w-48">
                  <ThemedSelect
                    testId="audit-activity-filter"
                    ariaLabel={pickLocalized(lang, {
                      fr: 'Filtrer les actions',
                      ru: 'Фильтр действий',
                      hy: 'Զտել գործողությունները',
                      ka: 'მოქმედებების ფილტრი',
                    })}
                    value={activityFilter}
                    onChange={setActivityFilter}
                    options={[
                      {
                        value: 'all',
                        label: pickLocalized(lang, {
                          fr: 'Toutes les actions',
                          ru: 'Все действия',
                          hy: 'Բոլոր գործողությունները',
                          ka: 'ყველა მოქმედება',
                        }),
                      },
                      {
                        value: 'export_csv',
                        label: pickLocalized(lang, {
                          fr: 'Export CSV',
                          ru: 'Экспорт CSV',
                          hy: 'CSV արտահանում',
                          ka: 'CSV ექსპორტი',
                        }),
                      },
                      {
                        value: 'export_excel',
                        label: pickLocalized(lang, {
                          fr: 'Export Excel',
                          ru: 'Экспорт Excel',
                          hy: 'Excel արտահանում',
                          ka: 'Excel ექსპორტი',
                        }),
                      },
                      {
                        value: 'export_pdf',
                        label: pickLocalized(lang, {
                          fr: 'Export PDF',
                          ru: 'Экспорт PDF',
                          hy: 'PDF արտահանում',
                          ka: 'PDF ექსპორტი',
                        }),
                      },
                      { value: 'export_facturx', label: 'Factur-X' },
                      {
                        value: 'backup_created',
                        label: pickLocalized(lang, {
                          fr: 'Backup créé',
                          ru: 'Бэкап создан',
                          hy: 'Պահուստավորում ստեղծվեց',
                          ka: 'სარეზერვო ასლი შეიქმნა',
                        }),
                      },
                      {
                        value: 'backup_restored',
                        label: pickLocalized(lang, {
                          fr: 'Restauration',
                          ru: 'Восстановление',
                          hy: 'Վերականգնում',
                          ka: 'აღდგენა',
                        }),
                      },
                      {
                        value: 'vehicle_created',
                        label: pickLocalized(lang, {
                          fr: 'Véhicule ajouté',
                          ru: 'Авто добавлено',
                          hy: 'Մեքենան ավելացվել է',
                          ka: 'ავტო დამატებულია',
                        }),
                      },
                      {
                        value: 'vehicle_updated',
                        label: pickLocalized(lang, {
                          fr: 'Véhicule modifié',
                          ru: 'Авто обновлено',
                          hy: 'Մեքենան թարմացվել է',
                          ka: 'ავტო განახლებულია',
                        }),
                      },
                      {
                        value: 'vehicle_sold',
                        label: pickLocalized(lang, {
                          fr: 'Vente clôturée',
                          ru: 'Продажа авто',
                          hy: 'Վաճառք',
                          ka: 'გაყიდვა',
                        }),
                      },
                      {
                        value: 'document_uploaded',
                        label: pickLocalized(lang, {
                          fr: 'Document',
                          ru: 'Документ',
                          hy: 'Փաստաթուղթ',
                          ka: 'დოკუმენტი',
                        }),
                      },
                    ]}
                  />
                </div>
              ) : (
                <div className="w-full sm:w-48">
                  <ThemedSelect
                    testId="audit-changelog-filter"
                    ariaLabel={pickLocalized(lang, {
                      fr: 'Filtrer par entité',
                      ru: 'Фильтр по объекту',
                      hy: 'Զտել ըստ օբյեկտի',
                      ka: 'ობიექტით ფილტრი',
                    })}
                    value={changeEntityFilter}
                    onChange={setChangeEntityFilter}
                    options={[
                      {
                        value: 'all',
                        label: pickLocalized(lang, {
                          fr: 'Toutes les entités',
                          ru: 'Все объекты',
                          hy: 'Բոլոր օբյեկտները',
                          ka: 'ყველა ობიექტი',
                        }),
                      },
                      {
                        value: 'vehicle',
                        label: pickLocalized(lang, {
                          fr: 'Véhicules',
                          ru: 'Автомобили',
                          hy: 'Մեքենաներ',
                          ka: 'ავტომობილები',
                        }),
                      },
                      {
                        value: 'supplier',
                        label: pickLocalized(lang, {
                          fr: 'Fournisseurs',
                          ru: 'Поставщики',
                          hy: 'Մատակարարներ',
                          ka: 'მომწოდებლები',
                        }),
                      },
                      {
                        value: 'purchase',
                        label: pickLocalized(lang, {
                          fr: 'Achats',
                          ru: 'Закупки',
                          hy: 'Գնումներ',
                          ka: 'შესყიდვები',
                        }),
                      },
                      {
                        value: 'document',
                        label: pickLocalized(lang, {
                          fr: 'Documents',
                          ru: 'Документы',
                          hy: 'Փաստաթղթեր',
                          ka: 'დოკუმენტები',
                        }),
                      },
                      {
                        value: 'settings',
                        label: pickLocalized(lang, {
                          fr: 'Paramètres',
                          ru: 'Настройки',
                          hy: 'Կարգավորումներ',
                          ka: 'პარამეტრები',
                        }),
                      },
                      {
                        value: 'backup',
                        label: pickLocalized(lang, {
                          fr: 'Sauvegardes',
                          ru: 'Резервные копии',
                          hy: 'Պահուստային պատճեններ',
                          ka: 'სარეზერვო ასლები',
                        }),
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          </div>

          {auditSubTab === 'activity' ? (
            filteredActivityLogs.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                {pickLocalized(lang, {
                  fr: "Aucune action enregistrée pour l'instant. Lancez un export, une sauvegarde ou modifiez un véhicule.",
                  ru: 'История действий пока пуста. Выполните экспорт, создайте бэкап или измените данные.',
                  hy: 'Գործողությունների պատմությունը դատարկ է։ Կատարեք արտահանում կամ պահուստավորում։',
                  ka: 'მოქმედებების ისტორია ცარიელია. გააკეთეთ ექსპორტი ან სარეზერვო ასლი.',
                })}
              </div>
            ) : (
              <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                <table data-testid="activity-log-table" className="w-full text-left text-xs">
                  <thead className="bg-[var(--ag-table-header-bg)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="px-3.5 py-2.5 font-bold">
                        {pickLocalized(lang, {
                          fr: 'Horodatage',
                          ru: 'Дата / Время',
                          hy: 'Ամսաթիվ / Ժամ',
                          ka: 'თარიღი / დრო',
                        })}
                      </th>
                      <th className="px-3.5 py-2.5 font-bold">
                        {pickLocalized(lang, {
                          fr: 'Utilisateur',
                          ru: 'Пользователь',
                          hy: 'Օգտատեր',
                          ka: 'მომხმარებელი',
                        })}
                      </th>
                      <th className="px-3.5 py-2.5 font-bold">
                        {pickLocalized(lang, {
                          fr: 'Action',
                          ru: 'Действие',
                          hy: 'Գործողություն',
                          ka: 'მოქმედება',
                        })}
                      </th>
                      <th className="px-3.5 py-2.5 font-bold">
                        {pickLocalized(lang, {
                          fr: 'Cible & Détails',
                          ru: 'Объект / Детали',
                          hy: 'Օբյեկտ / Մանրամասներ',
                          ka: 'ობიექტი / დეტალები',
                        })}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredActivityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[var(--ag-table-row-hover)] transition-colors">
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-[var(--muted-foreground)] whitespace-nowrap tabular-nums">
                          {formatIsoTimestamp(log.timestamp)}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-[var(--foreground)] whitespace-nowrap">
                          {log.actorEmail}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-[11px] font-bold text-[var(--primary)]">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="font-semibold text-[var(--foreground)]">{log.targetLabel}</div>
                          {log.details && (
                            <div className="text-[11px] text-[var(--muted-foreground)]">{log.details}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : filteredChangeLogs.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
              {pickLocalized(lang, {
                fr: 'Aucune modification enregistrée. Les créations, mises à jour et suppressions sont tracées ici.',
                ru: 'Журнал изменений пока пуст. Изменения по автомобилям, документам и настройкам фиксируются автоматически.',
                hy: 'Փոփոխությունների մատյանը դատարկ է։ Փոփոխությունները գրանցվում են ավտոմատ կերպով։',
                ka: 'ცვლილებების ჟურნალი ცარიელია. ცვლილებები ავტომატურად იწერება.',
              })}
            </div>
          ) : (
            <div data-testid="change-log-list" className="space-y-3">
              {filteredChangeLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                          entry.operation === 'create'
                            ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                            : entry.operation === 'delete'
                            ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                            : entry.operation === 'restore'
                            ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                            : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                        }`}
                      >
                        {entry.operation}
                      </span>
                      <span className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">
                        {entry.entityType}
                      </span>
                      <span className="text-xs font-bold text-[var(--foreground)]">
                        {entry.entityLabel}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                      {entry.actorEmail} · {formatIsoTimestamp(entry.timestamp)}
                    </div>
                  </div>

                  {entry.changes.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {entry.changes.map((diff, idx) => (
                        <div
                          key={`${diff.field}_${idx}`}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[11px]"
                        >
                          <div className="font-bold text-[var(--foreground)]">{diff.field}</div>
                          <div className="flex items-center gap-1.5 text-[var(--muted-foreground)] truncate">
                            <span className="line-through text-rose-400 truncate">{diff.oldValue}</span>
                            <span>→</span>
                            <span className="font-semibold text-emerald-500 truncate">{diff.newValue}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FULL BACKUP & RESTORE */}
      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Create Snapshot & Export JSON v2 */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    {t('backupCreateTitle')}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {pickLocalized(lang, {
                      fr: 'Inclut véhicules, réparations, frais, fournisseurs, achats, documents et paramètres.',
                      ru: 'Включает авто, ремонты, расходы, поставщиков, закупки, документы и настройки.',
                      hy: 'Ներառում է մեքենաներ, վերանորոգումներ, ծախսեր, մատակարարներ, գնումներ և փաստաթղթեր։',
                      ka: 'მოიცავს ავტომობილებს, შეკეთებებს, ხარჯებს, მომწოდებლებს, შესყიდვებს და პარამეტრებს.',
                    })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                {[
                  {
                    label: pickLocalized(lang, {
                      fr: 'Véhicules',
                      ru: 'Авто',
                      hy: 'Մեքենա',
                      ka: 'ავტო',
                    }),
                    val: vehicles.length,
                  },
                  {
                    label: pickLocalized(lang, {
                      fr: 'Répar.',
                      ru: 'Ремонт',
                      hy: 'Վերանոր.',
                      ka: 'შეკეთ.',
                    }),
                    val: fleetData.repairs.length,
                  },
                  {
                    label: pickLocalized(lang, {
                      fr: 'Frais',
                      ru: 'Расходы',
                      hy: 'Ծախսեր',
                      ka: 'ხარჯები',
                    }),
                    val: fleetData.expenses.length,
                  },
                  {
                    label: pickLocalized(lang, {
                      fr: 'Fourniss.',
                      ru: 'Поставщ.',
                      hy: 'Մատակ.',
                      ka: 'მომწ.',
                    }),
                    val: suppliers.length,
                  },
                  {
                    label: pickLocalized(lang, {
                      fr: 'Achats',
                      ru: 'Закупки',
                      hy: 'Գնումներ',
                      ka: 'შესყიდვ.',
                    }),
                    val: purchases.length,
                  },
                  {
                    label: pickLocalized(lang, {
                      fr: 'Docs',
                      ru: 'Док-ты',
                      hy: 'Փաստ.',
                      ka: 'დოკ.',
                    }),
                    val: documents.length,
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="p-2 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]"
                  >
                    <div className="text-base font-extrabold text-[var(--foreground)] tabular-nums">
                      {c.val}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                      {c.label}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleCreateRestorePoint} className="space-y-2.5">
                <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Libellé du point de restauration',
                    ru: 'Название точки восстановления',
                    hy: 'Վերականգնման կետի անվանում',
                    ka: 'აღდგენის წერტილის დასახელება',
                  })}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    data-testid="backup-snapshot-label-input"
                    value={snapshotLabel}
                    onChange={(e) => setSnapshotLabel(e.target.value)}
                    placeholder={pickLocalized(lang, {
                      fr: 'Ex: Avant clôture mensuelle',
                      ru: 'Например: Перед инвентаризацией',
                      hy: 'Օր.՝ Ամսական փակումից առաջ',
                      ka: 'მაგ.: თვის დახურვამდე',
                    })}
                    className="flex-1 px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="submit"
                    data-testid="backup-create-snapshot-btn"
                    disabled={isCreatingSnapshot}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-60 transition shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {pickLocalized(lang, {
                        fr: 'Créer un snapshot',
                        ru: 'Сохранить точку',
                        hy: 'Պահպանել կետ',
                        ka: 'სნეპშოტის შექმნა',
                      })}
                    </span>
                  </button>
                </div>
              </form>

              <div className="pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  data-testid="backup-download-v2-btn"
                  onClick={handleDownloadFullBackupV2}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {pickLocalized(lang, {
                      fr: 'Télécharger la sauvegarde complète (JSON v2)',
                      ru: 'Скачать полный бэкап (JSON v2)',
                      hy: 'Ներբեռնել ամբողջական կրկնօրինակը (JSON v2)',
                      ka: 'სრული სარეზერვო ასლის ჩამოტვირთვა (JSON v2)',
                    })}
                  </span>
                </button>
              </div>
            </div>

            {/* Saved Restore Points */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-3">
              <h4 className="text-sm font-bold text-[var(--foreground)]">
                {pickLocalized(lang, {
                  fr: 'Points de restauration enregistrés',
                  ru: 'Сохранённые точки восстановления',
                  hy: 'Պահպանված վերականգնման կետեր',
                  ka: 'შენახული აღდგენის წერტილები',
                })}{' '}
                ({backupSnapshots.length})
              </h4>

              {backupSnapshots.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Aucun point de restauration enregistré pour le moment.',
                    ru: 'Нет сохранённых точек восстановления.',
                    hy: 'Պահպանված վերականգնման կետեր չկան։',
                    ka: 'შენახული აღდგენის წერტილები ჯერ არ არის.',
                  })}
                </div>
              ) : (
                <div data-testid="backup-snapshots-list" className="space-y-2.5">
                  {backupSnapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[var(--foreground)] truncate">
                            {snap.label}
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                            {formatIsoTimestamp(snap.createdAt)} · {formatBytes(snap.sizeBytes)} ·{' '}
                            {snap.counts.vehicles}{' '}
                            {pickLocalized(lang, { fr: 'véh.', ru: 'авто', hy: 'մեք.', ka: 'ავტო' })},{' '}
                            {snap.counts.suppliers}{' '}
                            {pickLocalized(lang, { fr: 'fourn.', ru: 'пост.', hy: 'մատ.', ka: 'მომწ.' })},{' '}
                            {snap.counts.documents}{' '}
                            {pickLocalized(lang, { fr: 'docs', ru: 'док.', hy: 'փաստ.', ka: 'დოკ.' })}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectSnapshotForRestore(snap)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 hover:opacity-90 transition"
                          >
                            {pickLocalized(lang, {
                              fr: 'Restaurer',
                              ru: 'Восстановить',
                              hy: 'Վերականգնել',
                              ka: 'აღდგენა',
                            })}
                          </button>

                          {confirmDeleteSnapshotId === snap.id ? (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteRestorePoint(snap.id);
                                  setConfirmDeleteSnapshotId(null);
                                }}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-600 text-white"
                              >
                                OK
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSnapshotId(null)}
                                className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]"
                              >
                                ×
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              aria-label={pickLocalized(lang, {
                                fr: 'Supprimer',
                                ru: 'Удалить снимок',
                                hy: 'Ջնջել',
                                ka: 'წაშლა',
                              })}
                              onClick={() => setConfirmDeleteSnapshotId(snap.id)}
                              className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-rose-500 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Restore from File & Pre-Restore Validation */}
          <div className="lg:col-span-6">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-4">
              <div className="flex items-center gap-2">
                <ArchiveRestore className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    {t('backupRestoreTitle')}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {pickLocalized(lang, {
                      fr: 'Compatible avec les sauvegardes JSON v1 et v2 avec prévisualisation avant application.',
                      ru: 'Поддерживаются резервные копии v1 и v2. Предпросмотр состава данных перед применением.',
                      hy: 'Աջակցվում են v1 և v2 JSON կրկնօրինակները՝ նախադիտմամբ։',
                      ka: 'თავსებადია JSON v1 და v2 სარეზერვო ასლებთან წინასწარი ნახვით.',
                    })}
                  </p>
                </div>
              </div>

              <input
                ref={restoreFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleSelectRestoreFile}
                className="hidden"
                data-testid="backup-restore-file-input"
              />

              <button
                type="button"
                data-testid="backup-pick-json-btn"
                onClick={() => restoreFileInputRef.current?.click()}
                className="w-full py-5 px-4 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-muted)]/60 hover:border-[var(--primary)] transition flex flex-col items-center justify-center gap-2 text-center"
              >
                <Upload className="w-6 h-6 text-[var(--primary)]" />
                <span className="text-xs font-bold text-[var(--foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Sélectionner un fichier de sauvegarde (.json)',
                    ru: 'Выберите файл резервной копии (.json)',
                    hy: 'Ընտրել պահուստային ֆայլ (.json)',
                    ka: 'აირჩიეთ სარეზერვო ფაილი (.json)',
                  })}
                </span>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {pickLocalized(lang, {
                    fr: 'Le contenu sera vérifié et prévisualisé avant restauration',
                    ru: 'Данные будут проверены перед восстановлением',
                    hy: 'Տվյալները կստուգվեն վերականգնումից առաջ',
                    ka: 'მონაცემები შემოწმდება აღდგენამდე',
                  })}
                </span>
              </button>

              {pendingRestore && (
                <div
                  data-testid="backup-restore-preview-card"
                  className="p-4 rounded-xl bg-[var(--surface-muted)] border border-[var(--primary)]/40 space-y-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-extrabold text-[var(--foreground)]">
                        {pickLocalized(lang, {
                          fr: 'Aperçu avant restauration :',
                          ru: 'Предпросмотр восстановления :',
                          hy: 'Նախադիտում վերականգնումից առաջ՝',
                          ka: 'წინასწარი ნახვა აღდგენამდე:',
                        })}{' '}
                        {pendingRestore.sourceName}
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                        {pickLocalized(lang, {
                          fr: 'Exporté le :',
                          ru: 'Экспортировано:',
                          hy: 'Արտահանվել է՝',
                          ka: 'ექსპორტირებულია:',
                        })}{' '}
                        {formatIsoTimestamp(pendingRestore.payload.exportedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingRestore(null)}
                      className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      {t('docsCancelBtn')}
                    </button>
                  </div>

                  {(() => {
                    const counts = computeBackupCounts(pendingRestore.payload);
                    return (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                          <div className="text-sm font-extrabold tabular-nums">{counts.vehicles}</div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            {pickLocalized(lang, {
                              fr: 'Véhicules',
                              ru: 'Авто',
                              hy: 'Մեքենա',
                              ka: 'ავტო',
                            })}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                          <div className="text-sm font-extrabold tabular-nums">
                            {counts.repairs + counts.expenses}
                          </div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            {pickLocalized(lang, {
                              fr: 'Répar. + Frais',
                              ru: 'Ремонт + Расходы',
                              hy: 'Վերանոր. + Ծախս',
                              ka: 'შეკეთ. + ხარჯ.',
                            })}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                          <div className="text-sm font-extrabold tabular-nums">
                            {counts.suppliers + counts.purchases + counts.documents}
                          </div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            {pickLocalized(lang, {
                              fr: 'Fourn. + Docs',
                              ru: 'Пост. + Док-ты',
                              hy: 'Մատ. + Փաստ.',
                              ka: 'მომწ. + დოკ.',
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-[var(--foreground)]">
                      {pickLocalized(lang, {
                        fr: 'Mode de restauration',
                        ru: 'Режим восстановления',
                        hy: 'Վերականգնման ռեժիմ',
                        ka: 'აღდგენის რეჟიმი',
                      })}
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        data-testid="backup-mode-merge"
                        onClick={() => setRestoreMode('merge')}
                        className={`text-left px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                          restoreMode === 'merge'
                            ? 'bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--foreground)]'
                            : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)]'
                        }`}
                      >
                        {t('backupMergeMode')}
                      </button>
                      <button
                        type="button"
                        data-testid="backup-mode-replace"
                        onClick={() => setRestoreMode('replace')}
                        className={`text-left px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                          restoreMode === 'replace'
                            ? 'bg-rose-500/15 border-rose-500 text-rose-500'
                            : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)]'
                        }`}
                      >
                        {t('backupReplaceMode')}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="backup-confirm-restore-btn"
                    disabled={isRestoring}
                    onClick={handleConfirmRestore}
                    className="w-full py-2.5 px-4 rounded-[var(--ag-button-radius)] text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 transition"
                  >
                    {isRestoring ? t('loading') : t('backupConfirmRestore')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
