import { getDB } from '../db/database';
import { LocalEmbeddingService } from './local-embedding.service';
import { chunkText } from '../utils/chunker';
import { cosineSimilarity } from '../utils/cosine';

export const EmbeddingService = {
  // Индексация документа
  async indexDocument(documentId, textContent) {
    if (!textContent) return;
    const db = await getDB();
    
    // Проверяем, не проиндексирован ли уже
    const existingChunks = await db.getAllFromIndex('chunks', 'documentId', documentId);
    if (existingChunks.length > 0) return; // Уже проиндексирован

    await this._doIndex(db, documentId, textContent);
  },

  // Переиндексация документа (удаляет старые чанки и создаёт новые)
  async reindexDocument(documentId, textContent) {
    if (!textContent) return;
    const db = await getDB();
    
    // Удаляем старые чанки
    const oldChunks = await db.getAllFromIndex('chunks', 'documentId', documentId);
    const tx = db.transaction('chunks', 'readwrite');
    for (const chunk of oldChunks) {
      await tx.store.delete(chunk.id);
    }
    await tx.done;

    await this._doIndex(db, documentId, textContent);
  },

  // Внутренний метод индексации — полностью локальный, без API
  async _doIndex(db, documentId, textContent) {
    const document = await db.get('documents', documentId);
    const docName = document ? document.name : 'Неизвестный документ';

    // Чанки по 2000 символов с overlap 400
    const chunks = chunkText(textContent, 2000, 400); 

    console.log(`📄 ${docName}: ${chunks.length} чанков → генерируем эмбеддинги локально...`);

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      try {
        // EmbeddingGemma: mode='document' добавляет префикс "title: ... | text: ..."
        const contextualizedText = `${docName}: ${text}`;
        const embedding = await LocalEmbeddingService.getEmbedding(contextualizedText, 'document');
        
        await db.put('chunks', {
          id: crypto.randomUUID(),
          documentId,
          text,
          pageNum: i + 1,
          embedding
        });

        // Лог прогресса каждые 5 чанков
        if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
          console.log(`  ✓ ${i + 1}/${chunks.length}`);
        }
      } catch (error) {
        console.error(`Failed to index chunk ${i}`, error);
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
