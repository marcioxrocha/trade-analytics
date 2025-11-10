import React, { useState, useCallback } from 'react';
import { Dashboard, ExportData } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useDashboardModal } from '../contexts/ModalContext';
import Icon from './Icon';

interface ExportImportModalProps {
    mode: 'export' | 'import';
    itemsToExport: { id: string; name: string }[];
    onConfirmExport: (selectedIds: string[]) => void;
    onConfirmImport: (data: ExportData, selectedItems: { id: string; name: string }[]) => void;
    onClose: () => void;
    getImportableItems: (data: ExportData) => { id: string; name: string }[] | undefined;
    title: string;
    selectExportLabel: string;
    selectImportLabel: string;
}

const ExportImportModal: React.FC<ExportImportModalProps> = ({ 
    mode, 
    itemsToExport, 
    onConfirmExport, 
    onConfirmImport, 
    onClose,
    getImportableItems,
    title,
    selectExportLabel,
    selectImportLabel
}) => {
    const { t } = useLanguage();
    const { showModal, hideModal } = useDashboardModal();

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [fileContent, setFileContent] = useState<ExportData | null>(null);
    const [fileName, setFileName] = useState<string>('');

    const itemsToShow = mode === 'export' ? itemsToExport : (fileContent ? getImportableItems(fileContent) || [] : []);

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
                // Basic validation
                if (data.metadata?.version && (data.dashboards || data.dataSources)) {
                    setFileContent(data);
                    setSelectedIds([]); // Reset selection
                } else {
                    throw new Error("Invalid file structure.");
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

    const isAllSelected = selectedIds.length > 0 && selectedIds.length === itemsToShow.length;
    const buttonText = isAllSelected ? t('dashboard.deselectAll') : t('dashboard.selectAll');
    const buttonDisabled = (mode === 'export' && itemsToExport.length === 0) || (mode === 'import' && !fileContent);

    return (
        <div className="space-y-4">
            {mode === 'import' && (
                 <div className="w-full">
                    <label className="block text-sm font-medium mb-2">{t('dashboard.importFilePrompt')}</label>
                    <label
                        htmlFor="file-upload"
                        className="flex items-center justify-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        <Icon name="upload_file" className="w-5 h-5 mr-2" />
                        <span>{fileName || 'Choose a file...'}</span>
                    </label>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".json" />
                </div>
            )}
            
            {((mode === 'export' && itemsToExport.length > 0) || (mode === 'import' && fileContent)) && (
                <>
                    <div>
                        <p className="text-sm font-medium">{mode === 'export' ? selectExportLabel : selectImportLabel}</p>
                    </div>
                    <div className="flex justify-start">
                         <button
                            onClick={handleToggleAll}
                            disabled={buttonDisabled}
                            className="px-3 py-1 text-sm btn-brand text-white rounded-md disabled:opacity-50"
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
                </>
            )}

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

export default ExportImportModal;