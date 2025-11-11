import { environments } from './environment';
import { ApiConfig } from '../types';

const getEnvVar = (baseName: string, instanceKey?: string): string => {
    // In a browser environment, process.env is typically handled by a bundler.
    // We assume the environment provides a `process.env` object that allows dynamic key access.
    const env = environments || {};

    if (instanceKey) {
        const prefixedKey = `${instanceKey.toUpperCase()}_${baseName}`;
        if (env[prefixedKey] !== undefined) {
            return env[prefixedKey];
        }
    }
    return env[baseName] || '';
};

/**
 * Generates an API configuration object for a specific dashboard instance.
 * @param instanceKey An optional key to look for prefixed environment variables.
 * @returns An ApiConfig object with the resolved configuration values.
 */
export const getApiConfig = (instanceKey?: string): ApiConfig => {
  return {
    QUERY_PROXY_URL: getEnvVar('ANALYTICS_BUILDER_QUERY_PROXY_URL', instanceKey) || '/api/query',
    CONFIG_API_URL: getEnvVar('ANALYTICS_BUILDER_CONFIG_API_URL', instanceKey),
    CONFIG_SUPABASE_URL: getEnvVar('ANALYTICS_BUILDER_CONFIG_SUPABASE_URL', instanceKey),
    CONFIG_SUPABASE_KEY: getEnvVar('ANALYTICS_BUILDER_CONFIG_SUPABASE_KEY', instanceKey),
    TENANT_ID: getEnvVar('ANALYTICS_BUILDER_TENANT', instanceKey),
    API_KEY: getEnvVar('ANALYTICS_BUILDER_API_KEY', instanceKey),
    API_SECRET: getEnvVar('ANALYTICS_BUILDER_API_SECRET', instanceKey),
  };
};