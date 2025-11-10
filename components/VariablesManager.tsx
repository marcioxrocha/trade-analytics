

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Variable } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import Icon from './Icon';
import { buildVariableContext, resolveVariableValue } from '../services/queryService';

interface VariablesManagerProps {
    dashboardId: string;
    variables: Variable[]; 
    onVariablesChange: (updatedVariables: Variable[]) => void;
    department?: string;
    owner?: string;
}

const VariablesManager: React.FC<VariablesManagerProps> = ({ dashboardId, variables, onVariablesChange, department, owner }) => {
    const { t } = useLanguage();
    const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
    const [isExpression, setIsExpression] = useState(false);
    const varNameRef = useRef<HTMLInputElement>(null);
    const varValueRef = useRef<HTMLInputElement>(null);

    const fixedVariables = useMemo(() => {
        const vars: Variable[] = [];
        if (department) {
            vars.push({ id: 'fixed-dept', dashboardId, name: 'department', value: department });
        }
        if (owner) {
            vars.push({ id: 'fixed-owner', dashboardId, name: 'owner', value: owner });
        }
        return vars;
    }, [department, owner, dashboardId]);

    const variableContext = useMemo(() => buildVariableContext(variables), [variables]);

    useEffect(() => {
        if (varNameRef.current) {
            varNameRef.current.value = editingVariable?.name || '';
        }
        if (varValueRef.current) {
            varValueRef.current.value = editingVariable?.value || '';
        }
        setIsExpression(editingVariable?.isExpression || false);
        varNameRef.current?.focus();
    }, [editingVariable]);


    const handleVariableSubmit = () => {
        const name = varNameRef.current?.value.trim();
        const value = varValueRef.current?.value.trim();

        if (!name) return;

        if (editingVariable) {
             const updatedVars = variables.map(v => 
                v.id === editingVariable.id ? { ...editingVariable, name, value: value || '', isExpression } : v
            );
            onVariablesChange(updatedVars);
            setEditingVariable(null);
        } else {
            const newVar: Variable = { id: crypto.randomUUID(), dashboardId, name, value: value || '', isExpression };
            onVariablesChange([...variables, newVar]);
            if(varNameRef.current) varNameRef.current.value = '';
            if(varValueRef.current) varValueRef.current.value = '';
            setIsExpression(false);
            varNameRef.current?.focus();
        }
    };
    
    const handleClearForm = () => {
        setEditingVariable(null);
        setIsExpression(false);
    };
    
    const handleRemove = (id: string) => {
        onVariablesChange(variables.filter(v => v.id !== id));
        if (editingVariable && editingVariable.id === id) {
            setEditingVariable(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
                <h4 className="font-semibold">{editingVariable ? t('dashboard.variables.editTitle') : t('dashboard.variables.addTitle')}</h4>
                <div>
                    <label className="text-sm font-medium">{t('dashboard.variables.name')}</label>
                    <input ref={varNameRef} type="text" placeholder="e.g. sales_target" className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600" />
                </div>
                <div>
                    <label className="text-sm font-medium">{t('dashboard.variables.value')}</label>
                    <input ref={varValueRef} type="text" placeholder="e.g. 500 or new Date().getFullYear()" className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600" />
                    <div className="flex items-center mt-2">
                        <input
                            id="is-expression-checkbox"
                            type="checkbox"
                            checked={isExpression}
                            onChange={(e) => setIsExpression(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="is-expression-checkbox" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                             {t('dashboard.variables.evaluateAsExpression')}
                        </label>
                    </div>
                </div>
                <div className="flex gap-2">
                   {editingVariable ? (
                        <>
                            <button onClick={handleClearForm} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md text-sm">{t('dashboard.variables.clearForm')}</button>
                            <button onClick={handleVariableSubmit} className="flex-1 px-4 py-2 btn-brand text-white rounded-md text-sm">{t('modal.save')}</button>
                        </>
                    ) : (
                        <button onClick={handleVariableSubmit} className="w-full px-4 py-2 btn-brand text-white rounded-md text-sm">{t('modal.create')}</button>
                    )}
                </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
                {fixedVariables.map(v => (
                    <div key={v.id} className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-2 rounded-md opacity-80">
                        <div>
                            <p className="font-mono text-sm font-bold">{v.name}</p>
                            <p className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{v.value}</p>
                        </div>
                        <div className="flex gap-2">
                            <Icon name="info" className="w-4 h-4 text-blue-500" />
                        </div>
                    </div>
                ))}
                {(fixedVariables.length > 0 && variables.length > 0) && <hr className="border-gray-200 dark:border-gray-600 my-2" />}
                {variables.length > 0 ? variables.map(v => {
                    const resolvedValue = v.isExpression ? resolveVariableValue(v, variableContext) : null;
                    return (
                        <div key={v.id} className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                            <div>
                                <p className="font-mono text-sm font-bold">{v.name}</p>
                                <p className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                    {v.isExpression ? `ƒx: ${v.value}` : v.value}
                                </p>
                                {v.isExpression && (
                                    <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        ↳ <span className="italic text-indigo-500 dark:text-indigo-400">preview:</span> <span className="text-green-600 dark:text-green-400 font-semibold">{String(resolvedValue)}</span>
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setEditingVariable(v)} aria-label={`Edit variable ${v.name}`}><Icon name="edit" className="w-4 h-4" /></button>
                                <button onClick={() => handleRemove(v.id)} aria-label={`Remove variable ${v.name}`}><Icon name="close" className="w-4 h-4 text-red-500" /></button>
                            </div>
                        </div>
                    );
                }) : (fixedVariables.length === 0 && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">{t('dashboard.variables.none')}</p>)}
            </div>
        </div>
    );
};

export default VariablesManager;