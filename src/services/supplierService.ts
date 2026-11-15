import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import {
  Purchase,
  PurchaseCategory,
  PurchaseDocument,
  PurchasePaymentMethod,
  Supplier,
  SupplierType,
  Vehicle,
} from '../types/garage';
import { generateId } from './garageService';
import { logEntityChange, logUserActivity } from './auditAndBackupService';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';

const LOCAL_SUPPLIERS_KEY = 'autogarage_suppliers_store';
const LOCAL_PURCHASES_KEY = 'autogarage_purchases_store';

function getLocalList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalList<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event('autogarage_suppliers_updated'));
  } catch (e) {
    console.warn('localStorage supplier write error:', e);
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

export function subscribeSuppliers(
  userId: string,
  onData: (suppliers: Supplier[]) => void,
  onError?: (err: unknown) => void
) {
  if (auth.currentUser) {
    const collectionPath = 'suppliers';
    const q = query(collection(db, collectionPath), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: Supplier[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as Supplier), id: docSnap.id });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        onData(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      }
    );
  }

  const emitLocal = () => {
    const list = getLocalList<Supplier>(LOCAL_SUPPLIERS_KEY);
    list.sort((a, b) => a.name.localeCompare(b.name));
    onData(list);
  };
  emitLocal();
  window.addEventListener('autogarage_suppliers_updated', emitLocal);
  return () => window.removeEventListener('autogarage_suppliers_updated', emitLocal);
}

export async function createSupplier(input: {
  userId: string;
  garageId?: string;
  name: string;
  type: SupplierType;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  siret?: string;
  notes?: string;
}): Promise<Supplier> {
  const id = generateId('sup');
  const now = new Date().toISOString();
  const supplier: Supplier = stripUndefined({
    id,
    userId: input.userId,
    garageId: input.garageId || DEFAULT_GARAGE_ID,
    name: input.name.trim(),
    type: input.type,
    contactPerson: input.contactPerson?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    city: input.city?.trim() || undefined,
    address: input.address?.trim() || undefined,
    siret: input.siret?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  });

  if (!auth.currentUser) {
    const list = getLocalList<Supplier>(LOCAL_SUPPLIERS_KEY);
    setLocalList(LOCAL_SUPPLIERS_KEY, [supplier, ...list]);
  } else {
    try {
      await setDoc(doc(db, 'suppliers', id), supplier);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `suppliers/${id}`);
    }
  }

  void logUserActivity({
    userId: supplier.userId,
    garageId: supplier.garageId,
    action: 'supplier_created',
    entityType: 'supplier',
    entityId: supplier.id,
    targetLabel: supplier.name,
    details: supplier.type,
  });
  void logEntityChange({
    userId: supplier.userId,
    garageId: supplier.garageId,
    operation: 'create',
    entityType: 'supplier',
    entityId: supplier.id,
    entityLabel: supplier.name,
    changes: [
      { field: 'name', oldValue: '—', newValue: supplier.name },
      { field: 'type', oldValue: '—', newValue: supplier.type },
    ],
  });

  return supplier;
}

export async function updateSupplier(
  supplierId: string,
  updates: Partial<Supplier>
): Promise<void> {
  const now = new Date().toISOString();
  const payload = stripUndefined({ ...updates, updatedAt: now });

  if (!auth.currentUser) {
    const list = getLocalList<Supplier>(LOCAL_SUPPLIERS_KEY);
    setLocalList(
      LOCAL_SUPPLIERS_KEY,
      list.map((s) => (s.id === supplierId ? { ...s, ...payload } : s))
    );
    // Keep supplier snapshot name/type synced on local purchases
    if (updates.name || updates.type) {
      const purchases = getLocalList<Purchase>(LOCAL_PURCHASES_KEY);
      setLocalList(
        LOCAL_PURCHASES_KEY,
        purchases.map((p) =>
          p.supplierId === supplierId
            ? {
                ...p,
                supplierName: updates.name || p.supplierName,
                supplierType: updates.type || p.supplierType,
              }
            : p
        )
      );
    }
    return;
  }

  try {
    await updateDoc(doc(db, 'suppliers', supplierId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `suppliers/${supplierId}`);
  }
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  if (!auth.currentUser) {
    const list = getLocalList<Supplier>(LOCAL_SUPPLIERS_KEY).filter((s) => s.id !== supplierId);
    setLocalList(LOCAL_SUPPLIERS_KEY, list);
    return;
  }

  try {
    await deleteDoc(doc(db, 'suppliers', supplierId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `suppliers/${supplierId}`);
  }
}

export function subscribePurchases(
  userId: string,
  onData: (purchases: Purchase[]) => void,
  onError?: (err: unknown) => void
) {
  if (auth.currentUser) {
    const collectionPath = 'purchases';
    const q = query(collection(db, collectionPath), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: Purchase[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as Purchase), id: docSnap.id });
        });
        list.sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
        onData(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      }
    );
  }

  const emitLocal = () => {
    const list = getLocalList<Purchase>(LOCAL_PURCHASES_KEY);
    list.sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
    onData(list);
  };
  emitLocal();
  window.addEventListener('autogarage_suppliers_updated', emitLocal);
  return () => window.removeEventListener('autogarage_suppliers_updated', emitLocal);
}

