import express from 'express';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { inspectDeck, renderDeck, exportDeck, readOriginal } from './deck.mjs';
import { demoDeck } from './demo.mjs';
import { token, publicState, applyOperation } from './state.mjs';
import { enforceSameOrigin } from './origin.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataRoot = path.resolve(process.env.INKSTAGE_DATA ?? path.join(root, '.data'));
await mkdir(dataRoot, { recursive: true });
const port = Number(process.env.PORT ?? 4173);
const rooms = new Map();
const writes = new Map();
const persist = room => {
  const previous = writes.get(room.id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const { clients, history, saveTimer, ...saved } = room;
    const dir = path.join(dataRoot, room.id);
    await writeFile(path.join(dir, 'session.tmp'), JSON.stringify(saved));
    await rename(path.join(dir, 'session.tmp'), path.join(dir, 'session.json'));
  });
  writes.set(room.id, next);
  next.catch(error => console.error('Could not save session:', error.message));
  return next;
};
function scheduleSave(room) {
  clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => persist(room), 250);
}
for (const entry of await readdir(dataRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^[a-f0-9]{12}$/.test(entry.name)) continue;
  try {
    const saved = JSON.parse(await readFile(path.join(dataRoot, entry.name, 'session.json'), 'utf8'));
    rooms.set(saved.id, { ...saved, clients: new Map(), history: {} });
  } catch { /* An interrupted import has no finished session to restore. */ }
}
const app = express();
app.disable('x-powered-by');
enforceSameOrigin(app);
app.use(express.json({ limit: '128kb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024, files: 1 } });
function auth(room, role, value) {
  if (!room || !['presenter', 'pen', 'audience'].includes(role) || typeof value !== 'string') return false;
  const expected = Buffer.from(room.tokens[role]);
  const actual = Buffer.from(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function protect(roles) {
  return (req, res, next) => {
    const room = rooms.get(req.params.id);
    const role = req.get('x-inkstage-role') ?? 'presenter';
    const value = (req.get('authorization') ?? '').replace(/^Bearer /, '');
    if (!roles.includes(role) || !auth(room, role, value)) return res.status(403).json({ error: 'This session link is invalid. Reopen the link from the presenter.' });
    req.room = room; req.role = role; next();
  };
}
const allRoles = ['presenter', 'pen', 'audience'];
app.get('/api/health', (_req, res) => res.json({ ok: true, importer: process.platform === 'win32' ? 'powerpoint' : 'unavailable', platform: process.platform }));
app.get('/api/network', (req, res) => {
  const entries = Object.entries(os.networkInterfaces()).flatMap(([name, interfaces]) => (interfaces ?? []).filter(a => a.family === 'IPv4' && !a.internal).map(a => ({ ...a, name })));
  const priority = a => (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) ? 10 : 0) + (/wi-?fi|wireless/i.test(a.name) ? 5 : /ethernet/i.test(a.name) ? 3 : 0) - (/vpn|tailscale|virtual|vethernet/i.test(a.name) ? 2 : 0);
  const addresses = entries.sort((a, b) => priority(b) - priority(a)).map(a => `http://${a.address}:${port}`);
  res.json({ addresses: [...new Set(addresses)], local: `http://localhost:${port}`, current: `${req.protocol}://${req.get('host')}` });
});
async function createSession(buffer, name) {
  const metadata = await inspectDeck(buffer);
  const id = randomBytes(6).toString('hex');
  const directory = path.join(dataRoot, id);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(path.join(directory, 'original.pptx'), buffer);
    await renderDeck(path.join(directory, 'original.pptx'), path.join(directory, 'slides'));
    const room = {
      id, name: name.replace(/\.pptx$/i, ''), ...metadata,
      current: 0, blackout: false, strokes: {}, revision: 0,
      timer: { running: false, elapsed: 0, startedAt: null },
      tokens: { presenter: token(), pen: token(), audience: token() },
      clients: new Map(), history: {},
    };
    await persist(room); rooms.set(id, room);
    return { id, token: room.tokens.presenter, role: 'presenter' };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
app.post('/api/sessions', upload.single('deck'), async (req, res) => {
  if (!req.file || !/\.pptx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Choose a .pptx PowerPoint file.' });
  res.status(201).json(await createSession(req.file.buffer, path.basename(req.file.originalname)));
});
app.post('/api/sessions/demo', async (_req, res) => res.status(201).json(await createSession(await demoDeck(), 'Room to think.pptx')));
app.get('/api/sessions/:id', protect(allRoles), (req, res) => res.json(publicState(req.room, req.role)));
app.get('/api/sessions/:id/links', protect(['presenter']), (req, res) => res.json({ tokens: req.room.tokens }));
// Image requests use role-specific tokens since HTML img cannot send auth headers.
app.get('/api/sessions/:id/slides/:image', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!auth(room, req.query.role, req.query.token) || !room.slides.some(s => s.image === req.params.image)) return res.sendStatus(403);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(dataRoot, room.id, 'slides', req.params.image), { dotfiles: 'allow' });
});
app.get('/api/sessions/:id/export', protect(['presenter']), async (req, res) => {
  const room = req.room;
  // Snapshot before awaiting I/O so all slides in one export represent the same instant.
  const strokes = structuredClone(room.strokes);
  const output = await exportDeck(await readOriginal(path.join(dataRoot, room.id)), room, strokes);
  const filename = `${room.name.replace(/[^a-zA-Z0-9 _.-]/g, '_')}-annotated.pptx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.type('application/vnd.openxmlformats-officedocument.presentationml.presentation').send(output);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') return; // Vite handles its own HMR upgrade.
  const room = rooms.get(url.searchParams.get('session'));
  const role = url.searchParams.get('role');
  const origin = req.headers.origin;
  if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || !auth(room, role, url.searchParams.get('token'))) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, room, role));
});
function broadcast(room, message) {
  const value = JSON.stringify(message);
  for (const ws of room.clients.keys()) if (ws.readyState === WebSocket.OPEN) {
    if (ws.bufferedAmount > 2 * 1024 * 1024) { ws.close(1013, 'Connection is too slow. Reconnecting.'); continue; }
    ws.send(value);
  }
}
function presence(room) {
  const counts = { presenter: 0, pen: 0, audience: 0 };
  for (const client of room.clients.values()) counts[client.role]++;
  broadcast(room, { type: 'presence', counts });
}
wss.on('connection', (ws, _req, room, role) => {
  room.clients.set(ws, { role });
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.send(JSON.stringify({ type: 'snapshot', state: publicState(room, role) }));
  presence(room);
  ws.on('message', data => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', at: message.at })); return; }
      if (message.type === 'laser') {
        if (role === 'audience' || !Number.isInteger(message.slide) || message.slide < 0 || message.slide >= room.slides.length || (message.point !== null && (!Number.isFinite(message.point?.x) || !Number.isFinite(message.point?.y) || message.point.x < 0 || message.point.x > 1 || message.point.y < 0 || message.point.y > 1))) throw new Error('Invalid pointer.');
        broadcast(room, { type: 'laser', slide: message.slide, point: message.point }); return;
      }
      const operation = applyOperation(room, message, role);
      if (['undo', 'redo', 'clear', 'erase', 'stroke-cancel'].includes(operation.type)) {
        broadcast(room, { type: 'ink-state', slide: operation.slide, strokes: room.strokes[operation.slide], op: message.op, revision: room.revision });
      } else if (['navigate', 'blackout', 'timer'].includes(operation.type)) {
        broadcast(room, { type: 'controls', current: room.current, blackout: room.blackout, timer: room.timer, revision: room.revision });
      } else broadcast(room, { ...operation, revision: room.revision });
      scheduleSave(room);
    } catch (error) { ws.send(JSON.stringify({ type: 'error', error: error.message })); }
  });
  ws.on('close', () => { room.clients.delete(ws); presence(room); persist(room); });
  ws.on('error', () => {});
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 15000);
heartbeat.unref();

if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
app.use((error, _req, res, _next) => {
  console.error(error.message);
  res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'The maximum file size is 80 MB.' : error.message ?? 'Something went wrong.' });
});
server.listen(port, '0.0.0.0', () => {
  console.log(`\n  Inkstage is ready at http://localhost:${port}\n  Keep this terminal running while presenting.\n`);
});
async function shutdown() {
  for (const room of rooms.values()) { clearTimeout(room.saveTimer); await persist(room); }
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
