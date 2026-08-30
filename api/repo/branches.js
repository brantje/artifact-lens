const { gh, requireAuth, json } = require('../_lib');
module.exports = async (req,res) => { const t=requireAuth(req,res); if(!t)return; const repo=req.query.repo; if(!/^[^/]+\/[^/]+$/.test(repo||'')) return json(res,400,{error:'invalid_repo'}); try {
  const r=await gh(`/repos/${repo}/actions/artifacts?per_page=100`,t); const data=await r.json();
  const map=new Map();
  for(const a of data.artifacts||[]) { const b=a.workflow_run?.head_branch || '(unknown)'; const cur=map.get(b); const when=a.updated_at||a.created_at; if(!cur) map.set(b,{branch:b,updated_at:when,count:1}); else { cur.count++; if(new Date(when)>new Date(cur.updated_at)) cur.updated_at=when; } }
  json(res,200,[...map.values()].sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)));
 } catch(e){ json(res,e.status||500,{error:e.message}); } };
