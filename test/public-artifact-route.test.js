const test = require('node:test');
const assert = require('node:assert/strict');
const { publicArtifactRoute } = require('../api/_lib');

function requestFor(referer, host = 'artifact-lens.example.com') {
  return { headers: { host, referer } };
}

test('parses canonical artifact routes with encoded branch slashes', () => {
  const route = publicArtifactRoute(requestFor(
    'https://artifact-lens.example.com/repo/brantje/llamacpp-manager/branch/feature%2Fredesign/run/33324942141/artifact/9736050494'
  ));

  assert.deepEqual(route, {
    repo: 'brantje/llamacpp-manager',
    scope: 'artifact',
    branch: 'feature/redesign',
    run_id: '33324942141',
    artifact_id: '9736050494',
    expires_at: null,
    public_artifact: true,
  });
});

test('rejects routes from a different origin', () => {
  assert.equal(publicArtifactRoute(requestFor(
    'https://example.net/repo/brantje/llamacpp-manager/branch/main/run/1/artifact/2'
  )), null);
});

test('rejects malformed run or artifact ids', () => {
  assert.equal(publicArtifactRoute(requestFor(
    'https://artifact-lens.example.com/repo/brantje/llamacpp-manager/branch/main/run/not-a-run/artifact/2'
  )), null);
  assert.equal(publicArtifactRoute(requestFor(
    'https://artifact-lens.example.com/repo/brantje/llamacpp-manager/branch/main/run/1/artifact/not-an-artifact'
  )), null);
});
