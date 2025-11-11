import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { ChartCardData, DataSource, Dashboard, AppContextType, Variable, DashboardFormattingSettings, WhiteLabelSettings, SaveStatus, ExportData } from '../types';
import { DATA_SOURCES_KEY, WHITE_LABEL_KEY, DEFAULT_BRAND_COLOR, APP_SETTINGS_KEY, LAST_ACTIVE_DASHBOARD_ID_KEY, DASHBOARD_CONFIG_PREFIX, DASHBOARD_CARDS_PREFIX, DASHBOARD_VARIABLES_PREFIX, OLD_DASHBOARDS_KEY, OLD_CARDS_KEY, OLD_VARIABLES_KEY } from '../constants';
import { getConfig, setConfig, setConfigLocal, getConfigsByPrefix, deleteConfig, deleteConfigLocal } from '../services/configService';
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
  const [deletedDashboardIds, setDeletedDashboardIds] = useState<string[]>([]);
  
  const { t, isReady: isLangReady } = useLanguage();
  const { apiConfig } = useApi();

  const hasUnsyncedChanges = useMemo(() => {
    const hasUnsyncedDashboards = dashboards.some(d => ['unsaved', 'saved-local'].includes(d.saveStatus || 'idle'));
    const hasUnsyncedSettings = ['unsaved', 'saved-local'].includes(settingsSaveStatus);
    return hasUnsyncedDashboards || hasUnsyncedSettings || deletedDashboardIds.length > 0;
  }, [dashboards, settingsSaveStatus, deletedDashboardIds]);

  // Effect to load all data from persistence, runs only once.
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      const context = { department, owner };
      const safeFilter = <T,>(item: T | null | undefined): item is T => !!item;
      
      const [loadedSources, loadedWhiteLabel, loadedAppSettings] = await Promise.all([
        getConfig<DataSource[]>(DATA_SOURCES_KEY, apiConfig, context),
        getConfig<WhiteLabelSettings>(WHITE_LABEL_KEY, apiConfig, context),
        getConfig<{ autoSave: boolean }>(APP_SETTINGS_KEY, apiConfig),
      ]);
      
      // --- Start of Backward Compatibility Logic ---
      
      let loadedDashboards: Dashboard[] = [];
      let allCards: ChartCardData[] = [];
      let allVariables: Variable[] = [];

      // 1. Try loading with the new granular format first.
      const granularDashboards = (await getConfigsByPrefix<Dashboard>(DASHBOARD_CONFIG_PREFIX, apiConfig, context)).filter(safeFilter);

      if (granularDashboards.length > 0) {
        // Granular format found. Load cards and variables granularly.
        const loadedCardArrays = await getConfigsByPrefix<ChartCardData[]>(DASHBOARD_CARDS_PREFIX, apiConfig, context);
        const loadedVariableArrays = await getConfigsByPrefix<Variable[]>(DASHBOARD_VARIABLES_PREFIX, apiConfig, context);
        
        loadedDashboards = granularDashboards;
        allCards = loadedCardArrays.flat().filter(safeFilter);
        allVariables = loadedVariableArrays.flat().filter(safeFilter);

      } else {
        // 2. If no granular dashboards, check for the old monolithic format.
        console.log("No granular dashboards found. Checking for legacy monolithic format...");
        const [
          legacyDashboards,
          legacyCards,
          legacyVariables,
        ] = await Promise.all([
          getConfig<Dashboard[]>(OLD_DASHBOARDS_KEY, apiConfig, context),
          getConfig<ChartCardData[]>(OLD_CARDS_KEY, apiConfig, context),
          getConfig<Variable[]>(OLD_VARIABLES_KEY, apiConfig, context),
        ]);

        if (legacyDashboards && legacyDashboards.length > 0) {
            console.log(`Found ${legacyDashboards.length} legacy dashboards. They will be migrated on the next sync.`);
            // Mark all legacy dashboards as unsaved to trigger migration on the next sync.
            loadedDashboards = legacyDashboards.map(d => ({ ...d, saveStatus: 'unsaved' }));
            allCards = (legacyCards || []).filter(safeFilter);
            allVariables = (legacyVariables || []).filter(safeFilter);
        }
      }
      
      // --- End of Backward Compatibility Logic ---

      setDataSources((loadedSources || []).filter(safeFilter));
      setWhiteLabelSettings(loadedWhiteLabel || { brandColor: DEFAULT_BRAND_COLOR });
      setAutoSaveEnabled(loadedAppSettings?.autoSave || false);
      
      const finalDashboards: Dashboard[] = loadedDashboards
        .map(d => ({
        ...d,
        formattingSettings: d.formattingSettings || DEFAULT_FORMATTING_SETTINGS,
        // If saveStatus is not already set (by migration logic), default to 'idle'.
        saveStatus: d.saveStatus || 'idle',
      }));

      setDashboards(finalDashboards);
      setDashboardCards(allCards);
      setVariables(allVariables);
      
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
    }
  }, [isLoading, dashboards, t, isLangReady]);

    // Effect to persist the last viewed dashboard ID.
    useEffect(() => {
        // Don't save during the initial data load or if there's no active dashboard.
        if (!isLoading && activeDashboardId) {
            localStorage.setItem(LAST_ACTIVE_DASHBOARD_ID_KEY, activeDashboardId);
        }
    }, [activeDashboardId, isLoading]);


  const syncAllChanges = useCallback(async (): Promise<void> => {
    const dashboardsToSync = dashboards.filter(d => ['unsaved', 'saved-local'].includes(d.saveStatus || 'idle'));
    const isSettingsSyncNeeded = ['unsaved', 'saved-local'].includes(settingsSaveStatus);
    const context = { department, owner };

    if (dashboardsToSync.length === 0 && deletedDashboardIds.length === 0 && !isSettingsSyncNeeded) {
        return;
    }

    setDashboards(prev => prev.map(d => dashboardsToSync.some(ds => ds.id === d.id) ? { ...d, saveStatus: 'syncing' } : d));
    if (isSettingsSyncNeeded) setSettingsSaveStatus('syncing');

    const promises: Promise<any>[] = [];

    // 1. Sync updated/new dashboards and their children
    dashboardsToSync.forEach(d => {
        const cards = dashboardCards.filter(c => c.dashboardId === d.id);
        const vars = variables.filter(v => v.dashboardId === d.id);
        
        promises.push(setConfig(`${DASHBOARD_CONFIG_PREFIX}${d.id}`, d, apiConfig, context));
        promises.push(setConfig(`${DASHBOARD_CARDS_PREFIX}${d.id}`, cards, apiConfig, context));
        promises.push(setConfig(`${DASHBOARD_VARIABLES_PREFIX}${d.id}`, vars, apiConfig, context));
    });

    // 2. Sync deleted dashboards
    deletedDashboardIds.forEach(id => {
        promises.push(deleteConfig(`${DASHBOARD_CONFIG_PREFIX}${id}`, apiConfig, context));
        promises.push(deleteConfig(`${DASHBOARD_CARDS_PREFIX}${id}`, apiConfig, context));
        promises.push(deleteConfig(`${DASHBOARD_VARIABLES_PREFIX}${id}`, apiConfig, context));
    });

    // 3. Sync global settings if needed
    if (isSettingsSyncNeeded) {
        promises.push(setConfig(DATA_SOURCES_KEY, dataSources, apiConfig, context));
        promises.push(setConfig(WHITE_LABEL_KEY, whiteLabelSettings, apiConfig, context));
        promises.push(setConfig(APP_SETTINGS_KEY, { autoSave: autoSaveEnabled }, apiConfig));
    }

    try {
        await Promise.all(promises);
        
        // Success: Update statuses and clean up
        setDashboards(prev => prev.map(d => dashboardsToSync.some(ds => ds.id === d.id) ? { ...d, saveStatus: 'saved-remote' } : d));
        if (isSettingsSyncNeeded) setSettingsSaveStatus('saved-remote');
        
        if (deletedDashboardIds.length > 0) {
            setDashboardCards(prev => prev.filter(c => !deletedDashboardIds.includes(c.dashboardId)));
            setVariables(prev => prev.filter(v => !deletedDashboardIds.includes(v.dashboardId)));
            setDeletedDashboardIds([]);
        }

    } catch (error) {
        console.error("Failed to sync all changes with server:", error);
        setDashboards(prev => prev.map(d => dashboardsToSync.some(ds => ds.id === d.id) ? { ...d, saveStatus: 'saved-local' } : d));
        if (isSettingsSyncNeeded) setSettingsSaveStatus('saved-local');
        throw new Error(t('modal.saveError'));
    }
  }, [
      dashboards, dashboardCards, variables, settingsSaveStatus, deletedDashboardIds,
      dataSources, whiteLabelSettings, autoSaveEnabled, apiConfig, department, owner, t
  ]);
  
  const syncDashboards = syncAllChanges;
  const syncSettings = syncAllChanges;
  
  const saveToLocal = useCallback(() => {
    try {
        const dashboardsToSave = dashboards.filter(d => d.saveStatus === 'unsaved');
        const settingsToSave = settingsSaveStatus === 'unsaved';

        // Global settings
        if(settingsToSave) {
            setConfigLocal(DATA_SOURCES_KEY, dataSources);
            setConfigLocal(WHITE_LABEL_KEY, whiteLabelSettings);
            setConfigLocal(APP_SETTINGS_KEY, { autoSave: autoSaveEnabled });
        }

        // Granular dashboard settings
        dashboardsToSave.forEach(d => {
            const cards = dashboardCards.filter(c => c.dashboardId === d.id);
            const vars = variables.filter(v => v.dashboardId === d.id);
            setConfigLocal(`${DASHBOARD_CONFIG_PREFIX}${d.id}`, d);
            setConfigLocal(`${DASHBOARD_CARDS_PREFIX}${d.id}`, cards);
            setConfigLocal(`${DASHBOARD_VARIABLES_PREFIX}${d.id}`, vars);
        });
        
        // Handle local deletions
        deletedDashboardIds.forEach(id => {
            deleteConfigLocal(`${DASHBOARD_CONFIG_PREFIX}${id}`);
            deleteConfigLocal(`${DASHBOARD_CARDS_PREFIX}${id}`);
            deleteConfigLocal(`${DASHBOARD_VARIABLES_PREFIX}${id}`);
        });
        if (deletedDashboardIds.length > 0) {
            setDeletedDashboardIds([]);
        }

    } catch (error) {
        console.error("Failed to save changes to local storage:", error);
        throw error;
    }
  }, [dataSources, dashboards, dashboardCards, variables, whiteLabelSettings, autoSaveEnabled, settingsSaveStatus, deletedDashboardIds]);

  // Auto-save effect
  useEffect(() => {
    const needsSave = dashboards.some(d => d.saveStatus === 'unsaved') || settingsSaveStatus === 'unsaved' || deletedDashboardIds.length > 0;

    if (!autoSaveEnabled || !needsSave) {
        return;
    }

    const timer = setTimeout(() => {
        setDashboards(prev => prev.map(d => d.saveStatus === 'unsaved' ? { ...d, saveStatus: 'saving-local' } : d));
        if (settingsSaveStatus === 'unsaved') setSettingsSaveStatus('saving-local');

        try {
            saveToLocal();
            setDashboards(prev => prev.map(d => d.saveStatus === 'saving-local' ? { ...d, saveStatus: 'saved-local' } : d));
            if (settingsSaveStatus === 'saving-local') setSettingsSaveStatus('saved-local');
        } catch (error) {
            console.error("Auto-save to local storage failed:", error);
            setDashboards(prev => prev.map(d => d.saveStatus === 'saving-local' ? { ...d, saveStatus: 'unsaved' } : d));
            if (settingsSaveStatus === 'saving-local') setSettingsSaveStatus('unsaved');
        }
    }, 1500);

    return () => clearTimeout(timer);
  }, [dashboards, settingsSaveStatus, deletedDashboardIds, autoSaveEnabled, saveToLocal]);

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
  }, [dashboards, dashboardCards, variables]);

  const removeDashboard = useCallback((id: string) => {
    setDashboards(prevDashboards => {
        const updatedDashboards = prevDashboards.filter(d => d.id !== id);
        if (activeDashboardId === id) {
          const newActiveId = updatedDashboards[0]?.id || null;
          setActiveDashboardId(newActiveId);
          if (!newActiveId) {
              localStorage.removeItem(LAST_ACTIVE_DASHBOARD_ID_KEY);
          }
        }
        return updatedDashboards;
    });
    setDeletedDashboardIds(prev => [...new Set([...prev, id])]);
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
    const cardsToExport = dashboardCards.filter(c => dashboardIds.includes(c.dashboardId));
    const requiredDataSourceIds = [...new Set(cardsToExport.map(c => c.dataSourceId))];
    const dataSourcesToExport = dataSources.filter(ds => requiredDataSourceIds.includes(ds.id));

    const dataToExport: ExportData = {
        metadata: {
            version: 1,
            exportedAt: new Date().toISOString(),
        },
        dashboards: dashboards.filter(d => dashboardIds.includes(d.id)).map(d => ({ ...d, saveStatus: 'idle' })),
        cards: cardsToExport,
        variables: variables.filter(v => dashboardIds.includes(v.dashboardId)),
        dataSources: dataSourcesToExport,
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
  }, [dashboards, dashboardCards, variables, dataSources]);

  const importDashboards = useCallback((data: ExportData, selectedDashboardsFromFile: Dashboard[]) => {
    const dataSourceIdMap = new Map<string, string>();
    const newDataSources: DataSource[] = [];
    const allDataSourceNames = new Set(dataSources.map(ds => ds.name));

    data.dataSources?.forEach(dsFromFile => {
        if (allDataSourceNames.has(dsFromFile.name)) {
            const existingDS = dataSources.find(ds => ds.name === dsFromFile.name);
            if (existingDS) {
                dataSourceIdMap.set(dsFromFile.id, existingDS.id);
            }
        } else {
            const oldId = dsFromFile.id;
            const newId = crypto.randomUUID();
            dataSourceIdMap.set(oldId, newId);
            newDataSources.push({
                ...dsFromFile,
                id: newId,
            });
            allDataSourceNames.add(dsFromFile.name); // Handle duplicates within the import file
        }
    });

    const dashboardIdMap = new Map<string, string>();
    const newDashboards: Dashboard[] = [];
    const newCards: ChartCardData[] = [];
    const newVariables: Variable[] = [];

    const allDashboardNames = new Set(dashboards.map(d => d.name));

    selectedDashboardsFromFile.forEach(dashboardFromFile => {
        const oldId = dashboardFromFile.id;
        const newId = crypto.randomUUID();
        dashboardIdMap.set(oldId, newId);
        
        let newName = dashboardFromFile.name;
        if (allDashboardNames.has(newName)) {
            let copyIndex = 1;
            while (allDashboardNames.has(`${dashboardFromFile.name} (${copyIndex})`)) {
                copyIndex++;
            }
            newName = `${dashboardFromFile.name} (${copyIndex})`;
        }
        allDashboardNames.add(newName); // Handle duplicates within the import file

        newDashboards.push({
            ...dashboardFromFile,
            id: newId,
            name: newName,
            saveStatus: 'unsaved',
        });
    });

    data.cards?.forEach(card => {
        if (dashboardIdMap.has(card.dashboardId)) {
            const oldDataSourceId = card.dataSourceId;
            const newDataSourceId = dataSourceIdMap.get(oldDataSourceId) || oldDataSourceId;

            newCards.push({
                ...card,
                id: crypto.randomUUID(),
                dashboardId: dashboardIdMap.get(card.dashboardId)!,
                dataSourceId: newDataSourceId,
            });
        }
    });
    
    data.variables?.forEach(variable => {
         if (dashboardIdMap.has(variable.dashboardId)) {
            newVariables.push({
                ...variable,
                id: crypto.randomUUID(),
                dashboardId: dashboardIdMap.get(variable.dashboardId)!,
            });
        }
    });
    
    setDataSources(prev => [...prev, ...newDataSources]);
    setDashboards(prev => [...prev, ...newDashboards]);
    setDashboardCards(prev => [...prev, ...newCards]);
    setVariables(prev => [...prev, ...newVariables]);
    setSettingsSaveStatus('unsaved');
  }, [dataSources, dashboards]);
  
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

    const allDataSourceNames = new Set(dataSources.map(ds => ds.name));
    const newDataSources: DataSource[] = [];

    selectedDataSourcesFromFile.forEach(dsFromFile => {
        let newName = dsFromFile.name;
        if (allDataSourceNames.has(newName)) {
            let copyIndex = 1;
            while(allDataSourceNames.has(`${dsFromFile.name} (${copyIndex})`)) {
                copyIndex++;
            }
            newName = `${dsFromFile.name} (${copyIndex})`;
        }
        allDataSourceNames.add(newName);

        newDataSources.push({
            ...dsFromFile,
            id: crypto.randomUUID(),
            name: newName,
        });
    });
    
    setDataSources(prev => [...prev, ...newDataSources]);
    setSettingsSaveStatus('unsaved');
  }, [dataSources]);

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
    hasUnsyncedChanges,
  }), [
    dataSources, dashboards, variables, activeDashboardId, dashboardCards, whiteLabelSettings,
    addDataSource, updateDataSource, removeDataSource, addDashboard, duplicateDashboard, removeDashboard, 
    memoizedSetActiveDashboardId, updateDashboardName, updateActiveDashboardSettings, updateWhiteLabelSettings, addCard, 
    cloneCard, updateCard, removeCard, reorderDashboardCards, addVariable, updateVariable, removeVariable,
    updateAllVariables, exportDashboards, importDashboards, exportDataSources, importDataSources, isLoading, settingsSaveStatus, syncDashboards, syncSettings, autoSaveEnabled, toggleAutoSave, formattingVersion,
    apiConfig, instanceKey, department, owner, hasUnsyncedChanges
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