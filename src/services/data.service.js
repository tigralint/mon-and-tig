import { getDB } from '../db/database';

/**
 * Сервис экспорта и импорта данных из IndexedDB.
 * Для Phase 0: простой JSON-дамп всех stores (кроме blob-файлов документов).
 */
export const DataService = {
  /**
   * Экспорт всех данных в JSON-файл
   */
  async exportData() {
    const db = await getDB();
    
    const documents = await db.getAll('documents');
    const flashcards = await db.getAll('flashcards');
    const summaries = await db.getAll('summaries');
    const userMemory = await db.getAll('user_memory');
    const chatSessions = await db.getAll('chat_sessions');
    const studySessions = await db.getAll('study_sessions');

    // Документы без blob (файлы слишком большие для JSON)
    const documentsClean = documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      size: doc.size,
      textContent: doc.textContent,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      folderId: doc.folderId,
    }));

    const exportPayload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      data: {
        documents: documentsClean,
        flashcards,
        summaries,
        userMemory,
        chatSessions,
        studySessions,
      }
    };

    const json = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `lumea-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Импорт данных из JSON-файла
   * @param {File} file
   * @returns {{ imported: object, warnings: string[] }}
   */
  async importData(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    
    if (!payload.version || !payload.data) {
      throw new Error('Неверный формат файла бэкапа');
    }

    const db = await getDB();
    const warnings = [];
    const imported = { documents: 0, flashcards: 0, summaries: 0, userMemory: 0, chatSessions: 0, studySessions: 0 };

    // Импорт документов (без blob — только метаданные и текст)
    if (payload.data.documents) {
      for (const doc of payload.data.documents) {
        try {
          const existing = await db.get('documents', doc.id);
          if (!existing) {
            await db.put('documents', { ...doc, blob: null });
            imported.documents++;
          }
        } catch (e) {
          warnings.push(`Документ "${doc.name}": ${e.message}`);
        }
      }
    }

    // Импорт карточек
    if (payload.data.flashcards) {
      for (const card of payload.data.flashcards) {
        try {
          const existing = await db.get('flashcards', card.id);
          if (!existing) {
            await db.put('flashcards', card);
            imported.flashcards++;
          }
        } catch (e) {
          warnings.push(`Карточка: ${e.message}`);
        }
      }
    }

    // Импорт конспектов
    if (payload.data.summaries) {
      for (const summary of payload.data.summaries) {
        try {
          const existing = await db.get('summaries', summary.id);
          if (!existing) {
            await db.put('summaries', summary);
            imported.summaries++;
          }
        } catch (e) {
          warnings.push(`Конспект: ${e.message}`);
        }
      }
    }

    // Импорт памяти
    if (payload.data.userMemory) {
      for (const mem of payload.data.userMemory) {
        try {
          const existing = await db.get('user_memory', mem.id);
          if (!existing) {
            await db.put('user_memory', mem);
            imported.userMemory++;
          }
        } catch (e) {
          warnings.push(`Память: ${e.message}`);
        }
      }
    }
    // Импорт чат-сессий
    if (payload.data.chatSessions) {
      for (const session of payload.data.chatSessions) {
        try {
          const existing = await db.get('chat_sessions', session.id);
          if (!existing) {
            await db.put('chat_sessions', session);
            imported.chatSessions++;
          }
        } catch (e) {
          warnings.push(`Чат: ${e.message}`);
        }
      }
    }

    // Импорт сессий обучения
    if (payload.data.studySessions) {
      for (const session of payload.data.studySessions) {
        try {
          const existing = await db.get('study_sessions', session.id);
          if (!existing) {
            await db.put('study_sessions', session);
            imported.studySessions++;
          }
        } catch (e) {
          warnings.push(`Сессия: ${e.message}`);
        }
      }
    }

    return { imported, warnings };
  }
};
