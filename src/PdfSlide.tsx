import { memo, useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask, type PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { headers, type Credentials } from './types';
import { pdfTilePlacement, pdfTiles } from './pdfTiles';

GlobalWorkerOptions.workerSrc = workerUrl;
const documents = new Map<string, Promise<PDFDocumentProxy>>();
function documentFor(credentials: Credentials) {
  const key = `${credentials.id}:${credentials.role}:${credentials.token}`;
  let document = documents.get(key);
  if (!document) {
    document = getDocument({ url: `/api/sessions/${credentials.id}/slides.pdf`, httpHeaders: headers(credentials), wasmUrl: '/pdfjs/wasm/', cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise;
    documents.set(key, document);
    document.catch(() => documents.delete(key));
    // A tab only displays one deck; don't retain documents from past sessions.
    if (documents.size > 2) {
      const oldest = documents.keys().next().value!;
      const previous = documents.get(oldest)!; documents.delete(oldest);
      void previous.then(pdf => pdf.loadingTask.destroy()).catch(() => {});
    }
  }
  return document;
}

export const PdfSlide = memo(function PdfSlide({ credentials, slide, scale, x, y }: { credentials: Credentials; slide: number; scale: number; x: number; y: number }) {
  const host = useRef<HTMLDivElement>(null);
  const previousPage = useRef('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const element = host.current; if (!element) return;
    let disposed = false, generation = 0, timer: ReturnType<typeof setTimeout>;
    let task: RenderTask | undefined, page: PDFPageProxy | undefined;
    const pageKey = `${credentials.id}:${slide}`;
    if (previousPage.current !== pageKey) { element.replaceChildren(); previousPage.current = pageKey; setLoading(true); }
    setError('');
    const render = async (current: number) => {
      try {
        const pdf = await documentFor(credentials);
        const nextPage = await pdf.getPage(slide + 1);
        if (disposed || current !== generation) return;
        page = nextPage;
        const rect = element.getBoundingClientRect();
        const clipping = element.closest('.slide-viewport, .audience-view')?.getBoundingClientRect() ?? rect;
        const density = devicePixelRatio || 1;
        const tiles = pdfTiles(rect, clipping, element.clientWidth, density);
        const viewport = page.getViewport({ scale: rect.width * density / page.getViewport({ scale: 1 }).width });
        const fragment = document.createDocumentFragment();
        for (const tile of tiles) {
          if (disposed || current !== generation) return;
          const canvas = document.createElement('canvas');
          canvas.width = tile.width; canvas.height = tile.height;
          Object.assign(canvas.style, pdfTilePlacement(tile, viewport));
          task = page.render({ canvas, viewport, transform: [1, 0, 0, 1, -tile.x, -tile.y], background: 'white' });
          await task.promise;
          fragment.append(canvas);
        }
        if (!disposed && current === generation) { element.replaceChildren(fragment); setError(''); setLoading(false); }
      } catch (error) {
        if (!disposed && current === generation && (error as Error).name !== 'RenderingCancelledException') { setError('High-resolution slide unavailable. Showing preview.'); setLoading(false); }
      }
    };
    const schedule = () => {
      const current = ++generation;
      task?.cancel(); clearTimeout(timer);
      timer = setTimeout(() => void render(current), 70);
    };
    const observer = new ResizeObserver(schedule); observer.observe(element);
    window.addEventListener('resize', schedule);
    let densityQuery = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    const densityChanged = () => {
      densityQuery.removeEventListener('change', densityChanged);
      densityQuery = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
      densityQuery.addEventListener('change', densityChanged); schedule();
    };
    densityQuery.addEventListener('change', densityChanged);
    schedule();
    return () => {
      disposed = true; generation++; clearTimeout(timer); observer.disconnect(); task?.cancel();
      void task?.promise.catch(() => {}).then(() => page?.cleanup());
      window.removeEventListener('resize', schedule); densityQuery.removeEventListener('change', densityChanged);
    };
  }, [credentials.id, credentials.role, credentials.token, slide, scale, x, y]);
  return <><div className="pdf-slide" ref={host} aria-hidden="true" />{loading && <span className="pdf-loading" role="status">Preparing high-resolution slide…</span>}{error && <span className="pdf-error" role="status">{error}</span>}</>;
});
