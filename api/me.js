const { gh, requireAuth, json } = require('./_lib');
module.exports = async (req,res) => { const t=requireAuth(req,res); if(!t)return; try { const r=await gh('/user',t); const u=await r.json(); json(res,200,{login:u.login,name:u.name,avatar_url:u.avatar_url}); } catch(e){ json(res,e.status||500,{error:e.message}); } };
