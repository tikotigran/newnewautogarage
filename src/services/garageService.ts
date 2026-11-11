import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Vehicle, RepairTask, GeneralExpense, GarageSettings, GarageWorkspace } from '../types/garage';
import { calculateVehicleFinancials } from '../utils/finance';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';

// Helper to generate IDs
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Real-time Vehicles Subscription
 */
const LOCAL_STORAGE_KEY = 'autogarage_vehicles_store';
const LOCAL_REPAIRS_KEY = 'autogarage_repairs_store';
const LOCAL_EXPENSES_KEY = 'autogarage_expenses_store';
const LOCAL_SETTINGS_KEY = 'autogarage_settings_store';
const LOCAL_GARAGES_KEY = 'autogarage_garages_store';
const ACTIVE_GARAGE_ID_KEY = 'autogarage_active_garage_id';

export function getActiveGarageId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_GARAGE_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveGarageId(garageId: string | null): void {
  try {
    if (garageId) {
      localStorage.setItem(ACTIVE_GARAGE_ID_KEY, garageId);
    } else {
      localStorage.removeItem(ACTIVE_GARAGE_ID_KEY);
    }
    window.dispatchEvent(new Event('autogarage_settings_updated'));
  } catch {
    // ignore
  }
}

export const DEFAULT_GARAGE_SETTINGS: GarageSettings = {
  entityType: 'morale',
  name: 'AutoGarage Manager SARL',
  lastName: '',
  firstName: '',
  sex: '',
  siret: '894 123 456 00012',
  streetNumber: '12',
  streetExtension: '',
  streetType: 'Rue',
  streetName: 'de l’Industrie',
  postalCode: '75011',
  city: 'Paris',
  phone: '01 45 88 90 00',
  email: 'contact@autogarage.fr',
  legalForm: 'SARL au capital de 10 000 €',
  tvaMention: 'Régime particulier - TVA sur la marge (Art. 297 A du CGI)',
  defaultCerfaTemplate: 'cerfa_15776_02',
  theme: 'dark',
  taxRegime: 'sarl',
  taxRatePercent: 15,
};

export function getGarageSettings(garageIdOverride?: string): GarageSettings {
  const targetId = garageIdOverride || getActiveGarageId() || DEFAULT_GARAGE_ID;
  try {
    const scopedRaw = localStorage.getItem(`${LOCAL_SETTINGS_KEY}_${targetId}`);
    if (scopedRaw) {
      return { ...DEFAULT_GARAGE_SETTINGS, garageId: targetId, ...JSON.parse(scopedRaw) };
    }
    if (targetId === DEFAULT_GARAGE_ID) {
      const legacyRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (legacyRaw) {
        return { ...DEFAULT_GARAGE_SETTINGS, garageId: targetId, ...JSON.parse(legacyRaw) };
      }
    }
    // Check if garage workspace has a name/entityType
    const garages = getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY);
    const match = garages.find((g) => g.id === targetId);
    if (match) {
      return {
        ...DEFAULT_GARAGE_SETTINGS,
        garageId: targetId,
        name: match.name,
        entityType: match.entityType,
        city: match.city || DEFAULT_GARAGE_SETTINGS.city,
        siret: match.siret || (match.entityType === 'physique' ? '' : DEFAULT_GARAGE_SETTINGS.siret),
      };
    }
    return { ...DEFAULT_GARAGE_SETTINGS, garageId: targetId };
  } catch {
    return { ...DEFAULT_GARAGE_SETTINGS, garageId: targetId };
  }
}

export async function saveGarageSettings(
  settings: GarageSettings,
  userId?: string,
  garageIdOverride?: string
): Promise<void> {
  const targetId = garageIdOverride || settings.garageId || getActiveGarageId() || DEFAULT_GARAGE_ID;
  const scopedSettings: GarageSettings = { ...settings, garageId: targetId };
  try {
    localStorage.setItem(`${LOCAL_SETTINGS_KEY}_${targetId}`, JSON.stringify(scopedSettings));
    if (targetId === DEFAULT_GARAGE_ID) {
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(scopedSettings));
    }
    window.dispatchEvent(new Event('autogarage_settings_updated'));
    // Keep workspace metadata in sync
    const garages = getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY);
    if (garages.some((g) => g.id === targetId)) {
      const displayName =
        scopedSettings.entityType === 'physique'
          ? `${scopedSettings.firstName || ''} ${scopedSettings.lastName || ''}`.trim() || scopedSettings.name
          : scopedSettings.name;
      const updatedGarages = garages.map((g) =>
        g.id === targetId
          ? {
              ...g,
              name: displayName || g.name,
              entityType: scopedSettings.entityType || g.entityType,
              city: scopedSettings.city || g.city,
              siret: scopedSettings.siret || g.siret,
              updatedAt: new Date().toISOString(),
            }
          : g
      );
      setLocalStore(LOCAL_GARAGES_KEY, updatedGarages);
    }
    window.dispatchEvent(new Event('autogarage_settings_updated'));
    if (auth.currentUser && userId) {
      await setDoc(doc(db, 'settings', `${userId}_${targetId}`), scopedSettings, { merge: true });
    }
  } catch (err) {
    console.warn('saveGarageSettings warning:', err);
  }
}

