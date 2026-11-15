import React, { useState, useEffect, useMemo } from 'react';
import {
  Navbar,
} from './components/Navbar';
import { Sidebar, SidebarNavTarget } from './components/Sidebar';
import { VehicleList } from './components/VehicleList';
import { VehicleDetail } from './components/VehicleDetail';
import { VehicleModal } from './components/VehicleModal';
import { BuyerModal } from './components/BuyerModal';
import { Settings } from './components/Settings';
import { Cerfa15776Modal } from './components/Cerfa15776Modal';
import { AnalyticsView } from './components/AnalyticsView';
import { SuppliersView } from './components/SuppliersView';
import { DocumentsView } from './components/DocumentsView';
import { ExportsBackupView } from './components/ExportsBackupView';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';
import { GarageSelector } from './components/GarageSelector';
import { Vehicle, VehicleStatus, BuyerInfo, UserProfile, SystemThemeConfig, GarageWorkspace, FeatureFlagsConfig, UserLayoutPreference, Supplier, Purchase, GarageDocument, DocumentHistoryEvent, UserActivityLog, ChangeLogEntry, BackupSnapshotRecord } from './types/garage';
import {
  auth,
  onAuthStateChanged,
  signOut,
  User,
} from './services/firebase';
import {
  subscribeVehicles,
  subscribeGarages,
  createGarage,
  setActiveGarageId as persistActiveGarageId,
  fetchGarageSettingsFromCloud,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  seedDemoGarageData,
} from './services/garageService';
import {
  ensureAndGetUserProfile,
  subscribeFeatureFlags,
  subscribeSystemThemeConfig,
} from './services/adminService';
import {
  applySystemThemeVariables,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_SYSTEM_THEME_CONFIG,
  isSuperAdminUser,
  parseUserLayoutPreference,
  resolveEffectiveLayoutMode,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  USER_LAYOUT_MODE_STORAGE_KEY,
} from './utils/adminUtils';
import {
  DEFAULT_GARAGE_ID,
  filterVehiclesByGarage,
} from './utils/garageUtils';
import {
  subscribeSuppliers,
  subscribePurchases,
  seedDemoSuppliersAndPurchases,
} from './services/supplierService';
import {
  filterSuppliersByGarage,
  filterPurchasesByGarage,
} from './utils/suppliers';
import {
  subscribeDocuments,
  subscribeDocumentHistory,
  seedDemoDocuments,
} from './services/documentService';
import {
  filterDocumentsByGarage,
  filterDocumentHistoryByGarage,
} from './utils/documents';
import {
  logEntityChange,
  logUserActivity,
  subscribeActivityLogs,
  subscribeBackupSnapshots,
  subscribeChangeLogs,
} from './services/auditAndBackupService';
import { computeEntityFieldDiffs, filterAuditLogsByGarage } from './utils/exportBackup';
import { createDemoCerfaVehicle } from './utils/cerfa15776';
import { Loader2 } from 'lucide-react';

