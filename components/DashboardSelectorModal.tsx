import React, { useState, useMemo } from 'react';
import { Dashboard } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import Icon from './Icon';

interface DashboardSelectorModalProps {
    dashboards: Dashboard[];
    onSelect: (dashboardId: string) => void;
    onClose: () => void;
    onAddDashboard: () => void;
}

const DashboardSelectorModal: React.FC<DashboardSelectorModalProps> = ({ dashboards, onSelect, onAddDashboard }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const { t } = useLanguage();

    const filteredDashboards = useMemo(() => {
        if (!searchTerm) {
            return dashboards;
        }
        return dashboards.filter(d =>
            d.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [dashboards, searchTerm]);

    return (
        <div className="flex flex-col">
            <div className="relative mb-4">
                <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('dashboard.searchPlaceholder')}
                    className="w-full p-2 pl-10 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                    autoFocus
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Icon name="search" className="w-5 h-5 text-gray-400" />
                </div>
            </div>
            <div className="flex-grow">
                <ul className="space-y-2 max-h-80 overflow-y-auto">
                    {filteredDashboards.length > 0 ? (
                        filteredDashboards.map(d => (
                            <li key={d.id}>
                                <button
                                    onClick={() => onSelect(d.id)}
                                    className="w-full text-left p-3 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                >
                                    {d.name}
                                </button>
                            </li>
                        ))
                    ) : (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">{t('dashboard.noResults')}</p>
                    )}
                </ul>
            </div>
             <div className="mt-4 border-t pt-4 dark:border-gray-600">
                <button 
                    onClick={onAddDashboard} 
                    className="w-full flex justify-center items-center btn-brand text-white px-4 py-2 rounded-md font-semibold transition-all shadow"
                >
                    <Icon name="add" className="w-5 h-5 mr-2" />
                    {t('dashboard.createNewDashboard')}
                </button>
            </div>
        </div>
    );
};

export default DashboardSelectorModal;