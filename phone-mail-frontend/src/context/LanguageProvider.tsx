import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  readLanguage,
  saveLanguage,
  translate,
  type LanguageCode,
  type TranslationKey,
} from '../utils/i18n';

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState(readLanguage);

  const setLanguage = useCallback((nextLanguage: LanguageCode) => {
    saveLanguage(nextLanguage);
    setCurrentLanguage(nextLanguage);
  }, []);

  const t = useCallback((key: TranslationKey) => translate(key, language), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within <LanguageProvider>');
  return context;
}
