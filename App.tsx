
import React from 'react';
import DashboardView from './components/DashboardView';
import { useLanguage } from './contexts/LanguageContext';

const App: React.FC = () => {
  const { language } = useLanguage();

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
            <DashboardView instanceKey="main" department="Sales" owner="j.doe" />
        </main>
      </div>
    </div>
  );
};

export default App;