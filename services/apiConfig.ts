import { environments } from './environment';
import { ApiConfig } from '../types';

export const setVars = (env:any) => {
    if(env && environments){
        for(const prop in env) {
            environments[prop] = env[prop];
        }
    }  
}

const getEnvVar = (baseName: string, instanceKey?: string): string => {
    // In a browser environment, process.env is typically handled by a bundler.
    // We assume the environment provides a `process.env` object that allows dynamic key access.
    const env = environments || {};
    const prefix = 'ANALYTICS_BUILDER_';

    if (instanceKey) {
        const prefixedKey = `${prefix}${instanceKey.toUpperCase()}_${baseName}`;
        if (env[prefixedKey] !== undefined) {
            return env[prefixedKey];
        }
    }
    return env[`${prefix}${baseName}`] || '';
};

/**
 * Generates an API configuration object for a specific dashboard instance.
 * @param instanceKey An optional key to look for prefixed environment variables.
 * @returns An ApiConfig object with the resolved configuration values.
 */
export const getApiConfig = (instanceKey?: string): ApiConfig => {
  return {
    QUERY_PROXY_URL: getEnvVar(`QUERY_PROXY_URL`, instanceKey) || '/api/query',
    CONFIG_API_URL: getEnvVar(`CONFIG_API_URL`, instanceKey),
    CONFIG_SUPABASE_URL: getEnvVar(`CONFIG_SUPABASE_URL`, instanceKey),
    CONFIG_SUPABASE_KEY: getEnvVar(`CONFIG_SUPABASE_KEY`, instanceKey),
    TENANT_ID: getEnvVar(`TENANT`, instanceKey),
    API_KEY: getEnvVar(`API_KEY`, instanceKey),
    API_SECRET: getEnvVar(`API_SECRET`, instanceKey),
    FIREBASE_API_KEY: getEnvVar(`FIREBASE_API_KEY`, instanceKey),
    FIREBASE_AUTH_DOMAIN: getEnvVar(`FIREBASE_AUTH_DOMAIN`, instanceKey),
    FIREBASE_PROJECT_ID: getEnvVar(`FIREBASE_PROJECT_ID`, instanceKey),
    FIREBASE_RECAPTCHA_SITE_KEY: getEnvVar(`FIREBASE_RECAPTCHA_SITE_KEY`, instanceKey),
    AUTH_VERIFY_EMAIL_URL: getEnvVar(`AUTH_VERIFY_EMAIL_URL`, instanceKey),
    LOCAL_DATA_SECRET: getEnvVar('LOCAL_DATA_SECRET', instanceKey),
  };
};