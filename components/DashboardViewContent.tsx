
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useDashboardModal } from '../contexts/ModalContext';
import { useLanguage } from '../contexts/LanguageContext';
import { View, Variable, DashboardFormattingSettings, Dashboard, ExportData } from '../types';
import Icon from './Icon';
import DashboardGrid from './DashboardGrid';
import SqlEditorView from './SqlEditorView';
import SettingsView from './SettingsView';
import EnvironmentVariablesView from './EnvironmentVariablesView';
import ScriptLibraryView from './ScriptLibraryView';
import SaveStatusIndicator from './SaveStatusIndicator';
import { substituteVariablesInQuery } from '../services/queryService';
import { DEFAULT_FORMATTING_SETTINGS } from '../services/formattingService';
import Modal from './Modal';
import VariablesManager from './VariablesManager';
import FormattingSettingsManager from './FormattingSettingsManager';
import DashboardExportImportModal from './ExportImportModal';

interface DashboardViewContentProps {
  instanceKey?: string;
  department?: string;
  owner?: string;
}

const DashboardViewContent: React.FC<DashboardViewContentProps> = ({ instanceKey, department, owner }) => {
    const { 
        addDashboard,
        whiteLabelSettings,
        allowDashboardManagement,
        allowDataSourceManagement,
        showInfoScreen,
        dashboards,
        activeDashboardId,
        setActiveDashboardId,
        updateDashboardName,
        removeDashboard,
        duplicateDashboard,
        reorderDashboards,
        variables,
        updateAllVariables,
        updateActiveDashboardSettings,
        syncAllChanges,
        hasUnsyncedChanges,
        exportDashboards,
        importDashboards,
        apiConfig,
    } = useAppContext();
    
    const { showModal, hideModal } = useDashboardModal();
    const { t } = useLanguage();
    
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
    const fabContainerRef = useRef<HTMLDivElement>(null);

    // State for Tabs & Menu moved from DashboardGrid
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const [editingTabId, setEditingTabId] = useState<string | null>(null);
    const [tempTabName, setTempTabName] = useState("");
    const tabNameInputRef = useRef<HTMLInputElement>(null);
    const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

    // Modals State
    const [isVariablesModalOpen, setIsVariablesModalOpen] = useState(false);
    const [tempVariables, setTempVariables] = useState<Variable[]>([]);
    const [isFormattingModalOpen, setIsFormattingModalOpen] = useState(false);
    const [tempFormattingSettings, setTempFormattingSettings] = useState<DashboardFormattingSettings>(DEFAULT_FORMATTING_SETTINGS);
    const [isExportImportModalOpen, setIsExportImportModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'export' | 'import'>('export');
    const modalInputRef = useRef<HTMLInputElement>(null);

    const activeDashboard = useMemo(() => dashboards.find(d => d.id === activeDashboardId), [dashboards, activeDashboardId]);

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (fabContainerRef.current && !fabContainerRef.current.contains(event.target as Node)) {
                setIsFabMenuOpen(false);
            }
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Focus input when editing tab name
    useEffect(() => {
        if (editingTabId && tabNameInputRef.current) {
            tabNameInputRef.current.focus();
            tabNameInputRef.current.select();
        }
    }, [editingTabId]);

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

    // --- Dashboard Management Handlers ---

    const handleTabClick = (id: string) => {
        if (activeDashboardId !== id) {
            setActiveDashboardId(id);
            setCurrentView('dashboard'); // Ensure we go to dashboard view when switching tabs
        }
    };

    const handleTabDoubleClick = (dashboard: Dashboard) => {
        if (!allowDashboardManagement) return;
        setEditingTabId(dashboard.id);
        setTempTabName(dashboard.name);
    };

    const handleTabNameSave = () => {
        if (editingTabId && tempTabName.trim()) {
            updateDashboardName(editingTabId, tempTabName.trim());
        }
        setEditingTabId(null);
    };

    const handleTabNameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleTabNameSave();
        if (e.key === 'Escape') setEditingTabId(null);
    };

    const handleAddNewDashboard = () => {
        const index = dashboards.length + 1;
        const name = t('dashboard.defaultNamePattern', { index: String(index) });
        addDashboard(name);
        // Scroll to end logic could be added here
    };

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
        if (editingTabId) {
            e.preventDefault();
            return;
        }
        setDraggedTabId(id);
        e.dataTransfer.effectAllowed = "move";
        // Optional: set custom drag image
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
        e.preventDefault();
        if (!draggedTabId || draggedTabId === targetId) return;

        const currentOrder = dashboards.map(d => d.id);
        const fromIndex = currentOrder.indexOf(draggedTabId);
        const toIndex = currentOrder.indexOf(targetId);

        if (fromIndex === -1 || toIndex === -1) return;

        const newOrder = [...currentOrder];
        newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, draggedTabId);

        reorderDashboards(newOrder);
        setDraggedTabId(null);
    };

    const handleDragEnd = () => {
        setDraggedTabId(null);
    };


    // --- Menu Actions Handlers ---

    const handleRemoveCurrentDashboard = () => {
        setIsMenuOpen(false);
        if (!activeDashboard) return;
        showModal({
            title: t('dashboard.deleteModalTitle'),
            content: <p>{t('dashboard.deleteConfirm', { name: activeDashboard.name })}</p>,
            footer: (
                <>
                    <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                    <button onClick={() => { if(activeDashboard) removeDashboard(activeDashboard.id); hideModal(); }} className="px-4 py-2 bg-red-600 text-white rounded-md">{t('modal.delete')}</button>
                </>
            )
        });
    };

    const handleSaveAs = () => {
        setIsMenuOpen(false);
        if (!activeDashboard) return;

        const handleConfirmSaveAs = () => {
            const newName = modalInputRef.current?.value.trim();
            if (newName && activeDashboardId) {
                duplicateDashboard(activeDashboardId, newName);
                hideModal();
            }
        };

        showModal({
            title: t('dashboard.saveAsModalTitle'),
            content: (
                <input
                    ref={modalInputRef}
                    type="text"
                    defaultValue={`${activeDashboard.name} - Copy`}
                    className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600"
                    placeholder={t('dashboard.saveAsPrompt')}
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmSaveAs()}
                />
            ),
            footer: (
                 <>
                    <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                    <button onClick={handleConfirmSaveAs} className="px-4 py-2 btn-brand text-white rounded-md">{t('modal.save')}</button>
                </>
            )
        });
        setTimeout(() => modalInputRef.current?.focus(), 100);
    };

    const handleConfirmSync = async () => {
        setIsMenuOpen(false);
        try {
            await syncAllChanges();
            showModal({
                title: t('modal.saveSuccessTitle'),
                content: <p>{t('modal.saveSuccess')}</p>,
                footer: <button onClick={hideModal} className="px-4 py-2 btn-brand text-white rounded-md">{t('modal.ok')}</button>
            });
        } catch (error) {
            showModal({
                title: t('modal.saveErrorTitle'),
                content: <p>{(error as Error).message}</p>,
                footer: <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.ok')}</button>
            });
        }
    };

    const handleOpenVariablesModal = () => {
        setIsMenuOpen(false);
        if (!activeDashboardId) return;
        const currentVars = variables.filter(v => v.dashboardId === activeDashboardId);
        setTempVariables(currentVars);
        setIsVariablesModalOpen(true);
    };

    const handleSaveVariables = () => {
        if (activeDashboardId) {
            updateAllVariables(activeDashboardId, tempVariables);
        }
        setIsVariablesModalOpen(false);
    };

    const handleOpenFormattingModal = () => {
        setIsMenuOpen(false);
        if (!activeDashboard) return;
        setTempFormattingSettings(activeDashboard.formattingSettings);
        setIsFormattingModalOpen(true);
    };

    const handleSaveFormatting = () => {
        updateActiveDashboardSettings(tempFormattingSettings);
        setIsFormattingModalOpen(false);
    };

    const handleOpenExportModal = () => {
        setIsMenuOpen(false);
        setModalMode('export');
        setIsExportImportModalOpen(true);
    };

    const handleOpenImportModal = () => {
        setIsMenuOpen(false);
        setModalMode('import');
        setIsExportImportModalOpen(true);
    };

    const handleConfirmExport = (selectedIds: string[]) => {
        exportDashboards(selectedIds);
        setIsExportImportModalOpen(false);
    };
    
    const handleConfirmImport = (data: ExportData, selectedItems: Dashboard[]) => {
        importDashboards(data, selectedItems);
        setIsExportImportModalOpen(false);
    };

    // --- Render Helpers ---

    const navItems = useMemo(() => {
        const items: { view: View; labelKey: string }[] = [
            { view: 'dashboard', labelKey: 'sidebar.dashboards' },
        ];
        if (allowDashboardManagement) {
             items.push(
                { view: 'query-editor', labelKey: 'sidebar.queryEditor' },
                { view: 'script-library', labelKey: 'sidebar.scriptLibrary' }
             );
        }
        if (allowDashboardManagement || allowDataSourceManagement) {
            items.push({ view: 'settings', labelKey: 'sidebar.settings' });
        }
        if (showInfoScreen) {
            items.push({ view: 'env-variables', labelKey: 'sidebar.envVars' });
        }
        return items;
    }, [allowDashboardManagement, allowDataSourceManagement, showInfoScreen]);

    useEffect(() => {
        if (!navItems.some(item => item.view === currentView)) {
            setCurrentView('dashboard');
        }
    }, [navItems, currentView]);
    
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
        .tab-active {
            border-bottom: 2px solid ${whiteLabelSettings.brandColor};
            color: ${whiteLabelSettings.brandColor};
        }
        .tab-dragging {
            opacity: 0.5;
            background-color: rgba(229, 231, 235, 0.5); /* gray-200 with opacity */
        }
        /* Custom Scrollbar for Tabs */
        .custom-scrollbar::-webkit-scrollbar {
            height: 4px; /* Thin horizontal scrollbar */
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: rgba(156, 163, 175, 0.5); /* gray-400 equivalent with opacity */
            border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: rgba(107, 114, 128, 0.8); /* gray-500 equivalent */
        }
        /* Firefox fallback */
        .custom-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }
    `, [whiteLabelSettings.brandColor]);
    
    const isReadOnly = !allowDashboardManagement && !allowDataSourceManagement && !showInfoScreen;

    return (
        <div className="flex flex-col h-full w-full relative">
            <style>{brandStyles}</style>
            
            {/* TABS HEADER */}
            {!isReadOnly && (
                <div className="flex flex-col bg-white dark:bg-gray-800 shadow-md z-[100]">
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                        {/* Tabs Container */}
                        <div className="flex-1 overflow-x-auto flex items-end custom-scrollbar pl-2">
                            {dashboards.map(dashboard => {
                                const isActive = dashboard.id === activeDashboardId;
                                const isEditing = editingTabId === dashboard.id;
                                const isDragging = draggedTabId === dashboard.id;
                                
                                return (
                                    <div 
                                        key={dashboard.id}
                                        onClick={() => handleTabClick(dashboard.id)}
                                        onDoubleClick={() => handleTabDoubleClick(dashboard)}
                                        draggable={allowDashboardManagement && !isEditing}
                                        onDragStart={(e) => handleDragStart(e, dashboard.id)}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, dashboard.id)}
                                        onDragEnd={handleDragEnd}
                                        className={`
                                            group flex items-center px-4 py-3 cursor-pointer select-none whitespace-nowrap text-sm font-medium transition-colors border-b-2
                                            ${isActive 
                                                ? 'tab-active bg-gray-50 dark:bg-gray-700/50' 
                                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30'}
                                            ${isDragging ? 'tab-dragging' : ''}
                                            ${!isEditing && allowDashboardManagement ? 'cursor-move' : ''}
                                        `}
                                    >
                                        {isEditing ? (
                                            <input
                                                ref={tabNameInputRef}
                                                type="text"
                                                value={tempTabName}
                                                onChange={(e) => setTempTabName(e.target.value)}
                                                onBlur={handleTabNameSave}
                                                onKeyDown={handleTabNameKeyDown}
                                                className="bg-transparent border-b border-indigo-500 outline-none w-32"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span title={dashboard.name}>{dashboard.name}</span>
                                        )}
                                        {isActive && allowDashboardManagement && !isEditing && (
                                            <Icon name="edit" className="w-3 h-3 ml-2 opacity-0 group-hover:opacity-50" />
                                        )}
                                    </div>
                                );
                            })}
                            
                            {allowDashboardManagement && (
                                <button
                                    onClick={handleAddNewDashboard}
                                    className="ml-2 mb-2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
                                    title={t('dashboard.createNewDashboard')}
                                >
                                    <Icon name="add" className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {/* Right Actions: Status & Menu */}
                        <div className="flex items-center gap-2 pr-4 pl-2 border-l border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 z-10 flex-shrink-0 h-full">
                            {activeDashboard && <SaveStatusIndicator status={activeDashboard.saveStatus || 'idle'} />}
                            
                            <div className="relative" ref={menuRef}>
                                <button onClick={() => setIsMenuOpen(prev => !prev)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label={t('dashboard.actionsMenuLabel')}>
                                    <Icon name="more_vert" className="w-5 h-5" />
                                </button>
                                {isMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-[100]">
                                        <div className="py-1">
                                            <button
                                                onClick={handleOpenExportModal}
                                                className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                            >
                                                <Icon name="download" className="w-4 h-4" />
                                                {t('dashboard.exportDashboards')}
                                            </button>

                                            {allowDashboardManagement && (
                                                <>
                                                    <button
                                                        onClick={handleOpenImportModal}
                                                        className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    >
                                                        <Icon name="upload_file" className="w-4 h-4" />
                                                        {t('dashboard.importDashboards')}
                                                    </button>
                                                    <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                                                    {(apiConfig.CONFIG_API_URL || apiConfig.CONFIG_SUPABASE_URL) && (
                                                        <button
                                                            onClick={handleConfirmSync}
                                                            disabled={!hasUnsyncedChanges}
                                                            className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <Icon name="cloud_done" className="w-4 h-4" />
                                                            {t('dashboard.syncChanges')}
                                                        </button>
                                                    )}
                                                    {activeDashboardId && (
                                                        <>
                                                            <button
                                                                onClick={handleSaveAs}
                                                                className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                            >
                                                                <Icon name="save_as" className="w-4 h-4" />
                                                                {t('dashboard.saveAs')}
                                                            </button>
                                                            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                                                            <button
                                                                onClick={handleOpenVariablesModal}
                                                                className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                            >
                                                                <Icon name="variables" className="w-4 h-4" />
                                                                {t('dashboard.variables.button')}
                                                            </button>
                                                            <button
                                                                onClick={handleOpenFormattingModal}
                                                                className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                            >
                                                                <Icon name="settings" className="w-4 h-4" />
                                                                {t('dashboard.formatting.button')}
                                                            </button>
                                                            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                                                            <button
                                                                onClick={handleRemoveCurrentDashboard}
                                                                className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40"
                                                            >
                                                                <Icon name="close" className="w-4 h-4" />
                                                                {t('dashboard.deleteDashboard')}
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Navigation Sub-bar */}
                    <nav className="flex items-center gap-1 sm:gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        {navItems.map(item => (
                            <button
                                key={item.view}
                                onClick={() => item.view === 'query-editor' ? handleAddCard() : handleNavigate(item.view)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${currentView === item.view ? 'bg-white dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50'}`}
                            >
                                {t(item.labelKey)}
                            </button>
                        ))}
                    </nav>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
                {currentView === 'dashboard' && <DashboardGrid onEditCard={handleEditCard} onAddCard={handleAddCard} onAddNewDashboard={handleAddNewDashboard} department={department} owner={owner} />}
                {currentView === 'query-editor' && <SqlEditorView editingCardId={editingCardId} onFinishEditing={handleFinishEditing} department={department} owner={owner} />}
                {currentView === 'settings' && <SettingsView />}
                {currentView === 'script-library' && <ScriptLibraryView />}
                {currentView === 'env-variables' && <EnvironmentVariablesView department={department} owner={owner} />}
            </div>

            {/* FAB for Dashboard View */}
             {currentView === 'dashboard' && allowDashboardManagement && activeDashboardId && (
                <div
                    ref={fabContainerRef}
                    className="fixed bottom-6 right-6 z-20 flex flex-col items-center"
                >
                    <div className={`flex flex-col items-end gap-y-3 mb-4 transition-all duration-300 ease-in-out ${isFabMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none'}`}>
                        {/* Add Insight Option */}
                        <div className="flex items-center gap-x-3 cursor-pointer"
                                onClick={() => {
                                    handleAddCard();
                                    setIsFabMenuOpen(false);
                                }}>
                            <span className="px-3 py-1.5 bg-white dark:bg-gray-700 text-sm font-semibold rounded-md shadow-md whitespace-nowrap">{t('dashboard.addInsight')}</span>
                            <button
                                className="bg-white dark:bg-gray-600 dark:text-white w-12 h-12 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                                aria-label={t('dashboard.addInsight')}
                                title={t('dashboard.addInsight')}
                            >
                                <Icon name="new_question" className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

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

            {/* MODALS managed here now */}
            <Modal
                isOpen={isExportImportModalOpen}
                onClose={() => setIsExportImportModalOpen(false)}
                title={modalMode === 'export' ? t('dashboard.exportModalTitle') : t('dashboard.importModalTitle')}
            >
                <DashboardExportImportModal
                    mode={modalMode}
                    dashboardsToExport={dashboards}
                    onConfirmExport={handleConfirmExport}
                    onConfirmImport={handleConfirmImport}
                    onClose={() => setIsExportImportModalOpen(false)}
                />
            </Modal>

            {activeDashboardId && (
                <Modal
                    isOpen={isVariablesModalOpen}
                    onClose={() => setIsVariablesModalOpen(false)}
                    title={activeDashboard ? t('dashboard.variables.manageTitleScoped', { name: activeDashboard.name }) : ''}
                    size="3xl"
                    footer={
                        <>
                            <button onClick={() => setIsVariablesModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                            <button onClick={handleSaveVariables} className="px-4 py-2 btn-brand text-white rounded-md">{t('modal.save')}</button>
                        </>
                    }
                >
                    <VariablesManager
                        dashboardId={activeDashboardId}
                        variables={tempVariables}
                        onVariablesChange={setTempVariables}
                        department={department}
                        owner={owner}
                    />
                </Modal>
            )}
            
            {activeDashboardId && (
                <Modal
                    isOpen={isFormattingModalOpen}
                    onClose={() => setIsFormattingModalOpen(false)}
                    title={activeDashboard ? t('dashboard.formatting.manageTitleScoped', { name: activeDashboard.name }) : ''}
                    footer={
                        <>
                            <button onClick={() => setIsFormattingModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                            <button onClick={handleSaveFormatting} className="px-4 py-2 btn-brand text-white rounded-md">{t('modal.save')}</button>
                        </>
                    }
                >
                    <FormattingSettingsManager 
                        settings={tempFormattingSettings}
                        onSettingsChange={setTempFormattingSettings}
                    />
                </Modal>
            )}
        </div>
    );
};

export default DashboardViewContent;
