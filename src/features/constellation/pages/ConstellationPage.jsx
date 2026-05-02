import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { getDB } from '../../../db/database';
import { cosineSimilarity } from '../../../utils/cosine';
import './ConstellationPage.css';

// ============================================================
// Палитра цветов для разных документов
// ============================================================
const NODE_COLORS = [
  { core: 0xfff8ee, corona: 0xc4a77d, glow: 0xc4a77d }, // gold
  { core: 0xeef8ff, corona: 0x7db5c4, glow: 0x5da8c4 }, // cyan
  { core: 0xf4eeff, corona: 0xa47dc4, glow: 0x9060c4 }, // lavender
  { core: 0xffeef4, corona: 0xc47d9a, glow: 0xc46080 }, // rose
  { core: 0xeefff4, corona: 0x7dc4a4, glow: 0x60c490 }, // mint
];

// ============================================================
// Simplex noise (упрощённый 3D) для шейдера туманности
// ============================================================
const NEBULA_VERTEX = `
varying vec2 vUv;
varying vec3 vPosition;
void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const NEBULA_FRAGMENT = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vPosition;

// Simplex-like hash
vec3 hash33(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Value noise
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(mix(dot(hash33(i), f), dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), f.x),
        mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), f.x), f.y),
    mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), f.x),
        mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), f.x), f.y), f.z);
  return n * 0.5 + 0.5;
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  // Координаты на сфере
  vec3 dir = normalize(vPosition);
  float t = uTime * 0.02;

  // 3 слоя туманности с разными масштабами и сдвигами
  float n1 = fbm(dir * 2.0 + vec3(t, 0.0, t * 0.5));
  float n2 = fbm(dir * 3.5 + vec3(0.0, t * 0.7, -t));
  float n3 = fbm(dir * 5.0 + vec3(-t * 0.3, t * 0.2, 0.0));

  // Цвета туманности
  vec3 deepBlue = vec3(0.03, 0.04, 0.12);
  vec3 indigo   = vec3(0.06, 0.05, 0.18);
  vec3 azure    = vec3(0.08, 0.15, 0.28);
  vec3 purple   = vec3(0.12, 0.05, 0.2);
  vec3 warmGold = vec3(0.15, 0.1, 0.05);

  // Смешивание
  vec3 col = deepBlue;
  col = mix(col, indigo, smoothstep(0.3, 0.6, n1));
  col = mix(col, azure, smoothstep(0.4, 0.7, n2) * 0.6);
  col = mix(col, purple, smoothstep(0.5, 0.8, n3) * 0.4);
  col = mix(col, warmGold, smoothstep(0.65, 0.85, n1 * n2) * 0.3);

  // Общая яркость — тёмная, но не чёрная
  col *= 0.7;

  // Виньетка: затемнение по краям
  float vignette = smoothstep(0.0, 0.7, abs(dir.y));
  col *= mix(1.0, 0.3, vignette);

  gl_FragColor = vec4(col, 1.0);
}`;

// ============================================================
// Текстура свечения (одна на все узлы)
// ============================================================
const createGlowTex = () => {
  const s = 64, c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.3)');
  g.addColorStop(0.35, 'rgba(200,180,140,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
};
const glowTex = createGlowTex();

// ============================================================
// Стоп-слова (RU + EN) для извлечения ключевых слов
// ============================================================
const STOP_WORDS = new Set([
  // RU
  'и', 'в', 'на', 'с', 'по', 'не', 'что', 'это', 'как', 'а', 'но', 'для', 'из', 'к', 'о', 'от',
  'за', 'при', 'до', 'он', 'она', 'они', 'мы', 'вы', 'все', 'так', 'его', 'её', 'их', 'был',
  'была', 'было', 'были', 'быть', 'может', 'можно', 'также', 'этот', 'эта', 'эти', 'этих',
  'того', 'тому', 'между', 'через', 'после', 'перед', 'более', 'менее', 'только', 'если',
  'уже', 'ещё', 'или', 'ни', 'то', 'же', 'бы', 'да', 'нет', 'очень', 'будет', 'есть', 'без',
  'чем', 'под', 'над', 'где', 'когда', 'которые', 'который', 'которая', 'которое', 'которых',
  'свой', 'своей', 'своих', 'каждый', 'другой', 'самый', 'один', 'два', 'три', 'такой',
  // EN
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'about', 'as', 'into', 'through',
  'and', 'but', 'or', 'not', 'no', 'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she',
  'they', 'we', 'you', 'i', 'my', 'your', 'his', 'her', 'our', 'their', 'which', 'who', 'whom',
]);

