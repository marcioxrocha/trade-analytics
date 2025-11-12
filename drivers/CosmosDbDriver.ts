// --- BACKEND IMPLEMENTATION NOTE ---
// Since CosmosDB can be configured with a MongoDB API, this driver
// can function identically to the MongoDbDriver on the frontend.
// The backend proxy receives the type 'CosmosDB' but can use its
// MongoDB query logic to connect and execute the query if the
// connection string is for a CosmosDB instance with the Mongo API enabled.

import { QueryRequest, QueryResult, RequestContext } from '../types';
import { IDatabaseDriver } from './IDatabaseDriver';
import { ApiConfig } from './../types';

export class CosmosDbDriver implements IDatabaseDriver {
  async executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
    console.info(`CosmosDbDriver: Executing query for ${request.dataSource.type} via proxy (using Mongo API).`);

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
          type: request.dataSource.type, // Send 'CosmosDB' but backend can route to Mongo logic
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
      console.error('CosmosDB driver execution failed:', err);
      throw new Error(`CosmosDB Driver Error: ${(err as Error).message}`);
    }
  }
}