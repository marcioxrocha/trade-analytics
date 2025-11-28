// ON THE SERVER, THIS ENDPOINT SHOULD USE a Redis client library (e.g., 'ioredis') 
// to store configurations as key-value pairs, where the key is a combination
// of the tenant ID and the configuration key (e.g., 'tenant123:dataSources').

import { ApiConfig, DataSource, DatabaseType, AllConfigs, DeletionTombstone } from '../types';
import { DATA_SOURCES_KEY, WHITE_LABEL_KEY, APP_SETTINGS_KEY, DASHBOARD_CONFIG_PREFIX, DASHBOARD_CARDS_PREFIX, DASHBOARD_VARIABLES_PREFIX, LAST_ACTIVE_DASHBOARD_ID_KEY } from '../constants';
import * as idbService from './indexedDbService';

interface RequestContext {
    department?: string;
    owner?: string;
}

const LOCAL_STORAGE_PREFIX = 'analytics_builder_';
const DELETION_TOMBSTONES_KEY = 'deletion_tombstones';
const ENCRYPT_PREFIX = 'enc::';
// Changed migration key to force a re-run with the new encryption logic.
const MIGRATION_KEY = 'migration_v3_idb_forced_encryption_complete';
const SECRET_KEY = 'encryption_secret';


// --- Encryption / Decryption Helpers (XOR Cipher) ---

/**
 * Generates and stores a persistent secret in IndexedDB if one doesn't already exist.
 * This ensures that data encryption can always occur, even without environment variables.
 * @returns A promise that resolves with the secret key.
 */
const getOrCreateSecret = async (): Promise<string> => {
    let secret = await idbService.get<string>(SECRET_KEY);
    if (!secret) {
        // Generate a reasonably strong random key
        secret = crypto.randomUUID() + crypto.randomUUID();
        await idbService.set(SECRET_KEY, secret);
    }
    return secret;
};


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
  // To handle UTF-8 characters correctly with btoa, we need to convert the string.
  const utf8Friendly = unescape(encodeURIComponent(xorred));
  return ENCRYPT_PREFIX + btoa(utf8Friendly);
};

const decrypt = (encryptedText: string, key: string): string => {
  if (!key || !encryptedText.startsWith(ENCRYPT_PREFIX)) return encryptedText;
  try {
    const base64Part = encryptedText.substring(ENCRYPT_PREFIX.length);
    const decodedB64 = atob(base64Part);
    // Decode the UTF-8 characters back from the byte string.
    const decodedUtf8 = decodeURIComponent(escape(decodedB64));
    return xorStrings(decodedUtf8, key);
  } catch (e) {
    console.error("Failed to decrypt data, returning raw value.", e);
    return encryptedText;
  }
};


// --- Migration from LocalStorage to IndexedDB ---
const migrateFromLocalStorageToIndexedDB = async (): Promise<void> => {
    const isMigrated = await idbService.get<boolean>(MIGRATION_KEY);
    if (isMigrated) {
        return;
    }

    console.log("Forcing data migration from localStorage to IndexedDB with guaranteed encryption...");
    
    // CRITICAL: Clear any existing (potentially unencrypted) data before migrating.
    await idbService.clear();

    const keysToMigrate = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Migrate all keys with the app's prefix, except for theme (UI preference) and mock_db (demo data).
        if (key && key.startsWith(LOCAL_STORAGE_PREFIX) && !key.endsWith('_theme') && !key.endsWith('_mock_db')) {
            keysToMigrate.push(key);
        }
    }

    if (keysToMigrate.length === 0) {
        console.log("No data found in localStorage to migrate.");
        await idbService.set(MIGRATION_KEY, true);
        return;
    }

    const migrationPromises = keysToMigrate.map(async storageKey => {
        const appKey = storageKey.substring(LOCAL_STORAGE_PREFIX.length);
        const rawValue = localStorage.getItem(storageKey);
        if (rawValue) {
            try {
                // For keys that store plain strings (like last active ID), don't parse. For others, parse JSON.
                const valueToMigrate = appKey === LAST_ACTIVE_DASHBOARD_ID_KEY ? rawValue : JSON.parse(rawValue);
                // The new setConfigLocal will always encrypt.
                await setConfigLocal(appKey, valueToMigrate);
                 console.log(`Migrated key: ${appKey}`);
            } catch (e) {
                console.error(`Failed to parse or migrate key ${appKey}:`, e);
                // Continue with other keys even if one fails
            }
        }
    });

    try {
        await Promise.all(migrationPromises);
        await idbService.set(MIGRATION_KEY, true);
        console.log("Migration successful. Cleaning up localStorage...");
        keysToMigrate.forEach(key => localStorage.removeItem(key));
    } catch (error) {
        console.error("An error occurred during migration:", error);
        // Do not set migration flag or clean up if the process fails.
    }
};


