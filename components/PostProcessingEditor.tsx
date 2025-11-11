import React, { useRef, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { highlight } from '../services/syntaxHighlighter';
import ErrorDisplay from './ErrorDisplay';

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
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const backdropRef = useRef<HTMLPreElement>(null);

    const highlightedScript = useMemo(() => highlight(script, 'javascript'), [script]);

    const handleScroll = () => {
        if (backdropRef.current && editorRef.current) {
            backdropRef.current.scrollTop = editorRef.current.scrollTop;
            backdropRef.current.scrollLeft = editorRef.current.scrollLeft;
        }
    };

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
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mb-6 flex flex-col h-80 min-h-[16rem] resize-y overflow-auto">
                    <h3 className="text-lg font-bold flex-shrink-0">{t('queryEditor.postProcessing.title')}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 flex-shrink-0" dangerouslySetInnerHTML={{ __html: t('queryEditor.postProcessing.description') }} />
                    <div className="relative flex-grow min-h-0 border border-gray-300 dark:border-gray-600 rounded-md">
                        <pre
                            ref={backdropRef}
                            className="absolute inset-0 m-0 p-2 font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-md overflow-auto whitespace-pre-wrap break-words pointer-events-none"
                            aria-hidden="true"
                        >
                            <code dangerouslySetInnerHTML={{ __html: highlightedScript + '\n' }} />
                        </pre>
                        <textarea
                            ref={editorRef}
                            value={script}
                            onChange={(e) => onScriptChange(e.target.value)}
                            onScroll={handleScroll}
                            className="absolute inset-0 m-0 p-2 font-mono text-sm text-transparent bg-transparent border-transparent rounded-md caret-white focus:outline-none resize-none"
                            placeholder="console.log(data); return data;"
                            spellCheck="false"
                            aria-label="Post-processing script editor"
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
