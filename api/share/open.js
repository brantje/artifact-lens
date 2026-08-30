const {
  json,
  readShareToken,
  shareSessionCookie,
  shareCanonicalPath,
  installationToken,
} = require('../_lib');

module.exports = async (req, res) => {
  const token = String(req.query.token || '');
  const share = readShareToken(token);
  if (!share) return json(res, 410, { error: 'invalid_or_expired_share' });

  try {
    await installationToken(share.repo);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', shareSessionCookie(token, share));
    res.redirect(302, shareCanonicalPath(share));
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
