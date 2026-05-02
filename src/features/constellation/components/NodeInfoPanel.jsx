import { FileText, X } from 'lucide-react';

const NodeInfoPanel = ({ data, onClose, onNavigate, onRelationClick }) => {
  if (!data) return null;

  return (
    <div className="link-panel">
      <button className="link-panel-close" onClick={onClose}><X size={14} /></button>

      <div className="link-panel-header" style={{ marginBottom: '12px' }}>
        <span className="link-panel-doc" style={{ fontSize: '1rem', background: 'transparent', border: 'none', padding: 0 }}>
          {data.name}
        </span>
      </div>

      <div className="node-panel-stats">
        <div className="node-panel-stat">
          <span className="node-panel-stat-label">Фрагменты</span>
          <span className="node-panel-stat-value" style={{ color: data.chunkCount === 0 ? '#ff6b6b' : '#c4a77d' }}>
            {data.chunkCount === 0 ? 'Нет' : data.chunkCount}
          </span>
        </div>
        <div className="node-panel-stat">
          <span className="node-panel-stat-label">Карточки</span>
          <span className="node-panel-stat-value">{data.cardCount}</span>
        </div>
        <div className="node-panel-stat">
          <span className="node-panel-stat-label">Конспект</span>
          <span className="node-panel-stat-value">{data.hasSummary ? 'Есть' : 'Нет'}</span>
        </div>
      </div>

      {data.keywords?.length > 0 && (
        <div className="link-panel-section">
          <div className="link-panel-section-title">Ключевые темы</div>
          <div className="link-panel-keywords">
            {data.keywords.map((kw, i) => <span key={i} className="link-panel-keyword">{kw}</span>)}
          </div>
        </div>
      )}

      <button className="node-panel-action" onClick={() => onNavigate(data.id)}>
        <FileText size={14} /> Открыть документ
      </button>

      {data.relations?.length > 0 && (
        <div className="node-panel-relations">
          <div className="link-panel-section-title">Связанные документы</div>
          {data.relations.slice(0, 5).map(rel => (
            <div key={rel.id} className="node-panel-relation" onClick={() => onRelationClick(rel.id)}>
              <span className="node-panel-relation-name" title={rel.name}>{rel.name}</span>
              <span className="node-panel-relation-sim">{Math.round(rel.sim * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NodeInfoPanel;
