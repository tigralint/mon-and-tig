import { getDB } from '../db/database';
// Использование Web Workers в Vite:
import { pdfjs } from 'react-pdf';
import DocxWorker from '../workers/docx.worker?worker';

// Настройка встроенного воркера pdfjs (как в PdfViewer)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export const DocumentService = {
  async saveDocument(file) {
    const db = await getDB();
    
    // 1. Создаем запись документа
    const docId = crypto.randomUUID();
    const doc = {
      id: docId,
      name: file.name,
      type: file.type || file.name.split('.').pop(),
      size: file.size,
      blob: file, // Храним оригинальный файл
      textContent: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      folderId: null
    };

    // Сохраняем начальный статус (без текста)
    await db.put('documents', doc);

    // 2. Запускаем парсинг
    try {
      const text = await this.parseDocument(file);
      doc.textContent = text;
      doc.updatedAt = new Date().toISOString();
      await db.put('documents', doc);
      
      // Запускаем фоновую индексацию для поиска
      if (text) {
        import('./embedding.service').then(({ EmbeddingService }) => {
          EmbeddingService.indexDocument(doc.id, text).catch(e => console.error('Indexing failed', e));
        });
      }

      return doc;
    } catch (error) {
      console.error('Error parsing document:', error);
      throw error;
    }
  },

  async parseDocument(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (extension === 'pdf' || file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const typedArray = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjs.getDocument({ data: typedArray });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + '\n\n';
        }
        return fullText;
      } catch (error) {
        console.error("PDF Parsing error in main thread:", error);
        throw new Error('Parsing failed: ' + error.message);
      }
    }

    // Для остальных форматов (DOCX) продолжаем использовать кастомные Web Workers
    return new Promise((resolve, reject) => {
      let worker;
      if (extension === 'docx') {
        worker = new DocxWorker();
      } else {
        // Если это не PDF/DOCX (например, картинка), возвращаем пустой текст
        resolve('');
        return;
      }

      worker.onmessage = (e) => {
        const { success, text, error } = e.data;
        worker.terminate();
        if (success) {
          resolve(text);
        } else {
          reject(new Error(error || 'Parsing failed'));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(err);
      };

      // Передаем файл воркеру
      worker.postMessage({ file });
    });
  },

  async getAllDocuments() {
    const db = await getDB();
    return await db.getAll('documents');
  },
  
  async getDocument(id) {
    const db = await getDB();
    return await db.get('documents', id);
  },

  async deleteDocument(id) {
    const db = await getDB();
    
    // Удаляем связанные chunks для RAG
    const allChunks = await db.getAll('chunks');
    if (allChunks && allChunks.length > 0) {
      const chunksToDelete = allChunks.filter(c => c.documentId === id);
      for (const chunk of chunksToDelete) {
        await db.delete('chunks', chunk.id);
      }
    }

    // Удаляем связанные flashcards
    const allCards = await db.getAll('flashcards');
    if (allCards && allCards.length > 0) {
      const cardsToDelete = allCards.filter(c => c.documentId === id);
      for (const card of cardsToDelete) {
        await db.delete('flashcards', card.id);
      }
    }

    // Удаляем связанные summaries
    const allSummaries = await db.getAll('summaries');
    if (allSummaries && allSummaries.length > 0) {
      const summariesToDelete = allSummaries.filter(s => s.documentId === id);
      for (const summary of summariesToDelete) {
        await db.delete('summaries', summary.id);
      }
    }

    // Удаляем сам документ
    await db.delete('documents', id);
  },

  async renameDocument(id, newName) {
    const db = await getDB();
    const doc = await db.get('documents', id);
    if (doc) {
      doc.name = newName;
      doc.updatedAt = new Date().toISOString();
      await db.put('documents', doc);
      return doc;
    }
    throw new Error('Документ не найден');
  }
};
