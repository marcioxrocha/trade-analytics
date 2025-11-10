
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChartCardData, QueryResult, ColumnDataType, QueryLanguage, DataSource, Variable, ChartType } from '../types';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';
import { useDashboardModal } from '../contexts/ModalContext';
import ChartCard from './ChartCard';
import { highlight } from '../services/syntaxHighlighter';
import { getDriver } from '../drivers/driverFactory';
import VisualizationBuilder from './VisualizationBuilder';
import { substituteVariablesInQuery, buildVariableContext, resolveVariableValue, resolveAllVariables } from '../services/queryService';
import { inferColumnTypes } from '../services/dataTypeService';
import Modal from './Modal';
import VariablesManager from './VariablesManager';
import ErrorDisplay from './ErrorDisplay';
import { GoogleGenAI } from "@google/genai";
import { executePostProcessingScript, convertObjectArrayToQueryResult } from '../services/postProcessingService';

const DATA_TYPE_OPTIONS: ColumnDataType[] = ['text', 'integer', 'decimal', 'currency', 'date', 'datetime', 'boolean'];

const getLanguageForDataSource = (dataSource: DataSource | undefined): QueryLanguage => {
    if (!dataSource) return 'sql';
    switch (dataSource.type) {
        case 'MongoDB':
        case 'CosmosDB':
            return 'mongo';
        case 'Redis':
            return 'redis';
        case 'Supabase':
            return 'supabase';
        case 'LocalStorage (Demo)':
        case 'PostgreSQL':
        case 'MySQL':
        case 'SQL Server':
        default:
            return 'sql';
    }
};

const getDefaultQuery = (lang: QueryLanguage): string => {
    switch (lang) {
        case 'mongo':
            return '{\n  "find": "collection_name",\n  "filter": { "field": "value" }\n}';
        case 'redis':
            return 'HGETALL my_hash';
        case 'supabase':
            return "from('orders').select('*')";
        case 'sql':
        default:
            return 'SELECT * FROM orders;';
    }
}

interface QueryEditorViewProps {
    editingCardId: string | null;
    onFinishEditing: () => void;
    department?: string;
    owner?: string;
}

