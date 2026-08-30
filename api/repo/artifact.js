const AdmZip = require('adm-zip');
const { gh, requireAuth, json } = require('../_lib');
const mime = (n)=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',pdf:'application/pdf'}[n.split('.').pop().toLowerCase()]||'application/octet-stream');
const media=(n)=>/\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|wav|ogg|pdf)$/i.test(n);
const attachmentName=(name)=>String(name).split('/').pop().replace(/[\r\n"]/g,'_') || 'download';
module.exports = async (req,res) => { const t=await requireAuth(req,res); if(!t)return; const {repo,id,file,download}=req.query; if(!/^[^/]+\/[^/]+$/.test(repo||'') || !/^\d+$/.test(String(id||''))) return json(res,400,{error:'invalid_request'}); try {
  const r=await gh(`/repos/${repo}/actions/artifacts/${id}/zip`,t,{redirect:'follow'}); const buf=Buffer.from(await r.arrayBuffer()); const zip=new AdmZip(buf); const entries=zip.getEntries().filter(e=>!e.isDirectory);
  if(file){ const e=entries.find(x=>x.entryName===file); if(!e)return json(res,404,{error:'file_not_found'}); res.setHeader('Content-Type',mime(e.entryName)); res.setHeader('Cache-Control','private, max-age=300'); if(String(download)==='1') res.setHeader('Content-Disposition',`attachment; filename="${attachmentName(e.entryName)}"`); return res.status(200).send(e.getData()); }
  json(res,200,entries.map(e=>({name:e.entryName,size:e.header.size,media:media(e.entryName),mime:mime(e.entryName)})));
 } catch(e){ json(res,e.status||500,{error:e.message}); } };