/**
 * Извлекает топ-N ключевых слов из текста (TF-подсчёт, без стоп-слов)
 */
const extractKeywords = (text, topN = 15) => {
  const words = text.toLowerCase().replace(/[^a-zа-яёa-z0-9\s]/gi, ' ').split(/\s+/);
  const freq = {};
  for (const w of words) {
    if (w.length < 3 || STOP_WORDS.has(w) || /^\d+$/.test(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
};

// ============================================================
// COMPONENT
// ============================================================
const ConstellationPage = () => {
  const navigate = useNavigate();
  const fgRef = useRef();
  const containerRef = useRef(null);
  const initDone = useRef(false);
  const nebulaTimeRef = useRef({ value: 0 });
  const animFrameRef = useRef(null);

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [linkPanel, setLinkPanel] = useState(null);
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexStatus, setReindexStatus] = useState('');
  const chunksCacheRef = useRef({});

  // --- Resize ---
  useEffect(() => {
    const sync = () => {
      if (containerRef.current)
        setDims({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  // --- Load data ---
  useEffect(() => { loadData(); }, []);

  // --- Cleanup animation ---
  useEffect(() => {
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  // --- Init scene ---
  useEffect(() => {
    if (!fgRef.current || graphData.nodes.length === 0 || initDone.current) return;
    initDone.current = true;
    const fg = fgRef.current;
    const scene = fg.scene();
    const renderer = fg.renderer();

    // --- 1. Bloom ---
    try {
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(dims.w, dims.h), 1.0, 0.5, 0.3
      );
      fg.postProcessingComposer().addPass(bloom);
    } catch (e) { /* fallback */ }

    // --- 2. Процедурная туманность ---
    const nebulaUniforms = { uTime: nebulaTimeRef.current };
    const nebulaMat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      uniforms: { uTime: nebulaUniforms.uTime },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const nebulaSphere = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 32),
      nebulaMat
    );
    scene.add(nebulaSphere);

    // --- 3. Звёздное поле (5000 частиц с разным цветом/размером) ---
    const STAR_COUNT = 5000;
    const sPositions = new Float32Array(STAR_COUNT * 3);
    const sColors = new Float32Array(STAR_COUNT * 3);
    const sSizes = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      sPositions[i * 3] = (Math.random() - 0.5) * 1400;
      sPositions[i * 3 + 1] = (Math.random() - 0.5) * 1400;
      sPositions[i * 3 + 2] = (Math.random() - 0.5) * 1400;
      const type = Math.random();
      if (type < 0.3) {
        // Тёплые (золотые)
        sColors[i * 3] = 0.9 + Math.random() * 0.1;
        sColors[i * 3 + 1] = 0.75 + Math.random() * 0.15;
        sColors[i * 3 + 2] = 0.5 + Math.random() * 0.1;
      } else if (type < 0.6) {
        // Нейтральные (белые)
        const w = 0.85 + Math.random() * 0.15;
        sColors[i * 3] = w; sColors[i * 3 + 1] = w; sColors[i * 3 + 2] = w;
      } else {
        // Холодные (голубые)
        sColors[i * 3] = 0.5 + Math.random() * 0.2;
        sColors[i * 3 + 1] = 0.65 + Math.random() * 0.2;
        sColors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
      }
      // Лог-нормальное распределение: много мелких, мало крупных
      sSizes[i] = 0.15 + Math.pow(Math.random(), 3) * 1.5;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPositions, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(sColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    // --- 4. Освещение ---
    scene.add(new THREE.AmbientLight(0x404060, 0.3));

    // --- 5. Камера: кинематографический dolly-in ---
    fg.cameraPosition({ x: 0, y: 40, z: 320 });
    setTimeout(() => {
      fg.cameraPosition({ x: 0, y: 20, z: 180 }, { x: 0, y: 0, z: 0 }, 4000);
    }, 300);

    const cam = fg.camera();
    cam.far = 2000;
    cam.updateProjectionMatrix();

    // --- 6. Controls ---
    const ctrl = fg.controls();
    ctrl.autoRotate = true;
    ctrl.autoRotateSpeed = 0.15;
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.04;
    ctrl.minDistance = 30;
    ctrl.maxDistance = 600;

    // --- 7. Физика ---
    fg.d3Force('charge').strength(-100);
    fg.d3Force('link').distance(45);

    // --- 8. Animation loop для uTime ---
    const animate = () => {
      nebulaTimeRef.current.value += 0.016;
      nebulaMat.uniforms.uTime.value = nebulaTimeRef.current.value;
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

  }, [graphData, dims]);


  // ============================================================
  // REINDEX — очистка старых чанков и переиндексация с правильным taskType
  // ============================================================
  const reindexAll = async () => {
    if (isReindexing) return;
    setIsReindexing(true);
    try {
      setReindexStatus('🧠 Загружаем модель эмбеддингов...');
      // Подписываемся на прогресс загрузки модели
      const { LocalEmbeddingService, onLoadProgress } = await import('../../../services/local-embedding.service');
      const unsub = onLoadProgress((p) => {
        if (p.error) {
          setReindexStatus(`❌ ${p.error}`);
        } else if (p.modelReady) {
          setReindexStatus('✅ Модель загружена!');
        } else if (p.pct !== undefined && !p.done) {
          setReindexStatus(`⬇️ Загрузка модели: ${p.mbLoaded}/${p.mbTotal}MB (${p.pct}%)`);
        }
      });
      
      await LocalEmbeddingService.preload();
      unsub(); // Отписываемся

      const db = await getDB();
      setReindexStatus('🗑️ Очищаем старые данные...');
      const tx = db.transaction('chunks', 'readwrite');
      await tx.store.clear();
      await tx.done;

      const documents = await db.getAll('documents');
      const docsWithText = documents.filter(d => d.textContent);
      const { EmbeddingService } = await import('../../../services/embedding.service');
      
      for (let i = 0; i < docsWithText.length; i++) {
        const doc = docsWithText[i];
        const shortName = doc.name.length > 25 ? doc.name.substring(0, 22) + '...' : doc.name;
        setReindexStatus(`📄 ${i + 1}/${docsWithText.length}: ${shortName}`);
        await EmbeddingService.indexDocument(doc.id, doc.textContent);
      }
      
      setReindexStatus('✅ Готово!');
      initDone.current = false;
      await loadData();
      setTimeout(() => setReindexStatus(''), 3000);
    } catch (e) {
      console.error('Ошибка переиндексации:', e);
      setReindexStatus(`❌ ${e.message?.substring(0, 60) || 'Ошибка'}`);
    } finally {
      setIsReindexing(false);
    }
  };

  // ============================================================
  // DATA LOADING
  // ============================================================
  const loadData = async () => {
    setIsLoading(true);
    try {
      const db = await getDB();
      const documents = await db.getAll('documents');
      const allChunks = await db.getAll('chunks');
      const allCards = await db.getAll('flashcards');
      const summaries = await db.getAll('summaries');
      if (documents.length === 0) { setIsLoading(false); return; }

      const docIdSet = new Set(documents.map(d => d.id));
      const chunksByDoc = {};
      for (const ch of allChunks) {
        if (!ch.embedding || !docIdSet.has(ch.documentId)) continue;
        (chunksByDoc[ch.documentId] ||= []).push(ch);
      }
      chunksCacheRef.current = chunksByDoc;

      const docEmb = {};
      for (const [id, chunks] of Object.entries(chunksByDoc)) {
        const dim = chunks[0].embedding.length;
        const avg = new Array(dim).fill(0);
        for (const c of chunks) for (let i = 0; i < dim; i++) avg[i] += c.embedding[i];
        for (let i = 0; i < dim; i++) avg[i] /= chunks.length;
        docEmb[id] = avg;
      }

      const cardsByDoc = {};
      for (const c of allCards) cardsByDoc[c.documentId] = (cardsByDoc[c.documentId] || 0) + 1;
      const sumSet = new Set(summaries.map(s => s.documentId));

      const nodes = documents.map((doc, idx) => {
        const cc = chunksByDoc[doc.id]?.length || 0;
        const fc = cardsByDoc[doc.id] || 0;
        const hs = sumSet.has(doc.id);
        const interaction = Math.min(1, (cc > 0 ? 0.3 : 0) + fc * 0.08 + (hs ? 0.2 : 0));
        const palette = NODE_COLORS[idx % NODE_COLORS.length];
        return {
          id: doc.id,
          name: doc.name.replace(/\.(pdf|txt|docx?)$/i, ''),
          val: 1,
          _size: 1.0 + Math.min(2.0, cc * 0.25),
          _brightness: 0.5 + interaction * 0.5,
          _chunkCount: cc,
          _cardCount: fc,
          _palette: palette,
        };
      });

      const nodeIds = new Set(nodes.map(n => n.id));
      const links = [];
      const ids = Object.keys(docEmb).filter(id => nodeIds.has(id));
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const sim = cosineSimilarity(docEmb[ids[i]], docEmb[ids[j]]);
          if (sim > 0.55) { // Для локальной модели 0.55 = реальная тематическая близость
            links.push({ source: ids[i], target: ids[j], _sim: sim });
          }
        }
      }

      setGraphData({ nodes, links });
    } catch (e) {
      console.error('Constellation error:', e);
    } finally {
      setIsLoading(false);
    }
  };


  // ============================================================
  // NODE RENDERER — многослойная "звезда"
  // ============================================================
  const nodeThreeObject = useCallback((node) => {
    const group = new THREE.Group();
    const s = node._size || 1.5;
    const p = node._palette || NODE_COLORS[0];
    const b = node._brightness || 0.6;

    // 1. Яркое ядро (горячий центр)
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.3, 12, 8),
      new THREE.MeshBasicMaterial({ color: p.core })
    );
    group.add(core);

    // 2. Корона (полупрозрачная оболочка)
    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.7, 12, 8),
      new THREE.MeshBasicMaterial({
        color: p.corona,
        transparent: true,
        opacity: 0.12 * b,
      })
    );
    group.add(corona);

    // 3. Мягкий спрайт-ореол
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: p.glow,
        transparent: true,
        opacity: b * 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const gs = s * 5;
    sprite.scale.set(gs, gs, 1);
    group.add(sprite);

    return group;
  }, []);


  // ============================================================
  // INTERACTIONS
  // ============================================================
  const onHover = useCallback((node) => {
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
  }, []);

  const onLinkHover = useCallback((link) => {
    if (containerRef.current) containerRef.current.style.cursor = link ? 'pointer' : 'default';
  }, []);

  const onClick = useCallback((node) => {
    if (!node) return;
    setLinkPanel(null);
    const d = 45;
    const r = 1 + d / Math.hypot(node.x, node.y, node.z);
    fgRef.current.cameraPosition(
      { x: node.x * r, y: node.y * r, z: node.z * r }, node, 1200
    );
    setTimeout(() => navigate(`/documents/${node.id}`), 1500);
  }, [navigate]);

  const onLinkClick = useCallback((link) => {
    if (!link) return;
    const sourceNode = typeof link.source === 'object' ? link.source : graphData.nodes.find(n => n.id === link.source);
    const targetNode = typeof link.target === 'object' ? link.target : graphData.nodes.find(n => n.id === link.target);
    if (!sourceNode || !targetNode) return;

    const sourceId = sourceNode.id;
    const targetId = targetNode.id;
    const chunksA = chunksCacheRef.current[sourceId] || [];
    const chunksB = chunksCacheRef.current[targetId] || [];

    // Общие ключевые слова (только из содержательных чанков)
    const contentChunksA = chunksA.filter(c => c.text && c.text.length > 80);
    const contentChunksB = chunksB.filter(c => c.text && c.text.length > 80);
    const textA = contentChunksA.map(c => c.text).join(' ');
    const textB = contentChunksB.map(c => c.text).join(' ');
    const kwA = new Set(extractKeywords(textA, 25));
    const kwB = new Set(extractKeywords(textB, 25));
    const common = [...kwA].filter(w => kwB.has(w));

    // Самая похожая пара чанков (только содержательные, >80 символов)
    let bestSim = 0, bestA = null, bestB = null;
    for (const ca of contentChunksA) {
      if (!ca.embedding) continue;
      for (const cb of contentChunksB) {
        if (!cb.embedding) continue;
        const s = cosineSimilarity(ca.embedding, cb.embedding);
        if (s > bestSim) { bestSim = s; bestA = ca; bestB = cb; }
      }
    }

    setLinkPanel({
      sim: link._sim,
      docA: sourceNode.name,
      docB: targetNode.name,
      keywords: common.slice(0, 8),
      excerptA: bestA?.text?.substring(0, 150) || '',
      excerptB: bestB?.text?.substring(0, 150) || '',
      chunkSim: bestSim,
    });
  }, [graphData]);

  const nodeLabel = useCallback((node) => `
    <div style="
      background:rgba(5,5,8,0.92);
      backdrop-filter:blur(16px);
      border:1px solid rgba(196,167,125,0.2);
      border-radius:10px;
      padding:14px 18px;
      font-family:'Golos Text',sans-serif;
      min-width:160px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
    ">
      <div style="color:#e8e6e3;font-size:13px;font-weight:500;margin-bottom:8px;">
        ${node.name}
      </div>
      <div style="display:flex;gap:16px;font-size:11px;color:#8a8a8e;">
        <span>Фрагментов: <b style="color:#c4a77d">${node._chunkCount}</b></span>
        <span>Карточек: <b style="color:#c4a77d">${node._cardCount}</b></span>
      </div>
    </div>`, []);

  const linkColor = useCallback((link) => {
    const sim = link._sim || 0.5;
    // Тонкие, деликатные линии — яркость растёт только для сильных связей
    const a = 0.04 + (sim - 0.55) * 0.5;
    return `rgba(180, 160, 130, ${Math.min(a, 0.25)})`;
  }, []);

  const linkWidth = useCallback((link) => {
    const sim = link._sim || 0.5;
    // Тонкие, как нити — от 0.08 до 0.4
    return 0.08 + (sim - 0.55) * 0.7;
  }, []);

  const linkParticleSpeed = useCallback((link) => {
    const sim = link._sim || 0.5;
    return 0.001 + (sim - 0.55) * 0.008;
  }, []);


  // ============================================================
  // RENDER
  // ============================================================
  if (!isLoading && graphData.nodes.length === 0) {
    return (
      <div className="constellation-page fade-in">
        <div className="constellation-empty-3d">
          <div className="empty-icon">🌌</div>
          <h3>Ваша вселенная пуста</h3>
          <p>Загрузите документы, и Lumea превратит их в созвездие ваших знаний.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="constellation-page fade-in">
      <div className="constellation-overlay-header">
        <h2>Созвездие знаний</h2>
        <div className="constellation-header-row">
          <p>{graphData.nodes.length} документов · {graphData.links.length} связей</p>
          <button
            className="constellation-reindex-btn"
            onClick={reindexAll}
            disabled={isReindexing}
          >
            {isReindexing ? '⏳ Индексация...' : '↻ Переиндексировать'}
          </button>
        </div>
        {reindexStatus && (
          <p className="constellation-reindex-status">{reindexStatus}</p>
        )}
      </div>

      <div className="constellation-graph-container" ref={containerRef}>
        {graphData.nodes.length > 0 && (
          <ForceGraph3D
            ref={fgRef}
            width={dims.w}
            height={dims.h}
            graphData={graphData}
            backgroundColor="#000003"
            showNavInfo={false}
            nodeThreeObject={nodeThreeObject}
            nodeThreeObjectExtend={false}
            nodeLabel={nodeLabel}
            linkColor={linkColor}
            linkOpacity={1}
            linkWidth={linkWidth}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={0.25}
            linkDirectionalParticleSpeed={linkParticleSpeed}
            linkDirectionalParticleColor={() => 'rgba(196, 167, 125, 0.6)'}
            onNodeHover={onHover}
            onNodeClick={onClick}
            onLinkHover={onLinkHover}
            onLinkClick={onLinkClick}
            enableNodeDrag={false}
            d3AlphaDecay={0.012}
            d3VelocityDecay={0.2}
            warmupTicks={120}
            cooldownTicks={250}
          />
        )}

        {/* Панель связи */}
        {linkPanel && (
          <div className="link-panel">
            <button className="link-panel-close" onClick={() => setLinkPanel(null)}>✕</button>

            <div className="link-panel-header">
              <span className="link-panel-doc">{linkPanel.docA}</span>
              <span className="link-panel-arrow">⟷</span>
              <span className="link-panel-doc">{linkPanel.docB}</span>
            </div>

            <div className="link-panel-sim">
              <div className="link-panel-sim-bar">
                <div className="link-panel-sim-fill" style={{ width: `${Math.round(linkPanel.sim * 100)}%` }} />
              </div>
              <span className="link-panel-sim-label">{Math.round(linkPanel.sim * 100)}% семантическая близость</span>
            </div>

            {linkPanel.keywords.length > 0 && (
              <div className="link-panel-section">
                <div className="link-panel-section-title">Общие термины</div>
                <div className="link-panel-keywords">
                  {linkPanel.keywords.map((kw, i) => (
                    <span key={i} className="link-panel-keyword">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {linkPanel.excerptA && (
              <div className="link-panel-section">
                <div className="link-panel-section-title">Ближайшие фрагменты <span className="link-panel-chunk-sim">{Math.round(linkPanel.chunkSim * 100)}%</span></div>
                <div className="link-panel-excerpt">
                  <p>«{linkPanel.excerptA.trim()}...»</p>
                </div>
                <div className="link-panel-excerpt">
                  <p>«{linkPanel.excerptB.trim()}...»</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="constellation-hint">
        Вращайте мышью · Приближайте колёсиком · Нажмите на звезду или связь
      </div>
    </div>
  );
};

export default ConstellationPage;
