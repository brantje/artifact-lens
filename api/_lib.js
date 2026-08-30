const crypto = require('crypto');

const SESSION_COOKIE = 'gh_session';

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  return crypto.createHash('sha256').update(secret).digest();
}

function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

function unseal(value) {
  const buf = Buffer.from(value, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, opts = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path || '/'}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join('; ');
}

function githubClient() {
  const id = (process.env.GITHUB_CLIENT_ID || '').trim();
  const secret = (process.env.GITHUB_CLIENT_SECRET || '').trim();
  if (!id) {
    const e = new Error('GITHUB_CLIENT_ID is not configured');
    e.status = 500;
    throw e;
  }
  if (!secret) {
    const e = new Error('GITHUB_CLIENT_SECRET is not configured');
    e.status = 500;
    throw e;
  }
  return { id, secret };
}

async function exchangeGitHubToken(params) {
  const { id, secret } = githubClient();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    ...params,
  });
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    const e = new Error(data.error_description || data.error || `GitHub token exchange failed (${r.status})`);
    e.status = 400;
    e.details = data;
    throw e;
  }
  return data;
}

function githubAppSession(data, previous = {}) {
  const now = Date.now();
  return {
    kind: 'github_app',
    access_token: data.access_token,
    refresh_token: data.refresh_token || previous.refresh_token || null,
    expires_at: data.expires_in ? now + Number(data.expires_in) * 1000 : null,
    refresh_expires_at: data.refresh_token_expires_in
      ? now + Number(data.refresh_token_expires_in) * 1000
      : previous.refresh_expires_at || null,
  };
}

function readSession(req) {
  const raw = cookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(unseal(raw));
    if (!parsed || parsed.kind !== 'github_app' || !parsed.access_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sessionCookie(session) {
  let maxAge = 60 * 60 * 24 * 30;
  if (session.refresh_expires_at) {
    maxAge = Math.max(0, Math.floor((session.refresh_expires_at - Date.now()) / 1000));
  }
  return cookie(SESSION_COOKIE, seal(JSON.stringify(session)), { maxAge });
}

function clearSessionCookie() {
  return cookie(SESSION_COOKIE, '', { maxAge: 0 });
}

async function requireAuth(req, res) {
  let session = readSession(req);
  if (!session) {
    json(res, 401, { error: 'authentication_required' });
    return null;
  }

  const refreshSoon = session.expires_at && Date.now() >= session.expires_at - 5 * 60 * 1000;
  if (refreshSoon) {
    if (!session.refresh_token || (session.refresh_expires_at && Date.now() >= session.refresh_expires_at)) {
      res.setHeader('Set-Cookie', clearSessionCookie());
      json(res, 401, { error: 'authentication_expired' });
      return null;
    }
    try {
      const data = await exchangeGitHubToken({
        grant_type: 'refresh_token',
        refresh_token: session.refresh_token,
      });
      session = githubAppSession(data, session);
      res.setHeader('Set-Cookie', sessionCookie(session));
    } catch (e) {
      console.error('GitHub App token refresh failed', { error: e.details?.error || e.message });
      res.setHeader('Set-Cookie', clearSessionCookie());
      json(res, 401, { error: 'authentication_expired' });
      return null;
    }
  }

  return session.access_token;
}

async function gh(path, accessToken, init = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    ...(init.headers || {}),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const r = await fetch(`https://api.github.com${path}`, { ...init, headers });
  if (!r.ok) {
    const text = await r.text();
    const e = new Error(`GitHub ${r.status}: ${text.slice(0, 500)}`);
    e.status = r.status;
    throw e;
  }
  return r;
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

module.exports = {
  seal,
  unseal,
  cookies,
  cookie,
  githubClient,
  exchangeGitHubToken,
  githubAppSession,
  sessionCookie,
  clearSessionCookie,
  gh,
  json,
  requireAuth,
};
