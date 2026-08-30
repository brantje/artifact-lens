const { gh, requireAuth, json } = require('../_lib');
const { getRepoSettings, setRepoPublicArtifacts } = require('../_settings');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

async function repoInfo(repo, token) {
  const r = await gh(`/repos/${repo}`, token);
  return r.json();
}

function canManageRepo(info) {
  return Boolean(info.permissions?.admin || info.role_name === 'admin');
}

function responseFor(repo, info, settings) {
  return {
    repo,
    public_artifacts: Boolean(settings.public_artifacts),
    store_configured: Boolean(settings.configured),
    can_manage: canManageRepo(info),
    private: Boolean(info.private),
  };
}

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'method_not_allowed' });

  let body = {};
  if (req.method === 'POST') {
    try {
      body = parseBody(req);
    } catch {
      return json(res, 400, { error: 'invalid_json' });
    }
  }

  const repo = String(req.method === 'GET' ? req.query.repo : (body.repo || '')).trim();
  if (!/^[^/]+\/[^/]+$/.test(repo)) return json(res, 400, { error: 'invalid_repo' });

  const token = await requireAuth(req, res);
  if (!token) return;

  try {
    const info = await repoInfo(repo, token);

    if (req.method === 'GET') {
      const settings = await getRepoSettings(repo);
      res.setHeader('Cache-Control', 'no-store');
      return json(res, 200, responseFor(repo, info, settings));
    }

    if (!canManageRepo(info)) return json(res, 403, { error: 'repository_admin_required' });
    if (typeof body.public_artifacts !== 'boolean') return json(res, 400, { error: 'public_artifacts_boolean_required' });

    let updatedBy = '';
    try {
      const userResponse = await gh('/user', token);
      const user = await userResponse.json();
      updatedBy = user.login || '';
    } catch {
      // The setting is still safe to update if the repository permission check already succeeded.
    }

    const settings = await setRepoPublicArtifacts(repo, body.public_artifacts, updatedBy);
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 200, responseFor(repo, info, settings));
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
