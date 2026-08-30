const { gh, requireAuth, json } = require('./_lib');

module.exports = async (req, res) => {
  const t = await requireAuth(req, res);
  if (!t) return;

  try {
    const ir = await gh('/user/installations?per_page=100', t);
    const installationData = await ir.json();
    const installations = installationData.installations || [];
    const byId = new Map();

    await Promise.all(installations.map(async (installation) => {
      for (let page = 1; page <= 10; page++) {
        const rr = await gh(`/user/installations/${installation.id}/repositories?per_page=100&page=${page}`, t);
        const data = await rr.json();
        const batch = data.repositories || [];
        for (const repo of batch) byId.set(repo.id, repo);
        if (batch.length < 100) break;
      }
    }));

    const repositories = [...byId.values()]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .map((x) => ({
        full_name: x.full_name,
        private: x.private,
        updated_at: x.updated_at,
        default_branch: x.default_branch,
        description: x.description,
      }));

    json(res, 200, {
      repositories,
      installation_count: installations.length,
      install_available: Boolean((process.env.GITHUB_APP_SLUG || '').trim()),
    });
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
};
