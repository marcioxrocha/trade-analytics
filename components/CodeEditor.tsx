import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { highlight } from '../services/syntaxHighlighter';
import { QueryLanguage } from '../types';
import Icon from './Icon';
import { useAppContext } from '../contexts/AppContext';
import { useDashboardModal } from '../contexts/ModalContext';

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language: QueryLanguage | 'javascript';
    placeholder?: string;
    className?: string;
    minHeight?: string;
    autoFocus?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ 
    value, 
    onChange, 
    language, 
    placeholder, 
    className = "", 
    minHeight = "16rem",
    autoFocus = false
}) => {
    const { t } = useLanguage();
    const { syncAllChanges } = useAppContext();
    const { showModal, hideModal } = useDashboardModal();
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const backdropRef = useRef<HTMLPreElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const highlightedCode = useMemo(() => highlight(value || '', language), [value, language]);

    // Sync scrolling between textarea and backdrop
    const handleScroll = () => {
        if (backdropRef.current && editorRef.current) {
            backdropRef.current.scrollTop = editorRef.current.scrollTop;
            backdropRef.current.scrollLeft = editorRef.current.scrollLeft;
        }
    };

    useEffect(() => {
        if (autoFocus && editorRef.current) {
            editorRef.current.focus();
        }
    }, [autoFocus]);

    const handleConfirmSync = async () => {
        try {
            await syncAllChanges();
            showModal({
                title: t('modal.saveSuccessTitle'),
                content: <p>{t('modal.saveSuccess')}</p>,
                footer: <button onClick={hideModal} className="px-4 py-2 btn-brand text-white rounded-md">{t('modal.ok')}</button>
            });
        } catch (error) {
            showModal({
                title: t('modal.saveErrorTitle'),
                content: <p>{(error as Error).message}</p>,
                footer: <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.ok')}</button>
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Tab key support
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;
            const newValue = value.substring(0, start) + "\t" + value.substring(end);
            
            onChange(newValue);
            
            // Wait for React to update value, then set cursor
            requestAnimationFrame(() => {
                if (editorRef.current) {
                    editorRef.current.selectionStart = editorRef.current.selectionEnd = start + 1;
                }
            });
        }

        // Ctrl+S / Cmd+S for Sync
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            showModal({
                title: t('codeEditor.syncTitle'),
                content: <p>{t('codeEditor.syncConfirm')}</p>,
                footer: (
                    <>
                        <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                        <button onClick={() => { hideModal(); handleConfirmSync(); }} className="px-4 py-2 btn-brand text-white rounded-md">{t('modal.confirm')}</button>
                    </>
                )
            });
        }

        // Ctrl+F / Cmd+F for Search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            setIsSearchOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    };

    const findNext = () => {
        if (!searchTerm || !editorRef.current) return;
        
        const text = value.toLowerCase();
        const term = searchTerm.toLowerCase();
        // Start searching from current selection end
        let startIndex = editorRef.current.selectionEnd;
        
        let matchIndex = text.indexOf(term, startIndex);
        
        // Wrap around if not found
        if (matchIndex === -1) {
            matchIndex = text.indexOf(term, 0);
        }

        if (matchIndex !== -1) {
            editorRef.current.focus();
            editorRef.current.setSelectionRange(matchIndex, matchIndex + searchTerm.length);
            
            // Calculate scroll position to keep it in view (approximate)
            // Ideally we'd measure line height, but standard scrollIntoView is tricky with textareas
            // The selection often forces scroll automatically in modern browsers
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            findNext();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            setIsSearchOpen(false);
            editorRef.current?.focus();
        }
    };

    return (
        <div className={`relative flex-grow border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 ${className}`} style={{ minHeight }}>
            {/* Search Toolbar */}
            {isSearchOpen && (
                <div className="absolute top-2 right-2 z-20 flex items-center bg-white dark:bg-gray-700 shadow-lg border border-gray-200 dark:border-gray-600 rounded-md p-1 gap-1">
                    <input 
                        ref={searchInputRef}
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder={t('codeEditor.find')}
                        className="text-xs p-1 border border-gray-300 dark:border-gray-500 rounded bg-transparent text-gray-800 dark:text-gray-200 w-32 focus:outline-none focus:border-indigo-500"
                    />
                    <button onClick={findNext} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300" title={t('codeEditor.findNext')}>
                        <Icon name="search" className="w-3 h-3" />
                    </button>
                    <button onClick={() => setIsSearchOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300" title={t('codeEditor.close')}>
                        <Icon name="close" className="w-3 h-3" />
                    </button>
                </div>
            )}

            <pre
                ref={backdropRef}
                className="absolute inset-0 m-0 p-3 font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-md overflow-auto whitespace-pre-wrap break-words pointer-events-none"
                aria-hidden="true"
            >
                <code dangerouslySetInnerHTML={{ __html: highlightedCode + '\n' }} />
            </pre>
            <textarea
                ref={editorRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                className="absolute inset-0 m-0 p-3 font-mono text-sm text-transparent bg-transparent border-transparent rounded-md caret-black dark:caret-white focus:outline-none resize-none"
                spellCheck="false"
                placeholder={placeholder}
                aria-label="Code editor"
            />
        </div>
    );
};

export default CodeEditor;