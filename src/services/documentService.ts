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
  DocumentBindingType,
  DocumentHistoryAction,
  DocumentHistoryEvent,
  GarageDocument,
  GarageDocumentCategory,
  Vehicle,
} from '../types/garage';
import { generateId } from './garageService';
import { logEntityChange, logUserActivity } from './auditAndBackupService';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';
import { formatVehicleSummaryLabel } from '../utils/documents';
import { computeEntityFieldDiffs } from '../utils/exportBackup';

const LOCAL_DOCUMENTS_KEY = 'autogarage_documents_store';
const LOCAL_DOCUMENT_HISTORY_KEY = 'autogarage_document_history_store';
const LOCAL_DOCUMENTS_EVENT = 'autogarage_documents_updated';

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

function setLocalList<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event(LOCAL_DOCUMENTS_EVENT));
  } catch (e) {
    console.warn('localStorage document write error:', e);
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

export function subscribeDocuments(
  userId: string,
  onData: (documents: GarageDocument[]) => void,
  onError?: (err: unknown) => void
) {
  if (auth.currentUser) {
    const collectionPath = 'garage_documents';
    const q = query(collection(db, collectionPath), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: GarageDocument[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as GarageDocument), id: docSnap.id });
        });
        list.sort((a, b) => (b.documentDate || b.createdAt).localeCompare(a.documentDate || a.createdAt));
        onData(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      }
    );
  }

  const emitLocal = () => {
    const list = getLocalList<GarageDocument>(LOCAL_DOCUMENTS_KEY);
    list.sort((a, b) => (b.documentDate || b.createdAt).localeCompare(a.documentDate || a.createdAt));
    onData(list);
  };
  emitLocal();
  window.addEventListener(LOCAL_DOCUMENTS_EVENT, emitLocal);
  return () => window.removeEventListener(LOCAL_DOCUMENTS_EVENT, emitLocal);
}

export function subscribeDocumentHistory(
  userId: string,
  onData: (events: DocumentHistoryEvent[]) => void,
  onError?: (err: unknown) => void
) {
  if (auth.currentUser) {
    const collectionPath = 'document_history';
    const q = query(collection(db, collectionPath), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: DocumentHistoryEvent[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as DocumentHistoryEvent), id: docSnap.id });
        });
        list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        onData(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      }
    );
  }

  const emitLocal = () => {
    const list = getLocalList<DocumentHistoryEvent>(LOCAL_DOCUMENT_HISTORY_KEY);
    list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    onData(list);
  };
  emitLocal();
  window.addEventListener(LOCAL_DOCUMENTS_EVENT, emitLocal);
  return () => window.removeEventListener(LOCAL_DOCUMENTS_EVENT, emitLocal);
}

async function appendHistoryEvent(input: {
  userId: string;
  garageId?: string;
  documentId: string;
  documentTitle: string;
  category: GarageDocumentCategory;
  action: DocumentHistoryAction;
  actorEmail?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  clientName?: string;
  details?: string;
}): Promise<DocumentHistoryEvent> {
  const id = generateId('dochis');
  const event: DocumentHistoryEvent = stripUndefined({
    id,
    userId: input.userId,
    garageId: input.garageId || DEFAULT_GARAGE_ID,
    documentId: input.documentId,
    documentTitle: input.documentTitle.slice(0, 160),
    category: input.category,
    action: input.action,
    timestamp: new Date().toISOString(),
    actorEmail: input.actorEmail?.trim() || undefined,
    vehicleId: input.vehicleId || undefined,
    vehicleLabel: input.vehicleLabel?.trim() || undefined,
    clientName: input.clientName?.trim() || undefined,
    details: input.details?.trim() || undefined,
  });

  if (!auth.currentUser) {
    const list = getLocalList<DocumentHistoryEvent>(LOCAL_DOCUMENT_HISTORY_KEY);
    setLocalList(LOCAL_DOCUMENT_HISTORY_KEY, [event, ...list].slice(0, 500));
    return event;
  }

  try {
    await setDoc(doc(db, 'document_history', id), event);
    return event;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `document_history/${id}`);
    return event;
  }
}

