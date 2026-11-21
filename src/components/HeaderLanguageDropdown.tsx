import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { getHeaderLanguageOption, HEADER_LANGUAGE_OPTIONS } from '../utils/headerUtils';

export const HeaderLanguageDropdown: React.FC = () => {
  const { lang, setLang } = useI18n();
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

  const current = getHeaderLanguageOption(lang);
  const ariaLabel = pickLocalized(lang, {
    fr: 'Langue de l’interface',
    ru: 'Язык интерфейса',
    hy: 'Միջերեսի լեզուն',
    ka: 'ინტერფეისის ენა',
  });

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        data-testid="header-language-btn"
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)]/70 hover:bg-[var(--surface-muted)] border border-[var(--border)] text-xs font-bold text-[var(--foreground)] transition cursor-pointer whitespace-nowrap"
      >
        <Globe className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
        <span data-testid="header-language-code">{current.badge}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={ariaLabel}
          data-testid="header-language-menu"
          className="absolute right-0 mt-2 w-44 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl p-1.5 z-50"
        >
          {HEADER_LANGUAGE_OPTIONS.map((option) => {
            const active = option.code === lang;
            return (
              <button
                key={option.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                data-testid={`header-lang-option-${option.badge.toLowerCase()}`}
                onClick={() => {
                  setLang(option.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition cursor-pointer ${
                  active
                    ? 'bg-[var(--primary)]/15 text-[var(--primary)] font-bold'
                    : 'text-[var(--foreground)] hover:bg-[var(--surface-muted)] font-semibold'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center w-6 h-5 rounded-md bg-[var(--surface-muted)] text-[10px] font-extrabold tracking-wider shrink-0">
                    {option.badge}
                  </span>
                  <span className="truncate">{option.nativeLabel}</span>
                </span>
                {active && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
