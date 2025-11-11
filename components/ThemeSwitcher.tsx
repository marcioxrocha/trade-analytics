import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import Icon from './Icon';

const ThemeSwitcher: React.FC = () => {
  const { theme, setTheme } = useTheme();
  
  const themes = [
    { name: 'light', icon: 'light_mode' },
    { name: 'dark', icon: 'dark_mode' },
    { name: 'system', icon: 'desktop_windows' },
  ] as const;

  return (
    <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-full p-1">
      {themes.map((t) => (
        <button
          key={t.name}
          onClick={() => setTheme(t.name)}
          className={`p-1.5 rounded-full transition-colors ${
            theme === t.name
              ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
          }`}
          aria-pressed={theme === t.name}
          title={`Set theme to ${t.name}`}
        >
          <Icon name={t.icon} className="w-5 h-5" />
        </button>
      ))}
    </div>
  );
};

export default ThemeSwitcher;
