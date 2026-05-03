import { pipeline, env } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const TARGET_DIM = 384;

let extractor = null;
let activeDevice = 'wasm';

const progressCb = (progress) => {
  if (progress.status === 'progress' && progress.total) {
    const pct = Math.round((progress.loaded / progress.total) * 100);
    const mbLoaded = (progress.loaded / 1024 / 1024).toFixed(0);
    const mbTotal = (progress.total / 1024 / 1024).toFixed(0);
    self.postMessage({ type: 'progress', pct, mbLoaded, mbTotal, file: progress.file });
  } else if (progress.status === 'done') {
    self.postMessage({ type: 'progress', pct: 100, done: true, file: progress.file });
  }
};

const checkWebGPU = async () => {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
};

// MiniLM не требует специальных префиксов для разделения запросов/документов
const addPrefix = (text) => {
  return text.length > 2000 ? text.substring(0, 2000) : text;
};

const loadModel = async () => {
  if (extractor) return;

  const hasWebGPU = await checkWebGPU();

  // Попытка 1: WebGPU
  if (hasWebGPU) {
    try {
      console.log('🚀 Loading paraphrase-multilingual-MiniLM-L12-v2 (WebGPU)...');
      self.postMessage({ type: 'progress', pct: 5, status: 'Загрузка модели (WebGPU)...' });

      extractor = await pipeline('feature-extraction', MODEL_ID, {
        device: 'webgpu',
        dtype: 'fp32',
        progress_callback: progressCb,
      });

      // Warmup — проверяем что inference реально работает
      console.log('🔥 WebGPU warmup...');
      const warmupResult = await extractor('warmup test', { pooling: 'mean', normalize: true });
      if (!warmupResult || !warmupResult.data) throw new Error('Empty warmup result');

      activeDevice = 'webgpu';
      console.log('✅ Model ready (WebGPU fp32)');
    } catch (gpuErr) {
      console.warn('⚠️ WebGPU failed, falling back to WASM:', gpuErr.message);
      // Dispose broken pipeline
      if (extractor?.dispose) {
        try { await extractor.dispose(); } catch { }
      }
      extractor = null;
    }
  }

  // Попытка 2: WASM (q8 квантизация, гарантированно работает)
  if (!extractor) {
    console.log('🔄 Loading paraphrase-multilingual-MiniLM-L12-v2 (WASM q8)...');
    self.postMessage({ type: 'progress', pct: 5, status: 'Загрузка модели (WASM)...' });

    extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      progress_callback: progressCb,
    });

    // WASM warmup
    console.log('🔥 WASM warmup...');
    const t0 = performance.now();
    await extractor('warmup test', { pooling: 'mean', normalize: true });
    activeDevice = 'wasm';
    console.log(`✅ Model ready (WASM q8) in ${(performance.now() - t0).toFixed(0)}ms`);
  }

  self.postMessage({
    type: 'progress',
    pct: 100,
    done: true,
    modelReady: true,
    device: activeDevice,
  });
};

// ─── Single embed ───
const embed = async (text, mode) => {
  const prefixed = addPrefix(text, mode);
  const result = await extractor(prefixed, { pooling: 'mean', normalize: true });
  return Array.from(result.data).slice(0, TARGET_DIM);
};

// ─── Batch embed ───
const embedBatch = async (texts, modes) => {
  const prefixed = texts.map((t, i) => addPrefix(t, modes?.[i] || 'document'));
  const results = [];

  // Pipeline API может батчить, но для надёжности — по одному
  // (избегаем OOM на GPU при большом батче)
  for (let i = 0; i < prefixed.length; i++) {
    const result = await extractor(prefixed[i], { pooling: 'mean', normalize: true });
    results.push(Array.from(result.data).slice(0, TARGET_DIM));

    // Progress для длинных батчей
    if (texts.length > 5 && i % 5 === 0) {
      self.postMessage({ type: 'batchProgress', current: i + 1, total: texts.length });
    }
  }
  return results;
};

// ─── Message handler ───
self.onmessage = async (e) => {
  const { type, id, text, mode, texts, modes } = e.data;

  try {
    switch (type) {
      case 'preload': {
        await loadModel();
        self.postMessage({ type: 'preloaded', id, device: activeDevice });
        break;
      }
      case 'embed': {
        if (!extractor) await loadModel();
        const embedding = await embed(text, mode);
        self.postMessage({ type: 'result', id, embedding });
        break;
      }
      case 'embedBatch': {
        if (!extractor) await loadModel();
        const embeddings = await embedBatch(texts, modes);
        self.postMessage({ type: 'batchResult', id, embeddings });
        break;
      }
      default:
        self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` });
    }
  } catch (err) {
    console.error('Worker error:', err);
    self.postMessage({ type: 'error', id, error: err.message });
  }
};
