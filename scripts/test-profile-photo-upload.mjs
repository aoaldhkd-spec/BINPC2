#!/usr/bin/env node
/**
 * Profile photo upload E2E — sessionToken auth (Netlify/iPhone Safari path).
 * Usage: node scripts/test-profile-photo-upload.mjs
 */
const API = (process.env.API_BASE || 'https://binpc2.onrender.com/api/db').replace(/\/$/, '');
const SITE = (process.env.NETLIFY_URL || 'https://binpc2.netlify.app').replace(/\/$/, '');

const JPEG_DATA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

async function op(body, jar) {
  const res = await fetch(`${API}/op`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jar?.cookie ? { Cookie: jar.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID();
  const nick = `ph${Date.now() % 100000}`;
  const fails = [];

  console.log('API:', API);
  console.log('Netlify:', SITE);

  let r = await op({
    op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
    payload: { id, nickname: nick, bio: 'photo-test', photo_url: null, personality_score: 50, _device_secret: secret },
  });
  if (r.status !== 200) fails.push(`register ${r.status}`);

  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: id, deviceSecret: secret }),
  });
  const login = await loginRes.json().catch(() => ({}));
  const sessionToken = login.sessionToken;
  if (!sessionToken) fails.push('no sessionToken');

  if (fails.length) {
    console.error('SETUP FAIL', fails);
    process.exit(1);
  }

  const path = `profile-photos/${id}`;

  // 1) sessionToken only — no cookies (iPhone Safari / Netlify proxy path)
  const upload = await fetch(`${SITE}/api/db/storage-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, dataUrl: JPEG_DATA, requesterId: id, sessionToken }),
  });
  console.log('upload (sessionToken, via Netlify):', upload.status);
  if (!upload.ok) {
    const err = await upload.json().catch(() => ({}));
    fails.push(`upload ${upload.status} ${JSON.stringify(err)}`);
  }

  // 2) profile update via /op + sessionToken
  r = await op({
    op: 'update', table: 'profiles', requesterId: id, sessionToken,
    filters: [{ type: 'eq', col: 'id', val: id }],
    payload: { photo_url: `/api/db/storage-image?p=${encodeURIComponent(path)}&t=${Date.now()}` },
    selectAfterWrite: true,
  });
  console.log('profile update:', r.status, r.json.data?.photo_url ? 'ok' : r.json.error);
  if (r.status !== 200) fails.push(`profile update ${r.status}`);

  // 3) public image read — no auth (img tag on iPhone)
  const img = await fetch(`${SITE}/api/db/storage-image?p=${encodeURIComponent(path)}`);
  console.log('image read (no auth, via Netlify):', img.status, img.headers.get('content-type'));
  if (!img.ok) fails.push(`image read ${img.status}`);

  // 4) HEIC rejection message exists client-side
  const { validateProfilePhotoFile } = await import('../artifacts/boltnew-app/src/lib/profile-photo.ts').catch(() => ({}));
  if (validateProfilePhotoFile) {
    const heic = validateProfilePhotoFile({ name: 'IMG_1234.HEIC', type: 'image/heic', size: 1024 });
    console.log('HEIC client block:', heic.ok === false ? 'OK (blocked with message)' : 'UNEXPECTED PASS');
    if (heic.ok !== false) fails.push('HEIC should be blocked');
  }

  if (fails.length) {
    console.error('\nFAIL', fails);
    process.exit(1);
  }
  console.log('\nPASS — iPhone/Netlify photo path (sessionToken upload + public img read)');
}

main().catch((e) => { console.error(e); process.exit(1); });
