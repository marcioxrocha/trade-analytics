import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Variable, VariableOption } from '../types';
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
    const [currentOptions, setCurrentOptions] = useState<VariableOption[]>([]);
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
        setCurrentOptions(editingVariable?.options || []);
        varNameRef.current?.focus();
    }, [editingVariable]);


    const handleVariableSubmit = () => {
        const name = varNameRef.current?.value.trim();
        const value = varValueRef.current?.value.trim();

        if (!name) return;
        
        const finalValue = (currentOptions.length > 0 && !currentOptions.some(o => o.value === value)) 
            ? (currentOptions[0]?.value || '') 
            : (value || '');

        if (editingVariable) {
             const updatedVars = variables.map(v => 
                v.id === editingVariable.id ? { ...editingVariable, name, value: finalValue, isExpression, options: currentOptions.length > 0 ? currentOptions : undefined } : v
            );
            onVariablesChange(updatedVars);
            setEditingVariable(null);
        } else {
            const newVar: Variable = { id: crypto.randomUUID(), dashboardId, name, value: finalValue, isExpression, showOnDashboard: true, options: currentOptions.length > 0 ? currentOptions : undefined };
            onVariablesChange([...variables, newVar]);
            if(varNameRef.current) varNameRef.current.value = '';
            if(varValueRef.current) varValueRef.current.value = '';
            setIsExpression(false);
            setCurrentOptions([]);
            varNameRef.current?.focus();
        }
    };
    
    const handleClearForm = () => {
        setEditingVariable(null);
    };
    
    const handleRemove = (id: string) => {
        onVariablesChange(variables.filter(v => v.id !== id));
        if (editingVariable && editingVariable.id === id) {
            setEditingVariable(null);
        }
    }
    
    const handleToggleShowOnDashboard = (id: string, isChecked: boolean) => {
        onVariablesChange(variables.map(v => v.id === id ? { ...v, showOnDashboard: isChecked } : v));
    };

    const handleAddOption = () => {
        setCurrentOptions(prev => [...prev, { label: '', value: '' }]);
    };
    
    const handleUpdateOption = (index: number, field: 'label' | 'value', text: string) => {
        setCurrentOptions(prev => prev.map((opt, i) => i === index ? { ...opt, [field]: text } : opt));
    };

    const handleRemoveOption = (index: number) => {
        setCurrentOptions(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-[400px]">
            {/* Left Form Column */}
            <div className="lg:col-span-2">
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3 h-full">
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

                    <div className="pt-2 border-t dark:border-gray-600/50">
                        <h5 className="font-semibold text-sm">{t('dashboard.variables.options')}</h5>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('dashboard.variables.optionsDesc')}</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                            {currentOptions.map((opt, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input type="text" placeholder={t('dashboard.variables.label')} value={opt.label} onChange={(e) => handleUpdateOption(index, 'label', e.target.value)} className="flex-1 p-2 border rounded-md text-sm bg-white dark:bg-gray-800 dark:border-gray-600" />
                                    <input type="text" placeholder={t('dashboard.variables.value')} value={opt.value} onChange={(e) => handleUpdateOption(index, 'value', e.target.value)} className="flex-1 p-2 border rounded-md text-sm bg-white dark:bg-gray-800 dark:border-gray-600" />
                                    <button onClick={() => handleRemoveOption(index)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full">
                                        <Icon name="close" className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={handleAddOption} className="mt-2 flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                            <Icon name="add" className="w-4 h-4" />
                            {t('dashboard.variables.addOption')}
                        </button>
                    </div>

                    <div className="flex gap-2 pt-2 border-t dark:border-gray-600/50">
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
            </div>

            {/* Right List Column */}
            <div className="lg:col-span-3">
                <div className="space-y-2 max-h-[450px] overflow-y-auto pr-2">
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
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center text-xs cursor-pointer select-none text-gray-600 dark:text-gray-300" title={t('dashboard.variables.showOnDashboard')}>
                                        <input
                                            type="checkbox"
                                            checked={!!v.showOnDashboard}
                                            onChange={(e) => handleToggleShowOnDashboard(v.id, e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                    </label>
                                    <button onClick={() => setEditingVariable(v)} aria-label={`Edit variable ${v.name}`} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><Icon name="edit" className="w-4 h-4" /></button>
                                    <button onClick={() => handleRemove(v.id)} aria-label={`Remove variable ${v.name}`} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><Icon name="close" className="w-4 h-4 text-red-500" /></button>
                                </div>
                            </div>
                        );
                    }) : (fixedVariables.length === 0 && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">{t('dashboard.variables.none')}</p>)}
                </div>
            </div>
        </div>
    );
};

export default VariablesManager;