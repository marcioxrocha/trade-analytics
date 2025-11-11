import React, { useState } from 'react';
import { ApiConfig } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import Icon from './Icon';
import Modal from './Modal';

interface AiQueryGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUseQuery: (query: string) => void;
    apiConfig: ApiConfig;
}

const AiQueryGeneratorModal: React.FC<AiQueryGeneratorModalProps> = ({ isOpen, onClose, onUseQuery, apiConfig }) => {
    const { t } = useLanguage();
    const [prompt, setPrompt] = useState('');
    const [generatedQuery, setGeneratedQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerateQuery = async () => {
        if (!prompt) return;
        if (!apiConfig.API_KEY) {
            setError("API Key for Gemini is not configured in the application settings.");
            return;
        }

        setIsLoading(true);
        setGeneratedQuery('');
        setError(null);

        const MOCK_SCHEMA = `
- Table: orders (Columns: id, user_id, total, status, created_at)
- Table: users (Columns: id, name, email, signup_date)
- Table: products (Columns: id, name, category, price)`;

        const fullPrompt = `You are an expert SQL generator. Based on the user's request and the following database schema, generate a valid SQL query.
Database Schema:
${MOCK_SCHEMA}

User Request: "${prompt}"

Only return the SQL query, with no other text, explanation, or markdown formatting.`;

        try {
            const { GoogleGenAI } = await import('@google/genai');
            const ai = new GoogleGenAI({ apiKey: apiConfig.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
            });
            const queryText = response.text.replace(/```sql\n|```/g, '').trim();
            setGeneratedQuery(queryText);
        } catch (e) {
            console.error("AI query generation failed:", e);
            setError((e as Error).message || t('queryEditor.aiError'));
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleUseQuery = () => {
        if (generatedQuery) {
            onUseQuery(generatedQuery);
        }
        // Reset state for next time
        setPrompt('');
        setGeneratedQuery('');
        setError(null);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('queryEditor.aiModalTitle')}
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-md">{t('modal.cancel')}</button>
                    {generatedQuery && !isLoading && (
                        <button onClick={handleUseQuery} className="px-4 py-2 btn-brand text-white rounded-md flex items-center">
                            <Icon name="sql" className="w-4 h-4 mr-2 inline" />
                            {t('queryEditor.aiUseQueryButton')}
                        </button>
                    )}
                </>
            }
        >
            <div className="space-y-4">
                <div>
                    <label htmlFor="ai-prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('queryEditor.aiPromptLabel')}
                    </label>
                    <textarea
                        id="ai-prompt"
                        rows={3}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder={t('queryEditor.aiPromptPlaceholder')}
                        autoFocus
                    />
                </div>
                <button
                    onClick={handleGenerateQuery}
                    disabled={isLoading || !prompt}
                    className="w-full flex justify-center items-center bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-md font-semibold transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icon name="gemini" className="w-5 h-5 mr-2" />
                    {isLoading ? t('queryEditor.aiGeneratingButton') : t('queryEditor.aiGenerateButton')}
                </button>

                {isLoading && (
                    <div className="flex justify-center items-center p-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    </div>
                )}

                {error && (
                    <div className="bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-3 rounded-md">
                        <p className="font-bold">{t('modal.errorTitle')}</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {generatedQuery && !isLoading && (
                    <div>
                        <pre className="w-full p-3 font-mono text-sm bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md overflow-auto">
                            <code>{generatedQuery}</code>
                        </pre>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AiQueryGeneratorModal;
