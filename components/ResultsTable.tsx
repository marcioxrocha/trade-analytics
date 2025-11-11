import React from 'react';
import { QueryResult, ColumnDataType } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import ErrorDisplay from './ErrorDisplay';

const DATA_TYPE_OPTIONS: ColumnDataType[] = ['text', 'integer', 'decimal', 'currency', 'date', 'datetime', 'boolean'];

interface ResultsTableProps {
    queryError: string | null;
    result: QueryResult | null;
    columnTypes: Record<string, ColumnDataType>;
    onColumnTypeChange: (types: Record<string, ColumnDataType>) => void;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ queryError, result, columnTypes, onColumnTypeChange }) => {
    const { t } = useLanguage();

    const handleColumnTypeChange = (col: string, newType: ColumnDataType) => {
        onColumnTypeChange({ ...columnTypes, [col]: newType });
    };

    if (queryError) {
        return (
            <div className="bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-md shadow-inner">
                <h3 className="font-bold">{t('modal.errorTitle')}</h3>
                <ErrorDisplay error={queryError} />
            </div>
        );
    }

    if (!result) {
        return null;
    }

    return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg">
            <h2 className="text-xl font-bold mb-4">{t('queryEditor.results')} ({result.rows.length} rows)</h2>
            <div className="overflow-auto max-h-96">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0">
                        <tr>
                            {result.columns.map(col => (
                                <th key={col} scope="col" className="px-4 py-3 align-top">
                                    <div className="flex flex-col">
                                        <span className="font-bold">{col}</span>
                                        <select
                                            value={columnTypes[col] || 'text'}
                                            onChange={(e) => handleColumnTypeChange(col, e.target.value as ColumnDataType)}
                                            className="text-xs mt-1 p-1 border rounded-md bg-gray-100 dark:bg-gray-600 dark:border-gray-500 focus:ring-indigo-500 focus:border-indigo-500 w-full"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {DATA_TYPE_OPTIONS.map(type => (
                                                <option key={type} value={type}>{t(`queryEditor.types.${type}`)}</option>
                                            ))}
                                        </select>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {result.rows.map((row, index) => (
                            <tr key={index} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 align-top">{String(cell)}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ResultsTable;
    