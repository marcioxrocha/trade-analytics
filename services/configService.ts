// ON THE SERVER, THIS ENDPOINT SHOULD USE a Redis client library (e.g., 'ioredis') 
// to store configurations as key-value pairs, where the key is a combination
// of the tenant ID and the configuration key (e.g., 'tenant123:dataSources').

import { ApiConfig } from '../types';

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

const SUPABASE_TABLE_NAME = 'analytics_builder_configs';

const createSupabaseClient = async (apiConfig: ApiConfig) => {
    if (!apiConfig.CONFIG_SUPABASE_URL || !apiConfig.CONFIG_SUPABASE_KEY) {
        return null;
    }
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(apiConfig.CONFIG_SUPABASE_URL, apiConfig.CONFIG_SUPABASE_KEY);
};


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
    // 1. Try Supabase first
    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            let query = supabase
                .from(SUPABASE_TABLE_NAME)
                .select('value')
                .eq('key', key);

            const tenantId = apiConfig.TENANT_ID || null;
            const department = context?.department || null;
            const owner = context?.owner || null;

            if (tenantId) query = query.eq('tenant_id', tenantId); else query = query.is('tenant_id', null);
            if (department) query = query.eq('department', department); else query = query.is('department', null);
            if (owner) query = query.eq('owner', owner); else query = query.is('owner', null);
            
            const { data, error } = await query.single();

            if (error && error.code !== 'PGRST116') { // PGRST116 is "exact one row not found"
                throw new Error(error.message);
            }
            if (data) {
                return data.value as T;
            }
        } catch (error) {
            console.warn(`Supabase getConfig failed, falling back. Error:`, error);
        }
    }


    // 2. Fallback to custom API
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
    
    // 3. Fallback to localStorage.
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
    const updateLocalStorage = () => {
        setConfigLocal(key, value);
    };

    // 1. Try Supabase first
    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            const tenantId = apiConfig.TENANT_ID || null;
            const department = context?.department || null;
            const owner = context?.owner || null;
            
            const record = {
                key,
                value,
                tenant_id: tenantId,
                department,
                owner
            };

            let selectQuery = supabase
                .from(SUPABASE_TABLE_NAME)
                .select('id')
                .eq('key', key);
            
            if (tenantId) selectQuery = selectQuery.eq('tenant_id', tenantId); else selectQuery = selectQuery.is('tenant_id', null);
            if (department) selectQuery = selectQuery.eq('department', department); else selectQuery = selectQuery.is('department', null);
            if (owner) selectQuery = selectQuery.eq('owner', owner); else selectQuery = selectQuery.is('owner', null);

            const { data: existing, error: selectError } = await selectQuery.maybeSingle();
            if (selectError) throw selectError;

            const { error: finalError } = existing
                ? await supabase.from(SUPABASE_TABLE_NAME).update({ value }).eq('id', existing.id)
                : await supabase.from(SUPABASE_TABLE_NAME).insert(record);
            
            if (finalError) throw finalError;

            updateLocalStorage();
            return 'remote';
        } catch (error) {
            console.error(`Supabase setConfig failed. Error:`, error);
            throw error;
        }
    }

    // 2. Fallback to custom API
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
            
            updateLocalStorage();
            return 'remote';

        } catch (error) {
             console.error(`API call to setConfig failed. Error:`, error);
             throw error;
        }
    }

    // 3. Fallback for setups without a remote backend: still save locally.
    updateLocalStorage();
    return 'local';
};