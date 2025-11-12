// --- BACKEND IMPLEMENTATION NOTE ---
// This driver sends a Redis command to a backend proxy.
// The backend should use an npm package like 'ioredis' to execute the command.
//
// Example Backend Logic (in an Express.js route):
//
// import Redis from 'ioredis';
//
// async function handleQuery(req, res) {
//   const { connectionString, command, args } = req.body;
//   const redis = new Redis(connectionString);
//   try {
//     const result = await redis[command](...args);
//     // Transform Redis result to the application's QueryResult format
//     // This is highly dependent on the command (e.g., HGETALL vs. GET)
//     // Example for HGETALL:
//     const columns = ['key', 'value'];
//     const rows = result ? Object.entries(result) : [];
//     res.json({ columns, rows });
//   } catch (err) {
//     console.error('Redis command error:', err);
//     res.status(500).send(err.message);
//   } finally {
//     redis.quit();
//   }
// }

import { QueryRequest, QueryResult, RequestContext } from '../types';
import { IDatabaseDriver } from './IDatabaseDriver';
import { ApiConfig } from './../types';

export class RedisDriver implements IDatabaseDriver {
  /**
   * Executes a Redis command by sending it to the backend proxy.
   * The command and arguments are parsed from the query string.
   * @param request The query request, where `query` is a Redis command (e.g., "HGETALL my_hash").
   * @param apiConfig The instance-specific API configuration.
   * @returns The result of the command.
   */
  async executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
    console.info(`RedisDriver: Executing command via proxy for ${request.dataSource.name}.`);

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

    // Parse command and arguments from the query string
    const parts = request.query.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    if (!command) {
        throw new Error("Redis command cannot be empty.");
    }

    try {
      const response = await fetch(apiConfig.QUERY_PROXY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: request.dataSource.type,
          connectionString: request.dataSource.connectionString,
          command,
          args,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API query failed with status ${response.status}: ${errorText}`);
      }
      return await response.json();
    } catch (err) {
      console.error('Redis driver execution failed:', err);
      return { columns: ['driver_error'], rows: [[(err as Error).message]] };
    }
  }
}