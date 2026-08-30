const { gh, requireRepoAccess, json } = require('../_lib');
const { normalizeArtifactPathRequest } = require('../_artifact-path');

const PLANNED_STATUSES = new Set(['queued', 'requested', 'waiting', 'pending']);

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
      if (!cur) {
        map.set(branch, { branch, updated_at: when, count: 1, active_runs: 0, planned_runs: 0, running_runs: 0 });
      } else {
        cur.count++;
        if (new Date(when) > new Date(cur.updated_at)) cur.updated_at = when;
      }
    }

    // Repository and branch viewers may also see currently active runs. Artifact/run
    // scoped viewers stay limited to the already-authorized context above.
    if (!share || ['repository', 'branch'].includes(share.scope)) {
      const rr = await gh(`/repos/${repo}/actions/runs?per_page=50`, access.token);
      const runData = await rr.json();
      for (const run of runData.workflow_runs || []) {
        if (!run.status || run.status === 'completed') continue;
        const branch = run.head_branch || '(unknown)';
        if (shareBranch && branch !== shareBranch) continue;
        const when = run.updated_at || run.created_at;
        let cur = map.get(branch);
        if (!cur) {
          cur = { branch, updated_at: when, count: 0, active_runs: 0, planned_runs: 0, running_runs: 0 };
          map.set(branch, cur);
        }
        cur.active_runs++;
        if (run.status === 'in_progress') cur.running_runs++;
        else if (PLANNED_STATUSES.has(run.status)) cur.planned_runs++;
        else cur.planned_runs++;
        if (new Date(when) > new Date(cur.updated_at)) cur.updated_at = when;
      }
    }

    json(res, 200, [...map.values()].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
