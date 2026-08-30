const { cookies, unseal, cookie, seal, json } = require('../_lib');

module.exports = async (req,res) => {
  const { code, state } = req.query;
  let expected='';
  try { expected=unseal(cookies(req).oauth_state || ''); } catch {}
  if (!code || !state || state !== expected) return json(res,400,{error:'invalid_oauth_state'});

  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GITHUB_CLIENT_SECRET || '').trim();
  if (!clientId) return json(res,500,{error:'GITHUB_CLIENT_ID is not configured'});
  if (!clientSecret) return json(res,500,{error:'GITHUB_CLIENT_SECRET is not configured'});

  const redirect = (process.env.GITHUB_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`).trim();
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method:'POST',
    headers:{Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code,redirect_uri:redirect})
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    console.error('GitHub OAuth exchange failed', {
      error: data.error,
      clientId,
      clientSecretLength: clientSecret.length,
      redirect
    });
    return json(res,400,{error:'oauth_exchange_failed',details:data});
  }

  res.setHeader('Set-Cookie', [
    cookie('gh_session', seal(data.access_token), {maxAge:60*60*24*30}),
    cookie('oauth_state','',{path:'/api/auth',maxAge:0})
  ]);
  res.redirect(302,'/');
};
