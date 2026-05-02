import { getDB } from '../db/database';
import { LocalEmbeddingService } from './local-embedding.service';
import { chunkText } from '../utils/chunker';
import { cosineSimilarity } from '../utils/cosine';

const BATCH_SIZE = 4; // Chunks per GPU forward pass

export const EmbeddingService = {
  // Индексация документа
  async indexDocument(documentId, textContent, onProgress) {
    if (!textContent) return;
    const db = await getDB();
    
    // Проверяем, не проиндексирован ли уже
    const existingChunks = await db.getAllFromIndex('chunks', 'documentId', documentId);
    if (existingChunks.length > 0) return; // Уже проиндексирован

    await this._doIndex(db, documentId, textContent, onProgress);
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

  // Семантический поиск — тоже локальный
  async search(query, topK = 5, threshold = 0.3) {
    if (!query.trim()) return [];
    
    // EmbeddingGemma: mode='query' добавляет префикс "task: search result | query: ..."
    const queryEmbedding = await LocalEmbeddingService.getEmbedding(query, 'query');
    const db = await getDB();
    
    const allChunks = await db.getAll('chunks');
    const documents = await db.getAll('documents');
    const docMap = new Map(documents.map(d => [d.id, d]));

    const results = [];

    for (const chunk of allChunks) {
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

    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, topK);
  }
};
