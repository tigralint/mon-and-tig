/**
 * Глобальный менеджер индексации.
 * Живёт на уровне модуля — НЕ зависит от React-компонентов.
 * Работает в фоне при навигации между страницами.
 */
import { getDB } from '../db/database';
import { LocalEmbeddingService, onLoadProgress } from './local-embedding.service';
import { EmbeddingService } from './embedding.service';

// ─── Module-level state (persists across navigations) ───
let _isRunning = false;
let _status = '';
let _listeners = [];

const notify = () => _listeners.forEach(fn => fn({ isRunning: _isRunning, status: _status }));

/**
 * Подписаться на обновления прогресса.
 * @returns {() => void} unsubscribe
 */
export const onIndexingProgress = (fn) => {
  _listeners.push(fn);
  fn({ isRunning: _isRunning, status: _status });
  return () => { _listeners = _listeners.filter(f => f !== fn); };
};

export const getIndexingStatus = () => ({ isRunning: _isRunning, status: _status });

/**
 * Запустить полную переиндексацию всех документов.
 * Продолжает работу при навигации между страницами.
 */
export const startReindexAll = async () => {
  if (_isRunning) return;
  _isRunning = true;
  _status = '🧠 Загружаем модель эмбеддингов...';
  notify();

  try {
    const unsub = onLoadProgress((p) => {
      if (p.error) { _status = `❌ ${p.error}`; notify(); }
      else if (p.modelReady) {
        const gpu = p.device === 'webgpu' ? '🚀 WebGPU' : '⚙️ WASM';
        _status = `✅ Модель загружена (${gpu})`;
        notify();
      }
      else if (p.pct !== undefined && !p.done) {
        _status = `⬇️ Загрузка: ${p.mbLoaded}/${p.mbTotal}MB (${p.pct}%)`;
        notify();
      }
    });

    const device = await LocalEmbeddingService.preload();
    unsub();

    const db = await getDB();
    _status = '🗑️ Очищаем старые данные...';
    notify();
    const tx = db.transaction('chunks', 'readwrite');
    await tx.store.clear();
    await tx.done;

    const docs = (await db.getAll('documents')).filter(d => d.textContent);
    const deviceLabel = device === 'webgpu' ? '🚀' : '⚙️';

    for (let i = 0; i < docs.length; i++) {
      const name = docs[i].name.length > 25 ? docs[i].name.substring(0, 22) + '...' : docs[i].name;
      const docProgress = `[${i + 1}/${docs.length}]`;
      _status = `${deviceLabel} ${docProgress} ${name} — 0%`;
      notify();

      const onChunkProgress = ({ done, total, pct }) => {
        _status = `${deviceLabel} ${docProgress} ${name} — ${pct}% (${done}/${total})`;
        notify();
      };

      await EmbeddingService.indexDocument(docs[i].id, docs[i].textContent, onChunkProgress);
    }

    _status = '✅ Готово!';
    notify();
    setTimeout(() => { _status = ''; notify(); }, 3000);
  } catch (e) {
    console.error('Reindex error:', e);
    _status = `❌ ${e.message?.substring(0, 60) || 'Ошибка'}`;
    notify();
  } finally {
    _isRunning = false;
    notify();
  }
};
