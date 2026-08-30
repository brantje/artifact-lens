const {
  gh,
  requireAuth,
  readSession,
  readShareSession,
  installationToken,
  json,
} = require('./_lib');

function repoView(x) {
  return {
    full_name: x.full_name,
    private: x.private,
    updated_at: x.updated_at,
    default_branch: x.default_branch,
    description: x.description,
  };
}

module.exports = async (req, res) => {
  if (readSession(req)) {
    const token = await requireAuth(req, res);
    if (!token) return;
    try {
      const ir = await gh('/user/installations?per_page=100', token);
      const installationData = await ir.json();
      const installations = installationData.installations || [];
      const byId = new Map();

      await Promise.all(installations.map(async (installation) => {
        for (let page = 1; page <= 10; page++) {
          const rr = await gh(`/user/installations/${installation.id}/repositories?per_page=100&page=${page}`, token);
          const data = await rr.json();
          const batch = data.repositories || [];
          for (const repo of batch) byId.set(repo.id, repo);
          if (batch.length < 100) break;
        }
      }));

      const repositories = [...byId.values()]
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .map(repoView);

      return json(res, 200, {
        repositories,
        installation_count: installations.length,
        install_available: Boolean((process.env.GITHUB_APP_SLUG || '').trim()),
        shared: false,
      });
    } catch (e) {
      return json(res, e.status || 500, { error: e.message });
    }
  }

  const share = readShareSession(req);
  if (!share) return json(res, 401, { error: 'authentication_required' });

  try {
    const token = await installationToken(share.repo);
    const rr = await gh(`/repos/${share.repo}`, token);
    const repo = await rr.json();
    return json(res, 200, {
      repositories: [repoView(repo)],
      installation_count: 1,
      install_available: false,
      shared: true,
      share_scope: share.scope,
    });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
};
