import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { request as httpRequest } from 'node:http';
import { enforceSameOrigin } from '../server/origin.mjs';

test('HTTPS proxy module requests work while foreign origins remain blocked', async () => {
  const app = express();
  enforceSameOrigin(app);
  app.get('/asset.js', (_req, res) => res.type('js').send('export const loaded = true;'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/asset.js`;
    const request = headers => new Promise((resolve, reject) => {
      const req = httpRequest(url, { headers: { Host: 'presenter.example.ts.net', ...headers } }, res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      });
      req.on('error', reject); req.end();
    });
    assert.equal((await request({ Origin: 'http://presenter.example.ts.net' })).status, 200);
    const proxied = await request({ Origin: 'https://presenter.example.ts.net', 'X-Forwarded-Proto': 'https' });
    assert.equal(proxied.status, 200);
    assert.match(proxied.headers['content-type'], /javascript/);
    assert.equal((await request({ Origin: 'https://foreign.example', 'X-Forwarded-Proto': 'https' })).status, 403);
    assert.equal((await request({ Origin: 'https://foreign.example', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'foreign.example' })).status, 403);
    assert.equal((await request({ Origin: 'https://presenter.example.ts.net' })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('only loopback proxy peers can supply the original HTTPS protocol', () => {
  const app = express(); enforceSameOrigin(app);
  const trusted = app.get('trust proxy fn');
  assert.equal(trusted('127.0.0.1', 0), true);
  assert.equal(trusted('::1', 0), true);
  assert.equal(trusted('::ffff:127.0.0.1', 0), true);
  assert.equal(trusted('10.129.237.137', 0), false);
  assert.equal(trusted('100.116.56.116', 0), false);
  assert.equal(trusted('203.0.113.5', 0), false);
});
