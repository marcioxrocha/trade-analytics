
import { DashboardFormattingSettings, ColumnDataType } from '../types';

export const DEFAULT_FORMATTING_SETTINGS: DashboardFormattingSettings = {
    dateFormat: 'DD/MM/YYYY',
    dateTimeFormat: 'DD/MM/YYYY HH:mm:ss',
    currencySymbol: 'R$',
    currencyPosition: 'prefix',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyDecimalPlaces: 2,
    numberDecimalPlaces: 2,
};

/**
 * Formats a number according to the provided dashboard settings.
 * @param value The number to format.
 * @param settings The dashboard's formatting settings.
 * @param format The type of number format ('number' or 'percent').
 * @param decimalPlacesOverride Optional override for the number of decimal places.
 * @returns A formatted string.
 */
export function formatNumber(
    value: number,
    settings: Partial<DashboardFormattingSettings> | undefined,
    format: 'number' | 'percent',
    decimalPlacesOverride?: number
): string {
    if (isNaN(value)) return String(value);

    const config = { ...DEFAULT_FORMATTING_SETTINGS, ...settings };
    
    const fractionDigits = decimalPlacesOverride !== undefined 
        ? decimalPlacesOverride 
        : config.numberDecimalPlaces;
    
    const numberToFormat = format === 'percent' ? value * 100 : value;

    let [integerPart, decimalPart] = numberToFormat.toFixed(fractionDigits).split('.');

    // Add thousands separators
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);

    let result = (decimalPart && fractionDigits > 0) ? `${integerPart}${config.decimalSeparator}${decimalPart}` : integerPart;
    if (format === 'percent') {
        result += '%';
    }
    return result;
}

/**
 * Formats a number as a currency string according to dashboard settings.
 * @param value The number to format.
 * @param settings The dashboard's formatting settings.
 * @returns A formatted currency string.
 */
export function formatCurrency(
    value: number,
    settings: Partial<DashboardFormattingSettings> | undefined
): string {
     if (isNaN(value)) return String(value);

    const config = { ...DEFAULT_FORMATTING_SETTINGS, ...settings };
    
    const fixedValue = value.toFixed(config.currencyDecimalPlaces);
    let [integerPart, decimalPart] = fixedValue.split('.');

    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);

    const formattedNumber = `${integerPart}${config.decimalSeparator}${decimalPart}`;

    if (config.currencyPosition === 'prefix') {
        return `${config.currencySymbol} ${formattedNumber}`;
    } else {
        return `${formattedNumber} ${config.currencySymbol}`;
    }
}

function formatDateInternal(
    dateString: string,
    format: 'date' | 'datetime',
    settings: Partial<DashboardFormattingSettings> | undefined
): string {
    const config = { ...DEFAULT_FORMATTING_SETTINGS, ...settings };
    try {
        let adjustedDateString = dateString;
        // FIX: If it looks like a date-only string (YYYY-MM-DD), append UTC time to avoid timezone issues.
        if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            adjustedDateString = `${dateString}T00:00:00Z`;
        }
        const date = new Date(adjustedDateString);
        if (isNaN(date.getTime())) return dateString;

        const formatString = format === 'date' ? config.dateFormat : config.dateTimeFormat;

        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');

        return formatString
            .replace(/YYYY/g, String(year))
            .replace(/MM/g, month)
            .replace(/DD/g, day)
            .replace(/HH/g, hours)
            .replace(/mm/g, minutes)
            .replace(/ss/g, seconds);
    } catch (e) {
        return dateString; // Return original if parsing fails
    }
}

/**
 * Formats a value based on its specified data type and the global formatting settings.
 * @param value The value to format.
 * @param type The data type of the value.
 * @param settings The global formatting settings.
 * @returns A formatted string representation of the value.
 */
export function formatValue(
    value: any,
    type: ColumnDataType | undefined,
    settings: Partial<DashboardFormattingSettings> | undefined
): string {
    if (value === null || value === undefined) return '';

    const resolvedType = type || 'text';

    try {
        switch (resolvedType) {
            case 'integer':
                return formatNumber(Number(value), settings, 'number', 0);
            case 'decimal':
                return formatNumber(Number(value), settings, 'number');
            case 'currency':
                return formatCurrency(Number(value), settings);
            case 'date':
                return formatDateInternal(String(value), 'date', settings);
            case 'datetime':
                return formatDateInternal(String(value), 'datetime', settings);
            case 'boolean':
                return String(value);
            case 'text':
            default:
                return String(value);
        }
    } catch (error) {
        // If formatting fails (e.g., trying to format "abc" as a number), return the original string.
        return String(value);
    }
}
