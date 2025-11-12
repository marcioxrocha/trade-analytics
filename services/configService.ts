// ON THE SERVER, THIS ENDPOINT SHOULD USE a Redis client library (e.g., 'ioredis') 
// to store configurations as key-value pairs, where the key is a combination
// of the tenant ID and the configuration key (e.g., 'tenant123:dataSources').

import { ApiConfig, DataSource, DatabaseType, AllConfigs, DeletionTombstone, DeletionEntityType } from '../types';
import { DATA_SOURCES_KEY, WHITE_LABEL_KEY, APP_SETTINGS_KEY, DASHBOARD_CONFIG_PREFIX, DASHBOARD_CARDS_PREFIX, DASHBOARD_VARIABLES_PREFIX } from '../constants';

interface RequestContext {
    department?: string;
    owner?: string;
}

const LOCAL_STORAGE_PREFIX = 'analytics_builder_';
const DELETION_TOMBSTONES_KEY = 'deletion_tombstones';
const ENCRYPT_PREFIX = 'enc::';


// --- Encryption / Decryption Helpers (XOR Cipher) ---
const xorStrings = (a: string, b: string): string => {
  let result = '';
  for (let i = 0; i < a.length; i++) {
    result += String.fromCharCode(a.charCodeAt(i) ^ b.charCodeAt(i % b.length));
  }
  return result;
};

const encrypt = (text: string, key: string): string => {
  if (!key) return text;
  const xorred = xorStrings(text, key);
  return ENCRYPT_PREFIX + btoa(xorred);
};

const decrypt = (encryptedText: string, key: string): string => {
  if (!key || !encryptedText.startsWith(ENCRYPT_PREFIX)) return encryptedText;
  try {
    const base64Part = encryptedText.substring(ENCRYPT_PREFIX.length);
    const decoded = atob(base64Part);
    return xorStrings(decoded, key);
  } catch (e) {
    console.error("Failed to decrypt data, returning raw value.", e);
    return encryptedText;
  }
};


// --- LocalStorage Helper Functions (for fallback/demo purposes) ---

const getLocalItem = <T>(key: string): T | null => {
    try {
        const data = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${key}`);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error(`Failed to read '${key}' from localStorage`, error);
        return null;
    }
};

const setLocalItem = <T>(key: string, value: T) => {
    try {
        localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${key}`, JSON.stringify(value));
    } catch (error) {
        console.error(`Failed to save '${key}' to localStorage`, error);
    }
};

