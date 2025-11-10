import { QueryLanguage } from "../types";

// --- SQL Highlighter ---
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'ON', 'AS',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL',
  'DISTINCT', 'HAVING', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL'
];
const SQL_TABLE_NAMES = ['orders', 'users', 'products'];

const highlightSQL = (sql: string): string => {
  const regex = new RegExp(
    '(' +
      `\\b(?:${SQL_KEYWORDS.join('|').replace(/ /g, '\\s')})\\b|` +
      `\\b(?:${SQL_TABLE_NAMES.join('|')})\\b|` +
      `('[^']*'|"[^"]*")` +
    ')',
    'gi'
  );

  return sql.replace(regex, (match, captured) => {
    const upperMatch = captured.toUpperCase();
    if (SQL_KEYWORDS.includes(upperMatch)) {
      return `<span class="text-indigo-400 font-bold">${captured}</span>`;
    }
    if (SQL_TABLE_NAMES.includes(captured.toLowerCase())) {
        return `<span class="text-teal-400">${captured}</span>`;
    }
    if (captured.startsWith("'") || captured.startsWith('"')) {
      return `<span class="text-green-400">${captured}</span>`;
    }
    return captured;
  });
};

// --- MongoDB Highlighter ---
const highlightMongo = (query: string): string => {
    return query.replace(
        /("(?:\\.|[^"\\])*")|(\b(true|false|null)\b)|(\b\d+(\.\d+)?\b)/g,
        (match, string, boolean, _boolCap, number) => {
            if (string) {
                 // Differentiate between keys and values
                if (/:\s*$/.test(query.substring(0, query.indexOf(match) + match.length))) {
                     return `<span class="text-green-400">${string}</span>`; // Value
                } else {
                     return `<span class="text-sky-400">${string}</span>`; // Key
                }
            }
            if (boolean) {
                return `<span class="text-purple-400 font-bold">${boolean}</span>`;
            }
            if (number) {
                return `<span class="text-orange-400">${number}</span>`;
            }
            return match;
        }
    );
};

// --- Redis Highlighter ---
const highlightRedis = (command: string): string => {
    return command.replace(/(^\w+)/, `<span class="text-indigo-400 font-bold">$1</span>`);
};

// --- Supabase Highlighter ---
const highlightSupabase = (query: string): string => {
    // A single regex to find all tokens of interest (functions, methods, strings, numbers).
    const regex = new RegExp(
        '(' +
        `\\b[a-zA-Z_]\\w*(?=\\()|` +   // Functions like from()
        `\\.[a-zA-Z_]\\w*|` +           // Methods like .select (including the dot)
        `'[^']*'|"[^"]*"|` +          // Strings
        `\\b\\d+(?:\\.\\d+)?\\b` +       // Numbers
        ')',
        'g'
    );

    return query.replace(regex, (token) => {
        if (token.startsWith('.')) {
            // Method chain
            return `.<span class="text-indigo-400 font-bold">${token.substring(1)}</span>`;
        }
        if (token.startsWith("'") || token.startsWith('"')) {
            // String
            return `<span class="text-green-400">${token}</span>`;
        }
        // Check for a valid number that isn't part of another word
        if (!isNaN(Number(token)) && /^\d/.test(token)) {
            return `<span class="text-orange-400">${token}</span>`;
        }
        // Check for a function name (word followed by a parenthesis)
        if (/^[a-zA-Z]/.test(token)) {
            return `<span class="text-teal-400">${token}</span>`;
        }
        // Fallback for any other match
        return token;
    });
};


// --- JavaScript Highlighter ---
const JS_KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'import', 'export', 'from', 'await', 'async', 'of', 'in', 'do', 'class', 'extends', 'super', 'this', 'true', 'false', 'null', 'undefined'
];
const JS_BUILTINS = [
    'console', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean'
];

const highlightJS = (code: string): string => {
  const regex = new RegExp(
    `(\\b(?:${JS_KEYWORDS.join('|')})\\b)|` + // Group 1: Keywords
    `(\\b(?:${JS_BUILTINS.join('|')})\\b)|` +   // Group 2: Built-ins
    `('[^']*'|"[^"]*"|\`[^\`]*\`)|` +          // Group 3: Strings
    `(\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/)|` +     // Group 4: Comments
    `(\\b\\d+(?:\\.\\d+)?\\b)`,               // Group 5: Numbers
    'g'
  );

  return code.replace(regex, (match, keyword, builtin, string, comment, number) => {
    if (keyword) {
      if (['true', 'false', 'null', 'undefined'].includes(keyword)) {
        return `<span class="text-purple-400 font-bold">${keyword}</span>`;
      }
      return `<span class="text-indigo-400 font-bold">${keyword}</span>`;
    }
    if (builtin) {
      return `<span class="text-teal-400">${builtin}</span>`;
    }
    if (string) {
      return `<span class="text-green-400">${string}</span>`;
    }
    if (comment) {
      return `<span class="text-gray-500 italic">${comment}</span>`;
    }
    if (number) {
        return `<span class="text-orange-400">${number}</span>`;
    }
    return match; // Fallback
  });
};


/**
 * Applies syntax highlighting to a query string by wrapping tokens in styled spans,
 * selecting the appropriate highlighter based on the language.
 * @param query The raw query string.
 * @param lang The query language ('sql', 'mongo', 'redis').
 * @returns An HTML string with syntax highlighting.
 */
export const highlight = (query: string, lang: QueryLanguage | 'javascript'): string => {
  const escapedQuery = query
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  switch (lang) {
    case 'sql':
      return highlightSQL(escapedQuery);
    case 'mongo':
      return highlightMongo(escapedQuery);
    case 'redis':
        return highlightRedis(escapedQuery);
    case 'supabase':
        return highlightSupabase(escapedQuery);
    case 'javascript':
        return highlightJS(escapedQuery);
    default:
      return escapedQuery; // No highlighting for unknown languages
  }
};