const QueryEditorView: React.FC<QueryEditorViewProps> = ({ editingCardId, onFinishEditing, department, owner }) => {
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
    const [selectedDataSourceId, setSelectedDataSourceId] = useState(dataSources[0]?.id || '');
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
    const [aiPrompt, setAiPrompt] = useState('');
    const [generatedQuery, setGeneratedQuery] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const backdropRef = useRef<HTMLPreElement>(null);
    const postProcessingEditorRef = useRef<HTMLTextAreaElement>(null);
    const postProcessingBackdropRef = useRef<HTMLPreElement>(null);

    const activeDashboard = useMemo(() => dashboards.find(d => d.id === activeDashboardId), [dashboards, activeDashboardId]);

    const activeDashboardVariables = useMemo(() => {
        const userVars = variables.filter(v => v.dashboardId === activeDashboardId);
        const fixedVars: Variable[] = [];
        if (department && activeDashboardId) {
            fixedVars.push({ id: 'fixed-department', dashboardId: activeDashboardId, name: 'department', value: department });
        }
        if (owner && activeDashboardId) {
            fixedVars.push({ id: 'fixed-owner', dashboardId: activeDashboardId, name: 'owner', value: owner });
        }
        return [...userVars, ...fixedVars];
    }, [variables, activeDashboardId, department, owner]);
    
    const resolvedVariables = useMemo(() => resolveAllVariables(activeDashboardVariables), [activeDashboardVariables]);
    const variableContext = useMemo(() => buildVariableContext(activeDashboardVariables), [activeDashboardVariables]);

    const cardToEdit = useMemo(() => editingCardId ? dashboardCards.find(c => c.id === editingCardId) : null, [editingCardId, dashboardCards]);
    const selectedDataSource = useMemo(() => dataSources.find(ds => ds.id === selectedDataSourceId), [dataSources, selectedDataSourceId]);
    const queryLanguage = useMemo(() => getLanguageForDataSource(selectedDataSource), [selectedDataSource]);
    
    useEffect(() => {
        // Reset the initial load flag whenever we start editing a different card.
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

            const { processedData, logs } = executePostProcessingScript(transformedData, script, resolvedVariables);
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

            let errorMessage = 'An unknown script error occurred.';
            if (error instanceof Error) {
                errorMessage = `${error.name}: ${error.message}`;
            } else {
                errorMessage = String(error);
            }
            setProcessingError(errorMessage);
            setProcessedResult(null);
            setProcessingLogs(logs);
        }
    }, [resolvedVariables, cardToEdit]);

    const executeQuery = useCallback(async (currentQuery: string, dataSourceId: string) => {
        const dataSource = dataSources.find(ds => ds.id === dataSourceId);
        if (!dataSource) {
            showModal({
              title: t('modal.errorTitle'),
              content: <p>{t('queryEditor.noDataSourceError')}</p>,
              footer: <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.ok')}</button>
            });
            return;
        }

        setIsLoading(true);
        setResult(null);
        setQueryError(null);
        setProcessedResult(null);
        setProcessingError(null);
        setProcessingLogs([]);
        setColumnTypes({});
        try {
            const finalQuery = substituteVariablesInQuery(currentQuery, activeDashboardVariables);
            const driver = getDriver(dataSource);
            const queryResult = await driver.executeQuery({
                dataSource,
                query: finalQuery,
            }, apiConfig, { department, owner });
            setResult(queryResult);
            
            let isPostProcessingDone = false;
            if (postProcessingScript.trim() && showPostProcessing) {
                handleApplyPostProcessing(queryResult, postProcessingScript);
                isPostProcessingDone = true;
            } else {
                 const savedColumnTypes = cardToEdit?.columnTypes || {};
                 const inferredTypes = inferColumnTypes(queryResult);
                 const finalTypes = { ...inferredTypes };
                 queryResult.columns.forEach(col => {
                     if (savedColumnTypes[col]) {
                         finalTypes[col] = savedColumnTypes[col];
                     }
                 });
                 setColumnTypes(finalTypes);
            }

            // Mark initial load as done only after all data processing is complete
            if (cardToEdit) {
                 if ((postProcessingScript.trim() && showPostProcessing && isPostProcessingDone) || (!postProcessingScript.trim() || !showPostProcessing)) {
                    setIsInitialLoadDone(true);
                }
            }
        } catch (error) {
            setQueryError((error as Error).message);
            setResult(null);
            if (cardToEdit) {
                setIsInitialLoadDone(true); // Also mark as done on error to show controls
            }
        } finally {
            setIsLoading(false);
        }
    }, [dataSources, t, activeDashboardVariables, showModal, hideModal, apiConfig, department, owner, postProcessingScript, showPostProcessing, handleApplyPostProcessing, cardToEdit]);

    useEffect(() => {
        if (cardToEdit && dataSources.length > 0) {
            setQuery(cardToEdit.query);
            setSelectedDataSourceId(cardToEdit.dataSourceId);
            setColumnTypes(cardToEdit.columnTypes || {});
            setPostProcessingScript(cardToEdit.postProcessingScript || '');
            setShowPostProcessing(!!cardToEdit.postProcessingScript);
            setPreviewCard(null); // Clear old preview
            
            // Only execute query if it's not a spacer card
            if (cardToEdit.type !== ChartType.SPACER && (cardToEdit.query || cardToEdit.dataSourceId)) {
                executeQuery(cardToEdit.query, cardToEdit.dataSourceId);
            } else {
                setIsInitialLoadDone(true); // For spacers or cards without queries, just mark as loaded
            }
        } else {
             // Reset when creating a new card
            setPostProcessingScript('');
            setShowPostProcessing(false);
            setProcessedResult(null);
            setProcessingError(null);
            setProcessingLogs([]);
            setIsInitialLoadDone(true); // Not editing, so we are "done" with initial load.
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardToEdit, dataSources]);
    
    // Update default query text when language changes and user is not editing
    useEffect(() => {
        if (!cardToEdit) {
            setQuery(getDefaultQuery(queryLanguage));
        }
    }, [queryLanguage, cardToEdit]);


    const handleScroll = () => {
        if (backdropRef.current && editorRef.current) {
            backdropRef.current.scrollTop = editorRef.current.scrollTop;
            backdropRef.current.scrollLeft = editorRef.current.scrollLeft;
        }
    };

    const handlePostProcessingScroll = () => {
        if (postProcessingBackdropRef.current && postProcessingEditorRef.current) {
            postProcessingBackdropRef.current.scrollTop = postProcessingEditorRef.current.scrollTop;
            postProcessingBackdropRef.current.scrollLeft = postProcessingEditorRef.current.scrollLeft;
        }
    };

    const handleInsertVariable = (variableName: string) => {
        if (!editorRef.current) return;
        const { selectionStart, selectionEnd, value } = editorRef.current;
        const textToInsert = `{{${variableName}}}`;
        const newValue = value.substring(0, selectionStart) + textToInsert + value.substring(selectionEnd);
        setQuery(newValue);
        
        setTimeout(() => {
            if (editorRef.current) {
                editorRef.current.focus();
                const newCursorPosition = selectionStart + textToInsert.length;
                editorRef.current.selectionStart = newCursorPosition;
                editorRef.current.selectionEnd = newCursorPosition;
            }
        }, 0);
    };


    const highlightedQuery = useMemo(() => highlight(query, queryLanguage), [query, queryLanguage]);
    const highlightedPostProcessingScript = useMemo(() => highlight(postProcessingScript, 'javascript'), [postProcessingScript]);
    
    // Auto-apply post-processing script with a debounce
    useEffect(() => {
        const handler = setTimeout(() => {
            if (showPostProcessing) {
                 handleApplyPostProcessing(result, postProcessingScript);
            }
        }, 500);

        return () => {
            clearTimeout(handler);
        };
    }, [postProcessingScript, result, showPostProcessing, handleApplyPostProcessing]);


    useEffect(() => {
      if (!selectedDataSourceId && dataSources.length > 0) {
        setSelectedDataSourceId(dataSources[0].id);
      }
    }, [dataSources, selectedDataSourceId]);

    const handleRunQuery = async () => {
        if (!selectedDataSource) {
            showModal({
              title: t('modal.errorTitle'),
              content: <p>{t('queryEditor.noDataSourceError')}</p>,
              footer: <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.ok')}</button>
            });
            return;
        }
        await executeQuery(query, selectedDataSourceId);
    };

    const handleSaveChart = (cardData: Omit<ChartCardData, 'id' | 'dashboardId'>) => {
        if (!activeDashboardId) {
            showModal({
              title: t('modal.errorTitle'),
              content: <p>{t('queryEditor.noActiveDashboardError')}</p>,
              footer: <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.ok')}</button>
            });
            return;
        }
        
        const cardWithDashboard: Omit<ChartCardData, 'id'> = {
            ...cardData,
            dashboardId: activeDashboardId,
            columnTypes: columnTypes,
            postProcessingScript: showPostProcessing && postProcessingScript.trim() ? postProcessingScript : undefined,
        }

        if (cardToEdit) {
            updateCard({ ...cardWithDashboard, id: cardToEdit.id });
        } else {
            addCard(cardWithDashboard);
        }
        onFinishEditing(); // Navigates back to dashboard
    };

    const handleOpenVariablesModal = () => {
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

    const handleGenerateQuery = async () => {
        if (!aiPrompt || queryLanguage !== 'sql') return;
        if (!apiConfig.API_KEY) {
            setAiError("API Key for Gemini is not configured in the application settings.");
            return;
        }

        setIsAiLoading(true);
        setGeneratedQuery('');
        setAiError(null);

        const MOCK_SCHEMA = `
- Table: orders (Columns: id, user_id, total, status, created_at)
- Table: users (Columns: id, name, email, signup_date)
- Table: products (Columns: id, name, category, price)`;

        const prompt = `You are an expert SQL generator. Based on the user's request and the following database schema, generate a valid SQL query.
Database Schema:
${MOCK_SCHEMA}

User Request: "${aiPrompt}"

Only return the SQL query, with no other text, explanation, or markdown formatting.`;

        try {
            const ai = new GoogleGenAI({ apiKey: apiConfig.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            const queryText = response.text.replace(/```sql\n|```/g, '').trim();
            setGeneratedQuery(queryText);
        } catch (error) {
            console.error("AI query generation failed:", error);
            setAiError((error as Error).message || t('queryEditor.aiError'));
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleUseGeneratedQuery = () => {
        if (generatedQuery) {
            setQuery(generatedQuery);
        }
        setIsAiModalOpen(false);
        setGeneratedQuery('');
        setAiPrompt('');
        setAiError(null);
    };

    const previewCardWithSubstitutions = useMemo(() => {
        if (!previewCard) {
            return null;
        }
        
        const substitutedDescription = previewCard.description
            ? substituteVariablesInQuery(previewCard.description, activeDashboardVariables)
            : undefined;

        return {
            ...previewCard,
            title: substituteVariablesInQuery(previewCard.title, activeDashboardVariables),
            description: substitutedDescription,
        };
    }, [previewCard, activeDashboardVariables]);

    const displayResult = processedResult || result;
    
    const shouldRenderBuilder = useMemo(() => {
        if (cardToEdit) {
            return isInitialLoadDone; // If editing, wait for initial load.
        }
        // Always render for new cards, so non-data cards (like spacers) can be created.
        return true; 
    }, [cardToEdit, isInitialLoadDone]);

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-3">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">{t('queryEditor.title')}</h1>
                    
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg">
                        <div className="p-4">
                            <div className="relative">
                                <pre 
                                    ref={backdropRef}
                                    className="w-full h-48 m-0 p-3 font-mono text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md overflow-auto whitespace-pre-wrap break-words"
                                    aria-hidden="true"
                                >
                                    <code dangerouslySetInnerHTML={{ __html: highlightedQuery + '\n' }} />
                                </pre>
                                <textarea
                                    ref={editorRef}
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onScroll={handleScroll}
                                    className="absolute top-0 left-0 w-full h-48 m-0 p-3 font-mono text-sm text-transparent bg-transparent border border-transparent rounded-md caret-white focus:outline-none resize-none"
                                    spellCheck="false"
                                    aria-label="Query editor"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center space-x-4">
                                <label htmlFor="dataSourceSelect" className="text-sm font-medium">{t('queryEditor.connectsTo')}</label>
                                <select 
                                    id="dataSourceSelect" 
                                    value={selectedDataSourceId}
                                    onChange={(e) => setSelectedDataSourceId(e.target.value)}
                                    className="p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                                >
                                    {dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
                                </select>
                                <span className="px-2 py-1 text-xs font-semibold text-indigo-800 bg-indigo-100 rounded-full dark:bg-indigo-900 dark:text-indigo-200">
                                    {t(`queryEditor.languages.${queryLanguage}`)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {queryLanguage === 'sql' && (
                                    <button 
                                        type="button"
                                        onClick={() => setIsAiModalOpen(true)} 
                                        className="flex items-center bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-md font-semibold transition-all shadow"
                                    >
                                        <Icon name="gemini" className="w-5 h-5 mr-2"/>
                                        {t('queryEditor.generateWithAi')}
                                    </button>
                                )}
                                <button 
                                    onClick={handleRunQuery} 
                                    disabled={isLoading || dataSources.length === 0}
                                    className="flex items-center btn-brand text-white px-4 py-2 rounded-md font-semibold transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Icon name="sql" className="w-5 h-5 mr-2"/>
                                    {isLoading ? t('queryEditor.running') : t('queryEditor.runQuery')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {result && (
                        <div className="mt-4">
                            <div className="flex items-center gap-2 mb-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md">
                                <input
                                    type="checkbox"
                                    id="toggle-post-processing"
                                    checked={showPostProcessing}
                                    onChange={(e) => {
                                        setShowPostProcessing(e.target.checked);
                                        if (!e.target.checked) {
                                            setProcessedResult(null);
                                            setProcessingError(null);
                                            setProcessingLogs([]);
                                            
                                            const savedColumnTypes = cardToEdit?.columnTypes || {};
                                            const inferredTypes = inferColumnTypes(result);
                                            const finalTypes = { ...inferredTypes };
                                            result.columns.forEach(col => {
                                                if (savedColumnTypes[col]) {
                                                    finalTypes[col] = savedColumnTypes[col];
                                                }
                                            });
                                            setColumnTypes(finalTypes);
                                        } else {
                                            handleApplyPostProcessing(result, postProcessingScript);
                                        }
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <label htmlFor="toggle-post-processing" className="font-semibold text-gray-700 dark:text-gray-300">
                                    {t('queryEditor.postProcessing.enable')}
                                </label>
                            </div>

                            {showPostProcessing && (
                                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mb-6">
                                    <h3 className="text-lg font-bold">{t('queryEditor.postProcessing.title')}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3" dangerouslySetInnerHTML={{ __html: t('queryEditor.postProcessing.description') }}/>
                                    <div className="relative">
                                        <pre 
                                            ref={postProcessingBackdropRef}
                                            className="w-full h-32 m-0 p-2 font-mono text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md overflow-auto whitespace-pre-wrap break-words"
                                            aria-hidden="true"
                                        >
                                            <code dangerouslySetInnerHTML={{ __html: highlightedPostProcessingScript + '\n' }} />
                                        </pre>
                                        <textarea
                                            ref={postProcessingEditorRef}
                                            value={postProcessingScript}
                                            onChange={(e) => setPostProcessingScript(e.target.value)}
                                            onScroll={handlePostProcessingScroll}
                                            className="absolute top-0 left-0 w-full h-32 m-0 p-2 font-mono text-sm text-transparent bg-transparent border border-transparent rounded-md caret-white focus:outline-none resize-none"
                                            placeholder="console.log(data); return data;"
                                            spellCheck="false"
                                            aria-label="Post-processing script editor"
                                        />
                                    </div>
                                    {processingError && (
                                        <div className="mt-2 bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-3 rounded-md">
                                            <ErrorDisplay error={processingError} />
                                        </div>
                                    )}
                                    {processingLogs.length > 0 && (
                                        <div className="mt-2 bg-gray-100 dark:bg-gray-900 rounded-lg p-3">
                                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('queryEditor.postProcessing.logsTitle')}</h4>
                                            <pre className="font-mono text-xs text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                                                {processingLogs.join('\n')}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}


                    <div className="mt-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2">
                                {queryError && (
                                    <div className="bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-md shadow-inner">
                                        <h3 className="font-bold">{t('modal.errorTitle')}</h3>
                                        <ErrorDisplay error={queryError} />
                                    </div>
                                )}
                                {displayResult && (
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg">
                                        <h2 className="text-xl font-bold mb-4">{t('queryEditor.results')} ({displayResult.rows.length} rows)</h2>
                                        <div className="overflow-auto max-h-96">
                                            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0">
                                                    <tr>
                                                        {displayResult.columns.map(col => (
                                                            <th key={col} scope="col" className="px-4 py-3 align-top">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold">{col}</span>
                                                                    <select
                                                                        value={columnTypes[col] || 'text'}
                                                                        onChange={(e) => {
                                                                            const newType = e.target.value as ColumnDataType;
                                                                            setColumnTypes(prev => ({ ...prev, [col]: newType }));
                                                                        }}
                                                                        className="text-xs mt-1 p-1 border rounded-md bg-gray-100 dark:bg-gray-600 dark:border-gray-500 focus:ring-indigo-500 focus:border-indigo-500 w-full"
                                                                        onClick={e => e.stopPropagation()}
                                                                    >
                                                                        {DATA_TYPE_OPTIONS.map(type => (
                                                                            <option key={type} value={type}>{t(`queryEditor.types.${type}`)}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {displayResult.rows.map((row, index) => (
                                                        <tr key={index} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                                            {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 align-top">{String(cell)}</td>)}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
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
                                            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                                            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                                            <div className="h-10 bg-gray-300 dark:bg-gray-600 rounded w-full mt-6"></div>
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
                     <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg mt-16">
                        <div className="flex justify-between items-center mb-3">
                             <h3 className="text-lg font-bold">{t('queryEditor.availableVars')}</h3>
                             {activeDashboardId && (
                                 <button 
                                     onClick={handleOpenVariablesModal} 
                                     className="flex items-center gap-1 text-sm btn-brand text-white px-2 py-1 rounded-md font-semibold transition-all shadow hover:shadow-md"
                                     title={t('dashboard.variables.manageTitle')}
                                 >
                                     <Icon name="variables" className="w-4 h-4" />
                                     {t('dashboard.variables.button')}
                                 </button>
                             )}
                        </div>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {activeDashboardVariables.length > 0 ? activeDashboardVariables.map(v => {
                                const resolvedValue = v.isExpression ? resolveVariableValue(v, variableContext) : null;
                                return (
                                    <div key={v.id} onClick={() => handleInsertVariable(v.name)} className="bg-gray-100 dark:bg-gray-700 p-2 rounded-md cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                                        <p className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{v.name}</p>
                                        <p className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate">{v.isExpression ? `ƒx: ${v.value}` : v.value}</p>
                                        {v.isExpression && (
                                            <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                ↳ <span className="italic text-indigo-500 dark:text-indigo-400">preview:</span> <span className="text-green-600 dark:text-green-400 font-semibold">{String(resolvedValue)}</span>
                                            </p>
                                        )}
                                    </div>
                                );
                            }) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t('queryEditor.noAvailableVars')}</p>}
                        </div>
                    </div>
                </div>
            </div>
            {activeDashboardId && (
                <Modal
                    isOpen={isVariablesModalOpen}
                    onClose={handleCancelVariables}
                    title={activeDashboard ? t('dashboard.variables.manageTitleScoped', { name: activeDashboard.name }) : ''}
                    size="3xl"
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
             <Modal
                isOpen={isAiModalOpen}
                onClose={() => setIsAiModalOpen(false)}
                title={t('queryEditor.aiModalTitle')}
                footer={
                    <>
                        <button onClick={() => setIsAiModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                        {generatedQuery && !isAiLoading && (
                            <button onClick={handleUseGeneratedQuery} className="px-4 py-2 btn-brand text-white rounded-md flex items-center">
                                <Icon name="sql" className="w-4 h-4 mr-2 inline" />
                                {t('queryEditor.aiUseQueryButton')}
                            </button>
                        )}
                    </>
                }
            >
                <div className="space-y-4">
                    <div>
                        <label htmlFor="ai-prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t('queryEditor.aiPromptLabel')}
                        </label>
                        <textarea
                            id="ai-prompt"
                            rows={3}
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder={t('queryEditor.aiPromptPlaceholder')}
                            autoFocus
                        />
                    </div>
                    <button
                        onClick={handleGenerateQuery}
                        disabled={isAiLoading || !aiPrompt}
                        className="w-full flex justify-center items-center bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-md font-semibold transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon name="gemini" className="w-5 h-5 mr-2" />
                        {isAiLoading ? t('queryEditor.aiGeneratingButton') : t('queryEditor.aiGenerateButton')}
                    </button>

                    {isAiLoading && (
                        <div className="flex justify-center items-center p-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                        </div>
                    )}

                    {aiError && (
                        <div className="bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-3 rounded-md">
                            <p className="font-bold">{t('modal.errorTitle')}</p>
                            <p className="text-sm">{aiError}</p>
                        </div>
                    )}

                    {generatedQuery && !isAiLoading && (
                        <div>
                            <pre className="w-full p-3 font-mono text-sm bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md overflow-auto">
                                <code>{generatedQuery}</code>
                            </pre>
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
};

export default QueryEditorView;