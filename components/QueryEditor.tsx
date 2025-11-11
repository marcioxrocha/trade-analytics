import React, { useRef, useMemo, useEffect } from 'react';
import { DataSource, QueryLanguage } from '../types';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { highlight } from '../services/syntaxHighlighter';

interface QueryEditorProps {
    query: string;
    onQueryChange: (value: string) => void;
    selectedDataSourceId: string;
    onDataSourceChange: (id: string) => void;
    dataSources: DataSource[];
    queryLanguage: QueryLanguage;
    onRunQuery: () => void;
    isLoading: boolean;
    onGenerateWithAi: () => void;
}

const QueryEditor: React.FC<QueryEditorProps> = ({
    query,
    onQueryChange,
    selectedDataSourceId,
    onDataSourceChange,
    dataSources,
    queryLanguage,
    onRunQuery,
    isLoading,
    onGenerateWithAi,
}) => {
    const { t } = useLanguage();
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const backdropRef = useRef<HTMLPreElement>(null);

    const highlightedQuery = useMemo(() => highlight(query, queryLanguage), [query, queryLanguage]);

    const handleScroll = () => {
        if (backdropRef.current && editorRef.current) {
            backdropRef.current.scrollTop = editorRef.current.scrollTop;
            backdropRef.current.scrollLeft = editorRef.current.scrollLeft;
        }
    };
    
    // Autofocus on the editor when the component mounts if query is empty
    useEffect(() => {
        if (editorRef.current && !query) {
            editorRef.current.focus();
        }
    }, [query]);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg flex flex-col h-80 min-h-[16rem] resize-y overflow-auto">
            <div className="p-4 flex-grow min-h-0 flex flex-col">
                <div className="relative flex-grow border border-gray-300 dark:border-gray-600 rounded-md">
                    <pre
                        ref={backdropRef}
                        className="absolute inset-0 m-0 p-3 font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-md overflow-auto whitespace-pre-wrap break-words pointer-events-none"
                        aria-hidden="true"
                    >
                        <code dangerouslySetInnerHTML={{ __html: highlightedQuery + '\n' }} />
                    </pre>
                    <textarea
                        ref={editorRef}
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        onScroll={handleScroll}
                        className="absolute inset-0 m-0 p-3 font-mono text-sm text-transparent bg-transparent border-transparent rounded-md caret-white focus:outline-none resize-none"
                        spellCheck="false"
                        aria-label="Query editor"
                    />
                </div>
            </div>
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-4">
                    <label htmlFor="dataSourceSelect" className="text-sm font-medium">{t('queryEditor.connectsTo')}</label>
                    <select
                        id="dataSourceSelect"
                        value={selectedDataSourceId}
                        onChange={(e) => onDataSourceChange(e.target.value)}
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
                            onClick={onGenerateWithAi}
                            className="flex items-center bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-md font-semibold transition-all shadow"
                        >
                            <Icon name="gemini" className="w-5 h-5 mr-2" />
                            {t('queryEditor.generateWithAi')}
                        </button>
                    )}
                    <button
                        onClick={onRunQuery}
                        disabled={isLoading || dataSources.length === 0}
                        className="flex items-center btn-brand text-white px-4 py-2 rounded-md font-semibold transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon name="sql" className="w-5 h-5 mr-2" />
                        {isLoading ? t('queryEditor.running') : t('queryEditor.runQuery')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QueryEditor;
