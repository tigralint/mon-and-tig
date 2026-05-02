import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import ForceGraph3D from 'react-force-graph-3d';
import { Maximize, Network, FileText } from 'lucide-react';

import { createNodeThreeObject } from '../three/nodeRenderer';
import { useConstellationData } from '../hooks/useConstellationData';
import { useSceneSetup } from '../hooks/useSceneSetup';
import OnboardingOverlay from '../components/OnboardingOverlay';
import NodeInfoPanel from '../components/NodeInfoPanel';
import LinkInfoPanel from '../components/LinkInfoPanel';
import './ConstellationPage.css';

const ConstellationPage = () => {
  const navigate = useNavigate();
  const fgRef = useRef();
  const containerRef = useRef(null);
  const initDoneRef = useRef(false);

  // Dimensions
  const [dims, setDims] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const sync = () => {
      if (containerRef.current) setDims({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  // Data & interactions
  const data = useConstellationData(fgRef, containerRef, initDoneRef);

  // Scene setup (nebula, starfield, bloom, camera, animation)
  useSceneSetup(fgRef, data.graphData, dims, initDoneRef);

  // Stable ref for nodeThreeObject
  const nodeThreeObject = useCallback(createNodeThreeObject, []);

  // ─── Empty state ───
  if (!data.isLoading && data.fullGraphData.nodes.length === 0) {
    return (
      <div className="constellation-page fade-in">
        <div className="constellation-empty-3d">
          <div className="empty-icon">🌌</div>
          <h3>Ваша вселенная пуста</h3>
          <p>Загрузите документы, и Lumea превратит их в созвездие ваших знаний.</p>
          <Link to="/documents" className="constellation-empty-cta">Загрузить документы</Link>
        </div>
      </div>
    );
  }

  // ─── Main render ───
  return (
    <div className="constellation-page fade-in">
      {/* Header */}
      <div className="constellation-overlay-header">
        <h2>Созвездие знаний</h2>
        <div className="constellation-header-row">
          <p>{data.graphData.nodes.length} документов · {data.graphData.links.length} связей</p>
          <button className="constellation-reindex-btn" onClick={data.reindexAll} disabled={data.isReindexing}>
            {data.isReindexing ? '⏳ Индексация...' : '↻ Переиндексировать'}
          </button>
          <div className="constellation-controls">
            <button className={`constellation-toggle ${data.showUnindexed ? 'active' : ''}`} onClick={() => data.setShowUnindexed(!data.showUnindexed)} title="Неиндексированные документы">
              <FileText size={12} /> Неиндексированные
            </button>
            <button className={`constellation-toggle ${data.showOrphans ? 'active' : ''}`} onClick={() => data.setShowOrphans(!data.showOrphans)} title="Документы без связей">
              <Network size={12} /> Одиночные
            </button>
            <button className="constellation-icon-btn" onClick={data.handleResetView} title="Сбросить камеру">
              <Maximize size={12} />
            </button>
          </div>
        </div>
        {data.reindexStatus && <p className="constellation-reindex-status">{data.reindexStatus}</p>}
      </div>

      <OnboardingOverlay />

      {/* 3D Graph */}
      <div className="constellation-graph-container" ref={containerRef}>
        {data.graphData.nodes.length > 0 && (
          <ForceGraph3D
            ref={fgRef}
            width={dims.w}
            height={dims.h}
            graphData={data.graphData}
            backgroundColor="#000003"
            showNavInfo={false}
            rendererConfig={{ antialias: true, alpha: false }}
            nodeThreeObject={nodeThreeObject}
            nodeThreeObjectExtend={false}
            nodeLabel={() => ''}
            linkColor={data.linkColor}
            linkOpacity={1}
            linkWidth={data.linkWidth}
            linkHoverPrecision={6}
            linkCurvature={0.15}
            linkDirectionalParticles={3}
            linkDirectionalParticleWidth={0.5}
            linkDirectionalParticleSpeed={link => 0.001 + (link._sim - 0.55) * 0.008}
            linkDirectionalParticleColor={() => 'rgba(196, 167, 125, 0.8)'}
            onNodeHover={data.onNodeHover}
            onNodeClick={data.onNodeClick}
            onLinkHover={data.onLinkHover}
            onLinkClick={data.onLinkClick}
            enableNodeDrag={false}
            d3AlphaDecay={0.012}
            d3VelocityDecay={0.2}
            warmupTicks={120}
            cooldownTicks={250}
          />
        )}

        <NodeInfoPanel
          data={data.nodePanel}
          onClose={() => data.setNodePanel(null)}
          onNavigate={(id) => navigate(`/documents/${id}`)}
          onRelationClick={(id) => {
            const node = data.graphData.nodes.find(n => n.id === id);
            if (node) data.onNodeClick(node);
          }}
        />

        <LinkInfoPanel data={data.linkPanel} onClose={() => data.setLinkPanel(null)} />
      </div>

      <div className="constellation-hint">
        Вращайте мышью · Приближайте колёсиком · Нажмите на звезду или связь
      </div>
    </div>
  );
};

export default ConstellationPage;
