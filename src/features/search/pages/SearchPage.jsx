import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EmbeddingService } from '../../../services/embedding.service';
import { AIService } from '../../../services/ai.service';
import { MemoryService } from '../../../services/memory.service';
import { getDB } from '../../../db/database';
import { PaywallGuard } from '../../../components/guards/PaywallGuard';
import './SearchPage.css';

const MAX_HISTORY_CONTEXT = 4; // Последние N сообщений в контекст LLM

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Фокус на input при загрузке
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Сохранение сессии в IndexedDB
  const saveSession = useCallback(async (msgs) => {
    if (msgs.length === 0) return;
    try {
      const db = await getDB();
      const id = sessionId || crypto.randomUUID();
      if (!sessionId) setSessionId(id);
      
      const firstUserMsg = msgs.find(m => m.role === 'user');
      await db.put('chat_sessions', {
        id,
        title: firstUserMsg?.content?.substring(0, 60) || 'Чат',
        messages: msgs,
        createdAt: msgs[0]?.timestamp || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to save chat session:', e);
    }
  }, [sessionId]);

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setQuery('');
    inputRef.current?.focus();
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim() || isSearching) return;

    const userMessage = {
      role: 'user',
      content: query.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setQuery('');
    setIsSearching(true);

    // Добавляем пустое сообщение ассистента для стриминга
    const assistantMsg = {
      role: 'assistant',
      content: '',
      sources: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      // 1. Retrieval — семантический поиск
      const searchResults = await EmbeddingService.search(userMessage.content, 5, 0.3);
      
      // Обновляем sources в сообщении ассистента
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], sources: searchResults };
        return updated;
      });

      // 2. Memory — персонализация
      const memoryFacts = await MemoryService.getRelevantMemory(userMessage.content, 3);

      // 3. Контекст из документов
      const contextText = searchResults
        .map(r => `[Источник: ${r.document.name}]: ${r.chunk.text}`)
        .join('\n\n');

      // 4. История диалога для контекста
      const recentHistory = newMessages
        .slice(-MAX_HISTORY_CONTEXT)
        .map(m => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content}`)
        .join('\n');

      let systemInstruction = `Ты — эксперт-исследователь Lumea. Твоя задача — точно и достоверно ответить на вопрос пользователя, используя ИСКЛЮЧИТЕЛЬНО предоставленный контекст из его документов.

ПРАВИЛА:
1. Относись к предоставленному контексту как к единственному источнику истины (Evidence).
2. НЕ выдумывай факты и не используй внешние знания, даже если они кажутся верными.
3. Обязательно указывай названия источников в формате: «Согласно документу **[Название]**, ...».
4. Если в контексте нет информации для ответа на вопрос, ответь строго: «К сожалению, в ваших документах нет ответа на этот вопрос».
5. Если пользователь задаёт уточняющий вопрос — учитывай историю диалога ниже.`;

      if (memoryFacts.length > 0) {
        systemInstruction += `\n\nКонтекст о пользователе (Умная память):\n- ${memoryFacts.join('\n- ')}\nУчитывай эти факты при ответе, если это релевантно.`;
      }

      let prompt = `КОНТЕКСТ (EVIDENCE):\n${contextText}`;
      if (newMessages.length > 1) {
        prompt += `\n\nИСТОРИЯ ДИАЛОГА:\n${recentHistory}`;
      }
      prompt += `\n\nТЕКУЩИЙ ВОПРОС: ${userMessage.content}`;

      // 5. Стриминг ответа
      const stream = await AIService.streamContent(prompt, systemInstruction);
      
      for await (const chunk of stream) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + (chunk.text || ''),
          };
          return updated;
        });
      }

      // 6. Сохраняем сессию
      setMessages(prev => {
        saveSession(prev);
        return prev;
      });

    } catch (error) {
      console.error('Search failed', error);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: 'Произошла ошибка при генерации ответа. Возможно, нет доступа к API.',
        };
        return updated;
      });
    } finally {
      setIsSearching(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <PaywallGuard featureName="RAG-чат по базе знаний">
      <div className={`search-page fade-in ${hasMessages ? 'has-messages' : ''}`}>
        
        {/* Empty state — центрированный */}
        {!hasMessages && (
          <div className="search-empty-state">
            <div className="search-empty-icon">✨</div>
            <h2>Спросите свои документы</h2>
            <p className="text-muted">
              Задайте вопрос на естественном языке — AI соберёт ответ из ваших конспектов и лекций.
            </p>
          </div>
        )}

        {/* Chat messages */}
        {hasMessages && (
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message chat-${msg.role}`}>
                <div className="chat-avatar">
                  {msg.role === 'user' ? '👤' : '✨'}
                </div>
                <div className="chat-bubble">
                  {msg.role === 'user' ? (
                    <p>{msg.content}</p>
                  ) : (
                    <>
                      <div className="markdown-body">
                        {msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        ) : isSearching && i === messages.length - 1 ? (
                          <div className="chat-typing">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        ) : null}
                      </div>

                      {/* Источники */}
                      {msg.sources && msg.sources.length > 0 && msg.content && (
                        <div className="chat-sources">
                          <span className="chat-sources-label">Источники:</span>
                          {msg.sources.map((s, si) => (
                            <button
                              key={si}
                              className="chat-source-tag interactive"
                              onClick={() => navigate(`/documents/${s.document.id}`)}
                              title={`Совпадение: ${Math.round(s.score * 100)}%`}
                            >
                              {s.document.type?.includes('pdf') ? '📕' : '📘'} {s.document.name}
                              <span className="source-score">{Math.round(s.score * 100)}%</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input area — внизу */}
        <div className="search-input-area">
          {hasMessages && (
            <button className="new-chat-btn interactive" onClick={handleNewChat} title="Новый разговор">
              ＋ Новый чат
            </button>
          )}
          <form onSubmit={handleSearch} className="search-form">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={hasMessages ? 'Задайте уточняющий вопрос...' : 'Например: В чём отличие митоза от мейоза?'}
              className="search-input"
              disabled={isSearching}
            />
            <button
              type="submit"
              className="btn-primary interactive search-btn"
              disabled={isSearching || !query.trim()}
            >
              {isSearching ? '⏳' : '→'}
            </button>
          </form>
        </div>
      </div>
    </PaywallGuard>
  );
};

export default SearchPage;
