import { useState, useEffect, useRef } from 'react';
import './TextSelectionToolbar.css';

const TextSelectionToolbar = ({ onAction }) => {
  const [selection, setSelection] = useState({ text: '', position: null });
  const toolbarRef = useRef(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const activeSelection = window.getSelection();
      const text = activeSelection.toString().trim();

      if (!text) {
        setSelection({ text: '', position: null });
        return;
      }

      // Не показываем, если выделение пустое
      if (activeSelection.rangeCount > 0) {
        const range = activeSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Показываем тулбар только если ширина > 0 (чтобы избежать показа при клике)
        if (rect.width > 0) {
          setSelection({
            text,
            position: {
              top: rect.top - 50, // Выше текста
              left: rect.left + rect.width / 2, // По центру выделения
            }
          });
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    // Добавляем mouseup, так как selectionchange может срабатывать во время драга
    document.addEventListener('mouseup', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
    };
  }, []);

  if (!selection.text || !selection.position) return null;

  const handleActionClick = (actionType) => {
    onAction(actionType, selection.text);
    // Снимаем выделение после действия
    window.getSelection().removeAllRanges();
  };

  return (
    <div 
      ref={toolbarRef}
      className="text-selection-toolbar fade-in scale-in"
      style={{
        position: 'fixed',
        top: `${selection.position.top}px`,
        left: `${selection.position.left}px`,
        transform: 'translateX(-50%)',
        zIndex: 1000,
      }}
    >
      <button onClick={() => handleActionClick('explain')} className="toolbar-btn">
        <span className="icon">💡</span> Объяснить
      </button>
      <div className="toolbar-divider" />
      <button onClick={() => handleActionClick('flashcard')} className="toolbar-btn">
        <span className="icon">🗂</span> В карточку
      </button>
      <div className="toolbar-divider" />
      <button onClick={() => handleActionClick('copy')} className="toolbar-btn">
        <span className="icon">📋</span> Копировать
      </button>
    </div>
  );
};

export default TextSelectionToolbar;
