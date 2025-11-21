
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import Icon from './Icon';

interface KeyValue {
    key: string;
    value: string;
}

interface RestConfig {
    endpoint: string;
    method: string;
    headers: KeyValue[];
    params: KeyValue[];
    body: string;
}

interface RestQueryBuilderProps {
    configJson: string;
    onChange: (newJson: string) => void;
}

const RestQueryBuilder: React.FC<RestQueryBuilderProps> = ({ configJson, onChange }) => {
    const { t } = useLanguage();
    const [config, setConfig] = useState<RestConfig>({
        endpoint: '',
        method: 'GET',
        headers: [],
        params: [],
        body: ''
    });

    useEffect(() => {
        try {
            const parsed = JSON.parse(configJson);
            setConfig({
                endpoint: parsed.endpoint || '',
                method: parsed.method || 'GET',
                headers: parsed.headers || [],
                params: parsed.params || [],
                body: parsed.body || ''
            });
        } catch (e) {
            // Fallback for empty or invalid JSON
            setConfig({
                endpoint: '',
                method: 'GET',
                headers: [],
                params: [],
                body: ''
            });
        }
    }, [configJson]);

    const updateConfig = (newConfig: RestConfig) => {
        setConfig(newConfig);
        onChange(JSON.stringify(newConfig));
    };

    const handleFieldChange = (field: keyof RestConfig, value: any) => {
        const newConfig = { ...config, [field]: value };
        updateConfig(newConfig);
    };

    const handleKeyValueChange = (listType: 'headers' | 'params', index: number, keyOrValue: 'key' | 'value', newValue: string) => {
        const list = [...config[listType]];
        list[index][keyOrValue] = newValue;
        handleFieldChange(listType, list);
    };

    const addKeyValue = (listType: 'headers' | 'params') => {
        const list = [...config[listType], { key: '', value: '' }];
        handleFieldChange(listType, list);
    };

    const removeKeyValue = (listType: 'headers' | 'params', index: number) => {
        const list = config[listType].filter((_, i) => i !== index);
        handleFieldChange(listType, list);
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg flex flex-col h-[32rem] overflow-auto">
            <div className="p-4 space-y-6">
                {/* Method and Endpoint */}
                <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('restBuilder.method')}</label>
                        <select
                            value={config.method}
                            onChange={(e) => handleFieldChange('method', e.target.value)}
                            className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                        >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                            <option value="PATCH">PATCH</option>
                        </select>
                    </div>
                    <div className="col-span-3">
                        <label className="block text-sm font-medium mb-1">{t('restBuilder.endpoint')}</label>
                        <input
                            type="text"
                            value={config.endpoint}
                            onChange={(e) => handleFieldChange('endpoint', e.target.value)}
                            placeholder="/api/users"
                            className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                        />
                    </div>
                </div>

                {/* Headers */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium">{t('restBuilder.headers')}</label>
                        <button onClick={() => addKeyValue('headers')} type="button" className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center hover:underline">
                            <Icon name="add" className="w-3 h-3 mr-1"/> {t('restBuilder.addHeader')}
                        </button>
                    </div>
                    <div className="space-y-2">
                        {config.headers.map((header, index) => (
                            <div key={index} className="flex gap-2">
                                <input
                                    placeholder="Key"
                                    value={header.key}
                                    onChange={(e) => handleKeyValueChange('headers', index, 'key', e.target.value)}
                                    className="flex-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-xs font-mono"
                                />
                                <input
                                    placeholder="Value"
                                    value={header.value}
                                    onChange={(e) => handleKeyValueChange('headers', index, 'value', e.target.value)}
                                    className="flex-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-xs font-mono"
                                />
                                <button onClick={() => removeKeyValue('headers', index)} className="text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 p-1 rounded">
                                    <Icon name="close" className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {config.headers.length === 0 && <p className="text-xs text-gray-400 italic">{t('restBuilder.noHeaders')}</p>}
                    </div>
                </div>

                {/* Query Params */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium">{t('restBuilder.params')}</label>
                        <button onClick={() => addKeyValue('params')} type="button" className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center hover:underline">
                            <Icon name="add" className="w-3 h-3 mr-1"/> {t('restBuilder.addParam')}
                        </button>
                    </div>
                    <div className="space-y-2">
                        {config.params.map((param, index) => (
                            <div key={index} className="flex gap-2">
                                <input
                                    placeholder="Key"
                                    value={param.key}
                                    onChange={(e) => handleKeyValueChange('params', index, 'key', e.target.value)}
                                    className="flex-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-xs font-mono"
                                />
                                <input
                                    placeholder="Value"
                                    value={param.value}
                                    onChange={(e) => handleKeyValueChange('params', index, 'value', e.target.value)}
                                    className="flex-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-xs font-mono"
                                />
                                <button onClick={() => removeKeyValue('params', index)} className="text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 p-1 rounded">
                                    <Icon name="close" className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {config.params.length === 0 && <p className="text-xs text-gray-400 italic">{t('restBuilder.noParams')}</p>}
                    </div>
                </div>

                {/* Body */}
                <div>
                    <label className="block text-sm font-medium mb-1">{t('restBuilder.body')}</label>
                    <textarea
                        value={config.body}
                        onChange={(e) => handleFieldChange('body', e.target.value)}
                        className="w-full h-32 p-2 font-mono text-sm border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder='{"key": "value"}'
                    />
                </div>
            </div>
        </div>
    );
};

export default RestQueryBuilder;
