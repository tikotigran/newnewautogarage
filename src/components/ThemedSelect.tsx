import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface ThemedSelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface ThemedSelectProps<T extends string = string> {
  id?: string;
  value: T;
  options: ThemedSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  triggerClassName?: string;
  menuClassName?: string;
  testId?: string;
  stopPropagation?: boolean;
}

export function ThemedSelect<T extends string = string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  triggerClassName = '',
  menuClassName = '',
  testId,
  stopPropagation = false,
}: ThemedSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value)
    )
  );
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    minWidth: number;
    openUpward: boolean;
  }>({ top: 0, left: 0, minWidth: 168, openUpward: false });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length * 36 + 12, 260);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    const minWidth = Math.max(rect.width, 168);
    const maxLeft = Math.max(8, window.innerWidth - minWidth - 8);
    const left = Math.min(Math.max(8, rect.left), maxLeft);

    setCoords({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left,
      minWidth,
      openUpward,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const idx = options.findIndex((o) => o.value === value);
    setHighlightedIndex(idx >= 0 ? idx : 0);
  }, [open, value, options.length]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % Math.max(1, options.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          (prev - 1 + Math.max(1, options.length)) % Math.max(1, options.length)
        );
      } else if (e.key === 'Enter' || e.key === ' ') {
        const focusedInMenu = menuRef.current?.contains(document.activeElement);
        if (focusedInMenu || document.activeElement === triggerRef.current) {
          e.preventDefault();
          const chosen = options[highlightedIndex];
          if (chosen) {
            onChange(chosen.value);
          }
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    const onScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, highlightedIndex, options, onChange]);

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`inline-flex items-center justify-between gap-2 text-left transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--primary)] ${triggerClassName}`}
      >
        <span className="truncate">{selectedOption?.label ?? ''}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 opacity-80 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            data-testid={testId ? `${testId}-menu` : 'themed-select-menu'}
            onClick={(e) => {
              if (stopPropagation) e.stopPropagation();
            }}
            style={{
              position: 'fixed',
              top: coords.openUpward ? undefined : coords.top,
              bottom: coords.openUpward ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              minWidth: coords.minWidth,
            }}
            className={`z-[9999] max-w-[calc(100vw-16px)] max-h-64 overflow-y-auto bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl shadow-2xl p-1 ${menuClassName}`}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={(e) => {
                    if (stopPropagation) e.stopPropagation();
                    onChange(opt.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--surface-muted)] text-[var(--foreground)] font-bold'
                      : isHighlighted
                      ? 'bg-[var(--surface-muted)] text-[var(--foreground)] font-semibold'
                      : 'bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-muted)] font-medium'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
