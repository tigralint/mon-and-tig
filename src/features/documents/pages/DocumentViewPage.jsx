import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PdfViewer from '../components/PdfViewer';
import AiSidebar from '../components/AiSidebar';
import TextSelectionToolbar from '../components/TextSelectionToolbar';
import { DocumentService } from '../../../services/document.service';
import Skeleton from '../../../components/ui/Skeleton';
import mammoth from 'mammoth';

const DocumentViewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [actionContext, setActionContext] = useState(null);
  const [contentUrl, setContentUrl] = useState(null);

  useEffect(() => {
    const loadDocument = async () => {
      const doc = await DocumentService.getDocument(id);
      if (doc) {
        setDocument(doc);
        if (doc.blob) {
          const url = URL.createObjectURL(doc.blob);
          setContentUrl(url);
        }
      } else {
        navigate('/documents');
      }
    };
    loadDocument();
  }, [id, navigate]);

  // Очистка URL
  useEffect(() => {
    return () => {
      if (contentUrl) {
        URL.revokeObjectURL(contentUrl);
      }
    };
  }, [contentUrl]);

  const [docxHtml, setDocxHtml] = useState('');
  
  useEffect(() => {
    if (document && document.type.includes('word') && document.blob) {
      const renderDocx = async () => {
        try {
          const arrayBuffer = await document.blob.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setDocxHtml(result.value);
        } catch (error) {
          console.error("Mammoth error", error);
          setDocxHtml('<p>Ошибка при отображении документа.</p>');
        }
      };
      renderDocx();
    }
  }, [document]);

  if (!document) return (
    <div style={{padding: '40px'}}>
      <Skeleton height="40px" width="30%" style={{marginBottom: '20px'}}/>
      <div style={{display: 'flex', gap: '20px', height: 'calc(100vh - 150px)'}}>
        <Skeleton height="100%" width="60%" />
        <Skeleton height="100%" width="40%" />
      </div>
    </div>
  );

  const handleToolbarAction = (actionType, text) => {
    setActionContext({ type: actionType, text });
  };

  const clearActionContext = () => {
    setActionContext(null);
  };

  const isPdf = document.type.includes('pdf');
  const isWord = document.type.includes('word');

  return (
    <div className="document-view-page fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <button 
          onClick={() => navigate('/documents')}
          style={{ padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', marginRight: '16px' }}
          className="interactive"
        >
          ← Назад
        </button>
        <div>
          <h2 style={{ fontSize: '20px' }}>{document.name}</h2>
          <p className="text-small text-muted">
            {new Date(document.createdAt).toLocaleDateString('ru-RU')}
          </p>
        </div>
      </div>
      
      <div className="split-view-container" style={{ display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' }}>
        <div className="document-panel" style={{ flex: '1.5', position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          {isPdf && contentUrl ? (
            <PdfViewer fileUrl={contentUrl} textContent={document.textContent} ocrPages={document.ocrPages} />
          ) : isWord ? (
            <div className="docx-viewer" style={{ padding: '40px', overflowY: 'auto', height: '100%', background: 'white', color: 'black', fontSize: '16px', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: docxHtml || '<p>Загрузка документа...</p>' }} />
          ) : (
            <div style={{ padding: '20px', overflowY: 'auto', height: '100%', background: 'var(--bg-primary)' }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {document.textContent || "Текст недоступен."}
              </pre>
            </div>
          )}
          <TextSelectionToolbar onAction={handleToolbarAction} />
        </div>
        
        <div className="ai-panel" style={{ flex: '1', minWidth: '350px', overflow: 'hidden', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <AiSidebar 
            document={document} 
            actionContext={actionContext} 
            onClearAction={clearActionContext} 
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentViewPage;
