import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AIService } from '../../../services/ai.service';
import { getDB } from '../../../db/database';
import './SummaryView.css';

const SummaryView = ({ documentId, textContent }) => {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [isGeneratingCards, setIsGeneratingCards] = useState(false);

  const handleSummarize = async () => {
    if (!textContent) {
      setError('Нет текста для суммаризации. Дождитесь окончания обработки.');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const result = await AIService.summarize(textContent);
      setSummary(result);
      
      const db = await getDB();
      await db.put('summaries', {
        id: crypto.randomUUID(),
        documentId: documentId,
        content: result,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      setError(err.message || 'Ошибка генерации конспекта');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCards = async () => {
    if (!textContent) return;
    setIsGeneratingCards(true);
    try {
      const { FlashcardService } = await import('../../../services/flashcard.service');
      const cards = await FlashcardService.generateFromDocument(documentId, textContent);
      alert(`Успешно создано ${cards.length} карточек! Перейдите в раздел "Карточки" для изучения.`);
    } catch (err) {
      alert('Ошибка при генерации карточек: ' + err.message);
    } finally {
      setIsGeneratingCards(false);
    }
  };

  return (
    <div className="summary-view fade-in">
      {!summary && !isLoading && (
        <div className="summary-cta text-center">
          <h3>AI-Конспект</h3>
          <p className="text-muted" style={{marginBottom: 'var(--spacing-md)'}}>
            Сгенерируйте краткую выжимку из этого документа
          </p>
          <button className="btn-primary interactive" onClick={handleSummarize}>
            ✨ Создать конспект
          </button>
        </div>
      )}

      {isLoading && (
        <div className="summary-loading text-center">
          <div className="spinner"></div>
          <p className="text-muted">Анализируем документ и составляем конспект...</p>
        </div>
      )}

      {error && (
        <div className="summary-error">
          <p className="text-accent">{error}</p>
          <button className="btn-secondary" onClick={() => setError('')}>Попробовать снова</button>
        </div>
      )}

      {summary && !isLoading && (
        <div className="summary-content">
          <div className="summary-header">
            <h3>Конспект</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn-secondary interactive" 
                onClick={handleGenerateCards}
                disabled={isGeneratingCards}
                style={{ fontSize: '14px', padding: '6px 12px' }}
              >
                {isGeneratingCards ? 'Создаю...' : '🗂 Создать карточки'}
              </button>
              <button className="btn-icon" onClick={handleSummarize} title="Перегенерировать">🔄</button>
            </div>
          </div>
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {summary}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryView;
