import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlashcardService } from '../../../services/flashcard.service';
import { useToast } from '../../../components/ui/ToastProvider';
import './FlashcardsPage.css';

const FlashcardsPage = () => {
  const [cards, setCards] = useState([]);
  const [dueCardsCount, setDueCardsCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    const allCards = await FlashcardService.getAllCards();
    setCards(allCards);
    const due = allCards.filter(c => c.nextReview <= new Date().toISOString());
    setDueCardsCount(due.length);
  };

  const [isManualCreate, setIsManualCreate] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    await FlashcardService.createCard(null, front, back);
    setFront('');
    setBack('');
    setIsManualCreate(false);
    loadCards();
  };

  const fileInputRef = useRef(null);
  const { addToast } = useToast();

  const handleImageImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast('Пожалуйста, выберите изображение', 'error');
      return;
    }

    addToast('Изображение загружается, AI анализирует...', 'info', 5000);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Image = reader.result;
        await FlashcardService.generateFromImage(null, base64Image, file.type);
        addToast('Карточки успешно созданы из фото!', 'success');
        loadCards();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      addToast('Ошибка при обработке изображения', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flashcards-page fade-in">
      <div className="fc-page-header">
        <div>
          <h2>Флеш-карточки</h2>
          <p className="text-muted">Интервальное повторение для эффективного запоминания</p>
        </div>
        <div className="fc-header-actions">
          <input 
            type="file" 
            accept="image/*" 
            style={{ display: 'none' }} 
            ref={fileInputRef}
            onChange={handleImageImport}
          />
          <button className="btn-secondary interactive" onClick={() => fileInputRef.current?.click()} title="Создать карточки из фото конспекта">
            📸 С фото
          </button>
          <button className="btn-secondary interactive" onClick={() => setIsManualCreate(!isManualCreate)}>
            + Создать
          </button>
        </div>
      </div>

      <div className="fc-stats-row">
        <div className="stat-card">
          <h3 className="stat-card-value text-accent">{dueCardsCount}</h3>
          <p className="text-muted">Карточек для повторения</p>
          <button 
            className="btn-primary interactive fc-start-btn"
            disabled={dueCardsCount === 0}
            onClick={() => navigate('/flashcards/study')}
          >
            Начать сессию
          </button>
        </div>
        
        <div className="stat-card">
          <h3 className="stat-card-value">{cards.length}</h3>
          <p className="text-muted">Всего карточек в базе</p>
        </div>
      </div>

      {isManualCreate && (
        <form onSubmit={handleCreate} className="manual-create-form slide-up">
          <h4>Новая карточка</h4>
          <input 
            value={front} onChange={e => setFront(e.target.value)} 
            placeholder="Вопрос или термин (Лицевая сторона)" 
            className="fc-input"
            autoFocus
          />
          <textarea 
            value={back} onChange={e => setBack(e.target.value)} 
            placeholder="Ответ или определение (Оборотная сторона)"
            className="fc-textarea"
          />
          <div className="fc-form-actions">
            <button type="submit" className="btn-primary interactive">Сохранить</button>
            <button type="button" className="btn-secondary interactive" onClick={() => setIsManualCreate(false)}>Отмена</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default FlashcardsPage;
