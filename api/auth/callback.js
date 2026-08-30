const {
  cookies,
  unseal,
  cookie,
  json,
  exchangeGitHubToken,
  githubAppSession,
  sessionCookie,
} = require('../_lib');

module.exports = async (req, res) => {
  const { code, state } = req.query;
  let flow = null;
  try {
    flow = JSON.parse(unseal(cookies(req).oauth_flow || ''));
  } catch {}

  if (!code || !state || !flow || state !== flow.state || !flow.verifier) {
    return json(res, 400, { error: 'invalid_oauth_state' });
  }

  const redirect = (process.env.GITHUB_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`).trim();

  try {
    const data = await exchangeGitHubToken({
      code,
      redirect_uri: redirect,
      code_verifier: flow.verifier,
    });

    // GitHub App user access tokens are ghu_* tokens and carry no classic OAuth
    // scopes. Reject an OAuth App token so a broad `repo` credential cannot be
    // accidentally configured here again.
    if (!String(data.access_token).startsWith('ghu_')) {
      console.error('Expected GitHub App user token but received another token type', {
        tokenPrefix: String(data.access_token).slice(0, 4),
        scope: data.scope || '',
      });
      return json(res, 500, {
        error: 'github_app_required',
        details: 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must belong to a GitHub App, not an OAuth App.',
      });
    }

    const session = githubAppSession(data);
    res.setHeader('Set-Cookie', [
      sessionCookie(session),
      cookie('oauth_flow', '', { path: '/api/auth', maxAge: 0 }),
    ]);
    res.redirect(302, '/');
  } catch (e) {
    console.error('GitHub App authorization exchange failed', {
      error: e.details?.error || e.message,
      redirect,
    });
    return json(res, e.status || 400, {
      error: 'github_app_exchange_failed',
      details: e.details || { message: e.message },
    });
  }
};
