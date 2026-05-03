import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PdfViewer from '../components/PdfViewer';
import AiSidebar from '../components/AiSidebar';
import TextSelectionToolbar from '../components/TextSelectionToolbar';
import { DocumentService } from '../../../services/document.service';
import Skeleton from '../../../components/ui/Skeleton';
import mammoth from 'mammoth';
import './DocumentViewPage.css';

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
    <div className="dvp-skeleton">
      <Skeleton height="40px" width="30%" style={{marginBottom: '20px'}}/>
      <div className="dvp-skeleton-split">
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
    <div className="document-view-page fade-in">
      <div className="dvp-header">
        <button 
          onClick={() => navigate('/documents')}
          className="dvp-back-btn interactive"
        >
          ← Назад
        </button>
        <div>
          <h2 className="dvp-title">{document.name}</h2>
          <p className="text-small text-muted">
            {new Date(document.createdAt).toLocaleDateString('ru-RU')}
          </p>
        </div>
      </div>
      
      <div className="dvp-split">
        <div className="dvp-document-panel">
          {isPdf && contentUrl ? (
            <PdfViewer fileUrl={contentUrl} textContent={document.textContent} ocrPages={document.ocrPages} />
          ) : isWord ? (
            <div className="dvp-docx-viewer" dangerouslySetInnerHTML={{ __html: docxHtml || '<p>Загрузка документа...</p>' }} />
          ) : (
            <div className="dvp-text-viewer">
              <pre>
                {document.textContent || "Текст недоступен."}
              </pre>
            </div>
          )}
          <TextSelectionToolbar onAction={handleToolbarAction} />
        </div>
        
        <div className="dvp-ai-panel">
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
