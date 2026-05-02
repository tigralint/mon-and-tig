import { useEffect, useState } from 'react';
import './DocumentViewer.css';

const DocumentViewer = ({ document }) => {
  const [contentUrl, setContentUrl] = useState(null);

  useEffect(() => {
    if (!document || !document.blob) return;
    
    // Создаем object URL для отображения файла (PDF или изображение)
    const url = URL.createObjectURL(document.blob);
    setContentUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [document]);

  if (!document) return <div>Загрузка...</div>;

  const isPdf = document.type.includes('pdf');
  const isImage = document.type.includes('image');
  
  return (
    <div className="document-viewer">
      {isPdf ? (
        <iframe 
          src={contentUrl} 
          title={document.name}
          className="viewer-iframe"
        />
      ) : isImage ? (
        <div className="viewer-image-container">
          <img src={contentUrl} alt={document.name} className="viewer-image" />
        </div>
      ) : (
        <div className="viewer-text">
          <div className="viewer-text-content">
            {document.textContent ? (
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {document.textContent}
              </pre>
            ) : (
              <p className="text-muted text-center" style={{marginTop: '20px'}}>
                Текст недоступен или еще обрабатывается.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentViewer;
