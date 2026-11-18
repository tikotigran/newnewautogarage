import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { getIntlLocale, pickLocalized } from '../utils/i18nUtils';
import {
  formatIsoToLocaleDate,
  formatTypingDateInput,
  getCalendarDaysGrid,
  getDatePlaceholder,
  getDateSeparator,
  parseLocaleDateToIso,
} from '../utils/dateInputUtils';

interface LocaleDateInputProps {
  id?: string;
  testId?: string;
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  ariaLabel?: string;
  required?: boolean;
}

export const LocaleDateInput: React.FC<LocaleDateInputProps> = ({
  id,
  testId,
  value,
  onChange,
  className = '',
  ariaLabel,
  required = false,
}) => {
  const { lang } = useI18n();
  const separator = getDateSeparator(lang);
  const placeholder = getDatePlaceholder(lang);

  const [displayText, setDisplayText] = useState(() => formatIsoToLocaleDate(value, lang));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const initialDate = useMemo(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
      return { year: Number(match[1]), monthZero: Number(match[2]) - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), monthZero: now.getMonth() };
  }, [value]);

  const [viewYear, setViewYear] = useState(initialDate.year);
  const [viewMonthZero, setViewMonthZero] = useState(initialDate.monthZero);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDisplayText(formatIsoToLocaleDate(value, lang));
  }, [value, lang]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    setViewYear(initialDate.year);
    setViewMonthZero(initialDate.monthZero);
  }, [isCalendarOpen, initialDate.year, initialDate.monthZero]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isCalendarOpen]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextFormatted = formatTypingDateInput(e.target.value, displayText, separator);
    setDisplayText(nextFormatted);

    if (nextFormatted.trim() === '') {
      onChange('');
      return;
    }

    const parsedIso = parseLocaleDateToIso(nextFormatted);
    if (parsedIso) {
      onChange(parsedIso);
    }
  };

  const handleBlur = () => {
    if (displayText.trim() === '') {
      if (value !== '') onChange('');
      return;
    }
    const parsedIso = parseLocaleDateToIso(displayText);
    if (parsedIso) {
      if (parsedIso !== value) onChange(parsedIso);
      setDisplayText(formatIsoToLocaleDate(parsedIso, lang));
    } else {
      setDisplayText(formatIsoToLocaleDate(value, lang));
    }
  };

  const weekdayLabels = useMemo(
    () =>
      pickLocalized(lang, {
        fr: ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'],
        ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
        hy: ['Եր', 'Եք', 'Չո', 'Հն', 'Ու', 'Շբ', 'Կի'],
        ka: ['ორ', 'სა', 'ოთ', 'ხუ', 'პა', 'შა', 'კვ'],
      }),
    [lang]
  );

  const monthTitle = useMemo(() => {
    const dt = new Date(Date.UTC(viewYear, viewMonthZero, 1));
    return new Intl.DateTimeFormat(getIntlLocale(lang), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dt);
  }, [viewYear, viewMonthZero, lang]);

  const calendarCells = useMemo(
    () => getCalendarDaysGrid(viewYear, viewMonthZero),
    [viewYear, viewMonthZero]
  );

  const handlePrevMonth = () => {
    if (viewMonthZero === 0) {
      setViewMonthZero(11);
      setViewYear((y) => Math.max(1900, y - 1));
    } else {
      setViewMonthZero((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonthZero === 11) {
      setViewMonthZero(0);
      setViewYear((y) => Math.min(2100, y + 1));
    } else {
      setViewMonthZero((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const iso = `${String(viewYear).padStart(4, '0')}-${String(viewMonthZero + 1).padStart(
      2,
      '0'
    )}-${String(day).padStart(2, '0')}`;
    onChange(iso);
    setDisplayText(formatIsoToLocaleDate(iso, lang));
    setIsCalendarOpen(false);
  };

  const todayIso = new Date().toISOString().split('T')[0];

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        data-testid={testId}
        data-iso-value={value}
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        required={required}
        aria-required={required || undefined}
        value={displayText}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={10}
        className={`${className} pr-10 tabular-nums`}
      />
      <button
        type="button"
        data-testid={testId ? `${testId}-picker-btn` : undefined}
        aria-label={pickLocalized(lang, {
          fr: 'Ouvrir le calendrier',
          ru: 'Открыть календарь',
          hy: 'Բացել օրացույցը',
          ka: 'კალენდრის გახსნა',
        })}
        onClick={() => setIsCalendarOpen((prev) => !prev)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
      >
        <Calendar className="w-4 h-4" />
      </button>

      {isCalendarOpen && (
        <div
          role="dialog"
          aria-label={monthTitle}
          className="absolute right-0 bottom-full mb-1.5 z-50 w-64 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-2xl p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold capitalize text-[var(--foreground)]">
              {monthTitle}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdayLabels.map((wd) => (
              <span
                key={wd}
                className="text-[10px] font-bold text-[var(--muted-foreground)] py-0.5"
              >
                {wd}
              </span>
            ))}
            {calendarCells.map((day, idx) => {
              if (day === null) {
                return <span key={`empty-${idx}`} className="h-7" />;
              }
              const cellIso = `${String(viewYear).padStart(4, '0')}-${String(
                viewMonthZero + 1
              ).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = cellIso === value;
              const isToday = cellIso === todayIso;
              return (
                <button
                  key={cellIso}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 rounded-lg text-xs font-medium tabular-nums transition cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-bold'
                      : isToday
                      ? 'border border-[var(--primary)]/50 text-[var(--primary)] hover:bg-[var(--surface-muted)]'
                      : 'text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="pt-1.5 border-t border-[var(--border)] flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setDisplayText('');
                setIsCalendarOpen(false);
              }}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] font-medium cursor-pointer"
            >
              {pickLocalized(lang, {
                fr: 'Effacer',
                ru: 'Очистить',
                hy: 'Մաքրել',
                ka: 'გასუფთავება',
              })}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(todayIso);
                setDisplayText(formatIsoToLocaleDate(todayIso, lang));
                setIsCalendarOpen(false);
              }}
              className="text-[var(--primary)] hover:underline font-bold cursor-pointer"
            >
              {pickLocalized(lang, {
                fr: 'Aujourd’hui',
                ru: 'Сегодня',
                hy: 'Այսօր',
                ka: 'დღეს',
              })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
