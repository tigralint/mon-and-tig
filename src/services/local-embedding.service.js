/**
 * Локальный Embedding Service — EmbeddingGemma 300M
 * 
 * Прокси к Web Worker. Поддерживает single и batch embedding.
 * WebGPU → WASM fallback, warmup, батчинг — всё в worker.
 */

let worker = null;
let requestId = 0;
const pending = new Map();

let _progressListeners = [];

export const onLoadProgress = (fn) => {
  _progressListeners.push(fn);
  return () => { _progressListeners = _progressListeners.filter(f => f !== fn); };
};

const notifyProgress = (data) => {
  _progressListeners.forEach(fn => fn(data));
};

const getWorker = () => {
  if (worker) return worker;
  worker = new Worker(new URL('./embedding.worker.js', import.meta.url), { type: 'module' });

  worker.onmessage = (e) => {
    const { type, id, embedding, embeddings, error, device, ...rest } = e.data;

    switch (type) {
      case 'progress':
        notifyProgress(rest);
        if (rest.error) notifyProgress({ error: rest.error });
        break;

      case 'result': {
        const p = pending.get(id);
        if (p) { pending.delete(id); p.resolve(embedding); }
        break;
      }

      case 'batchResult': {
        const p = pending.get(id);
        if (p) { pending.delete(id); p.resolve(embeddings); }
        break;
      }

      case 'preloaded': {
        const p = pending.get(id);
        if (p) { pending.delete(id); p.resolve(device); }
        break;
      }

      case 'error': {
        const p = pending.get(id);
        if (p) { pending.delete(id); p.reject(new Error(error)); }
        else console.error('Worker error:', error);
        break;
      }
    }
  };

  worker.onerror = (err) => {
    console.error('Embedding worker error:', err);
    notifyProgress({ error: err.message });
  };

  return worker;
};

const send = (message) => {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...message, id });
  });
};

export const LocalEmbeddingService = {
  /**
   * Получить эмбеддинг для одного текста
   */
  async getEmbedding(text, mode = 'document') {
    return send({ type: 'embed', text, mode });
  },

  /**
   * Получить эмбеддинги для батча текстов (GPU-оптимизировано)
   * @param {string[]} texts
   * @param {string|string[]} mode — один режим для всех или массив
   * @returns {Promise<number[][]>}
   */
  async getEmbeddings(texts, mode = 'document') {
    const modes = Array.isArray(mode) ? mode : texts.map(() => mode);
    return send({ type: 'embedBatch', texts, modes });
  },

  isLoaded() {
    return !!worker;
  },

  /**
   * Предзагрузить модель + warmup. Возвращает активный device ('webgpu'|'wasm').
   */
  async preload() {
    return send({ type: 'preload' });
  }
};
