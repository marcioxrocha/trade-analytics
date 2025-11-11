// --- Core Application Types ---

export interface ApiConfig {
  QUERY_PROXY_URL: string;
  CONFIG_API_URL: string;
  CONFIG_SUPABASE_URL: string;
  CONFIG_SUPABASE_KEY: string;
  TENANT_ID: string;
  API_KEY: string;
  API_SECRET: string;
  FIREBASE_API_KEY: string;
  FIREBASE_AUTH_DOMAIN: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_RECAPTCHA_SITE_KEY: string;
  AUTH_VERIFY_EMAIL_URL: string;
  LOCAL_DATA_SECRET: string;
}

export interface RequestContext {
    department?: string;
    owner?: string;
}

export type View = 'dashboard' | 'query-editor' | 'settings' | 'env-variables';

export type SaveStatus = 'idle' | 'unsaved' | 'saving-local' | 'saved-local' | 'syncing' | 'saved-remote';


export interface DashboardFormattingSettings {
  dateFormat: string;
  dateTimeFormat: string;
  currencySymbol: string;
  currencyPosition: 'prefix' | 'suffix';
  decimalSeparator: ',' | '.';
  thousandsSeparator: ',' | '.';
  currencyDecimalPlaces: number;
  numberDecimalPlaces: number;
}

export interface WhiteLabelSettings {
  brandColor: string;
}

export interface Dashboard {
  id: string;
  name: string;
  formattingSettings: DashboardFormattingSettings;
  saveStatus?: SaveStatus;
}

export interface VariableOption {
  label: string;
  value: string;
}

export interface Variable {
  id:string;
  dashboardId: string;
  name: string;
  value: string;
  isExpression?: boolean; // Indicates if the value should be evaluated as a JS expression
  options?: VariableOption[]; // For creating dropdowns
  showOnDashboard?: boolean; // To show as a filter on the dashboard
}

export enum ChartType {
  BAR = 'bar',
  LINE = 'line',
  AREA = 'area',
  KPI = 'kpi',
  TABLE = 'table',
  MULTI_LINE = 'multi-line',
  SPACER = 'spacer',
}

export type QueryLanguage = 'sql' | 'mongo' | 'redis' | 'supabase';
export type ColumnDataType = 'text' | 'integer' | 'decimal' | 'currency' | 'date' | 'datetime' | 'boolean';

export interface ChartCardData {
  id: string;
  dashboardId: string; // Link to the parent dashboard
  title: string;
  description?: string;
  type: ChartType;
  query: string;
  queryLanguage: QueryLanguage;
  postProcessingScript?: string; // JavaScript code to transform data after query
  dataSourceId: string;
  data?: Record<string, any>[]; // Data is now optional, loaded at runtime
  columnTypes?: Record<string, ColumnDataType>; // Type definition for each column
  dataKey: string; // Used for single-series charts
  dataKeys?: string[]; // Used for multi-series charts
  categoryKey: string;
  gridSpan: number;
  gridRowSpan?: number; // For flexible grid height
  kpiConfig?: {
    format: 'number' | 'percent';
  }
}

// --- Dashboard Modal Context Type ---
export interface ModalConfig {
  content: any;
  title: string;
  footer?: any;
}

export interface DashboardModalContextType {
  isModalOpen: boolean;
  modalConfig: ModalConfig | null;
  showModal: (config: ModalConfig) => void;
  hideModal: () => void;
}


// --- App Context Type ---
export interface AppContextType {
  dataSources: DataSource[];
  dashboards: Dashboard[];
  variables: Variable[];
  activeDashboardId: string | null;
  dashboardCards: ChartCardData[];
  whiteLabelSettings: WhiteLabelSettings;
  addDataSource: (newSource: Omit<DataSource, 'id'>) => void;
  updateDataSource: (updatedSource: DataSource) => void;
  removeDataSource: (id: string) => void;
  addDashboard: (name: string) => void;
  duplicateDashboard: (dashboardId: string, newName: string) => void;
  removeDashboard: (id: string) => void;
  setActiveDashboardId: (id: string) => void;
  updateDashboardName: (id: string, newName: string) => void;
  updateActiveDashboardSettings: (settings: DashboardFormattingSettings) => void;
  updateWhiteLabelSettings: (settings: WhiteLabelSettings) => void;
  addCard: (newCard: Omit<ChartCardData, 'id'>) => void;
  cloneCard: (cardId: string) => void;
  updateCard: (updatedCard: ChartCardData) => void;
  removeCard: (id: string) => void;
  reorderDashboardCards: (dashboardId: string, orderedCardIds: string[]) => void;
  addVariable: (newVariable: Omit<Variable, 'id'>) => void;
  updateVariable: (updatedVariable: Variable) => void;
  removeVariable: (id: string) => void;
  updateAllVariables: (dashboardId: string, allVariables: Variable[]) => void;
  exportDashboards: (dashboardIds: string[]) => void;
  importDashboards: (data: ExportData, selectedDashboardsFromFile: Dashboard[]) => void;
  exportDataSources: (dataSourceIds: string[]) => void;
  importDataSources: (data: ExportData, selectedDataSourcesFromFile: DataSource[]) => void;
  isLoading: boolean;
  settingsSaveStatus: SaveStatus;
  syncDashboards: () => Promise<void>;
  syncSettings: () => Promise<void>;
  autoSaveEnabled: boolean;
  toggleAutoSave: () => void;
  formattingVersion: number;
  apiConfig: ApiConfig;
  instanceKey?: string;
  department?: string;
  owner?: string;
  hasUnsyncedChanges: boolean;
  allowDashboardManagement: boolean;
  allowDataSourceManagement: boolean;
  showInfoScreen: boolean;
}


// --- Data Source and Querying Types ---

export type DatabaseType = 'LocalStorage (Demo)' | 'PostgreSQL' | 'MySQL' | 'SQL Server' | 'Redis' | 'MongoDB' | 'CosmosDB' | 'Supabase';

export interface DataSource {
  id: string;
  name: string;
  type: DatabaseType;
  connectionString: string;
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
}

export interface QueryRequest {
  dataSource: DataSource;
  query: string;
}

// --- Export/Import Type ---
export interface ExportData {
    metadata: {
        version: number;
        exportedAt: string;
    };
    dashboards?: Dashboard[];
    cards?: ChartCardData[];
    variables?: Variable[];
    dataSources?: DataSource[];
}