import React, { useEffect } from 'react';
import {
  Car,
  BarChart3,
  FileText,
  Settings,
  ShieldCheck,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  X,
  Handshake,
  DatabaseBackup,
} from 'lucide-react';
import { FeatureFlagsConfig, GarageWorkspace } from '../types/garage';
import { DEFAULT_FEATURE_FLAGS } from '../utils/adminUtils';
import { useI18n } from '../i18n/I18nContext';
import { ThemedSelect } from './ThemedSelect';

export type SidebarNavTarget =
  | 'inventory'
  | 'analytics'
  | 'suppliers'
  | 'documents'
  | 'exports'
  | 'settings'
  | 'admin';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeView: 'desktop' | 'analytics' | 'suppliers' | 'documents' | 'exports' | 'settings' | 'admin';
  onNavigate: (target: SidebarNavTarget) => void;
  garages?: GarageWorkspace[];
  activeGarageId?: string | null;
  onSelectGarage?: (garageId: string | null) => void;
  featureFlags?: FeatureFlagsConfig;
  isSuperAdmin?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  activeView,
  onNavigate,
  garages = [],
  activeGarageId = null,
  onSelectGarage,
  featureFlags = DEFAULT_FEATURE_FLAGS,
  isSuperAdmin = false,
}) => {
  const { lang, t, getTextStyle } = useI18n();
  const isRu = lang === 'ru';

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const activeGarage = activeGarageId
    ? garages.find((g) => g.id === activeGarageId) || null
    : null;

  const navItems: {
    id: SidebarNavTarget;
    label: string;
    icon: React.ReactNode;
    active: boolean;
    visible: boolean;
    accentAdmin?: boolean;
  }[] = [
    {
      id: 'inventory',
      label: t('navInventory'),
      icon: <Car className="w-4 h-4 shrink-0" />,
      active: activeView === 'desktop',
      visible: true,
    },
    {
      id: 'analytics',
      label: t('navAnalyticsPnl'),
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      active: activeView === 'analytics',
      visible: featureFlags.expenseAnalytics,
    },
    {
      id: 'suppliers',
      label: t('navSuppliers'),
      icon: <Handshake className="w-4 h-4 shrink-0" />,
      active: activeView === 'suppliers',
      visible: true,
    },
    {
      id: 'documents',
      label: t('navDocuments'),
      icon: <FileText className="w-4 h-4 shrink-0" />,
      active: activeView === 'documents',
      visible: true,
    },
    {
      id: 'exports',
      label: t('navExportsBackup'),
      icon: <DatabaseBackup className="w-4 h-4 shrink-0" />,
      active: activeView === 'exports',
      visible: true,
    },
    {
      id: 'settings',
      label: t('navGarageSettings'),
      icon: <Settings className="w-4 h-4 shrink-0" />,
      active: activeView === 'settings',
      visible: true,
    },
    {
      id: 'admin',
      label: t('navSuperAdmin'),
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
      active: activeView === 'admin',
      visible: isSuperAdmin,
      accentAdmin: true,
    },
  ];

  const handleItemClick = (target: SidebarNavTarget, isMobileDrawer: boolean) => {
    onNavigate(target);
    if (isMobileDrawer) {
      onCloseMobile();
    }
  };

  const renderSidebarBody = (collapsed: boolean, isMobileDrawer: boolean) => (
    <div className="flex flex-col h-full">
      {/* Top Header inside Sidebar */}
      <div
        className={`flex items-center h-14 px-3 border-b border-[var(--ag-header-border)] shrink-0 ${
          collapsed ? 'justify-center' : 'justify-between gap-2'
        }`}
      >
        {!collapsed && (
          <button
            type="button"
            onClick={() => handleItemClick('inventory', isMobileDrawer)}
            className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-90 transition-opacity focus:outline-none"
            title={t('appName')}
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shadow-md shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span
                style={getTextStyle('appName')}
                className="block font-extrabold text-sm tracking-tight truncate text-[var(--ag-header-text)]"
              >
                {t('appName')}
              </span>
              <span
                style={getTextStyle('proDealer')}
                className="inline-block text-[9px] font-bold uppercase tracking-wider text-[var(--primary)]"
              >
                {t('proDealer')}
              </span>
            </div>
          </button>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-9 h-9 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shadow-md hover:opacity-90 transition"
            title={isRu ? 'Развернуть меню' : 'Déplier le menu'}
            aria-label={isRu ? 'Развернуть меню' : 'Déplier le menu'}
          >
            <Car className="w-4 h-4" />
          </button>
        )}

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={onCloseMobile}
            data-testid="sidebar-mobile-close"
            aria-label={isRu ? 'Закрыть меню' : 'Fermer le menu'}
            className="p-1.5 rounded-lg bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:opacity-90 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          !collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              data-testid="sidebar-collapse-toggle"
              aria-label={isRu ? 'Свернуть боковую панель' : 'Réduire la barre latérale'}
              title={isRu ? 'Свернуть панель («)' : 'Réduire («)'}
              className="p-1.5 rounded-lg bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:opacity-90 transition shrink-0"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          )
        )}
      </div>

      {/* Collapsed Expand Strip */}
      {collapsed && !isMobileDrawer && (
        <div className="px-2 pt-2.5 flex justify-center">
          <button
            type="button"
            onClick={onToggleCollapse}
            data-testid="sidebar-collapse-toggle"
            aria-label={isRu ? 'Развернуть боковую панель' : 'Déplier la barre latérale'}
            title={isRu ? 'Развернуть панель (»)' : 'Déplier (»)'}
            className="w-full flex items-center justify-center py-1.5 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:opacity-90 transition"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tenant / Garage Switcher Card */}
      {featureFlags.multiGarage && garages.length > 0 && onSelectGarage && (
        <div className={`px-3 pt-3 shrink-0 ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={activeGarage ? activeGarage.name : t('allGarages')}
              aria-label={activeGarage ? activeGarage.name : t('allGarages')}
              className="w-11 h-11 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] hover:opacity-90 transition"
            >
              <Building2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="rounded-[var(--ag-card-radius)] bg-[var(--surface-muted)]/75 border border-[var(--border)] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  <Building2 className="w-3 h-3 text-[var(--primary)]" />
                  <span>{isRu ? 'Рабочий гараж' : 'Garage actif'}</span>
                </span>
                {activeGarage && (
                  <span className="text-[10px] font-semibold text-[var(--primary)] truncate max-w-[90px]">
                    {activeGarage.city || 'FR'}
                  </span>
                )}
              </div>
              <ThemedSelect
                testId={isMobileDrawer ? 'sidebar-mobile-garage-select' : 'sidebar-garage-select'}
                ariaLabel={isRu ? 'Переключить гараж' : 'Changer de garage'}
                value={activeGarageId || ''}
                onChange={(val) => {
                  onSelectGarage(val || null);
                  if (isMobileDrawer) onCloseMobile();
                }}
                options={[
                  { value: '', label: t('allGarages') },
                  ...garages.map((g) => ({ value: g.id, label: g.name })),
                ]}
                triggerClassName="w-full bg-[var(--card)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-2.5 py-1.5"
              />
            </div>
          )}
        </div>
      )}

      {/* Primary Vertical Navigation Links */}
      <nav
        aria-label={isRu ? 'Основная навигация' : 'Navigation principale'}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5"
      >
        {!collapsed && (
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            {isRu ? 'Навигация' : 'Navigation'}
          </div>
        )}

        {navItems
          .filter((item) => item.visible)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={
                isMobileDrawer ? `sidebar-mobile-nav-${item.id}` : `sidebar-nav-${item.id}`
              }
              onClick={() => handleItemClick(item.id, isMobileDrawer)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 rounded-[var(--ag-button-radius)] text-xs font-semibold transition-all ${
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
              } ${
                item.active
                  ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm font-bold'
                  : item.accentAdmin
                  ? 'text-[var(--primary)] hover:bg-[var(--surface-muted)]'
                  : 'text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              {item.icon}
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
      </nav>

      {/* Bottom Sync Status */}
      <div className="px-3 py-3 border-t border-[var(--ag-header-border)] shrink-0">
        {collapsed ? (
          <div className="flex justify-center" title={t('liveSync')}>
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--ag-profit-color)] animate-pulse" />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-[var(--background)]/60 border border-[var(--border)] text-[11px] text-[var(--muted-foreground)]">
            <span className="w-2 h-2 rounded-full bg-[var(--ag-profit-color)] animate-pulse shrink-0" />
            <span className="truncate">{t('liveSync')}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Left Collapsible Sidebar (>= lg / 1024px) */}
      <aside
        data-testid="desktop-sidebar"
        data-collapsed={isCollapsed ? 'true' : 'false'}
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen z-30 bg-[var(--ag-header-bg)] text-[var(--ag-header-text)] border-r border-[var(--ag-header-border)] transition-all duration-200 ${
          isCollapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {renderSidebarBody(isCollapsed, false)}
      </aside>

      {/* Mobile & Tablet Slide-Out Drawer (< lg / 1024px) */}
      {mobileOpen && (
        <div
          data-testid="mobile-sidebar-overlay"
          className="lg:hidden fixed inset-0 z-50 flex"
        >
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <aside
            data-testid="mobile-sidebar-drawer"
            className="relative z-10 w-72 max-w-[85vw] h-full bg-[var(--ag-header-bg)] text-[var(--ag-header-text)] border-r border-[var(--ag-header-border)] shadow-2xl"
          >
            {renderSidebarBody(false, true)}
          </aside>
        </div>
      )}
    </>
  );
};
