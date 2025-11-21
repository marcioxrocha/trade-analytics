
import { QueryRequest, QueryResult, RequestContext, ApiConfig } from '../types';
import { IDatabaseDriver } from './IDatabaseDriver';

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

// Helper to flatten nested JSON objects into a single level for table display
function flattenObject(obj: any, prefix = '', result: any = {}) {
    if (obj === null || obj === undefined) return result;
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                flattenObject(value, newKey, result);
            } else {
                result[newKey] = value;
            }
        }
    }
    return result;
}

export class RestApiDriver implements IDatabaseDriver {
    
    async executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
        const baseUrl = request.dataSource.connectionString.replace(/\/$/, ''); // Remove trailing slash
        let config: RestConfig;

        try {
            config = JSON.parse(request.query);
        } catch (e) {
            throw new Error("Invalid REST API configuration format.");
        }

        // Construct URL with query params
        const url = new URL(baseUrl + (config.endpoint.startsWith('/') ? config.endpoint : `/${config.endpoint}`));
        config.params.forEach(param => {
            if (param.key) url.searchParams.append(param.key, param.value);
        });

        // Construct Headers
        const headers: HeadersInit = {};
        config.headers.forEach(h => {
            if (h.key) headers[h.key] = h.value;
        });
        
        // Ensure Content-Type is set if body is present and not set by user
        if (config.body && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
            headers['Content-Type'] = 'application/json';
        }

        const fetchOptions: RequestInit = {
            method: config.method,
            headers: headers,
        };

        if (config.method !== 'GET' && config.method !== 'HEAD' && config.body) {
            fetchOptions.body = config.body;
        }

        console.info(`RestApiDriver: Fetching ${config.method} ${url.toString()}`);

        try {
            const response = await fetch(url.toString(), fetchOptions);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP Error ${response.status}: ${errorText}`);
            }

            const jsonData = await response.json();
            
            // Normalize Data: Result must be an array of objects
            let dataArray: any[] = [];
            
            if (Array.isArray(jsonData)) {
                dataArray = jsonData;
            } else if (typeof jsonData === 'object' && jsonData !== null) {
                // Heuristic: check if the object has a property that is an array (e.g. { data: [...] })
                const arrayProp = Object.values(jsonData).find(val => Array.isArray(val));
                if (arrayProp) {
                    dataArray = arrayProp as any[];
                } else {
                    // Treat single object as one row
                    dataArray = [jsonData];
                }
            } else {
                // Primitive value?
                dataArray = [{ value: jsonData }];
            }

            // Flatten objects for table display
            const flattenedRows = dataArray.map(item => flattenObject(item));

            if (flattenedRows.length === 0) {
                return { columns: [], rows: [] };
            }

            // Extract columns from all rows to ensure we catch keys present in some objects but not others
            const allKeys = new Set<string>();
            flattenedRows.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
            const columns = Array.from(allKeys);

            // Map rows to column order
            const rows = flattenedRows.map(row => columns.map(col => {
                const val = row[col];
                if (typeof val === 'object') return JSON.stringify(val);
                return val;
            }));

            return { columns, rows };

        } catch (err) {
            console.error('REST API execution failed:', err);
            throw new Error(`REST Request Failed: ${(err as Error).message}`);
        }
    }
}