// --- Service Functions ---

const SUPABASE_TABLE_NAME = 'analytics_builder_configs';

export const imports:any = {};

const createSupabaseClient = async (apiConfig: ApiConfig) => {
    if (!apiConfig.CONFIG_SUPABASE_URL || !apiConfig.CONFIG_SUPABASE_KEY) {
        return null;
    }
    const { createClient } = await import('@supabase/supabase-js');
    imports.moment = (await import('moment')).default;
    return createClient(apiConfig.CONFIG_SUPABASE_URL, apiConfig.CONFIG_SUPABASE_KEY);
};


/**
 * Saves a configuration value locally, always encrypting it before storing in IndexedDB.
 * It also sanitizes sensitive data (like connection strings) before saving.
 * @param key The key of the configuration to save.
 * @param value The value to save.
 */
export const setConfigLocal = async <T>(key: string, value: T): Promise<void> => {
    let valueToStore = value;

    // Intercept and sanitize data sources before encryption.
    if (key === DATA_SOURCES_KEY && Array.isArray(value)) {
        const dataSources = value as unknown as DataSource[];
        const sanitizedDataSources = dataSources.map(ds => {
            // Allow Supabase and Demo types to be stored fully.
            if (ds.type === 'Supabase' || ds.type === 'LocalStorage (Demo)') {
                return ds;
            }
            // For all other DB types, redact the connection string for local storage.
            return { ...ds, connectionString: '' };
        });
        // Re-assign the value that will be stored.
        valueToStore = sanitizedDataSources as unknown as T;
    }

    // Common encryption and storage logic.
    const secret = await getOrCreateSecret();
    const jsonString = JSON.stringify(valueToStore);
    const encryptedValue = encrypt(jsonString, secret);
    await idbService.set(key, encryptedValue);
}

/**
 * Retrieves a configuration value strictly from local storage (IndexedDB).
 * @param key The key of the configuration to fetch.
 * @returns A promise that resolves with the configuration value, or null if not found.
 */
export const getConfigLocal = async <T>(key: string): Promise<T | null> => {
    const storedValue = await idbService.get<string>(key);
    if (!storedValue) return null;

    try {
        const secret = await getOrCreateSecret();
        const decryptedString = decrypt(storedValue, secret);
        return JSON.parse(decryptedString) as T;
    } catch(e) {
        console.error(`Failed to decrypt/parse key ${key} from IndexedDB`, e);
        return null;
    }
};

/**
 * Deletes a configuration value locally from IndexedDB.
 * @param key The key of the configuration to delete.
 */
export const deleteConfigLocal = async (key: string): Promise<void> => {
    await idbService.del(key);
};


export const getLocalTombstones = async (): Promise<DeletionTombstone[]> => {
    // Tombstones are not sensitive user data, so they are not encrypted.
    return await idbService.get<DeletionTombstone[]>(DELETION_TOMBSTONES_KEY) || [];
}

export const setLocalTombstones = async (tombstones: DeletionTombstone[]): Promise<void> => {
    await idbService.set(DELETION_TOMBSTONES_KEY, tombstones);
}


/**
 * Fetches all configurations scoped to the current context from the backend.
 * This is crucial for the sync mechanism to compare local vs. remote state.
 * @param apiConfig The instance-specific API configuration.
 * @param context The request context (department, owner).
 * @returns A promise that resolves with an object containing all configurations.
 */
