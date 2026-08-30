const { gh, requireRepoAccess, json } = require('../_lib');

module.exports = async (req, res) => {
  const repo = req.query.repo;
  if (!/^[^/]+\/[^/]+$/.test(repo || '')) return json(res, 400, { error: 'invalid_repo' });

  const access = await requireRepoAccess(req, res, { repo });
  if (!access) return;

  try {
    const r = await gh(`/repos/${repo}/actions/artifacts?per_page=100`, access.token);
    const data = await r.json();
    const map = new Map();
    const share = access.shared ? access.share : null;
    const shareBranch = share && share.scope !== 'repository' ? share.branch : null;

    for (const a of data.artifacts || []) {
      if (share?.scope === 'artifact' && String(a.id) !== String(share.artifact_id)) continue;
      if (share?.scope === 'run' && String(a.workflow_run?.id || '') !== String(share.run_id)) continue;

      const branch = a.workflow_run?.head_branch || '(unknown)';
      if (shareBranch && branch !== shareBranch) continue;
      const when = a.updated_at || a.created_at;
      const cur = map.get(branch);
      if (!cur) map.set(branch, { branch, updated_at: when, count: 1 });
      else {
        cur.count++;
        if (new Date(when) > new Date(cur.updated_at)) cur.updated_at = when;
      }
    }

    json(res, 200, [...map.values()].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
