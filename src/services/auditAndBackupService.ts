import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  BackupRestoreMode,
  BackupSnapshotRecord,
  ChangeLogEntityType,
  ChangeLogEntry,
  ChangeLogFieldDiff,
  ChangeLogOperation,
  DocumentHistoryEvent,
  FullGarageBackupV2,
  GarageDocument,
  GarageSettings,
  GeneralExpense,
  Purchase,
  RepairTask,
  Supplier,
  UserActivityAction,
  UserActivityLog,
  Vehicle,
} from '../types/garage';
import {
  DEFAULT_GARAGE_SETTINGS,
  generateId,
  getGarageSettings,
  saveGarageSettings,
} from './garageService';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';
import { computeBackupCounts, serializeFullBackupV2 } from '../utils/exportBackup';

const LOCAL_ACTIVITY_LOGS_KEY = 'autogarage_activity_logs_store';
const LOCAL_CHANGE_LOGS_KEY = 'autogarage_change_logs_store';
const LOCAL_BACKUP_SNAPSHOTS_KEY = 'autogarage_backup_snapshots_store';
const AUDIT_UPDATED_EVENT = 'autogarage_audit_updated';

const LOCAL_VEHICLES_KEY = 'autogarage_vehicles_store';
const LOCAL_REPAIRS_KEY = 'autogarage_repairs_store';
const LOCAL_EXPENSES_KEY = 'autogarage_expenses_store';
const LOCAL_SUPPLIERS_KEY = 'autogarage_suppliers_store';
const LOCAL_PURCHASES_KEY = 'autogarage_purchases_store';
const LOCAL_DOCUMENTS_KEY = 'autogarage_documents_store';
const LOCAL_DOCUMENT_HISTORY_KEY = 'autogarage_document_history_store';

function getLocalList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalList<T>(key: string, data: T[], eventName: string = AUDIT_UPDATED_EVENT): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event(eventName));
  } catch (e) {
    console.warn(`localStorage write warning (${key}):`, e);
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      cleaned[k] = v;
    }
  }
  return cleaned as T;
}

export function resolveActorEmail(fallbackEmail?: string | null): string {
  return (
    auth.currentUser?.email ||
    fallbackEmail ||
    'garage@autogarage.fr'
  );
}

export function subscribeActivityLogs(
  userId: string,
  onData: (logs: UserActivityLog[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (auth.currentUser) {
    const q = query(collection(db, 'user_activity_logs'), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: UserActivityLog[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as UserActivityLog), id: d.id }));
        list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        onData(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, 'user_activity_logs');
      }
    );
  }

  const emitLocal = () => {
    const list = getLocalList<UserActivityLog>(LOCAL_ACTIVITY_LOGS_KEY);
    list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    onData(list);
  };
  emitLocal();
  window.addEventListener(AUDIT_UPDATED_EVENT, emitLocal);
  return () => window.removeEventListener(AUDIT_UPDATED_EVENT, emitLocal);
}

export function subscribeChangeLogs(
  userId: string,
  onData: (entries: ChangeLogEntry[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (auth.currentUser) {
    const q = query(collection(db, 'change_logs'), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: ChangeLogEntry[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as ChangeLogEntry), id: d.id }));
        list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        onData(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, 'change_logs');
      }
    );
  }

  const emitLocal = () => {
    const list = getLocalList<ChangeLogEntry>(LOCAL_CHANGE_LOGS_KEY);
    list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    onData(list);
  };
  emitLocal();
  window.addEventListener(AUDIT_UPDATED_EVENT, emitLocal);
  return () => window.removeEventListener(AUDIT_UPDATED_EVENT, emitLocal);
}

export function subscribeBackupSnapshots(
  userId: string,
  onData: (snapshots: BackupSnapshotRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (auth.currentUser) {
    const q = query(collection(db, 'backup_snapshots'), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: BackupSnapshotRecord[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as BackupSnapshotRecord), id: d.id }));
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        onData(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, 'backup_snapshots');
      }
    );
  }

  const emitLocal = () => {
    const list = getLocalList<BackupSnapshotRecord>(LOCAL_BACKUP_SNAPSHOTS_KEY);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    onData(list);
  };
  emitLocal();
  window.addEventListener(AUDIT_UPDATED_EVENT, emitLocal);
  return () => window.removeEventListener(AUDIT_UPDATED_EVENT, emitLocal);
}

