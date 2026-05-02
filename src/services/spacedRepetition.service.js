/**
 * Алгоритм интервального повторения на базе SuperMemo-2 (SM-2)
 */
export const SpacedRepetitionService = {
  /**
   * Рассчитывает новые параметры для карточки на основе оценки пользователя.
   * Оценки (quality):
   * 0: Полный провал (Complete blackout).
   * 1: Неправильно, но правильный ответ казался знакомым.
   * 2: Неправильно, но легко вспомнил после подсказки.
   * 3: Правильно, но с большим трудом. (Hard)
   * 4: Правильно после раздумий. (Good)
   * 5: Отлично, мгновенно вспомнил. (Easy)
   */
  calculateNextReview(quality, oldRepetitions = 0, oldEasiness = 2.5, oldInterval = 0) {
    let newEasiness = oldEasiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    
    // Ограничиваем Easiness Factor минимум 1.3
    if (newEasiness < 1.3) {
      newEasiness = 1.3;
    }

    let newRepetitions = oldRepetitions;
    let newInterval = oldInterval;

    if (quality < 3) {
      // Если оценка ниже 3 (Hard), сбрасываем повторения и интервал
      newRepetitions = 0;
      newInterval = 1;
    } else {
      newRepetitions += 1;
      
      if (newRepetitions === 1) {
        newInterval = 1;
      } else if (newRepetitions === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(oldInterval * newEasiness);
      }
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

    return {
      easiness: newEasiness,
      repetitions: newRepetitions,
      interval: newInterval,
      nextReviewDate: nextReviewDate.toISOString()
    };
  },

  getInitialStats() {
    return {
      easiness: 2.5,
      repetitions: 0,
      interval: 0,
      nextReviewDate: new Date().toISOString()
    };
  }
};
