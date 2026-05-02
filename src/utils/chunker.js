/**
 * Паттерны мусорного текста в академических PDF
 * (сноски, библиография, номера страниц, колонтитулы, etc.)
 */
const JUNK_PATTERNS = [
  /^\d+\s*$/,                                    // Просто номер страницы
  /^page\s+\d+/i,                                // "Page 5"
  /^стр\.\s*\d+/i,                               // "Стр. 5"
  /^\s*\d+\s*\|\s*/,                              // "5 | "
  /^(см\.|ibid|op\.?\s*cit|loc\.?\s*cit)/i,      // Ссылки на сноски
  /^\[\d+\]\s*[A-ZА-Я]/,                         // [1] Author name...
  /^\d+\.\s+[A-ZА-Я][a-zа-я]+,?\s+[A-ZА-Я]\./,  // 1. Иванов, И.И. (библиография)
  /^https?:\/\//,                                  // URL
  /^(doi|isbn|issn|orcid)\s*[:.]?\s*\d/i,         // DOI, ISBN
  /^copyright\s*[©(]/i,                           // Copyright
  /^©\s*\d{4}/,                                   // © 2024
  /^(все права|all rights reserved)/i,            // Все права защищены
];

/**
 * Определяет, является ли текст "мусором" (сноска, библиография, колонтитул)
 */
const isJunkChunk = (text) => {
  const trimmed = text.trim();
  
  // Слишком короткий
  if (trimmed.length < 50) return true;
  
  // Слишком много цифр и спецсимволов (типичная сноска/библиография)
  const alphaRatio = (trimmed.match(/[a-zа-яё]/gi) || []).length / trimmed.length;
  if (alphaRatio < 0.4) return true;
  
  // Слишком много точек и запятых (списки ссылок)
  const dotCommaCount = (trimmed.match(/[.,;]/g) || []).length;
  if (dotCommaCount > trimmed.length * 0.1 && trimmed.length < 200) return true;
  
  // Проверяем паттерны мусора
  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  // Библиография: много строк начинаются с числа/буквы + точки
  const lines = trimmed.split('\n').filter(l => l.trim());
  if (lines.length >= 3) {
    const refLines = lines.filter(l => /^\s*(\d+\.|\[\d+\]|[A-ZА-Я][a-zа-я]+,\s*[A-ZА-Я])/.test(l));
    if (refLines.length / lines.length > 0.6) return true;
  }
  
  return false;
};

/**
 * Чанкер с предварительной очисткой текста
 */
export const chunkText = (text, maxChunkSize = 1000, overlapSize = 250) => {
  if (!text) return [];
  
  // Предварительная очистка
  let cleanText = text
    .replace(/\r\n/g, '\n')
    // Убираем повторяющиеся заголовки/колонтитулы (одинаковые строки, встречающиеся > 3 раз)
    .replace(/^(.{10,80})$(?=[\s\S]*^\1$(?=[\s\S]*^\1$))/gm, '')
    // Убираем множественные пустые строки
    .replace(/\n{4,}/g, '\n\n\n');
  
  const paragraphs = cleanText.split(/\n\s*\n/);
  
  const chunks = [];
  let currentChunk = '';
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    if (!paragraph) continue;
    
    // Если один абзац больше maxChunkSize, придётся резать его по предложениям
    if (paragraph.length > maxChunkSize) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
          const trimmedChunk = currentChunk.trim();
          if (!isJunkChunk(trimmedChunk)) {
            chunks.push(trimmedChunk);
          }
          
          // Делаем overlap из конца предыдущего чанка
          const overlapStart = Math.max(0, currentChunk.length - overlapSize);
          const safeOverlapStart = currentChunk.indexOf(' ', overlapStart);
          currentChunk = currentChunk.substring(safeOverlapStart !== -1 ? safeOverlapStart : overlapStart).trim() + ' ';
        }
        currentChunk += sentence.trim() + ' ';
      }
    } else {
      if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
        const trimmedChunk = currentChunk.trim();
        if (!isJunkChunk(trimmedChunk)) {
          chunks.push(trimmedChunk);
        }
        
        // Overlap на уровне целых абзацев, если возможно
        const overlapStart = Math.max(0, currentChunk.length - overlapSize);
        const safeOverlapStart = currentChunk.indexOf(' ', overlapStart);
        currentChunk = currentChunk.substring(safeOverlapStart !== -1 ? safeOverlapStart : overlapStart).trim() + '\n\n';
      }
      currentChunk += paragraph + '\n\n';
    }
  }
  
  if (currentChunk.trim().length > 0) {
    const trimmedChunk = currentChunk.trim();
    if (!isJunkChunk(trimmedChunk)) {
      chunks.push(trimmedChunk);
    }
  }
  
  return chunks;
};
