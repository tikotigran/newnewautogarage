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
  BackupRestoreMode,
  BackupSnapshotRecord,
  ChangeLogEntry,
  DocumentHistoryEvent,
  FullGarageBackupV2,
  GarageDocument,
  GarageSettings,
  GeneralExpense,
  Purchase,
  RepairTask,
  Supplier,
  UserActivityLog,
  Vehicle,
} from '../types/garage';
import {
  getGarageSettings,
  subscribeAllFleetExpensesAndRepairs,
} from '../services/garageService';
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
  onNavigateSettings,
}) => {
  const { lang, t } = useI18n();
  const isRu = lang === 'ru';

  const [activeTab, setActiveTab] = useState<ExportsBackupTab>('exports');
  const [periodRange, setPeriodRange] = useState<AnalyticsTimeRange>('all');
  const [garageSettings, setGarageSettings] = useState<GarageSettings>(() => getGarageSettings());
  const [fleetData, setFleetData] = useState<{
    repairs: RepairTask[];
    expenses: GeneralExpense[];
  }>({ repairs: [], expenses: [] });

  const [selectedPdfVehicleId, setSelectedPdfVehicleId] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Factur-X state
  const [facturxVehicleId, setFacturxVehicleId] = useState<string>('');
  const [paymentMeansCode, setPaymentMeansCode] = useState<'30' | '48' | '10' | '20'>('30');
  const [vatMode, setVatMode] = useState<'margin' | 'standard_20'>('margin');
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
    const syncSettings = () => setGarageSettings(getGarageSettings());
    syncSettings();
    window.addEventListener('autogarage_settings_updated', syncSettings);
    return () => window.removeEventListener('autogarage_settings_updated', syncSettings);
  }, []);

  useEffect(() => {
    const unsub = subscribeAllFleetExpensesAndRepairs(vehicles, setFleetData);
    return () => unsub();
  }, [vehicles]);

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
      taxRegime: garageSettings.taxRegime,
      taxRatePercent: garageSettings.taxRatePercent,
    });
  }, [
    vehicles,
    fleetData.repairs,
    fleetData.expenses,
    periodRange,
    garageSettings.taxRegime,
    garageSettings.taxRatePercent,
  ]);

  const periodLabelMap: Record<AnalyticsTimeRange, string> = {
    today: isRu ? 'Сегодня' : "Aujourd'hui",
    week: isRu ? 'Неделя' : 'Cette semaine',
    month: isRu ? 'Месяц' : 'Ce mois-ci',
    quarter: isRu ? 'Квартал' : 'Ce trimestre',
    year: isRu ? 'Год' : 'Cette année',
    all: isRu ? 'Весь период' : "Tout l'historique",
    '3months': '3 mois',
    '6months': '6 mois',
    custom: isRu ? 'Произвольный период' : 'Personnalisé',
  };

  const selectedPdfVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedPdfVehicleId) || vehicles[0] || null,
    [vehicles, selectedPdfVehicleId]
  );

  const facturxVehicle = useMemo(
    () => vehicles.find((v) => v.id === facturxVehicleId) || vehicles[0] || null,
    [vehicles, facturxVehicleId]
  );

  const facturxReadiness = useMemo(() => {
    if (!facturxVehicle) return null;
    return validateFacturXReadiness(facturxVehicle, garageSettings);
  }, [facturxVehicle, garageSettings]);

  const facturxXml = useMemo(() => {
    if (!facturxVehicle) return '';
    return buildFacturXXml(facturxVehicle, garageSettings, {
      paymentMeansCode,
      vatMode,
    });
  }, [facturxVehicle, garageSettings, paymentMeansCode, vatMode]);

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
      text: isRu ? `Финансовый CSV скачан: ${fileName}` : `Export financier CSV téléchargé : ${fileName}`,
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
      text: isRu ? `Финансовая книга Excel скачана: ${fileName}` : `Classeur Excel financier téléchargé : ${fileName}`,
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
      text: isRu ? `Список авто в Excel скачан: ${fileName}` : `Export Excel du parc téléchargé : ${fileName}`,
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
      text: isRu ? `CSV автомобилей скачан: ${fileName}` : `CSV véhicules téléchargé : ${fileName}`,
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
      text: isRu ? 'Сводный PDF-отчёт P&L сформирован.' : 'Rapport financier global PDF téléchargé.',
    });
  };

  const handleExportVehiclePdf = async () => {
    if (!selectedPdfVehicle) return;
    const vRepairs = fleetData.repairs.filter((r) => r.vehicleId === selectedPdfVehicle.id);
    const vExpenses = fleetData.expenses.filter((e) => e.vehicleId === selectedPdfVehicle.id);
    generateVehicleFinancialReportPDF(selectedPdfVehicle, vRepairs, vExpenses);
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
      text: isRu
        ? `PDF-отчёт по ${selectedPdfVehicle.make} ${selectedPdfVehicle.model} скачан.`
        : `Bilan PDF téléchargé pour ${selectedPdfVehicle.make} ${selectedPdfVehicle.model}.`,
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
      text: isRu ? `XML Factur-X скачан: ${fileName}` : `XML Factur-X téléchargé : ${fileName}`,
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
        text: isRu
          ? `Гибридный PDF Factur-X с вложенным XML скачан: ${result.fileName}`
          : `PDF hybride Factur-X généré avec factur-x.xml embarqué : ${result.fileName}`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur Factur-X PDF',
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
      text: isRu
        ? `Полный бэкап v2 скачан: ${fileName}`
        : `Sauvegarde complète v2 téléchargée : ${fileName}`,
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
      const label =
        snapshotLabel.trim() ||
        (isRu
          ? `Точка восстановления ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
          : `Point de restauration ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);

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
        text: isRu ? `Точка восстановления создана: ${label}` : `Point de restauration enregistré : ${label}`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Backup error',
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
        text: err instanceof Error ? err.message : 'Invalid backup JSON',
      });
    } finally {
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
    }
  };

  const handleSelectSnapshotForRestore = (snap: BackupSnapshotRecord) => {
    if (!snap.payloadJson) {
      setStatusBanner({
        type: 'error',
        text: isRu
          ? 'У этой точки восстановления отсутствует JSON-снимок.'
          : 'Ce point de restauration ne contient pas de snapshot JSON.',
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
        text: err instanceof Error ? err.message : 'Invalid snapshot JSON',
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
        text: isRu
          ? `Данные успешно восстановлены (${pendingRestore.payload.vehicles.length} авто, ${pendingRestore.payload.suppliers.length} поставщиков, ${pendingRestore.payload.documents.length} документов).`
          : `Restauration terminée avec succès (${pendingRestore.payload.vehicles.length} véhicules, ${pendingRestore.payload.suppliers.length} fournisseurs, ${pendingRestore.payload.documents.length} documents).`,
      });
      setPendingRestore(null);
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Restore failed',
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
    <div data-testid="exports-backup-view" className="space-y-5">
      {/* Header & Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)]">
              <DatabaseBackup className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--foreground)]">
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
        <div className="space-y-5">
          {/* Live Separated P&L Period Preview */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  {isRu
                    ? 'Финансовый срез для экспорта (разделение Revenue / Gross Profit / Net Profit)'
                    : 'Aperçu comptable avant export (Revenue / Gross Profit / Net Profit séparés)'}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {isRu
                    ? 'Выручка, валовая прибыль, налоги и чистая прибыль рассчитываются раздельно без смешивания.'
                    : 'Le chiffre d’affaires, la marge brute, les impôts et le bénéfice net sont exportés dans des colonnes distinctes.'}
                </p>
              </div>
              <div className="w-full sm:w-56">
                <ThemedSelect
                  testId="exports-period-select"
                  ariaLabel={isRu ? 'Период отчёта' : 'Période du rapport'}
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
                  1. {isRu ? 'Выручка (Revenue)' : "Chiffre d'affaires (Revenue)"}
                </div>
                <div className="text-lg font-extrabold text-[var(--foreground)] tabular-nums mt-1">
                  {formatEuro(analyticsReport.salesPerformance.revenue)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                  {analyticsReport.salesPerformance.soldCount}{' '}
                  {isRu ? 'продаж' : 'vente(s)'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                  2. {isRu ? 'Валовая прибыль (Gross Profit)' : 'Marge brute (Gross Profit)'}
                </div>
                <div className="text-lg font-extrabold text-[var(--foreground)] tabular-nums mt-1">
                  {formatEuro(analyticsReport.salesPerformance.grossProfit)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                  {analyticsReport.salesPerformance.grossMarginPercent.toFixed(1)}%
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                  {isRu ? 'Налоги' : 'Impôts'} ({analyticsReport.salesPerformance.taxLabel})
                </div>
                <div className="text-lg font-extrabold text-amber-500 tabular-nums mt-1">
                  {formatEuro(analyticsReport.salesPerformance.taxAmount)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {garageSettings.taxRegime?.toUpperCase() || 'SARL'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                  3. {isRu ? 'Чистая прибыль (Net Profit)' : 'Bénéfice net (Net Profit)'}
                </div>
                <div className="text-lg font-extrabold text-emerald-500 tabular-nums mt-1">
                  {formatEuro(analyticsReport.salesPerformance.netProfit)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                  {analyticsReport.salesPerformance.netMarginPercent.toFixed(1)}%{' '}
                  {isRu ? 'маржа' : 'marge nette'}
                </div>
              </div>
            </div>
          </div>

          {/* 3 Export Pillars */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Card 1: Financial CSV / Excel */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between space-y-4">
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
                  {isRu
                    ? 'Листы .xlsx: Synthèse P&L, Ventes & Marges, Dépenses & Achats.'
                    : 'Feuilles .xlsx : Synthèse P&L, Ventes & Marges, Dépenses & Achats.'}
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
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between space-y-4">
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
                  {vehicles.length} {isRu ? 'авто' : 'véhicules'} · {fleetData.repairs.length}{' '}
                  {isRu ? 'ремонтов' : 'réparations'} · {fleetData.expenses.length}{' '}
                  {isRu ? 'расходов' : 'frais'}
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
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 flex flex-col justify-between space-y-4">
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
                      {isRu ? 'Автомобиль для PDF-досье' : 'Véhicule pour bilan PDF individuel'}
                    </label>
                    <ThemedSelect
                      testId="export-pdf-vehicle-select"
                      ariaLabel={isRu ? 'Выбор автомобиля' : 'Choisir un véhicule'}
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Configuration & Readiness Column */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 space-y-4">
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
                  {isRu
                    ? 'Добавьте хотя бы один автомобиль на склад для формирования счёта Factur-X.'
                    : 'Ajoutez au moins un véhicule au stock pour préparer une facture Factur-X.'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                        {isRu ? 'Автомобиль / Сделка' : 'Véhicule / Transaction à facturer'}
                      </label>
                      <ThemedSelect
                        testId="facturx-vehicle-select"
                        ariaLabel="Véhicule Factur-X"
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
                        {isRu ? 'Способ оплаты (BT-81)' : 'Moyen de paiement (BT-81)'}
                      </label>
                      <ThemedSelect
                        testId="facturx-payment-select"
                        ariaLabel="Moyen de paiement"
                        value={paymentMeansCode}
                        onChange={(v) => setPaymentMeansCode(v as '30' | '48' | '10' | '20')}
                        options={[
                          { value: '30', label: isRu ? '30 — Перевод SEPA' : '30 — Virement SEPA' },
                          { value: '48', label: isRu ? '48 — Банковская карта' : '48 — Carte bancaire' },
                          { value: '20', label: isRu ? '20 — Чек' : '20 — Chèque de banque' },
                          { value: '10', label: isRu ? '10 — Наличные' : '10 — Espèces' },
                        ]}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                        {isRu ? 'Режим НДС (TVA)' : 'Régime de TVA'}
                      </label>
                      <ThemedSelect
                        testId="facturx-vat-select"
                        ariaLabel="Régime TVA"
                        value={vatMode}
                        onChange={(v) => setVatMode(v as 'margin' | 'standard_20')}
                        options={[
                          {
                            value: 'margin',
                            label: 'AE — TVA sur la marge (Art. 297 A CGI)',
                          },
                          {
                            value: 'standard_20',
                            label: 'S — TVA normale 20%',
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Checklist */}
                  {facturxReadiness && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                        <span>
                          {isRu
                            ? 'Контроль реквизитов EN 16931 / PPF'
                            : 'Contrôle des mentions obligatoires EN 16931'}
                        </span>
                        {onNavigateSettings && !facturxReadiness.ready && (
                          <button
                            type="button"
                            onClick={onNavigateSettings}
                            className="text-[var(--primary)] hover:underline normal-case font-semibold"
                          >
                            {isRu ? 'Заполнить реквизиты гаража →' : 'Compléter le profil garage →'}
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
                                  {isRu ? item.labelRu : item.labelFr}
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
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 space-y-3 h-full flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-[var(--primary)]" />
                  <h4 className="text-sm font-bold text-[var(--foreground)]">
                    {isRu
                      ? 'Структура XML UN/CEFACT CII (factur-x.xml)'
                      : 'Aperçu XML UN/CEFACT CII (factur-x.xml)'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowXmlPreview((prev) => !prev)}
                  className="text-xs font-semibold text-[var(--primary)] hover:underline"
                >
                  {showXmlPreview
                    ? isRu
                      ? 'Свернуть'
                      : 'Masquer'
                    : isRu
                    ? 'Показать'
                    : 'Afficher'}
                </button>
              </div>

              {showXmlPreview && (
                <pre
                  data-testid="facturx-xml-preview"
                  className="flex-1 max-h-[540px] overflow-auto rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3.5 text-[11px] leading-relaxed font-mono text-[var(--foreground)]"
                >
                  {facturxXml || '<!-- Sélectionnez un véhicule pour prévisualiser factur-x.xml -->'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: USER ACTIVITY HISTORY & ENTITY CHANGE LOG */}
      {activeTab === 'audit' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 space-y-4">
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
                  placeholder={isRu ? 'Поиск по журналу...' : 'Rechercher...'}
                  className="w-full pl-8 pr-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              {auditSubTab === 'activity' ? (
                <div className="w-full sm:w-48">
                  <ThemedSelect
                    testId="audit-activity-filter"
                    ariaLabel="Filtrer les actions"
                    value={activityFilter}
                    onChange={setActivityFilter}
                    options={[
                      { value: 'all', label: isRu ? 'Все действия' : 'Toutes les actions' },
                      { value: 'export_csv', label: 'Export CSV' },
                      { value: 'export_excel', label: 'Export Excel' },
                      { value: 'export_pdf', label: 'Export PDF' },
                      { value: 'export_facturx', label: 'Factur-X' },
                      { value: 'backup_created', label: 'Backup créé' },
                      { value: 'backup_restored', label: 'Restauration' },
                      { value: 'vehicle_created', label: isRu ? 'Авто добавлено' : 'Véhicule ajouté' },
                      { value: 'vehicle_updated', label: isRu ? 'Авто обновлено' : 'Véhicule modifié' },
                      { value: 'vehicle_sold', label: isRu ? 'Продажа авто' : 'Vente clôturée' },
                      { value: 'document_uploaded', label: isRu ? 'Документ' : 'Document' },
                    ]}
                  />
                </div>
              ) : (
                <div className="w-full sm:w-48">
                  <ThemedSelect
                    testId="audit-changelog-filter"
                    ariaLabel="Filtrer par entité"
                    value={changeEntityFilter}
                    onChange={setChangeEntityFilter}
                    options={[
                      { value: 'all', label: isRu ? 'Все объекты' : 'Toutes les entités' },
                      { value: 'vehicle', label: isRu ? 'Автомобили' : 'Véhicules' },
                      { value: 'supplier', label: isRu ? 'Поставщики' : 'Fournisseurs' },
                      { value: 'purchase', label: isRu ? 'Закупки' : 'Achats' },
                      { value: 'document', label: isRu ? 'Документы' : 'Documents' },
                      { value: 'settings', label: isRu ? 'Настройки' : 'Paramètres' },
                      { value: 'backup', label: isRu ? 'Резервные копии' : 'Sauvegardes' },
                    ]}
                  />
                </div>
              )}
            </div>
          </div>

          {auditSubTab === 'activity' ? (
            filteredActivityLogs.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                {isRu
                  ? 'История действий пока пуста. Выполните экспорт, создайте бэкап или измените данные.'
                  : "Aucune action enregistrée pour l'instant. Lancez un export, une sauvegarde ou modifiez un véhicule."}
              </div>
            ) : (
              <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                <table data-testid="activity-log-table" className="w-full text-left text-xs">
                  <thead className="bg-[var(--ag-table-header-bg)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="px-3.5 py-2.5 font-bold">{isRu ? 'Дата / Время' : 'Horodatage'}</th>
                      <th className="px-3.5 py-2.5 font-bold">{isRu ? 'Пользователь' : 'Utilisateur'}</th>
                      <th className="px-3.5 py-2.5 font-bold">{isRu ? 'Действие' : 'Action'}</th>
                      <th className="px-3.5 py-2.5 font-bold">{isRu ? 'Объект / Детали' : 'Cible & Détails'}</th>
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
              {isRu
                ? 'Журнал изменений пока пуст. Изменения по автомобилям, документам и настройкам фиксируются автоматически.'
                : 'Aucune modification enregistrée. Les créations, mises à jour et suppressions sont tracées ici.'}
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Create Snapshot & Export JSON v2 */}
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    {t('backupCreateTitle')}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {isRu
                      ? 'Включает авто, ремонты, расходы, поставщиков, закупки, документы и настройки.'
                      : 'Inclut véhicules, réparations, frais, fournisseurs, achats, documents et paramètres.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                {[
                  { label: isRu ? 'Авто' : 'Véhicules', val: vehicles.length },
                  { label: isRu ? 'Ремонт' : 'Répar.', val: fleetData.repairs.length },
                  { label: isRu ? 'Расходы' : 'Frais', val: fleetData.expenses.length },
                  { label: isRu ? 'Поставщ.' : 'Fourniss.', val: suppliers.length },
                  { label: isRu ? 'Закупки' : 'Achats', val: purchases.length },
                  { label: isRu ? 'Док-ты' : 'Docs', val: documents.length },
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
                  {isRu ? 'Название точки восстановления' : 'Libellé du point de restauration'}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    data-testid="backup-snapshot-label-input"
                    value={snapshotLabel}
                    onChange={(e) => setSnapshotLabel(e.target.value)}
                    placeholder={
                      isRu ? 'Например: Перед инвентаризацией' : 'Ex: Avant clôture mensuelle'
                    }
                    className="flex-1 px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="submit"
                    data-testid="backup-create-snapshot-btn"
                    disabled={isCreatingSnapshot}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-60 transition shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isRu ? 'Сохранить точку' : 'Créer un snapshot'}</span>
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
                    {isRu
                      ? 'Скачать полный бэкап (JSON v2)'
                      : 'Télécharger la sauvegarde complète (JSON v2)'}
                  </span>
                </button>
              </div>
            </div>

            {/* Saved Restore Points */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 space-y-3">
              <h4 className="text-sm font-bold text-[var(--foreground)]">
                {isRu ? 'Сохранённые точки восстановления' : 'Points de restauration enregistrés'} (
                {backupSnapshots.length})
              </h4>

              {backupSnapshots.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  {isRu
                    ? 'Нет сохранённых точек восстановления.'
                    : 'Aucun point de restauration enregistré pour le moment.'}
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
                            {snap.counts.vehicles} {isRu ? 'авто' : 'véh.'}, {snap.counts.suppliers}{' '}
                            {isRu ? 'пост.' : 'fourn.'}, {snap.counts.documents}{' '}
                            {isRu ? 'док.' : 'docs'}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectSnapshotForRestore(snap)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 hover:opacity-90 transition"
                          >
                            {isRu ? 'Восстановить' : 'Restaurer'}
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
                              aria-label={isRu ? 'Удалить снимок' : 'Supprimer'}
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
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ArchiveRestore className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    {t('backupRestoreTitle')}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {isRu
                      ? 'Поддерживаются резервные копии v1 и v2. Предпросмотр состава данных перед применением.'
                      : 'Compatible avec les sauvegardes JSON v1 et v2 avec prévisualisation avant application.'}
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
                className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-muted)]/60 hover:border-[var(--primary)] transition flex flex-col items-center justify-center gap-2 text-center"
              >
                <Upload className="w-6 h-6 text-[var(--primary)]" />
                <span className="text-xs font-bold text-[var(--foreground)]">
                  {isRu
                    ? 'Выберите файл резервной копии (.json)'
                    : 'Sélectionner un fichier de sauvegarde (.json)'}
                </span>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {isRu
                    ? 'Данные будут проверены перед восстановлением'
                    : 'Le contenu sera vérifié et prévisualisé avant restauration'}
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
                        {isRu ? 'Предпросмотр восстановления :' : 'Aperçu avant restauration :'}{' '}
                        {pendingRestore.sourceName}
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                        {isRu ? 'Экспортировано:' : 'Exporté le :'}
                        {' '}
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
                            {isRu ? 'Авто' : 'Véhicules'}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                          <div className="text-sm font-extrabold tabular-nums">
                            {counts.repairs + counts.expenses}
                          </div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            {isRu ? 'Ремонт + Расходы' : 'Répar. + Frais'}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                          <div className="text-sm font-extrabold tabular-nums">
                            {counts.suppliers + counts.purchases + counts.documents}
                          </div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            {isRu ? 'Пост. + Док-ты' : 'Fourn. + Docs'}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-[var(--foreground)]">
                      {isRu ? 'Режим восстановления' : 'Mode de restauration'}
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
