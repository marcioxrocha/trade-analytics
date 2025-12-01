
import React, { useState, useEffect, useMemo } from 'react';
import { ChartCardData, QueryResult, Variable, ChartType, QueryDefinition } from '../types';
import { getDriver } from '../drivers/driverFactory';
import { useAppContext } from '../contexts/AppContext';
import ChartCard from './ChartCard';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { exportToExcel } from '../services/exportService';
import { useDashboardModal } from '../contexts/ModalContext';
import { substituteVariablesInQuery, resolveAllVariables } from '../services/queryService';
import { DEFAULT_FORMATTING_SETTINGS } from '../services/formattingService';
import { executePostProcessingScript } from '../services/postProcessingService';

interface DashboardCardProps {
  cardConfig: ChartCardData;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onClone: (id: string) => void;
  isBeingDragged: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOverCard: () => void;
  department?: string;
  owner?: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ 
  cardConfig, 
  onEdit, 
  onRemove,
  onClone,
  isBeingDragged,
  isDropTarget,
  onDragStart,
  onDragOverCard,
  department,
  owner,
}) => {
  const { dashboards, dataSources, variables, isLoading: isAppLoading, formattingVersion, apiConfig } = useAppContext();
  const { t } = useLanguage();
  const { showModal, hideModal } = useDashboardModal();
  const [data, setData] = useState<Record<string, any>[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parentDashboard = useMemo(() => dashboards.find(d => d.id === cardConfig.dashboardId), [dashboards, cardConfig.dashboardId]);
  const formattingSettings = useMemo(() => parentDashboard?.formattingSettings || DEFAULT_FORMATTING_SETTINGS, [parentDashboard]);
  const scriptLibrary = useMemo(() => parentDashboard?.scriptLibrary || '', [parentDashboard]);

  const cardVariables = useMemo(() => {
    if (!cardConfig.dashboardId) return [];
    const userVars = variables.filter(v => v.dashboardId === cardConfig.dashboardId);
    const fixedVars: Variable[] = [];
    if (department) {
        fixedVars.push({ id: 'fixed-department', dashboardId: cardConfig.dashboardId, name: 'department', value: department } as Variable);
    }
    if (owner) {
        fixedVars.push({ id: 'fixed-owner', dashboardId: cardConfig.dashboardId, name: 'owner', value: owner } as Variable);
    }
    return [...fixedVars, ...userVars];
  }, [variables, cardConfig.dashboardId, department, owner]);
  
  const resolvedCardVariables = useMemo(() => resolveAllVariables(cardVariables, scriptLibrary), [cardVariables, scriptLibrary]);

  const finalTitle = useMemo(() => {
    return substituteVariablesInQuery(cardConfig.title, cardVariables, scriptLibrary);
  }, [cardConfig.title, cardVariables, scriptLibrary]);

  const finalDescription = useMemo(() => {
    if (!cardConfig.description) return undefined;
    return substituteVariablesInQuery(cardConfig.description, cardVariables, scriptLibrary);
  }, [cardConfig.description, cardVariables, scriptLibrary]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      setData(null);
      
      // Determine queries to run. Fallback to legacy if 'queries' array is missing.
      const queriesToRun: QueryDefinition[] = (cardConfig.queries && cardConfig.queries.length > 0)
        ? cardConfig.queries
        : [{ id: 'legacy', dataSourceId: cardConfig.dataSourceId, query: cardConfig.query }];

      // Filter out invalid queries (e.g. no data source selected)
      const validQueries = queriesToRun.filter(q => !!q.dataSourceId);

      if (validQueries.length === 0) {
        // Only show error if it's not a spacer and supposed to have data
        if (cardConfig.type !== ChartType.SPACER) {
             setError(t('dashboard.cardErrorDataSourceNotFound'));
        }
        setIsLoading(false);
        return;
      }

      try {
        const results = await Promise.all(validQueries.map(async (q) => {
            const dataSource = dataSources.find(ds => ds.id === q.dataSourceId);
            if (!dataSource) throw new Error(`Data source not found for query.`);
            
            const driver = getDriver(dataSource);
            const finalQuery = substituteVariablesInQuery(q.query, cardVariables, scriptLibrary);

            const context = { department, owner };
            for(let item of cardVariables??[]) {
              try {
                context[item.name] = item.isExpression ? JSON.parse(item.value) : item.value;
              } catch(e) {}
            }

            return await driver.executeQuery({ dataSource, query: finalQuery }, apiConfig, context);
        }));

        // Prepare data for post-processing
        const primaryResult = results[0];
        
        // Convert all results to object arrays for the 'datasets' context
        const allDatasets = results.map(res => res.rows.map(row => {
            const obj: { [key: string]: any } = {};
            res.columns.forEach((col, index) => {
                obj[col] = row[index];
            });
            return obj;
        }));

        let finalData = allDatasets[0]; // Default to first dataset

        if (cardConfig.postProcessingScript) {
            try {
                // Pass 'datasets' in context
                const { processedData } = executePostProcessingScript(
                    finalData, // 'data' variable gets first dataset
                    cardConfig.postProcessingScript, 
                    { ...resolvedCardVariables, datasets: allDatasets }, 
                    scriptLibrary
                );
                finalData = processedData;
            } catch (e) {
                const scriptError = (e as any).error || e;
                let errorMessage = 'An unknown script error occurred.';
                if (scriptError instanceof Error) {
                    errorMessage = `${scriptError.name}: ${scriptError.message}`;
                } else {
                    errorMessage = String(scriptError);
                }
                setError(`Post-processing script failed: \n${errorMessage}`);
                setIsLoading(false);
                return; 
            }
        }
        setData(finalData);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    if (isAppLoading) {
      return;
    }
    
    if (cardConfig.type === ChartType.SPACER) {
        setIsLoading(false);
        return;
    }
    
    fetchData();

  }, [cardConfig, dataSources, t, cardVariables, isAppLoading, formattingVersion, apiConfig, department, owner, resolvedCardVariables, scriptLibrary]);
  
  const handleExport = async () => {
    showModal({
        title: t('dashboard.exportingExcelTitle'),
        content: (
            <div className="flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                <p className="ml-4">{t('dashboard.exportingExcel')}</p>
            </div>
        ),
    });
    try {
        await exportToExcel({
            card: cardConfig,
            dataSources: dataSources,
            variables: cardVariables,
            apiConfig: apiConfig,
            formattingSettings: formattingSettings,
            department,
            owner,
            scriptLibrary,
        });
        hideModal(); 
    } catch (err) {
        showModal({
            title: t('chartCard.noDataTitle'),
            content: <p>{(err as Error).message}</p>,
            footer: <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.ok')}</button>
        });
    }
  };

  const cardForRender: ChartCardData = {
    ...cardConfig,
    title: finalTitle,
    description: finalDescription,
    data: data || [],
  };
  
  const colSpanClass = `md:col-span-${Math.min(cardConfig.gridSpan, 4)}`;
  const rowSpanValue = cardConfig.gridRowSpan || (cardConfig.type === 'kpi' ? 1 : 2);
  const rowSpanClass = `row-span-${Math.min(rowSpanValue, 4)}`;
  const minHeightClass = rowSpanValue > 1 ? 'min-h-[340px]' : 'min-h-[160px]';

  const interactionClasses = [
    isBeingDragged && 'opacity-50 scale-95 shadow-2xl z-10',
    isDropTarget && 'opacity-40 outline-dashed outline-2 outline-offset-2 outline-indigo-500 scale-105',
  ].filter(Boolean).join(' ');

  const containerClasses = `${colSpanClass} ${rowSpanClass} ${interactionClasses} ${cardConfig.type === ChartType.SPACER ? "hidden lg:flex": "flex"} transition-all duration-200 ease-in-out cursor-move flex-col h-full ${minHeightClass}`;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOverCard();
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={handleDragOver}
      className={containerClasses}
      data-card-id={cardConfig.id}
    >
        <ChartCard 
            card={cardForRender} 
            formattingSettings={formattingSettings} 
            onRemove={onRemove} 
            onEdit={onEdit} 
            onClone={onClone}
            onExport={handleExport}
            isLoading={isLoading}
            error={error}
        />
    </div>
  );
};

export default DashboardCard;
