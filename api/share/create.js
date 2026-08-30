const {
  gh,
  requireAuth,
  json,
  createShareToken,
} = require('../_lib');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function originFor(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const token = await requireAuth(req, res);
  if (!token) return;

  let body;
  try {
    body = parseBody(req);
  } catch {
    return json(res, 400, { error: 'invalid_json' });
  }

  const repo = String(body.repo || '').trim();
  const scope = String(body.scope || '').trim();
  const expires = String(body.expires || '7').trim();
  if (!/^[^/]+\/[^/]+$/.test(repo)) return json(res, 400, { error: 'invalid_repo' });
  if (!['artifact', 'run', 'branch', 'repository'].includes(scope)) return json(res, 400, { error: 'invalid_scope' });

  const expiryDays = { '1': 1, '7': 7, '30': 30 }[expires];
  if (expires !== 'never' && !expiryDays) return json(res, 400, { error: 'invalid_expiry' });

  try {
    let branch = body.branch ? String(body.branch) : null;
    let runId = body.run_id ? String(body.run_id) : null;
    let artifactId = body.artifact_id ? String(body.artifact_id) : null;

    if (scope === 'repository') {
      await gh(`/repos/${repo}`, token);
      branch = null;
      runId = null;
      artifactId = null;
    } else if (scope === 'branch') {
      if (!branch) return json(res, 400, { error: 'branch_required' });
      await gh(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`, token);
      runId = null;
      artifactId = null;
    } else if (scope === 'run') {
      if (!runId || !/^\d+$/.test(runId)) return json(res, 400, { error: 'run_required' });
      const rr = await gh(`/repos/${repo}/actions/runs/${runId}`, token);
      const run = await rr.json();
      branch = run.head_branch || branch;
      if (!branch) return json(res, 400, { error: 'run_has_no_branch' });
      artifactId = null;
    } else {
      if (!artifactId || !/^\d+$/.test(artifactId)) return json(res, 400, { error: 'artifact_required' });
      const ar = await gh(`/repos/${repo}/actions/artifacts/${artifactId}`, token);
      const artifact = await ar.json();
      runId = artifact.workflow_run?.id ? String(artifact.workflow_run.id) : runId;
      branch = artifact.workflow_run?.head_branch || branch;
      if (!runId || !branch) return json(res, 400, { error: 'artifact_context_unavailable' });
    }

    const expiresAt = expires === 'never' ? null : Date.now() + expiryDays * 24 * 60 * 60 * 1000;
    const sharePayload = {
      repo,
      scope,
      branch,
      run_id: runId,
      artifact_id: artifactId,
      expires_at: expiresAt,
    };
    const shareToken = createShareToken(sharePayload);
    const shareUrl = `${originFor(req)}/s/${shareToken}`;

    json(res, 200, {
      url: shareUrl,
      scope,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
