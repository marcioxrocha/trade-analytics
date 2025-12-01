
import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
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
    
    // Layers refs
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const syntaxLayerRef = useRef<HTMLPreElement>(null);
    const highlightLayerRef = useRef<HTMLPreElement>(null);
    
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [matches, setMatches] = useState<number[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

    const highlightedCode = useMemo(() => highlight(value || '', language), [value, language]);

    // Sync scrolling between all 3 layers
    const handleScroll = () => {
        if (editorRef.current) {
            const top = editorRef.current.scrollTop;
            const left = editorRef.current.scrollLeft;
            
            if (syntaxLayerRef.current) {
                syntaxLayerRef.current.scrollTop = top;
                syntaxLayerRef.current.scrollLeft = left;
            }
            if (highlightLayerRef.current) {
                highlightLayerRef.current.scrollTop = top;
                highlightLayerRef.current.scrollLeft = left;
            }
        }
    };

    useEffect(() => {
        if (autoFocus && editorRef.current) {
            editorRef.current.focus();
        }
    }, [autoFocus]);

    // Perform search
    useEffect(() => {
        if (!searchTerm) {
            setMatches([]);
            setCurrentMatchIndex(-1);
            return;
        }

        const newMatches: number[] = [];
        const term = searchTerm.toLowerCase();
        const text = (value || '').toLowerCase();
        let pos = text.indexOf(term);

        while (pos !== -1) {
            newMatches.push(pos);
            pos = text.indexOf(term, pos + 1);
        }

        setMatches(newMatches);
        
        if (newMatches.length > 0) {
             // If previously selected index is still valid, keep it, otherwise reset
             if (currentMatchIndex === -1 || currentMatchIndex >= newMatches.length) {
                 setCurrentMatchIndex(0);
             }
        } else {
            setCurrentMatchIndex(-1);
        }

    }, [searchTerm, value]);

    // Generate the HTML for the bottom highlight layer
    const renderSearchHighlights = useMemo(() => {
        if (!searchTerm || matches.length === 0) return value;

        const elements: React.ReactNode[] = [];
        let lastIndex = 0;

        matches.forEach((matchStart, i) => {
            // Text before match
            if (matchStart > lastIndex) {
                elements.push(value.substring(lastIndex, matchStart));
            }

            const isCurrent = i === currentMatchIndex;
            const matchText = value.substring(matchStart, matchStart + searchTerm.length);
            
            // The matched text wrapped in mark
            elements.push(
                <mark 
                    key={i} 
                    id={isCurrent ? "active-search-match" : undefined}
                    className={`${isCurrent ? 'bg-orange-500' : 'bg-yellow-400/50'} text-transparent rounded-sm transition-colors duration-200`}
                >
                    {matchText}
                </mark>
            );

            lastIndex = matchStart + searchTerm.length;
        });

        // Remaining text
        if (lastIndex < value.length) {
            elements.push(value.substring(lastIndex));
        }

        return elements;
    }, [value, matches, searchTerm, currentMatchIndex]);


    // Auto-Scroll to active match
    useEffect(() => {
        if (currentMatchIndex !== -1 && isSearchOpen) {
            const activeEl = document.getElementById('active-search-match');
            if (activeEl && editorRef.current) {
                // Calculate position relative to the container
                const containerHeight = editorRef.current.clientHeight;
                const elementTop = activeEl.offsetTop;
                const elementHeight = activeEl.offsetHeight;

                // Center the element in the view
                const newScrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
                
                editorRef.current.scrollTo({
                    top: newScrollTop,
                    behavior: 'smooth'
                });

                // Select text in textarea (optional, keeps native selection)
                // Only if not focusing search input, to avoid focus stealing issues
                if (document.activeElement !== searchInputRef.current) {
                    const matchStart = matches[currentMatchIndex];
                    editorRef.current.setSelectionRange(matchStart, matchStart + searchTerm.length);
                }
            }
        }
    }, [currentMatchIndex, isSearchOpen, matches, searchTerm]);


    const highlightMatch = useCallback((index: number) => {
        if (!editorRef.current || index === -1 || matches.length === 0) return;
        
        const matchPos = matches[index];
        const endPos = matchPos + searchTerm.length;

        if (document.activeElement !== searchInputRef.current) {
            editorRef.current.focus();
        }
        editorRef.current.setSelectionRange(matchPos, endPos);
    }, [matches, searchTerm]);

    const goToNextMatch = () => {
        if (matches.length === 0) return;
        setCurrentMatchIndex(prev => (prev + 1) % matches.length);
    };

    const goToPrevMatch = () => {
        if (matches.length === 0) return;
        setCurrentMatchIndex(prev => (prev - 1 + matches.length) % matches.length);
    };

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
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;
            const newValue = value.substring(0, start) + "\t" + value.substring(end);
            onChange(newValue);
            requestAnimationFrame(() => {
                if (editorRef.current) {
                    editorRef.current.selectionStart = editorRef.current.selectionEnd = start + 1;
                }
            });
        }

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

        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            setIsSearchOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }

        if (e.key === 'F3') {
            e.preventDefault();
            if (isSearchOpen) {
                e.shiftKey ? goToPrevMatch() : goToNextMatch();
            } else {
                setIsSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
            }
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.shiftKey ? goToPrevMatch() : goToNextMatch();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            setIsSearchOpen(false);
            editorRef.current?.focus();
        }
        if (e.key === 'F3') {
            e.preventDefault();
            e.shiftKey ? goToPrevMatch() : goToNextMatch();
        }
    };

    return (
        <div className={`relative flex-grow border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 ${className}`} style={{ minHeight }}>
            {/* Search Toolbar */}
            {isSearchOpen && (
                <div className="absolute top-2 right-2 z-50 flex items-center bg-white dark:bg-gray-700 shadow-lg border border-gray-200 dark:border-gray-600 rounded-md p-1 gap-1">
                    <input 
                        ref={searchInputRef}
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder={t('codeEditor.find')}
                        className="text-xs p-1 border border-gray-300 dark:border-gray-500 rounded bg-transparent text-gray-800 dark:text-gray-200 w-64 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 px-1 min-w-[3rem] text-center whitespace-nowrap">
                        {matches.length > 0 ? t('codeEditor.matchCount', { current: String(currentMatchIndex + 1), total: String(matches.length) }) : '0/0'}
                    </span>
                    <button onClick={goToPrevMatch} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300" title={t('codeEditor.findPrev')}>
                        <Icon name="arrow_up" className="w-3 h-3" />
                    </button>
                    <button onClick={goToNextMatch} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300" title={t('codeEditor.findNext')}>
                        <Icon name="arrow_down" className="w-3 h-3" />
                    </button>
                    <button onClick={() => setIsSearchOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300" title={t('codeEditor.close')}>
                        <Icon name="close" className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Layer 1: Search Highlights (Bottom) */}
            <pre
                ref={highlightLayerRef}
                className="absolute inset-0 m-0 p-3 font-mono text-sm bg-transparent rounded-md overflow-auto whitespace-pre-wrap break-words pointer-events-none text-transparent z-0"
                aria-hidden="true"
            >
                {renderSearchHighlights}
            </pre>

            {/* Layer 2: Syntax Highlighting (Middle) */}
            <pre
                ref={syntaxLayerRef}
                className="absolute inset-0 m-0 p-3 font-mono text-sm bg-transparent rounded-md overflow-auto whitespace-pre-wrap break-words pointer-events-none z-10"
                aria-hidden="true"
            >
                <code dangerouslySetInnerHTML={{ __html: highlightedCode + '\n' }} />
            </pre>

            {/* Layer 3: Textarea (Top, Transparent Text, Visible Caret) */}
            <textarea
                ref={editorRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                className="absolute inset-0 m-0 p-3 font-mono text-sm text-transparent bg-transparent border-transparent rounded-md caret-black dark:caret-white focus:outline-none resize-none z-20 selection:bg-indigo-500/30"
                spellCheck="false"
                placeholder={placeholder}
                aria-label="Code editor"
            />
        </div>
    );
};

export default CodeEditor;
