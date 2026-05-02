import { X } from 'lucide-react';

const LinkInfoPanel = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div className="link-panel">
      <button className="link-panel-close" onClick={onClose}><X size={14} /></button>

      <div className="link-panel-header">
        <span className="link-panel-doc">{data.docA}</span>
        <span className="link-panel-arrow">⟷</span>
        <span className="link-panel-doc">{data.docB}</span>
      </div>

      <div className="link-panel-sim">
        <div className="link-panel-sim-bar">
          <div className="link-panel-sim-fill" style={{ width: `${Math.round(data.sim * 100)}%` }} />
        </div>
        <span className="link-panel-sim-label">{Math.round(data.sim * 100)}% семантическая близость</span>
      </div>

      {data.keywords.length > 0 && (
        <div className="link-panel-section">
          <div className="link-panel-section-title">Общие термины</div>
          <div className="link-panel-keywords">
            {data.keywords.map((kw, i) => <span key={i} className="link-panel-keyword">{kw}</span>)}
          </div>
        </div>
      )}

      {data.excerptA && (
        <div className="link-panel-section">
          <div className="link-panel-section-title">
            Ближайшие фрагменты <span className="link-panel-chunk-sim">{Math.round(data.chunkSim * 100)}%</span>
          </div>
          <div className="link-panel-excerpt"><p>«{data.excerptA.trim()}...»</p></div>
          <div className="link-panel-excerpt"><p>«{data.excerptB.trim()}...»</p></div>
        </div>
      )}
    </div>
  );
};

export default LinkInfoPanel;
