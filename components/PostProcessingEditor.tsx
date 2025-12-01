import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import ErrorDisplay from './ErrorDisplay';
import CodeEditor from './CodeEditor';

interface PostProcessingEditorProps {
    script: string;
    onScriptChange: (value: string) => void;
    show: boolean;
    onToggleShow: (show: boolean) => void;
    error: string | null;
    logs: string[];
    onApply: () => void;
}

const PostProcessingEditor: React.FC<PostProcessingEditorProps> = ({
    script,
    onScriptChange,
    show,
    onToggleShow,
    error,
    logs,
}) => {
    const { t } = useLanguage();

    return (
        <div className="mt-4">
            <div className="flex items-center gap-2 mb-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md">
                <input
                    type="checkbox"
                    id="toggle-post-processing"
                    checked={show}
                    onChange={(e) => onToggleShow(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="toggle-post-processing" className="font-semibold text-gray-700 dark:text-gray-300">
                    {t('queryEditor.postProcessing.enable')}
                </label>
            </div>

            {show && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mb-6 flex flex-col h-90 min-h-[20rem] resize-y overflow-auto">
                    <h3 className="text-lg font-bold flex-shrink-0">{t('queryEditor.postProcessing.title')}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 flex-shrink-0" dangerouslySetInnerHTML={{ __html: t('queryEditor.postProcessing.description') }} />
                    <div className="flex-grow min-h-0">
                        <CodeEditor 
                            value={script}
                            onChange={onScriptChange}
                            language="javascript"
                            placeholder="console.log(data); return data;"
                            className="h-full"
                        />
                    </div>
                    {error && (
                        <div className="mt-2 bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-3 rounded-md flex-shrink-0">
                            <ErrorDisplay error={error} />
                        </div>
                    )}
                    {logs.length > 0 && (
                        <div className="mt-2 bg-gray-100 dark:bg-gray-900 rounded-lg p-3 flex-shrink-0">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('queryEditor.postProcessing.logsTitle')}</h4>
                            <pre className="font-mono text-xs text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                                {logs.join('\n')}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PostProcessingEditor;