import { createContext, useContext, useState } from 'react';
import translations from '../i18n';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('catchup-lang') || 'en');

  function setLanguage(l) {
    setLang(l);
    localStorage.setItem('catchup-lang', l);
  }

  function t(key) {
    return translations[lang]?.[key] || translations.en[key] || key;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
