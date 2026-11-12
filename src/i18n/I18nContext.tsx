import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from './translations';
import { GlobalTextOverrides } from '../types/garage';
import { subscribeGlobalTextOverrides } from '../services/adminService';
import { resolveLocalizedColor, resolveLocalizedLabel } from '../utils/adminUtils';

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations.fr, params?: Record<string, string | number>) => string;
  getTextColor: (key: keyof typeof translations.fr) => string | undefined;
  getTextStyle: (key: keyof typeof translations.fr) => React.CSSProperties | undefined;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('autogarage_lang');
      if (saved === 'fr' || saved === 'ru') return saved;
    } catch {
      // ignore
    }
    return 'fr';
  });

  const [textOverrides, setTextOverrides] = useState<GlobalTextOverrides>({});

  useEffect(() => {
    const unsub = subscribeGlobalTextOverrides((overrides) => {
      setTextOverrides(overrides);
    });
    return () => unsub();
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem('autogarage_lang', newLang);
    } catch {
      // ignore
    }
  };

  const t = (key: keyof typeof translations.fr, params?: Record<string, string | number>): string => {
    const dict = translations[lang] || translations.fr;
    const baseText = dict[key] || translations.fr[key] || (key as string);
    let text = resolveLocalizedLabel(key as string, lang, baseText, textOverrides);

    if (params) {
      Object.entries(params).forEach(([paramKey, val]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
      });
    }

    return text;
  };

  const getTextColor = (key: keyof typeof translations.fr): string | undefined => {
    return resolveLocalizedColor(key as string, textOverrides);
  };

  const getTextStyle = (key: keyof typeof translations.fr): React.CSSProperties | undefined => {
    const color = resolveLocalizedColor(key as string, textOverrides);
    return color ? { color } : undefined;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t, getTextColor, getTextStyle }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
