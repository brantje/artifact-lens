const crypto = require('crypto');
const { seal, cookie, json, githubClient } = require('../_lib');

module.exports = async (req, res) => {
  let id;
  try {
    ({ id } = githubClient());
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const flow = seal(JSON.stringify({ state, verifier }));

  res.setHeader('Set-Cookie', cookie('oauth_flow', flow, { path: '/api/auth', maxAge: 600 }));

  const redirect = (process.env.GITHUB_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`).trim();
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', id);
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  // GitHub App user access tokens do not use OAuth scopes. Their access is
  // limited to the intersection of the app permissions, installation, and user.
  res.redirect(302, u.toString());
};
