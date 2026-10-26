import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import path from 'node:path';
import { readFile, mkdir, stat, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pressureJoins, pressureOutline } from '../shared/pressure.mjs';
import { flattenInkOutline } from './inkGeometry.mjs';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, processEntities: false });
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const resolvePart = (part, target) => target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(part), target));
async function xml(zip, name) {
  const part = zip.file(name);
  if (!part) throw new Error(`Missing PowerPoint part: ${name}`);
  return parser.parse(await part.async('string'));
}
function texts(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) => key === 't'
    ? list(value).map(v => String(typeof v === 'object' ? v['#text'] ?? '' : v))
    : key.startsWith('@_') ? [] : list(value).flatMap(texts));
}
function largestFont(node) {
  if (!node || typeof node !== 'object') return 0;
  return Math.max(Number(node['@_sz']) || 0, ...Object.values(node).filter(v => typeof v === 'object').flatMap(v => list(v).map(largestFont)));
}
export async function inspectDeck(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 15000 || entries.reduce((n, f) => n + (f._data?.uncompressedSize ?? 0), 0) > 500 * 1024 * 1024) {
    throw new Error('This presentation is too large after decompression (500 MB maximum).');
  }
  if (entries.some(f => /vbaProject\.bin$/i.test(f.name))) throw new Error('Please save a macro-free .pptx copy first.');
  const presentation = (await xml(zip, 'ppt/presentation.xml')).presentation;
  const idsParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false });
  const namespaced = idsParser.parse(await zip.file('ppt/presentation.xml').async('string'));
  const rootName = Object.keys(namespaced).find(k => k === 'presentation' || k.endsWith(':presentation'));
  const fullPresentation = namespaced[rootName];
  const listName = Object.keys(fullPresentation).find(k => k === 'sldIdLst' || k.endsWith(':sldIdLst'));
  const fullList = fullPresentation[listName] ?? {};
  const entryName = Object.keys(fullList).find(k => k === 'sldId' || k.endsWith(':sldId'));
  const fullIds = list(fullList[entryName]);
  const rels = list((await xml(zip, 'ppt/_rels/presentation.xml.rels')).Relationships.Relationship);
  const order = list(presentation.sldIdLst?.sldId);
  if (!order.length || order.length > 300) throw new Error('Use a presentation with 1–300 slides.');
  const width = Number(presentation.sldSz?.['@_cx']);
  const height = Number(presentation.sldSz?.['@_cy']);
  if (!(width > 0 && height > 0)) throw new Error('Invalid slide dimensions.');
  const slides = [];
  for (const [index, entry] of order.entries()) {
    const relId = fullIds[index]?.['@_r:id'] ?? entry['@_id'];
    const rel = rels.find(r => r['@_Id'] === relId);
    if (!rel || rel['@_TargetMode'] === 'External') throw new Error('Invalid slide relationship.');
    const part = resolvePart('ppt/presentation.xml', rel['@_Target']);
    if (!part.startsWith('ppt/slides/')) throw new Error('Invalid slide part.');
    const slide = (await xml(zip, part)).sld;
    const shapes = list(slide.cSld?.spTree?.sp);
    const titleShape = shapes.find(s => ['title', 'ctrTitle'].includes(s.nvSpPr?.nvPr?.ph?.['@_type']));
    const largestShape = [...shapes].sort((a, b) => largestFont(b) - largestFont(a))[0];
    const title = texts(titleShape ?? largestShape).join(' ').trim() || `Slide ${index + 1}`;
    let notes = '';
    const relPath = path.posix.join(path.posix.dirname(part), '_rels', path.posix.basename(part) + '.rels');
    if (zip.file(relPath)) {
      const slideRels = list((await xml(zip, relPath)).Relationships.Relationship);
      const noteRel = slideRels.find(r => r['@_Type']?.endsWith('/notesSlide') && r['@_TargetMode'] !== 'External');
      if (noteRel) {
        const noteDoc = (await xml(zip, resolvePart(part, noteRel['@_Target']))).notes;
        notes = list(noteDoc?.cSld?.spTree?.sp)
          .filter(s => s.nvSpPr?.nvPr?.ph?.['@_type'] === 'body')
          .flatMap(s => list(s.txBody?.p).map(p => texts(p).join(''))).join('\n').trim();
      }
    }
    slides.push({ part, title, notes, image: `slide-${index + 1}.png` });
  }
  return { width, height, slides };
}

let conversion = Promise.resolve();
export function renderDeck(input, output, pdfOnly = false) {
  input = path.resolve(input); output = path.resolve(output);
  const operation = conversion.then(async () => {
    if (process.platform !== 'win32') throw new Error('PPTX import currently requires Windows with desktop Microsoft PowerPoint installed.');
    await mkdir(output, { recursive: true });
    const script = fileURLToPath(new URL('./render.ps1', import.meta.url));
    await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
        windowsHide: true,
        env: { ...process.env, INKSTAGE_INPUT: input, INKSTAGE_OUTPUT: output, INKSTAGE_PDF_ONLY: pdfOnly ? '1' : '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
      const timeout = setTimeout(() => { child.kill(); reject(new Error('PowerPoint took too long to render. Close any PowerPoint dialogs and try again.')); }, 180000);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`PowerPoint could not render this file. Check that PowerPoint is activated and the file opens normally. ${stderr.slice(0, 600)}`)); });
    });
    await rename(path.join(output, 'deck.pending.pdf'), path.join(output, 'deck.pdf'));
  });
  conversion = operation.catch(() => {});
  return operation;
}

