import { getDB } from '../db/database';

export const CognitiveService = {
  /**
   * Анализирует паттерны обучения из flashcards и возвращает инсайты.
   */
  async getInsights() {
    const db = await getDB();
    const allCards = await db.getAll('flashcards');
    const documents = await db.getAll('documents');
    const docMap = new Map(documents.map(d => [d.id, d]));

    if (allCards.length === 0) return [];

    const insights = [];

    // --- Инсайт 1: Лучшее время для учёбы ---
    const reviewsByHour = {};
    let totalReviews = 0;

    for (const card of allCards) {
      if (card.lastReviewedAt) {
        const hour = new Date(card.lastReviewedAt).getHours();
        if (!reviewsByHour[hour]) reviewsByHour[hour] = { count: 0, totalQuality: 0 };
        reviewsByHour[hour].count++;
        reviewsByHour[hour].totalQuality += (card.repetitions > 0 ? 1 : 0);
        totalReviews++;
      }
    }

    if (Object.keys(reviewsByHour).length >= 2) {
      let bestHour = null;
      let bestAvg = 0;
      for (const [hour, data] of Object.entries(reviewsByHour)) {
        const avg = data.totalQuality / data.count;
        if (avg > bestAvg || (avg === bestAvg && data.count > (reviewsByHour[bestHour]?.count || 0))) {
          bestAvg = avg;
          bestHour = hour;
        }
      }
      if (bestHour !== null) {
        const h = parseInt(bestHour);
        const timeRange = `${h}:00–${h + 2}:00`;
        insights.push({
          icon: '🕐',
          text: `Ваша память работает лучше всего около <strong>${timeRange}</strong>. Попробуйте планировать повторения на это время.`
        });
      }
    }

    // --- Инсайт 2: Самая сильная и слабая тема ---
    const topicStats = {};
    for (const card of allCards) {
      const docId = card.documentId;
      if (!docId || docId === 'image-import') continue;
      if (!topicStats[docId]) topicStats[docId] = { total: 0, remembered: 0 };
      topicStats[docId].total++;
      if (card.repetitions >= 2) topicStats[docId].remembered++;
    }

    const topics = Object.entries(topicStats)
      .filter(([_, s]) => s.total >= 2)
      .map(([docId, s]) => ({
        docId,
        name: docMap.get(docId)?.name || 'Документ',
        ratio: s.remembered / s.total
      }));

    if (topics.length >= 2) {
      topics.sort((a, b) => b.ratio - a.ratio);
      const strongest = topics[0];
      const weakest = topics[topics.length - 1];

      insights.push({
        icon: '💪',
        text: `Сильная тема: <strong>${strongest.name.substring(0, 30)}</strong> — ${Math.round(strongest.ratio * 100)}% карточек усвоено.`
      });

      if (weakest.ratio < 0.5) {
        insights.push({
          icon: '🎯',
          text: `Тема <strong>${weakest.name.substring(0, 30)}</strong> требует внимания — усвоено только ${Math.round(weakest.ratio * 100)}%.`
        });
      }
    }

    // --- Инсайт 3: Общая статистика ---
    const dueNow = allCards.filter(c => c.nextReview <= new Date().toISOString()).length;
    const masteredCards = allCards.filter(c => c.repetitions >= 3).length;

    if (allCards.length >= 3) {
      const masteryPercent = Math.round((masteredCards / allCards.length) * 100);
      insights.push({
        icon: '📊',
        text: `Из ${allCards.length} карточек <strong>${masteryPercent}%</strong> можно считать усвоенными (3+ повторения).`
      });
    }

    if (dueNow > 0) {
      insights.push({
        icon: '📬',
        text: `Сейчас <strong>${dueNow}</strong> ${this._pluralCards(dueNow)} ожидают повторения.`
      });
    }

    return insights;
  },

  _pluralCards(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'карточка';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'карточки';
    return 'карточек';
  }
};
