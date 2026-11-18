import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  FileCheck2,
  FilePlus2,
  FileText,
  History,
  Search,
  Sparkles,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  DocumentBindingType,
  DocumentHistoryAction,
  DocumentHistoryEvent,
  GarageDocument,
  GarageDocumentCategory,
  Purchase,
  Vehicle,
} from '../types/garage';
import {
  computeMissingDocumentReminders,
  DOCUMENT_CATEGORIES,
  extractUniqueClients,
  formatVehicleSummaryLabel,
  getDocumentCategoryCounts,
  getDocumentCategoryLabel,
  MissingDocumentReminder,
  searchAndFilterDocuments,
} from '../utils/documents';
import { triggerDocumentDownload } from '../utils/documentFileHelpers';
import { deleteGarageDocument } from '../services/documentService';
import { getIntlLocale, pickLocalized } from '../utils/i18nUtils';
import { useI18n } from '../i18n/I18nContext';
import { ThemedSelect } from './ThemedSelect';
import { DocumentCard } from './DocumentCard';
import { DocumentUploadModal, DocumentUploadPreset } from './DocumentUploadModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';

interface DocumentsViewProps {
  vehicles: Vehicle[];
  purchases: Purchase[];
  documents: GarageDocument[];
  historyEvents: DocumentHistoryEvent[];
  userId: string;
  userEmail?: string | null;
  activeGarageId: string | null;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onSeedDocuments: () => Promise<void>;
  onOpenCerfaGenerator?: (vehicle?: Vehicle) => void;
}

type DocumentsTab = 'library' | 'missing' | 'history';