const pdfJobs = new Map();
export async function ensurePDF(directory) {
  const output = path.join(directory, 'slides');
  const target = path.join(output, 'deck.pdf');
  if (pdfJobs.has(target)) { await pdfJobs.get(target); return target; }
  try { if ((await stat(target)).size > 8) return target; } catch { /* Upgrade an existing session. */ }
  if (!pdfJobs.has(target)) {
    const job = renderDeck(path.join(directory, 'original.pptx'), output, true).finally(() => pdfJobs.delete(target));
    pdfJobs.set(target, job);
  }
  await pdfJobs.get(target);
  return target;
}

// Add ordinary editable DrawingML freeform shapes to the original package.
// All existing slides, layouts, notes, media and relationships are retained.
export async function exportDeck(buffer, metadata, strokes) {
  const zip = await JSZip.loadAsync(buffer);
  for (const [index, slide] of metadata.slides.entries()) {
    const ink = strokes[index] ?? [];
    if (!ink.length) continue;
    let source = await zip.file(slide.part).async('string');
    const parsed = parser.parse(source);
    if (!parsed.sld?.cSld?.spTree) throw new Error('Unsupported slide structure.');
    const prefix = source.match(/<([\w]+):spTree\b/)?.[1] ?? 'p';
    const drawingPrefix = source.match(/xmlns:([\w]+)="http:\/\/schemas.openxmlformats.org\/drawingml\/2006\/main"/)?.[1] ?? 'a';
    if (!source.includes(`xmlns:${drawingPrefix}=`)) source = source.replace(/<([\w]+:)?sld\b/, match => `${match} xmlns:${drawingPrefix}="http://schemas.openxmlformats.org/drawingml/2006/main"`);
    const p = prefix, a = drawingPrefix;
    let nextId = Math.max(1, ...Array.from(source.matchAll(/\bid="(\d+)"/g), m => Number(m[1]))) + 1;
    const shapes = ink.filter(s => s.points.length).map(stroke => {
      const outline = pressureOutline(stroke, metadata.width / metadata.height);
      const geometryPath = (commands, filled) => `<${a}:path w="${metadata.width}" h="${metadata.height}" fill="${filled ? 'norm' : 'none'}" stroke="${filled ? '0' : '1'}">${commands}</${a}:path>`;
      const pointCommands = points => points.map((point, i) => `<${a}:${i ? 'lnTo' : 'moveTo'}><${a}:pt x="${point.x}" y="${point.y}"/></${a}:${i ? 'lnTo' : 'moveTo'}>`).join('');
      let bodyPaths;
      if (outline) {
        bodyPaths = flattenInkOutline(outline).map(polygon => geometryPath(polygon.map(ring => {
          const points = ring.map(([x, y]) => ({ x: Math.round(x * metadata.width), y: Math.round(y * metadata.height) }));
          return pointCommands(points) + `<${a}:close/>`;
        }).join(''), true)).join('');
      } else {
        let points = stroke.points.map(point => ({ x: Math.round(point.x * metadata.width), y: Math.round(point.y * metadata.height) }));
        if (points.length === 1) points = [points[0], { x: points[0].x + 1, y: points[0].y + 1 }];
        bodyPaths = geometryPath(pointCommands(points), false);
      }
      const joinPaths = outline ? pressureJoins(stroke, metadata.width / metadata.height).map(join => {
        const cx = join.x * metadata.width, cy = join.y * metadata.height, radius = join.radius / 1600 * metadata.width;
        const pt = (x, y) => `<${a}:pt x="${Math.round(cx + x * radius)}" y="${Math.round(cy + y * radius)}"/>`;
        const k = .5522847498;
        const curves = [[1, k, k, 1, 0, 1], [-k, 1, -1, k, -1, 0], [-1, -k, -k, -1, 0, -1], [k, -1, 1, -k, 1, 0]];
        const disk = `<${a}:moveTo>${pt(1, 0)}</${a}:moveTo>` + curves.map(c => `<${a}:cubicBezTo>${pt(c[0], c[1])}${pt(c[2], c[3])}${pt(c[4], c[5])}</${a}:cubicBezTo>`).join('') + `<${a}:close/>`;
        return geometryPath(disk, true);
      }).join('') : '';
      const color = stroke.color.replace('#', '').toUpperCase();
      const alpha = stroke.tool === 'highlighter' ? 30000 : 100000;
      const lineWidth = Math.round(stroke.width / 1600 * metadata.width);
      const fill = `<${a}:solidFill><${a}:srgbClr val="${color}"><${a}:alpha val="${alpha}"/></${a}:srgbClr></${a}:solidFill>`;
      const style = outline ? `${fill}<${a}:ln><${a}:noFill/></${a}:ln>` : `<${a}:noFill/><${a}:ln w="${lineWidth}" cap="rnd" cmpd="sng">${fill}<${a}:prstDash val="solid"/><${a}:round/><${a}:headEnd type="none"/><${a}:tailEnd type="none"/></${a}:ln>`;
      return `<${p}:sp><${p}:nvSpPr><${p}:cNvPr id="${nextId++}" name="Inkstage ${stroke.tool}"/><${p}:cNvSpPr/><${p}:nvPr/></${p}:nvSpPr><${p}:spPr><${a}:xfrm><${a}:off x="0" y="0"/><${a}:ext cx="${metadata.width}" cy="${metadata.height}"/></${a}:xfrm><${a}:custGeom><${a}:avLst/><${a}:gdLst/><${a}:ahLst/><${a}:cxnLst/><${a}:rect l="0" t="0" r="r" b="b"/><${a}:pathLst>${bodyPaths}${joinPaths}</${a}:pathLst></${a}:custGeom>${style}</${p}:spPr></${p}:sp>`;
    }).join('');
    source = source.replace(`</${p}:spTree>`, `${shapes}</${p}:spTree>`);
    zip.file(slide.part, source);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function readOriginal(directory) { return readFile(path.join(directory, 'original.pptx')); }
