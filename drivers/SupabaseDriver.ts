import { imports } from '@/services/configService';
import { QueryRequest, QueryResult, RequestContext, ApiConfig } from '../types';
import { IDatabaseDriver } from './IDatabaseDriver';

export class SupabaseDriver implements IDatabaseDriver {
  async executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
    let connDetails;

    const moment = imports.moment;
    
    try {
        connDetails = JSON.parse(request.dataSource.connectionString);
        if (!connDetails.url || !connDetails.key) {
            throw new Error('Supabase URL and Key are required in the connection string.');
        }
    } catch(e) {
        throw new Error(`Invalid Supabase connection string format. Expected a JSON object with 'url' and 'key'. Error: ${(e as Error).message}`);
    }

    // Clean the query to prevent syntax errors during execution.
    // Trim whitespace and remove any trailing semicolon.
    const cleanQuery = request.query.trim().replace(/;$/, '');

    // If the query is empty after cleaning, there's nothing to execute. Return an empty result set.
    if (!cleanQuery) {
        return { columns: [], rows: [] };
    }
    
    // If useProxy is explicitly false, connect directly from the client.
    if (connDetails.useProxy === false) {
        console.info(`SupabaseDriver: Executing query directly from browser for ${request.dataSource.type}.`);
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(connDetails.url, connDetails.key);
            
            const PAGE_SIZE = 1000; // Supabase's default max limit
            let allData: any[] = [];
            let page = 0;
            let keepFetching = true;

            if(cleanQuery.indexOf('.limit(')>0){
                const queryFunction = new Function('supabase', 'moment',`return supabase.${cleanQuery}`);

                const { data, error } = await queryFunction(supabase, moment);

                if (error) {
                    throw new Error(error.message);
                }

                if (!data || data.length === 0) {
                    return { columns: [], rows: [] };
                }

                const columns = Object.keys(data[0]);
                const rows = data.map((doc: any) => columns.map(col => doc[col]));
                return { columns, rows };                
            }

            while(keepFetching) {
                const from = page * PAGE_SIZE;
                const to = from + PAGE_SIZE - 1;
                
                // Append the range to the user's query
                const paginatedQuery = `${cleanQuery}.range(${from}, ${to})`;
                
                const queryFunction = new Function('supabase', 'moment',`return supabase.${paginatedQuery}`);
                const { data, error } = await queryFunction(supabase, moment);

                if (error) {
                    throw new Error(error.message);
                }

                if (data && data.length > 0) {
                    allData = [...allData, ...data];
                }
                
                // If we got less data than the page size, it's the last page.
                if (!data || data.length < PAGE_SIZE) {
                    keepFetching = false;
                }
                
                page++;
            }

            if (!allData || allData.length === 0) {
                return { columns: [], rows: [] };
            }

            const columns = Object.keys(allData[0]);
            const rows = allData.map((doc: any) => columns.map(col => doc[col]));
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
          query: cleanQuery,
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