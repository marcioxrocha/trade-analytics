import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChartCardData, QueryResult, ColumnDataType, Variable, ChartType } from '../types';
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
    
    const [query, setQuery] = useState(getDefaultQuery('sql'));
    const [result, setResult] = useState<QueryResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [selectedDataSourceId, setSelectedDataSourceId] = useState('');
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
    
    // Ref to track the previous card ID to prevent re-initializing the form on unrelated re-renders.
    const prevCardIdRef = useRef<string | null>(null);

    const activeDashboard = useMemo(() => dashboards.find(d => d.id === activeDashboardId), [dashboards, activeDashboardId]);
    const activeDashboardScriptLibrary = useMemo(() => activeDashboard?.scriptLibrary || '', [activeDashboard]);

    const activeDashboardVariables = useMemo(() => {
        const userVars = variables.filter(v => v.dashboardId === activeDashboardId);
        const fixedVars: Variable[] = [];
        if (department && activeDashboardId) {
            // FIX: Add lastModified property to satisfy the Variable type.
            fixedVars.push({ id: 'fixed-department', dashboardId: activeDashboardId, name: 'department', value: department, lastModified: new Date().toISOString() });
        }
        if (owner && activeDashboardId) {
            // FIX: Add lastModified property to satisfy the Variable type.
            fixedVars.push({ id: 'fixed-owner', dashboardId: activeDashboardId, name: 'owner', value: owner, lastModified: new Date().toISOString() });
        }
        return [...userVars, ...fixedVars];
    }, [variables, activeDashboardId, department, owner]);
    
    const resolvedVariables = useMemo(() => resolveAllVariables(activeDashboardVariables, activeDashboardScriptLibrary), [activeDashboardVariables, activeDashboardScriptLibrary]);
    const variableContext = useMemo(() => buildVariableContext(activeDashboardVariables), [activeDashboardVariables]);

    const cardToEdit = useMemo(() => editingCardId ? dashboardCards.find(c => c.id === editingCardId) : null, [editingCardId, dashboardCards]);
    const selectedDataSource = useMemo(() => dataSources.find(ds => ds.id === selectedDataSourceId), [dataSources, selectedDataSourceId]);
    const queryLanguage = useMemo(() => getLanguageForDataSource(selectedDataSource), [selectedDataSource]);
    
    useEffect(() => {
        setIsInitialLoadDone(false);
    }, [cardToEdit?.id]);

    const handleApplyPostProcessing = useCallback((rawResult: QueryResult | null, script: string) => {
        setProcessingLogs([]);
        if (!rawResult) {
            setProcessingError("Cannot apply script without query results.");
            return;
        }

        if (!script.trim()) {
            setProcessedResult(null);
            setProcessingError(null);
            const savedColumnTypes = cardToEdit?.columnTypes || {};
            const inferredTypes = inferColumnTypes(rawResult);
            const finalTypes = { ...inferredTypes };
            rawResult.columns.forEach(col => {
                if (savedColumnTypes[col]) {
                    finalTypes[col] = savedColumnTypes[col];
                }
            });
            setColumnTypes(finalTypes);
            return;
        }

        try {
            const transformedData = rawResult.rows.map(row => {
                const obj: { [key: string]: any } = {};
                rawResult.columns.forEach((col, index) => {
                    obj[col] = row[index];
                });
                return obj;
            });

            const { processedData, logs } = executePostProcessingScript(transformedData, script, resolvedVariables, activeDashboardScriptLibrary);
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

    const executeQuery = useCallback(async (currentQuery: string, dataSourceId: string) => {
        const dataSource = dataSources.find(ds => ds.id === dataSourceId);
        if (!dataSource) {
            showModal({ title: t('modal.errorTitle'), content: <p>{t('queryEditor.noDataSourceError')}</p> });
            return;
        }

        setIsLoading(true);
        setQueryError(null);
        setProcessingError(null);
        setProcessingLogs([]);
        try {
            const finalQuery = substituteVariablesInQuery(currentQuery, activeDashboardVariables, activeDashboardScriptLibrary);
            const driver = getDriver(dataSource);
            const queryResult = await driver.executeQuery({ dataSource, query: finalQuery }, apiConfig, { department, owner });
            setResult(queryResult);
            
            if (postProcessingScript.trim() && showPostProcessing) {
                handleApplyPostProcessing(queryResult, postProcessingScript);
            } else {
                 const savedColumnTypes = cardToEdit?.columnTypes || {};
                 const inferredTypes = inferColumnTypes(queryResult);
                 const finalTypes = { ...inferredTypes, ...savedColumnTypes };
                 setColumnTypes(finalTypes);
            }
        } catch (error) {
            setQueryError((error as Error).message);
            setResult(null);
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
            const hasCardChanged = prevCardIdRef.current !== cardToEdit.id;

            // Only reset the form fields if the card has actually changed.
            // This prevents overwriting user input in the post-processing editor
            // when an unrelated dependency (like the script library) changes.
            if (hasCardChanged) {
                setQuery(cardToEdit.query);
                setSelectedDataSourceId(cardToEdit.dataSourceId);
                setColumnTypes(cardToEdit.columnTypes || {});
                setPostProcessingScript(cardToEdit.postProcessingScript || '');
                setShowPostProcessing(!!cardToEdit.postProcessingScript);
                setPreviewCard(null);
            }
            
            if (cardToEdit.type !== ChartType.SPACER && (cardToEdit.query || cardToEdit.dataSourceId)) {
                // Always execute the query, as variables or the script library might have changed,
                // requiring a data refresh.
                executeQuery(cardToEdit.query, cardToEdit.dataSourceId);
            } else {
                setIsInitialLoadDone(true);
            }
            
            // Update the ref to the current card ID after processing.
            prevCardIdRef.current = cardToEdit.id;

        } else {
            // This block runs when the editor is closed or no card is selected.
            // Reset state for a clean slate.
            setPostProcessingScript('');
            setShowPostProcessing(false);
            setProcessedResult(null);
            setProcessingError(null);
            setProcessingLogs([]);
            setIsInitialLoadDone(true);
            prevCardIdRef.current = null; // Reset the ref.
        }
    }, [cardToEdit, dataSources, executeQuery]);
    
    useEffect(() => {
        if (!cardToEdit) {
            setQuery(getDefaultQuery(queryLanguage));
        }
    }, [queryLanguage, cardToEdit]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (showPostProcessing) {
                 handleApplyPostProcessing(result, postProcessingScript);
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [postProcessingScript, result, showPostProcessing, handleApplyPostProcessing]);

    const handleRunQuery = () => executeQuery(query, selectedDataSourceId);

    const handleSaveChart = (cardData: Omit<ChartCardData, 'id' | 'dashboardId'>) => {
        if (!activeDashboardId) {
            showModal({ title: t('modal.errorTitle'), content: <p>{t('queryEditor.noActiveDashboardError')}</p> });
            return;
        }
        
        const cardWithDashboard: Omit<ChartCardData, 'id'> = {
            ...cardData,
            dashboardId: activeDashboardId,
            columnTypes,
            postProcessingScript: showPostProcessing && postProcessingScript.trim() ? postProcessingScript : undefined,
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
        setQuery(generatedQuery);
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
                        query={query}
                        onQueryChange={setQuery}
                        selectedDataSourceId={selectedDataSourceId}
                        onDataSourceChange={setSelectedDataSourceId}
                        dataSources={dataSources}
                        queryLanguage={queryLanguage}
                        onRunQuery={handleRunQuery}
                        isLoading={isLoading}
                        onGenerateWithAi={() => setIsAiModalOpen(true)}
                    />

                    {result && (
                        <PostProcessingEditor
                            script={postProcessingScript}
                            onScriptChange={setPostProcessingScript}
                            show={showPostProcessing}
                            onToggleShow={setShowPostProcessing}
                            error={processingError}
                            logs={processingLogs}
                            onApply={() => handleApplyPostProcessing(result, postProcessingScript)}
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
                                        currentQuery={query}
                                        currentQueryLanguage={queryLanguage}
                                        currentDataSourceId={selectedDataSourceId}
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
                        onInsertVariable={(name) => setQuery(q => q + `{{${name}}}`)}
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