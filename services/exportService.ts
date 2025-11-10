import { ChartCardData, DataSource, Variable, QueryResult, DashboardFormattingSettings } from '../types';
import { getDriver } from '../drivers/driverFactory';
import { removeSqlLimits, substituteVariablesInQuery } from './queryService';
import { ApiConfig } from './apiConfig';
import { formatValue } from './formattingService';

interface ExportOptions {
    card: ChartCardData;
    dataSources: DataSource[];
    variables: Variable[];
    apiConfig: ApiConfig;
    formattingSettings: DashboardFormattingSettings;
    department?: string;
    owner?: string;
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
 * and exports the result to an Excel (.xls) file.
 * @param {ExportOptions} options - The card, data sources, variables, and apiConfig needed to execute the query.
 */
export const exportToExcel = async ({ card, dataSources, variables, apiConfig, formattingSettings, department, owner }: ExportOptions): Promise<void> => {
    const dataSource = dataSources.find(ds => ds.id === card.dataSourceId);
    if (!dataSource) {
        throw new Error("Data source for this card could not be found.");
    }

    // 1. Prepare the query: remove limits and substitute variables.
    const unlimitedQuery = removeSqlLimits(card.query);
    const finalQuery = substituteVariablesInQuery(unlimitedQuery, variables);

    // 2. Execute the query.
    let result: QueryResult;
    try {
        const driver = getDriver(dataSource);
        result = await driver.executeQuery({
            dataSource,
            query: finalQuery,
        }, apiConfig, { department, owner });
    } catch (e) {
        throw new Error(`Failed to execute query for export: ${(e as Error).message}`);
    }

    // 3. Transform and format the data.
    const transformedData = result.rows.map(row => {
        const obj: { [key: string]: any } = {};
        result.columns.forEach((col, index) => {
            const rawValue = row[index];
            const columnType = card.columnTypes?.[col];
            obj[col] = formatValue(rawValue, columnType, formattingSettings);
        });
        return obj;
    });

    // 4. Generate and download the Excel file.
    const titleWithoutHtml = card.title.replace(/<[^>]*>/g, '');
    const finalFileName = substituteVariablesInQuery(titleWithoutHtml, variables);
    generateAndDownloadExcel(transformedData, finalFileName, finalFileName);
};