export type ActiveAppView = 'desktop' | 'analytics' | 'suppliers' | 'documents' | 'exports' | 'settings' | 'admin';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemThemeConfig>(DEFAULT_SYSTEM_THEME_CONFIG);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsConfig>(DEFAULT_FEATURE_FLAGS);
  const [authReady, setAuthReady] = useState(false);
  const [garages, setGarages] = useState<GarageWorkspace[]>([]);
  const [activeGarageId, setActiveGarageId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [documents, setDocuments] = useState<GarageDocument[]>([]);
  const [documentHistory, setDocumentHistory] = useState<DocumentHistoryEvent[]>([]);
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
  const [backupSnapshots, setBackupSnapshots] = useState<BackupSnapshotRecord[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [activeView, setActiveView] = useState<ActiveAppView>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/admin') {
      return 'admin';
    }
    return 'desktop';
  });

  // Dual-Layout Architecture state (Classic Top-Nav vs Modern Sidebar Layout)
  const [userLayoutPreference, setUserLayoutPreference] = useState<UserLayoutPreference>(() => {
    try {
      return parseUserLayoutPreference(localStorage.getItem(USER_LAYOUT_MODE_STORAGE_KEY));
    } catch {
      return 'global';
    }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const effectiveLayoutMode = useMemo(
    () =>
      resolveEffectiveLayoutMode({
        userPreference: userLayoutPreference,
        systemLayoutMode: systemConfig.layoutMode,
      }),
    [userLayoutPreference, systemConfig.layoutMode]
  );

  const handleLayoutPreferenceChange = (pref: UserLayoutPreference) => {
    setUserLayoutPreference(pref);
    try {
      if (pref === 'global') {
        localStorage.removeItem(USER_LAYOUT_MODE_STORAGE_KEY);
      } else {
        localStorage.setItem(USER_LAYOUT_MODE_STORAGE_KEY, pref);
      }
    } catch {
      // ignore
    }
  };

  const handleToggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Modals state
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isBuyerModalOpen, setIsBuyerModalOpen] = useState(false);
  const [sellingVehicle, setSellingVehicle] = useState<Vehicle | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isQuickAlignerOpen, setIsQuickAlignerOpen] = useState(false);
  const [documentsAlignerMode, setDocumentsAlignerMode] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [cerfaVehicle, setCerfaVehicle] = useState<Vehicle | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('autogarage_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    applySystemThemeVariables(systemConfig, theme);
    try {
      localStorage.setItem('autogarage_theme', theme);
    } catch {
      // ignore
    }
  }, [theme, systemConfig]);

  // Sync /admin URL path
  const handleSetActiveView = (view: ActiveAppView) => {
    if (view !== 'documents') {
      setDocumentsAlignerMode(false);
    }
    setActiveView(view);
    if (typeof window !== 'undefined') {
      const targetPath = view === 'admin' ? '/admin' : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }
  };

  useEffect(() => {
    const onPopState = () => {
      setActiveView(window.location.pathname === '/admin' ? 'admin' : 'desktop');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Subscribe to global system theme config & feature flags
  useEffect(() => {
    const unsubTheme = subscribeSystemThemeConfig((cfg) => {
      setSystemConfig(cfg);
    });
    const unsubFlags = subscribeFeatureFlags((flags) => {
      setFeatureFlags(flags);
    });
    return () => {
      unsubTheme();
      unsubFlags();
    };
  }, []);

  // Enforce multiGarage, expenseAnalytics & dual-layout route transitions
  useEffect(() => {
    if (!featureFlags.multiGarage && !activeGarageId) {
      setActiveGarageId(DEFAULT_GARAGE_ID);
      persistActiveGarageId(DEFAULT_GARAGE_ID);
    }
    if (!featureFlags.expenseAnalytics && activeView === 'analytics') {
      setActiveView('desktop');
    }
  }, [featureFlags.multiGarage, featureFlags.expenseAnalytics, activeGarageId, activeView]);

  // Smoothly transition page views <-> modals when switching Classic <-> Sidebar mode
  useEffect(() => {
    if (effectiveLayoutMode === 'classic') {
      if (activeView === 'settings') {
        setActiveView('desktop');
        setIsSettingsModalOpen(true);
      }
    } else if (effectiveLayoutMode === 'sidebar' && isSettingsModalOpen) {
      setIsSettingsModalOpen(false);
      setActiveView('settings');
    }
  }, [effectiveLayoutMode, activeView, isSettingsModalOpen]);

  // Initialize Auth & RBAC Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      const profile = await ensureAndGetUserProfile(currentUser);
      setUserProfile(profile);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const isSuperAdmin = isSuperAdminUser({
    email: user?.email,
    emailVerified: user?.emailVerified,
    profile: userProfile,
  });

  const handleDevSuperAdminLogin = (profile: UserProfile) => {
    try {
      localStorage.setItem('autogarage_current_user_profile', JSON.stringify(profile));
    } catch {
      // ignore
    }
    setUserProfile(profile);
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('autogarage_current_user_profile');
    } catch {
      // ignore
    }
    setUserProfile(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
    if (activeView === 'admin') {
      handleSetActiveView('desktop');
    }
  };

  const effectiveUserId = user?.uid || 'garage_pro_dealer';

  // Subscribe to garages
  useEffect(() => {
    if (!authReady) return;
    const unsubscribe = subscribeGarages(effectiveUserId, (list) => {
      setGarages(list);
    });
    return () => unsubscribe();
  }, [authReady, effectiveUserId]);

  // Sync activeGarageId with garageService for per-garage Cerfa & Settings isolation
  const handleSelectGarage = (garageId: string | null) => {
    setActiveGarageId(garageId);
    setSelectedVehicle(null);
    persistActiveGarageId(garageId);
    if (garageId && user?.uid) {
      fetchGarageSettingsFromCloud(user.uid, garageId)
        .then((cloudSettings) => {
          if (cloudSettings.layoutMode && !localStorage.getItem(USER_LAYOUT_MODE_STORAGE_KEY)) {
            setUserLayoutPreference(parseUserLayoutPreference(cloudSettings.layoutMode));
          }
        })
        .catch(() => {});
    }
    if (garageId && activeView === 'admin') {
      handleSetActiveView('desktop');
    }
  };

  const handleCreateGarage = async (input: {
    name: string;
    entityType: 'morale' | 'physique';
    city?: string;
    siret?: string;
    taxRegime?: 'sarl' | 'micro' | 'custom' | 'none';
    taxRatePercent?: number;
  }) => {
    const created = await createGarage(effectiveUserId, input);
    handleSelectGarage(created.id);
  };

  // Subscribe to real-time vehicles
  useEffect(() => {
    if (!authReady) return;

    const unsubscribe = subscribeVehicles(effectiveUserId, (data) => {
      setVehicles(data);

      // Keep selected vehicle in sync if updated
      setSelectedVehicle((prev) => {
        if (!prev) return null;
        return data.find((v) => v.id === prev.id) || null;
      });
    });

    return () => unsubscribe();
  }, [authReady, effectiveUserId]);

  // Subscribe to real-time suppliers, purchases, documents & document history
  useEffect(() => {
    if (!authReady) return;
    const unsubSuppliers = subscribeSuppliers(effectiveUserId, setSuppliers);
    const unsubPurchases = subscribePurchases(effectiveUserId, setPurchases);
    const unsubDocuments = subscribeDocuments(effectiveUserId, setDocuments);
    const unsubDocHistory = subscribeDocumentHistory(effectiveUserId, setDocumentHistory);
    const unsubActivity = subscribeActivityLogs(effectiveUserId, setActivityLogs);
    const unsubChanges = subscribeChangeLogs(effectiveUserId, setChangeLogs);
    const unsubSnapshots = subscribeBackupSnapshots(effectiveUserId, setBackupSnapshots);
    return () => {
      unsubSuppliers();
      unsubPurchases();
      unsubDocuments();
      unsubDocHistory();
      unsubActivity();
      unsubChanges();
      unsubSnapshots();
    };
  }, [authReady, effectiveUserId]);

  // Strictly isolated vehicles for the active garage
  const garageVehicles = useMemo(() => {
    if (!activeGarageId) return [];
    return filterVehiclesByGarage(vehicles, activeGarageId);
  }, [vehicles, activeGarageId]);

  const garageSuppliers = useMemo(
    () => filterSuppliersByGarage(suppliers, activeGarageId),
    [suppliers, activeGarageId]
  );

  const garagePurchases = useMemo(
    () => filterPurchasesByGarage(purchases, activeGarageId),
    [purchases, activeGarageId]
  );

  const garageDocuments = useMemo(
    () => filterDocumentsByGarage(documents, activeGarageId),
    [documents, activeGarageId]
  );

  const garageDocumentHistory = useMemo(
    () => filterDocumentHistoryByGarage(documentHistory, activeGarageId),
    [documentHistory, activeGarageId]
  );

  const garageActivityLogs = useMemo(
    () => filterAuditLogsByGarage(activityLogs, activeGarageId),
    [activityLogs, activeGarageId]
  );

  const garageChangeLogs = useMemo(
    () => filterAuditLogsByGarage(changeLogs, activeGarageId),
    [changeLogs, activeGarageId]
  );

  const garageBackupSnapshots = useMemo(
    () => filterAuditLogsByGarage(backupSnapshots, activeGarageId),
    [backupSnapshots, activeGarageId]
  );

  const handleSeedSuppliers = async () => {
    const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
    let scopedVehicles = activeGarageId ? garageVehicles : vehicles;
    if (scopedVehicles.length === 0) {
      scopedVehicles = await seedDemoGarageData(effectiveUserId, targetGarageId);
    }
    await seedDemoSuppliersAndPurchases(
      effectiveUserId,
      targetGarageId,
      scopedVehicles
    );
  };

  const handleSeedDocuments = async () => {
    const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
    let scopedVehicles = activeGarageId ? garageVehicles : vehicles;
    if (scopedVehicles.length === 0) {
      scopedVehicles = await seedDemoGarageData(effectiveUserId, targetGarageId);
    }
    await seedDemoDocuments(
      effectiveUserId,
      targetGarageId,
      scopedVehicles,
      userProfile?.email || user?.email || undefined
    );
  };

  // Seed demo data handler (scoped to active garage)
  const handleSeedData = async () => {
    try {
      setIsSeeding(true);
      const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
      const seededVehicles = await seedDemoGarageData(effectiveUserId, targetGarageId);
      if (garageSuppliers.length === 0) {
        await seedDemoSuppliersAndPurchases(
          effectiveUserId,
          targetGarageId,
          seededVehicles
        );
      }
      if (garageDocuments.length === 0) {
        await seedDemoDocuments(
          effectiveUserId,
          targetGarageId,
          seededVehicles,
          userProfile?.email || user?.email || undefined
        );
      }
    } catch (err) {
      console.error('Seed demo error:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  // Quick status change
  const handleQuickStatusChange = async (vehicleId: string, newStatus: VehicleStatus) => {
    const prev = vehicles.find((v) => v.id === vehicleId);
    await updateVehicle(vehicleId, { status: newStatus });
    if (prev && prev.status !== newStatus) {
      const actor = userProfile?.email || user?.email || null;
      const label = `${prev.make} ${prev.model} (${prev.registrationNumber || prev.vin})`;
      void logUserActivity({
        userId: effectiveUserId,
        garageId: prev.garageId || activeGarageId,
        actorEmail: actor,
        action: 'vehicle_updated',
        entityType: 'vehicle',
        entityId: vehicleId,
        targetLabel: label,
        details: `Statut: ${prev.status} → ${newStatus}`,
      });
      void logEntityChange({
        userId: effectiveUserId,
        garageId: prev.garageId || activeGarageId,
        actorEmail: actor,
        operation: 'update',
        entityType: 'vehicle',
        entityId: vehicleId,
        entityLabel: label,
        changes: [{ field: 'status', oldValue: prev.status, newValue: newStatus }],
      });
    }
  };

  // Open sell modal
  const handleOpenSellModal = (vehicle: Vehicle) => {
    setSellingVehicle(vehicle);
    setIsBuyerModalOpen(true);
  };

  // Confirm sale
  const handleConfirmSale = async (vehicleId: string, buyerInfo: BuyerInfo) => {
    const targetVehicle = vehicles.find((v) => v.id === vehicleId);
    if (!targetVehicle) return;

    const netProfit = Number(buyerInfo.salePrice) - (targetVehicle.totalInvested || 0);
    const marginPercentage =
      Number(buyerInfo.salePrice) > 0 ? (netProfit / Number(buyerInfo.salePrice)) * 100 : 0;

    await updateVehicle(vehicleId, {
      status: 'sold',
      buyerInfo,
      netProfit,
      marginPercentage,
    });

    const actor = userProfile?.email || user?.email || null;
    const label = `${targetVehicle.make} ${targetVehicle.model} (${targetVehicle.registrationNumber || targetVehicle.vin})`;
    void logUserActivity({
      userId: effectiveUserId,
      garageId: targetVehicle.garageId || activeGarageId,
      actorEmail: actor,
      action: 'vehicle_sold',
      entityType: 'vehicle',
      entityId: vehicleId,
      targetLabel: label,
      details: `${buyerInfo.fullName} · ${buyerInfo.salePrice} €`,
    });
    void logEntityChange({
      userId: effectiveUserId,
      garageId: targetVehicle.garageId || activeGarageId,
      actorEmail: actor,
      operation: 'update',
      entityType: 'vehicle',
      entityId: vehicleId,
      entityLabel: label,
      changes: [
        { field: 'status', oldValue: targetVehicle.status, newValue: 'sold' },
        { field: 'salePrice', oldValue: String(targetVehicle.buyerInfo?.salePrice || '—'), newValue: String(buyerInfo.salePrice) },
        { field: 'buyer', oldValue: targetVehicle.buyerInfo?.fullName || '—', newValue: buyerInfo.fullName },
      ],
    });
  };

  // Create or Update vehicle
  const handleSaveVehicle = async (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => {
    const actor = userProfile?.email || user?.email || null;
    if (editingVehicle) {
      await updateVehicle(editingVehicle.id, data);
      const label = `${data.make} ${data.model} (${data.registrationNumber || data.vin})`;
      const diffs = computeEntityFieldDiffs(
        editingVehicle as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
        ['make', 'model', 'trim', 'year', 'mileage', 'vin', 'registrationNumber', 'purchasePrice', 'targetSalePrice', 'status']
      );
      void logUserActivity({
        userId: effectiveUserId,
        garageId: editingVehicle.garageId || activeGarageId,
        actorEmail: actor,
        action: 'vehicle_updated',
        entityType: 'vehicle',
        entityId: editingVehicle.id,
        targetLabel: label,
        details: `${diffs.length} champ(s) modifié(s)`,
      });
      if (diffs.length > 0) {
        void logEntityChange({
          userId: effectiveUserId,
          garageId: editingVehicle.garageId || activeGarageId,
          actorEmail: actor,
          operation: 'update',
          entityType: 'vehicle',
          entityId: editingVehicle.id,
          entityLabel: label,
          changes: diffs,
        });
      }
      setEditingVehicle(null);
    } else {
      const targetGarage = activeGarageId || DEFAULT_GARAGE_ID;
      const newId = await createVehicle({
        ...data,
        garageId: targetGarage,
      });
      const label = `${data.make} ${data.model} (${data.registrationNumber || data.vin || 'Nouveau'})`;
      if (newId) {
        void logUserActivity({
          userId: effectiveUserId,
          garageId: targetGarage,
          actorEmail: actor,
          action: 'vehicle_created',
          entityType: 'vehicle',
          entityId: newId,
          targetLabel: label,
          details: `${data.year} · ${data.purchasePrice} €`,
        });
        void logEntityChange({
          userId: effectiveUserId,
          garageId: targetGarage,
          actorEmail: actor,
          operation: 'create',
          entityType: 'vehicle',
          entityId: newId,
          entityLabel: label,
          changes: [
            { field: 'make', oldValue: '—', newValue: data.make },
            { field: 'model', oldValue: '—', newValue: data.model },
            { field: 'purchasePrice', oldValue: '—', newValue: `${data.purchasePrice} €` },
          ],
        });
      }
      const created = vehicles.find((v) => v.id === newId);
      if (created) setSelectedVehicle(created);
    }
  };

  // Delete vehicle
  const handleDeleteVehicle = async (vehicleId: string) => {
    const prev = vehicles.find((v) => v.id === vehicleId);
    await deleteVehicle(vehicleId);
    if (prev) {
      const actor = userProfile?.email || user?.email || null;
      const label = `${prev.make} ${prev.model} (${prev.registrationNumber || prev.vin})`;
      void logUserActivity({
        userId: effectiveUserId,
        garageId: prev.garageId || activeGarageId,
        actorEmail: actor,
        action: 'vehicle_deleted',
        entityType: 'vehicle',
        entityId: vehicleId,
        targetLabel: label,
      });
      void logEntityChange({
        userId: effectiveUserId,
        garageId: prev.garageId || activeGarageId,
        actorEmail: actor,
        operation: 'delete',
        entityType: 'vehicle',
        entityId: vehicleId,
        entityLabel: label,
        changes: [{ field: 'status', oldValue: prev.status, newValue: 'deleted' }],
      });
    }
    setSelectedVehicle(null);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center text-[var(--foreground)] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
        <p className="text-sm font-semibold text-[var(--muted-foreground)]">
          Initialisation sécurisée d'AutoGarage Manager...
        </p>
      </div>
    );
  }

  const handleSidebarNavigate = (target: SidebarNavTarget) => {
    if (target === 'inventory') {
      setSelectedVehicle(null);
      handleSetActiveView('desktop');
    } else if (target === 'analytics') {
      handleSetActiveView('analytics');
    } else if (target === 'suppliers') {
      handleSetActiveView('suppliers');
    } else if (target === 'documents') {
      setDocumentsAlignerMode(false);
      handleSetActiveView('documents');
    } else if (target === 'exports') {
      handleSetActiveView('exports');
    } else if (target === 'settings') {
      handleSetActiveView('settings');
    } else if (target === 'admin') {
      handleSetActiveView('admin');
    }
  };

  return (
    <div
      data-layout-mode={effectiveLayoutMode}
      className={`min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans selection:bg-[var(--primary)] selection:text-[var(--primary-foreground)] ${
        effectiveLayoutMode === 'sidebar' ? 'flex' : 'flex flex-col'
      }`}
    >
      {/* Left Collapsible Sidebar & Mobile Drawer (Modern Sidebar Layout) */}
      {effectiveLayoutMode === 'sidebar' && (
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapse}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          activeView={activeView}
          onNavigate={handleSidebarNavigate}
          garages={garages}
          activeGarageId={activeGarageId}
          onSelectGarage={handleSelectGarage}
          featureFlags={featureFlags}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {/* Workspace Column (Top Header + Main Container) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Navbar (Classic Full Top-Nav OR Minimal Header in Sidebar Layout) */}
        <Navbar
          vehicles={vehicles}
          user={user}
          activeView={activeView}
          setActiveView={handleSetActiveView}
          onNewVehicle={() => {
            setEditingVehicle(null);
            setIsVehicleModalOpen(true);
          }}
          onSeedData={handleSeedData}
          isSeeding={isSeeding}
          onOpenSettings={() =>
            effectiveLayoutMode === 'sidebar'
              ? handleSetActiveView('settings')
              : setIsSettingsModalOpen(true)
          }
          theme={theme}
          onThemeChange={setTheme}
          isSuperAdmin={isSuperAdmin}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onSignOut={handleSignOut}
          activeSessionEmail={userProfile?.email || null}
          garages={garages}
          activeGarageId={activeGarageId}
          onSelectGarage={handleSelectGarage}
          featureFlags={featureFlags}
          layoutMode={effectiveLayoutMode}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          selectedVehicleLabel={
            selectedVehicle
              ? `${selectedVehicle.make} ${selectedVehicle.model}`
              : null
          }
        />

        {/* Main App Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeView === 'admin' ? (
            <AdminPanel
              isSuperAdmin={isSuperAdmin}
              currentUserUid={user?.uid || userProfile?.uid}
              systemConfig={systemConfig}
              theme={theme}
              onThemeChange={setTheme}
              onBackToApp={() => handleSetActiveView('desktop')}
              onSignIn={() => setIsAuthModalOpen(true)}
              onOpenAlignerMode={() => {
                if (effectiveLayoutMode === 'sidebar' && featureFlags.cerfaGenerator) {
                  setDocumentsAlignerMode(true);
                  handleSetActiveView('documents');
                } else {
                  setIsQuickAlignerOpen(true);
                }
              }}
              onGlobalLayoutChanged={() => handleLayoutPreferenceChange('global')}
            />
          ) : activeView === 'analytics' && featureFlags.expenseAnalytics ? (
            <AnalyticsView
              vehicles={activeGarageId ? garageVehicles : vehicles}
              featureFlags={featureFlags}
              onSelectVehicle={(v) => {
                setSelectedVehicle(v);
                handleSetActiveView('desktop');
              }}
            />
          ) : activeView === 'suppliers' ? (
            <SuppliersView
              vehicles={activeGarageId ? garageVehicles : vehicles}
              suppliers={garageSuppliers}
              purchases={garagePurchases}
              userId={effectiveUserId}
              activeGarageId={activeGarageId}
              onSelectVehicle={(v) => {
                setSelectedVehicle(v);
                handleSetActiveView('desktop');
              }}
              onSeedSuppliers={handleSeedSuppliers}
            />
          ) : activeView === 'documents' ? (
            documentsAlignerMode && featureFlags.cerfaGenerator ? (
              <Cerfa15776Modal
                variant="page"
                isOpen={true}
                onClose={() => {
                  setDocumentsAlignerMode(false);
                  handleSetActiveView('desktop');
                }}
                vehicle={
                  selectedVehicle ||
                  garageVehicles[0] ||
                  vehicles[0] ||
                  createDemoCerfaVehicle(effectiveUserId)
                }
                vehicles={garageVehicles.length > 0 ? garageVehicles : vehicles}
                userId={effectiveUserId}
                initialAlignerMode={true}
                onSaveVehicleFields={async (vehicleId, patch) => {
                  await updateVehicle(vehicleId, patch);
                }}
              />
            ) : (
              <DocumentsView
                vehicles={activeGarageId ? garageVehicles : vehicles}
                purchases={garagePurchases}
                documents={garageDocuments}
                historyEvents={garageDocumentHistory}
                userId={effectiveUserId}
                userEmail={userProfile?.email || user?.email || null}
                activeGarageId={activeGarageId}
                onSelectVehicle={(v) => {
                  setSelectedVehicle(v);
                  handleSetActiveView('desktop');
                }}
                onSeedDocuments={handleSeedDocuments}
                onOpenCerfaGenerator={
                  featureFlags.cerfaGenerator
                    ? (v) =>
                        setCerfaVehicle(
                          v ||
                            garageVehicles[0] ||
                            vehicles[0] ||
                            createDemoCerfaVehicle(effectiveUserId)
                        )
                    : undefined
                }
              />
            )
          ) : activeView === 'exports' ? (
            <ExportsBackupView
              vehicles={activeGarageId ? garageVehicles : vehicles}
              suppliers={garageSuppliers}
              purchases={garagePurchases}
              documents={garageDocuments}
              documentHistory={garageDocumentHistory}
              activityLogs={garageActivityLogs}
              changeLogs={garageChangeLogs}
              backupSnapshots={garageBackupSnapshots}
              userId={effectiveUserId}
              userEmail={userProfile?.email || user?.email || null}
              activeGarageId={activeGarageId}
              onNavigateSettings={() =>
                effectiveLayoutMode === 'sidebar'
                  ? handleSetActiveView('settings')
                  : setIsSettingsModalOpen(true)
              }
            />
          ) : activeView === 'settings' && effectiveLayoutMode === 'sidebar' ? (
            <Settings
              key={activeGarageId || DEFAULT_GARAGE_ID}
              variant="page"
              isOpen={true}
              onClose={() => handleSetActiveView('desktop')}
              userId={effectiveUserId}
              vehicles={garageVehicles}
              theme={theme}
              onThemeChange={setTheme}
              onOpenAlignerMode={() => {
                if (featureFlags.cerfaGenerator) {
                  setDocumentsAlignerMode(true);
                  handleSetActiveView('documents');
                } else {
                  setIsQuickAlignerOpen(true);
                }
              }}
              userEmail={userProfile?.email || user?.email || null}
              userRole={isSuperAdmin ? 'superadmin' : (userProfile?.role || 'user')}
              layoutPreference={userLayoutPreference}
              effectiveLayoutMode={effectiveLayoutMode}
              globalLayoutMode={systemConfig.layoutMode || 'classic'}
              onLayoutPreferenceChange={handleLayoutPreferenceChange}
            />
          ) : featureFlags.multiGarage && !activeGarageId ? (
            <GarageSelector
              garages={garages}
              allVehicles={vehicles}
              onSelectGarage={handleSelectGarage}
              onCreateGarage={handleCreateGarage}
            />
          ) : selectedVehicle ? (
            <VehicleDetail
              vehicle={selectedVehicle}
              onBack={() => setSelectedVehicle(null)}
              onOpenEdit={(v) => {
                setEditingVehicle(v);
                setIsVehicleModalOpen(true);
              }}
              onOpenSellModal={handleOpenSellModal}
              onDeleteVehicle={handleDeleteVehicle}
              userId={effectiveUserId}
              featureFlags={featureFlags}
            />
          ) : (
            <VehicleList
              vehicles={garageVehicles}
              onSelectVehicle={(v) => setSelectedVehicle(v)}
              onNewVehicle={() => {
                setEditingVehicle(null);
                setIsVehicleModalOpen(true);
              }}
              onQuickStatusChange={handleQuickStatusChange}
              onOpenSellModal={handleOpenSellModal}
              onOpenCerfa={featureFlags.cerfaGenerator ? (v) => setCerfaVehicle(v) : undefined}
              onSeedData={handleSeedData}
              isSeeding={isSeeding}
              featureFlags={featureFlags}
            />
          )}
        </main>
      </div>

      {/* Vehicle Add / Edit Modal */}
      <VehicleModal
        isOpen={isVehicleModalOpen}
        onClose={() => {
          setIsVehicleModalOpen(false);
          setEditingVehicle(null);
        }}
        onSubmit={handleSaveVehicle}
        initialVehicle={editingVehicle}
        userId={effectiveUserId}
      />

      {/* Buyer Info & Sale Closing Modal */}
      <BuyerModal
        isOpen={isBuyerModalOpen}
        onClose={() => {
          setIsBuyerModalOpen(false);
          setSellingVehicle(null);
        }}
        vehicle={sellingVehicle}
        onConfirmSale={handleConfirmSale}
      />

      {/* Settings Module (Modal in Classic mode; Page in Sidebar mode) */}
      {effectiveLayoutMode === 'classic' && (
        <Settings
          key={activeGarageId || DEFAULT_GARAGE_ID}
          variant="modal"
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          userId={effectiveUserId}
          vehicles={garageVehicles}
          theme={theme}
          onThemeChange={setTheme}
          onOpenAlignerMode={() => setIsQuickAlignerOpen(true)}
          userEmail={userProfile?.email || user?.email || null}
          userRole={isSuperAdmin ? 'superadmin' : (userProfile?.role || 'user')}
          layoutPreference={userLayoutPreference}
          effectiveLayoutMode={effectiveLayoutMode}
          globalLayoutMode={systemConfig.layoutMode || 'classic'}
          onLayoutPreferenceChange={handleLayoutPreferenceChange}
        />
      )}

      {/* Quick Aligner Mode triggered from Settings -> Document Templates (Classic mode) */}
      <Cerfa15776Modal
        isOpen={isQuickAlignerOpen}
        onClose={() => setIsQuickAlignerOpen(false)}
        vehicle={selectedVehicle || vehicles[0] || createDemoCerfaVehicle(effectiveUserId)}
        initialAlignerMode={true}
      />

      {/* Quick Cerfa 15776*02 Modal from List View */}
      {cerfaVehicle && (
        <Cerfa15776Modal
          isOpen={true}
          onClose={() => setCerfaVehicle(null)}
          vehicle={cerfaVehicle}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onDevSuperAdminLogin={handleDevSuperAdminLogin}
      />
    </div>
  );
}
