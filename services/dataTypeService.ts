import { QueryResult, ColumnDataType } from '../types';

const isInteger = (val: any): boolean => {
    if (val === null || val === '') return true; 
    const num = Number(val);
    return Number.isInteger(num) && String(num) === String(val);
}

const isDecimal = (val: any): boolean => {
    if (val === null || val === '') return true;
    const num = Number(val);
    return !isNaN(num) && isFinite(num);
}

const isBoolean = (val: any): boolean => {
    if (val === null || val === '') return true;
    const lowerVal = String(val).toLowerCase();
    return lowerVal === 'true' || lowerVal === 'false' || lowerVal === '1' || lowerVal === '0';
}

const isDateOrDateTime = (val: any): 'date' | 'datetime' | 'none' => {
    if (val === null || val === '' || typeof val !== 'string' || !isNaN(Number(val))) return 'none';
    
    const date = new Date(val);
    if (isNaN(date.getTime())) return 'none';

    // Regex for YYYY-MM-DD format without time
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        return 'date';
    }
    
    // Check if the string contains time indicators
    if (val.includes('T') || (val.includes(' ') && val.includes(':'))) {
        return 'datetime';
    }

    // If it's a valid date but doesn't fit the explicit formats above, check the time part
    if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
        return 'date';
    }
    
    return 'datetime';
}


export function inferColumnTypes(result: QueryResult): Record<string, ColumnDataType> {
    const columnTypes: Record<string, ColumnDataType> = {};
    if (!result || !result.columns) {
        return {};
    }
    if (result.rows.length === 0) {
        result.columns.forEach(col => {
            columnTypes[col] = 'text';
        });
        return columnTypes;
    }

    const sample = result.rows.slice(0, 50);

    result.columns.forEach((colName, colIndex) => {
        let isColInteger = true;
        let isColDecimal = true;
        let isColBoolean = true;
        let hasDate = false;
        let hasDateTime = false;

        let nonNullSamples = 0;
        for (const row of sample) {
            const value = row[colIndex];
            
            if (value === null || value === undefined || String(value).trim() === '') continue;
            
            nonNullSamples++;

            if (isColInteger && !isInteger(value)) isColInteger = false;
            if (isColDecimal && !isDecimal(value)) isColDecimal = false;
            if (isColBoolean && !isBoolean(value)) isColBoolean = false;

            const dateCheck = isDateOrDateTime(value);
            if (dateCheck === 'datetime') hasDateTime = true;
            if (dateCheck === 'date') hasDate = true;
        }

        if (nonNullSamples === 0) {
            columnTypes[colName] = 'text'; // All nulls/empty
        } else if (hasDateTime) {
            columnTypes[colName] = 'datetime';
        } else if (hasDate) {
            columnTypes[colName] = 'date';
        } else if (isColBoolean) {
            columnTypes[colName] = 'boolean';
        } else if (isColInteger) {
            columnTypes[colName] = 'integer';
        } else if (isColDecimal) {
            columnTypes[colName] = 'decimal';
        } else {
            columnTypes[colName] = 'text';
        }
    });

    return columnTypes;
}
