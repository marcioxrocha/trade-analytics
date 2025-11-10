import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { ChartCardData, DataSource, Dashboard, AppContextType, Variable, DashboardFormattingSettings, WhiteLabelSettings, SaveStatus, ExportData } from '../types';
import { DATA_SOURCES_KEY, DASHBOARD_CARD_CONFIGS_KEY, DASHBOARDS_KEY, VARIABLES_KEY, WHITE_LABEL_KEY, DEFAULT_BRAND_COLOR, APP_SETTINGS_KEY, LAST_ACTIVE_DASHBOARD_ID_KEY } from '../constants';
import { getConfig, setConfig, setConfigLocal } from '../services/configService';
import { useLanguage } from './LanguageContext';
import { DEFAULT_FORMATTING_SETTINGS } from '../services/formattingService';
import { useApi } from './ApiContext';

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
    children: ReactNode;
    instanceKey?: string;
    department?: string;
    owner?: string;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children, instanceKey, department, owner }) => {
  // App State
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [dashboardCards, setDashboardCards] = useState<ChartCardData[]>([]);
  const [whiteLabelSettings, setWhiteLabelSettings] = useState<WhiteLabelSettings>({ brandColor: DEFAULT_BRAND_COLOR });
  const [isLoading, setIsLoading] = useState(true);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<SaveStatus>('idle');
  const [formattingVersion, setFormattingVersion] = useState(0);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  
  const { t, isReady: isLangReady } = useLanguage();
  const { apiConfig } = useApi();

  // Effect to load all data from persistence, runs only once.
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      
      const [loadedSources, loadedCards, loadedDashboards, loadedVariables, loadedWhiteLabel, loadedAppSettings] = await Promise.all([
        getConfig<DataSource[]>(DATA_SOURCES_KEY, apiConfig, { department, owner }),
        getConfig<ChartCardData[]>(DASHBOARD_CARD_CONFIGS_KEY, apiConfig, { department, owner }),
        getConfig<Dashboard[]>(DASHBOARDS_KEY, apiConfig, { department, owner }),
        getConfig<Variable[]>(VARIABLES_KEY, apiConfig, { department, owner }),
        getConfig<WhiteLabelSettings>(WHITE_LABEL_KEY, apiConfig, { department, owner }),
        getConfig<{ autoSave: boolean }>(APP_SETTINGS_KEY, apiConfig),
      ]);
      
      const safeFilter = <T,>(item: T | null | undefined): item is T => typeof item === 'object' && item !== null;

      setDataSources((loadedSources || []).filter(safeFilter));
      setDashboardCards((loadedCards || []).filter(safeFilter));
      
      // Fix: Explicitly type finalDashboards to ensure type safety.
      const finalDashboards: Dashboard[] = (loadedDashboards || [])
        .filter(safeFilter)
        .map(d => ({
        ...d,
        formattingSettings: d.formattingSettings || DEFAULT_FORMATTING_SETTINGS,
        saveStatus: 'idle',
      }));
      setDashboards(finalDashboards);
      
      setVariables((loadedVariables || []).filter(safeFilter));
      setWhiteLabelSettings(loadedWhiteLabel || { brandColor: DEFAULT_BRAND_COLOR });
      setAutoSaveEnabled(loadedAppSettings?.autoSave || false);
      
      if (finalDashboards.length > 0) {
        const lastActiveId = localStorage.getItem(LAST_ACTIVE_DASHBOARD_ID_KEY);
        const lastActiveDashboardExists = lastActiveId ? finalDashboards.some(d => d.id === lastActiveId) : false;
        
        if (lastActiveDashboardExists) {
            setActiveDashboardId(lastActiveId);
        } else {
            setActiveDashboardId(finalDashboards[0].id);
        }
      }
      
      setIsLoading(false);
      setSettingsSaveStatus('idle');
    };

    loadInitialData();
  }, [apiConfig, department, owner]);

  // Effect to create a default dashboard if none exist AFTER loading is complete AND translations are ready.
  useEffect(() => {
    if (!isLoading && dashboards.length === 0 && isLangReady) {
        const newName = t('dashboard.defaultNamePattern', { index: String(dashboards.length + 1) });
        const defaultDashboard: Dashboard = { 
            id: crypto.randomUUID(), 
            name: newName, 
            formattingSettings: DEFAULT_FORMATTING_SETTINGS,
            saveStatus: 'unsaved',
        };
        setDashboards([defaultDashboard]);
        setActiveDashboardId(defaultDashboard.id);
        setSettingsSaveStatus('unsaved'); // Adding a dashboard is a settings-level change
    }
  }, [isLoading, dashboards, t, isLangReady]);

    // Effect to persist the last viewed dashboard ID.
    useEffect(() => {
        // Don't save during the initial data load or if there's no active dashboard.
        if (!isLoading && activeDashboardId) {
            localStorage.setItem(LAST_ACTIVE_DASHBOARD_ID_KEY, activeDashboardId);
        }
    }, [activeDashboardId, isLoading]);


  const syncDashboards = useCallback(async (): Promise<void> => {
    const dashboardIdsToSync = dashboards
        .filter(d => ['unsaved', 'saved-local'].includes(d.saveStatus || 'idle'))
        .map(d => d.id);
    
    setDashboards(prev => prev.map(d => dashboardIdsToSync.includes(d.id) ? { ...d, saveStatus: 'syncing' } : d));

    try {
        await Promise.all([
            setConfig(DASHBOARDS_KEY, dashboards, apiConfig, { department, owner }),
            setConfig(DASHBOARD_CARD_CONFIGS_KEY, dashboardCards, apiConfig, { department, owner }),
            setConfig(VARIABLES_KEY, variables, apiConfig, { department, owner }),
        ]);
        setDashboards(prev => prev.map(d => dashboardIdsToSync.includes(d.id) ? { ...d, saveStatus: 'saved-remote' } : d));
    } catch (error) {
        console.error("Failed to sync dashboard changes with server:", error);
        setDashboards(prev => prev.map(d => dashboardIdsToSync.includes(d.id) ? { ...d, saveStatus: 'saved-local' } : d));
        throw new Error(t('modal.saveError')); // re-throw for UI
    }
  }, [dashboards, dashboardCards, variables, t, apiConfig, department, owner]);
  
  const syncSettings = useCallback(async (): Promise<void> => {
    setSettingsSaveStatus('syncing');
    try {
        await Promise.all([
            setConfig(DATA_SOURCES_KEY, dataSources, apiConfig, { department, owner }),
            setConfig(WHITE_LABEL_KEY, whiteLabelSettings, apiConfig, { department, owner }),
            setConfig(APP_SETTINGS_KEY, { autoSave: autoSaveEnabled }, apiConfig),
            // Sync dashboards array as it's a setting, but don't alter individual save statuses
            setConfig(DASHBOARDS_KEY, dashboards, apiConfig, { department, owner }),
        ]);
        setSettingsSaveStatus('saved-remote');
    } catch (error) {
        console.error("Failed to sync settings changes with server:", error);
        setSettingsSaveStatus('saved-local');
        throw new Error(t('modal.saveError'));
    }
  }, [dataSources, whiteLabelSettings, autoSaveEnabled, dashboards, t, apiConfig, department, owner]);

  const saveToLocal = useCallback(() => {
    try {
        setConfigLocal(DATA_SOURCES_KEY, dataSources);
        setConfigLocal(DASHBOARDS_KEY, dashboards);
        setConfigLocal(DASHBOARD_CARD_CONFIGS_KEY, dashboardCards);
        setConfigLocal(VARIABLES_KEY, variables);
        setConfigLocal(WHITE_LABEL_KEY, whiteLabelSettings);
        setConfigLocal(APP_SETTINGS_KEY, { autoSave: autoSaveEnabled });
    } catch (error) {
        console.error("Failed to save changes to local storage:", error);
        throw error;
    }
  }, [dataSources, dashboards, dashboardCards, variables, whiteLabelSettings, autoSaveEnabled]);

  // Auto-save effect
  useEffect(() => {
    const needsDashboardSave = dashboards.some(d => d.saveStatus === 'unsaved');
    const needsSettingsSave = settingsSaveStatus === 'unsaved';

    if (!autoSaveEnabled || (!needsDashboardSave && !needsSettingsSave)) {
        return;
    }

    const timer = setTimeout(() => {
        if(needsDashboardSave) {
            setDashboards(prev => prev.map(d => d.saveStatus === 'unsaved' ? { ...d, saveStatus: 'saving-local' } : d));
        }
        if (needsSettingsSave) {
            setSettingsSaveStatus('saving-local');
        }

        try {
            saveToLocal();
            if(needsDashboardSave) {
                setDashboards(prev => prev.map(d => d.saveStatus === 'saving-local' ? { ...d, saveStatus: 'saved-local' } : d));
            }
            if (needsSettingsSave) {
                setSettingsSaveStatus('saved-local');
            }
        } catch (error) {
            console.error("Auto-save to local storage failed:", error);
            if(needsDashboardSave) {
                 setDashboards(prev => prev.map(d => d.saveStatus === 'saving-local' ? { ...d, saveStatus: 'unsaved' } : d));
            }
            if (needsSettingsSave) {
                setSettingsSaveStatus('unsaved');
            }
        }
    }, 1500);

    return () => clearTimeout(timer);
  }, [dashboards, settingsSaveStatus, autoSaveEnabled, saveToLocal]);

  const setDashboardUnsaved = useCallback((dashboardId: string | null) => {
    if (!dashboardId) return;
    setDashboards(prev => prev.map(d => d.id === dashboardId ? { ...d, saveStatus: 'unsaved' } : d));
  }, []);

  const addDataSource = useCallback((newSource: Omit<DataSource, 'id'>) => {
    const newSourceWithId: DataSource = { ...newSource, id: crypto.randomUUID() };
    setDataSources(prev => [...prev, newSourceWithId]);
    setSettingsSaveStatus('unsaved');
  }, []);

  const updateDataSource = useCallback((updatedSource: DataSource) => {
    setDataSources(prev => prev.map(source => source.id === updatedSource.id ? updatedSource : source));
    setSettingsSaveStatus('unsaved');
  }, []);

  const removeDataSource = useCallback((id: string) => {
    setDataSources(prev => prev.filter(source => source.id !== id));
    setSettingsSaveStatus('unsaved');
  }, []);

  const addDashboard = useCallback((name: string) => {
    const newDashboard: Dashboard = { 
        name, 
        id: crypto.randomUUID(), 
        formattingSettings: DEFAULT_FORMATTING_SETTINGS,
        saveStatus: 'unsaved'
    };
    setDashboards(prev => [...prev, newDashboard]);
    setActiveDashboardId(newDashboard.id);
    setSettingsSaveStatus('unsaved'); // The list of dashboards is a setting
  }, []);

  const duplicateDashboard = useCallback((dashboardId: string, newName: string) => {
    const originalDashboard = dashboards.find(d => d.id === dashboardId);
    if (!originalDashboard) return;

    const newDashboard: Dashboard = {
      ...originalDashboard,
      id: crypto.randomUUID(),
      name: newName,
      saveStatus: 'unsaved'
    };
    const originalCards = dashboardCards.filter(c => c.dashboardId === dashboardId);
    const newCards = originalCards.map(card => ({ ...card, id: crypto.randomUUID(), dashboardId: newDashboard.id }));
    const originalVariables = variables.filter(v => v.dashboardId === dashboardId);
    const newVariables = originalVariables.map(variable => ({ ...variable, id: crypto.randomUUID(), dashboardId: newDashboard.id }));

    setDashboards(prev => [...prev, newDashboard]);
    setDashboardCards(prev => [...prev, ...newCards]);
    setVariables(prev => [...prev, ...newVariables]);
    setActiveDashboardId(newDashboard.id);
    setSettingsSaveStatus('unsaved'); // List of dashboards changed
  }, [dashboards, dashboardCards, variables]);

  const removeDashboard = useCallback((id: string) => {
    setDashboards(prevDashboards => {
        const updatedDashboards = prevDashboards.filter(d => d.id !== id);
        if (activeDashboardId === id) {
          const newActiveId = updatedDashboards[0]?.id || null;
          setActiveDashboardId(newActiveId);
          // If all dashboards are removed, clear the last active ID from storage
          if (!newActiveId) {
              localStorage.removeItem(LAST_ACTIVE_DASHBOARD_ID_KEY);
          }
        }
        return updatedDashboards;
    });
    setDashboardCards(prev => prev.filter(c => c.dashboardId !== id));
    setVariables(prev => prev.filter(v => v.dashboardId !== id));
    setSettingsSaveStatus('unsaved');
  }, [activeDashboardId]);

  const updateDashboardName = useCallback((id: string, newName: string) => {
    setDashboards(prev => prev.map(d => 
        d.id === id ? { ...d, name: newName, saveStatus: 'unsaved' } : d
    ));
  }, []);
  
  const updateActiveDashboardSettings = useCallback((settings: DashboardFormattingSettings) => {
      setDashboards(prev => prev.map(d => 
          d.id === activeDashboardId ? { ...d, formattingSettings: settings, saveStatus: 'unsaved' } : d
      ));
      setFormattingVersion(v => v + 1);
  }, [activeDashboardId]);


  const updateWhiteLabelSettings = useCallback((settings: WhiteLabelSettings) => {
    setWhiteLabelSettings(settings);
    setSettingsSaveStatus('unsaved');
  }, []);

  const addCard = useCallback((newCard: Omit<ChartCardData, 'id'>) => {
    const newCardWithId: ChartCardData = { ...newCard, id: crypto.randomUUID() };
    setDashboardCards(prev => [...prev, newCardWithId]);
    setDashboardUnsaved(newCard.dashboardId);
  }, [setDashboardUnsaved]);

  const cloneCard = useCallback((cardId: string) => {
    const cardToClone = dashboardCards.find(c => c.id === cardId);
    if (!cardToClone) return;

    const newCard: ChartCardData = { ...cardToClone, id: crypto.randomUUID(), title: `${cardToClone.title} - Copy` };
    
    setDashboardCards(prev => {
      const originalIndex = prev.findIndex(c => c.id === cardId);
      if (originalIndex === -1) return [...prev, newCard];
      const newCards = [...prev];
      newCards.splice(originalIndex + 1, 0, newCard);
      return newCards;
    });
    setDashboardUnsaved(cardToClone.dashboardId);
  }, [dashboardCards, setDashboardUnsaved]);

  const updateCard = useCallback((updatedCard: ChartCardData) => {
    setDashboardCards(prev => prev.map(card => card.id === updatedCard.id ? updatedCard : card));
    setDashboardUnsaved(updatedCard.dashboardId);
  }, [setDashboardUnsaved]);

  const removeCard = useCallback((id: string) => {
    const cardToRemove = dashboardCards.find(c => c.id === id);
    if (cardToRemove) {
      setDashboardCards(prev => prev.filter(card => card.id !== id));
      setDashboardUnsaved(cardToRemove.dashboardId);
    }
  }, [dashboardCards, setDashboardUnsaved]);

  const reorderDashboardCards = useCallback((dashboardId: string, orderedCardIds: string[]) => {
    setDashboardCards(prevCards => {
        const cardsForOtherDashboards = prevCards.filter(c => c.dashboardId !== dashboardId);
        const cardsForThisDashboard = prevCards.filter(c => c.dashboardId === dashboardId);
        const cardMap = new Map(cardsForThisDashboard.map(c => [c.id, c]));
        const orderedCards = orderedCardIds.map(id => cardMap.get(id)).filter((c): c is ChartCardData => !!c);
        if (orderedCards.length !== cardsForThisDashboard.length) return prevCards;
        return [...cardsForOtherDashboards, ...orderedCards];
    });
    setDashboardUnsaved(dashboardId);
  }, [setDashboardUnsaved]);
  
  const addVariable = useCallback((newVariable: Omit<Variable, 'id'>) => {
    const newVarWithId: Variable = { ...newVariable, id: crypto.randomUUID() };
    setVariables(prev => [...prev, newVarWithId]);
    setDashboardUnsaved(newVariable.dashboardId);
  }, [setDashboardUnsaved]);
  
  const updateVariable = useCallback((updatedVariable: Variable) => {
    setVariables(prev => prev.map(v => v.id === updatedVariable.id ? updatedVariable : v));
    setDashboardUnsaved(updatedVariable.dashboardId);
  }, [setDashboardUnsaved]);

  const removeVariable = useCallback((id: string) => {
    const variableToRemove = variables.find(v => v.id === id);
    if (variableToRemove) {
        setVariables(prev => prev.filter(v => v.id !== id));
        setDashboardUnsaved(variableToRemove.dashboardId);
    }
  }, [variables, setDashboardUnsaved]);

  const updateAllVariables = useCallback((dashboardId: string, variablesForDashboard: Variable[]) => {
    if (!dashboardId) return;

    setVariables(currentVariables => {
        const otherVars = currentVariables.filter(v => v.dashboardId !== dashboardId);
        return [...otherVars, ...variablesForDashboard];
    });

    setDashboardUnsaved(dashboardId);
}, [setDashboardUnsaved]);

  const exportDashboards = useCallback((dashboardIds: string[]) => {
    const dataToExport: ExportData = {
        metadata: {
            version: 1,
            exportedAt: new Date().toISOString(),
        },
        dashboards: dashboards.filter(d => dashboardIds.includes(d.id)).map(d => ({ ...d, saveStatus: 'idle' })),
        cards: dashboardCards.filter(c => dashboardIds.includes(c.dashboardId)),
        variables: variables.filter(v => dashboardIds.includes(v.dashboardId)),
    };

    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    a.href = url;
    a.download = `analytics_builder_export_dashboards_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  }, [dashboards, dashboardCards, variables]);

  const importDashboards = useCallback((data: ExportData, selectedDashboardsFromFile: Dashboard[]) => {
    const idMap = new Map<string, string>();
    const newDashboards: Dashboard[] = [];
    const newCards: ChartCardData[] = [];
    const newVariables: Variable[] = [];

    selectedDashboardsFromFile.forEach(dashboardFromFile => {
        const oldId = dashboardFromFile.id;
        const newId = crypto.randomUUID();
        idMap.set(oldId, newId);

        newDashboards.push({
            ...dashboardFromFile,
            id: newId,
            name: `${dashboardFromFile.name} (Importado)`,
            saveStatus: 'unsaved',
        });
    });

    data.cards?.forEach(card => {
        if (idMap.has(card.dashboardId)) {
            newCards.push({
                ...card,
                id: crypto.randomUUID(),
                dashboardId: idMap.get(card.dashboardId)!,
            });
        }
    });
    
    data.variables?.forEach(variable => {
         if (idMap.has(variable.dashboardId)) {
            newVariables.push({
                ...variable,
                id: crypto.randomUUID(),
                dashboardId: idMap.get(variable.dashboardId)!,
            });
        }
    });
    
    setDashboards(prev => [...prev, ...newDashboards]);
    setDashboardCards(prev => [...prev, ...newCards]);
    setVariables(prev => [...prev, ...newVariables]);
    setSettingsSaveStatus('unsaved'); // The list of dashboards is a setting
  }, []);
  
  const exportDataSources = useCallback((dataSourceIds: string[]) => {
    const dataToExport: ExportData = {
        metadata: {
            version: 1,
            exportedAt: new Date().toISOString(),
        },
        dataSources: dataSources.filter(ds => dataSourceIds.includes(ds.id)),
    };

    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    a.href = url;
    a.download = `analytics_builder_export_datasources_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [dataSources]);

  const importDataSources = useCallback((data: ExportData, selectedDataSourcesFromFile: DataSource[]) => {
    if (!data.dataSources) return;

    const newDataSources: DataSource[] = [];
    selectedDataSourcesFromFile.forEach(dsFromFile => {
        newDataSources.push({
            ...dsFromFile,
            id: crypto.randomUUID(),
        });
    });
    
    setDataSources(prev => [...prev, ...newDataSources]);
    setSettingsSaveStatus('unsaved');
  }, []);

  const memoizedSetActiveDashboardId = useCallback((id: string) => {
    setActiveDashboardId(id);
  }, []);

   const toggleAutoSave = useCallback(() => {
      const newValue = !autoSaveEnabled;
      setAutoSaveEnabled(newValue);
      setSettingsSaveStatus('unsaved');
  }, [autoSaveEnabled]);

  const value = useMemo(() => ({
    dataSources,
    dashboards,
    variables,
    activeDashboardId,
    dashboardCards,
    whiteLabelSettings,
    addDataSource,
    updateDataSource,
    removeDataSource,
    addDashboard,
    duplicateDashboard,
    removeDashboard,
    setActiveDashboardId: memoizedSetActiveDashboardId,
    updateDashboardName,
    updateActiveDashboardSettings,
    updateWhiteLabelSettings,
    addCard,
    cloneCard,
    updateCard,
    removeCard,
    reorderDashboardCards,
    addVariable,
    updateVariable,
    removeVariable,
    updateAllVariables,
    exportDashboards,
    importDashboards,
    exportDataSources,
    importDataSources,
    isLoading,
    settingsSaveStatus,
    syncDashboards,
    syncSettings,
    autoSaveEnabled,
    toggleAutoSave,
    formattingVersion,
    apiConfig,
    instanceKey,
    department,
    owner,
  }), [
    dataSources, dashboards, variables, activeDashboardId, dashboardCards, whiteLabelSettings,
    addDataSource, updateDataSource, removeDataSource, addDashboard, duplicateDashboard, removeDashboard, 
    memoizedSetActiveDashboardId, updateDashboardName, updateActiveDashboardSettings, updateWhiteLabelSettings, addCard, 
    cloneCard, updateCard, removeCard, reorderDashboardCards, addVariable, updateVariable, removeVariable,
    updateAllVariables, exportDashboards, importDashboards, exportDataSources, importDataSources, isLoading, settingsSaveStatus, syncDashboards, syncSettings, autoSaveEnabled, toggleAutoSave, formattingVersion,
    apiConfig, instanceKey, department, owner
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};