export const getAllConfigs = async (apiConfig: ApiConfig, context?: RequestContext): Promise<AllConfigs> => {
    await migrateFromLocalStorageToIndexedDB();

    const emptyState: AllConfigs = {
        dashboards: [], cards: [], variables: [], dataSources: [],
        whiteLabelSettings: null, appSettings: null
    };
    const tenantId = apiConfig.TENANT_ID || null;

    // 1. Try Supabase first
    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            // Fetch department-specific configs (everything except appSettings)
            let deptQuery = supabase.from(SUPABASE_TABLE_NAME).select('key, value').not('key', 'eq', APP_SETTINGS_KEY);
            if (tenantId) deptQuery = deptQuery.eq('tenant_id', tenantId);
            if (context?.department) deptQuery = deptQuery.like('department', `${context.department}%`);
            const { data: deptData, error: deptError } = await deptQuery;
            if (deptError) throw deptError;

            // Fetch owner-specific config (appSettings)
            let ownerQuery = supabase.from(SUPABASE_TABLE_NAME).select('key, value').eq('key', APP_SETTINGS_KEY);
            if (tenantId) ownerQuery = ownerQuery.eq('tenant_id', tenantId);
            if (context?.owner) ownerQuery = ownerQuery.eq('owner', context.owner);
            const { data: ownerData, error: ownerError } = await ownerQuery;
            if (ownerError) throw ownerError;

            const combinedData = [...(deptData || []), ...(ownerData || [])];
            
            if (combinedData.length > 0) {
                const result: AllConfigs = { ...emptyState };
                combinedData.forEach(item => {
                    if (item.key.startsWith(DASHBOARD_CONFIG_PREFIX)) result.dashboards.push(item.value);
                    else if (item.key.startsWith(DASHBOARD_CARDS_PREFIX)) result.cards.push(...item.value);
                    else if (item.key.startsWith(DASHBOARD_VARIABLES_PREFIX)) result.variables.push(...item.value);
                    else if (item.key === DATA_SOURCES_KEY) result.dataSources = item.value;
                    else if (item.key === WHITE_LABEL_KEY) result.whiteLabelSettings = item.value;
                    else if (item.key === APP_SETTINGS_KEY) result.appSettings = item.value;
                });
                return result;
            }
        } catch (error) {
             console.warn(`Supabase getAllConfigs failed, falling back. Error:`, error);
        }
    }
    
    // 2. Fallback to custom API
    if (apiConfig.CONFIG_API_URL) {
        try {
            // Fetch department-level configs
            const deptUrl = apiConfig.CONFIG_API_URL;
            const deptHeaders: HeadersInit = {};
            if (apiConfig.TENANT_ID) deptHeaders['X-Tenant-Id'] = apiConfig.TENANT_ID;
            if (apiConfig.API_KEY) deptHeaders['api_key'] = apiConfig.API_KEY;
            if (apiConfig.API_SECRET) deptHeaders['api_secret'] = apiConfig.API_SECRET;
            if (context?.department) deptHeaders['X-Department'] = context.department;
            
            const deptResponse = await fetch(deptUrl, { headers: deptHeaders });

            let deptData = [];
            if (deptResponse.ok) {
                 deptData = await deptResponse.json();
            } else if (deptResponse.status !== 404) {
                throw new Error(`API returned status ${deptResponse.status}`);
            }

            // Fetch owner-level app settings
            const ownerUrl = `${apiConfig.CONFIG_API_URL}?key=${APP_SETTINGS_KEY}`;
            const ownerHeaders: HeadersInit = { ...deptHeaders };
            delete ownerHeaders['X-Department'];
            if (context?.owner) ownerHeaders['X-Owner'] = context.owner;

            const ownerResponse = await fetch(ownerUrl, { headers: ownerHeaders });
            let ownerAppSettings = null;
            if (ownerResponse.ok) {
                ownerAppSettings = await ownerResponse.json();
            }

            // Combine results, prioritizing owner-specific appSettings
            const result: AllConfigs = { ...emptyState };
            (deptData || []).forEach((item: any) => {
                if (item.key.startsWith(DASHBOARD_CONFIG_PREFIX)) result.dashboards.push(item.value);
                else if (item.key.startsWith(DASHBOARD_CARDS_PREFIX)) result.cards.push(...item.value);
                else if (item.key.startsWith(DASHBOARD_VARIABLES_PREFIX)) result.variables.push(...item.value);
                else if (item.key === DATA_SOURCES_KEY) result.dataSources = item.value;
                else if (item.key === WHITE_LABEL_KEY) result.whiteLabelSettings = item.value;
                else if (item.key === APP_SETTINGS_KEY && !ownerAppSettings) {
                     result.appSettings = item.value;
                }
            });
            if (ownerAppSettings) {
                result.appSettings = ownerAppSettings.value || ownerAppSettings;
            }
            return result;

        } catch (error) {
             console.warn(`API call to getAllConfigs failed, falling back to IndexedDB. Error:`, error);
        }
    }

    // 3. Fallback to local storage (now IndexedDB) if API fails or isn't configured
    console.log("getAllConfigs falling back to IndexedDB.");
    const allItems = await idbService.getAll();
    const localResult: AllConfigs = { ...emptyState };
    const secret = await getOrCreateSecret();

    for (const { key: appKey, value: storedValue } of allItems) {
        if (typeof storedValue !== 'string' || appKey === MIGRATION_KEY || appKey === DELETION_TOMBSTONES_KEY || appKey === SECRET_KEY) continue;
        
        try {
            const decryptedString = decrypt(storedValue, secret);
            const value = JSON.parse(decryptedString);

            if (appKey.startsWith(DASHBOARD_CONFIG_PREFIX)) localResult.dashboards.push(value);
            else if (appKey.startsWith(DASHBOARD_CARDS_PREFIX)) localResult.cards.push(...value);
            else if (appKey.startsWith(DASHBOARD_VARIABLES_PREFIX)) localResult.variables.push(...value);
            else if (appKey === DATA_SOURCES_KEY) localResult.dataSources = value;
            else if (appKey === WHITE_LABEL_KEY) localResult.whiteLabelSettings = value;
            else if (appKey === APP_SETTINGS_KEY) localResult.appSettings = value;
        } catch (e) {
            console.error(`Could not decrypt/parse key ${appKey} from IndexedDB`, e);
        }
    }
    return localResult;
};