export async function createPurchase(input: {
  userId: string;
  garageId?: string;
  supplierId: string;
  supplierName: string;
  supplierType: SupplierType;
  vehicleId?: string;
  vehicleLabel?: string;
  category: PurchaseCategory;
  description: string;
  amount: number;
  date: string;
  paymentMethod: PurchasePaymentMethod;
  invoiceNumber?: string;
  invoiceProofName?: string;
  invoiceProofUrl?: string;
  vehicleDocuments?: PurchaseDocument[];
  notes?: string;
}): Promise<Purchase> {
  const id = generateId('pur');
  const now = new Date().toISOString();
  const purchase: Purchase = stripUndefined({
    id,
    userId: input.userId,
    garageId: input.garageId || DEFAULT_GARAGE_ID,
    supplierId: input.supplierId,
    supplierName: input.supplierName.trim(),
    supplierType: input.supplierType,
    vehicleId: input.vehicleId || undefined,
    vehicleLabel: input.vehicleLabel?.trim() || undefined,
    category: input.category,
    description: input.description.trim(),
    amount: Number(input.amount) || 0,
    date: input.date,
    paymentMethod: input.paymentMethod,
    invoiceNumber: input.invoiceNumber?.trim() || undefined,
    invoiceProofName: input.invoiceProofName?.trim() || undefined,
    invoiceProofUrl: input.invoiceProofUrl || undefined,
    vehicleDocuments: input.vehicleDocuments || [],
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  });

  if (!auth.currentUser) {
    const list = getLocalList<Purchase>(LOCAL_PURCHASES_KEY);
    setLocalList(LOCAL_PURCHASES_KEY, [purchase, ...list]);
  } else {
    try {
      await setDoc(doc(db, 'purchases', id), purchase);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `purchases/${id}`);
    }
  }

  void logUserActivity({
    userId: purchase.userId,
    garageId: purchase.garageId,
    action: 'purchase_created',
    entityType: 'purchase',
    entityId: purchase.id,
    targetLabel: `${purchase.supplierName} (${purchase.amount} €)`,
    details: purchase.description,
  });
  void logEntityChange({
    userId: purchase.userId,
    garageId: purchase.garageId,
    operation: 'create',
    entityType: 'purchase',
    entityId: purchase.id,
    entityLabel: `${purchase.supplierName} · ${purchase.description}`,
    changes: [
      { field: 'amount', oldValue: '—', newValue: `${purchase.amount} €` },
      { field: 'category', oldValue: '—', newValue: purchase.category },
      { field: 'paymentMethod', oldValue: '—', newValue: purchase.paymentMethod },
    ],
  });

  return purchase;
}

