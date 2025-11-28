import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import DashboardCard from './DashboardCard';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';
import { Variable } from '../types';
import { substituteVariablesInQuery } from '../services/queryService';

interface DashboardGridProps {
    onEditCard: (cardId: string) => void;
    onAddCard: () => void;
    onAddNewDashboard: () => void; // Kept in props if needed by legacy or parent, but mostly unused here now
    department?: string;
    owner?: string;
}

const DashboardGrid: React.FC<DashboardGridProps> = ({ onEditCard, onAddCard, department, owner }) => {
    const { 
      dashboardCards, 
      removeCard, 
      cloneCard,
      dashboards,
      activeDashboardId, 
      reorderDashboardCards,
      variables,
      updateVariable,
      isLoading,
    } = useAppContext();
    
    const { t } = useLanguage();
    const dashboardGridRef = useRef<HTMLDivElement>(null);
    const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
    const [dropTargetCardId, setDropTargetCardId] = useState<string | null>(null);
    
    const activeDashboard = dashboards.find(d => d.id === activeDashboardId);
    const cardsForActiveDashboard = dashboardCards.filter(card => card.dashboardId === activeDashboardId);
    
    const activeDashboardVariables = useMemo(() => {
        if (!activeDashboardId) return [];
        const userVars = variables.filter(v => v.dashboardId === activeDashboardId);
        const fixedVars: Variable[] = [];
        if (department) {
            fixedVars.push({ id: 'fixed-department', dashboardId: activeDashboardId, name: 'department', value: department, lastModified: new Date().toISOString() });
        }
        if (owner) {
            fixedVars.push({ id: 'fixed-owner', dashboardId: activeDashboardId, name: 'owner', value: owner, lastModified: new Date().toISOString() });
        }
        return [...userVars, ...fixedVars];
    }, [variables, activeDashboardId, department, owner]);
    
    const visibleVariables = useMemo(() => activeDashboardVariables.filter(v => v.showOnDashboard && !v.isExpression), [activeDashboardVariables]);

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

    const handleVariableChange = (variableId: string, newValue: string) => {
        const variableToUpdate = variables.find(v => v.id === variableId);
        if (variableToUpdate) {
            updateVariable({ ...variableToUpdate, value: newValue });
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">{t('dashboard.syncingDataTitle')}</h2>
                <p className="mt-2 text-gray-500 dark:text-gray-400">{t('dashboard.syncingData')}</p>
            </div>
        );
    }

    return (
        <div>
            {/* Variables Controls - kept in Grid for context */}
            {activeDashboard && visibleVariables.length > 0 && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700">
                    <h2 className="text-base font-semibold mb-3 text-gray-600 dark:text-gray-300">{t('dashboard.variables.dashboardControls')}</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {visibleVariables.map(v => (
                            <div key={v.id}>
                                <label htmlFor={`var-control-${v.id}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 truncate mb-1">{v.name}</label>
                                {(v.options && v.options.length > 0) ? (
                                    <select
                                        id={`var-control-${v.id}`}
                                        value={v.value}
                                        onChange={(e) => handleVariableChange(v.id, e.target.value)}
                                        className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        {v.options.map(opt => (
                                            <option key={opt.value} value={opt.value}>{substituteVariablesInQuery(opt.label, activeDashboardVariables, activeDashboard?.scriptLibrary)}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        id={`var-control-${v.id}`}
                                        type="text"
                                        value={v.value}
                                        onChange={(e) => handleVariableChange(v.id, e.target.value)}
                                        className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Cards Grid */}
            {activeDashboard ? (
                <div
                    ref={dashboardGridRef}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="grid grid-cols-1 lg:grid-cols-4 auto-rows-min gap-6"
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
            
             {/* Empty State */}
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
        </div>
    );
};

export default DashboardGrid;