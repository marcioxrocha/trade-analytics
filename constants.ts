// Keys for storing configurations via configService
export const DATA_SOURCES_KEY = 'dataSources';
export const WHITE_LABEL_KEY = 'whiteLabelSettings';
export const APP_SETTINGS_KEY = 'appSettings';
export const LAST_ACTIVE_DASHBOARD_ID_KEY = 'analytics_builder_last_active_dashboard';
export const DASHBOARD_ORDER_KEY = 'analytics_builder_dashboard_order';

// Prefixes for granular configuration keys
export const DASHBOARD_CONFIG_PREFIX = 'dashboard:';
export const DASHBOARD_CARDS_PREFIX = 'dashboardCards:';
export const DASHBOARD_VARIABLES_PREFIX = 'dashboardVariables:';

// OLD Monolithic Keys (for backward compatibility)
export const OLD_DASHBOARDS_KEY = 'dashboards';
export const OLD_CARDS_KEY = 'dashboardCardConfigs';
export const OLD_VARIABLES_KEY = 'dashboardVariables';


export const CHART_COLORS = {
  main: '#4f46e5',
  gradientFrom: '#6366f1',
  gradientTo: '#818cf8',
};

export const CHART_COLORS_PALETTE = [
  '#1f77b4', // Muted Blue
  '#ff7f0e', // Safety Orange
  '#2ca02c', // Cooked Asparagus Green
  '#d62728', // Brick Red
  '#9467bd', // Muted Purple
  '#8c564b', // Chestnut Brown
  '#e377c2', // Raspberry Pink
  '#7f7f7f', // Middle Gray
  '#bcbd22', // Curry Yellow-Green
  '#17becf', // Muted Cyan
  '#aec7e8', // Light Blue
  '#ffbb78', // Light Orange
  '#98df8a', // Light Green
  '#ff9896', // Light Red
  '#c5b0d5', // Light Purple
  '#c49c94', // Light Brown
  '#f7b6d2', // Light Pink
  '#c7c7c7', // Light Gray
  '#dbdb8d', // Light Yellow-Green
  '#9edae5', // Light Cyan
  '#393b79', // Dark Blue-Gray
  '#5254a3', // Dark Slate Blue
  '#6b6ecf', // Medium Slate Blue
  '#9c9ede', // Light Slate Blue
  '#637939', // Dark Olive Green
  '#8ca252', // Medium Olive Green
  '#b5cf6b', // Light Olive Green
  '#cedb9c', // Very Light Olive Green
  '#8c6d31', // Dark Mustard
  '#bd9e39', // Medium Mustard
];

export const DEFAULT_BRAND_COLOR = '#4f46e5';