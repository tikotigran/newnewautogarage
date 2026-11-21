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
  LogOut,
  User as UserIcon,
  ArrowLeft,
  Coins,
  Palette,
  ExternalLink,
  Crown,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  AppUserProfileType,
  FeatureFlagsConfig,
  GarageWorkspace,
  SubscriptionPlan,
  SubscriptionPlanId,
} from '../types/garage';
import { DEFAULT_FEATURE_FLAGS, getPlanBadgeLabel } from '../utils/adminUtils';
import { resolveUserProfileType } from '../utils/frenchTaxEngine';
import { hasOpenGarageWorkspace } from '../utils/garageUtils';
import { useI18n } from '../i18n/I18nContext';
import { ThemedSelect } from './ThemedSelect';
import { pickLocalized } from '../utils/i18nUtils';
import type { SettingsTab } from './Settings';

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
  activeView:
    | 'desktop'
    | 'new_vehicle'
    | 'analytics'
    | 'suppliers'
    | 'documents'
    | 'exports'
    | 'settings'
    | 'admin';
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
  activeSettingsTab?: SettingsTab;
  onSelectSettingsTab?: (tab: SettingsTab) => void;
  onExitSettings?: () => void;
  profileType?: AppUserProfileType;
  planId?: SubscriptionPlanId;
  plans?: SubscriptionPlan[];
  onOpenSubscription?: () => void;
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
  activeSettingsTab = 'company',
  onSelectSettingsTab,
  onExitSettings,
  profileType,
  planId = 'starter',
  plans,
  onOpenSubscription,
}) => {
  const { lang, t, getTextStyle } = useI18n();
  const [desktopProfileOpen, setDesktopProfileOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const desktopProfileRef = useRef<HTMLDivElement | null>(null);
  const mobileProfileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isCollapsed || desktopProfileOpen) {
      setHoveredTooltip(null);
    }
  }, [isCollapsed, desktopProfileOpen]);

  const showCollapsedTooltip = (
    e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>,
    label: string,
    collapsed: boolean
  ) => {
    if (!collapsed || desktopProfileOpen) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredTooltip({
      label,
      x: rect.right + 12,
      y: rect.top + rect.height / 2,
    });
  };

  const hideCollapsedTooltip = () => {
    setHoveredTooltip(null);
  };

  useEffect(() => {
    if (!mobileOpen) {
      setMobileProfileOpen(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileProfileOpen) {
          setMobileProfileOpen(false);
        } else {
          onCloseMobile();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, mobileProfileOpen, onCloseMobile]);

  useEffect(() => {
    if (!desktopProfileOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (desktopProfileRef.current && !desktopProfileRef.current.contains(e.target as Node)) {
        setDesktopProfileOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDesktopProfileOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [desktopProfileOpen]);

  useEffect(() => {
    if (!mobileProfileOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (mobileProfileRef.current && !mobileProfileRef.current.contains(e.target as Node)) {
        setMobileProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [mobileProfileOpen]);

  const activeGarage = activeGarageId
    ? garages.find((g) => g.id === activeGarageId) || null
    : null;

  const resolvedProfileType: AppUserProfileType =
    profileType || (activeGarage ? resolveUserProfileType(activeGarage) : 'micro_entrepreneur');
  const profileBadgeLabel =
    resolvedProfileType === 'particulier'
      ? t('profileBadgeParticulier')
      : t('profileBadgeMicro');
  const planBadgeLabel = getPlanBadgeLabel(planId, lang, plans);

  const signedInEmail = user?.email || activeSessionEmail || null;
  const displayName = user?.displayName || signedInEmail || t('signIn');
  const avatarInitial = (user?.displayName || signedInEmail || 'U').charAt(0).toUpperCase();

  const hasOpenedGarage = hasOpenGarageWorkspace(featureFlags.multiGarage, activeGarageId);

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
      active: activeView === 'desktop' || activeView === 'new_vehicle',
      visible: hasOpenedGarage,
    },
    {
      id: 'analytics',
      label: t('navAnalyticsPnl'),
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      active: activeView === 'analytics',
      visible: hasOpenedGarage && featureFlags.expenseAnalytics,
    },
    {
      id: 'suppliers',
      label: t('navSuppliers'),
      icon: <Handshake className="w-4 h-4 shrink-0" />,
      active: activeView === 'suppliers',
      visible: hasOpenedGarage && featureFlags.suppliersModule,
    },
    {
      id: 'documents',
      label: t('navDocuments'),
      icon: <FileText className="w-4 h-4 shrink-0" />,
      active: activeView === 'documents',
      visible: hasOpenedGarage && featureFlags.documentsModule,
    },
    {
      id: 'exports',
      label: t('navExportsBackup'),
      icon: <DatabaseBackup className="w-4 h-4 shrink-0" />,
      active: activeView === 'exports',
      visible: hasOpenedGarage && featureFlags.exportsBackup,
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
  const visibleNavItems = navItems.filter((item) => item.visible);

  const handleItemClick = (target: SidebarNavTarget, isMobileDrawer: boolean) => {
    onNavigate(target);
    if (isMobileDrawer) {
      onCloseMobile();
    }
  };

  const renderSidebarBody = (collapsed: boolean, isMobileDrawer: boolean) => {
    const profileOpen = isMobileDrawer ? mobileProfileOpen : desktopProfileOpen;
    const setProfileOpen = isMobileDrawer ? setMobileProfileOpen : setDesktopProfileOpen;
    const profileContainerRef = isMobileDrawer ? mobileProfileRef : desktopProfileRef;

    const iconHoverClass =
      theme === 'light' ? 'hover:bg-black/5' : 'hover:bg-white/10';
    const rowHoverClass =
      theme === 'light' ? 'hover:bg-black/5' : 'hover:bg-white/5';

    const logoutLabel = pickLocalized(lang, {
      fr: 'Se déconnecter',
      ru: 'Выйти из аккаунта',
      hy: 'Դուրս գալ հաշվից',
      ka: 'ანგარიშიდან გასვლა',
    });

    const isSettingsMode = activeView === 'settings';

    const backToAppLabel = pickLocalized(lang, {
      fr: 'Retour à l’application',
      ru: 'Вернуться в приложение',
      hy: 'Վերադառնալ հավելված',
      ka: 'აპლიკაციაში დაბრუნება',
    });

    const settingsGroups: {
      id: string;
      label: string;
      items: {
        id: SettingsTab;
        label: string;
        icon: React.ReactNode;
      }[];
    }[] = [
      {
        id: 'garage-docs',
        label: pickLocalized(lang, {
          fr: 'GARAGE & DOCUMENTS',
          ru: 'ГАРАЖ И ДОКУМЕНТЫ',
          hy: 'ԱՎՏՈՍՐԱՀ ԵՎ ՓԱՍՏԱԹՂԹԵՐ',
          ka: 'გარაჟი და დოკუმენტები',
        }),
        items: [
          {
            id: 'company',
            label: pickLocalized(lang, {
              fr: 'Profil & Statut',
              ru: 'Профиль и статус',
              hy: 'Պրոֆիլ և կարգավիճակ',
              ka: 'პროფილი და სტატუსი',
            }),
            icon: <Building2 className="w-4 h-4 shrink-0" />,
          },
          {
            id: 'templates',
            label: pickLocalized(lang, {
              fr: 'Modèles & Cerfa',
              ru: 'Бланки и Настройки Cerfa',
              hy: 'Ձևաթղթեր և Cerfa',
              ka: 'ბლანკები და Cerfa',
            }),
            icon: <FileText className="w-4 h-4 shrink-0" />,
          },
          {
            id: 'finance',
            label: pickLocalized(lang, {
              fr: 'Finances & Cotisations',
              ru: 'Финансы и Налоги',
              hy: 'Ֆինանսներ և հարկեր',
              ka: 'ფინანსები და გადასახადები',
            }),
            icon: <Coins className="w-4 h-4 shrink-0" />,
          },
        ],
      },
      {
        id: 'app',
        label: pickLocalized(lang, {
          fr: 'APPLICATION',
          ru: 'ПРИЛОЖЕНИЕ',
          hy: 'ՀԱՎԵԼՎԱԾ',
          ka: 'აპლიკაცია',
        }),
        items: [
          {
            id: 'appearance',
            label: pickLocalized(lang, {
              fr: 'Apparence',
              ru: 'Внешний вид',
              hy: 'Արտաքին տեսք',
              ka: 'გარეგნობა',
            }),
            icon: <Palette className="w-4 h-4 shrink-0" />,
          },
          {
            id: 'subscription',
            label: pickLocalized(lang, {
              fr: 'Abonnement & Forfait',
              ru: 'Тариф и подписка',
              hy: 'Սակագին և բաժանորդագրություն',
              ka: 'ტარიფი და გამოწერა',
            }),
            icon: <Crown className="w-4 h-4 shrink-0" />,
          },
          {
            id: 'security',
            label: pickLocalized(lang, {
              fr: 'Sécurité & Compte',
              ru: 'Безопасность и Аккаунт',
              hy: 'Անվտանգություն և հաշիվ',
              ka: 'უსაფრთხოება და ანგარიში',
            }),
            icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
          },
        ],
      },
    ];

    const backHoverClass =
      theme === 'light' ? 'hover:bg-black/5' : 'hover:bg-white/5';

    const handleOpenSubscriptionFromPopover = () => {
      setProfileOpen(false);
      if (onOpenSubscription) {
        onOpenSubscription();
      } else {
        onSelectSettingsTab?.('subscription');
        onNavigate('settings');
      }
      if (isMobileDrawer) {
        onCloseMobile();
      }
    };

    const renderProfilePopover = (positionClass: string) => (
      <div
        role="menu"
        data-testid={
          isMobileDrawer ? 'sidebar-mobile-profile-popover' : 'sidebar-profile-popover'
        }
        className={`${positionClass} rounded-xl border border-[var(--border)]/60 bg-[var(--card)] text-[var(--foreground)] shadow-xl p-2 w-60 z-50`}
      >
        {/* Header: Clickable Subscription Plan Badge + Profile Type + Email */}
        <div className="px-2 py-1.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              data-testid={
                isMobileDrawer ? 'sidebar-mobile-profile-badge' : 'sidebar-profile-badge'
              }
              onClick={handleOpenSubscriptionFromPopover}
              title={pickLocalized(lang, {
                fr: 'Gérer mon abonnement',
                ru: 'Управление тарифом и подпиской',
                hy: 'Կառավարել սակագինը',
                ka: 'ტარიფის მართვა',
              })}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 px-2 py-0.5 rounded-md whitespace-nowrap transition cursor-pointer"
            >
              <Crown className="w-3 h-3 shrink-0" />
              <span>{planBadgeLabel}</span>
            </button>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] truncate">
              {profileBadgeLabel}
            </span>
          </div>
          {user?.displayName && (
            <p className="text-xs font-semibold text-[var(--foreground)] truncate">
              {user.displayName}
            </p>
          )}
          <p
            title={signedInEmail || undefined}
            className="text-xs text-[var(--muted-foreground)] truncate"
          >
            {signedInEmail}
          </p>
        </div>

        {/* Status line */}
        <div className="px-2 py-1 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="truncate">{t('liveSync')}</span>
        </div>

        <div className="border-t border-[var(--border)] my-1.5" />

        {/* Logout button */}
        <button
          type="button"
          data-testid={
            isMobileDrawer ? 'sidebar-mobile-signout-btn' : 'sidebar-signout-btn'
          }
          onClick={() => {
            setProfileOpen(false);
            onSignOut();
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{logoutLabel}</span>
        </button>
      </div>
    );

    return (
      <div className="flex flex-col h-full">
        {/* Top Header inside Sidebar */}
        {isSettingsMode ? (
          <div
            data-testid={isMobileDrawer ? 'sidebar-mobile-top-header' : 'sidebar-top-header'}
            className={`h-16 flex items-center border-b border-[var(--ag-header-border)] shrink-0 ${
              collapsed ? 'justify-center px-2' : 'justify-between px-2 gap-1'
            }`}
          >
            {!collapsed ? (
              <>
                <button
                  type="button"
                  data-testid={
                    isMobileDrawer ? 'sidebar-mobile-settings-back' : 'sidebar-settings-back'
                  }
                  onClick={() => {
                    onExitSettings?.();
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-[13px] font-medium text-[var(--ag-header-text)] ${backHoverClass} rounded-xl cursor-pointer transition text-left`}
                >
                  <ArrowLeft className="w-4 h-4 shrink-0 text-[var(--muted-foreground)]" />
                  <span className="truncate">{backToAppLabel}</span>
                </button>

                {isMobileDrawer ? (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    data-testid="sidebar-mobile-close"
                    aria-label={t('closeNavMenu')}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] ${iconHoverClass} transition shrink-0`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    data-testid="sidebar-collapse-toggle"
                    aria-label={t('collapseSidebar')}
                    title={t('collapseSidebar')}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[var(--ag-header-text)]/75 hover:text-[var(--ag-header-text)] ${iconHoverClass} transition shrink-0`}
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                data-testid="sidebar-collapse-toggle"
                onMouseEnter={(e) => showCollapsedTooltip(e, t('expandSidebar'), collapsed)}
                onMouseLeave={hideCollapsedTooltip}
                onFocus={(e) => showCollapsedTooltip(e, t('expandSidebar'), collapsed)}
                onBlur={hideCollapsedTooltip}
                aria-label={t('expandSidebar')}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] ${iconHoverClass} transition shrink-0 cursor-pointer`}
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div
            data-testid={isMobileDrawer ? 'sidebar-mobile-top-header' : 'sidebar-top-header'}
            className={`h-16 flex items-center border-b border-[var(--ag-header-border)] shrink-0 ${
              collapsed ? 'justify-center px-2' : 'justify-between px-3 gap-2'
            }`}
          >
            {!collapsed ? (
              <>
                <button
                  type="button"
                  onClick={() => handleItemClick('inventory', isMobileDrawer)}
                  className="flex items-center gap-2 min-w-0 text-left hover:opacity-90 transition-opacity focus:outline-none"
                  title={t('appName')}
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shadow-sm shrink-0">
                    <Car className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span
                      style={getTextStyle('appName')}
                      className="block font-extrabold text-sm leading-tight tracking-tight truncate text-[var(--ag-header-text)]"
                    >
                      {t('appName')}
                    </span>
                    <span
                      data-testid="sidebar-brand-profile-badge"
                      className="block text-[9px] font-bold uppercase tracking-wider text-[var(--primary)] leading-tight truncate"
                    >
                      {profileBadgeLabel}
                    </span>
                  </div>
                </button>

                {isMobileDrawer ? (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    data-testid="sidebar-mobile-close"
                    aria-label={t('closeNavMenu')}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] ${iconHoverClass} transition shrink-0`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    data-testid="sidebar-collapse-toggle"
                    aria-label={t('collapseSidebar')}
                    title={t('collapseSidebar')}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[var(--ag-header-text)]/75 hover:text-[var(--ag-header-text)] ${iconHoverClass} transition shrink-0`}
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                data-testid="sidebar-collapse-toggle"
                onMouseEnter={(e) => showCollapsedTooltip(e, t('expandSidebar'), collapsed)}
                onMouseLeave={hideCollapsedTooltip}
                onFocus={(e) => showCollapsedTooltip(e, t('expandSidebar'), collapsed)}
                onBlur={hideCollapsedTooltip}
                aria-label={t('expandSidebar')}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] ${iconHoverClass} transition shrink-0 cursor-pointer`}
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Tenant / Garage Switcher (operational mode only) */}
        {!isSettingsMode && featureFlags.multiGarage && garages.length > 0 && onSelectGarage && (
          <div className={`shrink-0 ${collapsed ? 'pt-2 pb-1 flex justify-center' : 'px-3 pt-2.5 pb-1'}`}>
            {collapsed ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                onMouseEnter={(e) =>
                  showCollapsedTooltip(
                    e,
                    activeGarage
                      ? activeGarage.name?.trim() ||
                        pickLocalized(lang, {
                          fr: 'Mon espace',
                          ru: 'Мой профиль',
                          hy: 'Իմ պրոֆիլը',
                          ka: 'ჩემი პროფილი',
                        })
                      : t('allGarages'),
                    collapsed
                  )
                }
                onMouseLeave={hideCollapsedTooltip}
                onFocus={(e) =>
                  showCollapsedTooltip(
                    e,
                    activeGarage
                      ? activeGarage.name?.trim() ||
                        pickLocalized(lang, {
                          fr: 'Mon espace',
                          ru: 'Мой профиль',
                          hy: 'Իմ պրոֆիլը',
                          ka: 'ჩემი პროფილი',
                        })
                      : t('allGarages'),
                    collapsed
                  )
                }
                onBlur={hideCollapsedTooltip}
                aria-label={
                  activeGarage
                    ? activeGarage.name?.trim() ||
                      pickLocalized(lang, {
                        fr: 'Mon espace',
                        ru: 'Мой профиль',
                        hy: 'Իմ պրոֆիլը',
                        ka: 'ჩემი პროფილი',
                      })
                    : t('allGarages')
                }
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[var(--primary)] ${iconHoverClass} transition`}
              >
                <Building2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="rounded-xl bg-[var(--surface-muted)]/60 border border-[var(--border)] p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                    <Building2 className="w-3 h-3 text-[var(--primary)]" />
                    <span>{t('activeGarageLabel')}</span>
                  </span>
                  {activeGarage && (
                    <button
                      type="button"
                      data-testid={
                        isMobileDrawer ? 'sidebar-mobile-all-garages-btn' : 'sidebar-all-garages-btn'
                      }
                      onClick={() => {
                        onSelectGarage(null);
                        if (isMobileDrawer) onCloseMobile();
                      }}
                      title={t('allGarages')}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--primary)] hover:underline transition cursor-pointer shrink-0"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      <span>{t('allGarages')}</span>
                    </button>
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
                    ...garages.map((g) => ({
                      value: g.id,
                      label:
                        g.name?.trim() ||
                        pickLocalized(lang, {
                          fr: 'Mon espace',
                          ru: 'Мой профиль',
                          hy: 'Իմ պրոֆիլը',
                          ka: 'ჩემი პროფილი',
                        }),
                    })),
                  ]}
                  triggerClassName="w-full bg-[var(--card)] text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-lg px-2.5 py-1.5"
                />
              </div>
            )}
          </div>
        )}

        {/* Primary Navigation OR Dedicated Settings Navigation */}
        {isSettingsMode ? (
          <nav
            aria-label={t('navGarageSettings')}
            data-testid={isMobileDrawer ? 'sidebar-mobile-settings-nav' : 'sidebar-settings-nav'}
            className={`flex-1 overflow-y-auto no-scrollbar ${
              collapsed ? 'px-2 py-2 flex flex-col items-center gap-1' : 'px-3 py-3 space-y-4'
            }`}
          >
            {collapsed && (
              <>
                <button
                  type="button"
                  data-testid="sidebar-settings-back"
                  onClick={() => {
                    hideCollapsedTooltip();
                    onExitSettings?.();
                  }}
                  onMouseEnter={(e) => showCollapsedTooltip(e, backToAppLabel, collapsed)}
                  onMouseLeave={hideCollapsedTooltip}
                  onFocus={(e) => showCollapsedTooltip(e, backToAppLabel, collapsed)}
                  onBlur={hideCollapsedTooltip}
                  aria-label={backToAppLabel}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[var(--ag-header-text)]/85 hover:text-[var(--ag-header-text)] ${iconHoverClass} transition cursor-pointer`}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-6 h-px bg-[var(--ag-header-border)] my-1 shrink-0" />
              </>
            )}

            {settingsGroups.map((group, groupIndex) => (
              <div
                key={group.id}
                className={collapsed ? 'flex flex-col items-center gap-1 w-full' : 'space-y-1'}
              >
                {!collapsed ? (
                  <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                    {group.label}
                  </div>
                ) : (
                  groupIndex > 0 && (
                    <div className="w-6 h-px bg-[var(--ag-header-border)] my-1 shrink-0" />
                  )
                )}

                {group.items.map((item) => {
                  const active = activeSettingsTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={
                        isMobileDrawer
                          ? `sidebar-mobile-settings-tab-${item.id}`
                          : `sidebar-settings-tab-${item.id}`
                      }
                      onClick={() => {
                        onSelectSettingsTab?.(item.id);
                        if (isMobileDrawer) onCloseMobile();
                      }}
                      onMouseEnter={(e) => showCollapsedTooltip(e, item.label, collapsed)}
                      onMouseLeave={hideCollapsedTooltip}
                      onFocus={(e) => showCollapsedTooltip(e, item.label, collapsed)}
                      onBlur={hideCollapsedTooltip}
                      aria-label={collapsed ? item.label : undefined}
                      className={
                        collapsed
                          ? `w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                              active
                                ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                                : `text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] ${iconHoverClass}`
                            }`
                          : `w-full flex items-center gap-2.5 rounded-[var(--ag-button-radius)] px-3 py-2 text-xs font-semibold transition-colors cursor-pointer text-left ${
                              active
                                ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm font-bold'
                                : 'text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] hover:bg-[var(--surface-muted)]'
                            }`
                      }
                    >
                      {item.icon}
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        ) : (
          <nav
            aria-label={t('navSectionLabel')}
            className={`flex-1 overflow-y-auto no-scrollbar ${
              collapsed ? 'px-2 py-2 flex flex-col items-center gap-1' : 'px-3 py-2 space-y-0.5'
            }`}
          >
            {!collapsed && visibleNavItems.length > 0 && (
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t('navSectionLabel')}
              </div>
            )}

            {visibleNavItems.map((item) => {
                if (item.id === 'admin') {
                  const adminTabHref =
                    typeof window !== 'undefined'
                      ? `${window.location.origin}/?view=admin`
                      : '/?view=admin';
                  return (
                    <a
                      key={item.id}
                      href={adminTabHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={
                        isMobileDrawer ? `sidebar-mobile-nav-${item.id}` : `sidebar-nav-${item.id}`
                      }
                      onClick={() => {
                        hideCollapsedTooltip();
                        if (isMobileDrawer) onCloseMobile();
                      }}
                      onMouseEnter={(e) => showCollapsedTooltip(e, item.label, collapsed)}
                      onMouseLeave={hideCollapsedTooltip}
                      onFocus={(e) => showCollapsedTooltip(e, item.label, collapsed)}
                      onBlur={hideCollapsedTooltip}
                      aria-label={collapsed ? item.label : undefined}
                      className={
                        collapsed
                          ? `w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              item.active
                                ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                                : `text-[var(--primary)] ${iconHoverClass}`
                            }`
                          : `w-full flex items-center gap-2.5 rounded-[var(--ag-button-radius)] px-3 py-2 text-xs font-semibold transition-colors ${
                              item.active
                                ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm font-bold'
                                : 'text-[var(--primary)] hover:bg-[var(--surface-muted)]'
                            }`
                      }
                    >
                      {item.icon}
                      {!collapsed && (
                        <>
                          <span className="truncate flex-1 text-left">{item.label}</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" aria-hidden="true" />
                        </>
                      )}
                    </a>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={
                      isMobileDrawer ? `sidebar-mobile-nav-${item.id}` : `sidebar-nav-${item.id}`
                    }
                    onClick={() => handleItemClick(item.id, isMobileDrawer)}
                    onMouseEnter={(e) => showCollapsedTooltip(e, item.label, collapsed)}
                    onMouseLeave={hideCollapsedTooltip}
                    onFocus={(e) => showCollapsedTooltip(e, item.label, collapsed)}
                    onBlur={hideCollapsedTooltip}
                    aria-label={collapsed ? item.label : undefined}
                    className={
                      collapsed
                        ? `w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            item.active
                              ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                              : `text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] ${iconHoverClass}`
                          }`
                        : `w-full flex items-center gap-2.5 rounded-[var(--ag-button-radius)] px-3 py-2 text-xs font-semibold transition-colors ${
                            item.active
                              ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm font-bold'
                              : 'text-[var(--ag-header-text)]/80 hover:text-[var(--ag-header-text)] hover:bg-[var(--surface-muted)]'
                          }`
                    }
                  >
                    {item.icon}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
          </nav>
        )}

        {/* Sidebar Footer */}
        <div
          data-testid={isMobileDrawer ? 'sidebar-mobile-footer' : 'sidebar-footer'}
          className={`shrink-0 ${
            collapsed
              ? 'px-2 py-2.5 flex flex-col items-center gap-1.5'
              : 'px-3 py-2.5 flex items-center justify-between gap-1.5'
          }`}
        >
          {collapsed ? (
            <>
              <button
                type="button"
                data-testid={
                  isMobileDrawer ? 'sidebar-mobile-settings-btn' : 'sidebar-settings-btn'
                }
                onClick={() => {
                  hideCollapsedTooltip();
                  handleItemClick('settings', isMobileDrawer);
                }}
                onMouseEnter={(e) => showCollapsedTooltip(e, t('navGarageSettings'), collapsed)}
                onMouseLeave={hideCollapsedTooltip}
                onFocus={(e) => showCollapsedTooltip(e, t('navGarageSettings'), collapsed)}
                onBlur={hideCollapsedTooltip}
                aria-label={t('navGarageSettings')}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition cursor-pointer ${
                  activeView === 'settings'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                    : `text-[var(--muted-foreground)] hover:text-[var(--ag-header-text)] ${iconHoverClass}`
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>

              {signedInEmail ? (
                <div ref={profileContainerRef} className="relative flex justify-center">
                  <button
                    type="button"
                    data-testid={
                      isMobileDrawer
                        ? 'sidebar-mobile-profile-trigger'
                        : 'sidebar-profile-trigger'
                    }
                    onClick={() => {
                      hideCollapsedTooltip();
                      setProfileOpen((prev) => !prev);
                    }}
                    onMouseEnter={(e) => showCollapsedTooltip(e, displayName, collapsed)}
                    onMouseLeave={hideCollapsedTooltip}
                    onFocus={(e) => showCollapsedTooltip(e, displayName, collapsed)}
                    onBlur={hideCollapsedTooltip}
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    aria-label={displayName}
                    className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${iconHoverClass} transition`}
                  >
                    <span className="relative w-8 h-8 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] flex items-center justify-center text-xs font-extrabold">
                      <span className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                        {user?.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt={displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{avatarInitial}</span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--ag-header-bg)]"
                      />
                    </span>
                  </button>

                  {profileOpen &&
                    renderProfilePopover('absolute left-full bottom-0 ml-3')}
                </div>
              ) : (
                <button
                  type="button"
                  data-testid={isMobileDrawer ? 'sidebar-mobile-signin-btn' : 'sidebar-signin-btn'}
                  onClick={() => {
                    onOpenAuthModal();
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  onMouseEnter={(e) => showCollapsedTooltip(e, t('signIn'), collapsed)}
                  onMouseLeave={hideCollapsedTooltip}
                  onFocus={(e) => showCollapsedTooltip(e, t('signIn'), collapsed)}
                  onBlur={hideCollapsedTooltip}
                  aria-label={t('signIn')}
                  className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${iconHoverClass} transition`}
                >
                  <span className="relative w-8 h-8 rounded-full bg-[var(--surface-muted)] text-[var(--muted-foreground)] flex items-center justify-center">
                    <UserIcon className="w-4 h-4" />
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--ag-header-bg)]"
                    />
                  </span>
                </button>
              )}
            </>
          ) : (
            <>
              {signedInEmail ? (
                <div ref={profileContainerRef} className="relative min-w-0 flex-1">
                  <button
                    type="button"
                    data-testid={
                      isMobileDrawer
                        ? 'sidebar-mobile-profile-trigger'
                        : 'sidebar-profile-trigger'
                    }
                    onClick={() => setProfileOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 ${rowHoverClass} rounded-xl cursor-pointer text-left transition`}
                  >
                    <span className="relative w-8 h-8 rounded-full bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center text-xs font-extrabold shrink-0">
                      <span className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                        {user?.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt={displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{avatarInitial}</span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--ag-header-bg)]"
                      />
                    </span>
                    <span className="text-sm font-medium text-[var(--ag-header-text)] truncate min-w-0 flex-1">
                      {user?.displayName || signedInEmail}
                    </span>
                  </button>

                  {profileOpen &&
                    renderProfilePopover('absolute bottom-full left-0 mb-2')}
                </div>
              ) : (
                <button
                  type="button"
                  data-testid={isMobileDrawer ? 'sidebar-mobile-signin-btn' : 'sidebar-signin-btn'}
                  onClick={() => {
                    onOpenAuthModal();
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  className={`min-w-0 flex-1 flex items-center gap-2.5 px-2 py-1.5 ${rowHoverClass} rounded-xl cursor-pointer text-left transition`}
                >
                  <span className="relative w-8 h-8 rounded-full bg-[var(--surface-muted)] text-[var(--muted-foreground)] flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4" />
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--ag-header-bg)]"
                    />
                  </span>
                  <span className="text-sm font-medium text-[var(--ag-header-text)] truncate min-w-0 flex-1">
                    {t('signIn')}
                  </span>
                </button>
              )}

              <button
                type="button"
                data-testid={
                  isMobileDrawer ? 'sidebar-mobile-settings-btn' : 'sidebar-settings-btn'
                }
                onClick={() => handleItemClick('settings', isMobileDrawer)}
                aria-label={t('navGarageSettings')}
                title={t('navGarageSettings')}
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition cursor-pointer ${
                  activeView === 'settings'
                    ? 'bg-[var(--ag-nav-active-bg)] text-[var(--ag-nav-active-text)] shadow-sm'
                    : `text-[var(--muted-foreground)] hover:text-[var(--ag-header-text)] ${iconHoverClass}`
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
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
          isCollapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        {renderSidebarBody(isCollapsed, false)}
      </aside>

      {/* Custom Floating Pill Tooltip for Collapsed Mode */}
      {isCollapsed && hoveredTooltip && !desktopProfileOpen && (
        <div
          role="tooltip"
          data-testid="sidebar-collapsed-tooltip"
          style={{
            top: hoveredTooltip.y,
            left: hoveredTooltip.x,
          }}
          className={`fixed -translate-y-1/2 z-50 pointer-events-none whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium shadow-md ${
            theme === 'dark'
              ? 'bg-zinc-800 text-zinc-100'
              : 'bg-zinc-200 text-zinc-900'
          }`}
        >
          {hoveredTooltip.label}
        </div>
      )}

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

