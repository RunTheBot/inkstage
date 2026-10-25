export type Rect = { left: number; top: number; width: number; height: number };
export type PdfTile = { x: number; y: number; width: number; height: number; left: number; top: number; cssWidth: number; cssHeight: number };

// A retained tile must resize with its slide while a sharper render is being
// prepared. Pixel-based styles freeze it at the previous zoom and expose a
// second, differently sized copy of the slide preview underneath.
export function pdfTilePlacement(tile: Pick<PdfTile, 'x' | 'y' | 'width' | 'height'>, viewport: { width: number; height: number }) {
  return {
    left: `${tile.x / viewport.width * 100}%`,
    top: `${tile.y / viewport.height * 100}%`,
    width: `${tile.width / viewport.width * 100}%`,
    height: `${tile.height / viewport.height * 100}%`,
  };
}

// Render only visible PDF regions, at native display density. Tile dimensions
// limit individual GPU textures without downsampling the vector source.
export function pdfTiles(slide: Rect, clip: Rect, layoutWidth: number, density: number, tileSize = 2048): PdfTile[] {
  if (!slide.width || !slide.height || !layoutWidth) return [];
  const scale = slide.width / layoutWidth;
  const left = Math.max(slide.left, clip.left - 96), top = Math.max(slide.top, clip.top - 96);
  const right = Math.min(slide.left + slide.width, clip.left + clip.width + 96);
  const bottom = Math.min(slide.top + slide.height, clip.top + clip.height + 96);
  if (right <= left || bottom <= top) return [];
  const x0 = Math.floor((left - slide.left) * density), y0 = Math.floor((top - slide.top) * density);
  const x1 = Math.ceil((right - slide.left) * density), y1 = Math.ceil((bottom - slide.top) * density);
  const result: PdfTile[] = [];
  for (let y = y0; y < y1; y += tileSize) for (let x = x0; x < x1; x += tileSize) {
    const width = Math.min(tileSize, x1 - x), height = Math.min(tileSize, y1 - y);
    result.push({ x, y, width, height, left: x / density / scale, top: y / density / scale, cssWidth: width / density / scale, cssHeight: height / density / scale });
  }
  return result;
}
