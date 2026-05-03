import { getDB } from '../db/database';

/**
 * Сервис аналитики обучения.
 * Считает стрики, активность, тренды усвоения — всё из IndexedDB.
 */
export const AnalyticsService = {
  /**
   * Данные активности за последние N дней (для heatmap).
   * Возвращает: [{ date: 'YYYY-MM-DD', count: number }]
   */
  async getActivityData(days = 180) {
    const db = await getDB();
    const sessions = await db.getAll('study_sessions');
    const cards = await db.getAll('flashcards');

    // Собираем все даты активности
    const dateCounts = {};
    
    for (const s of sessions) {
      if (s.date) {
        dateCounts[s.date] = (dateCounts[s.date] || 0) + (s.cardsReviewed || 1);
      }
    }

    // Дополняем из flashcards (lastReviewedAt)
    for (const c of cards) {
      if (c.lastReviewedAt) {
        const date = c.lastReviewedAt.slice(0, 10);
        dateCounts[date] = (dateCounts[date] || 0) + 1;
      }
    }

    // Генерируем массив за все дни
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({ date: dateStr, count: dateCounts[dateStr] || 0 });
    }

    return result;
  },

  /**
   * Текущий стрик (дни подряд с активностью).
   */
  async getStreak() {
    const data = await this.getActivityData(365);
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Считаем с конца (сегодня)
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Текущий стрик: считаем от сегодня/вчера назад
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].count > 0) {
        currentStreak++;
      } else {
        // Если первый пропуск — сегодня и стрик не начат, пропускаем сегодня
        if (i === data.length - 1 && data[i].date === today) continue;
        break;
      }
    }

    // Самый длинный стрик за всё время
    for (const day of data) {
      if (day.count > 0) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    return { currentStreak, longestStreak };
  },

  /**
   * Тренд усвоения по неделям (% карточек в состоянии Review).
   */
  async getRetentionTrend(weeks = 12) {
    const db = await getDB();
    const cards = await db.getAll('flashcards');
    
    if (cards.length === 0) return [];

    const now = new Date();
    const result = [];

    for (let w = weeks - 1; w >= 0; w--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);

      // Подсчитываем карточки, которые были повторены на этой неделе
      const weekStr = weekEnd.toISOString().slice(0, 10);
      let reviewed = 0;
      let total = 0;

      for (const card of cards) {
        // Карточка существовала на эту неделю?
        if (card.createdAt && card.createdAt <= weekEnd.toISOString()) {
          total++;
          // Была ли повторена?
          if (card.lastReviewedAt && card.lastReviewedAt >= weekStart.toISOString() && card.lastReviewedAt <= weekEnd.toISOString()) {
            reviewed++;
          }
        }
      }

      result.push({
        week: weekStr,
        retention: total > 0 ? Math.round((reviewed / total) * 100) : 0,
        reviewed,
        total,
      });
    }

    return result;
  },

  /**
   * Сила по темам (документам): сколько карточек выучено vs создано.
   */
  async getTopicStrength() {
    const db = await getDB();
    const [cards, documents] = await Promise.all([
      db.getAll('flashcards'),
      db.getAll('documents'),
    ]);

    const docMap = new Map(documents.map(d => [d.id, d.name]));
    const topics = {};

    for (const card of cards) {
      if (!card.documentId || !docMap.has(card.documentId)) continue;
      const name = docMap.get(card.documentId).replace(/\.(pdf|docx?|pptx|md|txt)$/i, '');

      if (!topics[card.documentId]) {
        topics[card.documentId] = { name, total: 0, mastered: 0 };
      }

      topics[card.documentId].total++;

      // "Mastered" = reps >= 3 или stability > 10 (FSRS) или repetitions >= 3 (SM-2 legacy)
      const reps = card.reps ?? card.repetitions ?? 0;
      if (reps >= 3 || (card.stability && card.stability > 10)) {
        topics[card.documentId].mastered++;
      }
    }

    return Object.values(topics)
      .map(t => ({
        ...t,
        strength: t.total > 0 ? Math.round((t.mastered / t.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // Top 10 тем
  },

  /**
   * Общая статистика.
   */
  async getOverviewStats() {
    const db = await getDB();
    const [cards, docs, sessions] = await Promise.all([
      db.getAll('flashcards'),
      db.getAll('documents'),
      db.getAll('study_sessions'),
    ]);

    const totalStudyTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalReviews = sessions.reduce((sum, s) => sum + (s.cardsReviewed || 0), 0);
    const dueNow = cards.filter(c => {
      const due = c.due || c.nextReview;
      return due && due <= new Date().toISOString();
    }).length;

    return {
      totalCards: cards.length,
      totalDocs: docs.length,
      totalReviews,
      totalStudyTime, // seconds
      dueNow,
      totalSessions: sessions.length,
    };
  },
};
