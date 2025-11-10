import React from 'react';
import { DashboardFormattingSettings } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface FormattingSettingsManagerProps {
    settings: DashboardFormattingSettings;
    onSettingsChange: (updatedSettings: DashboardFormattingSettings) => void;
}

const FormattingSettingsManager: React.FC<FormattingSettingsManagerProps> = ({ settings, onSettingsChange }) => {
    const { t } = useLanguage();

    const handleSettingChange = <K extends keyof DashboardFormattingSettings>(
        key: K,
        value: DashboardFormattingSettings[K]
    ) => {
        onSettingsChange({ ...settings, [key]: value });
    };

    return (
        <div className="space-y-4">
            {/* Date Format */}
             <div>
                <label className="text-sm font-medium">{t('dashboard.formatting.dateFormat')}</label>
                <input
                    type="text"
                    value={settings.dateFormat}
                    onChange={(e) => handleSettingChange('dateFormat', e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                />
            </div>
            {/* Date Time Format */}
            <div>
                <label className="text-sm font-medium">{t('dashboard.formatting.dateTimeFormat')}</label>
                <input
                    type="text"
                    value={settings.dateTimeFormat}
                    onChange={(e) => handleSettingChange('dateTimeFormat', e.target.value)}
                    placeholder="DD/MM/YYYY HH:mm:ss"
                    className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                />
            </div>
            {/* Currency Symbol */}
            <div>
                <label className="text-sm font-medium">{t('dashboard.formatting.currencySymbol')}</label>
                <input
                    type="text"
                    value={settings.currencySymbol}
                    onChange={(e) => handleSettingChange('currencySymbol', e.target.value)}
                    placeholder="R$"
                    className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                />
            </div>
             {/* Currency Position */}
            <div>
                <label className="text-sm font-medium">{t('dashboard.formatting.currencyPosition')}</label>
                 <select
                    value={settings.currencyPosition}
                    onChange={(e) => handleSettingChange('currencyPosition', e.target.value as 'prefix' | 'suffix')}
                    className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                >
                    <option value="prefix">{t('dashboard.formatting.prefix')}</option>
                    <option value="suffix">{t('dashboard.formatting.suffix')}</option>
                </select>
            </div>
             <div className="flex gap-4">
                {/* Currency Decimal Places */}
                <div className="flex-1">
                    <label className="text-sm font-medium">{t('dashboard.formatting.currencyDecimalPlaces')}</label>
                    <input
                        type="number"
                        min="0"
                        value={settings.currencyDecimalPlaces}
                        onChange={(e) => handleSettingChange('currencyDecimalPlaces', parseInt(e.target.value, 10) || 0)}
                        className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                    />
                </div>
                {/* Number Decimal Places */}
                <div className="flex-1">
                    <label className="text-sm font-medium">{t('dashboard.formatting.numberDecimalPlaces')}</label>
                    <input
                        type="number"
                        min="0"
                        value={settings.numberDecimalPlaces}
                        onChange={(e) => handleSettingChange('numberDecimalPlaces', parseInt(e.target.value, 10) || 0)}
                        className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                    />
                </div>
            </div>

            <div className="flex gap-4">
                {/* Thousands Separator */}
                <div className="flex-1">
                    <label className="text-sm font-medium">{t('dashboard.formatting.thousandsSeparator')}</label>
                    <select
                        value={settings.thousandsSeparator}
                        onChange={(e) => handleSettingChange('thousandsSeparator', e.target.value as '.' | ',')}
                        className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                    >
                        <option value=",">{t('dashboard.formatting.comma')}</option>
                        <option value=".">{t('dashboard.formatting.dot')}</option>
                    </select>
                </div>
                {/* Decimal Separator */}
                <div className="flex-1">
                    <label className="text-sm font-medium">{t('dashboard.formatting.decimalSeparator')}</label>
                    <select
                        value={settings.decimalSeparator}
                        onChange={(e) => handleSettingChange('decimalSeparator', e.target.value as '.' | ',')}
                        className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600"
                    >
                        <option value=",">{t('dashboard.formatting.comma')}</option>
                        <option value=".">{t('dashboard.formatting.dot')}</option>
                    </select>
                </div>
            </div>

        </div>
    );
};

export default FormattingSettingsManager;