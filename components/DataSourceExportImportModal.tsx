import React, { useState } from 'react';
import { ExportData, DataSource } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useDashboardModal } from '../contexts/ModalContext';
import Icon from './Icon';

interface DataSourceExportImportModalProps {
    mode: 'export' | 'import';
    dataSourcesToExport: DataSource[];
    onConfirmExport: (selectedIds: string[]) => void;
    onConfirmImport: (data: ExportData, selectedItems: DataSource[]) => void;
    onClose: () => void;
}

const DataSourceExportImportModal: React.FC<DataSourceExportImportModalProps> = ({ 
    mode, 
    dataSourcesToExport,
    onConfirmExport, 
    onConfirmImport, 
    onClose,
}) => {
    const { t } = useLanguage();
    const { showModal, hideModal } = useDashboardModal();

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [fileContent, setFileContent] = useState<ExportData | null>(null);
    const [fileName, setFileName] = useState<string>('');
    
    let itemsToShow: DataSource[];
    if (mode === 'import') {
        itemsToShow = fileContent?.dataSources || [];
    } else {
        itemsToShow = dataSourcesToExport;
    }

    const handleToggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleToggleAll = () => {
        if (selectedIds.length === itemsToShow.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(itemsToShow.map(d => d.id));
        }
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const data = JSON.parse(text);
                if (data.metadata?.version && data.dataSources) {
                    setFileContent(data);
                    setSelectedIds([]);
                } else {
                    throw new Error("Invalid file structure for data source import.");
                }
            } catch (error) {
                setFileContent(null);
                setFileName('');
                showModal({
                    title: t('dashboard.importErrorTitle'),
                    content: <p>{t('dashboard.importInvalidFile')}</p>,
                    footer: <button onClick={hideModal} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.ok')}</button>
                });
            }
        };
        reader.readAsText(file);
    };

    const handleSubmit = () => {
        if (mode === 'export') {
            onConfirmExport(selectedIds);
        } else if (fileContent) {
            const selectedItems = itemsToShow.filter(item => selectedIds.includes(item.id));
            onConfirmImport(fileContent, selectedItems);
        }
    };
    
    const renderList = () => {
        if (itemsToShow.length === 0) {
             const message = mode === 'export'
                ? t('settings.noDataSourcesToExport')
                : t('dashboard.importFilePrompt');
            return <p className="text-center text-gray-500 dark:text-gray-400 py-4">{message}</p>;
        }

        const isAllSelected = selectedIds.length === itemsToShow.length && itemsToShow.length > 0;
        const buttonText = isAllSelected ? t('dashboard.deselectAll') : t('dashboard.selectAll');
        
        return (
            <div className="space-y-3">
                <div>
                    <p className="text-sm font-medium">{mode === 'export' ? "Selecione as fontes de dados para exportar:" : "Selecione as fontes de dados do arquivo para importar:"}</p>
                </div>
                <div className="flex justify-start">
                     <button
                        onClick={handleToggleAll}
                        className="px-3 py-1 text-sm btn-brand text-white rounded-md"
                    >
                        {buttonText}
                    </button>
                </div>
                <div className="border rounded-md max-h-60 overflow-y-auto dark:border-gray-600">
                    {itemsToShow.map(item => (
                        <div key={item.id} className="flex items-center p-3 border-b dark:border-gray-700 last:border-b-0">
                            <input
                                type="checkbox"
                                id={`item-select-${item.id}`}
                                checked={selectedIds.includes(item.id)}
                                onChange={() => handleToggleSelection(item.id)}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor={`item-select-${item.id}`} className="ml-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {item.name}
                            </label>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {mode === 'import' && (
                 <div className="w-full">
                    <label className="block text-sm font-medium mb-2">{t('dashboard.importFilePrompt')}</label>
                    <label
                        htmlFor="file-upload-ds"
                        className="flex items-center justify-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        <Icon name="upload_file" className="w-5 h-5 mr-2" />
                        <span>{fileName || 'Choose a file...'}</span>
                    </label>
                    <input id="file-upload-ds" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".json" />
                </div>
            )}
            
            {mode === 'export' && renderList()}
            {mode === 'import' && fileContent && renderList()}

            <div className="flex items-center justify-end p-0 pt-2 space-x-2">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                <button
                    onClick={handleSubmit}
                    disabled={selectedIds.length === 0}
                    className="px-4 py-2 btn-brand text-white rounded-md disabled:opacity-50"
                >
                    {mode === 'export' ? t('modal.export') : t('modal.import')}
                </button>
            </div>
        </div>
    );
};

export default DataSourceExportImportModal;