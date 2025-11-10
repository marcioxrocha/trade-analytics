import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useDashboardModal } from '../contexts/ModalContext';
import { useLanguage } from '../contexts/LanguageContext';
import { View } from '../types';
import Icon from './Icon';
import DashboardGrid from './DashboardGrid';
import QueryEditorView from './SqlEditorView';
import SettingsView from './SettingsView';
import EnvironmentVariablesView from './EnvironmentVariablesView';

interface DashboardViewContentProps {
  instanceKey?: string;
  department?: string;
  owner?: string;
}

const DashboardViewContent: React.FC<DashboardViewContentProps> = ({ instanceKey, department, owner }) => {
    const { 
        addDashboard,
        whiteLabelSettings,
    } = useAppContext();
    const { showModal, hideModal } = useDashboardModal();
    const { t } = useLanguage();
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const modalInputRef = useRef<HTMLInputElement>(null);
    const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
    const fabContainerRef = useRef<HTMLDivElement>(null);
    

    // Effect to close FAB menu on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (fabContainerRef.current && !fabContainerRef.current.contains(event.target as Node)) {
                setIsFabMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleNavigate = (view: View) => {
        setCurrentView(view);
    };
    
    const handleAddCard = () => {
        setEditingCardId(null);
        handleNavigate('query-editor');
    };

    const handleEditCard = (cardId: string) => {
        setEditingCardId(cardId);
        handleNavigate('query-editor');
    };

    const handleFinishEditing = () => {
        setEditingCardId(null);
        setCurrentView('dashboard');
    };
    
    const handleSaveNewDashboard = () => {
        const name = modalInputRef.current?.value.trim();
        if (name) {
            addDashboard(name);
            hideModal();
        }
    };

    const handleAddNewDashboard = () => {
        showModal({
            title: t('dashboard.addModalTitle'),
            content: (
                <input
                    ref={modalInputRef}
                    type="text"
                    className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600"
                    placeholder={t('dashboard.newDashboardPrompt')}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveNewDashboard()}
                />
            ),
            footer: (
                <>
                    <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                    <button onClick={handleSaveNewDashboard} className="px-4 py-2 btn-brand text-white rounded-md">{t('modal.create')}</button>
                </>
            )
        });
        setTimeout(() => modalInputRef.current?.focus(), 100);
    };

    const navItems: { view: View; labelKey: string }[] = [
        { view: 'dashboard', labelKey: 'sidebar.dashboards' },
        { view: 'query-editor', labelKey: 'sidebar.queryEditor' },
        { view: 'settings', labelKey: 'sidebar.settings' },
        { view: 'env-variables', labelKey: 'sidebar.envVars' },
    ];
    
    const brandStyles = useMemo(() => `
        .btn-brand {
            background-color: ${whiteLabelSettings.brandColor};
            transition-property: all;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
            transition-duration: 150ms;
        }
        .btn-brand:hover:not(:disabled) {
            filter: brightness(95%);
        }
        .text-brand {
            color: ${whiteLabelSettings.brandColor};
        }
        .border-brand {
            border-color: ${whiteLabelSettings.brandColor};
        }
    `, [whiteLabelSettings.brandColor]);
    
    return (
        <div className="flex flex-col h-full w-full relative">
            <style>{brandStyles}</style>
            <header className="flex-shrink-0 bg-white dark:bg-gray-800 shadow-md p-2 flex items-center justify-between z-10">
                <nav className="flex items-center gap-1 sm:gap-2">
                    {navItems.map(item => (
                        <button
                            key={item.view}
                            onClick={() => item.view === 'query-editor' ? handleAddCard() : handleNavigate(item.view)}
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentView === item.view ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            {t(item.labelKey)}
                        </button>
                    ))}
                </nav>
            </header>
            <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
                {currentView === 'dashboard' && <DashboardGrid onEditCard={handleEditCard} onAddCard={handleAddCard} onAddNewDashboard={handleAddNewDashboard} department={department} owner={owner} />}
                {currentView === 'query-editor' && <QueryEditorView editingCardId={editingCardId} onFinishEditing={handleFinishEditing} department={department} owner={owner} />}
                {currentView === 'settings' && <SettingsView />}
                {currentView === 'env-variables' && <EnvironmentVariablesView department={department} owner={owner} />}
            </div>
             {currentView === 'dashboard' && (
                <div
                    ref={fabContainerRef}
                    className="fixed bottom-6 right-6 z-20 flex flex-col items-center"
                >
                    {/* Menu Items Container */}
                    <div className={`flex flex-col items-end gap-y-3 mb-4 transition-all duration-300 ease-in-out ${isFabMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none'}`}>
                        
                        {/* New Dashboard Option */}
                        <div className="flex items-center gap-x-3 cursor-pointer"
                                onClick={() => {
                                    handleAddNewDashboard();
                                    setIsFabMenuOpen(false);
                                }}>
                            <span className="px-3 py-1.5 bg-white dark:bg-gray-700 text-sm font-semibold rounded-md shadow-md whitespace-nowrap">{t('dashboard.newDashboard')}</span>
                            <button
                                className="bg-white dark:bg-gray-600 text-brand w-12 h-12 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                                aria-label={t('dashboard.newDashboard')}
                                title={t('dashboard.newDashboard')}
                            >
                                <Icon name="dashboard" className="w-6 h-6" />
                            </button>
                        </div>
                        
                        {/* Add Insight Option */}
                        <div className="flex items-center gap-x-3 cursor-pointer"
                                onClick={() => {
                                    handleAddCard();
                                    setIsFabMenuOpen(false);
                                }}>
                            <span className="px-3 py-1.5 bg-white dark:bg-gray-700 text-sm font-semibold rounded-md shadow-md whitespace-nowrap">{t('dashboard.addInsight')}</span>
                            <button
                                className="bg-white dark:bg-gray-600 text-brand w-12 h-12 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                                aria-label={t('dashboard.addInsight')}
                                title={t('dashboard.addInsight')}
                            >
                                <Icon name="new_question" className="w-6 h-6" />
                            </button>
                        </div>

                    </div>

                    {/* Main FAB */}
                    <button
                        onClick={() => setIsFabMenuOpen(prev => !prev)}
                        className="btn-brand text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-transform duration-300"
                        style={{ transform: isFabMenuOpen ? 'rotate(45deg)' : 'none' }}
                        aria-haspopup="true"
                        aria-expanded={isFabMenuOpen}
                        aria-label="Open actions menu"
                    >
                        <Icon name="add" className="w-7 h-7" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default DashboardViewContent;