import { getDB } from '../db/database';
import { cosineSimilarity } from '../utils/cosine';
import { AIService } from './ai.service';

const CACHE_KEY = 'lumea_serendipity_cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 часа

export const SerendipityService = {
  /**
   * Получить "инсайт дня" — неожиданную связь между документами.
   * Кешируется на 24 часа.
   */
  async getDailyInsight() {
    // Проверяем кеш
    const cached = this._getCache();
    if (cached) return cached;

    try {
      const db = await getDB();
      const allChunks = await db.getAll('chunks');
      const documents = await db.getAll('documents');

      if (documents.length < 2 || allChunks.length < 4) {
        return null; // Недостаточно данных
      }

      const docMap = new Map(documents.map(d => [d.id, d]));

      // Группируем чанки по документам (только существующие документы!)
      const chunksByDoc = {};
      for (const chunk of allChunks) {
        if (!chunk.embedding) continue;
        if (!docMap.has(chunk.documentId)) continue; // пропускаем чанки удалённых документов
        if (!chunksByDoc[chunk.documentId]) chunksByDoc[chunk.documentId] = [];
        chunksByDoc[chunk.documentId].push(chunk);
      }

      const docIds = Object.keys(chunksByDoc).filter(id => chunksByDoc[id].length > 0);
      if (docIds.length < 2) return null;

      // Ищем пары чанков из РАЗНЫХ документов с "золотой" схожестью (0.25–0.55)
      let bestPair = null;
      let bestScore = 0;
      const maxAttempts = 50;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const docA = docIds[Math.floor(Math.random() * docIds.length)];
        let docB = docIds[Math.floor(Math.random() * docIds.length)];
        if (docA === docB) continue;

        const chunkA = chunksByDoc[docA][Math.floor(Math.random() * chunksByDoc[docA].length)];
        const chunkB = chunksByDoc[docB][Math.floor(Math.random() * chunksByDoc[docB].length)];

        const sim = cosineSimilarity(chunkA.embedding, chunkB.embedding);

        // "Золотой диапазон": достаточно похожи, чтобы быть связанными,
        // но достаточно разные, чтобы быть интересными
        if (sim >= 0.25 && sim <= 0.55 && sim > bestScore) {
          bestScore = sim;
          bestPair = {
            chunkA,
            chunkB,
            docA: docMap.get(docA),
            docB: docMap.get(docB),
            similarity: sim
          };
        }
      }

      if (!bestPair) return null;

      // Просим AI найти неожиданную связь
      const prompt = `Ты — интеллектуальный ассистент Lumea, который находит неожиданные междисциплинарные связи.

Фрагмент 1 (из документа "${bestPair.docA.name}"):
"""
${bestPair.chunkA.text.substring(0, 500)}
"""

Фрагмент 2 (из документа "${bestPair.docB.name}"):
"""
${bestPair.chunkB.text.substring(0, 500)}
"""

Найди одну неожиданную, но реальную связь между этими двумя фрагментами. 
Ответ должен быть элегантным и коротким (2-3 предложения).
Начни с интригующего наблюдения. Не используй слова "интересно" или "любопытно".`;

      const response = await AIService.generateContent(prompt);

      const insight = {
        text: response,
        docAName: bestPair.docA.name,
        docBName: bestPair.docB.name,
        timestamp: Date.now()
      };

      this._setCache(insight);
      return insight;

    } catch (error) {
      console.error('Serendipity Engine error:', error);
      return null;
    }
  },

  _getCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > CACHE_DURATION_MS) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return data;
    } catch { return null; }
  },

  _setCache(insight) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(insight));
    } catch { /* ignore */ }
  }
};
