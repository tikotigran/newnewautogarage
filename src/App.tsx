import React, { useState, useEffect, useMemo } from 'react';
import {
  Navbar,
} from './components/Navbar';
import { VehicleList } from './components/VehicleList';
import { VehicleDetail } from './components/VehicleDetail';
import { VehicleModal } from './components/VehicleModal';
import { BuyerModal } from './components/BuyerModal';
import { Settings } from './components/Settings';
import { Cerfa15776Modal } from './components/Cerfa15776Modal';
import { MobileSimulator } from './components/MobileSimulator';
import { AnalyticsView } from './components/AnalyticsView';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';
import { GarageSelector } from './components/GarageSelector';
import { Vehicle, VehicleStatus, BuyerInfo, UserProfile, SystemThemeConfig, GarageWorkspace, FeatureFlagsConfig } from './types/garage';
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
} from './utils/adminUtils';
import {
  DEFAULT_GARAGE_ID,
  filterVehiclesByGarage,
} from './utils/garageUtils';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemThemeConfig>(DEFAULT_SYSTEM_THEME_CONFIG);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsConfig>(DEFAULT_FEATURE_FLAGS);
  const [authReady, setAuthReady] = useState(false);
  const [garages, setGarages] = useState<GarageWorkspace[]>([]);
  const [activeGarageId, setActiveGarageId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [activeView, setActiveView] = useState<'desktop' | 'analytics' | 'mobile' | 'admin'>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/admin') {
      return 'admin';
    }
    return 'desktop';
  });

  // Modals state
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isBuyerModalOpen, setIsBuyerModalOpen] = useState(false);
  const [sellingVehicle, setSellingVehicle] = useState<Vehicle | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isQuickAlignerOpen, setIsQuickAlignerOpen] = useState(false);
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
  const handleSetActiveView = (view: 'desktop' | 'analytics' | 'mobile' | 'admin') => {
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

  // Enforce multiGarage & expenseAnalytics feature flags
  useEffect(() => {
    if (!featureFlags.multiGarage && !activeGarageId) {
      setActiveGarageId(DEFAULT_GARAGE_ID);
      persistActiveGarageId(DEFAULT_GARAGE_ID);
    }
    if (!featureFlags.expenseAnalytics && activeView === 'analytics') {
      setActiveView('desktop');
    }
  }, [featureFlags.multiGarage, featureFlags.expenseAnalytics, activeGarageId, activeView]);

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
      fetchGarageSettingsFromCloud(user.uid, garageId).catch(() => {});
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

  // Strictly isolated vehicles for the active garage
  const garageVehicles = useMemo(() => {
    if (!activeGarageId) return [];
    return filterVehiclesByGarage(vehicles, activeGarageId);
  }, [vehicles, activeGarageId]);

  // Seed demo data handler (scoped to active garage)
  const handleSeedData = async () => {
    try {
      setIsSeeding(true);
      await seedDemoGarageData(effectiveUserId, activeGarageId || DEFAULT_GARAGE_ID);
    } catch (err) {
      console.error('Seed demo error:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  // Quick status change
  const handleQuickStatusChange = async (vehicleId: string, newStatus: VehicleStatus) => {
    await updateVehicle(vehicleId, { status: newStatus });
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
  };

  // Create or Update vehicle
  const handleSaveVehicle = async (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingVehicle) {
      await updateVehicle(editingVehicle.id, data);
      setEditingVehicle(null);
    } else {
      const newId = await createVehicle({
        ...data,
        garageId: activeGarageId || DEFAULT_GARAGE_ID,
      });
      const created = vehicles.find((v) => v.id === newId);
      if (created) setSelectedVehicle(created);
    }
  };

  // Delete vehicle
  const handleDeleteVehicle = async (vehicleId: string) => {
    await deleteVehicle(vehicleId);
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

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col font-sans selection:bg-[var(--primary)] selection:text-[var(--primary-foreground)]">
      {/* Top Navbar */}
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
        onOpenSettings={() => setIsSettingsModalOpen(true)}
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
            onOpenAlignerMode={() => setIsQuickAlignerOpen(true)}
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
        ) : featureFlags.multiGarage && !activeGarageId ? (
          <GarageSelector
            garages={garages}
            allVehicles={vehicles}
            onSelectGarage={handleSelectGarage}
            onCreateGarage={handleCreateGarage}
          />
        ) : isSuperAdmin && activeView === 'mobile' ? (
          <MobileSimulator
            vehicles={garageVehicles}
            userId={effectiveUserId}
            onOpenVehicleModal={() => {
              setEditingVehicle(null);
              setIsVehicleModalOpen(true);
            }}
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

      {/* Settings Module (keyed by activeGarageId for strict profile isolation) */}
      <Settings
        key={activeGarageId || DEFAULT_GARAGE_ID}
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        userId={effectiveUserId}
        vehicles={garageVehicles}
        theme={theme}
        onThemeChange={setTheme}
        onOpenAlignerMode={() => setIsQuickAlignerOpen(true)}
        userEmail={userProfile?.email || user?.email || null}
        userRole={isSuperAdmin ? 'superadmin' : (userProfile?.role || 'user')}
      />

      {/* Quick Aligner Mode triggered from Settings -> Document Templates */}
      <Cerfa15776Modal
        isOpen={isQuickAlignerOpen}
        onClose={() => setIsQuickAlignerOpen(false)}
        vehicle={
          selectedVehicle ||
          vehicles[0] || {
            id: 'demo_aligner',
            userId: effectiveUserId,
            make: 'Volkswagen',
            model: 'Golf VII',
            trim: '1.6 TDI 115ch',
            year: 2019,
            mileage: 94000,
            vin: 'WVWZZZAUZKP512984',
            purchaseDate: '2026-08-10',
            purchasePrice: 10400,
            targetSalePrice: 13990,
            status: 'for_sale',
            photos: [],
            documents: [],
            repairCostTotal: 0,
            generalExpensesTotal: 0,
            totalExpenses: 0,
            totalInvested: 10400,
            netProfit: 3590,
            marginPercentage: 25.66,
            createdAt: '',
            updatedAt: '',
          }
        }
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
