import React from 'react';
import { SaveStatus } from '../types';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';

interface SaveStatusIndicatorProps {
    status: SaveStatus;
}

const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({ status }) => {
    const { t } = useLanguage();

    if (status === 'idle') {
        return null;
    }

    switch (status) {
        case 'unsaved':
            return (
                <div className="text-sm text-amber-500 flex items-center gap-1.5" title={t('dashboard.saveStatus.unsaved')}>
                    <Icon name="info" className="w-4 h-4" />
                </div>
            );
        case 'saving-local':
            return (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic flex items-center gap-1.5" title={t('dashboard.saveStatus.savingLocal')}>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                </div>
            );
        case 'saved-local':
            return (
                <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5" title={t('dashboard.saveStatus.savedLocal')}>
                    <Icon name="save" className="w-5 h-5" />
                </div>
            );
        case 'syncing':
             return (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic flex items-center gap-1.5" title={t('dashboard.saveStatus.syncing')}>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400"></div>
                </div>
            );
        case 'saved-remote':
             return (
                <div className="text-sm text-green-500" title={t('dashboard.saveStatus.savedRemote')}>
                    <Icon name="cloud_done" className="w-5 h-5" />
                </div>
            );
        default:
            return null;
    }
}

export default SaveStatusIndicator;