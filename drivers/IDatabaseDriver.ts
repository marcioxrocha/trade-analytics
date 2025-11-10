import { QueryRequest, QueryResult, RequestContext } from '../types';
import { ApiConfig } from '../services/apiConfig';

export interface IDatabaseDriver {
  executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult>;
}