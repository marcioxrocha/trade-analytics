
import { DataSource, QueryLanguage } from '../types';

export const getLanguageForDataSource = (dataSource: DataSource | undefined): QueryLanguage => {
    if (!dataSource) return 'sql';
    switch (dataSource.type) {
        case 'MongoDB':
        case 'CosmosDB':
            return 'mongo';
        case 'Redis':
            return 'redis';
        case 'Supabase':
            return 'supabase';
        case 'REST API':
            return 'json';
        case 'LocalStorage (Demo)':
        case 'PostgreSQL':
        case 'MySQL':
        case 'SQL Server':
        default:
            return 'sql';
    }
};

export const getDefaultQuery = (lang: QueryLanguage): string => {
    switch (lang) {
        case 'mongo':
            return '{\n  "find": "collection_name",\n  "filter": { "field": "value" }\n}';
        case 'redis':
            return 'HGETALL my_hash';
        case 'supabase':
            return "from('orders').select('*')";
        case 'json': // Default for REST API
            return JSON.stringify({
                endpoint: "",
                method: "GET",
                headers: [],
                params: [],
                body: ""
            }, null, 2);
        case 'sql':
        default:
            return 'SELECT * FROM orders;';
    }
}
