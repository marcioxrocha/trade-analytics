
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChartCardData, QueryResult, ColumnDataType, Variable, ChartType, QueryDefinition } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';
import { useDashboardModal } from '../contexts/ModalContext';
import ChartCard from './ChartCard';
import { getDriver } from '../drivers/driverFactory';
import VisualizationBuilder from './VisualizationBuilder';
import { substituteVariablesInQuery, buildVariableContext, resolveAllVariables } from '../services/queryService';
import { inferColumnTypes } from '../services/dataTypeService';
import Modal from './Modal';
import VariablesManager from './VariablesManager';
import { executePostProcessingScript, convertObjectArrayToQueryResult } from '../services/postProcessingService';
import QueryEditor from './QueryEditor';
import PostProcessingEditor from './PostProcessingEditor';
import ResultsTable from './ResultsTable';
import VariablesSidebar from './VariablesSidebar';
import AiQueryGeneratorModal from './AiQueryGeneratorModal';
import { getLanguageForDataSource, getDefaultQuery } from '../utils/queryUtils';

interface SqlEditorViewProps {
    editingCardId: string | null;
    onFinishEditing: () => void;
    department?: string;
    owner?: string;
}

const SqlEditorView: React.FC<SqlEditorViewProps> = ({ editingCardId, onFinishEditing, department, owner }) => {
    const { t } = useLanguage();
    const { 
      dataSources, 
      dashboardCards, 
      addCard, 
      updateCard, 
      dashboards,
      activeDashboardId, 
      variables,
      updateAllVariables,
      apiConfig,
    } = useAppContext();
    const { showModal, hideModal } = useDashboardModal();
    
    // Initialize with one default query
    const [queries, setQueries] = useState<QueryDefinition[]>([{ id: crypto.randomUUID(), dataSourceId: '', query: getDefaultQuery('sql') }]);
    
    const [result, setResult] = useState<QueryResult | null>(null);
    const [allResults, setAllResults] = useState<QueryResult[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [previewCard, setPreviewCard] = useState<ChartCardData | null>(null);
    const [columnTypes, setColumnTypes] = useState<Record<string, ColumnDataType>>({});
    const [isVariablesModalOpen, setIsVariablesModalOpen] = useState(false);
    const [tempVariables, setTempVariables] = useState<Variable[]>([]);
    const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);

    // Post-processing state
    const [postProcessingScript, setPostProcessingScript] = useState('');
    const [showPostProcessing, setShowPostProcessing] = useState(false);
    const [processedResult, setProcessedResult] = useState<QueryResult | null>(null);
    const [processingError, setProcessingError] = useState<string | null>(null);
    const [processingLogs, setProcessingLogs] = useState<string[]>([]);

    // AI Generation State
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [aiTargetQueryIndex, setAiTargetQueryIndex] = useState(0);
    
    const prevCardIdRef = useRef<string | null>(null);
    const hasInitializedNewCardRef = useRef(false);

    const activeDashboard = useMemo(() => dashboards.find(d => d.id === activeDashboardId), [dashboards, activeDashboardId]);
    const activeDashboardScriptLibrary = useMemo(() => activeDashboard?.scriptLibrary || '', [activeDashboard]);

    const activeDashboardVariables = useMemo(() => {
        const userVars = variables.filter(v => v.dashboardId === activeDashboardId);
        const fixedVars: Variable[] = [];
        if (department && activeDashboardId) {
            fixedVars.push({ id: 'fixed-department', dashboardId: activeDashboardId, name: 'department', value: department, lastModified: new Date().toISOString() });
        }
        if (owner && activeDashboardId) {
            fixedVars.push({ id: 'fixed-owner', dashboardId: activeDashboardId, name: 'owner', value: owner, lastModified: new Date().toISOString() });
        }
        return [...userVars, ...fixedVars];
    }, [variables, activeDashboardId, department, owner]);
    
    const resolvedVariables = useMemo(() => resolveAllVariables(activeDashboardVariables, activeDashboardScriptLibrary), [activeDashboardVariables, activeDashboardScriptLibrary]);
    const variableContext = useMemo(() => buildVariableContext(activeDashboardVariables), [activeDashboardVariables]);

    const cardToEdit = useMemo(() => editingCardId ? dashboardCards.find(c => c.id === editingCardId) : null, [editingCardId, dashboardCards]);
    
    // Helper to get the language of the currently active tab's query
    // For simplicity in the builder, we track the "primary" (first) query for main language logic if needed,
    // but the QueryEditor handles per-tab language.
    const currentQueryLanguage = useMemo(() => {
        const ds = dataSources.find(d => d.id === queries[0]?.dataSourceId);
        return getLanguageForDataSource(ds);
    }, [queries, dataSources]);
    
    useEffect(() => {
        setIsInitialLoadDone(false);
        hasInitializedNewCardRef.current = false;
    }, [cardToEdit?.id]);

    // Updated Post Processing to handle multiple datasets
    const handleApplyPostProcessing = useCallback((primaryResult: QueryResult | null, resultsArray: QueryResult[], script: string) => {
        setProcessingLogs([]);
        if (!primaryResult && resultsArray.length === 0) {
            setProcessingError("Cannot apply script without query results.");
            return;
        }

        // Pass all datasets as arrays of objects
        const allDatasets = resultsArray.map(res => res.rows.map(row => {
            const obj: { [key: string]: any } = {};
            res.columns.forEach((col, index) => {
                obj[col] = row[index];
            });
            return obj;
        }));

        const primaryData = allDatasets.length > 0 ? allDatasets[0] : [];

        if (!script.trim()) {
            setProcessedResult(null);
            setProcessingError(null);
            const savedColumnTypes = cardToEdit?.columnTypes || {};
            const inferredTypes = primaryResult ? inferColumnTypes(primaryResult) : {};
            const finalTypes = { ...inferredTypes };
            if (primaryResult) {
                primaryResult.columns.forEach(col => {
                    if (savedColumnTypes[col]) {
                        finalTypes[col] = savedColumnTypes[col];
                    }
                });
            }
            setColumnTypes(finalTypes);
            return;
        }

        try {
            // Pass primary data as 'data' (backward compat) and all datasets as context
            const { processedData, logs } = executePostProcessingScript(
                primaryData, 
                script, 
                { ...resolvedVariables, datasets: allDatasets }, 
                activeDashboardScriptLibrary
            );
            
            const newQueryResult = convertObjectArrayToQueryResult(processedData);
            
            const savedColumnTypes = cardToEdit?.columnTypes || {};
            const inferredNewTypes = inferColumnTypes(newQueryResult);
            const nextColumnTypes = { ...inferredNewTypes };

            newQueryResult.columns.forEach(newCol => {
                if (savedColumnTypes[newCol]) {
                    nextColumnTypes[newCol] = savedColumnTypes[newCol];
                }
            });
            
            setProcessedResult(newQueryResult);
            setColumnTypes(nextColumnTypes);
            setProcessingError(null);
            setProcessingLogs(logs);
        } catch (e) {
            const thrownObject = e as { error: Error, logs: string[] };
            const error = thrownObject.error || e;
            const logs = thrownObject.logs || [];
            const errorMessage = (error instanceof Error) ? `${error.name}: ${error.message}` : String(error);
            setProcessingError(errorMessage);
            setProcessedResult(null);
            setProcessingLogs(logs);
        }
    }, [resolvedVariables, cardToEdit, activeDashboardScriptLibrary]);

    const executeQueries = useCallback(async (currentQueries: QueryDefinition[]) => {
        // Validate at least one data source is selected
        if (currentQueries.length === 0 || !currentQueries[0].dataSourceId) {
             showModal({ title: t('modal.errorTitle'), content: <p>{t('queryEditor.noDataSourceError')}</p> });
             return;
        }

        setIsLoading(true);
        setQueryError(null);
        setProcessingError(null);
        setProcessingLogs([]);
        
        try {
            const results = await Promise.all(currentQueries.map(async (q) => {
                if (!q.dataSourceId) return { columns: [], rows: [] }; // Skip empty sources
                
                const dataSource = dataSources.find(ds => ds.id === q.dataSourceId);
                if (!dataSource) throw new Error(`Data source not found for query tab.`);

                const finalQuery = substituteVariablesInQuery(q.query, activeDashboardVariables, activeDashboardScriptLibrary);
                const driver = getDriver(dataSource);

                const context = { department, owner };
                for(let item of activeDashboardVariables??[]) {
                    try {
                        context[item.name] = item.isExpression ? JSON.parse(item.value) : item.value;
                    } catch(e) {}
                }

                return await driver.executeQuery({ dataSource, query: finalQuery }, apiConfig, context);
            }));

            setAllResults(results);
            const primaryResult = results[0];
            setResult(primaryResult);
            
            if (postProcessingScript.trim() && showPostProcessing) {
                handleApplyPostProcessing(primaryResult, results, postProcessingScript);
            } else {
                 const savedColumnTypes = cardToEdit?.columnTypes || {};
                 const inferredTypes = inferColumnTypes(primaryResult);
                 const finalTypes = { ...inferredTypes, ...savedColumnTypes };
                 setColumnTypes(finalTypes);
            }
        } catch (error) {
            setQueryError((error as Error).message);
            setResult(null);
            setAllResults([]);
            setProcessedResult(null);
        } finally {
            setIsLoading(false);
            if (cardToEdit) {
                setIsInitialLoadDone(true);
            }
        }
    }, [dataSources, t, activeDashboardVariables, showModal, apiConfig, department, owner, postProcessingScript, showPostProcessing, handleApplyPostProcessing, cardToEdit, activeDashboardScriptLibrary]);

    useEffect(() => {
        if (cardToEdit && dataSources.length > 0) {
            hasInitializedNewCardRef.current = false;
            const hasCardChanged = prevCardIdRef.current !== cardToEdit.id;

            if (hasCardChanged) {
                // Load queries. If new multi-query structure exists, use it.
                // Otherwise, construct it from legacy fields.
                if (cardToEdit.queries && cardToEdit.queries.length > 0) {
                    setQueries(cardToEdit.queries);
                } else {
                    setQueries([{ 
                        id: 'legacy-query', 
                        dataSourceId: cardToEdit.dataSourceId, 
                        query: cardToEdit.query 
                    }]);
                }
                
                setColumnTypes(cardToEdit.columnTypes || {});
                setPostProcessingScript(cardToEdit.postProcessingScript || '');
                setShowPostProcessing(!!cardToEdit.postProcessingScript);
                setPreviewCard(null);
            }
            
            if (cardToEdit.type !== ChartType.SPACER) {
                // Execute logic handles if queries array is set
                // We need to pass the current state of queries if it has been updated, 
                // otherwise use card's data. Since setQueries is async, use logic here.
                const queriesToRun = (hasCardChanged && cardToEdit.queries && cardToEdit.queries.length > 0) 
                    ? cardToEdit.queries 
                    : (hasCardChanged 
                        ? [{ id: 'legacy', dataSourceId: cardToEdit.dataSourceId, query: cardToEdit.query }] 
                        : queries); 

                if (queriesToRun.length > 0 && queriesToRun[0].dataSourceId) {
                    executeQueries(queriesToRun);
                } else {
                     setIsInitialLoadDone(true);
                }
            } else {
                setIsInitialLoadDone(true);
            }
            
            prevCardIdRef.current = cardToEdit.id;

        } else {
            if (!hasInitializedNewCardRef.current) {
                setQueries([{ id: crypto.randomUUID(), dataSourceId: '', query: getDefaultQuery('sql') }]);
                setPostProcessingScript('');
                setShowPostProcessing(false);
                setProcessedResult(null);
                setProcessingError(null);
                setProcessingLogs([]);
                setIsInitialLoadDone(true);
                prevCardIdRef.current = null;
                hasInitializedNewCardRef.current = true;
            }
        }
    }, [cardToEdit, dataSources, executeQueries]);
    
    // Watch for post-processing toggle/update to re-run logic locally
    useEffect(() => {
        const handler = setTimeout(() => {
            if (showPostProcessing && (result || allResults.length > 0)) {
                 handleApplyPostProcessing(result, allResults, postProcessingScript);
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [postProcessingScript, result, allResults, showPostProcessing, handleApplyPostProcessing]);

    const handleRunQuery = () => executeQueries(queries);

    const handleSaveChart = (cardData: Omit<ChartCardData, 'id' | 'dashboardId'>) => {
        if (!activeDashboardId) {
            showModal({ title: t('modal.errorTitle'), content: <p>{t('queryEditor.noActiveDashboardError')}</p> });
            return;
        }
        
        // For backward compatibility, we sync the first query to the root fields
        const primaryQuery = queries[0] || { dataSourceId: '', query: '' };

        const cardWithDashboard: Omit<ChartCardData, 'id'> = {
            ...cardData,
            dashboardId: activeDashboardId,
            columnTypes,
            postProcessingScript: showPostProcessing && postProcessingScript.trim() ? postProcessingScript : undefined,
            // Save Multi-query structure
            queries: queries,
            // Sync Legacy fields
            dataSourceId: primaryQuery.dataSourceId,
            query: primaryQuery.query,
        };

        if (cardToEdit) {
            updateCard({ ...cardWithDashboard, id: cardToEdit.id });
        } else {
            addCard(cardWithDashboard);
        }
        onFinishEditing();
    };

    const handleOpenVariablesModal = () => {
        if (!activeDashboardId) return;
        setTempVariables(variables.filter(v => v.dashboardId === activeDashboardId));
        setIsVariablesModalOpen(true);
    };
    
    const handleSaveVariables = () => {
        if (activeDashboardId) {
            updateAllVariables(activeDashboardId, tempVariables);
        }
        setIsVariablesModalOpen(false);
    };

    const handleUseGeneratedQuery = (generatedQuery: string) => {
        const updatedQueries = [...queries];
        if (updatedQueries[aiTargetQueryIndex]) {
            updatedQueries[aiTargetQueryIndex] = { ...updatedQueries[aiTargetQueryIndex], query: generatedQuery };
            setQueries(updatedQueries);
        }
        setIsAiModalOpen(false);
    };

    const previewCardWithSubstitutions = useMemo(() => {
        if (!previewCard) return null;
        return {
            ...previewCard,
            title: substituteVariablesInQuery(previewCard.title, activeDashboardVariables, activeDashboardScriptLibrary),
            description: previewCard.description ? substituteVariablesInQuery(previewCard.description, activeDashboardVariables, activeDashboardScriptLibrary) : undefined,
        };
    }, [previewCard, activeDashboardVariables, activeDashboardScriptLibrary]);

    const displayResult = processedResult || result;
    const shouldRenderBuilder = useMemo(() => isInitialLoadDone || !cardToEdit, [cardToEdit, isInitialLoadDone]);

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-3">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">{t('queryEditor.title')}</h1>

                    <QueryEditor
                        queries={queries}
                        onQueriesChange={setQueries}
                        dataSources={dataSources}
                        onRunQuery={handleRunQuery}
                        isLoading={isLoading}
                        onGenerateWithAi={(index) => { setAiTargetQueryIndex(index); setIsAiModalOpen(true); }}
                    />

                    {(result || allResults.length > 0) && (
                        <PostProcessingEditor
                            script={postProcessingScript}
                            onScriptChange={setPostProcessingScript}
                            show={showPostProcessing}
                            onToggleShow={setShowPostProcessing}
                            error={processingError}
                            logs={processingLogs}
                            onApply={() => handleApplyPostProcessing(result, allResults, postProcessingScript)}
                        />
                    )}

                    <div className="mt-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2">
                                <ResultsTable
                                    queryError={queryError}
                                    result={displayResult}
                                    columnTypes={columnTypes}
                                    onColumnTypeChange={setColumnTypes}
                                />
                            </div>

                            <div>
                                {shouldRenderBuilder ? (
                                    <VisualizationBuilder
                                        result={displayResult}
                                        onSave={handleSaveChart}
                                        onPreviewChange={setPreviewCard}
                                        initialConfig={cardToEdit}
                                        currentQuery={queries[0]?.query || ''}
                                        currentQueryLanguage={currentQueryLanguage}
                                        currentDataSourceId={queries[0]?.dataSourceId || ''}
                                        columnTypes={columnTypes}
                                        isEditing={!!cardToEdit}
                                    />
                                ) : (cardToEdit && isLoading) ? (
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg animate-pulse">
                                        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
                                        <div className="space-y-4">
                                            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                                            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        {previewCardWithSubstitutions && (
                            <div className="mt-6">
                                <h2 className="text-xl font-bold mb-4">{t('queryEditor.preview')}</h2>
                                <div className="grid grid-cols-1 w-full min-h-[360px]">
                                    <ChartCard card={previewCardWithSubstitutions} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                 <div className="md:col-span-1">
                    <VariablesSidebar
                        variables={activeDashboardVariables}
                        variableContext={variableContext}
                        onInsertVariable={(name) => {
                            // Insert into active query text. 
                            // Since QueryEditor manages focus and state locally for textareas, 
                            // simpler approach is appending to the currently active query in state.
                            // A more robust way would require tracking active query index in SqlEditorView, which we are not exposing yet.
                            // For now, this inserts into the *first* query or needs a refactor to know which tab is active.
                            // Let's append to the first query as a safe default if UI doesn't support cursor insertion from outside easily.
                            const updated = [...queries];
                            if (updated[0]) {
                                updated[0].query += `{{${name}}}`;
                                setQueries(updated);
                            }
                        }}
                        onManageVariables={handleOpenVariablesModal}
                    />
                </div>
            </div>
            {activeDashboardId && (
                <Modal
                    isOpen={isVariablesModalOpen}
                    onClose={() => setIsVariablesModalOpen(false)}
                    title={t('dashboard.variables.manageTitleScoped', { name: activeDashboard?.name || '' })}
                    size="3xl"
                    footer={<>
                        <button onClick={() => setIsVariablesModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                        <button onClick={handleSaveVariables} className="px-4 py-2 btn-brand text-white rounded-md">{t('modal.save')}</button>
                    </>}
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
            <AiQueryGeneratorModal
                isOpen={isAiModalOpen}
                onClose={() => setIsAiModalOpen(false)}
                onUseQuery={handleUseGeneratedQuery}
                apiConfig={apiConfig}
            />
        </>
    );
};

export default SqlEditorView;
