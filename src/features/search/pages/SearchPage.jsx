import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EmbeddingService } from '../../../services/embedding.service';
import { AIService } from '../../../services/ai.service';
import { MemoryService } from '../../../services/memory.service';
import { PaywallGuard } from '../../../components/guards/PaywallGuard';
import './SearchPage.css';

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // RAG State
  const [sources, setSources] = useState([]);
  const [answer, setAnswer] = useState('');
  
  const navigate = useNavigate();
  const answerRef = useRef(null);

  useEffect(() => {
    if (answer && answerRef.current) {
      answerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [answer]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    setAnswer('');
    setSources([]);
    
    try {
      // 1. Поиск по документам (Retrieval)
      const searchResults = await EmbeddingService.search(query, 5, 0.3);
      setSources(searchResults);

      // 2. Поиск по Умной памяти пользователя
      const memoryFacts = await MemoryService.getRelevantMemory(query, 3);

      // 3. Формирование контекста для RAG
      const contextText = searchResults.map(r => `[Источник: ${r.document.name}]: ${r.chunk.text}`).join('\n\n');
      
      let systemInstruction = `Ты — эксперт-исследователь Lumea. Твоя задача — точно и достоверно ответить на вопрос пользователя, используя ИСКЛЮЧИТЕЛЬНО предоставленный контекст из его документов.

ПРАВИЛА:
1. Относись к предоставленному контексту как к единственному источнику истины (Evidence).
2. НЕ выдумывай факты и не используй внешние знания, даже если они кажутся верными.
3. Обязательно указывай названия источников в формате: "Согласно документу [Название], ...".
4. Если в контексте нет информации для ответа на вопрос, ответь строго: "К сожалению, в ваших документах нет ответа на этот вопрос".`;

      if (memoryFacts.length > 0) {
        systemInstruction += `\n\nКонтекст о пользователе (Умная память):\n- ${memoryFacts.join('\n- ')}\nУчитывай эти факты при ответе, если это релевантно.`;
      }

      const prompt = `КОНТЕКСТ (EVIDENCE):\n${contextText}\n\nВОПРОС: ${query}`;

      // 4. Стриминг ответа (Generation)
      const stream = await AIService.streamContent(prompt, systemInstruction);
      
      for await (const chunk of stream) {
        setAnswer(prev => prev + (chunk.text || ''));
      }
      
    } catch (error) {
      console.error("Search failed", error);
      setAnswer('Произошла ошибка при генерации ответа. Возможно, нет доступа к API.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <PaywallGuard featureName="RAG-чат по базе знаний">
      <div className="search-page fade-in">
        <div className="search-header" style={{ marginTop: '20px' }}>
          <p className="search-subtitle text-muted">
            Задайте вопрос, и AI соберет ответ по всем вашим конспектам и лекциям.
          </p>

          <form onSubmit={handleSearch} className="search-form">
            <input 
              type="text" 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="Например: В чем отличие митоза от мейоза?" 
              className="search-input"
            />
            <button 
              type="submit" 
              className="btn-primary interactive search-btn"
              disabled={isSearching || !query.trim()}
            >
              {isSearching ? 'Думает...' : 'Спросить'}
            </button>
          </form>
        </div>

        <div className="search-results-container">
          
          {hasSearched && (
            <div className="rag-answer-box slide-up">
              <div className="rag-answer-header">
                <span className="rag-icon">✨</span>
                <h3>AI-Синтез</h3>
              </div>
              
              <div className="markdown-body">
                {answer ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                ) : isSearching ? (
                  <div className="search-loading">
                    <div className="spinner"></div>
                    Изучение ваших документов...
                  </div>
                ) : null}
              </div>
              <div ref={answerRef} />
            </div>
          )}

          {sources.length > 0 && (
            <div className="sources-list slide-up">
              <h4 className="sources-title text-muted">
                Источники ({sources.length})
              </h4>
              <div className="sources-cards">
                {sources.map((result, index) => (
                  <div 
                    key={result.chunk.id} 
                    className="result-card interactive"
                    onClick={() => navigate(`/documents/${result.document.id}`)}
                  >
                    <div className="result-card-header">
                      <div className="result-card-name">
                        <span className="result-icon">{result.document.type.includes('pdf') ? '📕' : '📘'}</span>
                        <span className="result-doc-name">{result.document.name}</span>
                      </div>
                      <span className="text-small text-muted">Совпадение: {Math.round(result.score * 100)}%</span>
                    </div>
                    <div className="result-text text-muted text-small">
                      "...{result.chunk.text.substring(0, 150)}..."
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PaywallGuard>
  );
};

export default SearchPage;
