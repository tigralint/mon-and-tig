import * as THREE from 'three';

export const NODE_COLORS = [
  { core: 0xffecd2, corona: 0xc4a77d, glow: 0xc4a77d, name: 'gold' },
  { core: 0xd6eeff, corona: 0x7db5c4, glow: 0x5da8c4, name: 'cyan' },
  { core: 0xe8dcff, corona: 0xa47dc4, glow: 0x9060c4, name: 'lavender' },
  { core: 0xffd6e4, corona: 0xc47d9a, glow: 0xc46080, name: 'rose' },
  { core: 0xd6ffe4, corona: 0x7dc4a4, glow: 0x60c490, name: 'mint' },
];

const hexToRGB = (hex) => ({
  r: (hex >> 16) & 0xff,
  g: (hex >> 8) & 0xff,
  b: hex & 0xff,
});

/**
 * Мягкая космическая текстура: горячее ядро → цветное гало → мягкое угасание.
 * Без резких лучей — только плавные градиенты.
 */
const createStarTexture = (palette) => {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  const cx = s / 2, cy = s / 2;
  const { r, g, b } = hexToRGB(palette.corona);
  const cr = hexToRGB(palette.core);

  // Слой 1: Широкое внешнее свечение
  const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.48);
  g1.addColorStop(0, `rgba(${r},${g},${b},0.0)`);
  g1.addColorStop(0.15, `rgba(${r},${g},${b},0.15)`);
  g1.addColorStop(0.35, `rgba(${r},${g},${b},0.06)`);
  g1.addColorStop(0.6, `rgba(${r},${g},${b},0.02)`);
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, s, s);

  // Слой 2: Среднее гало
  ctx.globalCompositeOperation = 'lighter';
  const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.2);
  g2.addColorStop(0, `rgba(${cr.r},${cr.g},${cr.b},0.5)`);
  g2.addColorStop(0.3, `rgba(${r},${g},${b},0.25)`);
  g2.addColorStop(0.6, `rgba(${r},${g},${b},0.08)`);
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, s, s);

  // Слой 3: Яркое ядро
  const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.07);
  g3.addColorStop(0, `rgba(255,255,255,0.95)`);
  g3.addColorStop(0.3, `rgba(${cr.r},${cr.g},${cr.b},0.65)`);
  g3.addColorStop(0.7, `rgba(${r},${g},${b},0.2)`);
  g3.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, s, s);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
};

export const starTextures = NODE_COLORS.map(p => createStarTexture(p));

export const unindexedMaterial = new THREE.MeshBasicMaterial({
  color: 0x555555,
  wireframe: true,
  transparent: true,
  opacity: 0.4,
});
