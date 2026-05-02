import { GoogleGenAI } from '@google/genai';
import { chunkText } from '../utils/chunker';

/**
 * Инициализация Gemini AI
 * 
 * Безопасный режим (рекомендуется):
 *   VITE_GEMINI_BASE_URL = URL вашего Cloudflare Worker
 *   API-ключ хранится в секретах Worker'а, клиент отправляет placeholder
 * 
 * Dev-режим (только для локальной разработки):
 *   VITE_GEMINI_API_KEY = ваш API-ключ (попадает в бандл — небезопасно!)
 */
const baseUrl = import.meta.env.VITE_GEMINI_BASE_URL;
const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Если есть прокси — используем placeholder-ключ (Worker подставит настоящий)
// Если нет — fallback на прямой ключ (для локальной разработки)
const apiKey = baseUrl ? 'LUMEA_CLIENT' : rawApiKey;

const ai = apiKey ? new GoogleGenAI({ 
  apiKey,
  ...(baseUrl ? { httpOptions: { baseUrl } } : {})
}) : null;

export const AIService = {
  isAvailable() {
    return !!ai;
  },

  async generateContent(prompt, systemInstruction = null) {
    if (!this.isAvailable()) throw new Error('Gemini API key is missing');
    
    const config = {
      temperature: 0.3,
    };
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: prompt,
      config
    });
    return response.text;
  },

  async summarize(text) {
    if (!this.isAvailable()) throw new Error('Gemini API key is missing');
    
    // Передаем существенную часть документа (до 100 000 символов), чтобы учесть весь контекст, 
    // так как окно Gemma 4 позволяет это сделать.
    const documentContext = text.length > 100000 ? text.substring(0, 100000) + '... [Текст обрезан]' : text;

    const prompt = `
Ты — опытный академический ассистент Lumea. Твоя задача — создать глубокий и точный конспект предоставленного документа.
Относись к тексту как к единственному источнику истины. Не выдумывай факты.

Текст документа:
"""
${documentContext}
"""

Формат ответа (строго Markdown):
1. **Главная мысль** (1-2 предложения, самая суть)
2. **Ключевые концепции** (маркированный список основных терминов и идей)
3. **Подробный конспект** (структурированный по логическим блокам текста, с заголовками H3)
`;

    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: prompt,
      config: {
        temperature: 0.1, // Низкая температура для строгого следования тексту
      }
    });

    return response.text;
  },

  async streamContent(prompt, systemInstruction = null) {
    if (!this.isAvailable()) throw new Error('Gemini API key is missing');

    const config = {
      temperature: 0.2, // Понижена температура для точности в RAG
    };
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    const responseStream = await ai.models.generateContentStream({
      model: 'gemma-4-31b-it',
      contents: prompt,
      config
    });

    return responseStream;
  },

  async generateFlashcards(text) {
    if (!this.isAvailable()) throw new Error('Gemini API key is missing');

    const documentContext = text.length > 50000 ? text.substring(0, 50000) : text;

    const prompt = `
Твоя задача — выступить в роли эксперта по созданию учебных материалов (Flashcards).
Внимательно проанализируй следующий академический текст и выдели из него самые важные концепции, определения, даты или формулы.
Создай карточки для интервального повторения. Вопросы должны быть четкими, а ответы — лаконичными и точными.

Текст:
"""
${documentContext}
"""

Верни ответ СТРОГО в формате валидного JSON-массива без markdown-разметки (\`\`\`json...\`\`\`).
Формат:
[
  { "front": "Термин или вопрос", "back": "Определение или ответ" }
]
`;

    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    try {
      return JSON.parse(response.text);
    } catch (e) {
      console.error("Failed to parse JSON from Gemini:", response.text);
      throw new Error("Invalid response format from AI");
    }
  },

  async generateFlashcardsFromImage(base64Image, mimeType) {
    if (!this.isAvailable()) throw new Error('Gemini API key is missing');

    const prompt = `
Анализируй это изображение (это может быть страница конспекта, доска с лекции или схема).
Извлеки ключевые концепции, определения и формулы, и создай на их основе флеш-карточки.
Верни ответ СТРОГО в формате JSON без markdown-разметки:
[
  { "front": "Вопрос или термин", "back": "Ответ или определение" }
]
`;
    
    // Удаляем префикс data:image/jpeg;base64, если он есть
    const base64Data = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        }
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    try {
      return JSON.parse(response.text);
    } catch (e) {
      console.error("Failed to parse JSON from Vision model:", response.text);
      throw new Error("Invalid response format from AI");
    }
  },

  /**
   * Получение эмбеддинга.
   * @param {string} text
   * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'|'CLUSTERING'} taskType
   *   - RETRIEVAL_DOCUMENT: для индексации документов в БД
   *   - RETRIEVAL_QUERY: для поисковых запросов пользователя
   *   - CLUSTERING: для сравнения документов между собой (Constellation)
   */
  async getEmbedding(text, taskType = 'RETRIEVAL_DOCUMENT') {
    if (!this.isAvailable()) throw new Error('Gemini API key is missing');

    const response = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: text,
      config: {
        taskType,
        outputDimensionality: 768, // Оптимальный баланс качество/размер
      },
    });
    
    return response.embeddings[0].values;
  }
};
