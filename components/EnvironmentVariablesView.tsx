import React, { useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';

interface EnvVar {
    name: string;
    descriptionKey: string;
    value: string;
    example: React.ReactNode;
}

interface RequestExampleProps {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: object;
    responseBody?: object;
}

const RequestExample: React.FC<RequestExampleProps> = ({ method, path, headers, body, responseBody }) => {
    const { t } = useLanguage();
    return (
        <div className="text-xs font-mono bg-gray-100 dark:bg-gray-900 p-2 rounded-md whitespace-pre-wrap space-y-2">
            <div>
                <p><span className="font-bold text-indigo-400">{method}</span> {path}</p>
                {Object.entries(headers).map(([key, value]) => (
                    <p key={key}><span className="text-sky-400">{key}:</span> {value}</p>
                ))}
                <br />
                <code className="text-green-400">{JSON.stringify(body, null, 2)}</code>
            </div>
            {responseBody && (
                <div className="pt-2 border-t border-gray-300 dark:border-gray-700">
                    <p className="font-bold text-gray-700 dark:text-gray-300 mb-1">{t('envVars.exampleResponse')}</p>
                    <code className="text-yellow-400">{JSON.stringify(responseBody, null, 2)}</code>
                </div>
            )}
        </div>
    );
};


const HeaderExample: React.FC<{ name: string }> = ({ name }) => {
    const { t } = useLanguage();
    return (
        <div className="text-xs">
            <span className="font-semibold">{t('envVars.headerName')}:</span>
            <code className="ml-2 font-mono bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">{name}</code>
        </div>
    );
};

const VariableExample: React.FC<{ name: string }> = ({ name }) => {
    const { t } = useLanguage();
    return (
        <div className="text-xs">
            <p>{t('envVars.propUsage')}</p>
            <code className="font-mono bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">{`{{${name}}}`}</code>
        </div>
    );
};


interface EnvironmentVariablesViewProps {
    department?: string;
    owner?: string;
}

const EnvironmentVariablesView: React.FC<EnvironmentVariablesViewProps> = ({ department, owner }) => {
    const { t } = useLanguage();
    const { apiConfig, instanceKey } = useAppContext();

    const envVars: EnvVar[] = useMemo(() => {
        const prefix = 'ANALYTICS_BUILDER_';
        const instancePrefix = instanceKey ? `${instanceKey.toUpperCase()}_` : '';
        const maskIfSet = (value: string): string => value ? '********' : '';
        
        const variables: EnvVar[] = [
            {
                name: `${prefix}${instancePrefix}QUERY_PROXY_URL`,
                descriptionKey: 'envVars.queryProxyUrlDesc',
                value: apiConfig.QUERY_PROXY_URL,
                example: <RequestExample
                    method="POST"
                    path={apiConfig.QUERY_PROXY_URL}
                    headers={{
                        'Content-Type': 'application/json',
                        'X-Tenant-Id': apiConfig.TENANT_ID || 'your-tenant-id',
                        'api_key': apiConfig.API_KEY || 'your-api-key',
                    }}
                    body={{
                      "type": "PostgreSQL",
                      "connectionString": "postgres://user:pass@host:port/db",
                      "query": "SELECT * FROM orders;"
                    }}
                    responseBody={{
                      "columns": ["id", "user_id", "total", "status", "created_at"],
                      "rows": [
                        [1, 101, 150.50, "Completed", "2023-01-15"],
                        [2, 102, 75.00, "Completed", "2023-01-16"]
                      ]
                    }}
                />,
            },
            {
                name: `${prefix}${instancePrefix}CONFIG_API_URL`,
                descriptionKey: 'envVars.configApiUrlDesc',
                value: apiConfig.CONFIG_API_URL,
                example: <RequestExample
                    method="POST"
                    path={apiConfig.CONFIG_API_URL || '/api/config'}
                    headers={{
                        'Content-Type': 'application/json',
                        'X-Tenant-Id': apiConfig.TENANT_ID || 'your-tenant-id',
                        'api_key': apiConfig.API_KEY || 'your-api-key',
                    }}
                    body={{
                        "key": "dashboardCardConfigs",
                        "value": [ { "id": "card-123", "title": "Sales" } ]
                    }}
                    responseBody={{
                        "success": true,
                        "message": "Configuration saved."
                    }}
                />,
            },
            {
                name: `${prefix}${instancePrefix}CONFIG_SUPABASE_URL`,
                descriptionKey: 'envVars.supabaseUrlDesc',
                value: apiConfig.CONFIG_SUPABASE_URL,
                example: <span className="text-xs text-gray-400 italic">e.g., https://xyz.supabase.co</span>,
            },
            {
                name: `${prefix}${instancePrefix}CONFIG_SUPABASE_KEY`,
                descriptionKey: 'envVars.supabaseKeyDesc',
                value: maskIfSet(apiConfig.CONFIG_SUPABASE_KEY),
                example: <span className="text-xs text-gray-400 italic">e.g., eyJhbGciOi...</span>,
            },
            {
                name: `${prefix}${instancePrefix}TENANT`,
                descriptionKey: 'envVars.tenantIdDesc',
                value: apiConfig.TENANT_ID,
                example: <HeaderExample name="X-Tenant-Id" />,
            },
            {
                name: `${prefix}${instancePrefix}API_KEY`,
                descriptionKey: 'envVars.apiKeyDesc',
                value: maskIfSet(apiConfig.API_KEY),
                example: <HeaderExample name="api_key" />,
            },
            {
                name: `${prefix}${instancePrefix}API_SECRET`,
                descriptionKey: 'envVars.apiSecretDesc',
                value: maskIfSet(apiConfig.API_SECRET),
                example: <HeaderExample name="api_secret" />,
            },
             {
                name: `${prefix}${instancePrefix}LOCAL_DATA_SECRET`,
                descriptionKey: 'envVars.localDataSecretDesc',
                value: maskIfSet(apiConfig.LOCAL_DATA_SECRET),
                example: <span className="text-xs text-gray-400 italic">{t('envVars.localDataSecretExample')}</span>,
            },
        ];

        if (department) {
            variables.push({
                name: 'department (prop)',
                descriptionKey: 'envVars.departmentDesc',
                value: department,
                example: <VariableExample name="department" />
            });
        }
        if (owner) {
             variables.push({
                name: 'owner (prop)',
                descriptionKey: 'envVars.ownerDesc',
                value: owner,
                example: <VariableExample name="owner" />
            });
        }
        return variables;

    }, [apiConfig, instanceKey, department, owner, t]);
    

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">{t('envVars.title')}</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">{t('envVars.description')}</p>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/4">{t('envVars.name')}</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/4">{t('envVars.desc')}</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/4">{t('envVars.value')}</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/4">{t('envVars.exampleRequest')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {envVars.map((envVar, index) => (
                                <tr key={index}>
                                    <td className="px-6 py-4 whitespace-nowrap align-top">
                                        <code className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 break-all">{envVar.name}</code>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 align-top">{t(envVar.descriptionKey)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap align-top">
                                        {envVar.value ? (
                                            <code className="text-sm text-gray-900 dark:text-gray-200 break-all">{envVar.value}</code>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">{t('envVars.notSet')}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 align-top">{envVar.example}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t('envVars.supabaseSchemaTitle')}</h2>
                <p className="text-gray-600 dark:text-gray-400 mt-2 mb-4">{t('envVars.supabaseSchemaDesc')}</p>
                <div className="text-sm font-mono bg-gray-100 dark:bg-gray-900 p-4 rounded-md whitespace-pre-wrap overflow-x-auto">
                    <code className="text-indigo-400">CREATE TABLE</code> <code className="text-teal-400">public.analytics_builder_configs</code> (
                    <br />
                    {"  "}<code className="text-sky-400">id</code> <code className="text-purple-400">uuid</code> <code className="text-indigo-400">NOT NULL DEFAULT</code> <code className="text-teal-400">gen_random_uuid()</code>,
                    <br />
                    {"  "}<code className="text-sky-400">created_at</code> <code className="text-purple-400">timestamp with time zone</code> <code className="text-indigo-400">NOT NULL DEFAULT</code> <code className="text-teal-400">now()</code>,
                    <br />
                    {"  "}<code className="text-sky-400">key</code> <code className="text-purple-400">text</code> <code className="text-indigo-400">NOT NULL</code>,
                    <br />
                    {"  "}<code className="text-sky-400">value</code> <code className="text-purple-400">jsonb</code> <code className="text-indigo-400">NULL</code>,
                    <br />
                    {"  "}<code className="text-sky-400">tenant_id</code> <code className="text-purple-400">text</code> <code className="text-indigo-400">NULL</code>,
                    <br />
                    {"  "}<code className="text-sky-400">department</code> <code className="text-purple-400">text</code> <code className="text-indigo-400">NULL</code>,
                    <br />
                    {"  "}<code className="text-sky-400">owner</code> <code className="text-purple-400">text</code> <code className="text-indigo-400">NULL</code>,
                    <br />
                    {"  "}<code className="text-sky-400">last_modified</code> <code className="text-purple-400">timestamptz</code> <code className="text-indigo-400">NOT NULL DEFAULT</code> <code className="text-teal-400">now()</code>,
                    <br />
                    {"  "}<code className="text-indigo-400">CONSTRAINT</code> <code className="text-teal-400">analytics_builder_configs_pkey</code> <code className="text-indigo-400">PRIMARY KEY</code> (id)
                    <br />
                    );
                </div>
            </div>

        </div>
    );
};

export default EnvironmentVariablesView;
