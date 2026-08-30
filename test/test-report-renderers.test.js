const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'test-reports.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const artifactApi = fs.readFileSync(path.join(root, 'api/repo/artifact.js'), 'utf8');

test('loads the test report renderer after the artifact preview layer', () => {
  const artifactView = index.indexOf('src="/artifact-view.js"');
  const reports = index.indexOf('src="/test-reports.js"');
  assert.ok(artifactView >= 0);
  assert.ok(reports > artifactView);
  assert.match(index, /test-reports\.css/);
});

test('supports the expected popular test report families', () => {
  for (const marker of [
    'JUnit XML',
    'Visual Studio TRX',
    'NUnit XML',
    'Playwright JSON',
    'Jest / Vitest JSON',
    'pytest JSON',
    'Allure result',
    'Go test JSON',
    'TAP',
  ]) assert.ok(renderer.includes(marker), `missing renderer: ${marker}`);
});

test('marks dedicated XML and TAP report extensions as previewable', () => {
  assert.match(artifactApi, /trx/);
  assert.match(artifactApi, /nunit/);
  assert.match(artifactApi, /tap/);
});
