import { Language, pickLocalized } from './i18nUtils';

export function getDateSeparator(lang: Language): '/' | '.' {
  return lang === 'fr' ? '/' : '.';
}

export function getDatePlaceholder(lang: Language): string {
  return pickLocalized(lang, {
    fr: 'jj/mm/aaaa',
    ru: 'дд.мм.гггг',
    hy: 'օր.ամ.տարի',
    ka: 'დდ.თთ.წწწწ',
  });
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatIsoToLocaleDate(isoDate: string, lang: Language): string {
  const trimmed = isoDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return '';
  const [, yyyy, mm, dd] = match;
  const sep = getDateSeparator(lang);
  return `${dd}${sep}${mm}${sep}${yyyy}`;
}

export function parseLocaleDateToIso(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // Accept DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const dmyMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Also accept YYYY-MM-DD if pasted
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

export function formatTypingDateInput(
  nextRaw: string,
  prevValue: string,
  separator: '/' | '.'
): string {
  const prevDigits = prevValue.replace(/\D/g, '');
  const nextDigits = nextRaw.replace(/\D/g, '');

  // Preserve natural backspace when deleting digits or deleting a trailing separator
  if (
    nextDigits.length < prevDigits.length ||
    (nextRaw.length === prevValue.length - 1 && prevValue.startsWith(nextRaw))
  ) {
    return nextRaw.replace(/[^\d./-]/g, '').slice(0, 10);
  }

  const digits = nextDigits.slice(0, 8);
  if (digits.length <= 2) {
    return digits.length === 2 ? `${digits}${separator}` : digits;
  }
  if (digits.length <= 4) {
    const base = `${digits.slice(0, 2)}${separator}${digits.slice(2)}`;
    return digits.length === 4 ? `${base}${separator}` : base;
  }
  return `${digits.slice(0, 2)}${separator}${digits.slice(2, 4)}${separator}${digits.slice(4)}`;
}

export function getCalendarDaysGrid(viewYear: number, viewMonthZeroBased: number): (number | null)[] {
  const firstDayOfMonth = new Date(Date.UTC(viewYear, viewMonthZeroBased, 1));
  // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startOffset = (firstDayOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonthZeroBased + 1, 0)).getUTCDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}
