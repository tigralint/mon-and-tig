// ============================================================
// Все числовые константы Constellation в одном месте
// ============================================================

/** Количество цветов в палитре NODE_COLORS */
export const PALETTE_SIZE = 5;

/** Минимальный порог cosine similarity для создания связи между документами */
export const SIMILARITY_THRESHOLD = 0.55;

// ─── Camera ───
export const CAMERA_ZOOM_NODE = 25;
export const CAMERA_ZOOM_LINK = 35;
export const CAMERA_Z_FEW = 80;      // 1-2 документа
export const CAMERA_Z_MEDIUM = 180;   // 3-10 документов
export const CAMERA_Z_MANY = 320;     // 10+ документов

export const getAdaptiveCameraZ = (docCount) =>
  docCount <= 2 ? CAMERA_Z_FEW : docCount <= 10 ? CAMERA_Z_MEDIUM : CAMERA_Z_MANY;

// ─── Scene ───
export const STAR_COUNT = 5000;
export const NEBULA_RADIUS = 800;

// ─── Physics (adaptive) ───
/** Адаптивная сила отталкивания: чем меньше нод — тем мягче */
export const getChargeStrength = (nodeCount) =>
  nodeCount <= 3 ? -40 : nodeCount <= 10 ? -80 : -150;

/** Адаптивная длина линков: чем меньше нод — тем ближе */
export const getLinkDistance = (nodeCount) =>
  nodeCount <= 3 ? 50 : nodeCount <= 10 ? 70 : 100;

/** Сила центрального притяжения (не даёт одиночным нодам улетать) */
export const CENTER_GRAVITY = 0.06;

// ─── Limits ───
/** Макс. количество попарных сравнений чанков при анализе связи */
export const MAX_CHUNK_COMPARISONS = 500;
