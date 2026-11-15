const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

const pageCrewSecret = 'test-pagecrew-sso-secret-with-at-least-32-chars';
process.env.TURSO_DATABASE_URL = 'file::memory:';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.PAGECREW_SSO_SECRET = pageCrewSecret;
process.env.VAPID_SUBJECT = 'mailto:test@example.test';
process.env.PUSHPILOT_PUBLIC_URL = 'https://pagecrew.example.test/pushpilot';

const jwt = require('jsonwebtoken');
const { app: pushPilotApp } = require('../pushpilot/server/index.js');
const app = express();
app.get('/api/health', (_req, res) => res.json({ service: 'pagecrew' }));
app.use('/pushpilot', pushPilotApp);
const server = app.listen(0, '127.0.0.1');

test('exchanges one-time PageCrew handoffs for the same isolated Push Pilot identity', async (t) => {
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const pageCrewHealth = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await pageCrewHealth.json(), { service: 'pagecrew' });
  const pushPilotHealth = await fetch(`${baseUrl}/pushpilot/api/health`);
  assert.equal(pushPilotHealth.status, 200);

  const pageCrewUserId = crypto.randomUUID();
  const email = 'sso-user@example.test';
  const handoff = (jti, secret = pageCrewSecret) => jwt.sign(
    { typ: 'pagecrew-sso', email, name: 'SSO User' },
    secret,
    { subject: pageCrewUserId, jwtid: jti, issuer: 'pagecrew', audience: 'pushpilot', expiresIn: '60s' }
  );
  const exchange = (token) => fetch(`${baseUrl}/pushpilot/api/auth/sso`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  });

  const firstHandoff = handoff(crypto.randomUUID());
  const firstResponse = await exchange(firstHandoff);
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.email, email);

  const pushPilotClaims = jwt.verify(first.token, process.env.JWT_SECRET);
  const profileResponse = await fetch(`${baseUrl}/pushpilot/api/me`, {
    headers: { authorization: `Bearer ${first.token}` }
  });
  assert.equal(profileResponse.status, 200);
  const profile = await profileResponse.json();
  assert.equal(profile.email, email);
  assert.equal(profile.base_url, process.env.PUSHPILOT_PUBLIC_URL);

  const replay = await exchange(firstHandoff);
  assert.equal(replay.status, 401);

  const secondResponse = await exchange(handoff(crypto.randomUUID()));
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  assert.equal(jwt.verify(second.token, process.env.JWT_SECRET).id, pushPilotClaims.id);

  const invalid = await exchange(handoff(crypto.randomUUID(), 'wrong-secret-with-at-least-32-chars'));
  assert.equal(invalid.status, 401);
});
