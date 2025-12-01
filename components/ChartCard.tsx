
import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { ChartCardData, ChartType, DashboardFormattingSettings, AggregationType } from '../types';
import { DEFAULT_BRAND_COLOR, CHART_COLORS_PALETTE } from '../constants';
import Icon from './Icon';
import { useLanguage } from '../contexts/LanguageContext';
import { formatValue } from '../services/formattingService';
import { useAppContext } from '../contexts/AppContext';
import ErrorDisplay from './ErrorDisplay';

interface ChartCardProps {
  card: ChartCardData;
  formattingSettings?: Partial<DashboardFormattingSettings>;
  onRemove?: (id: string) => void;
  onEdit?: (id: string) => void;
  onClone?: (id: string) => void;
  onExport?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const ChartCard: React.FC<ChartCardProps> = ({ card, formattingSettings, onRemove, onEdit, onClone, onExport, isLoading, error }) => {
    const { t } = useLanguage();
    const { whiteLabelSettings, allowDashboardManagement } = useAppContext();
    const brandColor = whiteLabelSettings?.brandColor || DEFAULT_BRAND_COLOR;
    const [highlightedDataKeys, setHighlightedDataKeys] = useState<string[]>([]);
    const isSpacer = card.type === ChartType.SPACER;

    const handleLegendClick = (data: any) => {
        const { dataKey } = data;
        setHighlightedDataKeys(prev => 
            prev.includes(dataKey) 
                ? prev.filter(k => k !== dataKey)
                : [...prev, dataKey]
        );
    };

    const memoizedChart = useMemo(() => {
        if (!card.data && card.type !== ChartType.SPACER) return null;

        if (
            [ChartType.BAR, ChartType.LINE, ChartType.AREA, ChartType.MULTI_LINE].includes(card.type) &&
            !card.categoryKey
        ) {
            return <div className="text-center p-4 text-gray-500">{t('chartCard.selectCategory')}</div>;
        }

        if (
            [ChartType.BAR, ChartType.LINE, ChartType.AREA, ChartType.KPI].includes(card.type) &&
            !card.dataKey
        ) {
            return <div className="text-center p-4 text-gray-500">{t('chartCard.selectValue')}</div>;
        }

        if (
            card.type === ChartType.MULTI_LINE &&
            (!card.dataKeys || card.dataKeys.length === 0)
        ) {
            return <div className="text-center p-4 text-gray-500">{t('chartCard.selectValues')}</div>;
        }

        let processedData = card.data || [];

        // For multi-line charts, aggregate data to ensure unique points on the x-axis.
        // This groups by the category key and merges data points for the same key.
        if (card.type === ChartType.MULTI_LINE && processedData.length > 0) {
            const dataMap = new Map();
            processedData.forEach(item => {
                const key = item[card.categoryKey];
                const existing = dataMap.get(key) || {};
                dataMap.set(key, { ...existing, ...item });
            });
            processedData = Array.from(dataMap.values());
        }

        const categoryColumnType = card.columnTypes?.[card.categoryKey];
        const isTimeSeries = (categoryColumnType === 'date' || categoryColumnType === 'datetime') && card.categoryKey;
        
        if (isTimeSeries && processedData.length > 0) {
            processedData = processedData.map(item => {
                let dateValue = item[card.categoryKey];
                // FIX: If it's a date-only string, treat it as UTC midnight to prevent timezone shifts.
                if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                    dateValue = `${dateValue}T00:00:00Z`;
                }
                const timestamp = new Date(dateValue).getTime();
                return {
                    ...item,
                    [card.categoryKey]: isNaN(timestamp) ? item[card.categoryKey] : timestamp,
                };
            }).sort((a, b) => {
                const valA = a[card.categoryKey];
                const valB = b[card.categoryKey];
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return valA - valB;
                }
                if (valA < valB) return -1;
                if (valA > valB) return 1;
                return 0;
            });
        }

        const yAxisTickFormatter = (value: any) => {
            if (typeof value !== 'number') return value;
            // For multi-line, it's hard to pick one type, so format as a generic number.
            if (card.type === ChartType.MULTI_LINE && card.dataKeys && card.dataKeys.length > 1) {
                return formatValue(value, 'decimal', formattingSettings);
            }
            const type = card.columnTypes?.[card.dataKey];
             return formatValue(value, type, formattingSettings);
        };

        const xAxisTickFormatter = (value: any) => {
            // For time series, the value is a timestamp. Format it back to a date string.
            if (isTimeSeries && typeof value === 'number') {
                return formatValue(new Date(value).toISOString(), categoryColumnType, formattingSettings);
            }
            // For other types, format as usual.
            const type = card.columnTypes?.[card.categoryKey];
            return formatValue(value, type, formattingSettings);
        };
        
        const tooltipFormatter = (value: any, name: string) => {
            const type = card.columnTypes?.[name];
            return formatValue(value, type, formattingSettings);
        };
        

        switch (card.type) {
        case ChartType.BAR:
            return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.4} />
                {/* Render Bar first so it stays behind axis lines */}
                <Bar dataKey={card.dataKey} fill={brandColor}>
                    {processedData.map((entry, index) => {
                        const value = Number(entry[card.dataKey]);
                        // Red for negative, Green for positive
                        const color = !isNaN(value) && value < 0 ? '#ef4444' : '#10b981';
                        return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                </Bar>
                {/* Reference line creates a solid baseline on top of bar bottoms */}
                <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                <XAxis 
                  dataKey={card.categoryKey} 
                  tickFormatter={xAxisTickFormatter}
                  // ALWAYS use category for Bar charts. This ensures discrete bars that don't
                  // climb/overlap the axis and provides correct tooltip selection behavior.
                  type="category"
                  minTickGap={30}
                />
                <YAxis tickFormatter={yAxisTickFormatter} domain={[0, 'auto']} />
                <Tooltip
                    cursor={{ fill: 'transparent' }} // Remove default hover rect which can look messy
                    labelFormatter={xAxisTickFormatter}
                    formatter={tooltipFormatter}
                    contentStyle={{
                    backgroundColor: 'rgba(31, 41, 55, 0.8)',
                    borderColor: brandColor,
                    color: '#ffffff',
                    }}
                    wrapperStyle={{ zIndex: 999 }}
                />
                <Legend />
                </BarChart>
            </ResponsiveContainer>
            );
        case ChartType.LINE:
            return (
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={processedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.4} />
                <XAxis 
                    dataKey={card.categoryKey}
                    tickFormatter={xAxisTickFormatter}
                    type={isTimeSeries ? 'number' : 'category'}
                    scale={isTimeSeries ? 'time' : 'auto'}
                    domain={isTimeSeries ? ['dataMin', 'dataMax'] : undefined}
                    minTickGap={30}
                    interval="preserveStartEnd"
                />
                <YAxis tickFormatter={yAxisTickFormatter} />
                <Tooltip
                    labelFormatter={xAxisTickFormatter}
                    formatter={tooltipFormatter}
                    contentStyle={{
                    backgroundColor: 'rgba(31, 41, 55, 0.8)',
                    borderColor: brandColor,
                    color: '#ffffff',
                    }}
                    wrapperStyle={{ zIndex: 999 }}
                />
                <Legend />
                <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                <Line type="monotone" dataKey={card.dataKey} stroke={brandColor} strokeWidth={2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
            );
        case ChartType.MULTI_LINE:
            return (
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={processedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.4} />
                <XAxis 
                    dataKey={card.categoryKey}
                    tickFormatter={xAxisTickFormatter}
                    type={isTimeSeries ? 'number' : 'category'}
                    scale={isTimeSeries ? 'time' : 'auto'}
                    domain={isTimeSeries ? ['dataMin', 'dataMax'] : undefined}
                    minTickGap={30}
                    interval="preserveStartEnd"
                />
                <YAxis tickFormatter={yAxisTickFormatter} />
                <Tooltip
                    labelFormatter={xAxisTickFormatter}
                    formatter={tooltipFormatter}
                    contentStyle={{
                    backgroundColor: 'rgba(31, 41, 55, 0.8)',
                    borderColor: brandColor,
                    color: '#ffffff',
                    }}
                    wrapperStyle={{ zIndex: 999 }}
                />
                <Legend onClick={handleLegendClick} wrapperStyle={{ cursor: 'pointer' }} />
                <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                {card.dataKeys?.map((key, index) => {
                    const isHighlighted = highlightedDataKeys.includes(key);
                    const isAnyHighlighted = highlightedDataKeys.length > 0;
                    
                    const strokeOpacity = isAnyHighlighted ? (isHighlighted ? 1 : 0.4) : 1;
                    const strokeWidth = isAnyHighlighted ? (isHighlighted ? 3 : 1.5) : 2;

                    return (
                        <Line 
                            key={key} 
                            type="monotone" 
                            dataKey={key} 
                            stroke={CHART_COLORS_PALETTE[index % CHART_COLORS_PALETTE.length]} 
                            strokeWidth={strokeWidth}
                            strokeOpacity={strokeOpacity}
                            dot={{ r: 3 }} 
                            activeDot={{ r: 5 }}
                        />
                    )
                })}
                </LineChart>
            </ResponsiveContainer>
            );
        case ChartType.AREA:
            return (
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={processedData}>
                <defs>
                    <linearGradient id={`brandGradient-${card.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={brandColor} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={brandColor} stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.4} />
                <XAxis 
                    dataKey={card.categoryKey}
                    tickFormatter={xAxisTickFormatter}
                    type={isTimeSeries ? 'number' : 'category'}
                    scale={isTimeSeries ? 'time' : 'auto'}
                    domain={isTimeSeries ? ['dataMin', 'dataMax'] : undefined}
                    minTickGap={30}
                    interval="preserveStartEnd"
                />
                <YAxis tickFormatter={yAxisTickFormatter} />
                <Tooltip
                    labelFormatter={xAxisTickFormatter}
                    formatter={tooltipFormatter}
                    contentStyle={{
                    backgroundColor: 'rgba(31, 41, 55, 0.8)',
                    borderColor: brandColor,
                    color: '#ffffff',
                    }}
                    wrapperStyle={{ zIndex: 999 }}
                />
                <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                <Area type="monotone" dataKey={card.dataKey} stroke={brandColor} fillOpacity={1} fill={`url(#brandGradient-${card.id})`} dot={false} />
                </AreaChart>
            </ResponsiveContainer>
            );
        case ChartType.KPI:
            if (!card.data || card.data.length === 0) return null;
            const firstRow = card.data[0];
            let rawValue: any;

            if (firstRow && card.dataKey) {
                // Find the key in the first row that matches the dataKey, case-insensitively.
                // This makes the component resilient to case differences between query results (e.g., 'SALDO')
                // and the configuration (e.g., 'saldo').
                const actualKey = Object.keys(firstRow).find(key => key.toLowerCase() === card.dataKey.toLowerCase());
                if (actualKey) {
                    rawValue = firstRow[actualKey];
                }
            }

            let formattedValue = 'N/A';
            let kpiColorClass = 'text-gray-800 dark:text-white'; // Default color

            // Now, handle the value we found
            if (rawValue !== undefined && rawValue !== null) {
                // Find the column type using the same case-insensitive logic, matching the configured key
                const actualColumnTypeKey = card.columnTypes && card.dataKey ? Object.keys(card.columnTypes).find(key => key.toLowerCase() === card.dataKey.toLowerCase()) : undefined;
                const columnType = actualColumnTypeKey ? card.columnTypes[actualColumnTypeKey] : undefined;
                
                formattedValue = formatValue(rawValue, columnType, formattingSettings);

                // If it's a number, apply additional formatting and color
                if (typeof rawValue === 'number') {
                    if (card.kpiConfig?.format === 'percent') {
                        formattedValue = `${formattedValue}%`;
                    }

                    // Set color based on value
                    if (rawValue > 0) {
                        kpiColorClass = 'text-green-600 dark:text-green-500';
                    } else if (rawValue < 0) {
                        kpiColorClass = 'text-red-600 dark:text-red-500';
                    }
                }
            }

            return (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <h3 className={`text-4xl md:text-5xl font-bold ${kpiColorClass}`}>{formattedValue}</h3>
                </div>
            );
        case ChartType.TABLE:
            const tableData = card.data || [];
            const columns = tableData.length > 0 ? Object.keys(tableData[0]) : [];

            // Calculate summary rows
            const summaryColumns = card.tableConfig?.summaryColumns || {};
            const hasTotals = card.tableConfig?.showSummaryRow && Object.values(summaryColumns).includes('total');
            const hasAverages = card.tableConfig?.showSummaryRow && Object.values(summaryColumns).includes('average');
            const hasSummary = hasTotals || hasAverages;

            const calculateSummaryRow = (aggType: AggregationType): { formatted: string | null; raw: number | null }[] => {
                if (!card.tableConfig?.showSummaryRow) return [];

                return columns.map(col => {
                    if (summaryColumns[col] === aggType) {
                        const values = tableData.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
                        if (values.length > 0) {
                            let rawValue: number;
                             if (aggType === 'total') {
                                rawValue = values.reduce((sum, v) => sum + v, 0);
                            } else { // average
                                rawValue = values.reduce((sum, v) => sum + v, 0) / values.length;
                            }
                            return {
                                formatted: formatValue(rawValue, card.columnTypes?.[col], formattingSettings),
                                raw: rawValue,
                            };
                        }
                    }
                    return { formatted: null, raw: null };
                });
            };

            const totalValues = hasTotals ? calculateSummaryRow('total') : null;
            const averageValues = hasAverages ? calculateSummaryRow('average') : null;

            return (
                <div className="h-full overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-[-16px] md:top-[-32px]">
                            <tr>
                                {hasSummary && <th scope="col" className="px-4 py-3"></th>}
                                {columns.map(col => <th key={col} scope="col" className="px-4 py-3">{col}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.map((row, index) => (
                                <tr key={index} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                    {hasSummary && <td className="px-4 py-3"></td>}
                                    {columns.map(header => {
                                        const cellValue = row[header];
                                        const columnType = card.columnTypes?.[header];
                                        const formattedCell = formatValue(cellValue, columnType, formattingSettings);
                                        
                                        let cellColorClass = '';
                                        const isNumericColumn = ['integer', 'decimal', 'currency'].includes(columnType || '');
                                        
                                        if (isNumericColumn && cellValue != null && String(cellValue).trim() !== '') {
                                            const numericValue = Number(cellValue);
                                            if (!isNaN(numericValue)) {
                                                if (numericValue > 0) {
                                                    cellColorClass = 'text-green-600 dark:text-green-500 font-semibold';
                                                } else if (numericValue < 0) {
                                                    cellColorClass = 'text-red-600 dark:text-red-500 font-semibold';
                                                }
                                            }
                                        }

                                        return <td key={`${index}-${header}`} className={`px-4 py-3 ${cellColorClass}`}>{String(formattedCell)}</td>
                                    })}
                                </tr>
                            ))}
                        </tbody>
                        {hasSummary && (
                           <tfoot className="bg-gray-100 dark:bg-gray-700 font-bold text-gray-900 dark:text-gray-100">
                                {hasAverages && averageValues && (
                                     <tr className="border-t-2 font-semibold text-gray-900 dark:text-white">
                                        {<td key={`summary-avg-label`} className={`px-4 py-3`}>{t('queryEditor.summaryRow.average')}</td>}
                                        {columns.map((header, index) => {
                                            const summaryValue = averageValues![index].raw;
                                            let content: React.ReactNode = '';
                                            let cellColorClass = '';
                                            if (summaryValue !== undefined) {
                                                const columnType = card.columnTypes?.[header];
                                                content = formatValue(summaryValue, columnType, formattingSettings);

                                                const isNumericColumn = ['integer', 'decimal', 'currency'].includes(columnType || '');
                                                if (isNumericColumn) {
                                                    if (summaryValue > 0) {
                                                        cellColorClass = 'text-green-600 dark:text-green-500';
                                                    } else if (summaryValue < 0) {
                                                        cellColorClass = 'text-red-600 dark:text-red-500';
                                                    }
                                                }
                                            }
                                            return <td key={`summary-avg-${index}`} className={`px-4 py-3 ${cellColorClass}`}>{content}</td>;
                                        })}
                                    </tr>
                                )}
                                {hasTotals && totalValues && (
                                    <tr className={hasAverages && averageValues ? "border-t border-gray-200 dark:border-gray-600" : "border-t-2 border-gray-300 dark:border-gray-600"}>
                                        {<td key={`summary-total-label`} className={`px-4 py-3`}>{t('queryEditor.summaryRow.total')}</td>}
                                        {columns.map((header, index) => {
                                            const summaryValue = totalValues![index].raw;
                                            let content: React.ReactNode = '';
                                            let cellColorClass = '';
                                            if (summaryValue !== undefined) {
                                                const columnType = card.columnTypes?.[header];
                                                content = formatValue(summaryValue, columnType, formattingSettings);
                                                
                                                const isNumericColumn = ['integer', 'decimal', 'currency'].includes(columnType || '');
                                                if (isNumericColumn) {
                                                    if (summaryValue > 0) {
                                                        cellColorClass = 'text-green-600 dark:text-green-500';
                                                    } else if (summaryValue < 0) {
                                                        cellColorClass = 'text-red-600 dark:text-red-500';
                                                    }
                                                }
                                            }
                                            return <td key={`summary-total-${header}`} className={`px-4 py-3 ${cellColorClass}`}>{content}</td>;
                                        })}
                                    </tr>
                                )}
                           </tfoot>
                        )}
                    </table>
                </div>
            );
        case ChartType.SPACER:
            return null;
        default:
            return <div>{t('chartCard.unsupported')}</div>;
        }
    }, [card.data, card.type, card.categoryKey, card.dataKey, card.dataKeys, card.kpiConfig, card.columnTypes, t, formattingSettings, brandColor, card.id, highlightedDataKeys, card.tableConfig]);
  
  const cardTitle = t(card.title) || card.title; // Handle both translation keys and plain strings

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col justify-center items-center w-full h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <p className="mt-2 text-gray-500 dark:text-gray-400">{t('dashboard.cardLoading')}</p>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-md shadow-inner flex-grow flex flex-col w-full h-full justify-center overflow-y-auto">
          <h3 className="font-bold">{t('dashboard.cardErrorTitle', { title: card.title })}</h3>
          <div className="mt-2 text-sm">
            <ErrorDisplay error={error} />
          </div>
        </div>
      );
    }
    
    return memoizedChart;
  };

  const containerClasses = isSpacer
    ? "flex flex-col relative group w-full flex-grow h-full rounded-xl border-2 border-dashed border-transparent hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
    : "bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 flex flex-col relative group w-full flex-grow";

  return (
    <div className={containerClasses}>
        {!isSpacer && (
            <div className="flex justify-between items-start">
                <div className="mb-2 pr-16">
                    <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: cardTitle }} />
                    {card.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1" dangerouslySetInnerHTML={{ __html: card.description }} />
                    )}
                </div>
            </div>
        )}
        <div className="absolute top-3 right-3 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            {onExport && card.type !== ChartType.KPI && !error && !isLoading && !isSpacer && (
              <button onClick={onExport} className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-500 hover:text-white" aria-label={t('chartCard.exportCsvLabel')}>
                  <Icon name="export" className="w-4 h-4" />
              </button>
            )}
            {allowDashboardManagement && (
                <>
                    {onClone && (
                        <button onClick={() => onClone(card.id)} className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 dark:hover:bg-green-500 hover:bg-green-500 hover:text-white" aria-label={t('chartCard.cloneCardLabel')}>
                            <Icon name="save_as" className="w-4 h-4" />
                        </button>
                    )}
                    {onEdit && (
                        <button onClick={() => onEdit(card.id)} className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 dark:hover:bg-yellow-500 hover:bg-yellow-500 hover:text-white" aria-label={t('chartCard.editCardLabel')}>
                            <Icon name="edit" className="w-4 h-4" />
                        </button>
                    )}
                    {onRemove && (
                        <button onClick={() => onRemove(card.id)} className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 dark:hover:bg-red-500 hover:bg-red-500 hover:text-white" aria-label={t('chartCard.removeCardLabel')}>
                            <Icon name="close" className="w-4 h-4" />
                        </button>
                    )}
                </>
            )}
        </div>
      <div className="flex-grow flex items-center justify-center min-h-0 relative">
        {renderContent()}
      </div>
    </div>
  );
};

export default ChartCard;
