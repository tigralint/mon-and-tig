import { getDB } from '../db/database';
import { AIService } from './ai.service';
import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';

// ─── FSRS-5 Scheduler ───
const scheduler = fsrs({
  request_retention: 0.9,  // 90% целевая вероятность вспомнить
  maximum_interval: 365,
  enable_fuzz: true,       // Лёгкий разброс интервалов (anti-clustering)
});

/**
 * Маппинг UI-кнопок → FSRS Rating
 * UI показывает 4 кнопки: Снова / Сложно / Хорошо / Легко
 */
export const RATING_MAP = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

/**
 * Конвертирует существующую SM-2 карточку в FSRS-формат.
 * Сохраняет прогресс: если карточка была хорошо изучена (repetitions >= 3),
 * она не начнёт с нуля.
 */
const migrateFromSM2 = (oldCard) => {
  const base = createEmptyCard(new Date(oldCard.createdAt || Date.now()));

  // Если карточка новая (0 повторений) — просто FSRS defaults
  if (!oldCard.repetitions || oldCard.repetitions === 0) {
    return { ...base };
  }

  // Миграция: сохраняем прогресс
  return {
    ...base,
    state: oldCard.repetitions >= 2 ? State.Review : State.Learning,
    reps: oldCard.repetitions || 0,
    lapses: 0,
    stability: Math.max(1, (oldCard.interval || 1) * (oldCard.easeFactor || 2.5) / 2.5),
    difficulty: Math.max(1, Math.min(10, 11 - (oldCard.easeFactor || 2.5) * 4)),
    last_review: oldCard.lastReviewedAt ? new Date(oldCard.lastReviewedAt) : undefined,
    due: oldCard.nextReview ? new Date(oldCard.nextReview) : new Date(),
  };
};

export const FlashcardService = {
  /**
   * Превью: показывает, какие интервалы будут при каждом рейтинге.
   * Используется для отображения "Хорошо (3д)" на кнопках.
   */
  previewIntervals(card) {
    try {
      const fsrsCard = this._toFSRSCard(card);
      const now = new Date();
      const preview = scheduler.repeat(fsrsCard, now);

      return {
        [Rating.Again]: this._formatInterval(preview[Rating.Again]?.card),
        [Rating.Hard]: this._formatInterval(preview[Rating.Hard]?.card),
        [Rating.Good]: this._formatInterval(preview[Rating.Good]?.card),
        [Rating.Easy]: this._formatInterval(preview[Rating.Easy]?.card),
      };
    } catch (e) {
      console.error('Preview failed:', e);
      return null;
    }
  },

  /**
   * Форматирует интервал для отображения: "10мин", "1д", "3д", "2нед"
   */
  _formatInterval(nextCard) {
    if (!nextCard?.due) return '';
    const now = new Date();
    const diffMs = nextCard.due.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 60) return `${Math.max(1, diffMin)}мин`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours}ч`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 14) return `${diffDays}д`;
    const diffWeeks = Math.round(diffDays / 7);
    if (diffWeeks < 8) return `${diffWeeks}нед`;
    const diffMonths = Math.round(diffDays / 30);
    return `${diffMonths}мес`;
  },

  /**
   * Конвертирует IndexedDB карточку в FSRS Card объект.
   */
  _toFSRSCard(card) {
    // Если карточка уже в FSRS-формате
    if (card.stability !== undefined) {
      return {
        due: new Date(card.due || card.nextReview || Date.now()),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days || 0,
        scheduled_days: card.scheduled_days || 0,
        reps: card.reps ?? card.repetitions ?? 0,
        lapses: card.lapses || 0,
        state: card.state ?? State.New,
        last_review: card.last_review ? new Date(card.last_review) : undefined,
      };
    }

    // SM-2 legacy → FSRS migration
    return migrateFromSM2(card);
  },

  /**
   * Рассчитывает retrievability (вероятность вспомнить) для карточки.
   * Возвращает число 0-1.
   */
  getRetrievability(card) {
    try {
      const fsrsCard = this._toFSRSCard(card);
      if (!fsrsCard.last_review || fsrsCard.state === State.New) return null;
      return scheduler.get_retrievability(fsrsCard, new Date());
    } catch {
      return null;
    }
  },

  async createCard(documentId, front, back) {
    const db = await getDB();
    const now = new Date();
    const emptyCard = createEmptyCard(now);

    const card = {
      id: crypto.randomUUID(),
      documentId,
      front,
      back,
      // FSRS fields
      due: emptyCard.due.toISOString(),
      stability: emptyCard.stability,
      difficulty: emptyCard.difficulty,
      elapsed_days: emptyCard.elapsed_days,
      scheduled_days: emptyCard.scheduled_days,
      reps: emptyCard.reps,
      lapses: emptyCard.lapses,
      state: emptyCard.state,
      last_review: null,
      // Legacy compat (для cognitive.service и фильтров)
      nextReview: emptyCard.due.toISOString(),
      repetitions: 0,
      // Meta
      createdAt: now.toISOString(),
    };
    await db.put('flashcards', card);
    return card;
  },

  async getCardsForReview() {
    const db = await getDB();
    const allCards = await db.getAll('flashcards');
    const now = new Date().toISOString();
    return allCards.filter(card => {
      const due = card.due || card.nextReview;
      return due && due <= now;
    });
  },

  async getAllCards() {
    const db = await getDB();
    return await db.getAll('flashcards');
  },

  /**
   * Записать результат повторения (FSRS).
   * @param {string} cardId
   * @param {1|2|3|4} ratingNum — 1=Again, 2=Hard, 3=Good, 4=Easy
   */
  async submitReview(cardId, ratingNum) {
    const db = await getDB();
    const card = await db.get('flashcards', cardId);
    if (!card) throw new Error('Card not found');

    const fsrsCard = this._toFSRSCard(card);
    const rating = RATING_MAP[ratingNum] || Rating.Good;
    const now = new Date();

    const result = scheduler.next(fsrsCard, now, rating);
    const nextCard = result.card;

    const updatedCard = {
      ...card,
      // FSRS fields
      due: nextCard.due.toISOString(),
      stability: nextCard.stability,
      difficulty: nextCard.difficulty,
      elapsed_days: nextCard.elapsed_days,
      scheduled_days: nextCard.scheduled_days,
      reps: nextCard.reps,
      lapses: nextCard.lapses,
      state: nextCard.state,
      last_review: nextCard.last_review ? nextCard.last_review.toISOString() : now.toISOString(),
      // Legacy compat
      nextReview: nextCard.due.toISOString(),
      repetitions: nextCard.reps,
      lastReviewedAt: now.toISOString(),
    };

    await db.put('flashcards', updatedCard);
    return updatedCard;
  },

  async generateFromDocument(documentId, textContent) {
    if (!textContent) throw new Error('No text provided');
    const aiCards = await AIService.generateFlashcards(textContent);

    const createdCards = [];
    for (const aiCard of aiCards) {
      if (aiCard.front && aiCard.back) {
        const card = await this.createCard(documentId, aiCard.front, aiCard.back);
        createdCards.push(card);
      }
    }
    return createdCards;
  },

  async generateFromImage(documentId, base64Image, mimeType) {
    if (!base64Image) throw new Error('No image provided');
    const aiCards = await AIService.generateFlashcardsFromImage(base64Image, mimeType);

    const createdCards = [];
    for (const aiCard of aiCards) {
      if (aiCard.front && aiCard.back) {
        const card = await this.createCard(documentId || 'image-import', aiCard.front, aiCard.back);
        createdCards.push(card);
      }
    }
    return createdCards;
  }
};
