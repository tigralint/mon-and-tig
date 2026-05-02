import { useState, useEffect, useRef, useCallback } from 'react';
import { getDB } from '../../../db/database';
import { cosineSimilarity } from '../../../utils/cosine';
import { extractKeywords } from '../utils/keywords';
import { startReindexAll, onIndexingProgress } from '../../../services/indexing-manager';
import {
  PALETTE_SIZE, SIMILARITY_THRESHOLD, CAMERA_ZOOM_NODE, CAMERA_ZOOM_LINK,
  MAX_CHUNK_COMPARISONS, getAdaptiveCameraZ,
} from '../three/constants';

/** Resolve ForceGraph node/link ref to ID (ForceGraph mutates source/target to objects) */
const resolveId = (ref) => typeof ref === 'object' ? ref.id : ref;

/**
 * Хук данных и взаимодействий Constellation.
 * Управляет: загрузка данных, переиндексация, фильтрация, hover/click, панели.
 */
export const useConstellationData = (fgRef, containerRef, initDoneRef) => {
  // ─── State ───
  const [fullGraphData, setFullGraphData] = useState({ nodes: [], links: [] });
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);

  const [linkPanel, setLinkPanel] = useState(null);
  const [nodePanel, setNodePanel] = useState(null);

  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexStatus, setReindexStatus] = useState('');
  const chunksCacheRef = useRef({});
  const prevRunningRef = useRef(false);

  // Мутабельные Set для hover highlight — useRef, не useMemo (стабильная ссылка)
  const [hoverNode, setHoverNode] = useState(null);
  const highlightNodesRef = useRef(new Set());
  const highlightLinksRef = useRef(new Set());

  const [showUnindexed, setShowUnindexed] = useState(true);
  const [showOrphans, setShowOrphans] = useState(true);


  // ─── Filter pipeline ───
  useEffect(() => {
    if (!fullGraphData.nodes.length) return;
    let nodes = fullGraphData.nodes;
    if (!showUnindexed) nodes = nodes.filter(n => n._chunkCount > 0);

    const ids = new Set(nodes.map(n => n.id));
    let links = fullGraphData.links.filter(l =>
      ids.has(resolveId(l.source)) && ids.has(resolveId(l.target))
    );

    if (!showOrphans) {
      const linked = new Set();
      links.forEach(l => { linked.add(resolveId(l.source)); linked.add(resolveId(l.target)); });
      nodes = nodes.filter(n => linked.has(n.id) || (n._chunkCount === 0 && showUnindexed));
    }
    setGraphData({ nodes, links });
  }, [fullGraphData, showUnindexed, showOrphans]);

  // ─── Data loading ───
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const db = await getDB();
      const [documents, allChunks, allCards, summaries] = await Promise.all([
        db.getAll('documents'), db.getAll('chunks'), db.getAll('flashcards'), db.getAll('summaries'),
      ]);
      if (!documents.length) {
        setFullGraphData({ nodes: [], links: [] });
        setGraphData({ nodes: [], links: [] });
        setIsLoading(false);
        return;
      }

      const docIdSet = new Set(documents.map(d => d.id));
      const chunksByDoc = {};
      for (const ch of allChunks) {
        if (!ch.embedding || !docIdSet.has(ch.documentId)) continue;
        (chunksByDoc[ch.documentId] ||= []).push(ch);
      }
      chunksCacheRef.current = chunksByDoc;

      // Average embeddings for fast pre-filtering
      const docEmb = {};
      for (const [id, chunks] of Object.entries(chunksByDoc)) {
        const dim = chunks[0].embedding.length;
        const avg = new Array(dim).fill(0);
        for (const c of chunks) for (let i = 0; i < dim; i++) avg[i] += c.embedding[i];
        for (let i = 0; i < dim; i++) avg[i] /= chunks.length;
        docEmb[id] = avg;
      }

      const cardsByDoc = {};
      const dueCardsByDoc = {};
      const now = new Date().toISOString();
      for (const c of allCards) {
        cardsByDoc[c.documentId] = (cardsByDoc[c.documentId] || 0) + 1;
        if (c.nextReview <= now) dueCardsByDoc[c.documentId] = true;
      }
      const sumSet = new Set(summaries.map(s => s.documentId));

      const nodes = documents.map((doc, idx) => {
        const cc = chunksByDoc[doc.id]?.length || 0;
        const fc = cardsByDoc[doc.id] || 0;
        const hs = sumSet.has(doc.id);
        const interaction = Math.min(1, (cc > 0 ? 0.3 : 0) + fc * 0.08 + (hs ? 0.2 : 0));
        let keywords = [];
        if (cc > 0) keywords = extractKeywords(chunksByDoc[doc.id].map(c => c.text).join(' '), 5);
        return {
          id: doc.id,
          name: doc.name.replace(/\.(pdf|txt|docx?)$/i, ''),
          val: idx,
          _size: cc === 0 ? 1.0 : 1.0 + Math.min(2.5, cc * 0.2),
          _brightness: cc === 0 ? 0.3 : 0.6 + interaction * 0.4,
          _chunkCount: cc, _cardCount: fc, _hasDueCards: !!dueCardsByDoc[doc.id],
          _hasSummary: hs, _colorIdx: idx % PALETTE_SIZE, _keywords: keywords,
        };
      });

      // Compute similarity links via max-sim (best chunk pair per doc pair)
      const nodeIds = new Set(nodes.map(n => n.id));
      const links = [];
      const ids = Object.keys(docEmb).filter(id => nodeIds.has(id));
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          // Fast pre-filter: skip if average embeddings are too far apart
          const avgSim = cosineSimilarity(docEmb[ids[i]], docEmb[ids[j]]);
          if (avgSim < 0.3) continue;

          // Max-sim: find the most similar pair of chunks between two documents
          const chunksA = chunksByDoc[ids[i]];
          const chunksB = chunksByDoc[ids[j]];
          let maxSim = 0;
          for (const ca of chunksA) {
            if (!ca.embedding) continue;
            for (const cb of chunksB) {
              if (!cb.embedding) continue;
              const s = cosineSimilarity(ca.embedding, cb.embedding);
              if (s > maxSim) maxSim = s;
            }
          }
          if (maxSim > SIMILARITY_THRESHOLD) links.push({ source: ids[i], target: ids[j], _sim: maxSim });
        }
      setFullGraphData({ nodes, links });
    } catch (e) { console.error('Constellation error:', e); }
    finally { setIsLoading(false); }
  }, []);

  // ─── Load on mount ───
  useEffect(() => { loadData(); }, []);

  // ─── Subscribe to global indexing manager ───
  useEffect(() => {
    const unsub = onIndexingProgress(({ isRunning, status }) => {
      setIsReindexing(isRunning);
      setReindexStatus(status);
      // When indexing just finished → reload graph data
      if (prevRunningRef.current && !isRunning && !status.startsWith('❌')) {
        initDoneRef.current = false;
        loadData();
      }
      prevRunningRef.current = isRunning;
    });
    return unsub;
  }, [loadData]);

  // ─── Reindex (delegates to global manager) ───
  const reindexAll = useCallback(() => startReindexAll(), []);

  // ─── Hover & highlight ───
  const onNodeHover = useCallback((node) => {
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
    const hn = highlightNodesRef.current;
    const hl = highlightLinksRef.current;
    hn.clear(); hl.clear();
    if (node) {
      hn.add(node.id);
      graphData.links.forEach(l => {
        const s = resolveId(l.source), t = resolveId(l.target);
        if (s === node.id || t === node.id) { hl.add(l); hn.add(s); hn.add(t); }
      });
    }
    setHoverNode(node || null);
  }, [graphData]);

  const onLinkHover = useCallback((link) => {
    if (containerRef.current) containerRef.current.style.cursor = link ? 'pointer' : 'default';
    const hn = highlightNodesRef.current;
    const hl = highlightLinksRef.current;
    hn.clear(); hl.clear();
    if (link) { hl.add(link); hn.add(resolveId(link.source)); hn.add(resolveId(link.target)); }
    setHoverNode(link ? 'link' : null);
  }, []);

  const linkColor = useCallback((link) => {
    let a = 0.15 + (link._sim - SIMILARITY_THRESHOLD) * 0.8;
    if (hoverNode) a = highlightLinksRef.current.has(link) ? Math.min(a * 2, 0.8) : 0.02;
    return `rgba(196, 167, 125, ${Math.min(a, 0.8)})`;
  }, [hoverNode]);

  const linkWidth = useCallback((link) => {
    let w = 0.8 + (link._sim - SIMILARITY_THRESHOLD) * 3.0;
    if (hoverNode && highlightLinksRef.current.has(link)) w *= 2;
    return w;
  }, [hoverNode]);

  // ─── Clicks ───
  const onNodeClick = useCallback((node) => {
    if (!node) return;
    setLinkPanel(null);
    // Related docs
    const rels = graphData.links
      .filter(l => resolveId(l.source) === node.id || resolveId(l.target) === node.id)
      .map(l => {
        const other = resolveId(l.source) === node.id ? l.target : l.source;
        return { id: typeof other === 'object' ? other.id : other, name: typeof other === 'object' ? other.name : 'Документ', sim: l._sim };
      })
      .sort((a, b) => b.sim - a.sim);
    // Camera zoom
    const r = 1 + CAMERA_ZOOM_NODE / Math.hypot(node.x, node.y, node.z);
    fgRef.current?.cameraPosition({ x: node.x * r, y: node.y * r, z: node.z * r }, node, 1000);
    setNodePanel({ id: node.id, name: node.name, chunkCount: node._chunkCount, cardCount: node._cardCount, hasSummary: node._hasSummary, keywords: node._keywords || [], relations: rels });
  }, [graphData]);

  const onLinkClick = useCallback((link) => {
    if (!link) return;
    setNodePanel(null);
    const src = typeof link.source === 'object' ? link.source : graphData.nodes.find(n => n.id === link.source);
    const tgt = typeof link.target === 'object' ? link.target : graphData.nodes.find(n => n.id === link.target);
    if (!src || !tgt) return;
    // Camera to midpoint
    const mx = (src.x+tgt.x)/2, my = (src.y+tgt.y)/2, mz = (src.z+tgt.z)/2;
    const r = 1 + CAMERA_ZOOM_LINK / Math.hypot(mx, my, mz);
    fgRef.current?.cameraPosition({ x: mx*r, y: my*r, z: mz*r }, { x: mx, y: my, z: mz }, 1000);
    // Chunk analysis with comparison limit
    const cA = (chunksCacheRef.current[src.id]||[]).filter(c => c.text?.length > 80);
    const cB = (chunksCacheRef.current[tgt.id]||[]).filter(c => c.text?.length > 80);
    const kwA = new Set(extractKeywords(cA.map(c=>c.text).join(' '), 25));
    const kwB = new Set(extractKeywords(cB.map(c=>c.text).join(' '), 25));
    const common = [...kwA].filter(w => kwB.has(w));
    let bestSim = 0, bestA = null, bestB = null, comparisons = 0;
    outer: for (const ca of cA) {
      if (!ca.embedding) continue;
      for (const cb of cB) {
        if (!cb.embedding) continue;
        if (++comparisons > MAX_CHUNK_COMPARISONS) break outer;
        const s = cosineSimilarity(ca.embedding, cb.embedding);
        if (s > bestSim) { bestSim = s; bestA = ca; bestB = cb; }
      }
    }
    setLinkPanel({ sim: link._sim, docA: src.name, docB: tgt.name, keywords: common.slice(0, 8), excerptA: bestA?.text?.substring(0, 150)||'', excerptB: bestB?.text?.substring(0, 150)||'', chunkSim: bestSim });
  }, [graphData]);

  // ─── Reset view ───
  const handleResetView = useCallback(() => {
    if (!fgRef.current) return;
    fgRef.current.zoomToFit(1000, 40);
    setNodePanel(null); setLinkPanel(null);
  }, [graphData]);

  return {
    graphData, fullGraphData, isLoading,
    isReindexing, reindexStatus, reindexAll,
    showUnindexed, setShowUnindexed, showOrphans, setShowOrphans,
    linkPanel, setLinkPanel, nodePanel, setNodePanel,
    hoverNode,
    onNodeHover, onLinkHover, onNodeClick, onLinkClick,
    linkColor, linkWidth, handleResetView,
  };
};
