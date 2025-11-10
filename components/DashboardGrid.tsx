import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import DashboardCard from './DashboardCard';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';
import { useDashboardModal } from '../contexts/ModalContext';
import { Variable, DashboardFormattingSettings, Dashboard, ExportData } from '../types';
import VariablesManager from './VariablesManager';
import DashboardSelectorModal from './DashboardSelectorModal';
import Modal from './Modal';
import FormattingSettingsManager from './FormattingSettingsManager';
import { DEFAULT_FORMATTING_SETTINGS } from '../services/formattingService';
import SaveStatusIndicator from './SaveStatusIndicator';
import { substituteVariablesInQuery } from '../services/queryService';
import DashboardExportImportModal from './ExportImportModal';

interface DashboardGridProps {
    onEditCard: (cardId: string) => void;
    onAddCard: () => void;
    onAddNewDashboard: () => void;
    department?: string;
    owner?: string;
}

const DashboardGrid: React.FC<DashboardGridProps> = ({ onEditCard, onAddCard, onAddNewDashboard, department, owner }) => {
    const { 
      dashboardCards, 
      removeCard, 
      cloneCard,
      dashboards,
      activeDashboardId, 
      duplicateDashboard,
      removeDashboard, 
      setActiveDashboardId,
      updateDashboardName,
      reorderDashboardCards,
      variables,
      updateAllVariables,
      syncDashboards,
      apiConfig,
      updateActiveDashboardSettings,
      exportDashboards,
      importDashboards,
    } = useAppContext();
    const { showModal, hideModal } = useDashboardModal();
    
    const { t } = useLanguage();
    const modalInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const dashboardGridRef = useRef<HTMLDivElement>(null);
    const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
    const [dropTargetCardId, setDropTargetCardId] = useState<string | null>(null);
    const [tempVariables, setTempVariables] = useState<Variable[]>([]);
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempDashboardName, setTempDashboardName] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isVariablesModalOpen, setIsVariablesModalOpen] = useState(false);
    const [isFormattingModalOpen, setIsFormattingModalOpen] = useState(false);
    const [tempFormattingSettings, setTempFormattingSettings] = useState<DashboardFormattingSettings>(DEFAULT_FORMATTING_SETTINGS);
    const [isExportImportModalOpen, setIsExportImportModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'export' | 'import'>('export');
    
    const activeDashboard = dashboards.find(d => d.id === activeDashboardId);
    const cardsForActiveDashboard = dashboardCards.filter(card => card.dashboardId === activeDashboardId);
    const hasUnsyncedDashboards = dashboards.some(d => ['unsaved', 'saved-local'].includes(d.saveStatus || 'idle'));
    
    const activeDashboardVariables = useMemo(() => {
        if (!activeDashboardId) return [];
        const userVars = variables.filter(v => v.dashboardId === activeDashboardId);
        const fixedVars: Variable[] = [];
        if (department) {
            fixedVars.push({ id: 'fixed-department', dashboardId: activeDashboardId, name: 'department', value: department });
        }
        if (owner) {
            fixedVars.push({ id: 'fixed-owner', dashboardId: activeDashboardId, name: 'owner', value: owner });
        }
        return [...userVars, ...fixedVars];
    }, [variables, activeDashboardId, department, owner]);

    const finalDashboardName = useMemo(() => {
        if (!activeDashboard) return t('dashboard.noDashboardsTitle');
        return substituteVariablesInQuery(activeDashboard.name, activeDashboardVariables);
    }, [activeDashboard, activeDashboardVariables, t]);
    
    useEffect(() => {
        if (activeDashboard) {
            setTempDashboardName(activeDashboard.name);
            setTempFormattingSettings(activeDashboard.formattingSettings);
        }
    }, [activeDashboard]);
    
    useEffect(() => {
        if (isEditingName) {
            nameInputRef.current?.select();
        }
    }, [isEditingName]);

     // Close menu on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleNameChange = () => {
        setIsEditingName(false);
        if (activeDashboard && tempDashboardName.trim() && tempDashboardName !== activeDashboard.name) {
            updateDashboardName(activeDashboard.id, tempDashboardName.trim());
        } else if (activeDashboard) {
            setTempDashboardName(activeDashboard.name);
        }
    };

    const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleNameChange();
        } else if (e.key === 'Escape') {
            setIsEditingName(false);
            if (activeDashboard) {
                setTempDashboardName(activeDashboard.name);
            }
        }
    };
    
    const cleanupDragState = useCallback(() => {
        setDraggedCardId(null);
        setDropTargetCardId(null);
    }, []);

    useEffect(() => {
        window.addEventListener('dragend', cleanupDragState);
        return () => {
            window.removeEventListener('dragend', cleanupDragState);
        };
    }, [cleanupDragState]);
    
    const handleDragStart = (cardId: string) => {
        setDraggedCardId(cardId);
    };

    const handleDragOverCard = (targetCardId: string) => {
        if (draggedCardId && draggedCardId !== targetCardId) {
            setDropTargetCardId(targetCardId);
        }
    };

    const handleDrop = () => {
        if (!draggedCardId || !dropTargetCardId || draggedCardId === dropTargetCardId || !activeDashboardId) {
            cleanupDragState();
            return;
        }

        const currentCardIds = cardsForActiveDashboard.map(c => c.id);
        const draggedIndex = currentCardIds.indexOf(draggedCardId);
        const dropIndex = currentCardIds.indexOf(dropTargetCardId);
        
        if (draggedIndex === -1 || dropIndex === -1) {
             cleanupDragState();
             return;
        }

        const newOrderedIds = [...currentCardIds];
        const [removed] = newOrderedIds.splice(draggedIndex, 1);
        newOrderedIds.splice(dropIndex, 0, removed);

        reorderDashboardCards(activeDashboardId, newOrderedIds);
        cleanupDragState();
    };

    const handleOpenDashboardSelector = () => {
        showModal({
            title: t('dashboard.selectModalTitle'),
            content: (
                <DashboardSelectorModal
                    dashboards={dashboards}
                    onSelect={(id) => {
                        setActiveDashboardId(id);
                        hideModal();
                    }}
                    onClose={hideModal}
                    onAddDashboard={() => {
                        hideModal();
                        setTimeout(onAddNewDashboard, 200);
                    }}
                />
            ),
        });
    };

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

    const handleCancelVariables = () => {
        setIsVariablesModalOpen(false);
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
            await syncDashboards();
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

    const handleCancelFormatting = () => {
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

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex-1 min-w-0 group flex items-center gap-3">
                    {isEditingName ? (
                        <input
                            ref={nameInputRef}
                            type="text"
                            value={tempDashboardName}
                            onChange={(e) => setTempDashboardName(e.target.value)}
                            onBlur={handleNameChange}
                            onKeyDown={handleNameKeyDown}
                            className="text-3xl font-bold bg-transparent border-b-2 border-indigo-500 focus:outline-none text-gray-800 dark:text-white"
                            aria-label={t('dashboard.editDashboard')}
                        />
                    ) : (
                         <h1
                            onClick={() => activeDashboard && setIsEditingName(true)}
                            className="text-3xl font-bold text-gray-800 dark:text-white truncate flex items-center gap-2 cursor-pointer"
                            title={t('dashboard.editNameTooltip')}
                        >
                            {finalDashboardName}
                            {activeDashboard && <Icon name="edit" className="w-5 h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </h1>
                    )}
                    {activeDashboard && <SaveStatusIndicator status={activeDashboard.saveStatus || 'idle'} />}
                </div>
                
                 {activeDashboard && (
                    <div className="flex items-center gap-2">
                        <button onClick={handleOpenDashboardSelector} className="flex items-center gap-2 px-3 py-2 rounded-md bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm font-medium border dark:border-gray-600">
                            <Icon name="search" className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('dashboard.searchDashboards')}</span>
                        </button>
                        <div className="relative" ref={menuRef}>
                            <button onClick={() => setIsMenuOpen(prev => !prev)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={t('dashboard.actionsMenuLabel')}>
                                <Icon name="more_vert" className="w-5 h-5" />
                            </button>
                            {isMenuOpen && (
                                <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
                                    <div className="py-1">
                                        {apiConfig.CONFIG_API_URL && (
                                            <button
                                                onClick={handleConfirmSync}
                                                disabled={!hasUnsyncedDashboards}
                                                className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Icon name="cloud_done" className="w-4 h-4" />
                                                {t('dashboard.syncChanges')}
                                            </button>
                                        )}
                                         <button
                                            onClick={handleSaveAs}
                                            className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            <Icon name="save_as" className="w-4 h-4" />
                                            {t('dashboard.saveAs')}
                                        </button>
                                        <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                                        <button
                                            onClick={handleOpenExportModal}
                                            className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            <Icon name="download" className="w-4 h-4" />
                                            {t('dashboard.exportDashboards')}
                                        </button>
                                        <button
                                            onClick={handleOpenImportModal}
                                            className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            <Icon name="upload_file" className="w-4 h-4" />
                                            {t('dashboard.importDashboards')}
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
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {activeDashboard ? (
                <div
                    ref={dashboardGridRef}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="grid grid-cols-1 md:grid-cols-4 auto-rows-min gap-6"
                >
                    {cardsForActiveDashboard.map((card) => (
                        <DashboardCard
                            key={card.id}
                            cardConfig={card}
                            onEdit={() => onEditCard(card.id)}
                            onRemove={() => removeCard(card.id)}
                            onClone={() => cloneCard(card.id)}
                            onDragStart={() => handleDragStart(card.id)}
                            onDragOverCard={() => handleDragOverCard(card.id)}
                            isBeingDragged={draggedCardId === card.id}
                            isDropTarget={dropTargetCardId === card.id}
                            department={department}
                            owner={owner}
                        />
                    ))}
                </div>
            ) : <p className="text-center py-10">{t('dashboard.noDashboardsMessage')}</p>}
             {activeDashboard && cardsForActiveDashboard.length === 0 && (
                <button
                    onClick={onAddCard}
                    className="w-full text-center py-16 px-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                    <Icon name="add" className="w-12 h-12 mx-auto text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">{t('dashboard.emptyTitle')}</h3>
                    <p className="mt-1 text-sm text-gray-500">{t('dashboard.emptyMessage')}</p>
                </button>
            )}

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
                    onClose={handleCancelVariables}
                    title={activeDashboard ? t('dashboard.variables.manageTitleScoped', { name: activeDashboard.name }) : ''}
                    footer={
                        <>
                            <button onClick={handleCancelVariables} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
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
                    onClose={handleCancelFormatting}
                    title={activeDashboard ? t('dashboard.formatting.manageTitleScoped', { name: activeDashboard.name }) : ''}
                    footer={
                        <>
                            <button onClick={handleCancelFormatting} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
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

export default DashboardGrid;