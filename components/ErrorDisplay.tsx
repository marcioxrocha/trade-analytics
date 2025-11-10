import React from 'react';

const JsonDisplay: React.FC<{ data: object }> = ({ data }) => {
  return (
    <div className="space-y-2">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <strong className="font-semibold text-red-800 dark:text-red-300 capitalize">
            {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}:
          </strong>
          <div className="mt-1 ml-2 rounded-md bg-red-50 dark:bg-red-800/20 p-2 font-mono text-sm">
            <pre className="whitespace-pre-wrap break-all">
                <code>{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</code>
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
};

interface ErrorDisplayProps {
  error: string;
}

/**
 * Tries to find and extract a valid JSON string from a larger string.
 * It's not perfect but handles cases where a JSON object is embedded in an error message.
 * @param str The string to search within.
 * @returns A valid JSON string if found, otherwise undefined.
 */
const extractJsonString = (str: string): string | undefined => {
    if (!str || typeof str !== 'string') {
        return undefined;
    }

    // This regex greedily finds a string starting with { or [ and ending with } or ].
    const regex = /(\{.*\}|\[.*\])/s; // s flag allows . to match newlines
    const match = str.match(regex);
    
    if (match && match[0]) {
        try {
            JSON.parse(match[0]);
            return match[0]; // The matched substring is valid JSON
        } catch (e) {
            // The matched substring is not valid JSON, so we ignore it.
        }
    }
    
    return undefined;
};


const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
    const jsonCandidate = extractJsonString(error);
    
    if (jsonCandidate) {
        try {
            const errorData = JSON.parse(jsonCandidate);
            return <JsonDisplay data={errorData} />;
        } catch (e) {
            // Fallback to showing original error if parsing the extracted string fails for some reason
        }
    }

    // Show the original, full error string if it's not JSON
    // or if the extracted part wasn't valid JSON.
    return (
        <pre className="text-sm break-words whitespace-pre-wrap font-mono">{error}</pre>
    );
};

export default ErrorDisplay;
