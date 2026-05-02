import './DocumentCard.css';

const DocumentCard = ({ document, onClick, onRename, onDelete }) => {
  const isPdf = document.type.includes('pdf');
  const isWord = document.type.includes('word') || document.name.endsWith('.docx');
  
  let icon = '📄';
  if (isPdf) icon = '📕';
  if (isWord) icon = '📘';

  const date = new Date(document.createdAt).toLocaleDateString('ru-RU');
  const sizeMb = (document.size / (1024 * 1024)).toFixed(2);

  const handleRename = (e) => {
    e.stopPropagation();
    const newName = window.prompt('Введите новое имя документа:', document.name);
    if (newName && newName.trim() && newName.trim() !== document.name) {
      onRename && onRename(document.id, newName.trim());
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Вы уверены, что хотите удалить "${document.name}"?`)) {
      onDelete && onDelete(document.id);
    }
  };

  return (
    <div className="document-card interactive fade-in" onClick={() => onClick && onClick(document)}>
      <div className="doc-icon">{icon}</div>
      <div className="doc-info">
        <h3 className="doc-name" title={document.name}>{document.name}</h3>
        <div className="doc-meta">
          <span className="text-small text-muted">{date}</span>
          <span className="text-small text-muted">{sizeMb} MB</span>
        </div>
      </div>
      <div className="doc-actions">
        <button className="doc-action-btn" onClick={handleRename} title="Переименовать">✏️</button>
        <button className="doc-action-btn" onClick={handleDelete} title="Удалить">🗑️</button>
      </div>
    </div>
  );
};

export default DocumentCard;
