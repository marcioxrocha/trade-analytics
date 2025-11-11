import React, { useRef, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { highlight } from '../services/syntaxHighlighter';

interface ScriptLibraryEditorProps {
    script: string;
    onScriptChange: (value: string) => void;
}

const ScriptLibraryEditor: React.FC<ScriptLibraryEditorProps> = ({ script, onScriptChange }) => {
    const { t } = useLanguage();
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const backdropRef = useRef<HTMLPreElement>(null);

    const highlightedScript = useMemo(() => highlight(script, 'javascript'), [script]);

    const handleScroll = () => {
        if (backdropRef.current && editorRef.current) {
            backdropRef.current.scrollTop = editorRef.current.scrollTop;
            backdropRef.current.scrollLeft = editorRef.current.scrollLeft;
        }
    };
    
    const defaultScriptPlaceholder = `/*
  Example:
  function formatCurrency(value, currency = 'BRL') {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: currency 
    }).format(value);
  }
*/`;

    return (
        <div className="flex flex-col h-[50vh]">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3" dangerouslySetInnerHTML={{ __html: t('scriptLibrary.description') }} />
            <div className="relative flex-grow min-h-0 border border-gray-300 dark:border-gray-600 rounded-md">
                <pre
                    ref={backdropRef}
                    className="absolute inset-0 m-0 p-3 font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-md overflow-auto whitespace-pre-wrap break-words pointer-events-none"
                    aria-hidden="true"
                >
                    <code dangerouslySetInnerHTML={{ __html: highlightedScript + '\n' }} />
                </pre>
                <textarea
                    ref={editorRef}
                    value={script}
                    onChange={(e) => onScriptChange(e.target.value)}
                    onScroll={handleScroll}
                    className="absolute inset-0 m-0 p-3 font-mono text-sm text-transparent bg-transparent border-transparent rounded-md caret-white focus:outline-none resize-none"
                    placeholder={defaultScriptPlaceholder}
                    spellCheck="false"
                    aria-label="Script library editor"
                />
            </div>
        </div>
    );
};

export default ScriptLibraryEditor;