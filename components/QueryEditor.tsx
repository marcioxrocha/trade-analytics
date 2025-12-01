import React, { useState, useEffect } from 'react';
import { DataSource, QueryDefinition } from '../types';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import RestQueryBuilder from './RestQueryBuilder';
import { getLanguageForDataSource } from '../utils/queryUtils';
import CodeEditor from './CodeEditor';

interface QueryEditorProps {
    queries: QueryDefinition[];
    onQueriesChange: (queries: QueryDefinition[]) => void;
    dataSources: DataSource[];
    onRunQuery: () => void;
    isLoading: boolean;
    onGenerateWithAi: (queryIndex: number) => void;
}

const QueryEditor: React.FC<QueryEditorProps> = ({
    queries,
    onQueriesChange,
    dataSources,
    onRunQuery,
    isLoading,
    onGenerateWithAi,
}) => {
    const { t } = useLanguage();
    const [activeQueryIndex, setActiveQueryIndex] = useState(0);

    const activeQuery = queries[activeQueryIndex] || queries[0];
    const activeDataSource = dataSources.find(ds => ds.id === activeQuery?.dataSourceId);
    const queryLanguage = getLanguageForDataSource(activeDataSource);
    const isRestApi = activeDataSource?.type === 'REST API';

    // Ensure there is always at least one query
    useEffect(() => {
        if (queries.length === 0) {
            onQueriesChange([{ id: crypto.randomUUID(), dataSourceId: '', query: '' }]);
        }
    }, [queries, onQueriesChange]);

    const handleQueryChange = (newQueryString: string) => {
        const updatedQueries = [...queries];
        updatedQueries[activeQueryIndex] = { ...activeQuery, query: newQueryString };
        onQueriesChange(updatedQueries);
    };

    const handleDataSourceChange = (newDataSourceId: string) => {
        const updatedQueries = [...queries];
        updatedQueries[activeQueryIndex] = { ...activeQuery, dataSourceId: newDataSourceId };
        onQueriesChange(updatedQueries);
    };

    const handleAddQuery = () => {
        const newQuery: QueryDefinition = { id: crypto.randomUUID(), dataSourceId: '', query: '' };
        onQueriesChange([...queries, newQuery]);
        setActiveQueryIndex(queries.length); // Switch to new tab
    };

    const handleRemoveQuery = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (queries.length <= 1) return; // Prevent deleting last query
        const updatedQueries = queries.filter((_, i) => i !== index);
        onQueriesChange(updatedQueries);
        if (activeQueryIndex >= index && activeQueryIndex > 0) {
            setActiveQueryIndex(activeQueryIndex - 1);
        }
    };

    if (!activeQuery) return null;

    return (
        <div className="flex flex-col gap-2">
            {/* Tabs Header */}
            <div className="flex items-center space-x-1 overflow-x-auto pb-1">
                {queries.map((q, index) => (
                    <div
                        key={q.id}
                        onClick={() => setActiveQueryIndex(index)}
                        className={`
                            group flex items-center px-4 py-2 rounded-t-lg text-sm font-medium cursor-pointer select-none border-b-2 transition-colors
                            ${activeQueryIndex === index 
                                ? 'bg-white dark:bg-gray-800 border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                                : 'bg-gray-100 dark:bg-gray-700/50 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}
                        `}
                    >
                        <span>{t('queryEditor.queryTab', { index: String(index + 1) })}</span>
                        {queries.length > 1 && (
                            <button 
                                onClick={(e) => handleRemoveQuery(index, e)}
                                className={`ml-2 p-0.5 rounded-full hover:bg-red-100 hover:text-red-500 ${activeQueryIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            >
                                <Icon name="close" className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}
                <button
                    onClick={handleAddQuery}
                    className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    title={t('queryEditor.addQuery')}
                >
                    <Icon name="add" className="w-4 h-4" />
                </button>
            </div>

            {/* Editor Container */}
            <div className={`rounded-b-xl rounded-tr-xl shadow-lg flex flex-col ${isRestApi ? 'h-auto' : 'bg-white dark:bg-gray-800 h-96 min-h-[16rem] resize-y overflow-auto'}`}>
                <div className="flex-grow min-h-0 flex flex-col">
                    {isRestApi ? (
                        <RestQueryBuilder configJson={activeQuery.query} onChange={handleQueryChange} />
                    ) : (
                        <div className="flex-grow p-2">
                            <CodeEditor 
                                value={activeQuery.query}
                                onChange={handleQueryChange}
                                language={queryLanguage}
                                className="h-full"
                                autoFocus={!activeQuery.query}
                            />
                        </div>
                    )}
                </div>
                
                {/* Controls Footer */}
                <div className={`flex-shrink-0 flex flex-wrap items-center justify-between p-4 gap-4 ${isRestApi ? 'mt-4 bg-white dark:bg-gray-800 rounded-xl' : 'border-t border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-center space-x-4 flex-1 min-w-[200px]">
                        <label htmlFor={`dataSourceSelect-${activeQuery.id}`} className="text-sm font-medium whitespace-nowrap">{t('queryEditor.connectsTo')}</label>
                        <select
                            id={`dataSourceSelect-${activeQuery.id}`}
                            value={activeQuery.dataSourceId}
                            onChange={(e) => handleDataSourceChange(e.target.value)}
                            className="p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 w-full max-w-xs"
                        >
                            <option value="">{t('queryEditor.selectDataSourcePlaceholder')}</option>
                            {dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
                        </select>
                        <span className="hidden md:inline-block px-2 py-1 text-xs font-semibold text-indigo-800 bg-indigo-100 rounded-full dark:bg-indigo-900 dark:text-indigo-200">
                            {t(`queryEditor.languages.${queryLanguage}`)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {queryLanguage === 'sql' && (
                            <button
                                type="button"
                                onClick={() => onGenerateWithAi(activeQueryIndex)}
                                className="flex items-center bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-md font-semibold transition-all shadow"
                            >
                                <Icon name="gemini" className="w-5 h-5 mr-2" />
                                {t('queryEditor.generateWithAi')}
                            </button>
                        )}
                        <button
                            onClick={onRunQuery}
                            disabled={isLoading || !activeQuery.dataSourceId}
                            className="flex items-center btn-brand text-white px-4 py-2 rounded-md font-semibold transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Icon name="sql" className="w-5 h-5 mr-2" />
                            {isLoading ? t('queryEditor.running') : t('queryEditor.runQuery')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QueryEditor;