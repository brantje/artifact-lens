const { gh, requireAuth, json } = require('../_lib');
module.exports = async (req,res) => { const t=requireAuth(req,res); if(!t)return; const {repo,branch}=req.query; if(!/^[^/]+\/[^/]+$/.test(repo||'')) return json(res,400,{error:'invalid_repo'}); try {
  const r=await gh(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch||'')}&per_page=50`,t); const data=await r.json(); const out=[];
  for(const run of data.workflow_runs||[]) { const ar=await gh(`/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,t); const ad=await ar.json(); if((ad.total_count||0)>0) out.push({id:run.id,name:run.name,event:run.event,status:run.status,conclusion:run.conclusion,created_at:run.created_at,updated_at:run.updated_at,html_url:run.html_url,head_sha:run.head_sha,artifacts:(ad.artifacts||[]).map(a=>({id:a.id,name:a.name,size_in_bytes:a.size_in_bytes,expired:a.expired,created_at:a.created_at,updated_at:a.updated_at}))}); }
  json(res,200,out);
 } catch(e){ json(res,e.status||500,{error:e.message}); } };
