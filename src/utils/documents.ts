import {
  DocumentBindingType,
  DocumentHistoryEvent,
  GarageDocument,
  GarageDocumentCategory,
  Purchase,
  Vehicle,
} from '../types/garage';
import { DEFAULT_GARAGE_ID } from './garageUtils';

export interface DocumentCategoryMeta {
  id: GarageDocumentCategory;
  labelFr: string;
  labelRu: string;
}

export const DOCUMENT_CATEGORIES: DocumentCategoryMeta[] = [
  { id: 'carte_grise', labelFr: 'Carte grise', labelRu: 'Carte grise (СТС / ПТС)' },
  {
    id: 'certificat_cession',
    labelFr: 'Certificat de cession',
    labelRu: 'Certificat de cession (Договор передачи)',
  },
  {
    id: 'controle_technique',
    labelFr: 'Contrôle technique',
    labelRu: 'Contrôle technique (Техосмотр)',
  },
  { id: 'facture_achat', labelFr: "Factures d'achat", labelRu: 'Счета на покупку' },
  { id: 'facture_reparation', labelFr: 'Factures de réparation', labelRu: 'Счета за ремонт' },
  { id: 'facture_vente', labelFr: 'Factures de vente', labelRu: 'Счета продажи' },
  { id: 'photos_vehicule', labelFr: 'Photos du véhicule', labelRu: 'Фотографии автомобиля' },
  { id: 'contrats', labelFr: 'Contrats', labelRu: 'Договоры и контракты' },
  {
    id: 'justificatif_paiement',
    labelFr: 'Justificatifs de paiement',
    labelRu: 'Подтверждения оплаты',
  },
  {
    id: 'documents_administratifs',
    labelFr: 'Documents administratifs',
    labelRu: 'Административные документы',
  },
];

export function getDocumentCategoryLabel(
  category: GarageDocumentCategory,
  lang: 'fr' | 'ru'
): string {
  const found = DOCUMENT_CATEGORIES.find((c) => c.id === category);
  if (!found) return category;
  return lang === 'ru' ? found.labelRu : found.labelFr;
}

export function filterDocumentsByGarage(
  documents: GarageDocument[],
  activeGarageId: string | null
): GarageDocument[] {
  if (!activeGarageId) return documents;
  return documents.filter((d) =>
    d.garageId ? d.garageId === activeGarageId : activeGarageId === DEFAULT_GARAGE_ID
  );
}

export function filterDocumentHistoryByGarage(
  events: DocumentHistoryEvent[],
  activeGarageId: string | null
): DocumentHistoryEvent[] {
  if (!activeGarageId) return events;
  return events.filter((e) =>
    e.garageId ? e.garageId === activeGarageId : activeGarageId === DEFAULT_GARAGE_ID
  );
}

export function inferCategoryFromFileName(
  fileName: string,
  mimeType: string
): GarageDocumentCategory {
  const lower = fileName.toLowerCase();
  if (lower.includes('carte_grise') || lower.includes('carte grise') || lower.includes('cg_')) {
    return 'carte_grise';
  }
  if (lower.includes('cession') || lower.includes('cerfa')) {
    return 'certificat_cession';
  }
  if (lower.includes('controle') || lower.includes('contrôle') || lower.includes('ct_')) {
    return 'controle_technique';
  }
  if (lower.includes('reparation') || lower.includes('réparation') || lower.includes('atelier')) {
    return 'facture_reparation';
  }
  if (lower.includes('vente')) {
    return 'facture_vente';
  }
  if (lower.includes('achat') || lower.includes('bordereau') || lower.includes('facture')) {
    return 'facture_achat';
  }
  if (lower.includes('paiement') || lower.includes('virement') || lower.includes('cheque') || lower.includes('rib')) {
    return 'justificatif_paiement';
  }
  if (lower.includes('contrat')) {
    return 'contrats';
  }
  if (mimeType.startsWith('image/')) {
    return 'photos_vehicule';
  }
  return 'documents_administratifs';
}

export interface ClientOption {
  name: string;
  email?: string;
  phone?: string;
  vehicleIds: string[];
}

