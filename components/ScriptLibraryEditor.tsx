import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import CodeEditor from './CodeEditor';

interface ScriptLibraryEditorProps {
    script: string;
    onScriptChange: (value: string) => void;
}

const ScriptLibraryEditor: React.FC<ScriptLibraryEditorProps> = ({ script, onScriptChange }) => {
    const { t } = useLanguage();
    
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
            <div className="flex-grow min-h-0">
                <CodeEditor
                    value={script}
                    onChange={onScriptChange}
                    language="javascript"
                    placeholder={defaultScriptPlaceholder}
                    className="h-full"
                />
            </div>
        </div>
    );
};

export default ScriptLibraryEditor;