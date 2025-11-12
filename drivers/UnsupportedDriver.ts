import { IDatabaseDriver } from './IDatabaseDriver';
import { QueryRequest, QueryResult, RequestContext } from '../types';
import { ApiConfig } from './../types';

export class UnsupportedDriver implements IDatabaseDriver {
  private type: string;

  constructor(type: string) {
    this.type = type;
  }

  executeQuery(request: QueryRequest, apiConfig: ApiConfig, context?: RequestContext): Promise<QueryResult> {
    const message = `Database type "${this.type}" is not supported by this component. A specific driver implementation is required.`;
    console.error(message, request);
    return Promise.reject(new Error(message));
  }
}