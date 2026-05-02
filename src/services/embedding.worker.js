/**
 * Web Worker для EmbeddingGemma-300M.
 * WASM backend + батчинг + warmup.
 * 
 * NOTE: WebGPU отключён — EmbeddingGemma имеет несовместимый LayerNorm shader
 * с ONNX Runtime Web. Когда ort-web или модель обновятся — можно вернуть.
 */
import { AutoModel, AutoTokenizer } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';
const TARGET_DIM = 384;
const FULL_DIM = 768;

let model = null;
let tokenizer = null;

const normalize = (vec) => {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
};

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

const loadTokenizer = async () => {
  if (tokenizer) return;
  tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
};

const loadModel = async () => {
  if (model) return;

  console.log('🔄 Loading EmbeddingGemma (WASM q8)...');
  model = await AutoModel.from_pretrained(MODEL_ID, {
    dtype: 'q8',
    progress_callback: progressCb,
  });
  console.log('✅ Model loaded (WASM q8)');

  // Warmup: JIT-compile with a dummy inference
  if (!tokenizer) await loadTokenizer();
  console.log('🔥 Warmup...');
  const t0 = performance.now();
  const inputs = await tokenizer('warmup', { padding: true, truncation: true });
  await model(inputs);
  console.log(`🔥 Warmup done in ${(performance.now() - t0).toFixed(0)}ms`);

  self.postMessage({ type: 'progress', pct: 100, done: true, modelReady: true, device: 'wasm' });
};

const addPrefix = (text, mode) => {
  const truncated = text.length > 2000 ? text.substring(0, 2000) : text;
  switch (mode) {
    case 'query': return `task: search result | query: ${truncated}`;
    case 'clustering': return `task: categorize the text | query: ${truncated}`;
    default: return `title: none | text: ${truncated}`;
  }
};

// ─── Single embed ───
const embed = async (text, mode) => {
  const prefixed = addPrefix(text, mode);
  const inputs = await tokenizer(prefixed, { padding: true, truncation: true });
  const output = await model(inputs);
  const full = Array.from(output.sentence_embedding.data);
  return normalize(full.slice(0, TARGET_DIM));
};

// ─── Batch embed ───
const embedBatch = async (texts, modes) => {
  const prefixed = texts.map((t, i) => addPrefix(t, modes?.[i] || 'document'));
  const inputs = await tokenizer(prefixed, { padding: true, truncation: true });
  const output = await model(inputs);
  const data = output.sentence_embedding.data;

  const results = [];
  for (let i = 0; i < texts.length; i++) {
    const offset = i * FULL_DIM;
    const full = Array.from(data.slice(offset, offset + FULL_DIM));
    results.push(normalize(full.slice(0, TARGET_DIM)));
  }
  return results;
};

// ─── Message handler ───
self.onmessage = async (e) => {
  const { type, id, text, mode, texts, modes } = e.data;

  try {
    switch (type) {
      case 'preload': {
        await Promise.all([loadModel(), loadTokenizer()]);
        self.postMessage({ type: 'preloaded', id, device: 'wasm' });
        break;
      }
      case 'embed': {
        if (!model) await loadModel();
        const embedding = await embed(text, mode);
        self.postMessage({ type: 'result', id, embedding });
        break;
      }
      case 'embedBatch': {
        if (!model) await loadModel();
        const embeddings = await embedBatch(texts, modes);
        self.postMessage({ type: 'batchResult', id, embeddings });
        break;
      }
      default:
        self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err.message });
  }
};
