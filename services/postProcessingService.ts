import { QueryResult } from '../types';

/**
 * Executes a user-provided JavaScript script to transform an array of data objects.
 * The script is executed in a sandboxed environment using the Function constructor.
 * It has access to the `data` array and any variables passed in the context.
 * @param data The initial array of data objects from the query result.
 * @param script The JavaScript code to execute.
 * @param context A key-value object of variables to be made available to the script.
 * @returns An object containing the transformed array of data objects and any console logs.
 * @throws An object containing the error and any logs captured before the error if the script fails.
 */
export function executePostProcessingScript(
    data: Record<string, any>[],
    script: string,
    context: Record<string, any> = {}
): { processedData: Record<string, any>[], logs: string[] } {
    if (!script.trim()) {
        return { processedData: data, logs: [] };
    }
    
    const logs: string[] = [];
    const customConsole = {
        log: (...args: any[]) => {
            // Log to the real console for developers debugging the component
            console.log('>> [Post-processing LOG]:', ...args);
            // Store a string representation for the user UI
            const message = args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            logs.push(message);
        }
    };

    const executionContext = { ...context, console: customConsole };
    const contextKeys = Object.keys(executionContext);
    const contextValues = Object.values(executionContext);

    try {
        // Create a sandboxed function. It has access to `data` and all keys from the context.
        const transformFunction = new Function('data', ...contextKeys, script);
        
        const result = transformFunction(data, ...contextValues);

        // Validate the output
        if (!Array.isArray(result)) {
            throw new Error("Post-processing script must return an array.");
        }
        if (result.length > 0 && (typeof result[0] !== 'object' || result[0] === null)) {
            throw new Error("The returned array must contain objects.");
        }

        return { processedData: result, logs };

    } catch (error) {
        console.error("Post-processing script execution failed:", error);
        throw { error, logs };
    }
}


/**
 * Converts an array of objects into the QueryResult format.
 * @param processedData An array of objects.
 * @returns A QueryResult object.
 */
export function convertObjectArrayToQueryResult(processedData: Record<string, any>[]): QueryResult {
    if (processedData.length === 0) {
        return { columns: [], rows: [] };
    }

    const columns = Object.keys(processedData[0]);
    const rows = processedData.map(obj => columns.map(col => obj[col]));

    return { columns, rows };
}