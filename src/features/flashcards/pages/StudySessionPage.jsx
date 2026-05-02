import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlashcardService } from '../../../services/flashcard.service';
import { MemoryService } from '../../../services/memory.service';
import './StudySession.css';

const StudySessionPage = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      const cards = await FlashcardService.getCardsForReview();
      setQueue(cards);
      setIsLoading(false);
    };
    initSession();
  }, []);

  if (isLoading) return <div style={{padding: '40px'}}>Загрузка сессии...</div>;

  if (queue.length === 0 || currentIndex >= queue.length) {
    return (
      <div className="session-complete text-center slide-up" style={{ padding: '80px 20px' }}>
        <div style={{ fontSize: '64px', marginBottom: '24px' }}>🎉</div>
        <h2>Отличная работа!</h2>
        <p className="text-muted" style={{ marginBottom: '32px' }}>
          Вы повторили все карточки на сегодня.
        </p>
        <button className="btn-primary interactive" onClick={() => navigate('/flashcards')}>
          Вернуться к карточкам
        </button>
      </div>
    );
  }

  const currentCard = queue[currentIndex];

  const handleResponse = async (quality) => {
    // 0 = blackout, 3 = hard, 4 = good, 5 = perfect
    await FlashcardService.submitReview(currentCard.id, quality);
    
    // Фоновое извлечение факта для Умной памяти
    let actionText = "Студент вспомнил карточку легко.";
    if (quality === 0) actionText = "Студент полностью забыл материал карточки.";
    else if (quality === 3) actionText = "Студент вспомнил карточку с большим трудом.";
    
    if (quality === 0 || quality === 3) {
      MemoryService.extractAndSaveFact(
        `Вопрос карточки: ${currentCard.front}\nОтвет: ${currentCard.back}`, 
        actionText
      );
    }

    setIsFlipped(false);
    setCurrentIndex(prev => prev + 1);
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
                Нажмите, чтобы перевернуть
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

      <div className="response-actions" style={{ marginTop: '40px', display: 'flex', gap: '16px', opacity: isFlipped ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: isFlipped ? 'auto' : 'none' }}>
        <button className="response-btn btn-again interactive" onClick={() => handleResponse(0)}>Снова</button>
        <button className="response-btn btn-hard interactive" onClick={() => handleResponse(3)}>Сложно</button>
        <button className="response-btn btn-good interactive" onClick={() => handleResponse(4)}>Хорошо</button>
        <button className="response-btn btn-easy interactive" onClick={() => handleResponse(5)}>Легко</button>
      </div>
    </div>
  );
};

export default StudySessionPage;