export function extractUniqueClients(
  vehicles: Vehicle[],
  documents: GarageDocument[]
): ClientOption[] {
  const byName = new Map<string, ClientOption>();

  for (const v of vehicles) {
    const rawName = v.buyerInfo?.fullName?.trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();
    const existing = byName.get(key) || {
      name: rawName,
      email: v.buyerInfo?.email?.trim() || undefined,
      phone: v.buyerInfo?.phone?.trim() || undefined,
      vehicleIds: [],
    };
    if (!existing.vehicleIds.includes(v.id)) {
      existing.vehicleIds.push(v.id);
    }
    byName.set(key, existing);
  }

  for (const d of documents) {
    const rawName = d.clientName?.trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();
    const existing = byName.get(key) || {
      name: rawName,
      email: d.clientEmail?.trim() || undefined,
      phone: d.clientPhone?.trim() || undefined,
      vehicleIds: [],
    };
    if (d.vehicleId && !existing.vehicleIds.includes(d.vehicleId)) {
      existing.vehicleIds.push(d.vehicleId);
    }
    byName.set(key, existing);
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function formatVehicleSummaryLabel(v: Vehicle): string {
  const plate = v.registrationNumber ? ` · ${v.registrationNumber}` : '';
  return `${v.make} ${v.model} (${v.year})${plate}`;
}

export function resolveDocumentBinding(params: {
  bindingType: DocumentBindingType;
  vehicleId?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  vehicles: Vehicle[];
}): {
  bindingType: DocumentBindingType;
  vehicleId?: string;
  vehicleLabel?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
} {
  const { bindingType, vehicleId, clientName, clientEmail, clientPhone, vehicles } = params;
  const trimmedClient = clientName?.trim() || '';

  if (bindingType === 'vehicle') {
    const veh = vehicleId ? vehicles.find((v) => v.id === vehicleId) : undefined;
    const buyerName = veh?.buyerInfo?.fullName?.trim();
    return {
      bindingType: 'vehicle',
      vehicleId: veh?.id,
      vehicleLabel: veh ? formatVehicleSummaryLabel(veh) : undefined,
      clientName: trimmedClient || buyerName || undefined,
      clientEmail: clientEmail?.trim() || veh?.buyerInfo?.email?.trim() || undefined,
      clientPhone: clientPhone?.trim() || veh?.buyerInfo?.phone?.trim() || undefined,
    };
  }

  // Binding to client: automatically attach matching vehicle if unambiguous or explicitly chosen
  let veh = vehicleId ? vehicles.find((v) => v.id === vehicleId) : undefined;
  if (!veh && trimmedClient) {
    const matchingVehicles = vehicles.filter(
      (v) => v.buyerInfo?.fullName?.trim().toLowerCase() === trimmedClient.toLowerCase()
    );
    if (matchingVehicles.length === 1) {
      veh = matchingVehicles[0];
    }
  }

  return {
    bindingType: 'client',
    vehicleId: veh?.id,
    vehicleLabel: veh ? formatVehicleSummaryLabel(veh) : undefined,
    clientName: trimmedClient || undefined,
    clientEmail: clientEmail?.trim() || veh?.buyerInfo?.email?.trim() || undefined,
    clientPhone: clientPhone?.trim() || veh?.buyerInfo?.phone?.trim() || undefined,
  };
}

export function validateDocumentInput(input: {
  title: string;
  category: GarageDocumentCategory;
  bindingType: DocumentBindingType;
  vehicleId?: string;
  clientName?: string;
  fileName: string;
  fileUrl: string;
  documentDate: string;
}): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) {
    errors.push('title_required');
  } else if (input.title.trim().length > 160) {
    errors.push('title_too_long');
  }
  if (!DOCUMENT_CATEGORIES.some((c) => c.id === input.category)) {
    errors.push('invalid_category');
  }
  if (input.bindingType === 'vehicle' && !input.vehicleId?.trim()) {
    errors.push('vehicle_required');
  }
  if (input.bindingType === 'client' && !input.clientName?.trim()) {
    errors.push('client_required');
  }
  if (!input.fileName.trim() || !input.fileUrl.trim()) {
    errors.push('file_required');
  }
  if (!input.documentDate.trim()) {
    errors.push('date_required');
  }
  return errors;
}

