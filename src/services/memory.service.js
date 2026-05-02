import { getDB } from '../db/database';
import { LocalEmbeddingService } from './local-embedding.service';
import { cosineSimilarity } from '../utils/cosine';

export const MemoryService = {
  /**
   * Сохраняет новый факт о пользователе в память
   * @param {string} factText Текстовое описание факта (например: "Пользователю трудно даются формулы физики")
   */
  async saveFact(factText) {
    if (!factText.trim()) return;
    
    try {
      const db = await getDB();
      const embedding = await LocalEmbeddingService.getEmbedding(factText, 'document');
      
      const memoryItem = {
        id: crypto.randomUUID(),
        text: factText,
        embedding,
        timestamp: new Date().toISOString()
      };
      
      await db.put('user_memory', memoryItem);
      console.log('Saved memory fact:', factText);
      return memoryItem;
    } catch (error) {
      console.error('Failed to save memory fact:', error);
    }
  },

  /**
   * Извлекает релевантные факты о пользователе на основе текущего запроса
   * @param {string} query Текущий контекст или вопрос
   * @param {number} topK Количество возвращаемых фактов
   * @param {number} threshold Минимальный порог схожести
   * @returns {Promise<string[]>} Массив текстовых фактов
   */
  async getRelevantMemory(query, topK = 3, threshold = 0.4) {
    if (!query.trim()) return [];

    try {
      const db = await getDB();
      const allMemories = await db.getAll('user_memory');
      
      if (allMemories.length === 0) return [];

      const queryEmbedding = await LocalEmbeddingService.getEmbedding(query, 'query');
      const results = [];

      for (const memory of allMemories) {
        if (!memory.embedding) continue;
        
        const similarity = cosineSimilarity(queryEmbedding, memory.embedding);
        if (similarity >= threshold) {
          results.push({
            text: memory.text,
            score: similarity
          });
        }
      }

      // Сортировка по релевантности
      results.sort((a, b) => b.score - a.score);
      
      return results.slice(0, topK).map(r => r.text);
    } catch (error) {
      console.error('Failed to retrieve memory:', error);
      return [];
    }
  },

  /**
   * Автоматически анализирует взаимодействие и извлекает факт для памяти
   * Вызывается в фоне, не блокируя UI
   */
  async extractAndSaveFact(contextText, userAction) {
    try {
      // Запрашиваем у Gemini извлечь факт о пользователе из взаимодействия
      const prompt = `
Анализируй действие пользователя и контекст.
Контекст: "${contextText}"
Действие пользователя: "${userAction}"

Есть ли в этом взаимодействии какая-то полезная информация о пользователе для долгосрочной памяти репетитора? 
Например: стиль обучения, пробелы в знаниях, интересы.
Если да, напиши ОДИН короткий факт (1 предложение) от 3-го лица. Например: "Студент путается в понятиях инфляции и дефляции".
Если ничего полезного нет, ответь строго словом "NONE".
`;
      const response = await AIService.generateContent(prompt);
      
      if (response && response !== "NONE" && response.length < 200) {
        await this.saveFact(response);
      }
    } catch (e) {
      console.error("Fact extraction failed", e);
    }
  }
};
