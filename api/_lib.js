const crypto = require('crypto');

const SESSION_COOKIE = 'gh_session';
const SHARE_COOKIE = 'share_session';
const installationTokenCache = new Map();

function secretKey(value, label) {
  if (!value) throw new Error(`${label} is not configured`);
  return crypto.createHash('sha256').update(value).digest();
}

function sessionKey() {
  return secretKey((process.env.SESSION_SECRET || '').trim(), 'SESSION_SECRET');
}

function shareKey() {
  const secret = (process.env.SHARE_SECRET || process.env.SESSION_SECRET || '').trim();
  return secretKey(secret, 'SHARE_SECRET or SESSION_SECRET');
}

function sealWithKey(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

function unsealWithKey(value, key) {
  const buf = Buffer.from(value, 'base64url');
  if (buf.length < 29) throw new Error('invalid sealed value');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function seal(value) {
  return sealWithKey(value, sessionKey());
}

function unseal(value) {
  return unsealWithKey(value, sessionKey());
}

function sealShare(value) {
  return sealWithKey(value, shareKey());
}

function unsealShare(value) {
  return unsealWithKey(value, shareKey());
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

function githubAppConfig() {
  const appId = (process.env.GITHUB_APP_ID || '').trim();
  let privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || '').trim();
  if (!appId) {
    const e = new Error('GITHUB_APP_ID is not configured');
    e.status = 500;
    throw e;
  }
  if (!privateKey) {
    const e = new Error('GITHUB_APP_PRIVATE_KEY is not configured');
    e.status = 500;
    throw e;
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
  return { appId, privateKey };
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

function b64json(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function githubAppJwt() {
  const { appId, privateKey } = githubAppConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = b64json({ alg: 'RS256', typ: 'JWT' });
  const payload = b64json({ iat: now - 60, exp: now + 9 * 60, iss: appId });
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function installationToken(repo) {
  const cached = installationTokenCache.get(repo);
  if (cached && cached.expiresAt > Date.now() + 60 * 1000) return cached.token;

  const jwt = githubAppJwt();
  const ir = await gh(`/repos/${repo}/installation`, jwt);
  const installation = await ir.json();
  if (!installation.id) throw new Error(`GitHub App installation not found for ${repo}`);

  const tr = await gh(`/app/installations/${installation.id}/access_tokens`, jwt, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { actions: 'read' } }),
  });
  const data = await tr.json();
  const expiresAt = Date.parse(data.expires_at || '') || Date.now() + 50 * 60 * 1000;
  installationTokenCache.set(repo, { token: data.token, expiresAt });
  return data.token;
}

function createShareToken(payload) {
  const share = {
    v: 1,
    repo: payload.repo,
    scope: payload.scope,
    branch: payload.branch || null,
    run_id: payload.run_id ? String(payload.run_id) : null,
    artifact_id: payload.artifact_id ? String(payload.artifact_id) : null,
    created_at: Date.now(),
    expires_at: payload.expires_at || null,
    nonce: crypto.randomBytes(12).toString('base64url'),
  };
  return sealShare(JSON.stringify(share));
}

function readShareToken(token) {
  if (!token) return null;
  try {
    const share = JSON.parse(unsealShare(token));
    if (!share || share.v !== 1 || !/^[^/]+\/[^/]+$/.test(share.repo || '')) return null;
    if (!['artifact', 'run', 'branch', 'repository'].includes(share.scope)) return null;
    if (share.expires_at && Date.now() >= Number(share.expires_at)) return null;
    if (share.scope !== 'repository' && !share.branch) return null;
    if (['artifact', 'run'].includes(share.scope) && !share.run_id) return null;
    if (share.scope === 'artifact' && !share.artifact_id) return null;
    return share;
  } catch {
    return null;
  }
}

function readShareSession(req) {
  return readShareToken(cookies(req)[SHARE_COOKIE]);
}

function shareSessionCookie(token, share) {
  let maxAge = 60 * 60 * 24 * 30;
  if (share.expires_at) {
    maxAge = Math.max(0, Math.floor((Number(share.expires_at) - Date.now()) / 1000));
  }
  return cookie(SHARE_COOKIE, token, { maxAge });
}

function clearShareSessionCookie() {
  return cookie(SHARE_COOKIE, '', { maxAge: 0 });
}

function shareCanonicalPath(share) {
  const [owner, repo] = share.repo.split('/');
  let path = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  if (share.branch) path += `/branch/${encodeURIComponent(share.branch)}`;
  if (share.run_id) path += `/run/${encodeURIComponent(share.run_id)}`;
  if (share.artifact_id) path += `/artifact/${encodeURIComponent(share.artifact_id)}`;
  return path;
}

async function requireRepoAccess(req, res, context = {}) {
  if (readSession(req)) {
    const token = await requireAuth(req, res);
    return token ? { token, shared: false, share: null } : null;
  }

  const share = readShareSession(req);
  if (!share) {
    json(res, 401, { error: 'authentication_required' });
    return null;
  }

  const repo = context.repo;
  if (!repo || repo !== share.repo) {
    json(res, 403, { error: 'outside_share_scope' });
    return null;
  }
  if (share.scope !== 'repository' && context.branch && context.branch !== share.branch) {
    json(res, 403, { error: 'outside_share_scope' });
    return null;
  }
  if (['artifact', 'run'].includes(share.scope) && context.runId && String(context.runId) !== String(share.run_id)) {
    json(res, 403, { error: 'outside_share_scope' });
    return null;
  }
  if (share.scope === 'artifact' && context.artifactId && String(context.artifactId) !== String(share.artifact_id)) {
    json(res, 403, { error: 'outside_share_scope' });
    return null;
  }

  try {
    const token = await installationToken(repo);
    return { token, shared: true, share };
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
    return null;
  }
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
  readSession,
  gh,
  json,
  requireAuth,
  githubAppJwt,
  installationToken,
  createShareToken,
  readShareToken,
  readShareSession,
  shareSessionCookie,
  clearShareSessionCookie,
  shareCanonicalPath,
  requireRepoAccess,
};
