import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FileUploader from '../components/FileUploader';
import DocumentCard from '../components/DocumentCard';
import { DocumentService, onProcessingUpdate } from '../../../services/document.service';
import Skeleton from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/ToastProvider';
import './DocumentsPage.css';

const DocumentsPage = () => {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processing, setProcessing] = useState(new Map());
  const navigate = useNavigate();
  const { addToast } = useToast();

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const docs = await DocumentService.getAllDocuments();
      setDocuments(docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (error) {
      console.error('Failed to load documents', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    const unsub = onProcessingUpdate((map) => {
      setProcessing(new Map(map));
      for (const [, info] of map) {
        if (info.pct === 100) { loadDocuments(); break; }
      }
    });
    return unsub;
  }, []);

  const handleFileUpload = async (file) => {
    try {
      await DocumentService.saveDocument(file);
      await loadDocuments();
      addToast('Документ загружен и обработан!', 'success');
    } catch (error) {
      console.error('Upload failed:', error);
      addToast('Ошибка при загрузке файла', 'error');
    }
  };

  const handleRenameDocument = async (id, newName) => {
    try {
      await DocumentService.renameDocument(id, newName);
      await loadDocuments();
      addToast('Документ переименован', 'success');
    } catch (error) {
      console.error('Rename failed:', error);
      addToast('Не удалось переименовать документ', 'error');
    }
  };

  const handleDeleteDocument = async (id) => {
    try {
      await DocumentService.deleteDocument(id);
      await loadDocuments();
      addToast('Документ удален', 'success');
    } catch (error) {
      console.error('Delete failed:', error);
      addToast('Не удалось удалить документ', 'error');
    }
  };

  return (
    <div className="documents-page">
      <div className="page-header">
        <h2>Мои документы</h2>
        <p className="text-muted">Загружайте лекции, конспекты и учебники</p>
      </div>

      {processing.size > 0 && (
        <div className="processing-status">
          {Array.from(processing.entries()).map(([docId, info]) => (
            <div key={docId} className="processing-item">
              <div className="processing-header">
                <span className="processing-name">{info.name}</span>
                <span className="processing-label">{info.status}</span>
              </div>
              {info.pct >= 0 && (
                <div className="processing-bar">
                  <div className="processing-fill" style={{ width: `${info.pct}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <div className="upload-section">
        <FileUploader onUpload={handleFileUpload} />
      </div>
      
      <div className="documents-grid">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="doc-skeleton">
              <Skeleton height="140px" style={{ marginBottom: '16px' }} />
              <Skeleton height="24px" width="80%" style={{ marginBottom: '8px' }} />
              <Skeleton height="16px" width="40%" />
            </div>
          ))
        ) : documents.length === 0 ? (
          <div className="empty-state fade-in">
            <div className="empty-icon">📚</div>
            <h3>Нет документов</h3>
            <p className="text-muted">Загрузите свой первый PDF или конспект, чтобы начать.</p>
          </div>
        ) : (
          documents.map(doc => (
            <DocumentCard 
              key={doc.id} 
              document={doc} 
              onClick={() => navigate(`/documents/${doc.id}`)} 
              onRename={handleRenameDocument}
              onDelete={handleDeleteDocument}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default DocumentsPage;
