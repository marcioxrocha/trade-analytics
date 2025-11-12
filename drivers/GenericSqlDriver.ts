// --- BACKEND IMPLEMENTATION NOTE ---
// This generic driver sends a request to a backend proxy.
// The backend should inspect the 'type' field ('PostgreSQL', 'MySQL', etc.)
// and use the appropriate npm package ('pg', 'mysql2', 'mssql') to execute
// the query against the specified database.

import { QueryRequest, QueryResult, RequestContext } from '../types';
import { IDatabaseDriver } from './IDatabaseDriver';
import { ApiConfig } from './../types';

export class GenericSqlDriver implements IDatabaseDriver {
  /**
   * Executes a SQL query by sending it to the backend proxy.
   * @param request The query request details.
   * @param apiConfig The instance-specific API configuration containing credentials and endpoints.
   * @returns The result of the query.
   */
  async executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
    console.info(`GenericSqlDriver: Executing query for ${request.dataSource.type} data source via proxy.`);

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (apiConfig.TENANT_ID) {
      headers['X-Tenant-Id'] = apiConfig.TENANT_ID;
    }
    if (apiConfig.API_KEY) {
      headers['api_key'] = apiConfig.API_KEY;
    }
    if (apiConfig.API_SECRET) {
      headers['api_secret'] = apiConfig.API_SECRET;
    }
    if (context?.department) {
        headers['X-Department'] = context.department;
    }
    if (context?.owner) {
        headers['X-Owner'] = context.owner;
    }

    try {
      const response = await fetch(apiConfig.QUERY_PROXY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: request.dataSource.type,
          connectionString: request.dataSource.connectionString,
          query: request.query,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API query failed with status ${response.status}: ${errorText}`);
      }
      return await response.json();
    } catch (err) {
      console.error('Generic SQL driver execution failed:', err);
      return { columns: ['driver_error'], rows: [[(err as Error).message]] };
    }
  }
}