const STOP_WORDS = new Set([
  'и','в','на','с','по','не','что','это','как','а','но','для','из','к','о','от',
  'за','при','до','он','она','они','мы','вы','все','так','его','её','их','был',
  'была','было','были','быть','может','можно','также','этот','эта','эти','этих',
  'того','тому','между','через','после','перед','более','менее','только','если',
  'уже','ещё','или','ни','то','же','бы','да','нет','очень','будет','есть','без',
  'чем','под','над','где','когда','которые','который','которая','которое','которых',
  'свой','своей','своих','каждый','другой','самый','один','два','три','такой',
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','can','shall',
  'of','in','to','for','with','on','at','from','by','about','as','into','through',
  'and','but','or','not','no','this','that','these','those','it','its','he','she',
  'they','we','you','i','my','your','his','her','our','their','which','who','whom',
  // URL / technical noise
  'http','https','www','com','org','net','edu','gov','html','htm','pdf','php',
  'url','uri','mailto','ftp','tel','img','src','alt','div','span','class',
  'page','pages','fig','figure','table','vol','chapter','section','ibid',
]);

/**
 * Проверяем, является ли слово URL-фрагментом или техническим мусором
 */
const isNoiseWord = (w) => {
  if (/^[a-f0-9]{6,}$/i.test(w)) return true; // hex tokens
  if (/^\d{1,2}[a-z]{1,3}$/i.test(w)) return true; // "2nd", "3rd"
  if (/^[a-z]{1,2}\d+/i.test(w)) return true; // "v2", "p44"
  if (w.includes('/') || w.includes('\\')) return true; // path fragments
  return false;
};

export const extractKeywords = (text, topN = 15) => {
  // Strip URLs before extracting words
  const cleaned = text.replace(/https?:\/\/[^\s]+/gi, ' ').replace(/www\.[^\s]+/gi, ' ');
  const words = cleaned.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, ' ').split(/\s+/);
  const freq = {};
  for (const w of words) {
    if (w.length < 3 || STOP_WORDS.has(w) || /^\d+$/.test(w) || isNoiseWord(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([word]) => word);
};