export async function logUserActivity(input: {
  userId: string;
  garageId?: string | null;
  actorEmail?: string | null;
  action: UserActivityAction;
  entityType?: ChangeLogEntityType;
  entityId?: string;
  targetLabel: string;
  details?: string;
}): Promise<UserActivityLog> {
  const entry: UserActivityLog = stripUndefined({
    id: generateId('act'),
    userId: auth.currentUser?.uid || input.userId || 'garage_pro_dealer',
    garageId: input.garageId || DEFAULT_GARAGE_ID,
    actorEmail: resolveActorEmail(input.actorEmail).slice(0, 160),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    targetLabel: (input.targetLabel || 'Action').slice(0, 200),
    details: input.details ? input.details.slice(0, 500) : undefined,
    timestamp: new Date().toISOString(),
  });

  if (!auth.currentUser) {
    const list = getLocalList<UserActivityLog>(LOCAL_ACTIVITY_LOGS_KEY);
    setLocalList(LOCAL_ACTIVITY_LOGS_KEY, [entry, ...list].slice(0, 250));
    return entry;
  }

  try {
    await setDoc(doc(db, 'user_activity_logs', entry.id), entry);
  } catch (err) {
    console.warn('Activity log cloud write fallback:', err);
    const list = getLocalList<UserActivityLog>(LOCAL_ACTIVITY_LOGS_KEY);
    setLocalList(LOCAL_ACTIVITY_LOGS_KEY, [entry, ...list].slice(0, 250));
  }
  return entry;
}

export async function logEntityChange(input: {
  userId: string;
  garageId?: string | null;
  actorEmail?: string | null;
  operation: ChangeLogOperation;
  entityType: ChangeLogEntityType;
  entityId: string;
  entityLabel: string;
  changes: ChangeLogFieldDiff[];
}): Promise<ChangeLogEntry> {
  const entry: ChangeLogEntry = stripUndefined({
    id: generateId('chg'),
    userId: auth.currentUser?.uid || input.userId || 'garage_pro_dealer',
    garageId: input.garageId || DEFAULT_GARAGE_ID,
    actorEmail: resolveActorEmail(input.actorEmail).slice(0, 160),
    operation: input.operation,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: (input.entityLabel || input.entityId).slice(0, 200),
    changes: input.changes,
    timestamp: new Date().toISOString(),
  });

  if (!auth.currentUser) {
    const list = getLocalList<ChangeLogEntry>(LOCAL_CHANGE_LOGS_KEY);
    setLocalList(LOCAL_CHANGE_LOGS_KEY, [entry, ...list].slice(0, 250));
    return entry;
  }

  try {
    await setDoc(doc(db, 'change_logs', entry.id), entry);
  } catch (err) {
    console.warn('Change log cloud write fallback:', err);
    const list = getLocalList<ChangeLogEntry>(LOCAL_CHANGE_LOGS_KEY);
    setLocalList(LOCAL_CHANGE_LOGS_KEY, [entry, ...list].slice(0, 250));
  }
  return entry;
}

export async function gatherFleetRepairsAndExpenses(
  vehicles: Vehicle[]
): Promise<{ repairs: RepairTask[]; expenses: GeneralExpense[] }> {
  if (!auth.currentUser) {
    const allRepairs = getLocalList<RepairTask>(LOCAL_REPAIRS_KEY);
    const allExpenses = getLocalList<GeneralExpense>(LOCAL_EXPENSES_KEY);
    const ids = new Set(vehicles.map((v) => v.id));
    return {
      repairs: allRepairs.filter((r) => ids.has(r.vehicleId)),
      expenses: allExpenses.filter((e) => ids.has(e.vehicleId)),
    };
  }

  const repairs: RepairTask[] = [];
  const expenses: GeneralExpense[] = [];
  await Promise.all(
    vehicles.map(async (v) => {
      try {
        const [rSnap, eSnap] = await Promise.all([
          getDocs(collection(db, 'vehicles', v.id, 'repairs')),
          getDocs(collection(db, 'vehicles', v.id, 'expenses')),
        ]);
        rSnap.forEach((d) => repairs.push({ ...(d.data() as RepairTask), id: d.id }));
        eSnap.forEach((d) => expenses.push({ ...(d.data() as GeneralExpense), id: d.id }));
      } catch (err) {
        console.warn(`gatherFleetRepairsAndExpenses fallback for ${v.id}:`, err);
      }
    })
  );
  return { repairs, expenses };
}

