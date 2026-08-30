const { gh, requireRepoAccess, json } = require('../_lib');
const { normalizeArtifactPathRequest } = require('../_artifact-path');

const ACTIVE_STATUSES = new Set(['queued', 'requested', 'waiting', 'pending', 'in_progress']);

module.exports = async (req, res) => {
  const repo = req.query.repo;
  if (!/^[^/]+\/[^/]+$/.test(repo || '')) return json(res, 400, { error: 'invalid_repo' });

  const access = await requireRepoAccess(normalizeArtifactPathRequest(req), res, { repo });
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
      if (!cur) map.set(branch, { branch, updated_at: when, count: 1, active_run: null });
      else {
        cur.count++;
        if (new Date(when) > new Date(cur.updated_at)) cur.updated_at = when;
      }
    }

    if (map.size) {
      const rr = await gh(`/repos/${repo}/actions/runs?per_page=100`, access.token);
      const runData = await rr.json();
      let runs = runData.workflow_runs || [];

      if (share?.scope === 'artifact' || share?.scope === 'run') {
        runs = runs.filter((run) => String(run.id) === String(share.run_id));
      }

      for (const run of runs) {
        if (!ACTIVE_STATUSES.has(run.status)) continue;
        const branch = run.head_branch || '(unknown)';
        if (shareBranch && branch !== shareBranch) continue;
        const cur = map.get(branch);
        if (!cur) continue;

        const when = run.updated_at || run.created_at;
        if (!cur.active_run || new Date(when) > new Date(cur.active_run.updated_at)) {
          cur.active_run = {
            id: run.id,
            name: run.name,
            status: run.status,
            updated_at: when,
          };
        }
      }
    }

    const rows = [...map.values()].map((row) => ({
      ...row,
      activity_at: row.active_run?.updated_at || row.updated_at,
    }));

    json(res, 200, rows.sort((a, b) => new Date(b.activity_at) - new Date(a.activity_at)));
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
