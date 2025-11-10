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
        const prefix = instanceKey ? `${instanceKey.toUpperCase()}_` : '';
        
        const variables: EnvVar[] = [
            {
                name: `${prefix}ANALYTICS_BUILDER_QUERY_PROXY_URL`,
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
                name: `${prefix}ANALYTICS_BUILDER_CONFIG_API_URL`,
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
                name: `${prefix}ANALYTICS_BUILDER_TENANT`,
                descriptionKey: 'envVars.tenantIdDesc',
                value: apiConfig.TENANT_ID,
                example: <HeaderExample name="X-Tenant-Id" />,
            },
            {
                name: `${prefix}ANALYTICS_BUILDER_API_KEY`,
                descriptionKey: 'envVars.apiKeyDesc',
                value: apiConfig.API_KEY,
                example: <HeaderExample name="api_key" />,
            },
            {
                name: `${prefix}ANALYTICS_BUILDER_API_SECRET`,
                descriptionKey: 'envVars.apiSecretDesc',
                value: apiConfig.API_SECRET,
                example: <HeaderExample name="api_secret" />,
            },
        ];

        if (department) {
            variables.push({
                name: 'department (prop)',
                descriptionKey: 'envVars.departmentDesc',
                value: department,
                example: (
                    <div className="space-y-2">
                        <VariableExample name="department" />
                        <HeaderExample name="X-Department" />
                    </div>
                )
            });
        }

        if (owner) {
             variables.push({
                name: 'owner (prop)',
                descriptionKey: 'envVars.ownerDesc',
                value: owner,
                example: (
                    <div className="space-y-2">
                        <VariableExample name="owner" />
                        <HeaderExample name="X-Owner" />
                    </div>
                )
            });
        }
        
        return variables;

    }, [apiConfig, instanceKey, t, department, owner]);

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">{t('envVars.title')}</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">{t('envVars.description')}</p>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                                <th scope="col" className="px-6 py-3 w-1/4">{t('envVars.name')}</th>
                                <th scope="col" className="px-6 py-3 w-1/3">{t('envVars.desc')}</th>
                                <th scope="col" className="px-6 py-3 w-1/6">{t('envVars.value')}</th>
                                <th scope="col" className="px-6 py-3 w-1/4">{t('envVars.exampleRequest')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {envVars.map((v) => (
                                <tr key={v.name} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 align-top">
                                    <td className="px-6 py-4 font-mono font-medium text-gray-900 dark:text-white break-all">
                                        {v.name}
                                    </td>
                                    <td className="px-6 py-4">
                                        {t(v.descriptionKey)}
                                    </td>
                                    <td className="px-6 py-4">
                                        {v.value ? (
                                            <code className="px-2 py-1 text-xs font-semibold text-indigo-800 bg-indigo-100 rounded-full dark:bg-indigo-900 dark:text-indigo-200">
                                                {v.value}
                                            </code>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 rounded-full dark:bg-gray-600 dark:text-gray-300">
                                                {t('envVars.notSet')}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {v.example || <span className="text-gray-400 italic text-xs">N/A</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default EnvironmentVariablesView;