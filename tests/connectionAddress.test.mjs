import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionAddress } from '../src/connectionAddress.ts';
import { sessionURL } from '../src/types.ts';

test('custom addresses support HTTPS domains, LAN IPs with ports, and IPv6', () => {
  for (const [input, origin] of [
    [' https://slides.example.com/ ', 'https://slides.example.com'],
    ['slides.example.com', 'https://slides.example.com'],
    ['slides.example.com:8443', 'http://slides.example.com:8443'],
    ['slides.example.com:443', 'https://slides.example.com'],
    ['192.168.1.20:4173', 'http://192.168.1.20:4173'],
    ['localhost:4173', 'http://localhost:4173'],
    ['https://192.168.1.20:8443', 'https://192.168.1.20:8443'],
    ['[fd7a:115c:a1e0::1]:4173', 'http://[fd7a:115c:a1e0::1]:4173'],
    ['fd7a:115c:a1e0::1', 'http://[fd7a:115c:a1e0::1]'],
  ]) assert.deepEqual(connectionAddress(input), { origin, error: '' });
});

test('invalid, unsupported, and credential-bearing addresses cannot generate links', () => {
  for (const input of ['', 'https://', 'not a host', '999.168.1.20:4173', 'ftp://slides.example.com', 'javascript:alert(1)', 'https://user:pass@slides.example.com', 'https://slides.example.com/nested/app']) {
    const result = connectionAddress(input); assert.equal(result.origin, ''); assert.ok(result.error, input);
  }
});

test('a pasted session URL cannot carry its old role or token into the new QR link', () => {
  const address = connectionAddress('https://slides.example.com/?session=old&view=presenter#old-presenter-token');
  const url = new URL(sessionURL({ id: 'current', role: 'pen', token: 'pen-token' }, address.origin));
  assert.equal(url.origin, 'https://slides.example.com');
  assert.equal(url.searchParams.get('session'), 'current');
  assert.equal(url.searchParams.get('view'), 'pen');
  assert.equal(url.hash, '#pen-token');
});