export function exportGarageDatabase(vehiclesOverride?: Vehicle[]) {
  const vehicles = vehiclesOverride && vehiclesOverride.length > 0
    ? vehiclesOverride
    : getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
  const repairs = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY);
  const expenses = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY);
  const settings = getGarageSettings();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    vehicles,
    repairs,
    expenses,
    settings,
  };
}

export async function importGarageDatabase(
  payload: {
    vehicles: Vehicle[];
    repairs: RepairTask[];
    expenses: GeneralExpense[];
    settings: GarageSettings;
  },
  userId?: string
): Promise<void> {
  setLocalStore(LOCAL_STORAGE_KEY, payload.vehicles || []);
  setLocalStore(LOCAL_REPAIRS_KEY, payload.repairs || []);
  setLocalStore(LOCAL_EXPENSES_KEY, payload.expenses || []);
  await saveGarageSettings({ ...DEFAULT_GARAGE_SETTINGS, ...payload.settings }, userId);

  if (auth.currentUser && userId) {
    for (const v of payload.vehicles || []) {
      await setDoc(doc(db, 'vehicles', v.id), { ...v, userId }, { merge: true });
    }
  }
}

export function clearLocalGarageCache(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LOCAL_REPAIRS_KEY);
    localStorage.removeItem(LOCAL_EXPENSES_KEY);
    localStorage.removeItem(LOCAL_SETTINGS_KEY);
    window.dispatchEvent(new Event('autogarage_store_updated'));
    window.dispatchEvent(new Event('autogarage_settings_updated'));
  } catch (err) {
    console.warn('clearLocalGarageCache warning:', err);
  }
}

function getLocalStore<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalStore<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event('autogarage_store_updated'));
  } catch (e) {
    console.warn('localStorage write error:', e);
  }
}

export function subscribeGarages(
  userId: string,
  onData: (garages: GarageWorkspace[]) => void
): () => void {
  const ensureDefault = (list: GarageWorkspace[]): GarageWorkspace[] => {
    if (list.length > 0) return list;
    const now = new Date().toISOString();
    const legacySettingsRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    const legacySettings = legacySettingsRaw ? (JSON.parse(legacySettingsRaw) as GarageSettings) : null;
    const defaultGarage: GarageWorkspace = {
      id: DEFAULT_GARAGE_ID,
      userId,
      name: legacySettings?.name || DEFAULT_GARAGE_SETTINGS.name,
      entityType: legacySettings?.entityType || 'morale',
      city: legacySettings?.city || DEFAULT_GARAGE_SETTINGS.city,
      siret: legacySettings?.siret || DEFAULT_GARAGE_SETTINGS.siret,
      createdAt: now,
      updatedAt: now,
    };
    setLocalStore(LOCAL_GARAGES_KEY, [defaultGarage]);
    return [defaultGarage];
  };

  if (auth.currentUser) {
    const q = query(collection(db, 'garages'), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: GarageWorkspace[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as GarageWorkspace), id: docSnap.id });
        });
        if (list.length === 0) {
          onData(ensureDefault(getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY)));
        } else {
          onData(list);
        }
      },
      () => {
        onData(ensureDefault(getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY)));
      }
    );
  }

  const emitLocal = () => {
    const list = ensureDefault(getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY));
    onData(list);
  };
  emitLocal();
  window.addEventListener('autogarage_store_updated', emitLocal);
  return () => window.removeEventListener('autogarage_store_updated', emitLocal);
}

