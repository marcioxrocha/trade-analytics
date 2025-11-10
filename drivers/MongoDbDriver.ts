// --- BACKEND IMPLEMENTATION NOTE ---
// This driver sends a MongoDB query to a backend proxy.
// The backend should use the 'mongodb' npm package to parse and
// execute the query against the specified database.
// The query from the frontend will be a JSON string. The backend
// needs to parse it and use its properties to build a command.
//
// Example Backend Logic (in an Express.js route):
//
// import { MongoClient } from 'mongodb';
//
// async function handleQuery(req, res) {
//   const { connectionString, query } = req.body;
//   const client = new MongoClient(connectionString);
//   try {
//     await client.connect();
//     const db = client.db(); // Assumes DB name is in the connection string
//     const queryObj = JSON.parse(query);
//     const { find, filter, projection, sort, limit } = queryObj;
//
//     if (!find) throw new Error("Query must specify a 'find' property for the collection.");
//
//     const collection = db.collection(find);
//     const cursor = collection.find(filter || {}).project(projection || {}).sort(sort || {}).limit(limit || 100);
//     const results = await cursor.toArray();
//     
//     // Transform results into QueryResult format
//     if (results.length === 0) {
//         return res.json({ columns: [], rows: [] });
//     }
//     const columns = Object.keys(results[0]);
//     const rows = results.map(doc => columns.map(col => doc[col]));
//
//     res.json({ columns, rows });
//   } catch (err) {
//     console.error('MongoDB query error:', err);
//     res.status(500).send(err.message);
//   } finally {
//     await client.close();
//   }
// }

import { QueryRequest, QueryResult, RequestContext } from '../types';
import { IDatabaseDriver } from './IDatabaseDriver';
import { ApiConfig } from '../services/apiConfig';

export class MongoDbDriver implements IDatabaseDriver {
  async executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
    console.info(`MongoDbDriver: Executing query for ${request.dataSource.type} via proxy.`);

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
      console.error('MongoDB driver execution failed:', err);
      throw new Error(`MongoDB Driver Error: ${(err as Error).message}`);
    }
  }
}