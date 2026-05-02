import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getDB } from '../../../db/database';
import { SerendipityService } from '../../../services/serendipity.service';
import { CognitiveService } from '../../../services/cognitive.service';
import { FlashcardService } from '../../../services/flashcard.service';
import './DashboardPage.css';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ documents: 0, cards: 0, dueCards: 0 });
  const [serendipity, setSerendipity] = useState(null);
  const [serendipityLoading, setSerendipityLoading] = useState(true);
  const [cognitiveInsights, setCognitiveInsights] = useState([]);

  useEffect(() => {
    loadStats();
    loadCognitive();
    loadSerendipity();
  }, []);

  const loadStats = async () => {
    try {
      const db = await getDB();
      const docs = await db.getAll('documents');
      const cards = await FlashcardService.getAllCards();
      const due = cards.filter(c => c.nextReview <= new Date().toISOString());
      setStats({ documents: docs.length, cards: cards.length, dueCards: due.length });
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  };

  const loadCognitive = async () => {
    try {
      const insights = await CognitiveService.getInsights();
      setCognitiveInsights(insights);
    } catch (e) {
      console.error('Cognitive pulse error:', e);
    }
  };

  const loadSerendipity = async () => {
    setSerendipityLoading(true);
    try {
      const insight = await SerendipityService.getDailyInsight();
      setSerendipity(insight);
    } catch (e) {
      console.error('Serendipity error:', e);
    } finally {
      setSerendipityLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return 'Доброй ночи';
    if (hour < 12) return 'Доброе утро';
    if (hour < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  return (
    <div className="dashboard-page fade-in">
      {/* Greeting */}
      <div className="dashboard-greeting">
        <h1>{getGreeting()}</h1>
        <p className="dashboard-subtitle">Ваше пространство знаний ждёт вас.</p>
      </div>

      {/* Quick Stats */}
      <div className="dashboard-stats">
        <div className="stat-mini interactive" onClick={() => navigate('/documents')}>
          <div className="stat-value">{stats.documents}</div>
          <div className="stat-label">Документов</div>
        </div>
        <div className="stat-mini interactive" onClick={() => navigate('/flashcards')}>
          <div className="stat-value">{stats.cards}</div>
          <div className="stat-label">Карточек</div>
        </div>
        <div className="stat-mini interactive" onClick={() => stats.dueCards > 0 && navigate('/flashcards/study')}>
          <div className="stat-value">{stats.dueCards}</div>
          <div className="stat-label">К повторению</div>
        </div>
      </div>

      {/* Serendipity Engine */}
      <div className="serendipity-widget">
        <div className="serendipity-header">
          <span className="icon">🔮</span>
          <h3>Lumea нашла кое-что интересное</h3>
        </div>

        {serendipityLoading ? (
          <div className="serendipity-loading">
            <div className="pulse-dot" style={{ width: 8, height: 8, background: 'var(--accent-gold)', borderRadius: '50%', animation: 'pulse 2s ease-in-out infinite' }} />
            <span>Исследуем связи между вашими документами...</span>
          </div>
        ) : serendipity ? (
          <>
            <div className="serendipity-body">
              <ReactMarkdown>{serendipity.text}</ReactMarkdown>
            </div>
            <div className="serendipity-sources">
              <span className="serendipity-source-tag">{serendipity.docAName}</span>
              <span className="serendipity-source-tag">{serendipity.docBName}</span>
            </div>
          </>
        ) : (
          <p className="serendipity-empty">
            Загрузите хотя бы 2 документа из разных дисциплин, чтобы Lumea нашла неожиданные связи между ними.
          </p>
        )}
      </div>

      {/* Cognitive Pulse */}
      {cognitiveInsights.length > 0 && (
        <div className="cognitive-widget">
          <div className="cognitive-header">
            <div className="pulse-dot" />
            <h3>Когнитивный пульс</h3>
          </div>
          <div className="cognitive-insights">
            {cognitiveInsights.map((insight, i) => (
              <div key={i} className="insight-item">
                <span className="insight-icon">{insight.icon}</span>
                <span className="insight-text" dangerouslySetInnerHTML={{ __html: insight.text }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="dashboard-actions">
        <div className="action-card interactive" onClick={() => navigate('/documents')}>
          <div className="action-icon">📄</div>
          <div className="action-title">Загрузить документ</div>
          <div className="action-desc">PDF, TXT — ваши лекции и конспекты</div>
        </div>
        <div className="action-card interactive" onClick={() => navigate('/search')}>
          <div className="action-icon">🔍</div>
          <div className="action-title">Чат с базой знаний</div>
          <div className="action-desc">Задайте вопрос по всем документам</div>
        </div>
        <div className="action-card interactive" onClick={() => navigate('/flashcards')}>
          <div className="action-icon">🧠</div>
          <div className="action-title">Флеш-карточки</div>
          <div className="action-desc">Интервальное повторение</div>
        </div>
        <div className="action-card interactive" onClick={() => navigate('/constellation')}>
          <div className="action-icon">🌌</div>
          <div className="action-title">Созвездие знаний</div>
          <div className="action-desc">Визуальная карта ваших документов</div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
