import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useDashboardModal } from '../contexts/ModalContext';
import ScriptLibraryEditor from './ScriptLibraryEditor';
import Icon from './Icon';
import SaveStatusIndicator from './SaveStatusIndicator';

const ScriptLibraryView: React.FC = () => {
    const { t } = useLanguage();
    const { showModal, hideModal } = useDashboardModal();
    const {
        dashboards,
        activeDashboardId,
        updateActiveDashboardScriptLibrary,
        syncAllChanges,
        apiConfig,
        hasUnsyncedChanges,
    } = useAppContext();

    const activeDashboard = useMemo(() => dashboards.find(d => d.id === activeDashboardId), [dashboards, activeDashboardId]);

    const [scriptContent, setScriptContent] = useState('');

    // This effect loads the script from the active dashboard into local state.
    // It ONLY runs when the user switches to a different dashboard (i.e., activeDashboardId changes).
    // This prevents re-renders caused by script updates from overwriting the user's input.
    useEffect(() => {
        if (activeDashboard) {
            setScriptContent(activeDashboard.scriptLibrary || '');
        }
    }, [activeDashboardId, activeDashboard]);

    // This effect is responsible for saving the local state (scriptContent) back to the global context.
    // It uses a debounce to avoid excessive updates while the user is typing.
    useEffect(() => {
        // Prevent saving if there's no active dashboard or if the content hasn't changed from what's in the context.
        if (!activeDashboard || scriptContent === (activeDashboard.scriptLibrary || '')) {
            return;
        }

        const handler = setTimeout(() => {
            updateActiveDashboardScriptLibrary(scriptContent);
        }, 500); // 500ms debounce

        return () => clearTimeout(handler);
    }, [scriptContent, activeDashboard, updateActiveDashboardScriptLibrary]);

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

    if (!activeDashboard) {
        return (
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">{t('scriptLibrary.title')}</h1>
                <p className="text-gray-600 dark:text-gray-400">{t('scriptLibrary.noDashboardActive')}</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex-1 min-w-0 group flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{t('scriptLibrary.titleFor', { name: activeDashboard.name })}</h1>
                    <SaveStatusIndicator status={activeDashboard.saveStatus || 'idle'} />
                </div>
                {(apiConfig.CONFIG_API_URL || apiConfig.CONFIG_SUPABASE_URL) && (
                    <button
                        onClick={handleConfirmSync}
                        disabled={!hasUnsyncedChanges}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white btn-brand rounded-md shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon name="cloud_done" className="w-5 h-5" />
                        {t('dashboard.syncChanges')}
                    </button>
                )}
            </div>
            
             <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <ScriptLibraryEditor
                    script={scriptContent}
                    onScriptChange={setScriptContent}
                />
            </div>
        </div>
    );
};

export default ScriptLibraryView;