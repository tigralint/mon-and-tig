import { openDB } from 'idb';

const DB_NAME = 'msu-smart-hub-db';
const DB_VERSION = 2;

export const initDB = async () => {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('folderId', 'folderId');
      }
      
      if (!db.objectStoreNames.contains('folders')) {
        const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
        folderStore.createIndex('parentId', 'parentId');
      }

      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('documentId', 'documentId');
      }

      if (!db.objectStoreNames.contains('flashcards')) {
        const cardStore = db.createObjectStore('flashcards', { keyPath: 'id' });
        cardStore.createIndex('documentId', 'documentId');
        cardStore.createIndex('nextReview', 'nextReview');
      }

      if (!db.objectStoreNames.contains('summaries')) {
        const summaryStore = db.createObjectStore('summaries', { keyPath: 'id' });
        summaryStore.createIndex('documentId', 'documentId', { unique: true });
      }

      if (!db.objectStoreNames.contains('user')) {
        db.createObjectStore('user', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('user_memory')) {
        const memoryStore = db.createObjectStore('user_memory', { keyPath: 'id' });
        memoryStore.createIndex('timestamp', 'timestamp');
      }
    },
  });

  // Инициализация singleton юзера если его нет
  const userTx = db.transaction('user', 'readwrite');
  const userStore = userTx.objectStore('user');
  const existingUser = await userStore.get('singleton');
  
  if (!existingUser) {
    await userStore.put({
      id: 'singleton',
      tier: 'free',
      tokenBalance: 0,
    });
  }

  return db;
};

// Экспортируем функцию получения DB инстанса
export const getDB = async () => {
  return await initDB();
};