export async function buildFullGarageBackupV2(params: {
  garageId?: string | null;
  actorEmail?: string | null;
  vehicles: Vehicle[];
  suppliers: Supplier[];
  purchases: Purchase[];
  documents: GarageDocument[];
  documentHistory: DocumentHistoryEvent[];
  settings?: GarageSettings;
}): Promise<FullGarageBackupV2> {
  const { repairs, expenses } = await gatherFleetRepairsAndExpenses(params.vehicles);
  const resolvedSettings =
    params.settings || getGarageSettings(params.garageId || DEFAULT_GARAGE_ID);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    garageId: params.garageId || undefined,
    actorEmail: resolveActorEmail(params.actorEmail),
    vehicles: params.vehicles,
    repairs,
    expenses,
    suppliers: params.suppliers,
    purchases: params.purchases,
    documents: params.documents,
    documentHistory: params.documentHistory,
    settings: resolvedSettings,
  };
}

export async function createRestorePoint(params: {
  userId: string;
  garageId?: string | null;
  label: string;
  actorEmail?: string | null;
  backup: FullGarageBackupV2;
}): Promise<BackupSnapshotRecord> {
  const rawJson = serializeFullBackupV2(params.backup);
  const sizeBytes = new Blob([rawJson]).size;
  const counts = computeBackupCounts(params.backup);
  const boundedJson =
    rawJson.length <= 820_000
      ? rawJson
      : serializeFullBackupV2({
          ...params.backup,
          documents: params.backup.documents.map((d) => ({
            ...d,
            fileUrl: d.fileUrl.length > 4000 ? '' : d.fileUrl,
          })),
        }).slice(0, 840_000);

  const snapshot: BackupSnapshotRecord = stripUndefined({
    id: generateId('bkp'),
    userId: auth.currentUser?.uid || params.userId || 'garage_pro_dealer',
    garageId: params.garageId || DEFAULT_GARAGE_ID,
    label: (params.label || `Snapshot ${new Date().toISOString().slice(0, 10)}`).slice(0, 160),
    actorEmail: resolveActorEmail(params.actorEmail).slice(0, 160),
    createdAt: new Date().toISOString(),
    sizeBytes,
    counts,
    payloadJson: boundedJson,
  });

  if (!auth.currentUser) {
    const existing = getLocalList<BackupSnapshotRecord>(LOCAL_BACKUP_SNAPSHOTS_KEY);
    const updated = [snapshot, ...existing].slice(0, 12);
    setLocalList(LOCAL_BACKUP_SNAPSHOTS_KEY, updated);
  } else {
    try {
      await setDoc(doc(db, 'backup_snapshots', snapshot.id), snapshot);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `backup_snapshots/${snapshot.id}`);
    }
  }

  await logUserActivity({
    userId: params.userId,
    garageId: params.garageId,
    actorEmail: params.actorEmail,
    action: 'backup_created',
    entityType: 'backup',
    entityId: snapshot.id,
    targetLabel: snapshot.label,
    details: `${counts.vehicles} véhicules, ${counts.repairs} réparations, ${counts.expenses} frais, ${counts.suppliers} fournisseurs, ${counts.documents} documents`,
  });

  return snapshot;
}