/**
 * Fetches a specific configuration value by its key from the backend.
 * Falls back to IndexedDB on API failure for offline/demo support.
 * @param key The key of the configuration to fetch.
 * @param apiConfig The instance-specific API configuration.
 * @returns A promise that resolves with the configuration value, or null if not found.
 */
export const getConfig = async <T>(key: string, apiConfig: ApiConfig, context?: RequestContext): Promise<T | null> => {
    const isAppSettings = key === APP_SETTINGS_KEY;

    // 1. Try Supabase first
    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            let query = supabase.from(SUPABASE_TABLE_NAME).select('value').eq('key', key);
            const tenantId = apiConfig.TENANT_ID || null;
            if (tenantId) query = query.eq('tenant_id', tenantId);

            if (isAppSettings) {
                if (context?.owner) query = query.eq('owner', context.owner);
            } else {
                if (context?.department) query = query.eq('department', context.department);
            }
            
            const { data, error } = await query.maybeSingle();
            if (error) throw new Error(error.message);
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
            
            if (isAppSettings) {
                 if (context?.owner) headers['X-Owner'] = context.owner;
            } else {
                 if (context?.department) headers['X-Department'] = context.department;
            }
            
            const response = await fetch(url, { headers });

            if (!response.ok) {
                if(response.status === 404) return null;
                throw new Error(`API returned status ${response.status}`);
            }
            const responseData = await response.json();
            
            if (responseData && typeof responseData === 'object' && 'value' in responseData) {
                return responseData.value as T;
            }
            return responseData as T;
        } catch (error) {
            console.warn(`API call to getConfig failed, falling back to IndexedDB. Error:`, error);
        }
    }
    
    // 3. Fallback to IndexedDB.
    return getConfigLocal<T>(key);
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
            let query = supabase.from(SUPABASE_TABLE_NAME).select('value').like('key', `${prefix}%`);
            const tenantId = apiConfig.TENANT_ID || null;
            if (tenantId) query = query.eq('tenant_id', tenantId);
            // Prefixes are for dashboards/cards/variables which are department-specific
            if (context?.department) query = query.like('department', `${context.department}%`);

            const { data, error } = await query;
            if (error) throw new Error(error.message);
            return data ? data.map(item => item.value as T) : [];
        } catch (error) {
            console.warn(`Supabase getConfigsByPrefix failed, falling back. Error:`, error);
        }
    }

    // 2. Custom API
    if (apiConfig.CONFIG_API_URL) {
        try {
            const url = `${apiConfig.CONFIG_API_URL}?prefix=${encodeURIComponent(prefix)}`;
            const headers: HeadersInit = {};
            if (apiConfig.TENANT_ID) headers['X-Tenant-Id'] = apiConfig.TENANT_ID;
            if (apiConfig.API_KEY) headers['api_key'] = apiConfig.API_KEY;
            if (apiConfig.API_SECRET) headers['api_secret'] = apiConfig.API_SECRET;
            if (context?.department) headers['X-Department'] = context.department;
            
            const response = await fetch(url, { headers });
            if (!response.ok) {
                if(response.status === 404) return [];
                throw new Error(`API returned status ${response.status}`);
            }
            const res = await response.json();
            return res ? res.map((item: any) => item.value as T) : [];
        } catch (error) {
            console.warn(`API call for prefix failed, falling back to IndexedDB. Error:`, error);
        }
    }    

    // 3. Fallback to IndexedDB.
    const allItems = await idbService.getAll();
    const results: T[] = [];
    const secret = await getOrCreateSecret();

    for (const { key, value: storedValue } of allItems) {
        if (typeof key === 'string' && key.startsWith(prefix) && typeof storedValue === 'string') {
            try {
                const decryptedString = decrypt(storedValue, secret);
                results.push(JSON.parse(decryptedString));
            } catch (e) {
                 console.error(`Could not decrypt/parse key ${key} from IndexedDB`, e);
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
    const saveLocally = () => setConfigLocal(key, value);
    const isAppSettings = key === APP_SETTINGS_KEY;

    // 1. Try Supabase first
    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            const record = {
                key, value,
                tenant_id: apiConfig.TENANT_ID || null,
                department: !isAppSettings ? (context?.department || null) : null,
                owner: isAppSettings ? (context?.owner || null) : null,
                last_modified: new Date().toISOString(),
            };

            let selectQuery = supabase.from(SUPABASE_TABLE_NAME).select('id').eq('key', key);
            if (record.tenant_id) selectQuery = selectQuery.eq('tenant_id', record.tenant_id);

            if (isAppSettings) {
                if (record.owner) selectQuery = selectQuery.eq('owner', record.owner);
                else selectQuery = selectQuery.is('owner', null);
            } else {
                if (record.department) selectQuery = selectQuery.eq('department', record.department);
                else selectQuery = selectQuery.is('department', null);
            }

            const { data: existing, error: selectError } = await selectQuery.maybeSingle();
            if (selectError) throw selectError;

            const { error: finalError } = existing
                ? await supabase.from(SUPABASE_TABLE_NAME).update({ value: record.value, last_modified: record.last_modified }).eq('id', existing.id)
                : await supabase.from(SUPABASE_TABLE_NAME).insert(record);
            
            if (finalError) throw finalError;

            await saveLocally();
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
            
            if (isAppSettings) {
                 if (context?.owner) headers['X-Owner'] = context.owner;
            } else {
                 if (context?.department) headers['X-Department'] = context.department;
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
            
            await saveLocally();
            return 'remote';
        } catch (error) {
             console.error(`API call to setConfig failed. Error:`, error);
             throw error;
        }
    }

    // 3. Fallback for setups without a remote backend: still save locally.
    await saveLocally();
    return 'local';
};

/**
 * Deletes a configuration value from the backend and local storage.
 * @param key The key of the configuration to delete.
 * @param apiConfig The instance-specific API configuration.
 */
export const deleteConfig = async (key: string, apiConfig: ApiConfig, context?: RequestContext): Promise<'remote' | 'local'> => {
    await deleteConfigLocal(key);
    const isAppSettings = key === APP_SETTINGS_KEY;

    const supabase = await createSupabaseClient(apiConfig);
    if (supabase) {
        try {
            let query = supabase.from(SUPABASE_TABLE_NAME).delete().eq('key', key);
            const tenantId = apiConfig.TENANT_ID || null;
            if (tenantId) query = query.eq('tenant_id', tenantId);

            if (isAppSettings) {
                if (context?.owner) query = query.eq('owner', context.owner);
            } else {
                if (context?.department) query = query.eq('department', context.department);
            }

            const { error } = await query;
            if (error) throw error;
            return 'remote';
        } catch (error) {
            console.error(`Supabase deleteConfig failed. Error:`, error);
            throw error;
        }
    }

    if (apiConfig.CONFIG_API_URL) {
        try {
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (apiConfig.TENANT_ID) headers['X-Tenant-Id'] = apiConfig.TENANT_ID;
            if (apiConfig.API_KEY) headers['api_key'] = apiConfig.API_KEY;
            if (apiConfig.API_SECRET) headers['api_secret'] = apiConfig.API_SECRET;

            if (isAppSettings) {
                 if (context?.owner) headers['X-Owner'] = context.owner;
            } else {
                 if (context?.department) headers['X-Department'] = context.department;
            }
            
            const response = await fetch(apiConfig.CONFIG_API_URL, {
                method: 'DELETE',
                headers,
                body: JSON.stringify({ key }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API returned status ${response.status}: ${errorBody}`);
            }
            return 'remote';
        } catch(error) {
            console.error(`API call to deleteConfig failed. Error:`, error);
            throw error;
        }
    }
    
    return 'local';
};