export async function createGarage(
  userId: string,
  input: {
    name: string;
    entityType: 'morale' | 'physique';
    city?: string;
    siret?: string;
  }
): Promise<GarageWorkspace> {
  const id = generateId('garage');
  const now = new Date().toISOString();
  const newGarage: GarageWorkspace = {
    id,
    userId,
    name: input.name.trim(),
    entityType: input.entityType,
    city: input.city?.trim() || '',
    siret: input.entityType === 'morale' ? input.siret?.trim() || '' : '',
    createdAt: now,
    updatedAt: now,
  };

  const existing = getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY);
  setLocalStore(LOCAL_GARAGES_KEY, [...existing, newGarage]);

  await saveGarageSettings(
    {
      ...DEFAULT_GARAGE_SETTINGS,
      garageId: id,
      entityType: input.entityType,
      name: newGarage.name,
      city: newGarage.city || '',
      siret: newGarage.siret || '',
      lastName: input.entityType === 'physique' ? newGarage.name : '',
      firstName: '',
    },
    userId,
    id
  );

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'garages', id), newGarage);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `garages/${id}`);
    }
  }

  return newGarage;
}

export function subscribeVehicles(
  userId: string,
  onData: (vehicles: Vehicle[]) => void,
  onError?: (err: unknown) => void
) {
  // If user is logged into Firebase, listen to real Firestore collection
  if (auth.currentUser) {
    const collectionPath = 'vehicles';
    const q = query(
      collection(db, collectionPath),
      where('userId', '==', userId)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const vehicles: Vehicle[] = [];
        snapshot.forEach((docSnap) => {
          vehicles.push({ ...(docSnap.data() as Vehicle), id: docSnap.id });
        });
        vehicles.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        onData(vehicles);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, collectionPath);
      }
    );
  }

  // Local storage listener for immediate offline/guest exploration
  const emitLocal = () => {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    onData(list);
  };

  emitLocal();
  const listener = () => emitLocal();
  window.addEventListener('autogarage_store_updated', listener);
  return () => window.removeEventListener('autogarage_store_updated', listener);
}

/**
 * Create Vehicle
 */