const deleteLocalItem = (key: string) => {
    try {
        localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${key}`);
    } catch (error) {
        console.error(`Failed to delete '${key}' from localStorage`, error);
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
export const setConfigLocal = <T>(key: string, value: T, apiConfig: ApiConfig): void => {
    if (key === DATA_SOURCES_KEY) {
        const sources = value as unknown as DataSource[];
        const secret = apiConfig.LOCAL_DATA_SECRET;
        // Types that should NOT be stored locally with connection strings. Supabase is excluded.
        const LOCALLY_PROHIBITED_DB_TYPES: DatabaseType[] = ['PostgreSQL', 'MySQL', 'SQL Server', 'Redis', 'MongoDB', 'CosmosDB'];

        const sanitizedSources = sources.map(source => {
            // For prohibited types, always strip the connection string for local storage.
            if (LOCALLY_PROHIBITED_DB_TYPES.includes(source.type)) {
                return { ...source, connectionString: '' };
            }

            // For Supabase, maintain the existing encryption logic.
            if (source.type === 'Supabase') {
                if (secret && source.connectionString && source.connectionString !== 'N/A') {
                    // Encrypt if secret is available
                    return { ...source, connectionString: encrypt(source.connectionString, secret) };
                }
                // Strip if no secret is available (security fallback)
                return { ...source, connectionString: '' };
            }
            
            // For all other types (e.g., LocalStorage (Demo)), return as is.
            return source;
        });
        setLocalItem(key, sanitizedSources);
    } else {
        setLocalItem(key, value);
    }
}

/**
 * Deletes a configuration value locally.
 * @param key The key of the configuration to delete.
 */
export const deleteConfigLocal = (key: string): void => {
    deleteLocalItem(key);
};


export const getLocalTombstones = (): DeletionTombstone[] => {
    return getLocalItem<DeletionTombstone[]>(DELETION_TOMBSTONES_KEY) || [];
}

export const setLocalTombstones = (tombstones: DeletionTombstone[]): void => {
    setLocalItem(DELETION_TOMBSTONES_KEY, tombstones);
}


/**
 * Fetches all configurations scoped to the current context from the backend.
 * This is crucial for the sync mechanism to compare local vs. remote state.
 * @param apiConfig The instance-specific API configuration.
 * @param context The request context (department, owner).
 * @returns A promise that resolves with an object containing all configurations.
 */
export const getAllConfigs = async (apiConfig: ApiConfig, context?: RequestContext): Promise<AllConfigs> => {
    const emptyState: AllConfigs = {
        dashboards: [], cards: [], variables: [], dataSources: [],
        whiteLabelSettings: null, appSettings: null
    };

    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            let query = supabase.from(SUPABASE_TABLE_NAME).select('key, value');
            const tenantId = apiConfig.TENANT_ID || null;
            if (tenantId) query = query.eq('tenant_id', tenantId);
            if (context?.department) query = query.eq('department', context.department);
            if (context?.owner) query = query.eq('owner', context.owner);

            const { data, error } = await query;
            if (error) throw error;
            
            if (!data) return emptyState;

            const result: AllConfigs = { ...emptyState };
            data.forEach(item => {
                if (item.key.startsWith(DASHBOARD_CONFIG_PREFIX)) result.dashboards.push(item.value);
                else if (item.key.startsWith(DASHBOARD_CARDS_PREFIX)) result.cards.push(...item.value);
                else if (item.key.startsWith(DASHBOARD_VARIABLES_PREFIX)) result.variables.push(...item.value);
                else if (item.key === DATA_SOURCES_KEY) result.dataSources = item.value;
                else if (item.key === WHITE_LABEL_KEY) result.whiteLabelSettings = item.value;
                else if (item.key === APP_SETTINGS_KEY) result.appSettings = item.value;
            });
            return result;
        } catch (error) {
             console.warn(`Supabase getAllConfigs failed, falling back to local. Error:`, error);
        }
    }
    
    // Fallback to local storage if API fails or isn't configured
    console.log("getAllConfigs falling back to local storage.");
    const localDashboards = getLocalItem<any[]>(DASHBOARD_CONFIG_PREFIX)?.flat() || [];
    const localCards = getLocalItem<any[]>(DASHBOARD_CARDS_PREFIX)?.flat() || [];
    const localVariables = getLocalItem<any[]>(DASHBOARD_VARIABLES_PREFIX)?.flat() || [];
    const localDataSources = getLocalItem<DataSource[]>(DATA_SOURCES_KEY) || [];
    const localWhiteLabel = getLocalItem<any>(WHITE_LABEL_KEY);
    const localAppSettings = getLocalItem<any>(APP_SETTINGS_KEY);

    return {
        dashboards: localDashboards,
        cards: localCards,
        variables: localVariables,
        dataSources: localDataSources,
        whiteLabelSettings: localWhiteLabel,
        appSettings: localAppSettings,
    };
};



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

            if (tenantId) query = query.eq('tenant_id', tenantId);
            if (department) query = query.eq('department', department);
            if (owner) query = query.eq('owner', owner);
            
            const { data, error } = await query.maybeSingle();

            if (error) {
                throw new Error(error.message);
            }
            
            return data ? (data.value as T) : null;
            
        } catch (error) {
            console.warn(`Supabase getConfig failed, falling back. Error:`, error);
        }
    }


    // 2. Fallback to custom API
    if (apiConfig.CONFIG_API_URL) {
        try {
            const url = `${apiConfig.CONFIG_API_URL}?key=${encodeURIComponent(key)}`;
            const headers: HeadersInit = {};
            if (apiConfig.TENANT_ID) headers['X-Tenant-Id'] = apiConfig.TENANT_ID;
            if (apiConfig.API_KEY) headers['api_key'] = apiConfig.API_KEY;
            if (apiConfig.API_SECRET) headers['api_secret'] = apiConfig.API_SECRET;
            if (context?.department) headers['X-Department'] = context.department;
            if (context?.owner) headers['X-Owner'] = context.owner;
            
            const response = await fetch(url, { headers });

            if (!response.ok) {
                if(response.status === 404) return null;
                throw new Error(`API returned status ${response.status}`);
            }
            const responseData = await response.json();
            
            // FIX: Handle backend returning the full document vs. just the value.
            if (responseData && typeof responseData === 'object' && 'value' in responseData) {
                return responseData.value as T;
            }
            return responseData as T;

        } catch (error) {
            console.warn(`API call to getConfig failed, falling back to localStorage. Error:`, error);
        }
    }
    
    // 3. Fallback to localStorage.
    const localData = getLocalItem<T>(key);
    if (key === DATA_SOURCES_KEY && localData) {
        const sources = localData as unknown as DataSource[];
        const secret = apiConfig.LOCAL_DATA_SECRET;
        const SENSITIVE_DB_TYPES: DatabaseType[] = ['PostgreSQL', 'MySQL', 'SQL Server', 'Redis', 'MongoDB', 'CosmosDB', 'Supabase'];

        const processedSources = sources.map(source => {
            if (SENSITIVE_DB_TYPES.includes(source.type) && secret && source.connectionString) {
                return { ...source, connectionString: decrypt(source.connectionString, secret) };
            }
            return source;
        });
        return processedSources as T;
    }
    return localData;
};

/**
 * Fetches all configuration values where the key matches a given prefix.
 * @param prefix The prefix to match keys against (e.g., "dashboard:").
 * @param apiConfig The instance-specific API configuration.
 * @returns A promise resolving to an array of configuration values.
 */
export const getConfigsByPrefix = async <T>(prefix: string, apiConfig: ApiConfig, context?: RequestContext): Promise<T[]> => {
    // 1. Try Supabase first
    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            let query = supabase
                .from(SUPABASE_TABLE_NAME)
                .select('value')
                .like('key', `${prefix}%`); // Use LIKE for prefix matching

            const tenantId = apiConfig.TENANT_ID || null;
            const department = context?.department || null;
            const owner = context?.owner || null;

            if (tenantId) query = query.eq('tenant_id', tenantId);
            if (department) query = query.eq('department', department);
            if (owner) query = query.eq('owner', owner);

            const { data, error } = await query;

            if (error) throw new Error(error.message);
            
            return data ? data.map(item => item.value as T) : [];
        } catch (error) {
            console.warn(`Supabase getConfigsByPrefix failed, falling back. Error:`, error);
        }
    }

    // 2. Custom API is not supported for prefix search in this implementation.
    if (apiConfig.CONFIG_API_URL) {
        try {
            const url = `${apiConfig.CONFIG_API_URL}?prefix=${encodeURIComponent(prefix)}`;
            const headers: HeadersInit = {};
            if (apiConfig.TENANT_ID) headers['X-Tenant-Id'] = apiConfig.TENANT_ID;
            if (apiConfig.API_KEY) headers['api_key'] = apiConfig.API_KEY;
            if (apiConfig.API_SECRET) headers['api_secret'] = apiConfig.API_SECRET;
            if (context?.department) headers['X-Department'] = context.department;
            if (context?.owner) headers['X-Owner'] = context.owner;
            
            const response = await fetch(url, { headers });

            if (!response.ok) {
                if(response.status === 404) return null; // 404 is a valid "not found" response.
                throw new Error(`API returned status ${response.status}`);
            }
            const res = await response.json();

            return res ? res.map((item: any) => item.value as T) : [];
        } catch (error) {
            console.warn(`API call to getConfig failed, falling back to localStorage. Error:`, error);
        }
    }    

    // 3. Fallback to localStorage.
    const results: T[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (storageKey && storageKey.startsWith(`${LOCAL_STORAGE_PREFIX}${prefix}`)) {
            const appKey = storageKey.substring(LOCAL_STORAGE_PREFIX.length);
            const item = getLocalItem<T>(appKey);
            if (item) {
                results.push(item);
            }
        }
    }
    return results;
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
        setConfigLocal(key, value, apiConfig);
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
                owner,
                last_modified: new Date().toISOString(),
            };

            let selectQuery = supabase
                .from(SUPABASE_TABLE_NAME)
                .select('id')
                .eq('key', key);
            
            if (tenantId) selectQuery = selectQuery.eq('tenant_id', tenantId);
            if (department) selectQuery = selectQuery.eq('department', department);
            if (owner) selectQuery = selectQuery.eq('owner', owner);

            const { data: existing, error: selectError } = await selectQuery.maybeSingle();
            if (selectError) throw selectError;

            const { error: finalError } = existing
                ? await supabase.from(SUPABASE_TABLE_NAME).update({ value: record.value, last_modified: record.last_modified }).eq('id', existing.id)
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
            if (apiConfig.TENANT_ID) headers['X-Tenant-Id'] = apiConfig.TENANT_ID;
            if (apiConfig.API_KEY) headers['api_key'] = apiConfig.API_KEY;
            if (apiConfig.API_SECRET) headers['api_secret'] = apiConfig.API_SECRET;
            if (context?.department) headers['X-Department'] = context.department;
            if (context?.owner) headers['X-Owner'] = context.owner;

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

/**
 * Deletes a configuration value from the backend and local storage.
 * @param key The key of the configuration to delete.
 * @param apiConfig The instance-specific API configuration.
 */
export const deleteConfig = async (key: string, apiConfig: ApiConfig, context?: RequestContext): Promise<void> => {
    deleteLocalItem(key);

    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            let query = supabase
                .from(SUPABASE_TABLE_NAME)
                .delete()
                .eq('key', key);
            
            const tenantId = apiConfig.TENANT_ID || null;
            const department = context?.department || null;
            const owner = context?.owner || null;

            if (tenantId) query = query.eq('tenant_id', tenantId);
            if (department) query = query.eq('department', department);
            if (owner) query = query.eq('owner', owner);

            const { error } = await query;
            if (error) throw error;
            return;
        } catch (error) {
            console.error(`Supabase deleteConfig failed. Error:`, error);
            throw error;
        }
    }
    
    if (apiConfig.CONFIG_API_URL) {
        // This would require a DELETE method on the backend, which is not assumed.
        console.warn('deleteConfig with custom API URL is not implemented.');
    }
};
