import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
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

        // Helper functions moved here to be shared by KPI and TABLE cases
        const getNumericValue = (value: any): number | null => {
            if (value === null || value === undefined || value === '') return null;
            const cleanedString = String(value).replace(/[^\d,.-]/g, '').replace(',', '.');
            const num = parseFloat(cleanedString);
            return isNaN(num) ? null : num;
        };

        const getNumberColorClass = (value: number | null): string => {
            if (value === null) return '';
            if (value > 0) return 'text-green-500 dark:text-green-400';
            if (value < 0) return 'text-red-500 dark:text-red-400';
            return '';
        };

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
                <XAxis 
                  dataKey={card.categoryKey} 
                  tickFormatter={xAxisTickFormatter}
                  type={isTimeSeries ? 'number' : 'category'}
                  scale={isTimeSeries ? 'time' : 'auto'}
                  domain={isTimeSeries ? ['dataMin', 'dataMax'] : undefined}
                  // Fix: Changed interval value from 'auto' to 0 for time series to fix TypeScript error.
                  interval={isTimeSeries ? 0 : undefined}
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
                <Bar dataKey={card.dataKey} fill={brandColor} />
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
                      interval={isTimeSeries ? 0 : undefined}
                    />
                    <YAxis tickFormatter={yAxisTickFormatter} />
                    <Tooltip 
                      labelFormatter={xAxisTickFormatter} 
                      formatter={tooltipFormatter}
                      contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', borderColor: brandColor, color: '#ffffff' }}
                      wrapperStyle={{ zIndex: 999 }}
                    />
                    <Legend />
                    <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                    <Line type="monotone" dataKey={card.dataKey} stroke={brandColor} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
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
                        interval={isTimeSeries ? 0 : undefined}
                    />
                    <YAxis tickFormatter={yAxisTickFormatter} />
                    <Tooltip 
                      labelFormatter={xAxisTickFormatter} 
                      formatter={tooltipFormatter}
                      contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', borderColor: brandColor, color: '#ffffff' }}
                      wrapperStyle={{ zIndex: 999 }}
                    />
                    <Legend onClick={handleLegendClick} />
                    <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                    {card.dataKeys?.map((key, index) => (
                        <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={CHART_COLORS_PALETTE[index % CHART_COLORS_PALETTE.length]}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                            hide={highlightedDataKeys.length > 0 && !highlightedDataKeys.includes(key)}
                        />
                    ))}
                    </LineChart>
                </ResponsiveContainer>
            );
        case ChartType.AREA:
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={processedData}>
                    <defs>
                        <linearGradient id={`color${card.id}`} x1="0" y1="0" x2="0" y2="1">
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
                      interval={isTimeSeries ? 0 : undefined}
                    />
                    <YAxis tickFormatter={yAxisTickFormatter} />
                    <Tooltip 
                      labelFormatter={xAxisTickFormatter} 
                      formatter={tooltipFormatter}
                      contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', borderColor: brandColor, color: '#ffffff' }}
                      wrapperStyle={{ zIndex: 999 }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey={card.dataKey} stroke={brandColor} fillOpacity={1} fill={`url(#color${card.id})`} />
                    </AreaChart>
                </ResponsiveContainer>
            );
        case ChartType.KPI:
            const value = card.data && card.data.length > 0 ? getNumericValue(card.data[0][card.dataKey]) ?? 0 : 0;
            const format = card.kpiConfig?.format || 'number';
            const formattedValue = formatValue(value, format === 'percent' ? 'decimal' : 'integer', { ...formattingSettings, numberDecimalPlaces: format === 'percent' ? 2 : 0 });
            const colorClass = getNumberColorClass(value) || 'text-gray-800 dark:text-white';
            return (
                <div className="flex flex-col items-center justify-center h-full">
                    <div className={`text-5xl font-bold ${colorClass}`}>
                        {format === 'percent' ? `${formattedValue}%` : formattedValue}
                    </div>
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
                <div className="h-full overflow-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0">
                            <tr>
                                {hasSummary && <th scope="col" className="px-4 py-3"></th>}
                                {columns.map(col => <th key={col} scope="col" className="px-4 py-3">{col}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.map((row, index) => (
                                <tr key={index} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                    {hasSummary && <td className="px-4 py-3"></td>}
                                    {columns.map(col => {
                                        const value = row[col];
                                        const type = card.columnTypes?.[col];
                                        const isNumeric = type === 'integer' || type === 'decimal' || type === 'currency';
                                        const numericValue = isNumeric ? getNumericValue(value) : null;
                                        const colorClass = isNumeric ? getNumberColorClass(numericValue) : '';
                                        return (
                                            <td key={col} className={`px-4 py-3 ${colorClass}`}>
                                                {formatValue(value, type, formattingSettings)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                        {hasSummary && (
                            <tfoot className="sticky bottom-0 bg-gray-100 dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                                {hasAverages && averageValues && (
                                    <tr className="font-semibold text-gray-900 dark:text-white">
                                        <td className="px-4 py-3 text-left">{t('queryEditor.summaryRow.average')}</td>
                                        {columns.map((_col, index) => (
                                            <td key={index} className={`px-4 py-3 text-left ${getNumberColorClass(averageValues[index].raw)}`}>
                                                {averageValues[index].formatted}
                                            </td>
                                        ))}
                                    </tr>
                                )}
                                {hasTotals && totalValues && (
                                    <tr className="font-semibold text-gray-900 dark:text-white">
                                        <td className="px-4 py-3 text-left">{t('queryEditor.summaryRow.total')}</td>
                                        {columns.map((_col, index) => (
                                            <td key={index} className={`px-4 py-3 text-left ${getNumberColorClass(totalValues[index].raw)}`}>
                                                {totalValues[index].formatted}
                                            </td>
                                        ))}
                                    </tr>
                                )}
                            </tfoot>
                        )}
                    </table>
                </div>
            );
        case ChartType.SPACER:
            return <div className="h-full w-full"></div>;
        default:
            console.warn(`Unsupported chart type encountered: ${card.type}`);
            return <p>{t('chartCard.unsupported')}: {String(card.type)}</p>;
        }
    }, [card, formattingSettings, brandColor, highlightedDataKeys, t]);

    const cardTitle = t(card.title) || card.title;

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
        : "bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 flex flex-col relative group w-full flex-grow h-full";

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
                {onExport && card.data && card.data.length > 0 && !error && !isLoading && !isSpacer && card.type !== ChartType.KPI && (
                  <button onClick={onExport} className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 hover:text-white" aria-label={t('chartCard.exportCsvLabel')}>
                      <Icon name="export" className="w-4 h-4" />
                  </button>
                )}
                {allowDashboardManagement && (
                    <>
                        {onClone && (
                            <button onClick={() => onClone && onClone(card.id)} className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-green-500 hover:text-white" aria-label={t('chartCard.cloneCardLabel')}>
                                <Icon name="save_as" className="w-4 h-4" />
                            </button>
                        )}
                        {onEdit && (
                            <button onClick={() => onEdit && onEdit(card.id)} className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-yellow-500 hover:text-white" aria-label={t('chartCard.editCardLabel')}>
                                <Icon name="edit" className="w-4 h-4" />
                            </button>
                        )}
                        {onRemove && (
                            <button onClick={() => onRemove && onRemove(card.id)} className="p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-red-500 hover:text-white" aria-label={t('chartCard.removeCardLabel')}>
                                <Icon name="close" className="w-4 h-4" />
                            </button>
                        )}
                    </>
                )}
            </div>
            <div className="flex-grow flex items-center justify-center min-h-0 relative z-10">
                {renderContent()}
            </div>
        </div>
    );
};

export default ChartCard;