export async function createVehicle(
  vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateId('veh');
  const now = new Date().toISOString();
  const path = `vehicles/${id}`;

  const financials = calculateVehicleFinancials({
    purchasePrice: vehicle.purchasePrice,
    targetSalePrice: vehicle.targetSalePrice,
    finalSalePrice: vehicle.buyerInfo?.salePrice,
    repairs: [],
    expenses: [],
  });

  const newVehicle: Vehicle = {
    ...vehicle,
    id,
    repairCostTotal: financials.repairCostTotal,
    generalExpensesTotal: financials.generalExpensesTotal,
    totalExpenses: financials.totalExpenses,
    totalInvested: financials.totalInvested,
    netProfit: financials.netProfit,
    marginPercentage: financials.marginPercentage,
    photos: vehicle.photos || [],
    documents: vehicle.documents || [],
    createdAt: now,
    updatedAt: now,
  };

  if (!auth.currentUser) {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
    setLocalStore(LOCAL_STORAGE_KEY, [newVehicle, ...list]);
    return id;
  }

  try {
    await setDoc(doc(db, 'vehicles', id), newVehicle);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Update Vehicle
 */
export async function updateVehicle(
  vehicleId: string,
  updates: Partial<Vehicle>
): Promise<void> {
  const path = `vehicles/${vehicleId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
    const updated = list.map((v) =>
      v.id === vehicleId
        ? { ...v, ...updates, updatedAt: new Date().toISOString() }
        : v
    );
    setLocalStore(LOCAL_STORAGE_KEY, updated);
    return;
  }

  try {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(doc(db, 'vehicles', vehicleId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Delete Vehicle and subcollections
 */
export async function deleteVehicle(vehicleId: string): Promise<void> {
  const path = `vehicles/${vehicleId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY).filter((v) => v.id !== vehicleId);
    setLocalStore(LOCAL_STORAGE_KEY, list);
    const repairs = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY).filter((r) => r.vehicleId !== vehicleId);
    setLocalStore(LOCAL_REPAIRS_KEY, repairs);
    const expenses = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY).filter((e) => e.vehicleId !== vehicleId);
    setLocalStore(LOCAL_EXPENSES_KEY, expenses);
    return;
  }

  try {
    // Delete repairs subcollection
    const repairsSnap = await getDocs(collection(db, 'vehicles', vehicleId, 'repairs'));
    for (const rDoc of repairsSnap.docs) {
      await deleteDoc(doc(db, 'vehicles', vehicleId, 'repairs', rDoc.id));
    }
    // Delete expenses subcollection
    const expensesSnap = await getDocs(collection(db, 'vehicles', vehicleId, 'expenses'));
    for (const eDoc of expensesSnap.docs) {
      await deleteDoc(doc(db, 'vehicles', vehicleId, 'expenses', eDoc.id));
    }
    // Delete main vehicle document
    await deleteDoc(doc(db, 'vehicles', vehicleId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Real-time Repairs Subscription
 */
export function subscribeRepairs(
  vehicleId: string,
  onData: (repairs: RepairTask[]) => void,
  onError?: (err: unknown) => void
) {
  if (auth.currentUser) {
    const path = `vehicles/${vehicleId}/repairs`;
    const q = collection(db, 'vehicles', vehicleId, 'repairs');

    return onSnapshot(
      q,
      (snapshot) => {
        const repairs: RepairTask[] = [];
        snapshot.forEach((docSnap) => {
          repairs.push({ ...(docSnap.data() as RepairTask), id: docSnap.id });
        });
        repairs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        onData(repairs);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  const emitLocal = () => {
    const all = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY);
    const filtered = all.filter((r) => r.vehicleId === vehicleId);
    filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    onData(filtered);
  };

  emitLocal();
  const listener = () => emitLocal();
  window.addEventListener('autogarage_store_updated', listener);
  return () => window.removeEventListener('autogarage_store_updated', listener);
}

/**
 * Add Repair Task
 */
export async function addRepairTask(
  vehicleId: string,
  userId: string,
  task: Omit<RepairTask, 'id' | 'vehicleId' | 'userId' | 'createdAt' | 'updatedAt' | 'totalCost'>
): Promise<string> {
  const id = generateId('task');
  const path = `vehicles/${vehicleId}/repairs/${id}`;
  const now = new Date().toISOString();
  const partsCost = Number(task.partsCost) || 0;
  const laborCost = Number(task.laborCost) || 0;

  const newTask: RepairTask = {
    ...task,
    id,
    vehicleId,
    userId,
    partsCost,
    laborCost,
    totalCost: partsCost + laborCost,
    createdAt: now,
    updatedAt: now,
  };

  if (!auth.currentUser) {
    const list = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY);
    setLocalStore(LOCAL_REPAIRS_KEY, [newTask, ...list]);
    return id;
  }

  try {
    await setDoc(doc(db, 'vehicles', vehicleId, 'repairs', id), newTask);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Update Repair Task
 */
export async function updateRepairTask(
  vehicleId: string,
  taskId: string,
  updates: Partial<RepairTask>
): Promise<void> {
  const path = `vehicles/${vehicleId}/repairs/${taskId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY);
    const updated = list.map((t) => {
      if (t.id === taskId) {
        const parts = updates.partsCost !== undefined ? Number(updates.partsCost) : t.partsCost;
        const labor = updates.laborCost !== undefined ? Number(updates.laborCost) : t.laborCost;
        return {
          ...t,
          ...updates,
          partsCost: parts,
          laborCost: labor,
          totalCost: parts + labor,
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });
    setLocalStore(LOCAL_REPAIRS_KEY, updated);
    return;
  }

  try {
    const payload: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if (updates.partsCost !== undefined || updates.laborCost !== undefined) {
      const parts = updates.partsCost !== undefined ? Number(updates.partsCost) : 0;
      const labor = updates.laborCost !== undefined ? Number(updates.laborCost) : 0;
      payload.totalCost = parts + labor;
    }
    await updateDoc(doc(db, 'vehicles', vehicleId, 'repairs', taskId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Delete Repair Task
 */
export async function deleteRepairTask(vehicleId: string, taskId: string): Promise<void> {
  const path = `vehicles/${vehicleId}/repairs/${taskId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY).filter((t) => t.id !== taskId);
    setLocalStore(LOCAL_REPAIRS_KEY, list);
    return;
  }

  try {
    await deleteDoc(doc(db, 'vehicles', vehicleId, 'repairs', taskId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Real-time General Expenses Subscription
 */
export function subscribeExpenses(
  vehicleId: string,
  onData: (expenses: GeneralExpense[]) => void,
  onError?: (err: unknown) => void
) {
  if (auth.currentUser) {
    const path = `vehicles/${vehicleId}/expenses`;
    const q = collection(db, 'vehicles', vehicleId, 'expenses');

    return onSnapshot(
      q,
      (snapshot) => {
        const expenses: GeneralExpense[] = [];
        snapshot.forEach((docSnap) => {
          expenses.push({ ...(docSnap.data() as GeneralExpense), id: docSnap.id });
        });
        expenses.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        onData(expenses);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  const emitLocal = () => {
    const all = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY);
    const filtered = all.filter((e) => e.vehicleId === vehicleId);
    filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onData(filtered);
  };

  emitLocal();
  const listener = () => emitLocal();
  window.addEventListener('autogarage_store_updated', listener);
  return () => window.removeEventListener('autogarage_store_updated', listener);
}

/**
 * Subscribe to ALL repairs and general expenses across the entire fleet for Analytics
 */
export function subscribeAllFleetExpensesAndRepairs(
  vehicles: Vehicle[],
  onData: (data: { repairs: RepairTask[]; expenses: GeneralExpense[] }) => void
): () => void {
  if (auth.currentUser) {
    let active = true;
    const loadAll = async () => {
      try {
        const repairs: RepairTask[] = [];
        const expenses: GeneralExpense[] = [];
        await Promise.all(
          vehicles.map(async (v) => {
            const [rSnap, eSnap] = await Promise.all([
              getDocs(collection(db, 'vehicles', v.id, 'repairs')),
              getDocs(collection(db, 'vehicles', v.id, 'expenses')),
            ]);
            rSnap.forEach((docSnap) => {
              repairs.push({ ...(docSnap.data() as RepairTask), id: docSnap.id });
            });
            eSnap.forEach((docSnap) => {
              expenses.push({ ...(docSnap.data() as GeneralExpense), id: docSnap.id });
            });
          })
        );
        if (active) {
          onData({ repairs, expenses });
        }
      } catch (err) {
        console.warn('subscribeAllFleetExpensesAndRepairs warning:', err);
      }
    };
    loadAll();
    const listener = () => loadAll();
    window.addEventListener('autogarage_store_updated', listener);
    return () => {
      active = false;
      window.removeEventListener('autogarage_store_updated', listener);
    };
  }

  const emitLocal = () => {
    const vehicleIds = new Set(vehicles.map((v) => v.id));
    const repairs = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY).filter((r) =>
      vehicleIds.has(r.vehicleId)
    );
    const expenses = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY).filter((e) =>
      vehicleIds.has(e.vehicleId)
    );
    onData({ repairs, expenses });
  };

  emitLocal();
  const listener = () => emitLocal();
  window.addEventListener('autogarage_store_updated', listener);
  return () => window.removeEventListener('autogarage_store_updated', listener);
}

/**
 * Add General Expense
 */
export async function addGeneralExpense(
  vehicleId: string,
  userId: string,
  expense: Omit<GeneralExpense, 'id' | 'vehicleId' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateId('exp');
  const path = `vehicles/${vehicleId}/expenses/${id}`;
  const now = new Date().toISOString();

  const newExpense: GeneralExpense = {
    ...expense,
    id,
    vehicleId,
    userId,
    amount: Number(expense.amount) || 0,
    createdAt: now,
    updatedAt: now,
  };

  if (!auth.currentUser) {
    const list = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY);
    setLocalStore(LOCAL_EXPENSES_KEY, [newExpense, ...list]);
    return id;
  }

  try {
    await setDoc(doc(db, 'vehicles', vehicleId, 'expenses', id), newExpense);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Update General Expense
 */
export async function updateGeneralExpense(
  vehicleId: string,
  expenseId: string,
  updates: Partial<GeneralExpense>
): Promise<void> {
  const path = `vehicles/${vehicleId}/expenses/${expenseId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY);
    const updated = list.map((e) =>
      e.id === expenseId
        ? { ...e, ...updates, updatedAt: new Date().toISOString() }
        : e
    );
    setLocalStore(LOCAL_EXPENSES_KEY, updated);
    return;
  }

  try {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(doc(db, 'vehicles', vehicleId, 'expenses', expenseId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Delete General Expense
 */
export async function deleteGeneralExpense(vehicleId: string, expenseId: string): Promise<void> {
  const path = `vehicles/${vehicleId}/expenses/${expenseId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY).filter((e) => e.id !== expenseId);
    setLocalStore(LOCAL_EXPENSES_KEY, list);
    return;
  }

  try {
    await deleteDoc(doc(db, 'vehicles', vehicleId, 'expenses', expenseId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Recalculate & Sync Vehicle Financials across database
 * Triggers instant recalculation of total capital invested, net profit, margin %
 */
export async function syncVehicleFinancials(
  vehicle: Vehicle,
  repairs: RepairTask[],
  expenses: GeneralExpense[]
): Promise<void> {
  const fin = calculateVehicleFinancials({
    purchasePrice: vehicle.purchasePrice,
    targetSalePrice: vehicle.targetSalePrice,
    finalSalePrice: vehicle.buyerInfo?.salePrice,
    repairs,
    expenses,
  });

  if (
    vehicle.repairCostTotal === fin.repairCostTotal &&
    vehicle.generalExpensesTotal === fin.generalExpensesTotal &&
    vehicle.totalExpenses === fin.totalExpenses &&
    vehicle.totalInvested === fin.totalInvested &&
    vehicle.netProfit === fin.netProfit &&
    vehicle.marginPercentage === fin.marginPercentage
  ) {
    return; // Already up-to-date, avoid redundant store updates
  }

  await updateVehicle(vehicle.id, {
    repairCostTotal: fin.repairCostTotal,
    generalExpensesTotal: fin.generalExpensesTotal,
    totalExpenses: fin.totalExpenses,
    totalInvested: fin.totalInvested,
    netProfit: fin.netProfit,
    marginPercentage: fin.marginPercentage,
  });
}

/**
 * Seed realistic starter vehicles & repair tasks for instant testing
 */
export async function seedDemoGarageData(
  userId: string,
  garageId: string = DEFAULT_GARAGE_ID
): Promise<void> {
  // Vehicle 1: Peugeot 208 GT - In preparation
  const v1Id = await createVehicle({
    userId,
    garageId,
    make: 'Peugeot',
    model: '208',
    trim: '1.2 PureTech 130ch GT Line EAT8',
    year: 2021,
    mileage: 48500,
    vin: 'VF3UPHNK0MT129841',
    purchaseDate: '2026-10-15',
    purchasePrice: 11200,
    targetSalePrice: 14900,
    status: 'preparation',
    photos: [
      'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80',
    ],
    documents: [
      { id: 'doc1', name: 'Certificat_Situation_NonGage.pdf', url: '#', date: '2026-10-15', type: 'PDF' },
      { id: 'doc2', name: 'Facture_Achat_Enchere.pdf', url: '#', date: '2026-10-15', type: 'PDF' },
    ],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 11200,
    netProfit: 3700,
    marginPercentage: 24.83,
  });

  if (v1Id) {
    await addRepairTask(v1Id, userId, {
      title: 'Vidange moteur 0W20 & Filtres (Huile, Air, Habitacle)',
      status: 'in_progress',
      partsCost: 95,
      laborCost: 65,
      categoryPreset: 'oil_change',
      notes: 'Filtre habitacle charbon actif à remplacer',
    });
    await addRepairTask(v1Id, userId, {
      title: 'Disques & Plaquettes avant Brembo',
      status: 'todo',
      partsCost: 140,
      laborCost: 70,
      categoryPreset: 'brake_pads',
      notes: 'Plaquettes usées à 80%',
    });
    await addGeneralExpense(v1Id, userId, {
      category: 'transport',
      description: 'Rapatriement plateau dépanneuse depuis parc vente',
      amount: 180,
      date: '2026-10-16',
    });
    await addGeneralExpense(v1Id, userId, {
      category: 'controle_technique',
      description: 'Passage visite périodique Contrôle Technique Dekra',
      amount: 85,
      date: '2026-10-18',
    });
  }

  // Vehicle 2: Renault Clio V - In repair
  const v2Id = await createVehicle({
    userId,
    garageId,
    make: 'Renault',
    model: 'Clio V',
    trim: 'TCe 90 Intens',
    year: 2020,
    mileage: 62000,
    vin: 'VF1RJA00365891234',
    purchaseDate: '2026-09-28',
    purchasePrice: 8900,
    targetSalePrice: 12200,
    status: 'repair',
    photos: [
      'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=80',
    ],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 8900,
    netProfit: 3300,
    marginPercentage: 27.05,
  });

  if (v2Id) {
    await addRepairTask(v2Id, userId, {
      title: 'Kit Distribution complète & Pompe à eau + Courroie accessoires',
      status: 'in_progress',
      partsCost: 240,
      laborCost: 260,
      categoryPreset: 'timing_belt',
      notes: 'Pièces d’origine Gates commandées',
    });
    await addRepairTask(v2Id, userId, {
      title: 'Diagnostic valise OBD & Réinitialisation voyant vidange',
      status: 'done',
      partsCost: 0,
      laborCost: 40,
      categoryPreset: 'diagnostics',
    });
    await addGeneralExpense(v2Id, userId, {
      category: 'detailing',
      description: 'Pressing sièges tissu & lustrage carrosserie',
      amount: 120,
      date: '2026-10-02',
    });
  }

  // Vehicle 3: Volkswagen Golf VII - For Sale (En vente)
  const v3Id = await createVehicle({
    userId,
    garageId,
    make: 'Volkswagen',
    model: 'Golf VII',
    trim: '1.6 TDI 115ch Confortline DSG7',
    year: 2019,
    mileage: 94000,
    vin: 'WVWZZZAUZKP512984',
    purchaseDate: '2026-08-10',
    purchasePrice: 10400,
    targetSalePrice: 13990,
    status: 'for_sale',
    photos: [
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
    ],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 10400,
    netProfit: 3590,
    marginPercentage: 25.66,
  });

  if (v3Id) {
    await addRepairTask(v3Id, userId, {
      title: 'Entretien boîte de vitesses DSG7 vidange et filtres',
      status: 'done',
      partsCost: 190,
      laborCost: 120,
    });
    await addGeneralExpense(v3Id, userId, {
      category: 'controle_technique',
      description: 'Contrôle Technique Vierge sans réserve',
      amount: 85,
      date: '2026-08-20',
    });
    await addGeneralExpense(v3Id, userId, {
      category: 'admin',
      description: 'Frais de dossier et déclaration d’achat SIV',
      amount: 30,
      date: '2026-08-12',
    });
    await addGeneralExpense(v3Id, userId, {
      category: 'fuel',
      description: 'Plein Gazole essais routiers & convoyage',
      amount: 65,
      date: '2026-10-28',
    });
  }

  // Vehicle 4: Audi A3 Sportback - Sold (Vendu) with Buyer Details and final P&L
  const v4Id = await createVehicle({
    userId,
    garageId,
    make: 'Audi',
    model: 'A3 Sportback',
    trim: '35 TFSI 150ch S Line S Tronic',
    year: 2021,
    mileage: 51200,
    vin: 'WAUZZZGY4NA029145',
    purchaseDate: '2026-07-05',
    purchasePrice: 18500,
    targetSalePrice: 22900,
    status: 'sold',
    photos: [
      'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=1200&q=80',
    ],
    buyerInfo: {
      fullName: 'Thomas Beaumont',
      phone: '06 42 19 88 34',
      email: 'thomas.beaumont@gmail.com',
      address: '14 Rue des Lilas, 69003 Lyon, France',
      salePrice: 22500,
      saleDate: '2026-10-24',
    },
    documents: [],
    repairCostTotal: 580,
    generalExpensesTotal: 340,
    totalExpenses: 920,
    totalInvested: 19420,
    netProfit: 3080,
    marginPercentage: 13.69,
  });

  if (v4Id) {
    await addRepairTask(v4Id, userId, {
      title: 'Pneumatiques Michelin Pilot Sport 4 x2 train avant',
      status: 'done',
      partsCost: 260,
      laborCost: 50,
      categoryPreset: 'tires',
    });
    await addRepairTask(v4Id, userId, {
      title: 'Vidange LongLife 5W30 + Filtres complets',
      status: 'done',
      partsCost: 150,
      laborCost: 120,
      categoryPreset: 'oil_change',
    });
    await addGeneralExpense(v4Id, userId, {
      category: 'detailing',
      description: 'Traitement céramique carrosserie & nettoyage vapeur',
      amount: 220,
      date: '2026-07-15',
    });
    await addGeneralExpense(v4Id, userId, {
      category: 'controle_technique',
      description: 'Contrôle Technique obligatoire vente',
      amount: 85,
      date: '2026-10-20',
    });
    await addGeneralExpense(v4Id, userId, {
      category: 'admin',
      description: 'Certificat de conformité & frais SIV',
      amount: 35,
      date: '2026-10-24',
    });
  }
}
