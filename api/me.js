const { gh, requireAuth, readSession, readShareSession, json } = require('./_lib');

module.exports = async (req, res) => {
  if (readSession(req)) {
    const token = await requireAuth(req, res);
    if (!token) return;
    try {
      const r = await gh('/user', token);
      const u = await r.json();
      return json(res, 200, { login: u.login, name: u.name, avatar_url: u.avatar_url, shared: false });
    } catch (e) {
      return json(res, e.status || 500, { error: e.message });
    }
  }

  const share = readShareSession(req);
  if (share) {
    return json(res, 200, {
      shared: true,
      repo: share.repo,
      scope: share.scope,
      expires_at: share.expires_at ? new Date(Number(share.expires_at)).toISOString() : null,
    });
  }

  json(res, 401, { error: 'authentication_required' });
};
