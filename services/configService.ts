// ON THE SERVER, THIS ENDPOINT SHOULD USE a Redis client library (e.g., 'ioredis') 
// to store configurations as key-value pairs, where the key is a combination
// of the tenant ID and the configuration key (e.g., 'tenant123:dataSources').

import { ApiConfig } from './apiConfig';

interface RequestContext {
    department?: string;
    owner?: string;
}

// LocalStorage key for offline/demo fallback.
const LOCAL_STORAGE_KEY = 'analytics_builder_config';

// --- LocalStorage Helper Functions (for fallback/demo purposes) ---

const getLocalStoredConfig = (): Record<string, any> => {
    try {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error("Failed to read data from localStorage", error);
        return {};
    }
};

const setLocalStoredConfig = (config: Record<string, any>) => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
        console.error("Failed to save data to localStorage", error);
    }
};


// --- Service Functions ---

/**
 * Saves a configuration value locally. Used for auto-saving.
 * @param key The key of the configuration to save.
 * @param value The value to save.
 */
export const setConfigLocal = <T>(key: string, value: T): void => {
    const allConfig = getLocalStoredConfig();
    allConfig[key] = value;
    setLocalStoredConfig(allConfig);
}


/**
 * Fetches a specific configuration value by its key from the backend.
 * Falls back to localStorage on API failure for offline/demo support.
 * @param key The key of the configuration to fetch.
 * @param apiConfig The instance-specific API configuration.
 * @returns A promise that resolves with the configuration value, or null if not found.
 */
export const getConfig = async <T>(key: string, apiConfig: ApiConfig, context?: RequestContext): Promise<T | null> => {
    // API is the primary source of truth.
    if (apiConfig.CONFIG_API_URL) {
        try {
            const url = `${apiConfig.CONFIG_API_URL}?key=${encodeURIComponent(key)}`;
            const headers: HeadersInit = {};
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
            
            const response = await fetch(url, { headers });

            if (!response.ok) {
                if(response.status === 404) return null; // 404 is a valid "not found" response.
                throw new Error(`API returned status ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.warn(`API call to getConfig failed, falling back to localStorage. Error:`, error);
        }
    }
    
    // Fallback for API failure or if no API URL is configured.
    const allConfig = getLocalStoredConfig();
    return (allConfig[key] as T) || null;
};

/**
 * Saves a configuration value for a given key to the backend and syncs it to local storage.
 * This function is intended for manual synchronization. It throws an error on API failure.
 * @param key The key of the configuration to save.
 * @param value The value to save.
 * @param apiConfig The instance-specific API configuration.
 * @returns A promise resolving to 'remote' if saved to API, or 'local' if no API is configured.
 */
export const setConfig = async <T>(key: string, value: T, apiConfig: ApiConfig, context?: RequestContext): Promise<'remote' | 'local'> => {
    // This function is for syncing. It will ALSO update local storage for consistency.
    const updateLocalStorage = () => {
        setConfigLocal(key, value);
    };

    // Attempt to save to the API first.
    if (apiConfig.CONFIG_API_URL) {
        try {
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

            const response = await fetch(apiConfig.CONFIG_API_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify({ key, value }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API returned status ${response.status}: ${errorBody}`);
            }
            
            // If API call is successful, update local storage for consistency.
            updateLocalStorage();
            return 'remote';

        } catch (error) {
             console.error(`API call to setConfig failed. Error:`, error);
             throw error; // Propagate the error to be handled by the UI
        }
    }

    // Fallback for setups without a remote API: still save locally.
    updateLocalStorage();
    return 'local';
};