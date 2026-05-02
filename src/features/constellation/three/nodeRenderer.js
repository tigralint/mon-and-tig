import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { NODE_COLORS, starTextures, unindexedMaterial } from './materials';

// ─── Geometry cache ───
const geoCache = new Map();
const getGeo = (radius, segments) => {
  const key = `${radius.toFixed(3)}-${segments}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(radius, segments, segments));
  return geoCache.get(key);
};

// ─── Hex→RGB helper ───
const hexToRgb = (hex) => {
  const s = hex.toString(16).padStart(6, '0');
  return `${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)}`;
};

/**
 * Создаёт Three.js объект для ноды — спрайтовая звезда с текстовым лейблом.
 */
export const createNodeThreeObject = (node) => {
  const group = new THREE.Group();
  const s = node._size || 1.5;
  const b = node._brightness || 0.6;
  const cIdx = node._colorIdx;
  const isUnindexed = node._chunkCount === 0;

  if (isUnindexed) {
    // Wireframe sphere for unindexed docs
    group.add(new THREE.Mesh(getGeo(s * 0.8, 8), unindexedMaterial));
  } else {
    // Основная звезда — спрайт с процедурной текстурой
    const starSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTextures[cIdx],
      transparent: true,
      opacity: 0.85 + b * 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const starSize = s * 8;
    starSprite.scale.set(starSize, starSize, 1);
    group.add(starSprite);
  }

  // Текстовый лейбл под звездой
  const displayName = node.name.length > 20 ? node.name.substring(0, 18) + '…' : node.name;
  const label = new SpriteText(displayName, 1.2, 'rgba(232,230,227,0.75)');
  label.position.y = -(s + 2);
  label.fontFace = "'Golos Text', sans-serif";
  label.backgroundColor = 'rgba(5, 5, 8, 0.5)';
  label.padding = [3, 1.5];
  label.borderRadius = 3;
  label.borderColor = isUnindexed
    ? 'rgba(255,255,255,0.08)'
    : `rgba(${hexToRgb(NODE_COLORS[cIdx].corona)}, 0.15)`;
  label.borderWidth = 0.3;
  group.add(label);

  return group;
};
