
import { Variable } from '../types';
import { imports } from './configService';

/**
 * Safely evaluates a JavaScript expression string within a given context.
 * @param expression The string containing the JavaScript expression to evaluate.
 * @param context A key-value object where keys are variable names available to the expression.
 * @param libraryScript An optional string containing a library of JS functions to be made available.
 * @returns The result of the expression, or an error string if evaluation fails.
 */
function evaluateExpression(expression: string, context: Record<string, any>, libraryScript: string = ''): any {
  try {
    const moment = imports.moment;
    context = {...context, moment};

    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);
    
    // Determine if the expression is a code block or a simple expression
    const trimmedExpr = expression.trim();
    const hasExplicitReturn = /\breturn\b/.test(trimmedExpr);
    
    // Combine the library and the user's expression into a single script body.
    let scriptBody = `${libraryScript}\n`;

    if (hasExplicitReturn) {
        // If the user provided a return statement, assume they wrote a full function body.
        scriptBody += expression;
    } else {
        // Otherwise, treat it as an expression and return it directly.
        // Wrapping in parentheses handles object literals: return ({ a: 1 }); vs return { a: 1 }; (which is a block)
        scriptBody += `return (${expression});`;
    }

    // Using the Function constructor is safer than eval() as it doesn't have access to the local scope.
    const func = new Function(...contextKeys, scriptBody);
    return func(...contextValues);
  } catch (error) {
    // console.error(`Error evaluating expression: "${expression}"`, error);
    // Return the raw expression string if evaluation fails, unless it looks like a serious syntax error in intended code
    return `[EVAL_ERROR: ${(error as Error).message}]`;
  }
}

/**
 * Builds a context object from plain (non-expression) variables.
 * @param variables The list of available variables.
 * @returns A key-value object of resolved plain variables.
 */
export const buildVariableContext = (variables: Variable[]): Record<string, any> => {
    const context: Record<string, any> = {};
    variables
        .filter(v => !v.isExpression)
        .forEach(v => {
            // Simple type coercion for context
            const numVal = parseFloat(v.value);
            if (!isNaN(numVal) && String(numVal) === v.value) {
                context[v.name] = numVal;
            } else if (v.value.toLowerCase() === 'true') {
                context[v.name] = true;
            } else if (v.value.toLowerCase() === 'false') {
                context[v.name] = false;
            } else {
                context[v.name] = v.value;
            }
        });
    return context;
};

/**
 * Resolves the value of a single variable, evaluating it as an expression if necessary.
 * @param variable The variable to resolve.
 * @param context The context of resolved plain variables.
 * @param libraryScript An optional string containing a library of JS functions.
 * @returns The final value of the variable.
 */
export const resolveVariableValue = (variable: Variable, context: Record<string, any>, libraryScript?: string): any => {
    if (!variable.isExpression || !variable.value) {
        return variable.value;
    }
    return evaluateExpression(variable.value, context, libraryScript);
};

/**
 * Resolves all variables for a dashboard into a simple key-value map.
 * @param variables The list of variables to resolve.
 * @param libraryScript An optional string containing a library of JS functions.
 * @returns A key-value object of all resolved variables with their final, evaluated values.
 */
export const resolveAllVariables = (variables: Variable[], libraryScript?: string): Record<string, any> => {
    const plainVariables = variables.filter(v => !v.isExpression);
    const expressionVariables = variables.filter(v => v.isExpression);

    // 1. Create a context with the resolved values of plain variables (with type coercion).
    const context = buildVariableContext(plainVariables);

    // 2. Add evaluated expression variables to the context.
    const resolvedValues: Record<string, any> = { ...context };
    expressionVariables.forEach(v => {
        resolvedValues[v.name] = evaluateExpression(v.value, context, libraryScript);
    });
    
    return resolvedValues;
};


/**
 * Replaces {{variable_name}} placeholders in a SQL query with their actual values.
 * It first resolves all plain text variables, then uses them as context to evaluate
 * any variables marked as JavaScript expressions, making the script library available.
 * @param sql The SQL query string with placeholders.
 * @param variables An array of available variables for the dashboard.
 * @param libraryScript An optional string containing a library of JS functions.
 * @returns The SQL query with variables substituted.
 */
export const substituteVariablesInQuery = (sql: string, variables: Variable[], libraryScript?: string): string => {
    let finalSql = sql;
    
    const resolvedValues = resolveAllVariables(variables, libraryScript);
//ALTERACAO MARCIO    
    //finalSql = finalSql.replace(/\{\{([a-zA-Z0-9_().\s'"]+)\}\}/g, (match, expression) => {
    //finalSql = finalSql.replace(/\{\{([^\}]+)\}\}/g, (match, expression) => {
    finalSql = finalSql.replace(/\{\{([\s\S]*?)\}\}/g, (match, expression) => {
        // Now, we treat the content inside {{...}} as a potential expression itself,
        // which could be a simple variable name or a function call from the library.
        const evaluatedValue = evaluateExpression(expression, resolvedValues, libraryScript);
        
        if (typeof evaluatedValue !== 'string' || !evaluatedValue.startsWith('[EVAL_ERROR:')) {
             // Handle objects/arrays being interpolated into SQL/Strings
             if (typeof evaluatedValue === 'object' && evaluatedValue !== null) {
                 return JSON.stringify(evaluatedValue);
             }
             return String(evaluatedValue);
        }

        // Fallback for simple variable names if expression fails (e.g. {{my_var}} but not {{my_func()}})
        if (Object.prototype.hasOwnProperty.call(resolvedValues, expression.trim())) {
            const val = resolvedValues[expression.trim()];
            if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
            }
            return String(val);
        }
        
        // console.warn(`Variable or expression {{${expression}}} could not be resolved.`);
        return match; // Return the original placeholder if the variable is not found.
    });   

    return finalSql;
}

/**
 * Removes common SQL clauses that limit the number of returned rows.
 * This is used to ensure exports contain the full dataset.
 * Handles TOP, LIMIT, and SQL Server's OFFSET/FETCH clauses.
 * @param sql The original SQL query.
 * @returns The SQL query with limiting clauses removed.
 */
export const removeSqlLimits = (sql: string): string => {
    // Remove TOP N clause (e.g., SELECT TOP 100 *) - ensure space after number
    let modifiedSql = sql.replace(/\bTOP\s+\d+\s/i, ' ');

    // Remove LIMIT N and optional OFFSET M clause
    // Handles "LIMIT 100", "LIMIT 100 OFFSET 200"
    modifiedSql = modifiedSql.replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\b/i, '');

    // Remove SQL Server's OFFSET / FETCH NEXT syntax.
    // Handles "OFFSET 10 ROWS FETCH NEXT 50 ROWS ONLY" and variants with variables like "@offset".
    modifiedSql = modifiedSql.replace(/\bOFFSET\s+(?:@?\w+|\d+)\s+ROWS\s+FETCH\s+(?:NEXT|FIRST)\s+(?:@?\w+|\d+)\s+ROWS\s+ONLY\b/i, '');

    modifiedSql = modifiedSql.replace(/,\s*{[^{}]*(?:"\$limit"|\$limit)\s*:\s*\d+[^{}]*}(?=\s*,\s*{[^{}]*(?:"\$project"|\$project))|,\s*{[^{}]*(?:"\$limit"|\$limit)\s*:\s*\d+[^{}]*}(?=\s*])/g, '');
    
    return modifiedSql.trim();
}
