import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { ChartCardData, DataSource, Dashboard, AppContextType, Variable, DashboardFormattingSettings, WhiteLabelSettings, SaveStatus, ExportData, DeletionTombstone, DeletionEntityType, AllConfigs, AppSettings } from '../types';
import { DATA_SOURCES_KEY, WHITE_LABEL_KEY, DEFAULT_BRAND_COLOR, APP_SETTINGS_KEY, LAST_ACTIVE_DASHBOARD_ID_KEY, DASHBOARD_CONFIG_PREFIX, DASHBOARD_CARDS_PREFIX, DASHBOARD_VARIABLES_PREFIX } from '../constants';
import { setConfig, deleteConfig, getAllConfigs, getLocalTombstones, setLocalTombstones } from '../services/configService';
import { useLanguage } from './LanguageContext';
import { DEFAULT_FORMATTING_SETTINGS } from '../services/formattingService';
import { useApi } from './ApiContext';

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
    children: ReactNode;
    instanceKey?: string;
    department?: string;
    owner?: string;
    allowDashboardManagement?: boolean;
    allowDataSourceManagement?: boolean;
    showInfoScreen?: boolean;
}

export const AppProvider: React.FC<AppProviderProps> = ({ 
    children, 
    instanceKey, 
    department, 
    owner,
    allowDashboardManagement = true,
    allowDataSourceManagement = true,
    showInfoScreen = true,
}) => {
  // App State
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [dashboardCards, setDashboardCards] = useState<ChartCardData[]>([]);
  const [whiteLabelSettings, setWhiteLabelSettings] = useState<WhiteLabelSettings>({ brandColor: DEFAULT_BRAND_COLOR, lastModified: new Date().toISOString() });
  const [appSettings, setAppSettings] = useState<AppSettings>({ autoSave: false, lastModified: new Date().toISOString() });
  const [isLoading, setIsLoading] = useState(true);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<SaveStatus>('idle');
  const [formattingVersion, setFormattingVersion] = useState(0);
  const [deletionTombstones, setDeletionTombstones] = useState<DeletionTombstone[]>([]);
  
  const { t, isReady: isLangReady } = useLanguage();
  const { apiConfig } = useApi();

  const hasUnsyncedChanges = useMemo(() => {
    const hasUnsavedItems = dashboards.some(d => d.saveStatus === 'unsaved') ||
                            settingsSaveStatus === 'unsaved';
    return hasUnsavedItems || deletionTombstones.length > 0;
  }, [dashboards, settingsSaveStatus, deletionTombstones]);

  // Effect to load all data from persistence, runs only once.
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      const serverState = await getAllConfigs(apiConfig, { department, owner });
      const now = new Date().toISOString();

      setDataSources(serverState.dataSources || []);
      setWhiteLabelSettings(serverState.whiteLabelSettings || { brandColor: DEFAULT_BRAND_COLOR, lastModified: now });
      setAppSettings(serverState.appSettings || { autoSave: false, lastModified: now });
      
      const finalDashboards: Dashboard[] = (serverState.dashboards || []).map(d => ({
        ...d,
        formattingSettings: d.formattingSettings || DEFAULT_FORMATTING_SETTINGS,
        saveStatus: 'idle',
      }));

      setDashboards(finalDashboards);
      setDashboardCards(serverState.cards || []);
      setVariables(serverState.variables || []);
      setDeletionTombstones(getLocalTombstones()); // Load pending deletions
      
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
        const now = new Date().toISOString();
        const defaultDashboard: Dashboard = { 
            id: crypto.randomUUID(), 
            name: newName, 
            formattingSettings: DEFAULT_FORMATTING_SETTINGS,
            saveStatus: 'unsaved',
            lastModified: now,
        };
        setDashboards([defaultDashboard]);
        setActiveDashboardId(defaultDashboard.id);
    }
  }, [isLoading, dashboards, t, isLangReady]);

    // Effect to persist the last viewed dashboard ID.
    useEffect(() => {
        if (!isLoading && activeDashboardId) {
            localStorage.setItem(LAST_ACTIVE_DASHBOARD_ID_KEY, activeDashboardId);
        }
    }, [activeDashboardId, isLoading]);

  const syncAllChanges = useCallback(async (): Promise<void> => {
    setDashboards(prev => prev.map(d => ({ ...d, saveStatus: 'syncing' })));
    setSettingsSaveStatus('syncing');
    const context = { department, owner };

    try {
        const serverState = await getAllConfigs(apiConfig, context);
        const syncPromises: Promise<any>[] = [];
        
        const finalState: AllConfigs = {
            dashboards: [], cards: [], variables: [], dataSources: [],
            whiteLabelSettings: null, appSettings: null,
        };

        const safeDate = (isoString?: string) => new Date(isoString || 0);

        // --- Merge Logic ---
        const mergeArray = <T extends { id: string; lastModified: string }>(local: T[], server: T[] | null, type: DeletionEntityType, parentId?: string): T[] => {
            const serverMap = new Map((server || []).map(item => [item.id, item]));
            const mergedMap = new Map(serverMap);

            (local || []).forEach(localItem => {
                const serverItem = serverMap.get(localItem.id);
                if (!serverItem || safeDate(localItem.lastModified) > safeDate(serverItem.lastModified)) {
                    mergedMap.set(localItem.id, localItem);
                }
            });
            
            const relevantTombstones = deletionTombstones.filter(t => t.type === type && (!parentId || t.parentId === parentId));
            relevantTombstones.forEach(tombstone => mergedMap.delete(tombstone.id));
            
            return Array.from(mergedMap.values());
        };

        const mergeObject = <T extends { lastModified: string }>(local: T | null, server: T | null): T | null => {
            if (local && (!server || safeDate(local.lastModified) > safeDate(server.lastModified))) {
                return local;
            }
            return server || local;
        };

        // --- MERGE ALL DATA TYPES ---
        finalState.dataSources = mergeArray(dataSources, serverState.dataSources, 'dataSource');
        finalState.whiteLabelSettings = mergeObject(whiteLabelSettings, serverState.whiteLabelSettings);
        finalState.appSettings = mergeObject(appSettings, serverState.appSettings);
        finalState.dashboards = mergeArray(dashboards, serverState.dashboards, 'dashboard');
        
        const allCards: ChartCardData[] = [];
        const allVariables: Variable[] = [];

        finalState.dashboards.forEach(dash => {
            const localCards = dashboardCards.filter(c => c.dashboardId === dash.id);
            const serverCards = (serverState.cards || []).filter(c => c.dashboardId === dash.id);
            const mergedCards = mergeArray(localCards, serverCards, 'card', dash.id);
            allCards.push(...mergedCards);

            const localVars = variables.filter(v => v.dashboardId === dash.id);
            const serverVars = (serverState.variables || []).filter(v => v.dashboardId === dash.id);
            const mergedVars = mergeArray(localVars, serverVars, 'variable', dash.id);
            allVariables.push(...mergedVars);
        });
        finalState.cards = allCards;
        finalState.variables = allVariables;

        // --- PUSH CHANGES TO SERVER ---
        const sortById = (a: {id:string}, b: {id:string}) => a.id.localeCompare(b.id);
        if (JSON.stringify(finalState.dataSources.sort(sortById)) !== JSON.stringify((serverState.dataSources || []).sort(sortById))) {
            syncPromises.push(setConfig(DATA_SOURCES_KEY, finalState.dataSources, apiConfig, context));
        }
        if (JSON.stringify(finalState.whiteLabelSettings) !== JSON.stringify(serverState.whiteLabelSettings)) {
            syncPromises.push(setConfig(WHITE_LABEL_KEY, finalState.whiteLabelSettings, apiConfig, context));
        }
        if (JSON.stringify(finalState.appSettings) !== JSON.stringify(serverState.appSettings)) {
            syncPromises.push(setConfig(APP_SETTINGS_KEY, finalState.appSettings, apiConfig, context));
        }
        
        const serverDashboardsMap = new Map((serverState.dashboards || []).map(d => [d.id, d]));
        const finalDashboardsMap = new Map(finalState.dashboards.map(d => [d.id, d]));
        
        // Add/Update dashboards
        finalState.dashboards.forEach(dash => {
            const serverDash = serverDashboardsMap.get(dash.id);
            if (!serverDash || JSON.stringify(dash) !== JSON.stringify(serverDash)) {
                syncPromises.push(setConfig(`${DASHBOARD_CONFIG_PREFIX}${dash.id}`, dash, apiConfig, context));
            }
        });
        
        // Delete dashboards that are in server but not in final state
        serverState.dashboards?.forEach(serverDash => {
            if (!finalDashboardsMap.has(serverDash.id)) {
                syncPromises.push(deleteConfig(`${DASHBOARD_CONFIG_PREFIX}${serverDash.id}`, apiConfig, context));
                syncPromises.push(deleteConfig(`${DASHBOARD_CARDS_PREFIX}${serverDash.id}`, apiConfig, context));
                syncPromises.push(deleteConfig(`${DASHBOARD_VARIABLES_PREFIX}${serverDash.id}`, apiConfig, context));
            }
        });

        // Sync children (cards/variables) for each final dashboard
        finalState.dashboards.forEach(dash => {
            const finalCards = finalState.cards.filter(c => c.dashboardId === dash.id);
            const serverCards = (serverState.cards || []).filter(c => c.dashboardId === dash.id);
            if (JSON.stringify(finalCards.sort(sortById)) !== JSON.stringify(serverCards.sort(sortById))) {
                syncPromises.push(setConfig(`${DASHBOARD_CARDS_PREFIX}${dash.id}`, finalCards, apiConfig, context));
            }

            const finalVars = finalState.variables.filter(v => v.dashboardId === dash.id);
            const serverVars = (serverState.variables || []).filter(v => v.dashboardId === dash.id);
            if (JSON.stringify(finalVars.sort(sortById)) !== JSON.stringify(serverVars.sort(sortById))) {
                syncPromises.push(setConfig(`${DASHBOARD_VARIABLES_PREFIX}${dash.id}`, finalVars, apiConfig, context));
            }
        });
        
        await Promise.all(syncPromises);

        // --- POST-SYNC CLEANUP & STATE COMMIT ---
        const now = new Date().toISOString();
        setDataSources(finalState.dataSources || []);
        setWhiteLabelSettings(finalState.whiteLabelSettings || { brandColor: DEFAULT_BRAND_COLOR, lastModified: now });
        setAppSettings(finalState.appSettings || { autoSave: false, lastModified: now });
        setDashboards((finalState.dashboards || []).map(d => ({ ...d, saveStatus: 'saved-remote' })));
        setDashboardCards(finalState.cards || []);
        setVariables(finalState.variables || []);
        
        setDeletionTombstones([]);
        setLocalTombstones([]);
        setSettingsSaveStatus('saved-remote');
        
    } catch (error) {
        console.error("Failed to sync all changes with server:", error);
        setDashboards(prev => prev.map(d => ({ ...d, saveStatus: 'saved-local' })));
        setSettingsSaveStatus('saved-local');
        throw new Error(t('modal.saveError'));
    }
  }, [dashboards, dashboardCards, variables, dataSources, whiteLabelSettings, appSettings, deletionTombstones, apiConfig, department, owner, t]);

  const addDataSource = useCallback((newSource: Omit<DataSource, 'id' | 'lastModified'>) => {
    const now = new Date().toISOString();
    const newSourceWithId: DataSource = { ...newSource, id: crypto.randomUUID(), lastModified: now };
    setDataSources(prev => [...prev, newSourceWithId]);
    setSettingsSaveStatus('unsaved');
  }, []);

  const updateDataSource = useCallback((updatedSource: DataSource) => {
    const now = new Date().toISOString();
    setDataSources(prev => prev.map(source => source.id === updatedSource.id ? {...updatedSource, lastModified: now } : source));
    setSettingsSaveStatus('unsaved');
  }, []);

  const removeDataSource = useCallback((id: string) => {
    const now = new Date().toISOString();
    setDeletionTombstones(prev => [...prev, {id, type: 'dataSource', deletedAt: now }]);
    setDataSources(prev => prev.filter(source => source.id !== id));
    setSettingsSaveStatus('unsaved');
  }, []);

  const addDashboard = useCallback((name: string) => {
    const now = new Date().toISOString();
    const newDashboard: Dashboard = { 
        name, 
        id: crypto.randomUUID(), 
        formattingSettings: DEFAULT_FORMATTING_SETTINGS,
        saveStatus: 'unsaved',
        lastModified: now,
    };
    setDashboards(prev => [...prev, newDashboard]);
    setActiveDashboardId(newDashboard.id);
  }, []);

  const duplicateDashboard = useCallback((dashboardId: string, newName: string) => {
    const originalDashboard = dashboards.find(d => d.id === dashboardId);
    if (!originalDashboard) return;

    const now = new Date().toISOString();
    const newDashboard: Dashboard = {
      ...originalDashboard,
      id: crypto.randomUUID(),
      name: newName,
      saveStatus: 'unsaved',
      lastModified: now,
    };
    const originalCards = dashboardCards.filter(c => c.dashboardId === dashboardId);
    const newCards = originalCards.map(card => ({ ...card, id: crypto.randomUUID(), dashboardId: newDashboard.id, lastModified: now }));
    const originalVariables = variables.filter(v => v.dashboardId === dashboardId);
    const newVariables = originalVariables.map(variable => ({ ...variable, id: crypto.randomUUID(), dashboardId: newDashboard.id, lastModified: now }));

    setDashboards(prev => [...prev, newDashboard]);
    setDashboardCards(prev => [...prev, ...newCards]);
    setVariables(prev => [...prev, ...newVariables]);
    setActiveDashboardId(newDashboard.id);
  }, [dashboards, dashboardCards, variables]);

  const removeDashboard = useCallback((id: string) => {
    const now = new Date().toISOString();
    setDeletionTombstones(prev => [...prev, { id, type: 'dashboard', deletedAt: now }]);
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
  }, [activeDashboardId]);

  const updateDashboardName = useCallback((id: string, newName: string) => {
    const now = new Date().toISOString();
    setDashboards(prev => prev.map(d => 
        d.id === id ? { ...d, name: newName, saveStatus: 'unsaved', lastModified: now } : d
    ));
  }, []);
  
  const updateActiveDashboardSettings = useCallback((settings: DashboardFormattingSettings) => {
      const now = new Date().toISOString();
      setDashboards(prev => prev.map(d => 
          d.id === activeDashboardId ? { ...d, formattingSettings: settings, saveStatus: 'unsaved', lastModified: now } : d
      ));
      setFormattingVersion(v => v + 1);
  }, [activeDashboardId]);

  const updateActiveDashboardScriptLibrary = useCallback((script: string) => {
    const now = new Date().toISOString();
    setDashboards(prev => prev.map(d => 
        d.id === activeDashboardId ? { ...d, scriptLibrary: script, saveStatus: 'unsaved', lastModified: now } : d
    ));
  }, [activeDashboardId]);


  const updateWhiteLabelSettings = useCallback((settings: Omit<WhiteLabelSettings, 'lastModified'>) => {
    const now = new Date().toISOString();
    setWhiteLabelSettings({ ...settings, lastModified: now });
    setSettingsSaveStatus('unsaved');
  }, []);

  const setDashboardUnsaved = useCallback((dashboardId: string | null) => {
    if (!dashboardId) return;
    const now = new Date().toISOString();
    setDashboards(prev => prev.map(d => d.id === dashboardId ? { ...d, saveStatus: 'unsaved', lastModified: now } : d));
  }, []);

  const addCard = useCallback((newCard: Omit<ChartCardData, 'id' | 'lastModified'>) => {
    const now = new Date().toISOString();
    const newCardWithId: ChartCardData = { ...newCard, id: crypto.randomUUID(), lastModified: now };
    setDashboardCards(prev => [...prev, newCardWithId]);
    setDashboardUnsaved(newCard.dashboardId);
  }, [setDashboardUnsaved]);

  const cloneCard = useCallback((cardId: string) => {
    const cardToClone = dashboardCards.find(c => c.id === cardId);
    if (!cardToClone) return;

    const now = new Date().toISOString();
    const newCard: ChartCardData = { ...cardToClone, id: crypto.randomUUID(), title: `${cardToClone.title} - Copy`, lastModified: now };
    
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
    const now = new Date().toISOString();
    setDashboardCards(prev => prev.map(card => card.id === updatedCard.id ? { ...updatedCard, lastModified: now } : card));
    setDashboardUnsaved(updatedCard.dashboardId);
  }, [setDashboardUnsaved]);

  const removeCard = useCallback((id: string) => {
    const cardToRemove = dashboardCards.find(c => c.id === id);
    if (cardToRemove) {
      const now = new Date().toISOString();
      setDeletionTombstones(prev => [...prev, { id, type: 'card', parentId: cardToRemove.dashboardId, deletedAt: now }]);
      setDashboardCards(prev => prev.filter(card => card.id !== id));
      setDashboardUnsaved(cardToRemove.dashboardId);
    }
  }, [dashboardCards, setDashboardUnsaved]);

  const reorderDashboardCards = useCallback((dashboardId: string, orderedCardIds: string[]) => {
    setDashboardUnsaved(dashboardId);
    setDashboardCards(prevCards => {
        const cardsForOtherDashboards = prevCards.filter(c => c.dashboardId !== dashboardId);
        const cardsForThisDashboard = prevCards.filter(c => c.dashboardId === dashboardId);
        const cardMap = new Map(cardsForThisDashboard.map(c => [c.id, c]));
        const orderedCards = orderedCardIds.map(id => cardMap.get(id)).filter((c): c is ChartCardData => !!c);
        if (orderedCards.length !== cardsForThisDashboard.length) return prevCards;
        return [...cardsForOtherDashboards, ...orderedCards];
    });
  }, [setDashboardUnsaved]);
  
  const addVariable = useCallback((newVariable: Omit<Variable, 'id' | 'lastModified'>) => {
    const now = new Date().toISOString();
    const newVarWithId: Variable = { ...newVariable, id: crypto.randomUUID(), lastModified: now };
    setVariables(prev => [...prev, newVarWithId]);
    setDashboardUnsaved(newVariable.dashboardId);
  }, [setDashboardUnsaved]);
  
  const updateVariable = useCallback((updatedVariable: Variable) => {
    const now = new Date().toISOString();
    setVariables(prev => prev.map(v => v.id === updatedVariable.id ? { ...updatedVariable, lastModified: now } : v));
    setDashboardUnsaved(updatedVariable.dashboardId);
  }, [setDashboardUnsaved]);

  const removeVariable = useCallback((id: string) => {
    const variableToRemove = variables.find(v => v.id === id);
    if (variableToRemove) {
        const now = new Date().toISOString();
        setDeletionTombstones(prev => [...prev, { id, type: 'variable', parentId: variableToRemove.dashboardId, deletedAt: now }]);
        setVariables(prev => prev.filter(v => v.id !== id));
        setDashboardUnsaved(variableToRemove.dashboardId);
    }
  }, [variables, setDashboardUnsaved]);

  const updateAllVariables = useCallback((dashboardId: string, variablesForDashboard: Variable[]) => {
    if (!dashboardId) return;
    const now = new Date().toISOString();
    const updatedVariablesWithTimestamp = variablesForDashboard.map(v => ({...v, lastModified: now }));

    setVariables(currentVariables => {
        const otherVars = currentVariables.filter(v => v.dashboardId !== dashboardId);
        return [...otherVars, ...updatedVariablesWithTimestamp];
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
    const now = new Date().toISOString();
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
                lastModified: now
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
        allDashboardNames.add(newName);

        newDashboards.push({
            ...dashboardFromFile,
            id: newId,
            name: newName,
            saveStatus: 'unsaved',
            lastModified: now,
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
                lastModified: now,
            });
        }
    });
    
    data.variables?.forEach(variable => {
         if (dashboardIdMap.has(variable.dashboardId)) {
            newVariables.push({
                ...variable,
                id: crypto.randomUUID(),
                dashboardId: dashboardIdMap.get(variable.dashboardId)!,
                lastModified: now,
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
    const now = new Date().toISOString();
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
            lastModified: now,
        });
    });
    
    setDataSources(prev => [...prev, ...newDataSources]);
    setSettingsSaveStatus('unsaved');
  }, [dataSources]);

  const memoizedSetActiveDashboardId = useCallback((id: string) => {
    setActiveDashboardId(id);
  }, []);

   const toggleAutoSave = useCallback(() => {
        const now = new Date().toISOString();
        setAppSettings(prev => ({ autoSave: !prev.autoSave, lastModified: now }));
        setSettingsSaveStatus('unsaved');
    }, []);

  const value = useMemo(() => ({
    dataSources,
    dashboards,
    variables,
    activeDashboardId,
    dashboardCards,
    whiteLabelSettings,
    appSettings,
    addDataSource,
    updateDataSource,
    removeDataSource,
    addDashboard,
    duplicateDashboard,
    removeDashboard,
    setActiveDashboardId: memoizedSetActiveDashboardId,
    updateDashboardName,
    updateActiveDashboardSettings,
    updateActiveDashboardScriptLibrary,
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
    syncAllChanges,
    autoSaveEnabled: appSettings.autoSave,
    toggleAutoSave,
    formattingVersion,
    apiConfig,
    instanceKey,
    department,
    owner,
    hasUnsyncedChanges,
    allowDashboardManagement,
    allowDataSourceManagement,
    showInfoScreen,
  }), [
    dataSources, dashboards, variables, activeDashboardId, dashboardCards, whiteLabelSettings, appSettings,
    addDataSource, updateDataSource, removeDataSource, addDashboard, duplicateDashboard, removeDashboard, 
    memoizedSetActiveDashboardId, updateDashboardName, updateActiveDashboardSettings, updateActiveDashboardScriptLibrary, updateWhiteLabelSettings, addCard, 
    cloneCard, updateCard, removeCard, reorderDashboardCards, addVariable, updateVariable, removeVariable,
    updateAllVariables, exportDashboards, importDashboards, exportDataSources, importDataSources, isLoading, settingsSaveStatus, syncAllChanges, toggleAutoSave, formattingVersion,
    apiConfig, instanceKey, department, owner, hasUnsyncedChanges, allowDashboardManagement, allowDataSourceManagement, showInfoScreen
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