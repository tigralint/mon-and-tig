import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './PdfViewer.css';
import Skeleton from '../../../components/ui/Skeleton';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Кастомный текстовый оверлей для OCR-страниц.
 * Рендерит невидимые слова поверх изображения страницы —
 * можно выделять и копировать текст как в обычном PDF.
 */
const OcrTextLayer = ({ words, pageWidth, pageHeight }) => {
  if (!words || words.length === 0) return null;

  return (
    <div
      className="ocr-text-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: pageWidth,
        height: pageHeight,
        zIndex: 2,
        pointerEvents: 'all',
      }}
    >
      {words.map((word, i) => (
        <span
          key={i}
          className="ocr-word"
          style={{
            position: 'absolute',
            left: `${word.x * 100}%`,
            top: `${word.y * 100}%`,
            width: `${word.w * 100}%`,
            height: `${word.h * 100}%`,
            fontSize: `${word.h * pageHeight * 0.85}px`,
            lineHeight: `${word.h * pageHeight}px`,
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
};

const PdfViewer = ({ fileUrl, textContent, ocrPages }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageWidth, setPageWidth] = useState(600);
  const containerRef = useRef(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setPageWidth(containerRef.current.clientWidth - 40);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  // Высота страницы (примерно A4 пропорции)
  const getPageHeight = (width) => width * 1.414;

  return (
    <div className="pdf-viewer-container" ref={containerRef}>
      <Document
        file={fileUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <div className="pdf-loading">
            <Skeleton height="800px" width="100%" />
          </div>
        }
        error={<div className="pdf-error">Не удалось загрузить PDF</div>}
      >
        {Array.from(new Array(numPages), (el, index) => {
          const pageNum = index + 1;
          const hasOcr = ocrPages && ocrPages[pageNum];

          return (
            <div key={`page_${pageNum}`} className="pdf-page-wrapper" style={{ position: 'relative' }}>
              <Page
                pageNumber={pageNum}
                width={pageWidth}
                renderAnnotationLayer={false}
                renderTextLayer={!hasOcr}
                loading={<Skeleton height={`${pageWidth * 1.4}px`} width="100%" />}
              />
              {hasOcr && (
                <OcrTextLayer
                  words={ocrPages[pageNum].words}
                  pageWidth={pageWidth}
                  pageHeight={getPageHeight(pageWidth)}
                />
              )}
            </div>
          );
        })}
      </Document>
    </div>
  );
};

export default PdfViewer;
