const { json } = require('../_lib');

module.exports = (req, res) => {
  const slug = (process.env.GITHUB_APP_SLUG || '').trim();
  if (!slug) return json(res, 500, { error: 'GITHUB_APP_SLUG is not configured' });
  res.redirect(302, `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
};
