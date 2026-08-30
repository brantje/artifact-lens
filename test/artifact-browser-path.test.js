const test = require('node:test');
const assert = require('node:assert/strict');
const { publicArtifactRoute } = require('../api/_lib');
const { normalizedArtifactReferer, normalizeArtifactPathRequest } = require('../api/_artifact-path');

const nested = 'https://artifact-lens.example.com/repo/brantje/llamacpp-manager/branch/feature%2Fredesign/run/33324942141/artifact/9736050494/path/screenshots/mobile';
const canonical = 'https://artifact-lens.example.com/repo/brantje/llamacpp-manager/branch/feature%2Fredesign/run/33324942141/artifact/9736050494';

test('normalizes artifact folder URLs to the canonical artifact referrer', () => {
  assert.equal(normalizedArtifactReferer(nested), canonical);
});

test('keeps unrelated URLs unchanged', () => {
  const unrelated = 'https://artifact-lens.example.com/repo/brantje/llamacpp-manager/branch/main';
  assert.equal(normalizedArtifactReferer(unrelated), unrelated);
});

test('nested artifact paths still resolve to the exact public artifact scope', () => {
  const req = normalizeArtifactPathRequest({
    headers: {
      host: 'artifact-lens.example.com',
      referer: nested,
    },
  });

  assert.deepEqual(publicArtifactRoute(req), {
    repo: 'brantje/llamacpp-manager',
    scope: 'artifact',
    branch: 'feature/redesign',
    run_id: '33324942141',
    artifact_id: '9736050494',
    expires_at: null,
    public_artifact: true,
  });
});