function getActionBadgeStyle(action: DocumentHistoryAction): string {
  switch (action) {
    case 'uploaded':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'downloaded':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'linked':
      return 'bg-violet-500/15 text-violet-400 border-violet-500/30';
    case 'updated':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'deleted':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    default:
      return 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]';
  }
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  vehicles,
  purchases,
  documents,
  historyEvents,
  userId,
  userEmail,
  activeGarageId,
  onSelectVehicle,
  onSeedDocuments,
  onOpenCerfaGenerator,
}) => {
  const { lang, t } = useI18n();

  const [activeTab, setActiveTab] = useState<DocumentsTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | GarageDocumentCategory>('all');
  const [bindingFilter, setBindingFilter] = useState<'all' | DocumentBindingType>('all');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [historyActionFilter, setHistoryActionFilter] = useState<'all' | DocumentHistoryAction>('all');
  const [isSeedingDocs, setIsSeedingDocs] = useState(false);

  // Upload / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<GarageDocument | null>(null);
  const [uploadPreset, setUploadPreset] = useState<DocumentUploadPreset | null>(null);

  // Preview Modal state
  const [previewDoc, setPreviewDoc] = useState<GarageDocument | null>(null);

  const uniqueClients = useMemo(
    () => extractUniqueClients(vehicles, documents),
    [vehicles, documents]
  );

  const missingReminders = useMemo(
    () => computeMissingDocumentReminders({ vehicles, documents, purchases }),
    [vehicles, documents, purchases]
  );

  const categoryCounts = useMemo(
    () => getDocumentCategoryCounts(documents),
    [documents]
  );

  const filteredDocuments = useMemo(
    () =>
      searchAndFilterDocuments({
        documents,
        query: searchQuery,
        category: categoryFilter,
        bindingType: bindingFilter,
        vehicleId: vehicleFilter,
        clientName: clientFilter,
      }),
    [documents, searchQuery, categoryFilter, bindingFilter, vehicleFilter, clientFilter]
  );

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return historyEvents.filter((ev) => {
      if (historyActionFilter !== 'all' && ev.action !== historyActionFilter) return false;
      if (!q) return true;
      const hay = [
        ev.documentTitle,
        ev.vehicleLabel || '',
        ev.clientName || '',
        ev.actorEmail || '',
        ev.details || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [historyEvents, historyActionFilter, searchQuery]);

  const kpiCoveredVehicles = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      if (d.vehicleId) set.add(d.vehicleId);
    }
    return set.size;
  }, [documents]);

  const openCreateModal = (preset?: DocumentUploadPreset) => {
    setEditingDoc(null);
    setUploadPreset(preset || null);
    setIsModalOpen(true);
  };

  const openEditModal = (doc: GarageDocument) => {
    setEditingDoc(doc);
    setUploadPreset(null);
    setIsModalOpen(true);
  };

  const handleDownloadDocument = async (doc: GarageDocument) => {
    await triggerDocumentDownload(doc, userEmail);
  };

  const handleSeedDemo = async () => {
    setIsSeedingDocs(true);
    try {
      await onSeedDocuments();
    } finally {
      setIsSeedingDocs(false);
    }
  };

  const handleUploadFromReminder = (reminder: MissingDocumentReminder) => {
    openCreateModal({
      category: reminder.category,
      vehicleId: reminder.vehicleId,
      clientName: reminder.clientName,
      bindingType: 'vehicle',
    });
  };

  const getHistoryActionLabel = (action: DocumentHistoryAction): string => {
    switch (action) {
      case 'uploaded':
        return t('docsActionUploaded');
      case 'updated':
        return t('docsActionUpdated');
      case 'downloaded':
        return t('docsActionDownloaded');
      case 'linked':
        return t('docsActionLinked');
      case 'deleted':
        return t('docsActionDeleted');
      default:
        return action;
    }
  };

  return (
    <div data-testid="documents-view" className="space-y-4 animate-fade-in">
      {/* Top Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[var(--ag-button-radius)] bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--foreground)]">
                {t('docsPageTitle')}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('docsPageSubtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {documents.length === 0 && (
            <button
              type="button"
              data-testid="seed-demo-docs-btn"
              onClick={handleSeedDemo}
              disabled={isSeedingDocs}
              className="inline-flex items-center gap-1.5 h-9 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] hover:opacity-90 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSeedingDocs ? t('loading') : t('seedDemoDocsBtn')}</span>
            </button>
          )}

          {onOpenCerfaGenerator && (
            <button
              type="button"
              data-testid="open-cerfa-generator-btn"
              onClick={() => onOpenCerfaGenerator(vehicles[0])}
              className="inline-flex items-center gap-1.5 h-9 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)]/50 transition cursor-pointer"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span>{t('cerfaGeneratorBtn')}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="new-document-btn"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>{t('newDocumentBtn')}</span>
          </button>
        </div>
      </div>

      {/* 4-Card KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>{t('docsKpiTotal')}</span>
            <FileText className="w-4 h-4 text-[var(--primary)]" />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-[var(--foreground)] tabular-nums">
            {documents.length}
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>{t('docsKpiLinkedVehicles')}</span>
            <Car className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-[var(--foreground)] tabular-nums">
            {kpiCoveredVehicles}
            <span className="text-sm font-semibold text-[var(--muted-foreground)]">
              {' '}
              / {vehicles.length}
            </span>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>{t('docsKpiLinkedClients')}</span>
            <User className="w-4 h-4 text-violet-400" />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-[var(--foreground)] tabular-nums">
            {uniqueClients.length}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('missing')}
          className={`text-left bg-[var(--card)] border rounded-[var(--ag-card-radius)] p-4 transition ${
            missingReminders.length > 0
              ? 'border-amber-500/40 hover:border-amber-500'
              : 'border-emerald-500/40 hover:border-emerald-500'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>{t('docsKpiMissing')}</span>
            {missingReminders.length > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div
            data-testid="missing-docs-kpi-count"
            className={`mt-1.5 text-2xl font-extrabold tabular-nums ${
              missingReminders.length > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {missingReminders.length}
          </div>
        </button>
      </div>

      {/* Missing Document Alert Strip (when on Library tab & reminders exist) */}
      {activeTab === 'library' && missingReminders.length > 0 && (
        <div
          data-testid="missing-docs-alert-banner"
          className="bg-amber-500/10 border border-amber-500/30 rounded-[var(--ag-card-radius)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[var(--foreground)]">
                {t('docsMissingBannerTitle')} ({missingReminders.length})
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                <span className="font-semibold text-[var(--foreground)]">
                  {missingReminders[0].vehicleLabel}
                </span>{' '}
                — {getDocumentCategoryLabel(missingReminders[0].category, lang)}:{' '}
                {pickLocalized(lang, {
                  fr: missingReminders[0].reasonFr,
                  ru: missingReminders[0].reasonRu,
                  hy: missingReminders[0].reasonHy,
                  ka: missingReminders[0].reasonKa,
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleUploadFromReminder(missingReminders[0])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-amber-500 text-slate-950 hover:opacity-90 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t('docsUploadNowBtn')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('missing')}
              className="px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)]/50 transition"
            >
              {pickLocalized(lang, {
                fr: `Tout voir (${missingReminders.length})`,
                ru: `Показать все (${missingReminders.length})`,
                hy: `Տեսնել բոլորը (${missingReminders.length})`,
                ka: `ყველას ნახვა (${missingReminders.length})`,
              })}
            </button>
          </div>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div
        data-testid="documents-tabs"
        className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3"
      >
        <button
          type="button"
          data-testid="tab-docs-library"
          onClick={() => setActiveTab('library')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
            activeTab === 'library'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm'
              : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('docsTabLibrary')}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/15 tabular-nums">
            {documents.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="tab-docs-missing"
          onClick={() => setActiveTab('missing')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
            activeTab === 'missing'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm'
              : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{t('docsTabMissing')}</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${
              missingReminders.length > 0 && activeTab !== 'missing'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-black/15'
            }`}
          >
            {missingReminders.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="tab-docs-history"
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
            activeTab === 'history'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm'
              : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>{t('docsTabHistory')}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/15 tabular-nums">
            {historyEvents.length}
          </span>
        </button>
      </div>

      {/* TAB 1: DOCUMENT LIBRARY */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {/* Search + Entity Binding Filters */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  data-testid="docs-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('docsSearchPlaceholder')}
                  className="w-full pl-9 pr-8 py-2 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <ThemedSelect
                testId="docs-binding-filter"
                ariaLabel={t('docsAllBindings')}
                value={bindingFilter}
                onChange={(v) => setBindingFilter(v as 'all' | DocumentBindingType)}
                options={[
                  { value: 'all', label: t('docsAllBindings') },
                  { value: 'vehicle', label: t('docsBindingVehicle') },
                  { value: 'client', label: t('docsBindingClient') },
                ]}
                triggerClassName="w-full bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-2"
              />

              <ThemedSelect
                testId="docs-vehicle-filter"
                ariaLabel={t('docsAllVehicles')}
                value={vehicleFilter}
                onChange={(v) => setVehicleFilter(v)}
                options={[
                  { value: '', label: t('docsAllVehicles') },
                  ...vehicles.map((v) => ({
                    value: v.id,
                    label: formatVehicleSummaryLabel(v),
                  })),
                ]}
                triggerClassName="w-full bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-2"
              />

              <ThemedSelect
                testId="docs-client-filter"
                ariaLabel={t('docsAllClients')}
                value={clientFilter}
                onChange={(v) => setClientFilter(v)}
                options={[
                  { value: '', label: t('docsAllClients') },
                  ...uniqueClients.map((c) => ({
                    value: c.name,
                    label: c.name,
                  })),
                ]}
                triggerClassName="w-full bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-2"
              />
            </div>

            {/* 10 Categories Horizontal Filter Grid */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                data-testid="cat-filter-all"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-[11px] font-bold border transition ${
                  categoryFilter === 'all'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                    : 'bg-[var(--surface-muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                }`}
              >
                {t('docsAllCategories')} ({categoryCounts.all || 0})
              </button>
              {DOCUMENT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  data-testid={`cat-filter-${cat.id}`}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-[11px] font-semibold border transition ${
                    categoryFilter === cat.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] font-bold'
                      : 'bg-[var(--surface-muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {getDocumentCategoryLabel(cat.id, lang)}{' '}
                  <span className="opacity-75 tabular-nums">({categoryCounts[cat.id] || 0})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Document Cards / Ledger */}
          {filteredDocuments.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-10 text-center space-y-3">
              <FileText className="w-10 h-10 text-[var(--muted-foreground)] mx-auto opacity-60" />
              <p className="text-sm font-semibold text-[var(--muted-foreground)]">
                {t('docsNoDocsFound')}
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>{t('newDocumentBtn')}</span>
                </button>
                {documents.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedDemo}
                    disabled={isSeedingDocs}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('seedDemoDocsBtn')}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              data-testid="documents-list"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {filteredDocuments.map((doc) => {
                const boundVeh = doc.vehicleId
                  ? vehicles.find((v) => v.id === doc.vehicleId)
                  : undefined;

                return (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    boundVehicle={boundVeh}
                    onSelectVehicle={onSelectVehicle}
                    onPreview={setPreviewDoc}
                    onDownload={handleDownloadDocument}
                    onEdit={openEditModal}
                    onDelete={async (target) => {
                      await deleteGarageDocument(target, userEmail || undefined);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MISSING DOCUMENT REMINDERS */}
      {activeTab === 'missing' && (
        <div data-testid="missing-documents-panel" className="space-y-3">
          {missingReminders.length === 0 ? (
            <div className="bg-[var(--card)] border border-emerald-500/30 rounded-[var(--ag-card-radius)] p-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-[var(--foreground)]">
                {t('docsNoMissingAlerts')}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {missingReminders.map((rem) => {
                const boundVeh = vehicles.find((v) => v.id === rem.vehicleId);
                return (
                  <div
                    key={rem.id}
                    data-testid={`missing-reminder-${rem.id}`}
                    className={`bg-[var(--card)] border rounded-[var(--ag-card-radius)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      rem.severity === 'high'
                        ? 'border-rose-500/40'
                        : 'border-amber-500/40'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <AlertTriangle
                        className={`w-5 h-5 shrink-0 mt-0.5 ${
                          rem.severity === 'high' ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      />
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {boundVeh ? (
                            <button
                              type="button"
                              onClick={() => onSelectVehicle(boundVeh)}
                              className="text-sm font-bold text-[var(--primary)] hover:underline"
                            >
                              {rem.vehicleLabel}
                            </button>
                          ) : (
                            <span className="text-sm font-bold text-[var(--foreground)]">
                              {rem.vehicleLabel}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]">
                            {getDocumentCategoryLabel(rem.category, lang)}
                          </span>
                          {rem.clientName && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                              <User className="w-3 h-3" />
                              {rem.clientName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {pickLocalized(lang, {
                            fr: rem.reasonFr,
                            ru: rem.reasonRu,
                            hy: rem.reasonHy,
                            ka: rem.reasonKa,
                          })}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`upload-reminder-${rem.id}`}
                      onClick={() => handleUploadFromReminder(rem)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 transition shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t('docsUploadNowBtn')}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DOCUMENT HISTORY */}
      {activeTab === 'history' && (
        <div data-testid="document-history-panel" className="space-y-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--primary)]" />
              <span>{t('docsHistoryTabTitle')}</span>
            </h3>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('docsSearchPlaceholder')}
                  className="pl-8 pr-3 py-1.5 rounded-[var(--ag-button-radius)] bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)]"
                />
              </div>
              <ThemedSelect
                testId="docs-history-action-filter"
                ariaLabel={t('docsHistoryFilterAll')}
                value={historyActionFilter}
                onChange={(v) => setHistoryActionFilter(v as 'all' | DocumentHistoryAction)}
                options={[
                  { value: 'all', label: t('docsHistoryFilterAll') },
                  { value: 'uploaded', label: t('docsActionUploaded') },
                  { value: 'downloaded', label: t('docsActionDownloaded') },
                  { value: 'linked', label: t('docsActionLinked') },
                  { value: 'updated', label: t('docsActionUpdated') },
                  { value: 'deleted', label: t('docsActionDeleted') },
                ]}
                triggerClassName="bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-3 py-1.5"
              />
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-10 text-center text-sm text-[var(--muted-foreground)]">
              {t('docsNoHistory')}
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/60 text-[var(--muted-foreground)] uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Date & Heure',
                        ru: 'Дата и время',
                        hy: 'Ամսաթիվ և ժամ',
                        ka: 'თარიღი და დრო',
                      })}
                    </th>
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Action',
                        ru: 'Действие',
                        hy: 'Գործողություն',
                        ka: 'ქმედება',
                      })}
                    </th>
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Document',
                        ru: 'Документ',
                        hy: 'Փաստաթուղթ',
                        ka: 'დოკუმენტი',
                      })}
                    </th>
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Liaison',
                        ru: 'Привязка',
                        hy: 'Կապակցում',
                        ka: 'ბმა',
                      })}
                    </th>
                    <th className="py-2.5 px-4">
                      {pickLocalized(lang, {
                        fr: 'Fichier / Utilisateur',
                        ru: 'Файл / Пользователь',
                        hy: 'Ֆայլ / Օգտատեր',
                        ka: 'ფაილი / მომხმარებელი',
                      })}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredHistory.map((ev) => (
                    <tr
                      key={ev.id}
                      data-testid={`history-row-${ev.id}`}
                      className="hover:bg-[var(--surface-muted)]/40 transition"
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap text-[var(--muted-foreground)] tabular-nums">
                        {new Date(ev.timestamp).toLocaleString(getIntlLocale(lang), {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadgeStyle(
                            ev.action
                          )}`}
                        >
                          {getHistoryActionLabel(ev.action)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-[var(--foreground)]">
                          {ev.documentTitle}
                        </div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">
                          {getDocumentCategoryLabel(ev.category, lang)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          {ev.vehicleLabel && (
                            <span className="inline-flex items-center gap-1 text-[var(--foreground)] font-medium">
                              <Car className="w-3 h-3 text-sky-400" />
                              {ev.vehicleLabel}
                            </span>
                          )}
                          {ev.clientName && (
                            <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)]">
                              <User className="w-3 h-3 text-violet-400" />
                              {ev.clientName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-[var(--muted-foreground)]">
                        {ev.details && <div className="truncate max-w-[200px]">{ev.details}</div>}
                        {ev.actorEmail && <div className="text-[10px] opacity-80">{ev.actorEmail}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* UPLOAD / EDIT DOCUMENT MODAL */}
      <DocumentUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingDoc={editingDoc}
        preset={uploadPreset}
        vehicles={vehicles}
        uniqueClients={uniqueClients}
        userId={userId}
        userEmail={userEmail}
        activeGarageId={activeGarageId}
      />

      {/* INLINE DOCUMENT PREVIEW MODAL */}
      <DocumentPreviewModal
        doc={previewDoc}
        historyEvents={historyEvents}
        onClose={() => setPreviewDoc(null)}
        onDownload={handleDownloadDocument}
      />
    </div>
  );
};
