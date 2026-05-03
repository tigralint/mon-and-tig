import { getDB } from '../db/database';
import { pdfjs } from 'react-pdf';
import DocxWorker from '../workers/docx.worker?worker';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ─── Глобальный статус обработки документов ───
let _processingDocs = new Map(); // docId → { name, status, pct }
let _processListeners = [];

const notifyProcessing = () => _processListeners.forEach(fn => fn(new Map(_processingDocs)));

export const onProcessingUpdate = (fn) => {
  _processListeners.push(fn);
  fn(new Map(_processingDocs));
  return () => { _processListeners = _processListeners.filter(f => f !== fn); };
};

export const DocumentService = {
  /**
   * Сохраняет документ, парсит текст, при необходимости запускает OCR.
   * Процесс парсинга идёт СИНХРОННО (await) — чтобы документ был полностью
   * готов к просмотру. Прогресс пушится через onProcessingUpdate.
   */
  async saveDocument(file) {
    const db = await getDB();
    
    const docId = crypto.randomUUID();
    const doc = {
      id: docId,
      name: file.name,
      type: file.type || file.name.split('.').pop(),
      size: file.size,
      blob: file,
      textContent: '',
      ocrPages: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      folderId: null
    };

    // Сохраняем сразу (появится в списке)
    await db.put('documents', doc);

    // Статус: начинаем парсинг
    _processingDocs.set(docId, { name: file.name, status: '📄 Парсинг...', pct: 0 });
    notifyProcessing();

    try {
      // Парсим (включая OCR если нужно)
      const result = await this._parseWithOCR(file, (info) => {
        _processingDocs.set(docId, { name: file.name, ...info });
        notifyProcessing();
      });

      doc.textContent = result.text;
      if (result.ocrPages) doc.ocrPages = result.ocrPages;
      doc.updatedAt = new Date().toISOString();
      await db.put('documents', doc);

      _processingDocs.set(docId, { name: file.name, status: '✅ Готово', pct: 100 });
      notifyProcessing();
      setTimeout(() => { _processingDocs.delete(docId); notifyProcessing(); }, 3000);

      // Фоновая индексация (это можно в фоне — не блокирует)
      if (result.text) {
        import('./embedding.service').then(({ EmbeddingService }) => {
          EmbeddingService.indexDocument(doc.id, result.text).catch(e => console.error('Indexing failed', e));
        });
      }

      return doc;
    } catch (error) {
      console.error('Processing failed:', error);
      _processingDocs.set(docId, { name: file.name, status: `❌ ${error.message}`, pct: -1 });
      notifyProcessing();
      // Документ уже в DB (без текста), не удаляем — пользователь может переиндексировать
      return doc;
    }
  },

  /**
   * Парсит документ + OCR при необходимости.
   * @returns {{ text: string, ocrPages: Object|null }}
   */
  async _parseWithOCR(file, onStatus) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (extension === 'pdf' || file.type === 'application/pdf') {
      return this._parsePdfWithOCR(file, onStatus);
    }

    if (extension === 'docx') {
      const text = await this._parseDocx(file);
      return { text, ocrPages: null };
    }

    // PowerPoint (.pptx)
    if (extension === 'pptx') {
      onStatus?.({ status: '📊 Парсим презентацию...', pct: 30 });
      const text = await this._parsePptx(file);
      return { text, ocrPages: null };
    }

    // Markdown (.md)
    if (extension === 'md') {
      onStatus?.({ status: '📝 Читаем Markdown...', pct: 50 });
      const text = await file.text();
      return { text, ocrPages: null };
    }

    // Plain text (.txt)
    if (extension === 'txt') {
      onStatus?.({ status: '📄 Читаем текст...', pct: 50 });
      const text = await file.text();
      return { text, ocrPages: null };
    }

    // Images → OCR
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(extension) || file.type?.startsWith('image/')) {
      onStatus?.({ status: '🔤 OCR: распознаём изображение...', pct: 20 });
      const text = await this._parseImage(file, onStatus);
      return { text, ocrPages: null };
    }

    // Неизвестный формат — пробуем как текст
    try {
      const text = await file.text();
      if (text && text.length > 10) return { text, ocrPages: null };
    } catch { /* ignore */ }

    return { text: '', ocrPages: null };
  },

  /**
   * Парсинг PowerPoint (.pptx) — извлечение текста из слайдов.
   */
  async _parsePptx(file) {
    try {
      const { default: parsePptx } = await import('pptx-parser');
      const arrayBuffer = await file.arrayBuffer();
      const result = await parsePptx(arrayBuffer);

      // pptx-parser возвращает массив слайдов, каждый с текстовым содержимым
      if (Array.isArray(result)) {
        return result
          .map((slide, i) => {
            const texts = [];
            if (slide.title) texts.push(slide.title);
            if (slide.content) texts.push(typeof slide.content === 'string' ? slide.content : JSON.stringify(slide.content));
            if (slide.notes) texts.push(`[Заметки]: ${slide.notes}`);
            if (slide.text) texts.push(slide.text);
            return `--- Слайд ${i + 1} ---\n${texts.join('\n')}`;
          })
          .join('\n\n');
      }

      // Fallback: если результат — строка
      if (typeof result === 'string') return result;
      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.error('PPTX parsing failed:', error);
      throw new Error(`Ошибка парсинга PowerPoint: ${error.message}`);
    }
  },

  /**
   * OCR одного изображения через Tesseract.
   */
  async _parseImage(file, onStatus) {
    try {
      const { createWorker } = await import('tesseract.js');
      
      onStatus?.({ status: '🔤 OCR: загружаем модель...', pct: 30 });
      const worker = await createWorker(['eng', 'rus', 'deu', 'fra'], 1, { logger: () => {} });
      
      onStatus?.({ status: '🔤 OCR: распознаём текст...', pct: 60 });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      
      return (data.text || '').trim();
    } catch (error) {
      console.error('Image OCR failed:', error);
      throw new Error(`Ошибка OCR: ${error.message}`);
    }
  },


  async _parsePdfWithOCR(file, onStatus) {
    onStatus?.({ status: '📄 Читаем PDF...', pct: 5 });
    
    const arrayBuffer = await file.arrayBuffer();
    const typedArray = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjs.getDocument({ data: typedArray });
    const pdf = await loadingTask.promise;

    console.log(`📄 PDF: ${file.name}, ${pdf.numPages} страниц`);
    onStatus?.({ status: `📄 Извлекаем текст (${pdf.numPages} стр.)...`, pct: 10 });

    // Шаг 1: pdfjs текст
    const pageTexts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      pageTexts.push(pageText);
      const chars = pageText.replace(/\s+/g, '').length;
      console.log(`  стр.${i}: ${chars} символов${chars < 20 ? ' ← СКАН' : ''}`);
    }

    // Шаг 2: OCR для сканов
    const { isPageScanned, ocrScannedPages } = await import('./ocr.service');
    const scanCount = pageTexts.filter(t => isPageScanned(t)).length;
    console.log(`🔍 ${scanCount} сканов из ${pageTexts.length} страниц`);

    let ocrPages = null;

    if (scanCount > 0) {
      onStatus?.({ status: `🔤 OCR: загружаем модель (eng+rus+deu+fra)...`, pct: 15 });

      const result = await ocrScannedPages(pdf, pageTexts, ({ page, total, pct, pageNum }) => {
        const overallPct = 15 + Math.round((pct / 100) * 80);
        onStatus?.({ status: `🔤 OCR: стр.${pageNum} (${page}/${total})`, pct: overallPct });
      });

      onStatus?.({ status: '📄 Сохраняем...', pct: 95 });
      return { text: result.texts.join('\n\n'), ocrPages: result.ocrPages };
    }

    return { text: pageTexts.join('\n\n'), ocrPages: null };
  },

  _parseDocx(file) {
    return new Promise((resolve, reject) => {
      const worker = new DocxWorker();
      worker.onmessage = (e) => {
        const { success, text, error } = e.data;
        worker.terminate();
        if (success) resolve(text);
        else reject(new Error(error || 'DOCX parsing failed'));
      };
      worker.onerror = (err) => {
        worker.terminate();
        reject(err);
      };
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
    
    const allChunks = await db.getAll('chunks');
    if (allChunks?.length > 0) {
      const chunksToDelete = allChunks.filter(c => c.documentId === id);
      for (const chunk of chunksToDelete) {
        await db.delete('chunks', chunk.id);
      }
    }

    const allCards = await db.getAll('flashcards');
    if (allCards?.length > 0) {
      const cardsToDelete = allCards.filter(c => c.documentId === id);
      for (const card of cardsToDelete) {
        await db.delete('flashcards', card.id);
      }
    }

    const allSummaries = await db.getAll('summaries');
    if (allSummaries?.length > 0) {
      const summariesToDelete = allSummaries.filter(s => s.documentId === id);
      for (const summary of summariesToDelete) {
        await db.delete('summaries', summary.id);
      }
    }

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
