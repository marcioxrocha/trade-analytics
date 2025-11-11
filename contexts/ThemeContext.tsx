import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'analytics_builder_theme';

// Função auxiliar que aplica a classe de tema correta ao elemento raiz do HTML.
const applyThemeClass = (theme: Theme) => {
    const root = window.document.documentElement;
    const isDark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return (storedTheme as Theme) || 'system';
  });

  // Este setter customizado atualiza o localStorage e o estado do React.
  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    setThemeState(newTheme);
  }, []);

  // Efeito para aplicar a classe de tema sempre que o estado do tema mudar.
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // Efeito para ouvir mudanças de tema do SO. Roda apenas uma vez na montagem.
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemChange = () => {
        // Verifica o localStorage diretamente. Se a preferência do usuário for 'system',
        // reavalia e aplica a classe de tema.
        if (localStorage.getItem(THEME_STORAGE_KEY) === 'system') {
            applyThemeClass('system');
        }
    };
    
    mediaQuery.addEventListener('change', handleSystemChange);
    
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, []);

  const value = { theme, setTheme };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
