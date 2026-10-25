import test from 'node:test';
import assert from 'node:assert/strict';
import { penLaunchLinks } from '../src/androidLink.ts';

test('pen QR uses the app launch path and keeps private credentials in the fragment', () => {
  const input = 'https://aaron.tail2955c9.ts.net/?session=abc123&view=pen#private-token';
  const links = penLaunchLinks(input), qr = new URL(links.qr);
  assert.equal(qr.pathname, '/open-pen');
  assert.equal(qr.searchParams.get('session'), 'abc123');
  assert.equal(qr.hash, '#private-token');
  assert.equal(qr.search.includes('private-token'), false);
  assert.equal(links.browser, input);
  assert.equal(new URL(links.app).searchParams.get('url'), input);
});

test('native launch preserves custom server ports and IPv6 with a working browser fallback', () => {
  for (const origin of ['http://192.168.1.20:4173', 'http://[fd7a:115c:a1e0::1234]:4173', 'https://slides.example.com']) {
    const input = `${origin}/?session=deck&view=pen#token_-123`;
    const links = penLaunchLinks(input);
    assert.equal(new URL(links.qr).origin, origin);
    assert.equal(new URL(links.app).searchParams.get('url'), input);
    assert.match(links.intent, /package=com\.inkstage\.pen;/);
    const fallback = links.intent.match(/S\.browser_fallback_url=([^;]+);/)[1];
    assert.equal(decodeURIComponent(fallback), links.qr);
  }
});

test('presenter, audience, incomplete and executable URLs cannot become app launch links', () => {
  for (const input of ['javascript:alert(1)', 'file:///private', 'https://slides.example.com/?session=deck&view=audience#token', 'https://slides.example.com/?session=deck&view=presenter#token', 'https://slides.example.com/?view=pen#token', 'https://slides.example.com/?session=deck&view=pen', 'https://user:password@slides.example.com/?session=deck&view=pen#token']) assert.throws(() => penLaunchLinks(input));
});
