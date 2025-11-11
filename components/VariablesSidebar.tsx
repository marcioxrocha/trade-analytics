import React from 'react';
import { Variable } from '../types';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { resolveVariableValue } from '../services/queryService';

interface VariablesSidebarProps {
    variables: Variable[];
    variableContext: Record<string, any>;
    onInsertVariable: (name: string) => void;
    onManageVariables: () => void;
}

const VariablesSidebar: React.FC<VariablesSidebarProps> = ({ variables, variableContext, onInsertVariable, onManageVariables }) => {
    const { t } = useLanguage();

    return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg mt-16 sticky top-16">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold">{t('queryEditor.availableVars')}</h3>
                <button
                    onClick={onManageVariables}
                    className="flex items-center gap-1 text-sm btn-brand text-white px-2 py-1 rounded-md font-semibold transition-all shadow hover:shadow-md"
                    title={t('dashboard.variables.manageTitle')}
                >
                    <Icon name="variables" className="w-4 h-4" />
                    {t('dashboard.variables.button')}
                </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
                {variables.length > 0 ? variables.map(v => {
                    const resolvedValue = v.isExpression ? resolveVariableValue(v, variableContext) : null;
                    return (
                        <div key={v.id} onClick={() => onInsertVariable(v.name)} className="bg-gray-100 dark:bg-gray-700 p-2 rounded-md cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                            <p className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{v.name}</p>
                            <p className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate">{v.isExpression ? `ƒx: ${v.value}` : v.value}</p>
                            {v.isExpression && (
                                <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    ↳ <span className="italic text-indigo-500 dark:text-indigo-400">preview:</span> <span className="text-green-600 dark:text-green-400 font-semibold">{String(resolvedValue)}</span>
                                </p>
                            )}
                        </div>
                    );
                }) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t('queryEditor.noAvailableVars')}</p>}
            </div>
        </div>
    );
};

export default VariablesSidebar;
