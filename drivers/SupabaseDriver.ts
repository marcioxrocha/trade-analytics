// --- BACKEND IMPLEMENTATION NOTE ---
// This driver sends a Supabase query to a backend proxy.
// The backend MUST use the '@supabase/supabase-js' npm package to create a client,
// execute the query string received from the frontend, and return the result.
// The query is a JavaScript string (e.g., "from('orders').select('*')")
// and must be evaluated securely on the backend.
//
// Example Backend Logic (in an Express.js route):
//
// import { createClient } from '@supabase/supabase-js';
//
// async function handleQuery(req, res) {
//   const { connectionString, query } = req.body;
//   try {
//     // 1. Parse connection details
//     const { url, key } = JSON.parse(connectionString);
//     if (!url || !key) {
//       return res.status(400).send('Supabase URL and Key are required.');
//     }
//
//     // 2. Create Supabase client
//     const supabase = createClient(url, key);
//
//     // 3. SECURELY evaluate the query string.
//     // Using the Function constructor is safer than eval(). The query string
//     // will be executed against the 'supabase' client instance.
//     const queryFunction = new Function('supabase', `return supabase.${query}`);
//     const { data, error } = await queryFunction(supabase);
//
//     if (error) {
//       throw new Error(error.message);
//     }
//
//     // 4. Transform results into the standard QueryResult format
//     if (!data || data.length === 0) {
//       return res.json({ columns: [], rows: [] });
//     }
//     const columns = Object.keys(data[0]);
//     const rows = data.map(doc => columns.map(col => doc[col]));
//
//     res.json({ columns, rows });
//
//   } catch (err) {
//     console.error('Supabase query error:', err);
//     res.status(500).send(err.message);
//   }
// }

import { QueryRequest, QueryResult, RequestContext, ApiConfig } from '../types';
import { IDatabaseDriver } from './IDatabaseDriver';

export class SupabaseDriver implements IDatabaseDriver {
  async executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
    
    let connDetails;
    try {
        connDetails = JSON.parse(request.dataSource.connectionString);
        if (!connDetails.url || !connDetails.key) {
            throw new Error('Supabase URL and Key are required in the connection string.');
        }
    } catch(e) {
        throw new Error(`Invalid Supabase connection string format. Expected a JSON object with 'url' and 'key'. Error: ${(e as Error).message}`);
    }
    
    // If useProxy is explicitly false, connect directly from the client.
    if (connDetails.useProxy === false) {
        console.info(`SupabaseDriver: Executing query directly from browser for ${request.dataSource.type}.`);
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(connDetails.url, connDetails.key);
            const queryFunction = new Function('supabase', `return supabase.${request.query}`);
            const { data, error } = await queryFunction(supabase);

            if (error) {
                throw new Error(error.message);
            }

            if (!data || data.length === 0) {
                return { columns: [], rows: [] };
            }

            const columns = Object.keys(data[0]);
            const rows = data.map((doc: any) => columns.map(col => doc[col]));
            return { columns, rows };

        } catch (err) {
            console.error('Supabase direct execution failed:', err);
            throw new Error(`Supabase Driver Error: ${(err as Error).message}`);
        }
    }

    // Default behavior: use the backend proxy.
    console.info(`SupabaseDriver: Executing query for ${request.dataSource.type} via proxy.`);

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
      console.error('Supabase driver execution failed:', err);
      throw new Error(`Supabase Driver Error: ${(err as Error).message}`);
    }
  }
}