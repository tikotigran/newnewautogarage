import React, { useEffect, useRef, useState } from 'react';
import {
  Car,
  Monitor,
  PlusCircle,
  LogIn,
  LogOut,
  Sparkles,
  Building2,
  Settings,
  ExternalLink,
  Sun,
  Moon,
  BarChart3,
  ShieldCheck,
  Menu,
  X,
  Handshake,
  FileText,
  DatabaseBackup,
} from 'lucide-react';
import { FeatureFlagsConfig, GarageWorkspace, LayoutMode, Vehicle } from '../types/garage';
import { DEFAULT_FEATURE_FLAGS } from '../utils/adminUtils';
import { computeHeaderAnalyticsMetrics } from '../utils/garageUtils';
import { User } from '../services/firebase';
import { useI18n } from '../i18n/I18nContext';
import { ThemedSelect } from './ThemedSelect';

interface NavbarProps {
  vehicles: Vehicle[];
  user: User | null;
  activeView: 'desktop' | 'analytics' | 'suppliers' | 'documents' | 'exports' | 'settings' | 'admin';
  setActiveView: (view: 'desktop' | 'analytics' | 'suppliers' | 'documents' | 'exports' | 'settings' | 'admin') => void;
  onNewVehicle: () => void;
  onSeedData: () => void;
  isSeeding: boolean;
  onOpenSettings: () => void;
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  isSuperAdmin?: boolean;
  onOpenAuthModal: () => void;
  onSignOut: () => void;
  activeSessionEmail?: string | null;
  garages?: GarageWorkspace[];
  activeGarageId?: string | null;
  onSelectGarage?: (garageId: string | null) => void;
  featureFlags?: FeatureFlagsConfig;
  layoutMode?: LayoutMode;
  onOpenMobileSidebar?: () => void;
  selectedVehicleLabel?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  vehicles,
  user,
  activeView,
  setActiveView,
  onNewVehicle,
  onSeedData,
  isSeeding,
  onOpenSettings,
  theme,
  onThemeChange,
  isSuperAdmin = false,
  onOpenAuthModal,
  onSignOut,
  activeSessionEmail,
  garages = [],
  activeGarageId = null,
  onSelectGarage,
  featureFlags = DEFAULT_FEATURE_FLAGS,
  layoutMode = 'classic',
  onOpenMobileSidebar,
  selectedVehicleLabel = null,
}) => {
  const { lang, setLang, t, getTextStyle } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        drawerRef.current?.contains(target) ||
        menuBtnRef.current?.contains(target)
      ) {
        return;
      }
      setMobileMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  // Context-aware operational stock indicator: strictly active/in-stock vehicle breakdown
  // (all monetary totals and P&L margins are restricted to the dedicated Analytics page)
  const { inStock, prepOrRepairCount, forSaleCount } = computeHeaderAnalyticsMetrics(
    vehicles,
    activeGarageId
  );
  const totalVehiclesInScope = activeGarageId
    ? vehicles.filter((v) =>
        v.garageId ? v.garageId === activeGarageId : activeGarageId === 'garage_default'
      ).length
    : vehicles.length;
  const activeGarage = activeGarageId ? garages.find((g) => g.id === activeGarageId) : null;

  const hasSecondaryViews = true;
  const isRu = lang === 'ru';

  const navigateView = (view: 'desktop' | 'analytics' | 'suppliers' | 'documents' | 'exports' | 'settings' | 'admin') => {
    setActiveView(view);
    setMobileMenuOpen(false);
  };

  if (layoutMode === 'sidebar') {
    const contextTitle =
      activeView === 'admin'
        ? t('navSuperAdmin')
        : activeView === 'analytics'
        ? t('navAnalyticsPnl')
        : activeView === 'suppliers'
        ? t('navSuppliers')
        : activeView === 'documents'
        ? t('navDocuments')
        : activeView === 'exports'
        ? t('navExportsBackup')
        : activeView === 'settings'
        ? t('navGarageSettings')
        : selectedVehicleLabel || t('navInventory');

    return (
      <header
        data-testid="sidebar-top-header"
        className="sticky top-0 z-20 bg-[var(--ag-header-bg)] border-b border-[var(--ag-header-border)] text-[var(--ag-header-text)] shadow-sm"
      >
        <div className="px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-2 sm:gap-3">
            {/* Left: Mobile Sidebar Trigger + Context Breadcrumb */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                type="button"
                data-testid="sidebar-mobile-trigger"
                onClick={() => onOpenMobileSidebar?.()}
                aria-label={isRu ? 'Открыть меню навигации' : 'Ouvrir le menu de navigation'}
                className="lg:hidden inline-flex items-center justify-center p-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:opacity-90 transition shrink-0"
              >
                <Menu className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 min-w-0">
                {activeGarage && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] text-[11px] font-semibold text-[var(--primary)] whitespace-nowrap shrink-0 max-w-[160px] truncate">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{activeGarage.name}</span>
                  </span>
                )}
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-[var(--ag-header-text)] truncate">
                  {contextTitle}
                </h1>
                <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--background)] border border-[var(--border)] text-[11px] font-semibold text-[var(--muted-foreground)] whitespace-nowrap shrink-0 tabular-nums">
                  <span>{inStock}</span>
                  <span className="text-[var(--ag-profit-color)]">
                    · {forSaleCount} {isRu ? 'в продаже' : 'en vente'}
                  </span>
                </span>
              </div>
            </div>

            {/* Right: Primary CTA + Always-Visible Compact Utilities */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {activeGarageId && totalVehiclesInScope === 0 && (
                <button
                  type="button"
                  onClick={onSeedData}
                  disabled={isSeeding}
                  className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-medium whitespace-nowrap bg-[var(--surface-muted)] hover:opacity-90 text-[var(--primary)] border border-[var(--border)] transition-colors"
                  title="Charger un parc exemple"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isSeeding ? t('loading') : t('demoFleet')}</span>
                </button>
              )}

              {activeGarageId && (
                <button
                  type="button"
                  data-testid="sidebar-header-new-vehicle"
                  onClick={onNewVehicle}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold whitespace-nowrap bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition-all transform active:scale-95"
                  title={t('newVehicle')}
                >
                  <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                  <span style={getTextStyle('newVehicle')} className="hidden sm:inline">
                    {t('newVehicle')}
                  </span>
                </button>
              )}

              {/* Always-Visible Compact Language + Theme Controls */}
              <div
                data-testid="sidebar-header-utilities"
                className="flex items-center bg-[var(--surface-muted)] p-0.5 rounded-xl border border-[var(--ag-header-border)] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setLang('fr')}
                  className={`px-1.5 sm:px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all ${
                    lang === 'fr'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--ag-header-text)]'
                  }`}
                  title="Passer en Français"
                >
                  FR
                </button>
                <button
                  type="button"
                  onClick={() => setLang('ru')}
                  className={`px-1.5 sm:px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all ${
                    lang === 'ru'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--ag-header-text)]'
                  }`}
                  title="Переключить на русский язык"
                >
                  RU
                </button>
                <span className="w-px h-4 bg-[var(--ag-header-border)] mx-0.5" aria-hidden="true" />
                <button
                  type="button"
                  data-testid="sidebar-header-theme-toggle"
                  onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                  aria-label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  className="p-1.5 rounded-lg text-[var(--ag-header-text)] hover:bg-[var(--background)]/50 transition"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-blue-500" />
                  )}
                </button>
              </div>

              {/* Always-Visible Compact Profile / Auth Control */}
              {user || activeSessionEmail ? (
                <div className="flex items-center gap-1 sm:gap-1.5 pl-1 border-l border-[var(--ag-header-border)] shrink-0">
                  <div
                    className="w-7 h-7 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--primary)] overflow-hidden shrink-0"
                    title={user?.email || activeSessionEmail || 'Garage User'}
                  >
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      (
                        user?.displayName?.[0] ||
                        user?.email?.[0] ||
                        activeSessionEmail?.[0] ||
                        'G'
                      ).toUpperCase()
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid="sidebar-header-signout"
                    onClick={onSignOut}
                    className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--surface-muted)] transition"
                    title={t('signOut')}
                    aria-label={t('signOut')}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="sidebar-header-signin"
                  onClick={onOpenAuthModal}
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-medium whitespace-nowrap bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] transition shrink-0"
                  title={t('signIn')}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('signIn')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      data-testid="main-navbar"
      className="sticky top-0 z-40 bg-[var(--ag-header-bg)] border-b border-[var(--ag-header-border)] text-[var(--ag-header-text)] shadow-lg"
    >
      {/* Compact Top Main Navigation */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative">
        <div className="flex items-center justify-between h-14 gap-2 sm:gap-3">
          {/* Logo & Identity */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigateView('desktop')}
              className="flex items-center gap-2 sm:gap-2.5 text-left hover:opacity-90 transition-opacity focus:outline-none min-w-0"
              title={t('appName')}
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shadow-md shrink-0">
                <Car className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  style={getTextStyle('appName')}
                  className="font-extrabold text-sm sm:text-lg tracking-tight whitespace-nowrap truncate text-[var(--ag-header-text)]"
                >
                  {t('appName')}
                </span>
                <span
                  style={getTextStyle('proDealer')}
                  className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 shrink-0"
                >
                  {t('proDealer')}
                </span>
              </div>
            </button>

            {/* Persistent Multi-Garage Switcher */}
            {featureFlags.multiGarage && garages.length > 0 && onSelectGarage && (
              <div className="hidden sm:flex items-center gap-1.5 ml-1 pl-2.5 border-l border-[var(--ag-header-border)] shrink-0">
                <Building2 className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                <ThemedSelect
                  testId="navbar-garage-select"
                  ariaLabel={lang === 'ru' ? 'Переключить гараж' : 'Changer de garage'}
                  value={activeGarageId || ''}
                  onChange={(val) => onSelectGarage(val || null)}
                  options={[
                    { value: '', label: t('allGarages') },
                    ...garages.map((g) => ({ value: g.id, label: g.name })),
                  ]}
                  triggerClassName="bg-[var(--surface-muted)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-2 py-1 max-w-[160px] lg:max-w-[180px]"
                />
              </div>
            )}
          </div>

          {/* Right Controls: Desktop Utility Toolbar + Compact Responsive Controls + Primary Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Full Desktop Unified Utility Toolbar (>= xl / 1280px) */}
            <div className="hidden xl:flex items-center bg-[var(--surface-muted)] p-0.5 rounded-xl border border-[var(--ag-header-border)]">
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => navigateView('desktop')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    activeView === 'desktop'
                      ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                      : 'text-[var(--ag-header-text)]/75 hover:text-[var(--ag-header-text)]'
                  }`}
                  title={t('studioView')}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{lang === 'ru' ? 'ПК' : 'PC'}</span>
                </button>
              )}
              {featureFlags.expenseAnalytics && (
                <button
                  type="button"
                  data-testid="nav-analytics-btn"
                  onClick={() =>
                    navigateView(activeView === 'analytics' ? 'desktop' : 'analytics')
                  }
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    activeView === 'analytics'
                      ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                      : 'text-[var(--ag-header-text)]/75 hover:text-[var(--ag-header-text)]'
                  }`}
                  title={t('analyticsNav')}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span style={activeView === 'analytics' ? undefined : getTextStyle('analyticsNav')}>
                    {t('analyticsNav')}
                  </span>
                </button>
              )}

              <button
                type="button"
                data-testid="nav-suppliers-btn"
                onClick={() =>
                  navigateView(activeView === 'suppliers' ? 'desktop' : 'suppliers')
                }
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                  activeView === 'suppliers'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                    : 'text-[var(--ag-header-text)]/75 hover:text-[var(--ag-header-text)]'
                }`}
                title={t('navSuppliers')}
              >
                <Handshake className="w-3.5 h-3.5" />
                <span>{t('navSuppliersShort')}</span>
              </button>

              <button
                type="button"
                data-testid="nav-documents-btn"
                onClick={() =>
                  navigateView(activeView === 'documents' ? 'desktop' : 'documents')
                }
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                  activeView === 'documents'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                    : 'text-[var(--ag-header-text)]/75 hover:text-[var(--ag-header-text)]'
                }`}
                title={t('navDocuments')}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('navDocuments')}</span>
              </button>

              <button
                type="button"
                data-testid="nav-exports-btn"
                onClick={() =>
                  navigateView(activeView === 'exports' ? 'desktop' : 'exports')
                }
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                  activeView === 'exports'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                    : 'text-[var(--ag-header-text)]/75 hover:text-[var(--ag-header-text)]'
                }`}
                title={t('navExportsBackup')}
              >
                <DatabaseBackup className="w-3.5 h-3.5" />
                <span>{t('navExportsShort')}</span>
              </button>

              {hasSecondaryViews && (
                <span className="w-px h-4 bg-[var(--ag-header-border)] mx-1" aria-hidden="true" />
              )}

              <button
                type="button"
                onClick={() => setLang('fr')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  lang === 'fr'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--ag-header-text)]'
                }`}
                title="Passer en Français"
              >
                FR
              </button>
              <button
                type="button"
                onClick={() => setLang('ru')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  lang === 'ru'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--ag-header-text)]'
                }`}
                title="Переключить на русский язык"
              >
                RU
              </button>

              <span className="w-px h-4 bg-[var(--ag-header-border)] mx-1" aria-hidden="true" />

              <button
                type="button"
                onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                className="p-1.5 rounded-lg text-[var(--ag-header-text)] hover:bg-[var(--background)]/50 transition"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-blue-500" />
                )}
              </button>
            </div>

            {/* Compact Language & Theme Quick Switcher for Tablet / Small Desktop (< xl, >= sm) */}
            <div className="hidden sm:flex xl:hidden items-center bg-[var(--surface-muted)] p-0.5 rounded-xl border border-[var(--ag-header-border)]">
              <button
                type="button"
                onClick={() => setLang('fr')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  lang === 'fr'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--ag-header-text)]'
                }`}
                title="Passer en Français"
              >
                FR
              </button>
              <button
                type="button"
                onClick={() => setLang('ru')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  lang === 'ru'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--ag-header-text)]'
                }`}
                title="Переключить на русский язык"
              >
                RU
              </button>
              <span className="w-px h-4 bg-[var(--ag-header-border)] mx-0.5" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                className="p-1.5 rounded-lg text-[var(--ag-header-text)] hover:bg-[var(--background)]/50 transition"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-blue-500" />
                )}
              </button>
            </div>

            {activeGarageId && totalVehiclesInScope === 0 && (
              <button
                type="button"
                onClick={onSeedData}
                disabled={isSeeding}
                className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap bg-[var(--surface-muted)] hover:opacity-90 text-[var(--primary)] border border-[var(--border)] transition-colors"
                title="Charger un parc exemple"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isSeeding ? t('loading') : t('demoFleet')}</span>
              </button>
            )}

            {activeGarageId && (
              <button
                type="button"
                onClick={onNewVehicle}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold whitespace-nowrap bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition-all transform active:scale-95"
                title={t('newVehicle')}
              >
                <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                <span style={getTextStyle('newVehicle')} className="hidden sm:inline">
                  {t('newVehicle')}
                </span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => navigateView('admin')}
                aria-label="SuperAdmin"
                title="SuperAdmin Console"
                className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
                  activeView === 'admin'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                    : 'bg-[var(--surface-muted)] text-[var(--primary)] border-[var(--border)]'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden xl:inline">Admin</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={t('settingsLabel')}
              title={t('settingsLabel')}
              className="hidden sm:inline-flex p-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--secondary-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition"
            >
              <Settings className="w-4 h-4 text-[var(--primary)]" />
            </button>

            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden xl:inline-flex p-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--secondary-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition"
              title={t('openNewTab')}
              aria-label={t('openNewTab')}
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Desktop Auth / Profile Controls (>= md) */}
            {user || activeSessionEmail ? (
              <div className="hidden md:flex items-center gap-1.5 pl-1.5 border-l border-[var(--ag-header-border)]">
                <div
                  className="w-7 h-7 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--primary)] overflow-hidden"
                  title={user?.email || activeSessionEmail || 'Garage User'}
                >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    (
                      user?.displayName?.[0] ||
                      user?.email?.[0] ||
                      activeSessionEmail?.[0] ||
                      'G'
                    ).toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--surface-muted)] transition"
                  title={t('signOut')}
                  aria-label={t('signOut')}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-medium whitespace-nowrap bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)] transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t('signIn')}</span>
              </button>
            )}

            {/* Mobile & Tablet Hamburger Menu Toggle (< xl / 1280px) */}
            <button
              ref={menuBtnRef}
              type="button"
              data-testid="mobile-menu-toggle"
              aria-expanded={mobileMenuOpen}
              aria-label={lang === 'ru' ? 'Меню навигации' : 'Menu de navigation'}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className={`xl:hidden inline-flex items-center justify-center p-2 rounded-[var(--ag-button-radius)] border transition ${
                mobileMenuOpen
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                  : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]'
              }`}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile & Tablet Slide-Down Drawer (< xl) */}
        {mobileMenuOpen && (
          <div
            ref={drawerRef}
            data-testid="mobile-nav-drawer"
            className="xl:hidden absolute right-3 sm:right-6 top-[calc(100%+6px)] w-[calc(100vw-24px)] max-w-sm bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl shadow-2xl p-3.5 space-y-3 z-50"
          >
            {/* Multi-Garage Selector for Mobile */}
            {featureFlags.multiGarage && garages.length > 0 && onSelectGarage && (
              <div className="sm:hidden space-y-1">
                <label className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                  {lang === 'ru' ? 'Рабочий гараж' : 'Garage actif'}
                </label>
                <ThemedSelect
                  testId="mobile-drawer-garage-select"
                  ariaLabel={lang === 'ru' ? 'Переключить гараж' : 'Changer de garage'}
                  value={activeGarageId || ''}
                  onChange={(val) => {
                    onSelectGarage(val || null);
                    setMobileMenuOpen(false);
                  }}
                  options={[
                    { value: '', label: t('allGarages') },
                    ...garages.map((g) => ({ value: g.id, label: g.name })),
                  ]}
                  triggerClassName="w-full bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-xl px-3 py-2"
                />
              </div>
            )}

            {/* Navigation Modes */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                {lang === 'ru' ? 'Разделы' : 'Navigation'}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => navigateView('desktop')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                    activeView === 'desktop'
                      ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                      : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {lang === 'ru' ? 'Склад / ПК' : 'Stock / PC'}
                  </span>
                </button>

                {featureFlags.expenseAnalytics && (
                  <button
                    type="button"
                    onClick={() =>
                      navigateView(activeView === 'analytics' ? 'desktop' : 'analytics')
                    }
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                      activeView === 'analytics'
                        ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                        : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t('analyticsNav')}</span>
                  </button>
                )}

                <button
                  type="button"
                  data-testid="mobile-drawer-suppliers-btn"
                  onClick={() =>
                    navigateView(activeView === 'suppliers' ? 'desktop' : 'suppliers')
                  }
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                    activeView === 'suppliers'
                      ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                      : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]'
                  }`}
                >
                  <Handshake className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t('navSuppliersShort')}</span>
                </button>

                <button
                  type="button"
                  data-testid="mobile-drawer-documents-btn"
                  onClick={() =>
                    navigateView(activeView === 'documents' ? 'desktop' : 'documents')
                  }
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                    activeView === 'documents'
                      ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                      : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t('navDocuments')}</span>
                </button>

                <button
                  type="button"
                  data-testid="mobile-drawer-exports-btn"
                  onClick={() =>
                    navigateView(activeView === 'exports' ? 'desktop' : 'exports')
                  }
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                    activeView === 'exports'
                      ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                      : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]'
                  }`}
                >
                  <DatabaseBackup className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t('navExportsShort')}</span>
                </button>

                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => navigateView('admin')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                      activeView === 'admin'
                        ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] border-[var(--ag-nav-active-bg)]'
                        : 'bg-[var(--surface-muted)] text-[var(--primary)] border-[var(--border)]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>SuperAdmin</span>
                  </button>
                )}
              </div>
            </div>

            {/* Language & Theme Controls */}
            <div className="pt-2 border-t border-[var(--border)] grid grid-cols-2 gap-2">
              <div className="flex items-center bg-[var(--background)] p-1 rounded-xl border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setLang('fr')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                    lang === 'fr'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  FR
                </button>
                <button
                  type="button"
                  onClick={() => setLang('ru')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                    lang === 'ru'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  RU
                </button>
              </div>

              <button
                type="button"
                data-testid="mobile-drawer-theme-toggle"
                onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] transition"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-blue-500" />
                    <span>Dark</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Utilities: Demo Fleet, Settings, New Tab */}
            <div className="pt-2 border-t border-[var(--border)] space-y-1.5">
              {activeGarageId && totalVehiclesInScope === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onSeedData();
                    setMobileMenuOpen(false);
                  }}
                  disabled={isSeeding}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)]"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isSeeding ? t('loading') : t('demoFleet')}</span>
                </button>
              )}

              <button
                type="button"
                data-testid="mobile-drawer-settings-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]"
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>{t('settingsLabel')}</span>
                </span>
              </button>

              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-muted)] text-[var(--secondary-foreground)] border border-[var(--border)]"
              >
                <span className="flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{t('openNewTab')}</span>
                </span>
              </a>
            </div>

            {/* Profile & Session */}
            <div className="pt-2 border-t border-[var(--border)]">
              {user || activeSessionEmail ? (
                <div className="flex items-center justify-between gap-2 bg-[var(--background)] px-3 py-2 rounded-xl border border-[var(--border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--primary)] shrink-0 overflow-hidden">
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        (
                          user?.displayName?.[0] ||
                          user?.email?.[0] ||
                          activeSessionEmail?.[0] ||
                          'G'
                        ).toUpperCase()
                      )}
                    </div>
                    <span className="text-xs font-medium text-[var(--foreground)] truncate">
                      {user?.email || activeSessionEmail || 'Garage User'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSignOut();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t('signOut')}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuthModal();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t('signIn')}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Compact Secondary Navigation Bar on Tablet & Mobile (< xl) */}
      {hasSecondaryViews && (
        <div
          data-testid="mobile-subnav-bar"
          className="xl:hidden border-t border-[var(--ag-header-border)] bg-[var(--ag-header-bg)]/95 px-3 sm:px-6"
        >
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 py-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => navigateView('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                activeView === 'desktop'
                  ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                  : 'bg-[var(--surface-muted)] text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)]'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Склад / ПК' : 'Stock / PC'}</span>
            </button>

            {featureFlags.expenseAnalytics && (
              <button
                type="button"
                onClick={() =>
                  navigateView(activeView === 'analytics' ? 'desktop' : 'analytics')
                }
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                  activeView === 'analytics'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                    : 'bg-[var(--surface-muted)] text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)]'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{t('analyticsNav')}</span>
              </button>
            )}

            <button
              type="button"
              data-testid="mobile-subnav-suppliers-btn"
              onClick={() =>
                navigateView(activeView === 'suppliers' ? 'desktop' : 'suppliers')
              }
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                activeView === 'suppliers'
                  ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                  : 'bg-[var(--surface-muted)] text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)]'
              }`}
            >
              <Handshake className="w-3.5 h-3.5" />
              <span>{t('navSuppliersShort')}</span>
            </button>

            <button
              type="button"
              data-testid="mobile-subnav-documents-btn"
              onClick={() =>
                navigateView(activeView === 'documents' ? 'desktop' : 'documents')
              }
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                activeView === 'documents'
                  ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                  : 'bg-[var(--surface-muted)] text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t('navDocuments')}</span>
            </button>

            <button
              type="button"
              data-testid="mobile-subnav-exports-btn"
              onClick={() =>
                navigateView(activeView === 'exports' ? 'desktop' : 'exports')
              }
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                activeView === 'exports'
                  ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                  : 'bg-[var(--surface-muted)] text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)]'
              }`}
            >
              <DatabaseBackup className="w-3.5 h-3.5" />
              <span>{t('navExportsShort')}</span>
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => navigateView('admin')}
                className={`md:hidden flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                  activeView === 'admin'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                    : 'bg-[var(--surface-muted)] text-[var(--primary)]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Context-Aware Fleet Performance Metrics Ribbon */}
      <div
        data-testid="header-analytics-ribbon"
        className="bg-[var(--background)] border-t border-[var(--ag-header-border)] px-3 sm:px-6 lg:px-8 py-1.5 text-xs"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-1 gap-x-4">
          <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
            <span
              data-testid="header-analytics-scope"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-[11px] font-semibold text-[var(--primary)] whitespace-nowrap"
            >
              <Building2 className="w-3 h-3 shrink-0" />
              <span>{activeGarage ? activeGarage.name : t('allGarages')}</span>
            </span>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span style={getTextStyle('headerTotalInStock')} className="text-[var(--muted-foreground)]">
                {t('headerTotalInStock')}
              </span>
              <span className="font-bold text-[var(--foreground)] tabular-nums">{inStock}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <span style={getTextStyle('headerPrepRepair')} className="text-[var(--muted-foreground)]">
                {t('headerPrepRepair')}
              </span>
              <span className="font-bold text-[var(--warning)] tabular-nums">
                {prepOrRepairCount}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <span style={getTextStyle('headerForSale')} className="text-[var(--muted-foreground)]">
                {t('headerForSale')}
              </span>
              <span className="font-bold text-[var(--ag-profit-color)] tabular-nums">
                {forSaleCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--ag-profit-color)] animate-pulse"></span>
              {t('liveSync')}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
