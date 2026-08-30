const AdmZip = require('adm-zip');
const { gh, requireRepoAccess, json } = require('../_lib');
const { normalizeArtifactPathRequest } = require('../_artifact-path');

const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

const extension = (name) => String(name).split('.').pop().toLowerCase();

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
}[extension(name)] || 'application/octet-stream');

const media = (name) => /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|wav|ogg|pdf)$/i.test(name);

const preview = (name) => {
  const lower = String(name || '').toLowerCase();
  if (/\.(md|markdown|mdown|mkd)$/.test(lower)) return 'markdown';
  if (/\.(html?|xhtml)$/.test(lower)) return 'html';
  if (/\.(txt|log|json|jsonl|xml|trx|nunit|tap|t|ya?ml|toml|ini|cfg|conf|csv|tsv|css|js|mjs|cjs|ts|tsx|jsx|py|rb|php|java|kt|kts|go|rs|c|cc|cpp|cxx|h|hh|hpp|hxx|sh|bash|zsh|fish|ps1|sql|graphql|gql|diff|patch|env|properties)$/.test(lower)) return 'text';
  return null;
};

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
      const previewType = preview(entry.entryName);
      const isDownload = String(download) === '1';

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Type', previewType && !isDownload ? 'text/plain; charset=utf-8' : mime(entry.entryName));

      if (extension(entry.entryName) === 'svg') {
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      }
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${attachmentName(entry.entryName)}"`);
      }
      return res.status(200).send(entry.getData());
    }

    json(res, 200, entries.map((entry) => {
      const previewType = preview(entry.entryName);
      return {
        name: entry.entryName,
        size: entry.header.size,
        media: media(entry.entryName),
        mime: mime(entry.entryName),
        preview: previewType,
        previewable: Boolean(previewType && entry.header.size <= PREVIEW_MAX_BYTES),
      };
    }));
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
