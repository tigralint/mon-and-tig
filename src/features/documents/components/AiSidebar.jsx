import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Skeleton from '../../../components/ui/Skeleton';
import { AIService } from '../../../services/ai.service';
import { MemoryService } from '../../../services/memory.service';
import { FlashcardService } from '../../../services/flashcard.service';
import { getDB } from '../../../db/database';
import { useToast } from '../../../components/ui/ToastProvider';
import './AiSidebar.css';

const AiSidebar = ({ document, actionContext, onClearAction }) => {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [summary, setSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const messagesEndRef = useRef(null);
  const { addToast } = useToast();

  // Загрузка сохранённого конспекта из БД
  useEffect(() => {
    if (document?.id) {
      loadSavedSummary();
    }
  }, [document?.id]);

  const loadSavedSummary = async () => {
    try {
      const db = await getDB();
      const allSummaries = await db.getAll('summaries');
      const saved = allSummaries.find(s => s.documentId === document.id);
      if (saved) {
        setSummary(saved.content);
      }
    } catch (e) {
      console.error('Failed to load saved summary:', e);
    }
  };

  // Обрабатываем контекстное действие из тулбара
  useEffect(() => {
    if (actionContext) {
      handleContextAction(actionContext);
    }
  }, [actionContext]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const generateSummary = async () => {
    setIsSummarizing(true);
    try {
      const result = await AIService.summarize(document.textContent);
      setSummary(result);

      // Сохраняем в IndexedDB
      const db = await getDB();
      // Удаляем старый конспект если есть
      const allSummaries = await db.getAll('summaries');
      const existing = allSummaries.find(s => s.documentId === document.id);
      if (existing) {
        await db.delete('summaries', existing.id);
      }
      await db.put('summaries', {
        id: crypto.randomUUID(),
        documentId: document.id,
        content: result,
        createdAt: new Date().toISOString()
      });
      addToast('Конспект сохранён', 'success');
    } catch (e) {
      console.error(e);
      setSummary("Не удалось сгенерировать конспект.");
      addToast('Ошибка при создании конспекта', 'error');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGenerateCards = async () => {
    if (!document?.textContent) return;
    setIsGeneratingCards(true);
    try {
      const cards = await FlashcardService.generateFromDocument(document.id, document.textContent);
      addToast(`Создано ${cards.length} карточек!`, 'success');
    } catch (e) {
      console.error(e);
      addToast('Ошибка при создании карточек: ' + e.message, 'error');
    } finally {
      setIsGeneratingCards(false);
    }
  };

  const handleContextAction = async ({ type, text }) => {
    onClearAction(); // Сбрасываем действие
    
    const docContext = document ? `[Контекст документа: "${document.name}"]\n` : '';
    
    let prompt = "";
    if (type === 'explain') {
      prompt = `Ты — эксперт-преподаватель. Твоя задача — просто и понятно объяснить студенту следующий фрагмент текста.
${docContext}
Текст для объяснения:
"""
${text}
"""
Объясни его своими словами, приведи пример, если это уместно, и убедись, что объяснение связано с общей темой документа.`;
    } else if (type === 'flashcard') {
      prompt = `Ты — эксперт по интервальному повторению. Сделай 1-2 флеш-карточки (формат Вопрос-Ответ) из этого текста.
${docContext}
Текст:
"""
${text}
"""
Выдели только самое главное. Карточки должны быть краткими и точными.`;
    } else {
      return;
    }

    const newMessageMessage = { role: 'user', content: `[Выделенный текст]: ${text}\n-> ${type === 'explain' ? 'Объяснить' : 'Сделать карточку'}` };
    setMessages(prev => [...prev, newMessageMessage]);
    
    setIsTyping(true);
    
    // Подготовка пустого ответа ассистента для стриминга
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const memoryFacts = await MemoryService.getRelevantMemory(text, 3);
      let systemInstruction = "Ты — умный AI-репетитор.";
      if (memoryFacts && memoryFacts.length > 0) {
        systemInstruction += `\n\nКонтекст о пользователе (Умная память):\n- ${memoryFacts.join('\n- ')}\nУчитывай эти факты при ответе, но не упоминай саму память напрямую.`;
      }

      const stream = await AIService.streamContent(prompt, systemInstruction);
      
      for await (const chunk of stream) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          newMessages[lastIndex] = {
            ...newMessages[lastIndex],
            content: newMessages[lastIndex].content + (chunk.text || '')
          };
          return newMessages;
        });
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = "Ошибка при генерации ответа.";
        return newMessages;
      });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="ai-sidebar">
      <div className="sidebar-header">
        <h3>AI-Ассистент</h3>
      </div>
      
      <div className="sidebar-content">
        {/* Секция Конспекта */}
        <div className="summary-section">
          <h4 className="section-title">Конспект документа</h4>
          {isSummarizing ? (
            <div className="skeleton-container">
              <Skeleton height="20px" width="80%" style={{marginBottom: '8px'}}/>
              <Skeleton height="20px" width="95%" style={{marginBottom: '8px'}}/>
              <Skeleton height="20px" width="70%" />
            </div>
          ) : summary ? (
            <>
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button 
                  className="btn-secondary interactive" 
                  onClick={handleGenerateCards}
                  disabled={isGeneratingCards}
                  style={{ fontSize: '13px', padding: '8px 12px' }}
                >
                  {isGeneratingCards ? 'Создаю...' : '🗂 Создать карточки'}
                </button>
                <button 
                  className="btn-secondary interactive" 
                  onClick={generateSummary}
                  style={{ fontSize: '13px', padding: '8px 12px' }}
                  title="Перегенерировать"
                >
                  🔄
                </button>
              </div>
            </>
          ) : (
            <button 
              className="generate-btn" 
              onClick={generateSummary}
              style={{
                width: '100%', 
                padding: '10px', 
                backgroundColor: 'var(--accent-gold)', 
                color: 'var(--bg-primary)', 
                border: 'none', 
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Сгенерировать конспект
            </button>
          )}
        </div>

        <hr className="sidebar-divider" />

        {/* Секция Чата / Взаимодействий */}
        <div className="chat-section">
          <h4 className="section-title">Чат по выделению</h4>
          {messages.length === 0 ? (
            <p className="text-muted text-small text-center" style={{padding: '20px 0'}}>
              Выделите текст в документе слева, чтобы задать вопрос или создать карточку.
            </p>
          ) : (
            <div className="messages-list">
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-content markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {isTyping && <div className="typing-indicator">Печатает<span className="dots">...</span></div>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiSidebar;
