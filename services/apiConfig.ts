import { ApiConfig as EnvironmentStore } from './environment';

// Fix: Define and export a proper interface for ApiConfig.
// This resolves the issue where ApiConfig was not exported from this module.
export interface ApiConfig {
  QUERY_PROXY_URL: string;
  CONFIG_API_URL: string;
  TENANT_ID: string;
  API_KEY: string;
  API_SECRET: string;
}

const getEnvVar = (baseName: string, instanceKey?: string): string => {
    // In a browser environment, process.env is typically handled by a bundler.
    // We assume the environment provides a `process.env` object that allows dynamic key access.
    // Fix: Use aliased import to avoid name collision with the new ApiConfig interface.
    const env = EnvironmentStore.environments || {};

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
    TENANT_ID: getEnvVar('ANALYTICS_BUILDER_TENANT', instanceKey),
    API_KEY: getEnvVar('ANALYTICS_BUILDER_API_KEY', instanceKey),
    API_SECRET: getEnvVar('ANALYTICS_BUILDER_API_SECRET', instanceKey),
  };
};