export function searchAndFilterDocuments(params: {
  documents: GarageDocument[];
  query: string;
  category: 'all' | GarageDocumentCategory;
  bindingType: 'all' | DocumentBindingType;
  vehicleId: string;
  clientName: string;
}): GarageDocument[] {
  const { documents, query, category, bindingType, vehicleId, clientName } = params;
  const q = query.trim().toLowerCase();

  return documents.filter((doc) => {
    if (category !== 'all' && doc.category !== category) return false;
    if (bindingType !== 'all' && doc.bindingType !== bindingType) return false;
    if (vehicleId && doc.vehicleId !== vehicleId) return false;
    if (
      clientName &&
      (doc.clientName || '').trim().toLowerCase() !== clientName.trim().toLowerCase()
    ) {
      return false;
    }
    if (q) {
      const haystack = [
        doc.title,
        doc.fileName,
        doc.vehicleLabel || '',
        doc.clientName || '',
        doc.clientEmail || '',
        doc.notes || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export interface MissingDocumentReminder {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  vehicleStatus: Vehicle['status'];
  clientName?: string;
  category: GarageDocumentCategory;
  severity: 'high' | 'medium';
  reasonFr: string;
  reasonRu: string;
}

function textMatchesCategory(text: string, category: GarageDocumentCategory): boolean {
  const s = text.toLowerCase();
  switch (category) {
    case 'carte_grise':
      return s.includes('carte_grise') || s.includes('carte grise') || s.includes('cg_');
    case 'certificat_cession':
      return s.includes('cession') || s.includes('cerfa');
    case 'controle_technique':
      return s.includes('controle_technique') || s.includes('contrôle') || s.includes('controle');
    case 'facture_achat':
      return s.includes('facture_achat') || s.includes('bordereau') || s.includes('facture_reprise') || s.includes('facture_bca');
    case 'facture_reparation':
      return s.includes('reparation') || s.includes('réparation') || s.includes('meca');
    case 'facture_vente':
      return s.includes('facture_vente') || s.includes('facture vente');
    case 'justificatif_paiement':
      return s.includes('paiement') || s.includes('cheque') || s.includes('virement');
    default:
      return false;
  }
}

export function computeMissingDocumentReminders(params: {
  vehicles: Vehicle[];
  documents: GarageDocument[];
  purchases?: Purchase[];
}): MissingDocumentReminder[] {
  const { vehicles, documents, purchases = [] } = params;
  const reminders: MissingDocumentReminder[] = [];

  for (const v of vehicles) {
    const vehDocs = documents.filter((d) => d.vehicleId === v.id);
    const vehPurchases = purchases.filter((p) => p.vehicleId === v.id);
    const vehicleLabel = formatVehicleSummaryLabel(v);
    const clientName = v.buyerInfo?.fullName?.trim() || undefined;

    const hasCategory = (cat: GarageDocumentCategory): boolean => {
      if (vehDocs.some((d) => d.category === cat)) return true;

      if (cat === 'photos_vehicule' && Array.isArray(v.photos) && v.photos.length > 0) {
        return true;
      }

      if (cat === 'facture_achat') {
        if (
          vehPurchases.some(
            (p) =>
              p.category === 'vehicle' &&
              Boolean(p.invoiceProofName || p.invoiceNumber || p.invoiceProofUrl)
          )
        ) {
          return true;
        }
      }

      if (
        Array.isArray(v.documents) &&
        v.documents.some((vd) => textMatchesCategory(vd.name || '', cat))
      ) {
        return true;
      }

      if (
        vehPurchases.some((p) =>
          (p.vehicleDocuments || []).some((pd) => textMatchesCategory(pd.name || '', cat))
        )
      ) {
        return true;
      }

      return false;
    };

    const checks: {
      category: GarageDocumentCategory;
      required: boolean;
      severity: 'high' | 'medium';
      reasonFr: string;
      reasonRu: string;
    }[] = [
      {
        category: 'carte_grise',
        required: true,
        severity: v.status === 'for_sale' || v.status === 'sold' ? 'high' : 'medium',
        reasonFr: 'Indispensable pour le dossier du véhicule',
        reasonRu: 'Обязательно для досье автомобиля',
      },
      {
        category: 'facture_achat',
        required: true,
        severity: 'medium',
        reasonFr: "Justificatif d'acquisition et TVA / marge",
        reasonRu: 'Подтверждение цены покупки и расчёта маржи',
      },
      {
        category: 'photos_vehicule',
        required: v.status === 'for_sale' || v.status === 'preparation',
        severity: v.status === 'for_sale' ? 'high' : 'medium',
        reasonFr: 'Photos requises pour la mise en vente',
        reasonRu: 'Фотографии нужны для публикации объявления',
      },
      {
        category: 'controle_technique',
        required: v.status === 'for_sale' || v.status === 'sold',
        severity: 'high',
        reasonFr: 'Contrôle technique obligatoire avant cession',
        reasonRu: 'Техосмотр обязателен перед продажей во Франции',
      },
      {
        category: 'facture_reparation',
        required: (Number(v.repairCostTotal) || 0) > 0,
        severity: 'medium',
        reasonFr: 'Travaux enregistrés sans facture atelier jointe',
        reasonRu: 'Зафиксирован ремонт, но не приложен счёт сервиса',
      },
      {
        category: 'certificat_cession',
        required: v.status === 'sold',
        severity: 'high',
        reasonFr: 'Véhicule vendu sans certificat de cession archivé',
        reasonRu: 'Авто продано, но не загружен Certificat de cession',
      },
      {
        category: 'facture_vente',
        required: v.status === 'sold',
        severity: 'high',
        reasonFr: 'Véhicule vendu sans facture de vente archivée',
        reasonRu: 'Авто продано, но не приложен счёт продажи',
      },
      {
        category: 'justificatif_paiement',
        required: v.status === 'sold',
        severity: 'medium',
        reasonFr: 'Preuve de règlement client manquante',
        reasonRu: 'Нет подтверждения оплаты от покупателя',
      },
    ];

    for (const chk of checks) {
      if (chk.required && !hasCategory(chk.category)) {
        reminders.push({
          id: `rem_${v.id}_${chk.category}`,
          vehicleId: v.id,
          vehicleLabel,
          vehicleStatus: v.status,
          clientName,
          category: chk.category,
          severity: chk.severity,
          reasonFr: chk.reasonFr,
          reasonRu: chk.reasonRu,
        });
      }
    }
  }

  return reminders.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
    return a.vehicleLabel.localeCompare(b.vehicleLabel);
  });
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
