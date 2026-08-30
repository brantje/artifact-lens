const crypto = require('crypto');
const { seal, cookie, json } = require('../_lib');
module.exports = async (req,res) => {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) return json(res,500,{error:'GITHUB_CLIENT_ID is not configured'});
  const state = crypto.randomBytes(24).toString('hex');
  res.setHeader('Set-Cookie', cookie('oauth_state', seal(state), {path:'/api/auth', maxAge:600}));
  const redirect = process.env.GITHUB_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`;
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', id); u.searchParams.set('redirect_uri', redirect); u.searchParams.set('state', state); u.searchParams.set('scope','repo');
  res.redirect(302, u.toString());
};
