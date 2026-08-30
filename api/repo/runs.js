const { gh, requireRepoAccess, json } = require('../_lib');
const { normalizeArtifactPathRequest } = require('../_artifact-path');

const PLANNED_STATUSES = new Set(['queued', 'requested', 'waiting', 'pending']);

module.exports = async (req, res) => {
  const { repo, branch } = req.query;
  if (!/^[^/]+\/[^/]+$/.test(repo || '')) return json(res, 400, { error: 'invalid_repo' });

  const access = await requireRepoAccess(normalizeArtifactPathRequest(req), res, { repo, branch: String(branch || '') });
  if (!access) return;

  try {
    const rr = await gh(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch || '')}&per_page=50`, access.token);
    const runData = await rr.json();
    let runs = runData.workflow_runs || [];

    if (access.shared && ['run', 'artifact'].includes(access.share.scope)) {
      runs = runs.filter((run) => String(run.id) === String(access.share.run_id));
    }

    if (!runs.length) return json(res, 200, []);

    const runIds = new Set(runs.map((run) => String(run.id)));
    const oldestRunAt = Math.min(...runs.map((run) => Date.parse(run.created_at) || Date.now()));
    const artifactsByRun = new Map();

    for (let page = 1; page <= 5; page++) {
      const ar = await gh(`/repos/${repo}/actions/artifacts?per_page=100&page=${page}`, access.token);
      const artifactData = await ar.json();
      const batch = artifactData.artifacts || [];

      for (const artifact of batch) {
        const runId = artifact.workflow_run?.id;
        if (!runId || !runIds.has(String(runId))) continue;
        if (access.shared && access.share.scope === 'artifact' && String(artifact.id) !== String(access.share.artifact_id)) continue;
        if (!artifactsByRun.has(String(runId))) artifactsByRun.set(String(runId), []);
        artifactsByRun.get(String(runId)).push({
          id: artifact.id,
          name: artifact.name,
          size_in_bytes: artifact.size_in_bytes,
          expired: artifact.expired,
          created_at: artifact.created_at,
          updated_at: artifact.updated_at,
        });
      }

      if (batch.length < 100) break;
      const oldestArtifactAt = Date.parse(batch[batch.length - 1]?.created_at || '') || 0;
      if (oldestArtifactAt && oldestArtifactAt < oldestRunAt) break;
    }

    const out = runs.flatMap((run) => {
      const artifacts = artifactsByRun.get(String(run.id)) || [];
      const active = run.status && run.status !== 'completed';
      if (!artifacts.length && !active) return [];
      const commitMessage = String(run.head_commit?.message || '').split('\n')[0].trim();
      return [{
        id: run.id,
        run_number: run.run_number,
        run_attempt: run.run_attempt,
        name: run.name,
        head_branch: run.head_branch,
        commit_message: commitMessage,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        planned: PLANNED_STATUSES.has(run.status),
        active,
        created_at: run.created_at,
        updated_at: run.updated_at,
        html_url: run.html_url,
        head_sha: run.head_sha,
        artifacts,
      }];
    });

    res.setHeader('Cache-Control', 'private, max-age=15');
    json(res, 200, out);
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
