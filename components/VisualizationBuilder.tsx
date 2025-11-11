

import React, { useState, useEffect, useMemo } from 'react';
import { ChartCardData, ChartType, QueryResult, ColumnDataType, QueryLanguage, TableConfig, AggregationType } from '../types';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';

interface VisualizationBuilderProps {
  result: QueryResult | null;
  onSave: (card: Omit<ChartCardData, 'id' | 'dashboardId'>) => void;
  onPreviewChange: (card: ChartCardData | null) => void;
  initialConfig: ChartCardData | null;
  currentQuery: string;
  currentQueryLanguage: QueryLanguage;
  currentDataSourceId: string;
  columnTypes: Record<string, ColumnDataType>;
  isEditing: boolean;
}

const VisualizationBuilder: React.FC<VisualizationBuilderProps> = ({ 
    result, 
    onSave, 
    onPreviewChange, 
    initialConfig,
    currentQuery,
    currentQueryLanguage,
    currentDataSourceId,
    columnTypes,
    isEditing
}) => {
  const { t } = useLanguage();
  const { activeDashboardId } = useAppContext();
  
  const [vizTitle, setVizTitle] = useState(t('queryEditor.myQueryChart'));
  const [vizDescription, setVizDescription] = useState('');
  const [vizType, setVizType] = useState<ChartType>(ChartType.TABLE);
  const [vizCategoryKey, setVizCategoryKey] = useState<string>('');
  const [vizDataKey, setVizDataKey] = useState<string>('');
  const [vizDataKeys, setVizDataKeys] = useState<string[]>([]);
  const [vizGridSpan, setVizGridSpan] = useState(2);
  const [vizGridRowSpan, setVizGridRowSpan] = useState(2);
  const [vizKpiFormat, setVizKpiFormat] = useState<'number' | 'percent'>('number');
  const [vizTableConfig, setVizTableConfig] = useState<TableConfig>({ showSummaryRow: false, summaryColumns: {} });
  const isSpacer = vizType === ChartType.SPACER;

  const columns = useMemo(() => {
    if (result?.columns) {
        return result.columns;
    }
    if (initialConfig) {
        const knownColumns = new Set<string>();
        if (initialConfig.categoryKey) knownColumns.add(initialConfig.categoryKey);
        if (initialConfig.dataKey) knownColumns.add(initialConfig.dataKey);
        if(initialConfig.dataKeys) initialConfig.dataKeys.forEach(k => knownColumns.add(k));
        return Array.from(knownColumns);
    }
    return [];
  }, [result, initialConfig]);

  // Effect to load the initial configuration when editing a card.
  // Runs only when the card being edited changes.
  useEffect(() => {
    if (initialConfig) {
      setVizTitle(initialConfig.title);
      setVizDescription(initialConfig.description || '');
      setVizType(initialConfig.type);
      setVizCategoryKey(initialConfig.categoryKey || '');
      setVizDataKey(initialConfig.dataKey || '');
      setVizDataKeys(initialConfig.dataKeys || []);
      setVizGridSpan(initialConfig.gridSpan);
      setVizGridRowSpan(initialConfig.gridRowSpan || (initialConfig.type === ChartType.KPI ? 1 : 2));
      setVizTableConfig(initialConfig.tableConfig || { showSummaryRow: false, summaryColumns: {} });
      if (initialConfig.kpiConfig) {
          setVizKpiFormat(initialConfig.kpiConfig.format);
      }
    }
  }, [initialConfig]);

  // Effect to set default values for a new card once query results are available.
  // This is separated to prevent it from resetting the state while editing.
  useEffect(() => {
    if (!initialConfig && result && result.columns.length > 0) {
      setVizTitle(t('queryEditor.myQueryChart'));
      setVizDescription('');
      setVizType(ChartType.TABLE);
      setVizCategoryKey(result.columns[0]);
      const defaultDataKey = result.columns.length > 1 ? result.columns[1] : result.columns[0];
      setVizDataKey(defaultDataKey);
      setVizDataKeys([defaultDataKey]);
      setVizGridSpan(2);
      setVizGridRowSpan(2);
      setVizKpiFormat('number');
      setVizTableConfig({ showSummaryRow: false, summaryColumns: {} });
    }
  }, [result, initialConfig, t]);


  // Smart defaults for axes and card size based on vizType, for NEW cards only.
  useEffect(() => {
    // This entire hook should only apply defaults when creating a new card.
    // When editing, the initial state is set from `initialConfig` and should be preserved.
    if (initialConfig) {
      return;
    }

    setVizGridRowSpan(vizType === ChartType.KPI ? 1 : 2);
    setVizGridSpan(vizType === ChartType.KPI ? 1 : (vizType === ChartType.SPACER ? 1 : 2));

    if (columns.length > 0) {
      const isGraphicalChart = [ChartType.BAR, ChartType.LINE, ChartType.AREA, ChartType.MULTI_LINE].includes(vizType);
      if (isGraphicalChart) {
        // If the current category key isn't valid for the new columns, pick the first one.
        if (!vizCategoryKey || !columns.includes(vizCategoryKey)) {
          setVizCategoryKey(columns[0]);
        }
      }

      // For single-series charts, ensure a valid data key is selected.
      if ([ChartType.BAR, ChartType.LINE, ChartType.AREA, ChartType.KPI].includes(vizType)) {
        if (!vizDataKey || !columns.includes(vizDataKey)) {
          setVizDataKey(columns.length > 1 ? columns[1] : columns[0]);
        }
      }
      
      // For multi-line, ensure at least one key is selected.
      if (vizType === ChartType.MULTI_LINE) {
        if (vizDataKeys.length === 0 || vizDataKeys.every(k => !columns.includes(k))) {
          setVizDataKeys([columns.length > 1 ? columns[1] : columns[0]]);
        }
      }
    }
  // This hook should react to type changes or when columns become available for a new chart.
  // Do not include state setters like vizCategoryKey, vizDataKey, vizDataKeys in dependencies.
  }, [vizType, columns, initialConfig]);

   useEffect(() => {
    if (isSpacer) {
      setVizTitle(t('chartCard.spacerTitle'));
      setVizDescription(t('chartCard.spacerDescription'));
    }
  }, [isSpacer, t]);


  const previewCardData: ChartCardData | null = useMemo(() => {
    if (!activeDashboardId || (!result && !isSpacer)) return null;

    const transformedData = result?.rows.map(row => {
      const obj: { [key: string]: any } = {};
      result.columns.forEach((col, index) => {
        obj[col] = row[index];
      });
      return obj;
    }) || [];

    const isMulti = vizType === ChartType.MULTI_LINE;

    return {
      id: 'preview-card',
      dashboardId: activeDashboardId,
      title: vizTitle,
      description: vizDescription,
      type: vizType,
      data: isSpacer ? [] : transformedData,
      query: isSpacer ? '' : currentQuery,
      queryLanguage: isSpacer ? 'sql' : currentQueryLanguage,
      dataSourceId: isSpacer ? '' : currentDataSourceId,
      columnTypes,
      tableConfig: vizType === ChartType.TABLE ? vizTableConfig : undefined,
      dataKey: isSpacer ? '' : (isMulti ? (vizDataKeys[0] || '') : vizDataKey),
      dataKeys: isMulti ? vizDataKeys : undefined,
      categoryKey: isSpacer ? '' : vizCategoryKey,
      gridSpan: vizGridSpan,
      gridRowSpan: vizGridRowSpan,
      kpiConfig: vizType === ChartType.KPI ? { format: vizKpiFormat } : undefined,
    };
  }, [result, vizTitle, vizDescription, vizType, vizDataKey, vizDataKeys, vizCategoryKey, currentQuery, currentDataSourceId, vizGridSpan, vizGridRowSpan, vizKpiFormat, activeDashboardId, columnTypes, currentQueryLanguage, isSpacer, vizTableConfig]);

  useEffect(() => {
    onPreviewChange(previewCardData);
  }, [previewCardData, onPreviewChange]);

  const handleSpanChange = (setter: React.Dispatch<React.SetStateAction<number>>, value: string) => {
    let num = parseInt(value, 10);
    if (isNaN(num)) {
        // If the user clears the input, default to 1 as it's the minimum valid value.
        setter(1); 
        return;
    }
    // Clamp the value between 1 and 4
    const clampedNum = Math.max(1, Math.min(4, num));
    setter(clampedNum);
  };
  
  const handleDataKeysChange = (columnName: string) => {
    setVizDataKeys(prev => 
        prev.includes(columnName)
            ? prev.filter(c => c !== columnName)
            : [...prev, columnName]
    );
  };

  const handleSummaryConfigChange = (column: string, agg: AggregationType | 'none') => {
    setVizTableConfig(prev => {
        const newSummaryColumns = { ...prev.summaryColumns };
        if (agg === 'none') {
            delete newSummaryColumns[column];
        } else {
            newSummaryColumns[column] = agg;
        }
        return { ...prev, summaryColumns: newSummaryColumns };
    });
  };

  const handleSaveClick = () => {
    const isMulti = vizType === ChartType.MULTI_LINE;
    const cardConfig: Omit<ChartCardData, 'id' | 'dashboardId'> = {
      title: vizTitle,
      description: isSpacer ? t('chartCard.spacerDescription') : (vizDescription.trim() || undefined),
      type: vizType,
      query: isSpacer ? '' : currentQuery,
      queryLanguage: isSpacer ? 'sql' : currentQueryLanguage,
      dataSourceId: isSpacer ? '' : currentDataSourceId,
      columnTypes: isSpacer ? {} : columnTypes,
      tableConfig: vizType === ChartType.TABLE ? vizTableConfig : undefined,
      dataKey: isSpacer ? '' : (isMulti ? (vizDataKeys[0] || '') : vizDataKey),
      dataKeys: isMulti ? vizDataKeys : undefined,
      categoryKey: isSpacer ? '' : vizCategoryKey,
      gridSpan: vizGridSpan,
      gridRowSpan: vizGridRowSpan,
      kpiConfig: vizType === ChartType.KPI ? { format: vizKpiFormat } : undefined,
    };
    onSave(cardConfig);
  };

  const buttonText = isEditing ? t('queryEditor.updateCard') : t('queryEditor.addToDashboard');
  const buttonClass = isEditing 
    ? "bg-yellow-600 hover:bg-yellow-700" 
    : "bg-green-600 hover:bg-green-700";
    
  const numericColumns = useMemo(() => {
    return columns.filter(col => ['integer', 'decimal', 'currency'].includes(columnTypes[col]));
  }, [columns, columnTypes]);


  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg">
      <h2 className="text-xl font-bold mb-4">{t('queryEditor.createVisualization')}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium">{t('queryEditor.chartType')}</label>
          <select value={vizType} onChange={e => setVizType(e.target.value as ChartType)} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
            <option value={ChartType.TABLE}>{t('queryEditor.table')}</option>
            <option value={ChartType.BAR}>{t('queryEditor.barChart')}</option>
            <option value={ChartType.LINE}>{t('queryEditor.lineChart')}</option>
            <option value={ChartType.MULTI_LINE}>{t('queryEditor.multiLineChart')}</option>
            <option value={ChartType.AREA}>{t('queryEditor.areaChart')}</option>
            <option value={ChartType.KPI}>{t('queryEditor.kpi')}</option>
            <option value={ChartType.SPACER}>{t('queryEditor.spacer')}</option>
          </select>
        </div>

        {!isSpacer && (
          <>
            <div>
              <label className="block text-sm font-medium">{t('queryEditor.vizTitle')}</label>
              <input type="text" value={vizTitle} onChange={e => setVizTitle(e.target.value)} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600" />
            </div>
            <div>
              <label className="block text-sm font-medium">{t('queryEditor.vizDescription')}</label>
              <textarea
                value={vizDescription}
                onChange={(e) => setVizDescription(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 h-20 resize-none"
                placeholder={t('queryEditor.vizDescriptionPlaceholder')}
              />
            </div>

            {vizType === ChartType.TABLE && (
                <div className="border-t pt-4">
                    <h3 className="text-md font-semibold mb-2">{t('queryEditor.summaryRow.title')}</h3>
                    <div className="flex items-center mb-3">
                        <input
                            id="show-summary-row"
                            type="checkbox"
                            checked={vizTableConfig.showSummaryRow}
                            onChange={e => setVizTableConfig(prev => ({ ...prev, showSummaryRow: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="show-summary-row" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            {t('queryEditor.summaryRow.enable')}
                        </label>
                    </div>
                    {vizTableConfig.showSummaryRow && (
                        <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                            <div className="grid grid-cols-2 gap-x-4">
                                <label className="block text-xs font-medium text-gray-500">{t('queryEditor.summaryRow.column')}</label>
                                <label className="block text-xs font-medium text-gray-500">{t('queryEditor.summaryRow.aggregation')}</label>
                            </div>
                            {numericColumns.map(col => (
                                <div key={col} className="grid grid-cols-2 gap-x-4 items-center">
                                    <span className="text-sm font-medium truncate">{col}</span>
                                    <select
                                        value={vizTableConfig.summaryColumns?.[col] || 'none'}
                                        onChange={e => handleSummaryConfigChange(col, e.target.value as AggregationType | 'none')}
                                        className="w-full p-1.5 border rounded-md text-sm bg-white dark:bg-gray-800 dark:border-gray-600"
                                    >
                                        <option value="none">{t('queryEditor.summaryRow.none')}</option>
                                        <option value="total">{t('queryEditor.summaryRow.total')}</option>
                                        <option value="average">{t('queryEditor.summaryRow.average')}</option>
                                    </select>
                                </div>
                            ))}
                            {numericColumns.length === 0 && <p className="text-xs text-gray-500 text-center py-2">{t('queryEditor.runQueryToEditColumns')}</p>}
                        </div>
                    )}
                </div>
            )}


            {vizType === ChartType.KPI && (
              <>
                <div>
                    <label className="block text-sm font-medium">{t('queryEditor.valueY')}</label>
                    <select value={vizDataKey} onChange={e => setVizDataKey(e.target.value)} disabled={columns.length === 0} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        <option value="">{t('queryEditor.selectAxisPlaceholder')}</option>
                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-sm font-medium">{t('queryEditor.format')}</label>
                    <select value={vizKpiFormat} onChange={e => setVizKpiFormat(e.target.value as any)} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                       <option value="number">{t('queryEditor.number')}</option>
                       <option value="percent">{t('queryEditor.percentage')}</option>
                    </select>
                </div>
                {columns.length === 0 && isEditing && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('queryEditor.runQueryToEditColumns')}</p>}
              </>
            )}

            {[ChartType.BAR, ChartType.LINE, ChartType.AREA].includes(vizType) && (
              <>
                <div>
                  <label className="block text-sm font-medium">{t('queryEditor.categoryX')}</label>
                  <select value={vizCategoryKey} onChange={e => setVizCategoryKey(e.target.value)} disabled={columns.length === 0} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                    <option value="">{t('queryEditor.selectAxisPlaceholder')}</option>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">{t('queryEditor.valueY')}</label>
                  <select value={vizDataKey} onChange={e => setVizDataKey(e.target.value)} disabled={columns.length === 0} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                    <option value="">{t('queryEditor.selectAxisPlaceholder')}</option>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                {columns.length === 0 && isEditing && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('queryEditor.runQueryToEditColumns')}</p>}
              </>
            )}
            
            {vizType === ChartType.MULTI_LINE && (
                <>
                    <div>
                        <label className="block text-sm font-medium">{t('queryEditor.categoryX')}</label>
                        <select value={vizCategoryKey} onChange={e => setVizCategoryKey(e.target.value)} disabled={columns.length === 0} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                            <option value="">{t('queryEditor.selectAxisPlaceholder')}</option>
                            {columns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium">{t('queryEditor.valuesY')}</label>
                        <div className="mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 max-h-32 overflow-y-auto">
                            {columns.map(col => (
                            <div key={col} className="flex items-center">
                                <input
                                id={`col-${col}`}
                                type="checkbox"
                                checked={vizDataKeys.includes(col)}
                                onChange={() => handleDataKeysChange(col)}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <label htmlFor={`col-${col}`} className="ml-2 text-sm text-gray-700 dark:text-gray-300">{col}</label>
                            </div>
                            ))}
                        </div>
                    </div>
                     {columns.length === 0 && isEditing && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('queryEditor.runQueryToEditColumns')}</p>}
                </>
            )}
          </>
        )}

        <div className="border-t pt-4">
            <h3 className="text-md font-semibold mb-2">{t('queryEditor.cardSize')}</h3>
            <div className="flex items-start gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium">{t('queryEditor.widthCols')}</label>
                    <input type="number" min="1" max="4" value={vizGridSpan} onChange={e => handleSpanChange(setVizGridSpan, e.target.value)} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600" />
                </div>
                 <div className="flex-1">
                    <label className="block text-sm font-medium">{t('queryEditor.heightRows')}</label>
                    <input type="number" min="1" max="4" value={vizGridRowSpan} onChange={e => handleSpanChange(setVizGridRowSpan, e.target.value)} className="w-full mt-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600" />
                </div>
            </div>
        </div>

        <button onClick={handleSaveClick} className={`w-full flex justify-center items-center text-white px-4 py-2 rounded-md font-semibold transition-colors shadow ${buttonClass}`}>
          <Icon name={isEditing ? 'edit' : 'add'} className="w-5 h-5 mr-2" />
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default VisualizationBuilder;