export async function deleteRestorePoint(snapshotId: string): Promise<void> {
  if (!auth.currentUser) {
    const list = getLocalList<BackupSnapshotRecord>(LOCAL_BACKUP_SNAPSHOTS_KEY).filter(
      (s) => s.id !== snapshotId
    );
    setLocalList(LOCAL_BACKUP_SNAPSHOTS_KEY, list);
    return;
  }

  try {
    await deleteDoc(doc(db, 'backup_snapshots', snapshotId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `backup_snapshots/${snapshotId}`);
  }
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  existing.forEach((item) => map.set(item.id, item));
  incoming.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function replaceInScope<T extends { garageId?: string }>(
  existing: T[],
  incoming: T[],
  garageId?: string | null
): T[] {
  if (!garageId) return incoming;
  const outsideScope = existing.filter((item) =>
    item.garageId ? item.garageId !== garageId : garageId !== DEFAULT_GARAGE_ID
  );
  const normalizedIncoming = incoming.map((item) => ({
    ...item,
    garageId: item.garageId || garageId,
  }));
  return [...outsideScope, ...normalizedIncoming];
}

export async function restoreFullGarageBackupV2(
  payload: FullGarageBackupV2,
  options: {
    mode: BackupRestoreMode;
    userId: string;
    garageId?: string | null;
    actorEmail?: string | null;
  }
): Promise<void> {
  const effectiveUid = auth.currentUser?.uid || options.userId || 'garage_pro_dealer';
  const targetGarageId = options.garageId || payload.garageId || DEFAULT_GARAGE_ID;

  const normalizedVehicles = (payload.vehicles || []).map((v) => ({
    ...v,
    userId: effectiveUid,
    garageId: v.garageId || targetGarageId,
  }));
  const vehicleIds = new Set(normalizedVehicles.map((v) => v.id));

  const normalizedRepairs = (payload.repairs || []).map((r) => ({
    ...r,
    userId: effectiveUid,
    garageId: r.garageId || targetGarageId,
  }));
  const normalizedExpenses = (payload.expenses || []).map((e) => ({
    ...e,
    userId: effectiveUid,
    garageId: e.garageId || targetGarageId,
  }));
  const normalizedSuppliers = (payload.suppliers || []).map((s) => ({
    ...s,
    userId: effectiveUid,
    garageId: s.garageId || targetGarageId,
  }));
  const normalizedPurchases = (payload.purchases || []).map((p) => ({
    ...p,
    userId: effectiveUid,
    garageId: p.garageId || targetGarageId,
  }));
  const normalizedDocuments = (payload.documents || []).map((d) => ({
    ...d,
    userId: effectiveUid,
    garageId: d.garageId || targetGarageId,
  }));
  const normalizedDocHistory = (payload.documentHistory || []).map((h) => ({
    ...h,
    userId: effectiveUid,
    garageId: h.garageId || targetGarageId,
  }));

  if (options.mode === 'replace') {
    const existingVehicles = getLocalList<Vehicle>(LOCAL_VEHICLES_KEY);
    const removedVehicleIds = new Set(
      existingVehicles
        .filter((v) =>
          options.garageId
            ? v.garageId
              ? v.garageId === options.garageId
              : options.garageId === DEFAULT_GARAGE_ID
            : true
        )
        .map((v) => v.id)
    );

    const nextVehicles = replaceInScope(existingVehicles, normalizedVehicles, options.garageId);
    const nextRepairs = [
      ...getLocalList<RepairTask>(LOCAL_REPAIRS_KEY).filter(
        (r) => !removedVehicleIds.has(r.vehicleId)
      ),
      ...normalizedRepairs,
    ];
    const nextExpenses = [
      ...getLocalList<GeneralExpense>(LOCAL_EXPENSES_KEY).filter(
        (e) => !removedVehicleIds.has(e.vehicleId)
      ),
      ...normalizedExpenses,
    ];
    const nextSuppliers = replaceInScope(
      getLocalList<Supplier>(LOCAL_SUPPLIERS_KEY),
      normalizedSuppliers,
      options.garageId
    );
    const nextPurchases = replaceInScope(
      getLocalList<Purchase>(LOCAL_PURCHASES_KEY),
      normalizedPurchases,
      options.garageId
    );
    const nextDocuments = replaceInScope(
      getLocalList<GarageDocument>(LOCAL_DOCUMENTS_KEY),
      normalizedDocuments,
      options.garageId
    );
    const nextDocHistory = replaceInScope(
      getLocalList<DocumentHistoryEvent>(LOCAL_DOCUMENT_HISTORY_KEY),
      normalizedDocHistory,
      options.garageId
    );

    setLocalList(LOCAL_VEHICLES_KEY, nextVehicles, 'autogarage_store_updated');
    setLocalList(LOCAL_REPAIRS_KEY, nextRepairs, 'autogarage_store_updated');
    setLocalList(LOCAL_EXPENSES_KEY, nextExpenses, 'autogarage_store_updated');
    setLocalList(LOCAL_SUPPLIERS_KEY, nextSuppliers, 'autogarage_suppliers_updated');
    setLocalList(LOCAL_PURCHASES_KEY, nextPurchases, 'autogarage_suppliers_updated');
    setLocalList(LOCAL_DOCUMENTS_KEY, nextDocuments, 'autogarage_documents_updated');
    setLocalList(LOCAL_DOCUMENT_HISTORY_KEY, nextDocHistory, 'autogarage_documents_updated');
  } else {
    // Merge mode
    setLocalList(
      LOCAL_VEHICLES_KEY,
      mergeById(getLocalList<Vehicle>(LOCAL_VEHICLES_KEY), normalizedVehicles),
      'autogarage_store_updated'
    );
    setLocalList(
      LOCAL_REPAIRS_KEY,
      mergeById(getLocalList<RepairTask>(LOCAL_REPAIRS_KEY), normalizedRepairs),
      'autogarage_store_updated'
    );
    setLocalList(
      LOCAL_EXPENSES_KEY,
      mergeById(getLocalList<GeneralExpense>(LOCAL_EXPENSES_KEY), normalizedExpenses),
      'autogarage_store_updated'
    );
    setLocalList(
      LOCAL_SUPPLIERS_KEY,
      mergeById(getLocalList<Supplier>(LOCAL_SUPPLIERS_KEY), normalizedSuppliers),
      'autogarage_suppliers_updated'
    );
    setLocalList(
      LOCAL_PURCHASES_KEY,
      mergeById(getLocalList<Purchase>(LOCAL_PURCHASES_KEY), normalizedPurchases),
      'autogarage_suppliers_updated'
    );
    setLocalList(
      LOCAL_DOCUMENTS_KEY,
      mergeById(getLocalList<GarageDocument>(LOCAL_DOCUMENTS_KEY), normalizedDocuments),
      'autogarage_documents_updated'
    );
    setLocalList(
      LOCAL_DOCUMENT_HISTORY_KEY,
      mergeById(getLocalList<DocumentHistoryEvent>(LOCAL_DOCUMENT_HISTORY_KEY), normalizedDocHistory),
      'autogarage_documents_updated'
    );
  }

  await saveGarageSettings(
    { ...DEFAULT_GARAGE_SETTINGS, ...payload.settings, garageId: targetGarageId },
    effectiveUid
  );

  if (auth.currentUser) {
    for (const v of normalizedVehicles) {
      await setDoc(doc(db, 'vehicles', v.id), v, { merge: true });
    }
    for (const r of normalizedRepairs) {
      if (vehicleIds.has(r.vehicleId)) {
        await setDoc(doc(db, 'vehicles', r.vehicleId, 'repairs', r.id), r, { merge: true });
      }
    }
    for (const e of normalizedExpenses) {
      if (vehicleIds.has(e.vehicleId)) {
        await setDoc(doc(db, 'vehicles', e.vehicleId, 'expenses', e.id), e, { merge: true });
      }
    }
    for (const s of normalizedSuppliers) {
      await setDoc(doc(db, 'suppliers', s.id), s, { merge: true });
    }
    for (const p of normalizedPurchases) {
      await setDoc(doc(db, 'purchases', p.id), p, { merge: true });
    }
    for (const d of normalizedDocuments) {
      await setDoc(doc(db, 'garage_documents', d.id), d, { merge: true });
    }
  }

  const counts = computeBackupCounts(payload);
  await logUserActivity({
    userId: effectiveUid,
    garageId: targetGarageId,
    actorEmail: options.actorEmail,
    action: 'backup_restored',
    entityType: 'backup',
    entityId: `restore_${Date.now()}`,
    targetLabel:
      options.mode === 'replace'
        ? 'Restauration complète (Remplacement)'
        : 'Restauration fusionnée (Merge)',
    details: `${counts.vehicles} véhicules, ${counts.repairs} réparations, ${counts.expenses} frais, ${counts.suppliers} fournisseurs, ${counts.documents} documents`,
  });

  await logEntityChange({
    userId: effectiveUid,
    garageId: targetGarageId,
    actorEmail: options.actorEmail,
    operation: 'restore',
    entityType: 'backup',
    entityId: targetGarageId,
    entityLabel: `Backup ${payload.exportedAt.slice(0, 10)} (${options.mode})`,
    changes: [
      { field: 'mode', oldValue: 'current', newValue: options.mode },
      { field: 'vehicles', oldValue: '—', newValue: String(counts.vehicles) },
      { field: 'suppliers', oldValue: '—', newValue: String(counts.suppliers) },
      { field: 'documents', oldValue: '—', newValue: String(counts.documents) },
    ],
  });
}
