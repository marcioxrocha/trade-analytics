
import { ChartCardData, DataSource, Variable, QueryResult, DashboardFormattingSettings, QueryDefinition } from '../types';
import { getDriver } from '../drivers/driverFactory';
import { removeSqlLimits, substituteVariablesInQuery, resolveAllVariables } from './queryService';
import { ApiConfig } from './../types';
import { formatValue } from './formattingService';
import { executePostProcessingScript } from './postProcessingService';

interface ExportOptions {
    card: ChartCardData;
    dataSources: DataSource[];
    variables: Variable[];
    apiConfig: ApiConfig;
    formattingSettings: DashboardFormattingSettings;
    department?: string;
    owner?: string;
    scriptLibrary?: string;
}

/**
 * Generates an HTML table string and triggers a download of an Excel (.xls) file.
 * This is a private helper function.
 * @param data The array of data objects to export.
 * @param fileName The base name for the downloaded file.
 * @param sheetName The name of the sheet within the Excel file.
 */
const generateAndDownloadExcel = (data: Record<string, any>[], fileName: string, sheetName: string = 'Sheet1'): void => {
    if (!data || data.length === 0) {
        throw new Error("No data was returned from the query to export.");
    }
    
    const headers = Object.keys(data[0]);

    const headerRow = `<tr>${headers.map(h => `<th style="background-color: #4338ca; color: #ffffff; font-weight: bold; padding: 8px; border: 1px solid #e2e8f0;">${h}</th>`).join('')}</tr>`;

    const dataRows = data.map(row => 
        `<tr>${headers.map(header => `<td style="border: 1px solid #e2e8f0; padding: 8px;">${String(row[header] ?? '')}</td>`).join('')}</tr>`
    ).join('');

    const template = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8">
            <!--[if gte mso 9]>
            <xml>
                <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                        <x:ExcelWorksheet>
                            <x:Name>${sheetName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 31)}</x:Name>
                            <x:WorksheetOptions>
                                <x:DisplayGridlines/>
                            </x:WorksheetOptions>
                        </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                </x:ExcelWorkbook>
            </xml>
            <![endif]-->
        </head>
        <body>
            <table>
                <thead>${headerRow}</thead>
                <tbody>${dataRows}</tbody>
            </table>
        </body>
        </html>
    `;

    const blob = new Blob([template], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        const sanitizedFileName = fileName.replace(/\s+/g, '_').toLowerCase();
        link.setAttribute('download', `${sanitizedFileName}.xls`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

/**
 * Fetches the full dataset for a chart card, removes any row limits from the query,
 * applies post-processing, and exports the result to an Excel (.xls) file.
 */
export const exportToExcel = async ({ card, dataSources, variables, apiConfig, formattingSettings, department, owner, scriptLibrary }: ExportOptions): Promise<void> => {
    
    // Determine queries to run
    const queriesToRun: QueryDefinition[] = (card.queries && card.queries.length > 0)
        ? card.queries
        : [{ id: 'legacy', dataSourceId: card.dataSourceId, query: card.query }];

    const validQueries = queriesToRun.filter(q => !!q.dataSourceId);

    if (validQueries.length === 0) {
        throw new Error("No valid queries configured for this card.");
    }

    let results: QueryResult[] = [];

    try {
        results = await Promise.all(validQueries.map(async (q) => {
            const dataSource = dataSources.find(ds => ds.id === q.dataSourceId);
            if (!dataSource) throw new Error("Data source not found.");

            // 1. Prepare the query: remove limits and substitute variables.
            const unlimitedQuery = removeSqlLimits(q.query);
            const finalQuery = substituteVariablesInQuery(unlimitedQuery, variables, scriptLibrary);

            const driver = getDriver(dataSource);
            return await driver.executeQuery({
                dataSource,
                query: finalQuery,
            }, apiConfig, { department, owner });
        }));
    } catch (e) {
        throw new Error(`Failed to execute query for export: ${(e as Error).message}`);
    }

    // 2. Transform all results for post-processing
    const allDatasets = results.map(res => res.rows.map(row => {
        const obj: { [key: string]: any } = {};
        res.columns.forEach((col, index) => {
            obj[col] = row[index];
        });
        return obj;
    }));

    let finalData = allDatasets[0] || [];

    // 3. Apply Post-Processing if enabled
    if (card.postProcessingScript) {
        try {
            const resolvedVars = resolveAllVariables(variables, scriptLibrary);
            const { processedData } = executePostProcessingScript(
                finalData, 
                card.postProcessingScript, 
                { ...resolvedVars, datasets: allDatasets }, 
                scriptLibrary || ''
            );
            finalData = processedData;
        } catch (e) {
            const errorMsg = (e as any).error ? (e as any).error.message : String(e);
            throw new Error(`Export failed during post-processing: ${errorMsg}`);
        }
    }

    if (finalData.length === 0) {
        throw new Error("Resulting dataset is empty.");
    }

    // 4. Format values based on column types (infer if necessary)
    const columns = Object.keys(finalData[0]);
    const formattedData = finalData.map(row => {
        const obj: { [key: string]: any } = {};
        columns.forEach(col => {
            const rawValue = row[col];
            const columnType = card.columnTypes?.[col];
            obj[col] = formatValue(rawValue, columnType, formattingSettings);
        });
        return obj;
    });

    // 5. Generate and download the Excel file.
    const titleWithoutHtml = card.title.replace(/<[^>]*>/g, '');
    const finalFileName = substituteVariablesInQuery(titleWithoutHtml, variables, scriptLibrary);
    generateAndDownloadExcel(formattedData, finalFileName, finalFileName);
};
