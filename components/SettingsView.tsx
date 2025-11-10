import React, { useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { DataSource, DatabaseType, ExportData } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { useDashboardModal } from '../contexts/ModalContext';
import SaveStatusIndicator from './SaveStatusIndicator';
import Modal from './Modal';
import DataSourceExportImportModal from './DataSourceExportImportModal';

const SettingsCard: React.FC<{ title: string; description: string; children?: React.ReactNode }> = ({ title, description, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
        <h3 className="text-xl font-bold text-gray-800 dark:text-white">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 mt-1 mb-4">{description}</p>
        {children}
    </div>
);


const dbTypes: DatabaseType[] = ['LocalStorage (Demo)', 'PostgreSQL', 'MySQL', 'SQL Server', 'Redis', 'MongoDB', 'CosmosDB', 'Supabase'];

const SettingsView: React.FC = () => {
    const { t } = useLanguage();
    const { 
        dataSources, 
        addDataSource, 
        removeDataSource,
        updateDataSource,
        whiteLabelSettings,
        updateWhiteLabelSettings,
        autoSaveEnabled,
        toggleAutoSave,
        settingsSaveStatus,
        syncSettings,
        apiConfig,
        exportDataSources,
        importDataSources,
    } = useAppContext();
    const { showModal, hideModal } = useDashboardModal();
    
    const [newSourceName, setNewSourceName] = useState('');
    const [newSourceType, setNewSourceType] = useState<DatabaseType>('LocalStorage (Demo)');
    const [newSourceString, setNewSourceString] = useState('');
    const [newSourceSupabaseUrl, setNewSourceSupabaseUrl] = useState('');
    const [newSourceSupabaseKey, setNewSourceSupabaseKey] = useState('');
    const [newSourceSupabaseUseProxy, setNewSourceSupabaseUseProxy] = useState(true);
    const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
    const [isDataSourceExportImportModalOpen, setIsDataSourceExportImportModalOpen] = useState(false);
    const [dataSourceModalMode, setDataSourceModalMode] = useState<'export' | 'import'>('export');


    const handleSaveDataSource = (e: React.FormEvent) => {
        e.preventDefault();
        
        const isDemo = newSourceType === 'LocalStorage (Demo)';
        const isSupabase = newSourceType === 'Supabase';
        let isValid = false;
        let errorMessage = t('settings.addFormError');
        let connectionString = '';

        if (!newSourceName.trim() || !newSourceType) {
            isValid = false;
        } else if (isDemo) {
            isValid = true;
            connectionString = 'N/A';
        } else if (isSupabase) {
            if (newSourceSupabaseUrl.trim() && newSourceSupabaseKey.trim()) {
                isValid = true;
                connectionString = JSON.stringify({ 
                    url: newSourceSupabaseUrl.trim(), 
                    key: newSourceSupabaseKey.trim(),
                    useProxy: newSourceSupabaseUseProxy,
                });
            } else {
                isValid = false;
                errorMessage = t('settings.addFormErrorSupabase');
            }
        } else { // Other DB types
            if (newSourceString.trim()) {
                isValid = true;
                connectionString = newSourceString;
            } else {
                 isValid = false;
            }
        }

        if (isValid) {
             if (editingSourceId) {
                updateDataSource({
                    id: editingSourceId,
                    name: newSourceName,
                    type: newSourceType,
                    connectionString: connectionString,
                });
            } else {
                addDataSource({
                    name: newSourceName,
                    type: newSourceType,
                    connectionString: connectionString,
                });
            }
            // Reset form
            handleCancelEdit();
        } else {
            showModal({
                title: t('settings.addFormErrorTitle'),
                content: <p>{errorMessage}</p>,
                footer: <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.ok')}</button>
            });
        }
    };
    
    const handleStartEdit = (source: DataSource) => {
        setEditingSourceId(source.id);
        setNewSourceName(source.name);
        setNewSourceType(source.type);
        
        if (source.type === 'Supabase') {
            try {
                const connDetails = JSON.parse(source.connectionString);
                setNewSourceSupabaseUrl(connDetails.url || '');
                setNewSourceSupabaseKey(connDetails.key || '');
                setNewSourceSupabaseUseProxy(connDetails.useProxy !== false); // Default to true if undefined
            } catch (e) {
                console.error("Could not parse Supabase connection string:", e);
                setNewSourceSupabaseUrl('');
                setNewSourceSupabaseKey('');
                setNewSourceSupabaseUseProxy(true);
            }
            setNewSourceString('');
        } else {
            setNewSourceString(source.connectionString === 'N/A' ? '' : source.connectionString);
            setNewSourceSupabaseUrl('');
            setNewSourceSupabaseKey('');
            setNewSourceSupabaseUseProxy(true);
        }
    };

    const handleCancelEdit = () => {
        setEditingSourceId(null);
        setNewSourceName('');
        setNewSourceType('LocalStorage (Demo)');
        setNewSourceString('');
        setNewSourceSupabaseUrl('');
        setNewSourceSupabaseKey('');
        setNewSourceSupabaseUseProxy(true);
    };

    const handleRemoveDataSource = (source: DataSource) => {
        showModal({
            title: t('settings.removeSourceTitle'),
            content: <p>{t('settings.removeSourceConfirm', { source: source.name })}</p>,
            footer: (
                <div className="flex justify-end gap-2">
                    <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                    <button 
                      onClick={() => {
                        removeDataSource(source.id);
                        hideModal();
                      }} 
                      className="px-4 py-2 bg-red-600 text-white rounded-md"
                    >
                      {t('modal.delete')}
                    </button>
                </div>
            )
        });
    };
    
     const handleConfirmSync = async () => {
        try {
            await syncSettings();
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

    const handleOpenDataSourceExport = () => {
        setDataSourceModalMode('export');
        setIsDataSourceExportImportModalOpen(true);
    };
    const handleOpenDataSourceImport = () => {
        setDataSourceModalMode('import');
        setIsDataSourceExportImportModalOpen(true);
    };
    const handleConfirmDataSourceExport = (selectedIds: string[]) => {
        exportDataSources(selectedIds);
        setIsDataSourceExportImportModalOpen(false);
    };
    const handleConfirmDataSourceImport = (data: ExportData, selectedItems: DataSource[]) => {
        importDataSources(data, selectedItems);
        setIsDataSourceExportImportModalOpen(false);
    };


    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                 <div className="flex-1 min-w-0 group flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{t('settings.title')}</h1>
                    <SaveStatusIndicator status={settingsSaveStatus} />
                </div>
                {apiConfig.CONFIG_API_URL && (
                    <button
                        onClick={handleConfirmSync}
                        disabled={!['unsaved', 'saved-local'].includes(settingsSaveStatus)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white btn-brand rounded-md shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon name="cloud_done" className="w-5 h-5" />
                        {t('dashboard.syncChanges')}
                    </button>
                )}
            </div>
            
            <div className="max-w-4xl mx-auto grid grid-cols-1 gap-6">
                
                 <SettingsCard title={t('settings.personalize')} description={t('settings.personalizeDesc')}>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center gap-2 mt-1">
                                <input
                                    type="color"
                                    value={whiteLabelSettings.brandColor}
                                    onChange={(e) => updateWhiteLabelSettings({ brandColor: e.target.value })}
                                    className="p-1 h-10 w-12 block bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 cursor-pointer rounded-lg"
                                    title={t('settings.brandColor')}
                                />
                                <input
                                    type="text"
                                    value={whiteLabelSettings.brandColor}
                                    onChange={(e) => updateWhiteLabelSettings({ brandColor: e.target.value })}
                                    className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </SettingsCard>
                
                <SettingsCard title={t('settings.application')} description={t('settings.applicationDesc')}>
                    <div className="flex items-center justify-between py-2">
                        <div>
                            <h4 className="font-medium text-gray-800 dark:text-gray-200">{t('settings.autoSave')}</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('settings.autoSaveDesc')}</p>
                        </div>
                        <label htmlFor="autoSaveToggle" className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoSaveEnabled}
                                onChange={toggleAutoSave}
                                id="autoSaveToggle"
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>
                </SettingsCard>

                <SettingsCard title={t('settings.dataSources')} description={t('settings.dataSourcesDesc')}>
                     <div className="flex justify-end gap-2 mb-4">
                        <button onClick={handleOpenDataSourceImport} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors border dark:border-gray-600">
                           <Icon name="upload_file" className="w-4 h-4" />
                           {t('settings.importDataSources')}
                        </button>
                        <button onClick={handleOpenDataSourceExport} disabled={dataSources.length === 0} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors border dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Icon name="download" className="w-4 h-4" />
                            {t('settings.exportDataSources')}
                        </button>
                    </div>
                     <div className="space-y-3 mb-6">
                        {dataSources.map(source => (
                            <div key={source.id} className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-3 rounded-md">
                                <div>
                                    <span className="font-bold block">{source.name}</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{source.type}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => handleStartEdit(source)} className="text-gray-500 hover:text-blue-500 p-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50" aria-label={t('settings.editSourceLabel')}>
                                        <Icon name="edit" className="w-5 h-5" />
                                    </button>
                                    <button onClick={() => handleRemoveDataSource(source)} className="text-gray-500 hover:text-red-500 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50" aria-label={t('settings.removeSourceLabel')}>
                                        <Icon name="close" className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                         {dataSources.length === 0 && <p className="text-gray-500 dark:text-gray-400 text-center py-4">{t('settings.noSources')}</p>}
                    </div>
                    <hr className="my-4 border-gray-200 dark:border-gray-600"/>
                    <h4 className="text-lg font-semibold mb-3">{editingSourceId ? t('settings.editDataSource') : t('settings.addDataSource')}</h4>
                    <form onSubmit={handleSaveDataSource} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium">{t('settings.connectionName')}</label>
                            <input type="text" value={newSourceName} onChange={e => setNewSourceName(e.target.value)} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600" placeholder={t('settings.prodDbPlaceholder')} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">{t('settings.databaseType')}</label>
                            <select value={newSourceType} onChange={e => setNewSourceType(e.target.value as DatabaseType)} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                                {dbTypes.map(type => <option key={type} value={type}>{t(`settings.dbTypes.${type}`)}</option>)}
                            </select>
                        </div>
                        
                        {newSourceType === 'Supabase' ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium">{t('settings.supabaseUrl')}</label>
                                    <input 
                                        type="text" 
                                        value={newSourceSupabaseUrl} 
                                        onChange={e => setNewSourceSupabaseUrl(e.target.value)} 
                                        className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600" 
                                        placeholder={t('settings.supabaseUrlPlaceholder')} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">{t('settings.supabaseAnonKey')}</label>
                                    <input 
                                        type="text" 
                                        value={newSourceSupabaseKey} 
                                        onChange={e => setNewSourceSupabaseKey(e.target.value)} 
                                        className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600" 
                                        placeholder={t('settings.supabaseAnonKeyPlaceholder')} 
                                    />
                                </div>
                                <div className="flex items-start">
                                    <div className="flex items-center h-5">
                                        <input
                                            id="use-proxy"
                                            type="checkbox"
                                            checked={newSourceSupabaseUseProxy}
                                            onChange={(e) => setNewSourceSupabaseUseProxy(e.target.checked)}
                                            className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                        />
                                    </div>
                                    <div className="ml-3 text-sm">
                                        <label htmlFor="use-proxy" className="font-medium text-gray-700 dark:text-gray-300">
                                            {t('settings.useProxy')}
                                        </label>
                                        <p className="text-gray-500 dark:text-gray-400">{t('settings.useProxyDesc')}</p>
                                    </div>
                                </div>
                            </>
                        ) : (
                             <div>
                                <label className="block text-sm font-medium">{t('settings.connectionString')}</label>
                                <input 
                                    type="text" 
                                    value={newSourceString} 
                                    onChange={e => setNewSourceString(e.target.value)} 
                                    className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-600" 
                                    placeholder="protocol://user:pass@host:port/db" 
                                    disabled={newSourceType === 'LocalStorage (Demo)'}
                                />
                            </div>
                        )}
                        
                         <div className="flex items-center gap-2 pt-2">
                             {editingSourceId && (
                                <button type="button" onClick={handleCancelEdit} className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">
                                    {t('modal.cancel')}
                                </button>
                            )}
                            <button type="submit" className="w-full flex justify-center items-center btn-brand text-white px-4 py-2 rounded-md font-semibold transition-all shadow">
                                <Icon name={editingSourceId ? "save" : "add"} className="w-5 h-5 mr-2" />
                                {editingSourceId ? t('settings.updateConnection') : t('settings.saveConnection')}
                            </button>                            
                        </div>
                    </form>
                </SettingsCard>

            </div>
            <Modal
                isOpen={isDataSourceExportImportModalOpen}
                onClose={() => setIsDataSourceExportImportModalOpen(false)}
                title={dataSourceModalMode === 'export' ? t('settings.exportDataSources') : t('settings.importDataSources')}
            >
                <DataSourceExportImportModal
                    mode={dataSourceModalMode}
                    dataSourcesToExport={dataSources}
                    onConfirmExport={handleConfirmDataSourceExport}
                    onConfirmImport={handleConfirmDataSourceImport}
                    onClose={() => setIsDataSourceExportImportModalOpen(false)}
                />
            </Modal>
        </div>
    );
};

export default SettingsView;