export async function createGarageDocument(input: {
  userId: string;
  garageId?: string;
  actorEmail?: string;
  title: string;
  category: GarageDocumentCategory;
  bindingType: DocumentBindingType;
  vehicleId?: string;
  vehicleLabel?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  documentDate: string;
  notes?: string;
}): Promise<GarageDocument> {
  const id = generateId('gdoc');
  const now = new Date().toISOString();
  const documentItem: GarageDocument = stripUndefined({
    id,
    userId: input.userId,
    garageId: input.garageId || DEFAULT_GARAGE_ID,
    title: input.title.trim(),
    category: input.category,
    bindingType: input.bindingType,
    vehicleId: input.vehicleId || undefined,
    vehicleLabel: input.vehicleLabel?.trim() || undefined,
    clientName: input.clientName?.trim() || undefined,
    clientEmail: input.clientEmail?.trim() || undefined,
    clientPhone: input.clientPhone?.trim() || undefined,
    fileName: input.fileName.trim(),
    mimeType: input.mimeType || 'application/octet-stream',
    fileSize: Number(input.fileSize) || 0,
    fileUrl: input.fileUrl,
    documentDate: input.documentDate,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  });

  if (!auth.currentUser) {
    const list = getLocalList<GarageDocument>(LOCAL_DOCUMENTS_KEY);
    setLocalList(LOCAL_DOCUMENTS_KEY, [documentItem, ...list]);
  } else {
    try {
      await setDoc(doc(db, 'garage_documents', id), documentItem);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `garage_documents/${id}`);
    }
  }

  await appendHistoryEvent({
    userId: documentItem.userId,
    garageId: documentItem.garageId,
    documentId: documentItem.id,
    documentTitle: documentItem.title,
    category: documentItem.category,
    action: 'uploaded',
    actorEmail: input.actorEmail,
    vehicleId: documentItem.vehicleId,
    vehicleLabel: documentItem.vehicleLabel,
    clientName: documentItem.clientName,
    details: documentItem.fileName,
  });

  void logUserActivity({
    userId: documentItem.userId,
    garageId: documentItem.garageId,
    actorEmail: input.actorEmail,
    action: 'document_uploaded',
    entityType: 'document',
    entityId: documentItem.id,
    targetLabel: documentItem.title,
    details: `${documentItem.category} · ${documentItem.fileName}`,
  });

  void logEntityChange({
    userId: documentItem.userId,
    garageId: documentItem.garageId,
    actorEmail: input.actorEmail,
    operation: 'create',
    entityType: 'document',
    entityId: documentItem.id,
    entityLabel: documentItem.title,
    changes: [
      { field: 'category', oldValue: '—', newValue: documentItem.category },
      { field: 'fileName', oldValue: '—', newValue: documentItem.fileName },
    ],
  });

  return documentItem;
}

