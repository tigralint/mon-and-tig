import { getDB } from '../db/database';
import { LocalEmbeddingService } from './local-embedding.service';
import { chunkText } from '../utils/chunker';
import { cosineSimilarity } from '../utils/cosine';

const BATCH_SIZE = 4; // Chunks per GPU forward pass

// ─── In-memory cache for document average embeddings ───
let _docEmbeddingCache = null; // Map<docId, { avg: number[], chunkCount: number }>

const invalidateCache = () => { _docEmbeddingCache = null; };

/**
 * Загружает/обновляет кеш средних эмбеддингов документов.
 * Используется для быстрой предфильтрации перед поиском по чанкам.
 */
const ensureDocEmbeddingCache = async () => {
  if (_docEmbeddingCache) return _docEmbeddingCache;

  const db = await getDB();
  const allChunks = await db.getAll('chunks');

  const cache = new Map();
  const chunksByDoc = {};

  for (const chunk of allChunks) {
    if (!chunk.embedding) continue;
    if (!chunksByDoc[chunk.documentId]) chunksByDoc[chunk.documentId] = [];
    chunksByDoc[chunk.documentId].push(chunk.embedding);
  }

  for (const [docId, embeddings] of Object.entries(chunksByDoc)) {
    if (embeddings.length === 0) continue;
    const dim = embeddings[0].length;
    const avg = new Array(dim).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) avg[i] += emb[i];
    }
    for (let i = 0; i < dim; i++) avg[i] /= embeddings.length;
    cache.set(docId, { avg, chunkCount: embeddings.length });
  }

  _docEmbeddingCache = cache;
  return cache;
};

export const EmbeddingService = {
  // Индексация документа
  async indexDocument(documentId, textContent, onProgress) {
    if (!textContent) return;
    const db = await getDB();
    
    // Проверяем, не проиндексирован ли уже
    const existingChunks = await db.getAllFromIndex('chunks', 'documentId', documentId);
    if (existingChunks.length > 0) return; // Уже проиндексирован

    await this._doIndex(db, documentId, textContent, onProgress);
    invalidateCache(); // Сбрасываем кеш при индексации
  },

  // Переиндексация документа (удаляет старые чанки и создаёт новые)
  async reindexDocument(documentId, textContent, onProgress) {
    if (!textContent) return;
    const db = await getDB();
    
    // Удаляем старые чанки
    const oldChunks = await db.getAllFromIndex('chunks', 'documentId', documentId);
    const tx = db.transaction('chunks', 'readwrite');
    for (const chunk of oldChunks) {
      await tx.store.delete(chunk.id);
    }
    await tx.done;

    await this._doIndex(db, documentId, textContent, onProgress);
    invalidateCache(); // Сбрасываем кеш при переиндексации
  },

  // Внутренний метод индексации — батчами для GPU-эффективности
  async _doIndex(db, documentId, textContent, onProgress) {
    const document = await db.get('documents', documentId);
    const docName = document ? document.name : 'Неизвестный документ';

    // Чанки по 1000 символов с overlap 200 (более точные эмбеддинги)
    const chunks = chunkText(textContent, 1000, 200); 

    console.log(`📄 ${docName}: ${chunks.length} чанков → батч×${BATCH_SIZE}`);

    // Обрабатываем батчами
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchTexts = batch.map(text => `${docName}: ${text}`);

      try {
        const embeddings = await LocalEmbeddingService.getEmbeddings(batchTexts, 'document');

        // Сохраняем результаты батча в DB
        const tx = db.transaction('chunks', 'readwrite');
        for (let j = 0; j < batch.length; j++) {
          await tx.store.put({
            id: crypto.randomUUID(),
            documentId,
            text: batch[j],
            pageNum: i + j + 1,
            embedding: embeddings[j],
          });
        }
        await tx.done;

        // Прогресс
        const done = Math.min(i + BATCH_SIZE, chunks.length);
        const pct = Math.round((done / chunks.length) * 100);
        if (onProgress) onProgress({ done, total: chunks.length, pct });
        if (done % (BATCH_SIZE * 2) === 0 || done === chunks.length) {
          console.log(`  ✓ ${done}/${chunks.length} (${pct}%)`);
        }
      } catch (error) {
        console.error(`Failed batch ${i}-${i + batch.length}:`, error);
        // Fallback: поштучно
        for (let j = 0; j < batch.length; j++) {
          try {
            const embedding = await LocalEmbeddingService.getEmbedding(`${docName}: ${batch[j]}`, 'document');
            await db.put('chunks', {
              id: crypto.randomUUID(),
              documentId,
              text: batch[j],
              pageNum: i + j + 1,
              embedding,
            });
          } catch (e2) {
            console.error(`Failed chunk ${i + j}:`, e2);
          }
        }
      }
    }
  },

  /**
   * Двухуровневый семантический поиск:
   * 1. Быстрая предфильтрация: находим top-N документов по средним эмбеддингам
   * 2. Точный поиск: ищем лучшие чанки ТОЛЬКО среди этих документов
   * 
   * Это даёт 5-10x ускорение при 100+ документах.
   */
  async search(query, topK = 5, threshold = 0.3) {
    if (!query.trim()) return [];
    
    const queryEmbedding = await LocalEmbeddingService.getEmbedding(query, 'query');
    const db = await getDB();

    // Шаг 1: Предфильтрация по средним эмбеддингам документов
    const docCache = await ensureDocEmbeddingCache();
    const documents = await db.getAll('documents');
    const docMap = new Map(documents.map(d => [d.id, d]));

    // Ранжируем документы по схожести средних эмбеддингов
    const docScores = [];
    for (const [docId, { avg }] of docCache.entries()) {
      if (!docMap.has(docId)) continue; // Пропускаем удалённые
      const sim = cosineSimilarity(queryEmbedding, avg);
      if (sim >= threshold * 0.7) { // Порог чуть ниже, чтобы не пропустить
        docScores.push({ docId, sim });
      }
    }

    docScores.sort((a, b) => b.sim - a.sim);

    // Берём top-8 документов (или все, если их мало)
    const topDocCount = Math.min(8, Math.max(3, docScores.length));
    const targetDocIds = new Set(docScores.slice(0, topDocCount).map(d => d.docId));

    // Шаг 2: Точный поиск среди чанков выбранных документов
    const results = [];

    for (const docId of targetDocIds) {
      const docChunks = await db.getAllFromIndex('chunks', 'documentId', docId);
      
      for (const chunk of docChunks) {
        if (!chunk.embedding) continue;
        
        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        if (similarity >= threshold) {
          results.push({
            chunk,
            document: docMap.get(chunk.documentId),
            score: similarity
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
};
