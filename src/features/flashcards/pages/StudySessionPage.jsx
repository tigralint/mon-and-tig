import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlashcardService, RATING_MAP } from '../../../services/flashcard.service';
import { MemoryService } from '../../../services/memory.service';
import { getDB } from '../../../db/database';
import './StudySession.css';

const StudySessionPage = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [sessionStart] = useState(() => Date.now());
  const [reviewedCount, setReviewedCount] = useState(0);

  useEffect(() => {
    const initSession = async () => {
      const cards = await FlashcardService.getCardsForReview();
      setQueue(cards);
      setIsLoading(false);
    };
    initSession();
  }, []);

  // Обновляем preview при смене карточки
  useEffect(() => {
    if (queue.length > 0 && currentIndex < queue.length) {
      const intervals = FlashcardService.previewIntervals(queue[currentIndex]);
      setPreview(intervals);
    }
  }, [currentIndex, queue]);

  // Keyboard shortcuts: Space=flip, 1-4=rating, ←→=flip
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        if (!isFlipped) setIsFlipped(true);
      } else if (isFlipped && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        handleResponse(parseInt(e.key));
      } else if (e.code === 'ArrowRight' && !isFlipped) {
        setIsFlipped(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, currentIndex, queue]);

  // Сохранение сессии обучения при завершении
  const saveStudySession = useCallback(async () => {
    try {
      const db = await getDB();
      const duration = Math.round((Date.now() - sessionStart) / 1000);
      const now = new Date();
      await db.put('study_sessions', {
        id: crypto.randomUUID(),
        date: now.toISOString().slice(0, 10),
        cardsReviewed: reviewedCount,
        duration,
        timestamp: now.toISOString(),
      });
    } catch (e) {
      console.error('Failed to save study session:', e);
    }
  }, [sessionStart, reviewedCount]);

  if (isLoading) return <div style={{padding: '40px'}}>Загрузка сессии...</div>;

  if (queue.length === 0 || currentIndex >= queue.length) {
    // Сохраняем сессию при завершении
    if (reviewedCount > 0) {
      saveStudySession();
    }

    return (
      <div className="session-complete text-center slide-up" style={{ padding: '80px 20px' }}>
        <div style={{ fontSize: '64px', marginBottom: '24px' }}>🎉</div>
        <h2>Отличная работа!</h2>
        <p className="text-muted" style={{ marginBottom: '8px' }}>
          Вы повторили {reviewedCount > 0 ? `${reviewedCount} карточек` : 'все карточки'} на сегодня.
        </p>
        <p className="text-muted text-small" style={{ marginBottom: '32px', opacity: 0.6 }}>
          Алгоритм FSRS подстроил интервалы под вашу память
        </p>
        <button className="btn-primary interactive" onClick={() => navigate('/flashcards')}>
          Вернуться к карточкам
        </button>
      </div>
    );
  }

  const currentCard = queue[currentIndex];

  const handleResponse = async (ratingNum) => {
    // 1=Again, 2=Hard, 3=Good, 4=Easy
    await FlashcardService.submitReview(currentCard.id, ratingNum);
    setReviewedCount(prev => prev + 1);

    // Фоновое извлечение факта для Умной памяти
    if (ratingNum <= 2) {
      const actionText = ratingNum === 1
        ? 'Студент полностью забыл материал карточки.'
        : 'Студент вспомнил карточку с большим трудом.';
      
      MemoryService.extractAndSaveFact(
        `Вопрос карточки: ${currentCard.front}\nОтвет: ${currentCard.back}`,
        actionText
      );
    }

    setIsFlipped(false);
    setCurrentIndex(prev => prev + 1);
  };

  // Лейблы для кнопок с интервалами
  const getButtonLabel = (ratingNum, label) => {
    if (!preview || !preview[RATING_MAP[ratingNum]]) return label;
    return `${label} (${preview[RATING_MAP[ratingNum]]})`;
  };

  return (
    <div className="study-session fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center' }}>
      <div className="session-progress" style={{ width: '100%', maxWidth: '600px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <button className="btn-icon text-muted interactive" onClick={() => navigate('/flashcards')}>✕ Выйти</button>
          <span className="text-muted text-small">{currentIndex + 1} / {queue.length}</span>
        </div>
        <div className="progress-bar" style={{ height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
          <div
            className="progress-fill"
            style={{ width: `${(currentIndex / queue.length) * 100}%`, height: '100%', backgroundColor: 'var(--accent-gold)', transition: 'width 0.3s ease' }}
          />
        </div>
      </div>

      <div className="flashcard-container" style={{ perspective: '1000px', width: '100%', maxWidth: '600px', flex: 1, maxHeight: '400px' }}>
        <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={() => !isFlipped && setIsFlipped(true)}>
          <div className="flashcard-front">
            <h3 style={{ fontSize: '24px', fontWeight: '500', lineHeight: 1.4 }}>{currentCard.front}</h3>
            {!isFlipped && (
              <p className="text-small text-muted" style={{ position: 'absolute', bottom: '24px', opacity: 0.5 }}>
                Нажмите или пробел, чтобы перевернуть
              </p>
            )}
          </div>
          <div className="flashcard-back">
            <div className="back-content">
              <h4 className="text-muted" style={{ marginBottom: '16px' }}>Ответ:</h4>
              <p style={{ fontSize: '18px', lineHeight: 1.6 }}>{currentCard.back}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="response-actions" style={{ marginTop: '40px', display: 'flex', gap: '12px', opacity: isFlipped ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: isFlipped ? 'auto' : 'none' }}>
        <button className="response-btn btn-again interactive" onClick={() => handleResponse(1)}>
          {getButtonLabel(1, 'Снова')}
        </button>
        <button className="response-btn btn-hard interactive" onClick={() => handleResponse(2)}>
          {getButtonLabel(2, 'Сложно')}
        </button>
        <button className="response-btn btn-good interactive" onClick={() => handleResponse(3)}>
          {getButtonLabel(3, 'Хорошо')}
        </button>
        <button className="response-btn btn-easy interactive" onClick={() => handleResponse(4)}>
          {getButtonLabel(4, 'Легко')}
        </button>
      </div>

      <p className="text-small text-muted" style={{ marginTop: '12px', opacity: isFlipped ? 0.5 : 0, transition: 'opacity 0.3s' }}>
        Клавиши: 1-4 для оценки · Пробел — перевернуть
      </p>
    </div>
  );
};

export default StudySessionPage;
