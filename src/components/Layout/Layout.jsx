import { useEffect, useCallback, useState, useRef } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import { Outlet, useNavigate } from 'react-router-dom';
import { DocumentService } from '../../services/document.service';
import { useToast } from '../ui/ToastProvider';
import './Layout.css';

const Layout = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // ─── Ctrl+K → Global Search ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        navigate('/search');
        // Focus the search input after navigation
        setTimeout(() => {
          const input = document.querySelector('.search-input');
          if (input) input.focus();
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // ─── Global Drag & Drop ───
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    const supportedExts = ['pdf', 'docx', 'pptx', 'md', 'txt', 'png', 'jpg', 'jpeg', 'webp'];
    const validFiles = files.filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return supportedExts.includes(ext) || f.type.startsWith('image/');
    });

    if (validFiles.length === 0) {
      addToast('Формат не поддерживается. Используйте PDF, DOCX, PPTX, MD, TXT или изображения.', 'error');
      return;
    }

    addToast(`📄 Загрузка ${validFiles.length} файл(ов)...`, 'info', 3000);

    for (const file of validFiles) {
      try {
        await DocumentService.saveDocument(file);
      } catch (err) {
        console.error('Upload error:', err);
        addToast(`Ошибка: ${file.name}`, 'error');
      }
    }

    addToast(`✅ Загружено: ${validFiles.length} файл(ов)`, 'success');
    navigate('/documents');
  }, [navigate, addToast]);

  return (
    <div
      className={`layout-container ${isDragOver ? 'drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Sidebar />
      <div className="layout-main">
        <Header />
        <main className="layout-content">
          <Outlet />
        </main>
      </div>
      <BottomNav />

      {/* Drop overlay */}
      {isDragOver && (
        <div className="global-drop-overlay">
          <div className="drop-overlay-content">
            <div className="drop-icon">📂</div>
            <h3>Перетащите файлы сюда</h3>
            <p className="text-muted">PDF, DOCX, PPTX, Markdown, TXT, изображения</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