export async function updatePurchase(
  purchaseId: string,
  updates: Partial<Purchase>
): Promise<void> {
  const now = new Date().toISOString();
  const payload = stripUndefined({ ...updates, updatedAt: now });

  if (!auth.currentUser) {
    const list = getLocalList<Purchase>(LOCAL_PURCHASES_KEY);
    setLocalList(
      LOCAL_PURCHASES_KEY,
      list.map((p) => (p.id === purchaseId ? { ...p, ...payload } : p))
    );
    return;
  }

  try {
    await updateDoc(doc(db, 'purchases', purchaseId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `purchases/${purchaseId}`);
  }
}

export async function deletePurchase(purchaseId: string): Promise<void> {
  if (!auth.currentUser) {
    const list = getLocalList<Purchase>(LOCAL_PURCHASES_KEY).filter((p) => p.id !== purchaseId);
    setLocalList(LOCAL_PURCHASES_KEY, list);
    return;
  }

  try {
    await deleteDoc(doc(db, 'purchases', purchaseId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `purchases/${purchaseId}`);
  }
}

export async function seedDemoSuppliersAndPurchases(
  userId: string,
  garageId: string = DEFAULT_GARAGE_ID,
  vehicles: Vehicle[] = []
): Promise<void> {
  const findVeh = (makeQuery: string) =>
    vehicles.find((v) => v.make.toLowerCase().includes(makeQuery.toLowerCase()));

  const peugeot = findVeh('Peugeot');
  const renault = findVeh('Renault');
  const vw = findVeh('Volkswagen');
  const audi = findVeh('Audi');

  const sAuction = await createSupplier({
    userId,
    garageId,
    name: 'BCA Enchères France',
    type: 'auction',
    contactPerson: 'Claire Moreau',
    phone: '01 49 90 12 00',
    email: 'pro@bca-enchere.fr',
    city: 'Paris / Mitry-Mory',
    siret: '412 890 123 00041',
    notes: 'Ventes hebdomadaires véhicules de flotte et reprises concessions',
  });

  const sDealership = await createSupplier({
    userId,
    garageId,
    name: 'Lyon Auto Sélection',
    type: 'dealership',
    contactPerson: 'Karim Benali',
    phone: '04 78 55 21 90',
    email: 'reprises@lyon-auto.fr',
    city: 'Lyon',
    siret: '528 331 045 00018',
    notes: 'Partenaire reprise VO multi-marques',
  });

  const sPrivate = await createSupplier({
    userId,
    garageId,
    name: 'Marc Delacroix (Particulier)',
    type: 'private_seller',
    contactPerson: 'Marc Delacroix',
    phone: '06 18 44 72 19',
    city: 'Versailles',
    notes: 'Rachat direct particulier 1ère main',
  });

  const sParts = await createSupplier({
    userId,
    garageId,
    name: 'Autodoc / Oscaro Pro',
    type: 'parts_supplier',
    contactPerson: 'Service Pro',
    phone: '01 76 49 20 20',
    email: 'commandes@oscaro-pro.fr',
    city: 'Gennevilliers',
  });

  const sWorkshop = await createSupplier({
    userId,
    garageId,
    name: 'Atelier Méca Express',
    type: 'workshop',
    contactPerson: 'Laurent Vidal',
    phone: '01 43 22 19 88',
    city: 'Montreuil',
    siret: '811 452 901 00015',
  });

  const sTransport = await createSupplier({
    userId,
    garageId,
    name: 'TransAuto Plateau',
    type: 'transport_company',
    contactPerson: 'Nicolas Bernard',
    phone: '06 72 11 40 55',
    city: 'Orléans',
  });

  // Vehicle Purchases
  await createPurchase({
    userId,
    garageId,
    supplierId: sAuction.id,
    supplierName: sAuction.name,
    supplierType: sAuction.type,
    vehicleId: audi?.id,
    vehicleLabel: audi ? `${audi.make} ${audi.model} (${audi.year})` : 'Audi A3 Sportback (2021)',
    category: 'vehicle',
    description: 'Audi A3 Sportback 35 TFSI — Lot #418',
    amount: audi?.purchasePrice || 18500,
    date: audi?.purchaseDate || '2026-07-05',
    paymentMethod: 'bank_transfer',
    invoiceNumber: 'BCA-2026-0418',
    invoiceProofName: 'Bordereau_Adjudication_BCA_418.pdf',
    vehicleDocuments: [
      { id: 'doc_a1', name: 'Carte_Grise_Barrée_Audi_A3.pdf', url: '', date: '2026-07-05', kind: 'vehicle_doc' },
      { id: 'doc_a2', name: 'Certificat_Cession_Achat_BCA.pdf', url: '', date: '2026-07-05', kind: 'vehicle_doc' },
      { id: 'doc_a3', name: 'Histovec_Audi_A3.pdf', url: '', date: '2026-07-05', kind: 'vehicle_doc' },
    ],
  });

  await createPurchase({
    userId,
    garageId,
    supplierId: sDealership.id,
    supplierName: sDealership.name,
    supplierType: sDealership.type,
    vehicleId: peugeot?.id,
    vehicleLabel: peugeot ? `${peugeot.make} ${peugeot.model} (${peugeot.year})` : 'Peugeot 208 GT (2021)',
    category: 'vehicle',
    description: 'Peugeot 208 GT Line EAT8 — Reprise concession',
    amount: peugeot?.purchasePrice || 11200,
    date: peugeot?.purchaseDate || '2026-10-15',
    paymentMethod: 'bank_transfer',
    invoiceNumber: 'LAS-2026-192',
    invoiceProofName: 'Facture_Reprise_Lyon_Auto_192.pdf',
    vehicleDocuments: [
      { id: 'doc_p1', name: 'Carte_Grise_Peugeot_208.pdf', url: '', date: '2026-10-15', kind: 'vehicle_doc' },
      { id: 'doc_p2', name: 'Declaration_Achat_SIV_208.pdf', url: '', date: '2026-10-15', kind: 'vehicle_doc' },
    ],
  });

  await createPurchase({
    userId,
    garageId,
    supplierId: sPrivate.id,
    supplierName: sPrivate.name,
    supplierType: sPrivate.type,
    vehicleId: renault?.id,
    vehicleLabel: renault ? `${renault.make} ${renault.model} (${renault.year})` : 'Renault Clio V (2020)',
    category: 'vehicle',
    description: 'Renault Clio V TCe 90 — Rachat particulier',
    amount: renault?.purchasePrice || 8900,
    date: renault?.purchaseDate || '2026-09-28',
    paymentMethod: 'check',
    invoiceNumber: 'CERFA-2026-0928',
    invoiceProofName: 'Cheque_Banque_Clio_V.pdf',
    vehicleDocuments: [
      { id: 'doc_r1', name: 'Cerfa_15776_Rachat_Delacroix.pdf', url: '', date: '2026-09-28', kind: 'vehicle_doc' },
      { id: 'doc_r2', name: 'Controle_Technique_Clio_V.pdf', url: '', date: '2026-09-28', kind: 'vehicle_doc' },
    ],
  });

  await createPurchase({
    userId,
    garageId,
    supplierId: sAuction.id,
    supplierName: sAuction.name,
    supplierType: sAuction.type,
    vehicleId: vw?.id,
    vehicleLabel: vw ? `${vw.make} ${vw.model} (${vw.year})` : 'Volkswagen Golf VII (2019)',
    category: 'vehicle',
    description: 'Volkswagen Golf VII 1.6 TDI DSG7 — Lot #205',
    amount: vw?.purchasePrice || 10400,
    date: vw?.purchaseDate || '2026-08-10',
    paymentMethod: 'bank_transfer',
    invoiceNumber: 'BCA-2026-0205',
    invoiceProofName: 'Facture_BCA_Golf_VII.pdf',
    vehicleDocuments: [
      { id: 'doc_g1', name: 'Carte_Grise_Golf_VII.pdf', url: '', date: '2026-08-10', kind: 'vehicle_doc' },
    ],
  });

  // Parts, Workshop & Transport Purchases
  await createPurchase({
    userId,
    garageId,
    supplierId: sParts.id,
    supplierName: sParts.name,
    supplierType: sParts.type,
    vehicleId: peugeot?.id,
    vehicleLabel: peugeot ? `${peugeot.make} ${peugeot.model}` : 'Peugeot 208',
    category: 'parts',
    description: 'Kit disques & plaquettes Brembo + filtres 0W20',
    amount: 235,
    date: '2026-10-17',
    paymentMethod: 'card',
    invoiceNumber: 'OSC-884920',
    invoiceProofName: 'Facture_Oscaro_884920.pdf',
    vehicleDocuments: [],
  });

  await createPurchase({
    userId,
    garageId,
    supplierId: sWorkshop.id,
    supplierName: sWorkshop.name,
    supplierType: sWorkshop.type,
    vehicleId: renault?.id,
    vehicleLabel: renault ? `${renault.make} ${renault.model}` : 'Renault Clio V',
    category: 'repair',
    description: 'Remplacement kit distribution & pompe à eau',
    amount: 500,
    date: '2026-10-03',
    paymentMethod: 'bank_transfer',
    invoiceNumber: 'MECA-2026-74',
    invoiceProofName: 'Facture_Meca_Express_74.pdf',
    vehicleDocuments: [],
  });

  await createPurchase({
    userId,
    garageId,
    supplierId: sTransport.id,
    supplierName: sTransport.name,
    supplierType: sTransport.type,
    vehicleId: peugeot?.id,
    vehicleLabel: peugeot ? `${peugeot.make} ${peugeot.model}` : 'Peugeot 208',
    category: 'transport',
    description: 'Rapatriement plateau Lyon → Paris',
    amount: 180,
    date: '2026-10-16',
    paymentMethod: 'cash',
    invoiceNumber: 'TR-419',
    invoiceProofName: 'Bon_Transport_419.pdf',
    vehicleDocuments: [],
  });
}
