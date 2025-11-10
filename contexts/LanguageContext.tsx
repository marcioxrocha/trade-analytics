import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

type Language = 'en' | 'pt';

// Helper to get nested property from a string path like 'a.b.c'
const get = (obj: any, path: string) => path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, replacements?: { [key: string]: string }) => string;
  isReady: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('pt'); // Default to Portuguese
  const [translations, setTranslations] = useState<{ en: any; pt: any } | null>(null);

  useEffect(() => {
    const loadTranslations = async () => {
      try {
        const [enResponse, ptResponse] = await Promise.all([
          fetch('./locales/en.json'),
          fetch('./locales/pt.json')
        ]);
        if (!enResponse.ok || !ptResponse.ok) {
            console.error("Failed to load translation files.");
            setTranslations({ en: {}, pt: {} }); // Set empty to avoid loop
            return;
        }
        const en = await enResponse.json();
        const pt = await ptResponse.json();
        setTranslations({ en, pt });
      } catch (error) {
        console.error("Error fetching translation files:", error);
      }
    };

    loadTranslations();
  }, []);


  const t = (key: string, replacements?: { [key: string]: string }): string => {
    if (!translations) {
      return key; // Return key while translations are loading
    }

    let translation = get(translations[language], key);
    if (!translation) {
      if (translations) {
        // console.warn(`Translation key "${key}" not found for language "${language}". Falling back to English.`);
      }
      translation = get(translations['en'], key);
    }

    if (!translation) {
      return key; // Return the key itself if no translation is found in any language
    }

    if (replacements) {
        Object.keys(replacements).forEach(rKey => {
            // Use a regex to replace all occurrences of {key}
            const regex = new RegExp(`\\{${rKey}\\}`, 'g');
            translation = translation.replace(regex, replacements[rKey]);
        });
    }

    return translation;
  };

  const isReady = translations !== null;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isReady }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};