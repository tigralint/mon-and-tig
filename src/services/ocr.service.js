/**
 * OCR-сервис на базе Tesseract.js (WASM, офлайн).
 * Языки: eng, rus, deu, fra.
 * Возвращает текст + координаты слов для текстового оверлея.
 */
import { createWorker } from 'tesseract.js';

let _worker = null;

const OCR_LANGS = ['eng', 'rus', 'deu', 'fra'];

const getWorker = async () => {
  if (_worker) return _worker;
  console.log(`🔤 Инициализация Tesseract OCR (${OCR_LANGS.join('+')})...`);
  _worker = await createWorker(OCR_LANGS, 1, { logger: () => {} });
  console.log('✅ Tesseract готов');
  return _worker;
};

/**
 * Предобработка canvas: grayscale + контраст + бинаризация.
 */
const preprocessCanvas = (canvas) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrast = 1.5;
    let val = ((gray - 128) * contrast) + 128;
    val = Math.max(0, Math.min(255, val));
    const final = val < 140 ? 0 : 255;
    data[i] = final;
    data[i + 1] = final;
    data[i + 2] = final;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

const getOptimalScale = (page) => {
  const viewport = page.getViewport({ scale: 1 });
  const targetWidth = 2000;
  const scale = targetWidth / viewport.width;
  return Math.max(1.5, Math.min(3, scale));
};

/**
 * OCR одной страницы. Возвращает текст + слова с координатами.
 * @returns {{ text: string, words: Array<{text, x, y, w, h}>, ocrWidth: number, ocrHeight: number }}
 */
export const ocrPage = async (page) => {
  const scale = getOptimalScale(page);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;
  preprocessCanvas(canvas);

  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);

  // Извлекаем слова с bounding boxes (нормализованные к 0-1)
  const words = (data.words || [])
    .filter(w => w.confidence > 30 && w.text.trim().length > 0)
    .map(w => ({
      text: w.text,
      x: w.bbox.x0 / canvas.width,
      y: w.bbox.y0 / canvas.height,
      w: (w.bbox.x1 - w.bbox.x0) / canvas.width,
      h: (w.bbox.y1 - w.bbox.y0) / canvas.height,
    }));

  // Постобработка текста
  const text = (data.text || '')
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/([^\n])\n([a-zа-яё])/g, '$1 $2');

  canvas.width = 0;
  canvas.height = 0;

  return { text, words };
};

/**
 * Проверяет, является ли страница сканом.
 */
export const isPageScanned = (pageText) => {
  const cleaned = pageText.replace(/\s+/g, '').trim();
  return cleaned.length < 20;
};

/**
 * OCR всех сканированных страниц. Возвращает обновлённые тексты + данные оверлея.
 * @returns {{ texts: string[], ocrPages: Object.<number, {words}> }}
 */
export const ocrScannedPages = async (pdfDoc, pageTexts, onProgress) => {
  const texts = [...pageTexts];
  const ocrPages = {}; // pageNum → { words }
  const scannedIndices = [];

  for (let i = 0; i < texts.length; i++) {
    if (isPageScanned(texts[i])) scannedIndices.push(i);
  }

  if (scannedIndices.length === 0) return { texts, ocrPages };

  console.log(`🔍 OCR: ${scannedIndices.length} сканированных страниц из ${texts.length}`);
  await getWorker();

  for (let idx = 0; idx < scannedIndices.length; idx++) {
    const pageIdx = scannedIndices[idx];
    const pageNum = pageIdx + 1;

    if (onProgress) {
      onProgress({
        page: idx + 1,
        total: scannedIndices.length,
        pct: Math.round((idx / scannedIndices.length) * 100),
        pageNum,
      });
    }

    const page = await pdfDoc.getPage(pageNum);
    const result = await ocrPage(page);

    texts[pageIdx] = result.text;
    ocrPages[pageNum] = { words: result.words };
  }

  if (onProgress) {
    onProgress({ page: scannedIndices.length, total: scannedIndices.length, pct: 100 });
  }

  return { texts, ocrPages };
};
