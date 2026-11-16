import React, { useEffect, useRef, useState } from 'react';
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
  Globe,
  Sun,
  Moon,
  LogIn,
  LogOut,
  Check,
  ChevronUp,
  User as UserIcon,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { FeatureFlagsConfig, GarageWorkspace } from '../types/garage';
import { DEFAULT_FEATURE_FLAGS } from '../utils/adminUtils';
import { useI18n } from '../i18n/I18nContext';
import { ThemedSelect } from './ThemedSelect';
import { getLanguageMeta, SUPPORTED_LANGUAGES } from '../utils/i18nUtils';

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
  theme: 'dark' | 'light';
  onThemeChange: (t: 'dark' | 'light') => void;
  user: User | null;
  activeSessionEmail?: string | null;
  onOpenAuthModal: () => void;
  onSignOut: () => void;
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
  theme,
  onThemeChange,
  user,
  activeSessionEmail,
  onOpenAuthModal,
  onSignOut,
}) => {
  const { lang, setLang, t, getTextStyle } = useI18n();
  const [desktopLangOpen, setDesktopLangOpen] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);
  const desktopLangRef = useRef<HTMLDivElement | null>(null);
  const mobileLangRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mobileOpen) {
      setMobileLangOpen(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileLangOpen) {
          setMobileLangOpen(false);
        } else {
          onCloseMobile();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, mobileLangOpen, onCloseMobile]);

  useEffect(() => {
    if (!desktopLangOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (desktopLangRef.current && !desktopLangRef.current.contains(e.target as Node)) {
        setDesktopLangOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDesktopLangOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [desktopLangOpen]);

  useEffect(() => {
    if (!mobileLangOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (mobileLangRef.current && !mobileLangRef.current.contains(e.target as Node)) {
        setMobileLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [mobileLangOpen]);

  const activeGarage = activeGarageId
    ? garages.find((g) => g.id === activeGarageId) || null
    : null;

  const currentLangMeta = getLanguageMeta(lang);
  const signedInEmail = user?.email || activeSessionEmail || null;
  const displayName = user?.displayName || signedInEmail || t('signIn');
  const avatarInitial = (user?.displayName || signedInEmail || 'U').charAt(0).toUpperCase();

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

  const renderSidebarBody = (collapsed: boolean, isMobileDrawer: boolean) => {
    const langOpen = isMobileDrawer ? mobileLangOpen : desktopLangOpen;
    const setLangOpen = isMobileDrawer ? setMobileLangOpen : setDesktopLangOpen;
    const langContainerRef = isMobileDrawer ? mobileLangRef : desktopLangRef;
    const langTriggerId = isMobileDrawer
      ? 'sidebar-mobile-lang-trigger'
      : 'sidebar-lang-trigger';
    const langMenuId = isMobileDrawer ? 'sidebar-mobile-lang-menu' : 'sidebar-lang-menu';
    const themeToggleId = isMobileDrawer
      ? 'sidebar-mobile-theme-toggle'
      : 'sidebar-theme-toggle';

    return (
      <div className="flex flex-col h-full">
        {/* Top Brand Row inside Sidebar */}
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
              title={t('expandSidebar')}
              aria-label={t('expandSidebar')}
            >
              <Car className="w-4 h-4" />
            </button>
          )}

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={onCloseMobile}
              data-testid="sidebar-mobile-close"
              aria-label={t('closeNavMenu')}
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
                aria-label={t('collapseSidebar')}
                title={t('collapseSidebar')}
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
              aria-label={t('expandSidebar')}
              title={t('expandSidebar')}
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
                    <span>{t('activeGarageLabel')}</span>
                  </span>
                  {activeGarage && (
                    <span className="text-[10px] font-semibold text-[var(--primary)] truncate max-w-[90px]">
                      {activeGarage.city || 'FR'}
                    </span>
                  )}
                </div>
                <ThemedSelect
                  testId={isMobileDrawer ? 'sidebar-mobile-garage-select' : 'sidebar-garage-select'}
                  ariaLabel={t('switchGarageLabel')}
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
          aria-label={t('navSectionLabel')}
          className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5"
        >
          {!collapsed && (
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('navSectionLabel')}
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
                aria-label={collapsed ? item.label : undefined}
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

        {/* Sidebar Footer: Language Dropdown, Theme Toggle, User Profile & Auth, Live Sync */}
        <div
          data-testid={isMobileDrawer ? 'sidebar-mobile-footer' : 'sidebar-footer'}
          className={`border-t border-[var(--ag-header-border)] shrink-0 ${
            collapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-3 py-3 space-y-2.5'
          }`}
        >
          {/* Language Dropdown + Theme Toggle */}
          {collapsed ? (
            <>
              <div ref={langContainerRef} className="relative flex justify-center w-full">
                <button
                  type="button"
                  data-testid={langTriggerId}
                  onClick={() => setLangOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={langOpen}
                  aria-label={`${t('languageLabel')}: ${currentLangMeta.menuLabel}`}
                  title={currentLangMeta.menuLabel}
                  className="w-10 h-10 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:border-[var(--primary)] flex items-center justify-center transition"
                >
                  <Globe className="w-4 h-4 text-[var(--primary)]" />
                </button>

                {langOpen && (
                  <div
                    role="menu"
                    data-testid={langMenuId}
                    className="absolute left-full bottom-0 ml-2 w-56 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-2xl p-1.5 space-y-1 z-50"
                  >
                    {SUPPORTED_LANGUAGES.map((option) => {
                      const active = option.code === lang;
                      return (
                        <button
                          key={option.code}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          data-testid={`lang-option-${option.code}`}
                          onClick={() => {
                            setLang(option.code);
                            setLangOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-left transition ${
                            active
                              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-bold'
                              : 'text-[var(--foreground)] hover:bg-[var(--surface-muted)] font-medium'
                          }`}
                        >
                          <span className="truncate">{option.menuLabel}</span>
                          {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                data-testid={themeToggleId}
                onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                title={theme === 'dark' ? t('themeLight') : t('themeDark')}
                aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
                className="w-10 h-10 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:border-[var(--primary)] flex items-center justify-center transition"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-500" />
                )}
              </button>

              {signedInEmail ? (
                <>
                  <div
                    title={displayName}
                    className="w-9 h-9 rounded-full bg-[var(--primary)]/15 border border-[var(--primary)]/40 text-[var(--primary)] flex items-center justify-center text-xs font-extrabold overflow-hidden shrink-0"
                  >
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{avatarInitial}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid={isMobileDrawer ? 'sidebar-mobile-signout-btn' : 'sidebar-signout-btn'}
                    onClick={onSignOut}
                    title={t('signOut')}
                    aria-label={t('signOut')}
                    className="w-10 h-9 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--muted-foreground)] hover:text-rose-400 border border-[var(--border)] flex items-center justify-center transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-testid={isMobileDrawer ? 'sidebar-mobile-signin-btn' : 'sidebar-signin-btn'}
                  onClick={() => {
                    onOpenAuthModal();
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  title={t('signIn')}
                  aria-label={t('signIn')}
                  className="w-10 h-10 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:border-[var(--primary)] flex items-center justify-center transition"
                >
                  <LogIn className="w-4 h-4 text-[var(--primary)]" />
                </button>
              )}

              <div className="flex justify-center pt-0.5" title={t('liveSync')}>
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--ag-profit-color)] animate-pulse" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div ref={langContainerRef} className="relative flex-1 min-w-0">
                  <button
                    type="button"
                    data-testid={langTriggerId}
                    onClick={() => setLangOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={langOpen}
                    aria-label={`${t('languageLabel')}: ${currentLangMeta.menuLabel}`}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:border-[var(--primary)] text-xs font-bold transition"
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Globe className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                      <span className="truncate">{currentLangMeta.shortCode}</span>
                    </span>
                    <ChevronUp
                      className={`w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0 transition-transform ${
                        langOpen ? '' : 'rotate-180'
                      }`}
                    />
                  </button>

                  {langOpen && (
                    <div
                      role="menu"
                      data-testid={langMenuId}
                      className="absolute bottom-full left-0 mb-2 w-full min-w-[228px] rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-2xl p-1.5 space-y-1 z-50"
                    >
                      {SUPPORTED_LANGUAGES.map((option) => {
                        const active = option.code === lang;
                        return (
                          <button
                            key={option.code}
                            type="button"
                            role="menuitemradio"
                            aria-checked={active}
                            data-testid={`lang-option-${option.code}`}
                            onClick={() => {
                              setLang(option.code);
                              setLangOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-left transition ${
                              active
                                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-bold'
                                : 'text-[var(--foreground)] hover:bg-[var(--surface-muted)] font-medium'
                            }`}
                          >
                            <span className="truncate">{option.menuLabel}</span>
                            {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  data-testid={themeToggleId}
                  onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                  title={theme === 'dark' ? t('themeLight') : t('themeDark')}
                  aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
                  className="p-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:border-[var(--primary)] transition shrink-0"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-indigo-500" />
                  )}
                </button>
              </div>

              {/* User Profile Avatar & Auth Action */}
              {signedInEmail ? (
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)]/70 border border-[var(--border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[var(--primary)]/15 border border-[var(--primary)]/40 text-[var(--primary)] flex items-center justify-center text-xs font-extrabold overflow-hidden shrink-0">
                      {user?.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{avatarInitial}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold text-[var(--ag-header-text)] truncate">
                        {user?.displayName || signedInEmail}
                      </span>
                      {user?.displayName && (
                        <span className="block text-[10px] text-[var(--muted-foreground)] truncate">
                          {signedInEmail}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid={isMobileDrawer ? 'sidebar-mobile-signout-btn' : 'sidebar-signout-btn'}
                    onClick={onSignOut}
                    title={t('signOut')}
                    aria-label={t('signOut')}
                    className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-[var(--background)]/60 transition shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid={isMobileDrawer ? 'sidebar-mobile-signin-btn' : 'sidebar-signin-btn'}
                  onClick={() => {
                    onOpenAuthModal();
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] text-[var(--ag-header-text)] border border-[var(--border)] hover:border-[var(--primary)] text-xs font-semibold transition"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center shrink-0">
                      <UserIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                    </span>
                    <span className="truncate">{t('signIn')}</span>
                  </span>
                  <LogIn className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                </button>
              )}

              {/* Bottom Live Sync Status */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--background)]/60 border border-[var(--border)] text-[11px] text-[var(--muted-foreground)]">
                <span className="w-2 h-2 rounded-full bg-[var(--ag-profit-color)] animate-pulse shrink-0" />
                <span className="truncate">{t('liveSync')}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

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

