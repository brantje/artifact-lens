const AdmZip = require('adm-zip');
const { gh, requireRepoAccess, json } = require('../_lib');
const { normalizeArtifactPathRequest } = require('../_artifact-path');

const mime = (name) => ({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
}[name.split('.').pop().toLowerCase()] || 'application/octet-stream');

const media = (name) => /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|wav|ogg|pdf)$/i.test(name);
const attachmentName = (name) => String(name).split('/').pop().replace(/[\r\n"]/g, '_') || 'download';

module.exports = async (req, res) => {
  const { repo, id, file, download } = req.query;
  if (!/^[^/]+\/[^/]+$/.test(repo || '') || !/^\d+$/.test(String(id || ''))) {
    return json(res, 400, { error: 'invalid_request' });
  }

  const access = await requireRepoAccess(normalizeArtifactPathRequest(req), res, { repo, artifactId: String(id) });
  if (!access) return;

  try {
    if (access.shared && ['run', 'branch'].includes(access.share.scope)) {
      const mr = await gh(`/repos/${repo}/actions/artifacts/${id}`, access.token);
      const metadata = await mr.json();
      const runId = metadata.workflow_run?.id ? String(metadata.workflow_run.id) : null;
      const branch = metadata.workflow_run?.head_branch || null;
      if (access.share.scope === 'run' && runId !== String(access.share.run_id)) {
        return json(res, 403, { error: 'outside_share_scope' });
      }
      if (access.share.scope === 'branch' && branch !== access.share.branch) {
        return json(res, 403, { error: 'outside_share_scope' });
      }
    }

    const r = await gh(`/repos/${repo}/actions/artifacts/${id}/zip`, access.token, { redirect: 'follow' });
    const buf = Buffer.from(await r.arrayBuffer());
    const zip = new AdmZip(buf);
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);

    if (file) {
      const entry = entries.find((x) => x.entryName === file);
      if (!entry) return json(res, 404, { error: 'file_not_found' });
      res.setHeader('Content-Type', mime(entry.entryName));
      res.setHeader('Cache-Control', 'private, max-age=300');
      if (String(download) === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${attachmentName(entry.entryName)}"`);
      }
      return res.status(200).send(entry.getData());
    }

    json(res, 200, entries.map((entry) => ({
      name: entry.entryName,
      size: entry.header.size,
      media: media(entry.entryName),
      mime: mime(entry.entryName),
    })));
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
