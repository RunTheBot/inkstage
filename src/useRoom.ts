import { useEffect, useRef, useState, useCallback } from 'react';
import { type Credentials, type Room, type Operation, type Point, uid } from './types';

import { RoomReplica } from './roomSync';

export function useRoom(credentials: Credentials | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [latency, setLatency] = useState<number | null>(null);
  const [counts, setCounts] = useState({ presenter: 0, pen: 0, audience: 0 });
  const [laser, setLaser] = useState<{ slide: number; point: Point | null; at: number } | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const replica = useRef(new RoomReplica());
  const queued = useRef<{ event: Operation; local: boolean }[]>([]);
  const frame = useRef<number | undefined>(undefined);
  const hiddenTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const publish = useCallback(() => {
    frame.current = undefined; hiddenTimer.current = undefined;
    const events = queued.current; queued.current = [];
    for (let i = 0; i < events.length;) {
      if (events[i].local) {
        const batch: Operation[] = [];
        while (i < events.length && events[i].local) batch.push(events[i++].event);
        replica.current.localBatch(batch);
      } else {
        const batch: Operation[] = [];
        while (i < events.length && !events[i].local) batch.push(events[i++].event);
        replica.current.remoteBatch(batch);
      }
    }
    setRoom(replica.current.room);
  }, []);
  const enqueue = useCallback((event: Operation, local = false) => {
    queued.current.push({ event, local });
    if (frame.current !== undefined || hiddenTimer.current !== undefined) return;
    if (document.hidden) hiddenTimer.current = setTimeout(publish, 50);
    else frame.current = requestAnimationFrame(publish);
  }, [publish]);
  useEffect(() => {
    const visibility = () => {
      // A frame scheduled just before switching tabs can remain suspended.
      // Continue draining incoming ink instead of accumulating an old backlog.
      if (!queued.current.length) return;
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      clearTimeout(hiddenTimer.current);
      frame.current = undefined; hiddenTimer.current = undefined;
      publish();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [publish]);
  const barriers = useRef(new Map<number, { resolve: () => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>());
  useEffect(() => {
    if (!credentials) { replica.current.reset(null); setRoom(null); return; }
    let stopped = false, retry: ReturnType<typeof setTimeout>, ping: ReturnType<typeof setInterval>;
    let attempt = 0;
    function connect() {
      const c = credentials!;
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?session=${c.id}&role=${c.role}&token=${encodeURIComponent(c.token)}`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', at: Date.now() })); }, 3000);
        ws.send(JSON.stringify({ type: 'ping', at: Date.now() }));
      };
      ws.onmessage = e => {
        if (stopped || socket.current !== ws) return;
        const event = JSON.parse(e.data);
        if (event.type === 'snapshot') { queued.current = []; replica.current.reset(event.state); setRoom(event.state); setError(''); setConnected(true); }
        else if (event.type === 'presence') setCounts(event.counts);
        else if (event.type === 'pong') {
          setLatency(Math.max(0, Math.round(Date.now() - event.at)));
          const barrier = barriers.current.get(event.at);
          if (barrier) { clearTimeout(barrier.timeout); barriers.current.delete(event.at); barrier.resolve(); }
        }
        else if (event.type === 'laser') setLaser({ slide: event.slide, point: event.point, at: Date.now() });
        else if (event.type === 'error') { setError(event.error); ws.close(); }
        else enqueue(event);
      };
      ws.onclose = e => {
        setConnected(false); clearInterval(ping);
        for (const barrier of barriers.current.values()) { clearTimeout(barrier.timeout); barrier.reject(new Error('Connection lost before the export could sync. Reconnect and try again.')); }
        barriers.current.clear();
        if (!stopped) {
          if (e.code === 1006 && attempt > 2) setError('Cannot reach this session. Check the link, laptop server, and Wi-Fi connection.');
          retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 8000));
        }
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current); clearTimeout(hiddenTimer.current); frame.current = undefined; hiddenTimer.current = undefined; queued.current = []; stopped = true; clearTimeout(retry); clearInterval(ping); socket.current?.close(); setConnected(false); };
  }, [credentials, enqueue]);
  const send = useCallback((operation: Operation) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 512 * 1024) {
      setError('Ink paused while the connection recovers. Reconnect before writing.');
      if (ws?.readyState === WebSocket.OPEN) ws.close();
      return false;
    }
    const event = { ...operation, op: uid() };
    ws.send(JSON.stringify(event));
    if (operation.type.startsWith('stroke-') || ['erase', 'navigate'].includes(operation.type)) enqueue(event, true);
    return true;
  }, [enqueue]);
  const flush = useCallback(() => new Promise<void>((resolve, reject) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('Reconnect before exporting.')); return; }
    // The server handles this ping after all earlier operations on this socket.
    const at = Date.now() + Math.random();
    const timeout = setTimeout(() => { barriers.current.delete(at); reject(new Error('Could not confirm ink synchronization. Try exporting again.')); }, 5000);
    barriers.current.set(at, { resolve, reject, timeout });
    ws.send(JSON.stringify({ type: 'ping', at }));
  }), []);
  return { room, connected, counts, latency, error, setError, send, flush, laser };
}
