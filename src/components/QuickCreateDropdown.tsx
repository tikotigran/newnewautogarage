import React, { useEffect, useRef, useState } from 'react';
import {
  Car,
  ChevronDown,
  FileCode2,
  Handshake,
  Plus,
  Receipt,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

export type QuickCreateAction =
  | 'vehicles'
  | 'purchases'
  | 'sales'
  | 'expenses'
  | 'facturx'
  | 'clients';

interface QuickCreateDropdownProps {
  onSelectAction: (action: QuickCreateAction) => void;
}

export const QuickCreateDropdown: React.FC<QuickCreateDropdownProps> = ({
  onSelectAction,
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const [isOpen, setIsOpen] = useState(false);
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

  const items: {
    id: QuickCreateAction;
    label: string;
    icon: React.ReactNode;
    accentClass: string;
  }[] = [
    {
      id: 'vehicles',
      label: L('+ Véhicules', '+ Автомобили', '+ Ավտոմեքենաներ', '+ ავტომობილები'),
      icon: <Car className="w-4 h-4" />,
      accentClass: 'text-amber-400 bg-amber-500/10',
    },
    {
      id: 'purchases',
      label: L('+ Achats', '+ Покупки', '+ Գնումներ', '+ შესყიդვები'),
      icon: <ShoppingBag className="w-4 h-4" />,
      accentClass: 'text-blue-400 bg-blue-500/10',
    },
    {
      id: 'sales',
      label: L('+ Ventes', '+ Продажи', '+ Վաճառքներ', '+ გაყიდვები'),
      icon: <TrendingUp className="w-4 h-4" />,
      accentClass: 'text-purple-400 bg-purple-500/10',
    },
    {
      id: 'expenses',
      label: L('+ Dépenses', '+ Расходы', '+ Ծախսեր', '+ ხარჯები'),
      icon: <Receipt className="w-4 h-4" />,
      accentClass: 'text-rose-400 bg-rose-500/10',
    },
    {
      id: 'facturx',
      label: L(
        '+ Factures Factur-X',
        '+ Счета Factur-X',
        '+ Factur-X հաշիվներ',
        '+ Factur-X ინვოისები'
      ),
      icon: <FileCode2 className="w-4 h-4" />,
      accentClass: 'text-emerald-400 bg-emerald-500/10',
    },
    {
      id: 'clients',
      label: L('+ Clients', '+ Клиенты', '+ Հաճախորդներ', '+ კლიენტები'),
      icon: <Handshake className="w-4 h-4" />,
      accentClass: 'text-sky-400 bg-sky-500/10',
    },
  ];

  const triggerLabel = L('Ajouter', 'Добавить', 'Ավելացնել', 'დამატება');

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        data-testid="global-quick-create-btn"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
      >
        <Plus className="w-4 h-4 shrink-0" />
        <span>{triggerLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          data-testid="global-quick-create-menu"
          className="absolute right-0 mt-2 w-56 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-testid={`quick-create-item-${item.id}`}
              onClick={() => {
                setIsOpen(false);
                onSelectAction(item.id);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition text-left cursor-pointer"
            >
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${item.accentClass}`}
              >
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
