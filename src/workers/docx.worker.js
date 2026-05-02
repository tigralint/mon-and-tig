import mammoth from 'mammoth';

self.onmessage = async (e) => {
  const { file } = e.data;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Извлекаем только текст (для эмбеддингов и суммаризации этого достаточно)
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    self.postMessage({ success: true, text: result.value });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
