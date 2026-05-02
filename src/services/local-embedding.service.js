/**
 * Локальный Embedding Service — EmbeddingGemma 300M
 * 
 * Google DeepMind модель, созданная для on-device.
 * - 100+ языков (русский, английский)
 * - Matryoshka: можно резать 768 → 256 dim
 * - Task-aware: разные префиксы для search/clustering
 * - Работает без API, офлайн после первой загрузки
 */

import { AutoModel, AutoTokenizer } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';
const TARGET_DIM = 256; // Matryoshka — режем до 256 для баланса качество/размер

let modelPromise = null;
let tokenizerPromise = null;
let modelInstance = null;
let tokenizerInstance = null;

// Глобальный прогресс загрузки (подписчики могут слушать)
let _progressListeners = [];

export const onLoadProgress = (fn) => {
  _progressListeners.push(fn);
  return () => { _progressListeners = _progressListeners.filter(f => f !== fn); };
};

const notifyProgress = (data) => {
  _progressListeners.forEach(fn => fn(data));
};

/**
 * Ленивая загрузка модели
 */
const getModel = async () => {
  if (modelInstance) return modelInstance;
  if (!modelPromise) {
    console.log('🧠 Загружаем EmbeddingGemma-300M...');
    modelPromise = AutoModel.from_pretrained(MODEL_ID, {
      // Используем dtype как в официальном README — библиотека сама найдёт нужный файл
      // q8 (309MB) — работает в WASM, q4 нет (GatherBlockQuantized)
      dtype: 'q8',
      progress_callback: (progress) => {
        if (progress.status === 'progress' && progress.total) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          const mbLoaded = (progress.loaded / 1024 / 1024).toFixed(0);
          const mbTotal = (progress.total / 1024 / 1024).toFixed(0);
          notifyProgress({ pct, mbLoaded, mbTotal, file: progress.file });
          console.log(`⬇️ ${progress.file}: ${mbLoaded}/${mbTotal}MB (${pct}%)`);
        } else if (progress.status === 'done') {
          notifyProgress({ pct: 100, done: true, file: progress.file });
        }
      },
    }).then(m => {
      modelInstance = m;
      console.log('✅ Модель загружена');
      notifyProgress({ pct: 100, done: true, modelReady: true });
      return m;
    }).catch(err => {
      console.error('❌ Ошибка загрузки модели:', err);
      modelPromise = null;
      notifyProgress({ error: err.message });
      throw err;
    });
  }
  return modelPromise;
};

const getTokenizer = async () => {
  if (tokenizerInstance) return tokenizerInstance;
  if (!tokenizerPromise) {
    tokenizerPromise = AutoTokenizer.from_pretrained(MODEL_ID).then(t => {
      tokenizerInstance = t;
      return t;
    }).catch(err => {
      tokenizerPromise = null;
      throw err;
    });
  }
  return tokenizerPromise;
};

/**
 * Нормализация вектора (L2 norm)
 */
const normalize = (vec) => {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
};

export const LocalEmbeddingService = {
  /**
   * Получить эмбеддинг для текста
   * @param {string} text
   * @param {'document'|'query'|'clustering'} mode - тип задачи
   * @returns {Promise<number[]>} - вектор 256d
   */
  async getEmbedding(text, mode = 'document') {
    const [model, tokenizer] = await Promise.all([getModel(), getTokenizer()]);
    
    // Обрезаем до ~512 токенов
    const truncated = text.length > 2000 ? text.substring(0, 2000) : text;
    
    // Task-aware prefix для EmbeddingGemma
    let prefixed;
    switch (mode) {
      case 'query':
        prefixed = `task: search result | query: ${truncated}`;
        break;
      case 'clustering':
        prefixed = `task: categorize the text | query: ${truncated}`;
        break;
      case 'document':
      default:
        prefixed = `title: none | text: ${truncated}`;
        break;
    }
    
    // Отдаём управление UI перед тяжёлым вычислением
    await new Promise(r => setTimeout(r, 0));
    
    const t0 = performance.now();
    const inputs = await tokenizer(prefixed, { padding: true, truncation: true });
    const output = await model(inputs);
    const ms = (performance.now() - t0).toFixed(0);
    console.log(`⚡ Embedding: ${ms}ms (${truncated.substring(0, 40)}...)`);
    
    // Извлекаем полный вектор
    const fullEmbedding = Array.from(output.sentence_embedding.data);
    
    // Matryoshka truncation — режем до TARGET_DIM и перенормализуем
    const truncatedVec = fullEmbedding.slice(0, TARGET_DIM);
    return normalize(truncatedVec);
  },

  /**
   * Проверить, загружена ли модель
   */
  isLoaded() {
    return !!modelInstance && !!tokenizerInstance;
  },

  /**
   * Предзагрузить модель (для прогрева)
   */
  async preload() {
    await Promise.all([getModel(), getTokenizer()]);
  }
};
