function normalizedArtifactReferer(referer) {
  const value = String(referer || '').trim();
  if (!value) return value;

  try {
    const url = new URL(value);
    const rawParts = url.pathname.split('/').filter(Boolean);
    if (rawParts.length < 11) return value;

    const parts = rawParts.map((part) => decodeURIComponent(part));
    const canonicalArtifact = parts[0] === 'repo'
      && parts[3] === 'branch'
      && parts[5] === 'run'
      && parts[7] === 'artifact'
      && /^\d+$/.test(parts[8] || '');

    if (!canonicalArtifact || parts[9] !== 'path' || !parts[10]) return value;
    url.pathname = '/' + rawParts.slice(0, 9).join('/');
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeArtifactPathRequest(req) {
  const referer = req?.headers?.referer;
  const normalized = normalizedArtifactReferer(referer);
  if (!referer || normalized === referer) return req;
  return {
    ...req,
    headers: {
      ...req.headers,
      referer: normalized,
    },
  };
}

module.exports = {
  normalizedArtifactReferer,
  normalizeArtifactPathRequest,
};