export async function updateGarageDocument(
  existingDoc: GarageDocument,
  updates: Partial<GarageDocument>,
  actorEmail?: string
): Promise<void> {
  const now = new Date().toISOString();
  const payload = stripUndefined({ ...updates, updatedAt: now });

  if (!auth.currentUser) {
    const list = getLocalList<GarageDocument>(LOCAL_DOCUMENTS_KEY);
    setLocalList(
      LOCAL_DOCUMENTS_KEY,
      list.map((d) => (d.id === existingDoc.id ? { ...d, ...payload } : d))
    );
  } else {
    try {
      await updateDoc(doc(db, 'garage_documents', existingDoc.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `garage_documents/${existingDoc.id}`);
    }
  }

  const bindingChanged =
    (updates.vehicleId !== undefined && updates.vehicleId !== existingDoc.vehicleId) ||
    (updates.clientName !== undefined && updates.clientName !== existingDoc.clientName);

  await appendHistoryEvent({
    userId: existingDoc.userId,
    garageId: existingDoc.garageId,
    documentId: existingDoc.id,
    documentTitle: updates.title || existingDoc.title,
    category: updates.category || existingDoc.category,
    action: bindingChanged ? 'linked' : 'updated',
    actorEmail,
    vehicleId: updates.vehicleId ?? existingDoc.vehicleId,
    vehicleLabel: updates.vehicleLabel ?? existingDoc.vehicleLabel,
    clientName: updates.clientName ?? existingDoc.clientName,
    details: updates.fileName || existingDoc.fileName,
  });

  const docDiffs = computeEntityFieldDiffs(
    existingDoc as unknown as Record<string, unknown>,
    { ...existingDoc, ...updates } as unknown as Record<string, unknown>,
    ['title', 'category', 'bindingType', 'vehicleLabel', 'clientName', 'documentDate', 'notes']
  );
  if (docDiffs.length > 0) {
    void logEntityChange({
      userId: existingDoc.userId,
      garageId: existingDoc.garageId,
      actorEmail,
      operation: 'update',
      entityType: 'document',
      entityId: existingDoc.id,
      entityLabel: updates.title || existingDoc.title,
      changes: docDiffs,
    });
  }
}

export async function deleteGarageDocument(
  documentItem: GarageDocument,
  actorEmail?: string
): Promise<void> {
  if (!auth.currentUser) {
    const list = getLocalList<GarageDocument>(LOCAL_DOCUMENTS_KEY).filter(
      (d) => d.id !== documentItem.id
    );
    setLocalList(LOCAL_DOCUMENTS_KEY, list);
  } else {
    try {
      await deleteDoc(doc(db, 'garage_documents', documentItem.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `garage_documents/${documentItem.id}`);
    }
  }

  await appendHistoryEvent({
    userId: documentItem.userId,
    garageId: documentItem.garageId,
    documentId: documentItem.id,
    documentTitle: documentItem.title,
    category: documentItem.category,
    action: 'deleted',
    actorEmail,
    vehicleId: documentItem.vehicleId,
    vehicleLabel: documentItem.vehicleLabel,
    clientName: documentItem.clientName,
    details: documentItem.fileName,
  });

  void logEntityChange({
    userId: documentItem.userId,
    garageId: documentItem.garageId,
    actorEmail,
    operation: 'delete',
    entityType: 'document',
    entityId: documentItem.id,
    entityLabel: documentItem.title,
    changes: [{ field: 'status', oldValue: 'active', newValue: 'deleted' }],
  });
}

export async function recordDocumentDownload(
  documentItem: GarageDocument,
  actorEmail?: string
): Promise<void> {
  await appendHistoryEvent({
    userId: documentItem.userId,
    garageId: documentItem.garageId,
    documentId: documentItem.id,
    documentTitle: documentItem.title,
    category: documentItem.category,
    action: 'downloaded',
    actorEmail,
    vehicleId: documentItem.vehicleId,
    vehicleLabel: documentItem.vehicleLabel,
    clientName: documentItem.clientName,
    details: documentItem.fileName,
  });
}

/**
 * Generates a valid single-page PDF Data URL containing clear ASCII summary text
 * so inline preview and download work offline without external requests.
 */
function buildSamplePdfDataUrl(lines: string[]): string {
  const sanitizeAscii = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

  const textOps = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 15 : 11} Tf 50 ${760 - i * 24} Td (${sanitizeAscii(line)}) Tj ET`)
    .join('\n');

  const streamContent = `${textOps}\n`;
  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${streamContent.length} >> stream\n${streamContent}endstream endobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objs) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return `data:application/pdf;base64,${btoa(body)}`;
}

function buildSampleSvgImageDataUrl(title: string, subtitle: string, accent: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
    <rect width="800" height="500" rx="20" fill="#0f172a"/>
    <rect x="24" y="24" width="752" height="452" rx="14" fill="#1e293b" stroke="${accent}" stroke-width="3"/>
    <rect x="52" y="56" width="220" height="32" rx="8" fill="${accent}"/>
    <text x="162" y="77" fill="#ffffff" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">AUTOGARAGE VAULT</text>
    <text x="52" y="150" fill="#f8fafc" font-family="Arial, sans-serif" font-size="28" font-weight="bold">${esc(title)}</text>
    <text x="52" y="195" fill="#94a3b8" font-family="Arial, sans-serif" font-size="18">${esc(subtitle)}</text>
    <line x1="52" y1="240" x2="748" y2="240" stroke="#334155" stroke-width="2"/>
    <text x="52" y="290" fill="#cbd5e1" font-family="monospace" font-size="15">ARCHIVE NUMERIQUE CERTIFIEE • CONFORMITE GARAGE FRANCE</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export async function seedDemoDocuments(
  userId: string,
  garageId: string = DEFAULT_GARAGE_ID,
  vehicles: Vehicle[] = [],
  actorEmail?: string
): Promise<void> {
  const findVeh = (q: string) =>
    vehicles.find((v) => v.make.toLowerCase().includes(q.toLowerCase()));

  const peugeot = findVeh('Peugeot') || vehicles[0];
  const renault = findVeh('Renault') || vehicles[1] || vehicles[0];
  const audi = findVeh('Audi') || vehicles.find((v) => v.status === 'sold') || vehicles[0];
  const vw = findVeh('Volkswagen') || vehicles[2] || vehicles[0];

  const today = new Date().toISOString().split('T')[0];

  if (peugeot) {
    const label = formatVehicleSummaryLabel(peugeot);
    await createGarageDocument({
      userId,
      garageId,
      actorEmail,
      title: `Carte grise — ${peugeot.make} ${peugeot.model}`,
      category: 'carte_grise',
      bindingType: 'vehicle',
      vehicleId: peugeot.id,
      vehicleLabel: label,
      fileName: `Carte_Grise_${peugeot.registrationNumber || '208'}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 184200,
      fileUrl: buildSamplePdfDataUrl([
        'CERTIFICAT D IMMATRICULATION (CARTE GRISE)',
        `Vehicule: ${label}`,
        `VIN (E): ${peugeot.vin || 'VF3CCYHZPLT018294'}`,
        `Date document: ${peugeot.purchaseDate || today}`,
      ]),
      documentDate: peugeot.purchaseDate || today,
      notes: 'Carte grise originale barrée à l’achat',
    });

    await createGarageDocument({
      userId,
      garageId,
      actorEmail,
      title: `Facture d'achat — ${peugeot.make} ${peugeot.model}`,
      category: 'facture_achat',
      bindingType: 'vehicle',
      vehicleId: peugeot.id,
      vehicleLabel: label,
      fileName: `Facture_Achat_${peugeot.make}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 142500,
      fileUrl: buildSamplePdfDataUrl([
        'FACTURE D ACHAT VEHICULE OCCASION',
        `Vehicule: ${label}`,
        `Montant HT/TTC: ${peugeot.purchasePrice} EUR`,
        `Date: ${peugeot.purchaseDate || today}`,
      ]),
      documentDate: peugeot.purchaseDate || today,
    });
  }

  if (renault) {
    const label = formatVehicleSummaryLabel(renault);
    await createGarageDocument({
      userId,
      garageId,
      actorEmail,
      title: `Contrôle technique favorable — ${renault.make} ${renault.model}`,
      category: 'controle_technique',
      bindingType: 'vehicle',
      vehicleId: renault.id,
      vehicleLabel: label,
      fileName: `CT_${renault.make}_${renault.model}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 215400,
      fileUrl: buildSamplePdfDataUrl([
        'PROCES-VERBAL DE CONTROLE TECHNIQUE',
        `Vehicule: ${label}`,
        'Resultat: FAVORABLE (A)',
        `Date CT: ${today}`,
      ]),
      documentDate: today,
    });

    await createGarageDocument({
      userId,
      garageId,
      actorEmail,
      title: `Facture atelier distribution — ${renault.make} ${renault.model}`,
      category: 'facture_reparation',
      bindingType: 'vehicle',
      vehicleId: renault.id,
      vehicleLabel: label,
      fileName: `Facture_Reparation_Atelier_${renault.model}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 128000,
      fileUrl: buildSamplePdfDataUrl([
        'FACTURE ATELIER MECA EXPRESS',
        `Vehicule: ${label}`,
        'Prestation: Kit distribution + pompe a eau',
        'Total TTC: 500 EUR',
      ]),
      documentDate: today,
    });
  }

  if (audi) {
    const label = formatVehicleSummaryLabel(audi);
    const clientName = audi.buyerInfo?.fullName || 'Jean-Baptiste Laurent';
    await createGarageDocument({
      userId,
      garageId,
      actorEmail,
      title: `Bon de commande & Contrat de vente — ${clientName}`,
      category: 'contrats',
      bindingType: 'client',
      vehicleId: audi.id,
      vehicleLabel: label,
      clientName,
      clientEmail: audi.buyerInfo?.email || 'jb.laurent@mail.fr',
      clientPhone: audi.buyerInfo?.phone || '06 42 18 90 11',
      fileName: `Contrat_Vente_${clientName.replace(/\s+/g, '_')}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 196800,
      fileUrl: buildSamplePdfDataUrl([
        'CONTRAT DE VENTE VEHICULE D OCCASION',
        `Client: ${clientName}`,
        `Vehicule: ${label}`,
        `Date: ${audi.buyerInfo?.saleDate || today}`,
      ]),
      documentDate: audi.buyerInfo?.saleDate || today,
      notes: 'Signé en concession',
    });

    await createGarageDocument({
      userId,
      garageId,
      actorEmail,
      title: `Photo livraison 3/4 avant — ${audi.make} ${audi.model}`,
      category: 'photos_vehicule',
      bindingType: 'vehicle',
      vehicleId: audi.id,
      vehicleLabel: label,
      clientName,
      fileName: `Photo_Livraison_${audi.make}_${audi.model}.svg`,
      mimeType: 'image/svg+xml',
      fileSize: 86400,
      fileUrl: buildSampleSvgImageDataUrl(
        `${audi.make} ${audi.model} (${audi.year})`,
        `Client: ${clientName} • Etat showroom`,
        '#2563eb'
      ),
      documentDate: audi.buyerInfo?.saleDate || today,
    });
  }

  if (vw) {
    const label = formatVehicleSummaryLabel(vw);
    await createGarageDocument({
      userId,
      garageId,
      actorEmail,
      title: `Récépissé Déclaration d'Achat SIV — ${vw.make} ${vw.model}`,
      category: 'documents_administratifs',
      bindingType: 'vehicle',
      vehicleId: vw.id,
      vehicleLabel: label,
      fileName: `Declaration_Achat_SIV_${vw.make}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 112000,
      fileUrl: buildSamplePdfDataUrl([
        'ACCUSE D ENREGISTREMENT DECLARATION D ACHAT (DA SIV)',
        `Vehicule: ${label}`,
        'Statut: Enregistre ANTS',
        `Date: ${vw.purchaseDate || today}`,
      ]),
      documentDate: vw.purchaseDate || today,
    });
  }
}
