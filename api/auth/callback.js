const { cookies, unseal, cookie, seal, json } = require('../_lib');
module.exports = async (req,res) => {
  const { code, state } = req.query;
  let expected=''; try { expected=unseal(cookies(req).oauth_state || ''); } catch {}
  if (!code || !state || state !== expected) return json(res,400,{error:'invalid_oauth_state'});
  const redirect = process.env.GITHUB_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`;
  const r = await fetch('https://github.com/login/oauth/access_token', {method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code,redirect_uri:redirect})});
  const data = await r.json();
  if (!r.ok || !data.access_token) return json(res,400,{error:'oauth_exchange_failed',details:data});
  res.setHeader('Set-Cookie', [cookie('gh_session', seal(data.access_token), {maxAge:60*60*24*30}), cookie('oauth_state','',{path:'/api/auth',maxAge:0})]);
  res.redirect(302,'/');
};
