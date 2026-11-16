export type Language = 'fr' | 'ru' | 'hy' | 'ka';

export const LANGUAGE_STORAGE_KEY = 'autogarage_lang';

export interface LanguageOptionMeta {
  code: Language;
  shortCode: 'RU' | 'FR' | 'GE' | 'HY';
  nativeLabel: string;
  menuLabel: string;
  intlLocale: string;
}

export const SUPPORTED_LANGUAGES: LanguageOptionMeta[] = [
  {
    code: 'ru',
    shortCode: 'RU',
    nativeLabel: 'Русский',
    menuLabel: 'Русский (RU)',
    intlLocale: 'ru-RU',
  },
  {
    code: 'fr',
    shortCode: 'FR',
    nativeLabel: 'Français',
    menuLabel: 'Français (FR)',
    intlLocale: 'fr-FR',
  },
  {
    code: 'ka',
    shortCode: 'GE',
    nativeLabel: 'ქართული',
    menuLabel: 'ქართული / Georgian (GE)',
    intlLocale: 'ka-GE',
  },
  {
    code: 'hy',
    shortCode: 'HY',
    nativeLabel: 'Հայերեն',
    menuLabel: 'Հայերեն / Armenian (HY)',
    intlLocale: 'hy-AM',
  },
];

export function isSupportedLanguage(val: unknown): val is Language {
  return val === 'fr' || val === 'ru' || val === 'hy' || val === 'ka';
}

export function getLanguageMeta(lang: Language): LanguageOptionMeta {
  return SUPPORTED_LANGUAGES.find((item) => item.code === lang) || SUPPORTED_LANGUAGES[1];
}

export function getIntlLocale(lang: Language): string {
  switch (lang) {
    case 'ru':
      return 'ru-RU';
    case 'hy':
      return 'hy-AM';
    case 'ka':
      return 'ka-GE';
    case 'fr':
    default:
      return 'fr-FR';
  }
}

function matchLanguageTag(rawTag: string): Language | null {
  const normalized = rawTag.trim().toLowerCase();
  if (!normalized) return null;
  const primary = normalized.split(/[-_]/)[0];
  if (primary === 'hy' || primary === 'hye' || primary === 'arm') return 'hy';
  if (primary === 'ka' || primary === 'kat' || primary === 'geo') return 'ka';
  if (primary === 'ru' || primary === 'rus') return 'ru';
  if (primary === 'fr' || primary === 'fra' || primary === 'fre') return 'fr';
  return null;
}

export function detectBrowserLanguage(
  navigatorLanguages?: readonly string[] | string | null,
  fallback: Language = 'fr'
): Language {
  if (!navigatorLanguages) return fallback;
  const candidates = Array.isArray(navigatorLanguages)
    ? navigatorLanguages
    : [navigatorLanguages];

  for (const tag of candidates) {
    if (typeof tag !== 'string') continue;
    const matched = matchLanguageTag(tag);
    if (matched) return matched;
  }

  return fallback;
}

export function resolveInitialLanguage(
  storedLang?: string | null,
  navigatorLanguages?: readonly string[] | string | null,
  fallback: Language = 'fr'
): Language {
  if (isSupportedLanguage(storedLang)) {
    return storedLang;
  }
  return detectBrowserLanguage(navigatorLanguages, fallback);
}

export function pickLocalized<T>(
  lang: Language,
  map: { fr: T; ru: T; hy: T; ka: T }
): T {
  return map[lang] ?? map.fr;
}
