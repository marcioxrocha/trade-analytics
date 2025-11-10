import { IDatabaseDriver } from './IDatabaseDriver';
import { QueryRequest, QueryResult, RequestContext } from '../types';
import { ApiConfig } from '../services/apiConfig';

// --- LocalStorage Mock Database (for demo purposes) ---
const MOCK_DB_KEY = 'analytics_builder_mock_db';

const getMockDb = (): Record<string, QueryResult> => {
    try {
        const data = localStorage.getItem(MOCK_DB_KEY);
        if (data) return JSON.parse(data);
    } catch (e) { console.error("Failed to parse mock DB from localStorage", e); }

    // Default data if nothing in localStorage
    const defaultDb = {
         orders: {
            columns: ['id', 'user_id', 'total', 'status', 'created_at'],
            rows: [
                [1, 101, 150.50, 'Completed', '2023-01-15'],
                [2, 102, 75.00, 'Completed', '2023-01-16'],
                [3, 101, 220.00, 'Processing', '2023-02-10'],
                [4, 103, 95.20, 'Shipped', '2023-02-12'],
                [5, 102, 310.75, 'Shipped', '2023-03-01'],
            ]
        },
        users: {
            columns: ['id', 'name', 'email', 'signup_date'],
            rows: [
                [101, 'Alice', 'alice@example.com', '2023-01-05'],
                [102, 'Bob', 'bob@example.com', '2023-01-10'],
            ]
        },
        products: {
            columns: ['id', 'name', 'category', 'price'],
            rows: [
                [201, 'Laptop', 'Electronics', 1200],
                [202, 'Mouse', 'Electronics', 25],
            ]
        }
    };
    try {
        localStorage.setItem(MOCK_DB_KEY, JSON.stringify(defaultDb));
    } catch (e) { console.error("Failed to save default mock DB to localStorage", e); }
    return defaultDb;
};

type TableName = keyof ReturnType<typeof getMockDb>;

const getTableNameFromSql = (sql: string): TableName | null => {
    const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch && fromMatch[1]) {
        const db = getMockDb();
        const tableName = fromMatch[1].toLowerCase() as TableName;
        if (tableName in db) return tableName;
    }
    return null;
};

export class LocalStorageDriver implements IDatabaseDriver {
  
  // apiConfig and context are unused here but required to match the interface.
  executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
    console.info("LocalStorageDriver: Executing query against mock data.");
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const db = getMockDb();
            const tableName = getTableNameFromSql(request.query);
            if (!tableName) {
                return reject(new Error(`LocalStorage Error: Could not parse table name. Valid mock tables are: ${Object.keys(db).join(', ')}.`));
            }
            resolve(db[tableName]);
        }, 300); // Simulate network latency
    });
  }
}