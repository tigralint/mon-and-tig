import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import './FileUploader.css';

const FileUploader = ({ onUpload }) => {
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;
    
    setIsUploading(true);
    try {
      // Здесь будет логика сохранения в DB и запуска парсинга через Service/Worker
      for (const file of acceptedFiles) {
        if (onUpload) {
          await onUpload(file);
        }
      }
    } finally {
      setIsUploading(false);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/markdown': ['.md'],
      'text/plain': ['.txt'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    }
  });

  return (
    <div 
      {...getRootProps()} 
      className={`uploader-dropzone interactive ${isDragActive ? 'active' : ''} ${isUploading ? 'uploading' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="uploader-content fade-in">
        <div className="uploader-icon">📄</div>
        {isUploading ? (
          <p>Загрузка и обработка файлов...</p>
        ) : isDragActive ? (
          <p className="text-accent">Отпустите файлы здесь...</p>
        ) : (
          <p>
            Перетащите файлы сюда или <span className="text-accent">нажмите</span> для выбора
            <br/>
            <span className="text-small text-muted">PDF, DOCX, PPTX, Markdown, TXT, изображения</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
