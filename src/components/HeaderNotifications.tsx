import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Clock, Wrench, AlertTriangle, Activity } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { UserActivityLog, Vehicle } from '../types/garage';
import {
  buildWorkspaceNotifications,
  countUnreadNotifications,
  WorkspaceNotificationItem,
} from '../utils/headerUtils';

interface HeaderNotificationsProps {
  vehicles: Vehicle[];
  activityLogs: UserActivityLog[];
  onSelectVehicleId?: (vehicleId: string) => void;
}

const READ_STORAGE_KEY = 'autogarage_notifications_read_ids';

export const HeaderNotifications: React.FC<HeaderNotificationsProps> = ({
  vehicles,
  activityLogs,
  onSelectVehicleId,
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(READ_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
      }
    } catch {
      // ignore
    }
    return [];
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const notifications = useMemo(
    () => buildWorkspaceNotifications({ vehicles, activityLogs, lang }),
    [vehicles, activityLogs, lang]
  );

  const readSet = useMemo(() => new Set(readIds), [readIds]);
  const unreadCount = useMemo(
    () => countUnreadNotifications(notifications, readSet),
    [notifications, readSet]
  );

  const persistReadIds = (nextIds: string[]) => {
    const trimmed = Array.from(new Set(nextIds)).slice(-100);
    setReadIds(trimmed);
    try {
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = () => {
    persistReadIds([...readIds, ...notifications.map((n) => n.id)]);
  };

  const handleItemClick = (item: WorkspaceNotificationItem) => {
    if (!readSet.has(item.id)) {
      persistReadIds([...readIds, item.id]);
    }
    setIsOpen(false);
    if (item.vehicleId && onSelectVehicleId) {
      onSelectVehicleId(item.vehicleId);
    }
  };

  const renderKindIcon = (kind: WorkspaceNotificationItem['kind']) => {
    if (kind === 'repair') {
      return (
        <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
          <Wrench className="w-3.5 h-3.5" />
        </span>
      );
    }
    if (kind === 'prep') {
      return (
        <span className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
          <Clock className="w-3.5 h-3.5" />
        </span>
      );
    }
    if (kind === 'incomplete') {
      return (
        <span className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-3.5 h-3.5" />
        </span>
      );
    }
    return (
      <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
        <Activity className="w-3.5 h-3.5" />
      </span>
    );
  };

  const titleLabel = L('Notifications', 'Уведомления', 'Ծանուցումներ', 'შეტყობინებები');

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        data-testid="header-notifications-btn"
        aria-label={titleLabel}
        title={titleLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)]/70 hover:bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--foreground)] transition cursor-pointer"
      >
        <Bell className="w-4 h-4 text-[var(--secondary-foreground)]" />
        {unreadCount > 0 && (
          <span
            data-testid="header-notifications-badge"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-extrabold leading-none flex items-center justify-center shadow-sm tabular-nums"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={titleLabel}
          data-testid="header-notifications-menu"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-50"
        >
          <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-[var(--foreground)] truncate">
                {titleLabel}
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--primary)]/15 text-[var(--primary)] tabular-nums">
                  {unreadCount}
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                data-testid="header-notifications-mark-read"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] hover:underline cursor-pointer shrink-0"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>
                  {L('Tout lire', 'Прочитать все', 'Կարդալ բոլորը', 'ყველას წაკითხვა')}
                </span>
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div
              data-testid="header-notifications-empty"
              className="px-4 py-6 text-center space-y-1.5"
            >
              <Bell className="w-5 h-5 text-[var(--muted-foreground)] mx-auto opacity-60" />
              <p className="text-xs font-semibold text-[var(--foreground)]">
                {L(
                  'Aucune notification',
                  'Нет новых уведомлений',
                  'Նոր ծանուցումներ չկան',
                  'ახალი შეტყობინებები არ არის'
                )}
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {L(
                  'Tous vos véhicules et dossiers sont à jour.',
                  'Все автомобили и документы в порядке.',
                  'Բոլոր մեքենաներն ու փաստաթղթերը թարմացված են։',
                  'ყველა ავტომობილი და დოკუმენტი განახლებულია.'
                )}
              </p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]/60 p-1.5">
              {notifications.map((item) => {
                const isUnread = !readSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`header-notification-item-${item.id}`}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left transition cursor-pointer ${
                      isUnread
                        ? 'bg-[var(--surface-muted)]/45 hover:bg-[var(--surface-muted)]'
                        : 'hover:bg-[var(--surface-muted)]/60 opacity-75'
                    }`}
                  >
                    {renderKindIcon(item.kind)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="text-xs font-bold text-[var(--foreground)] truncate">
                          {item.title}
                        </p>
                        {isUnread && (
                          <span
                            aria-hidden="true"
                            className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--muted-foreground)] leading-snug mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
