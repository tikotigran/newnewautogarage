import React from 'react';
import {
  Car,
  Wrench,
  Smartphone,
  Monitor,
  Database,
  DollarSign,
  PlusCircle,
  LogIn,
  LogOut,
  Sparkles,
  ShieldAlert,
  Building2,
  Settings,
  ExternalLink,
  Sun,
  Moon,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';
import { FeatureFlagsConfig, GarageWorkspace, Vehicle } from '../types/garage';
import { DEFAULT_FEATURE_FLAGS } from '../utils/adminUtils';
import { computeHeaderAnalyticsMetrics } from '../utils/garageUtils';
import { User, signInWithPopup, googleProvider, auth, signOut, signInAnonymously } from '../services/firebase';
import { useI18n } from '../i18n/I18nContext';

interface NavbarProps {
  vehicles: Vehicle[];
  user: User | null;
  activeView: 'desktop' | 'analytics' | 'mobile' | 'admin';
  setActiveView: (view: 'desktop' | 'analytics' | 'mobile' | 'admin') => void;
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
}) => {
  const { lang, setLang, t } = useI18n();

  // Context-aware operational stock indicator: strictly active/in-stock vehicle breakdown
  // (all monetary totals and P&L margins are restricted to the dedicated Analytics page)
  const { inStock, prepOrRepairCount, forSaleCount } = computeHeaderAnalyticsMetrics(
    vehicles,
    activeGarageId
  );
  const totalVehiclesInScope = activeGarageId
    ? vehicles.filter((v) => (v.garageId ? v.garageId === activeGarageId : activeGarageId === 'garage_default')).length
    : vehicles.length;
  const activeGarage = activeGarageId ? garages.find((g) => g.id === activeGarageId) : null;

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.warn('Google sign-in popup skipped, falling back to local garage session:', err);
      try {
        await signInAnonymously(auth);
      } catch (anonErr) {
        console.error('Sign in error:', anonErr);
      }
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[var(--card)]/95 backdrop-blur-md border-b border-[var(--border)] text-[var(--foreground)] shadow-lg">
      {/* Compact Top Main Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
          {/* Logo & Identity */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('desktop')}
              className="flex items-center gap-2.5 text-left hover:opacity-90 transition-opacity focus:outline-none"
              title={t('appName')}
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shadow-md">
                <Car className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base sm:text-lg tracking-tight whitespace-nowrap text-[var(--foreground)]">
                  {t('appName')}
                </span>
                <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
                  {t('proDealer')}
                </span>
              </div>
            </button>

            {/* Persistent Multi-Garage Switcher */}
            {featureFlags.multiGarage && garages.length > 0 && onSelectGarage && (
              <div className="hidden sm:flex items-center gap-1.5 ml-1 pl-2.5 border-l border-slate-700/80">
                <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <select
                  aria-label={lang === 'ru' ? 'Переключить гараж' : 'Changer de garage'}
                  value={activeGarageId || ''}
                  onChange={(e) => onSelectGarage(e.target.value || null)}
                  className="bg-[var(--surface-muted)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-2 py-1 max-w-[180px] truncate focus:outline-none focus:border-[var(--primary)] transition cursor-pointer"
                >
                  <option value="">
                    {t('allGarages')}
                  </option>
                  {garages.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Right Controls: Unified Utility Toolbar + Primary Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Unified Utility Toolbar: Admin Dev Tools + Analytics + FR/RU + Theme */}
            <div className="hidden lg:flex items-center bg-slate-800/90 p-0.5 rounded-xl border border-slate-700/80">
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveView('desktop')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    activeView === 'desktop'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
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
                  onClick={() => setActiveView(activeView === 'analytics' ? 'desktop' : 'analytics')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    activeView === 'analytics'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title={t('analyticsNav')}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>{t('analyticsNav')}</span>
                </button>
              )}
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveView('mobile')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    activeView === 'mobile'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title={t('mobileView')}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Expo</span>
                </button>
              )}

              {(isSuperAdmin || featureFlags.expenseAnalytics) && (
                <span className="w-px h-4 bg-slate-700 mx-1" aria-hidden="true" />
              )}

              <button
                type="button"
                onClick={() => setLang('fr')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  lang === 'fr'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
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
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Переключить на русский язык"
              >
                RU
              </button>

              <span className="w-px h-4 bg-slate-700 mx-1" aria-hidden="true" />

              <button
                type="button"
                onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                className="p-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-slate-700/60 transition"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                )}
              </button>
            </div>

            {activeGarageId && totalVehiclesInScope === 0 && (
              <button
                type="button"
                onClick={onSeedData}
                disabled={isSeeding}
                className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 transition-colors"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold whitespace-nowrap bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition-all transform active:scale-95"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{t('newVehicle')}</span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setActiveView('admin')}
                aria-label="SuperAdmin"
                title="SuperAdmin Console"
                className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold border transition ${
                  activeView === 'admin'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
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
              className="p-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--secondary-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition"
            >
              <Settings className="w-4 h-4 text-[var(--primary)]" />
            </button>

            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              title={t('openNewTab')}
              aria-label={t('openNewTab')}
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            {user || activeSessionEmail ? (
              <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-700">
                <div
                  className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-amber-400 overflow-hidden"
                  title={user?.email || activeSessionEmail || 'Garage User'}
                >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    (user?.displayName?.[0] || user?.email?.[0] || activeSessionEmail?.[0] || 'G').toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
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
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('signIn')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Context-Aware Fleet Performance Metrics Ribbon */}
      <div
        data-testid="header-analytics-ribbon"
        className="bg-[var(--background)] border-t border-[var(--border)] px-4 sm:px-6 lg:px-8 py-1.5 text-xs"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-1 gap-x-4">
          <div className="flex items-center gap-5 flex-wrap">
            <span
              data-testid="header-analytics-scope"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-[11px] font-semibold text-[var(--primary)] whitespace-nowrap"
            >
              <Building2 className="w-3 h-3 shrink-0" />
              <span>
                {activeGarage ? activeGarage.name : t('allGarages')}
              </span>
            </span>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[var(--muted-foreground)]">
                {t('headerTotalInStock')}
              </span>
              <span className="font-bold text-[var(--foreground)] tabular-nums">{inStock}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[var(--muted-foreground)]">
                {t('headerPrepRepair')}
              </span>
              <span className="font-bold text-[var(--warning)] tabular-nums">{prepOrRepairCount}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[var(--muted-foreground)]">
                {t('headerForSale')}
              </span>
              <span className="font-bold text-[var(--success)] tabular-nums">{forSaleCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse"></span>
              {t('liveSync')}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
