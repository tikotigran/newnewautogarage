import { UserActivityLog, Vehicle } from '../types/garage';
import { Language, pickLocalized } from './i18nUtils';

export type HeaderLanguageBadge = 'FR' | 'RU' | 'AM' | 'GE';

export interface HeaderLanguageOption {
  code: Language;
  badge: HeaderLanguageBadge;
  nativeLabel: string;
}

export const HEADER_LANGUAGE_OPTIONS: HeaderLanguageOption[] = [
  { code: 'fr', badge: 'FR', nativeLabel: 'Français' },
  { code: 'ru', badge: 'RU', nativeLabel: 'Русский' },
  { code: 'hy', badge: 'AM', nativeLabel: 'Հայերեն' },
  { code: 'ka', badge: 'GE', nativeLabel: 'ქართული' },
];

export function getHeaderLanguageOption(lang: Language): HeaderLanguageOption {
  return (
    HEADER_LANGUAGE_OPTIONS.find((item) => item.code === lang) || HEADER_LANGUAGE_OPTIONS[0]
  );
}

export type WorkspaceNotificationKind = 'prep' | 'repair' | 'incomplete' | 'activity';

export interface WorkspaceNotificationItem {
  id: string;
  kind: WorkspaceNotificationKind;
  title: string;
  description: string;
  vehicleId?: string;
  timestampMs: number;
}

function toTimestampMs(value?: string | number | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function buildWorkspaceNotifications(params: {
  vehicles: Vehicle[];
  activityLogs?: UserActivityLog[];
  lang: Language;
  maxItems?: number;
}): WorkspaceNotificationItem[] {
  const { vehicles, activityLogs = [], lang, maxItems = 8 } = params;
  const items: WorkspaceNotificationItem[] = [];

  for (const vehicle of vehicles) {
    const label = `${vehicle.make} ${vehicle.model}`.trim();
    const plate = vehicle.registrationNumber?.trim();
    const displayTitle = plate ? `${label} (${plate})` : label;
    const vehTs = toTimestampMs(vehicle.updatedAt) || toTimestampMs(vehicle.createdAt);

    if (vehicle.status === 'repair') {
      items.push({
        id: `veh-repair-${vehicle.id}`,
        kind: 'repair',
        title: displayTitle,
        description: pickLocalized(lang, {
          fr: 'Véhicule actuellement en réparation atelier',
          ru: 'Автомобиль находится в ремонте',
          hy: 'Ավտոմեքենան գտնվում է վերանորոգման փուլում',
          ka: 'ავტომობილი იმყოფება შეკეთების პროცესში',
        }),
        vehicleId: vehicle.id,
        timestampMs: vehTs,
      });
    } else if (vehicle.status === 'preparation') {
      items.push({
        id: `veh-prep-${vehicle.id}`,
        kind: 'prep',
        title: displayTitle,
        description: pickLocalized(lang, {
          fr: 'En préparation avant mise en vente',
          ru: 'В подготовке к выставлению на продажу',
          hy: 'Նախապատրաստվում է վաճառքի համար',
          ka: 'გასაყიდად მზადების პროცესშია',
        }),
        vehicleId: vehicle.id,
        timestampMs: vehTs,
      });
    }

    if (vehicle.status !== 'sold' && (!vehicle.vin?.trim() || !vehicle.registrationNumber?.trim())) {
      items.push({
        id: `veh-missing-${vehicle.id}`,
        kind: 'incomplete',
        title: displayTitle,
        description: pickLocalized(lang, {
          fr: 'VIN ou immatriculation manquant pour les documents Cerfa',
          ru: 'Не заполнен VIN или госномер для документов Cerfa',
          hy: 'Պակասում է VIN կամ պետհամարանիշը Cerfa փաստաթղթերի համար',
          ka: 'Cerfa დოკუმენტებისთვის აკლია VIN ან სახელმწიფო ნომერი',
        }),
        vehicleId: vehicle.id,
        timestampMs: vehTs - 1,
      });
    }
  }

  for (const log of activityLogs.slice(0, 5)) {
    items.push({
      id: `log-${log.id}`,
      kind: 'activity',
      title: log.targetLabel || log.action,
      description: log.details || log.action,
      vehicleId: log.entityType === 'vehicle' ? log.entityId : undefined,
      timestampMs: toTimestampMs(log.timestamp),
    });
  }

  items.sort((a, b) => b.timestampMs - a.timestampMs);
  return items.slice(0, maxItems);
}

export function countUnreadNotifications(
  items: WorkspaceNotificationItem[],
  readIds: ReadonlySet<string>
): number {
  let count = 0;
  for (const item of items) {
    if (!readIds.has(item.id)) count += 1;
  }
  return count;
}
