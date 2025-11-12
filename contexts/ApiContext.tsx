import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { getApiConfig } from '../services/apiConfig';
import { ApiConfig } from '../types';

/**
 * This context is designed to provide a centralized API configuration
 * throughout the application for a specific instance.
 */

interface ApiContextType {
  apiConfig: ApiConfig;
  instanceKey?: string;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

interface ApiProviderProps {
  children: ReactNode;
  instanceKey?: string;
}

/**
 * ApiProvider fetches the API configuration based on an instanceKey
 * and makes it available to all descendant components.
 * It should wrap any component tree that needs access to the API configuration,
 * for example, wrapping the AppProvider.
 */
export const ApiProvider: React.FC<ApiProviderProps> = ({ children, instanceKey }) => {
  const apiConfig = useMemo(() => getApiConfig(instanceKey), [instanceKey]);

  const value = useMemo(() => ({
    apiConfig,
    instanceKey
  }), [apiConfig, instanceKey]);

  return (
    <ApiContext.Provider value={value}>
      {children}
    </ApiContext.Provider>
  );
};

/**
 * Custom hook to consume the ApiContext.
 * Provides easy access to the apiConfig and instanceKey.
 *
 * Example Usage:
 * const { apiConfig } = useApi();
 */
export const useApi = (): ApiContextType => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};
