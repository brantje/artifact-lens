const crypto = require('crypto');

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
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function token(req) {
  const c = cookies(req).gh_session;
  if (!c) return null;
  try { return unseal(c); } catch { return null; }
}
function cookie(name, value, opts={}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join('; ');
}
async function gh(path, accessToken, init={}) {
  const headers = { Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', ...(init.headers||{}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const r = await fetch(`https://api.github.com${path}`, { ...init, headers });
  if (!r.ok) {
    const text = await r.text();
    const e = new Error(`GitHub ${r.status}: ${text.slice(0,500)}`); e.status = r.status; throw e;
  }
  return r;
}
function json(res, status, body) { res.status(status).setHeader('Content-Type','application/json; charset=utf-8').send(JSON.stringify(body)); }
function requireAuth(req,res) { const t=token(req); if(!t){json(res,401,{error:'authentication_required'}); return null;} return t; }
module.exports = { seal, unseal, cookies, token, cookie, gh, json, requireAuth };
