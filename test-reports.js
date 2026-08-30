(() => {
  const originalOpen = window.openArtifactFilePreviewEncoded;
  const originalClose = window.closeArtifactFilePreview;
  const modal = document.querySelector('#filePreviewModal');
  const title = document.querySelector('#filePreviewTitle');
  const meta = document.querySelector('#filePreviewMeta');
  const body = document.querySelector('#filePreviewBody');
  const tabs = document.querySelector('#filePreviewTabs');
  const renderedTab = document.querySelector('#filePreviewRenderedTab');
  const sourceTab = document.querySelector('#filePreviewSourceTab');
  const download = document.querySelector('#filePreviewDownload');
  let state = null;

  const text = (node, selector) => node.querySelector(selector)?.textContent?.trim() || '';
  const attr = (node, name) => node.getAttribute(name) || '';
  const seconds = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n * 1000 : 0;
  };
  const ms = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const status = (value) => {
    const v = String(value || '').toLowerCase();
    if (['passed','pass','success','succeeded','ok','expected','flaky','xpassed'].includes(v)) return 'passed';
    if (['skipped','skip','pending','disabled','notexecuted','ignored','todo','xfailed'].includes(v)) return 'skipped';
    return 'failed';
  };
  const makeTest = (name, result = {}) => ({
    name: name || 'Unnamed test',
    status: status(result.status),
    duration: ms(result.duration),
    message: result.message || '',
    stack: result.stack || '',
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    attachments: result.attachments || [],
  });
  const makeSuite = (name, tests = []) => ({ name: name || 'Tests', tests });
  const normalize = (format, suites) => ({ format, suites: suites.filter((s) => s.tests.length) });

  function parseXml(source) {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (doc.querySelector('parsererror')) return null;

    if (doc.querySelector('TestRun UnitTestResult, TestRun Results UnitTestResult')) {
      const tests = [...doc.querySelectorAll('UnitTestResult')].map((r) => makeTest(attr(r, 'testName'), {
        status: attr(r, 'outcome'),
        duration: parseDuration(attr(r, 'duration')),
        message: text(r, 'Message'), stack: text(r, 'StackTrace'), stdout: text(r, 'StdOut'), stderr: text(r, 'StdErr'),
      }));
      return normalize('Visual Studio TRX', [makeSuite('Test run', tests)]);
    }

    if (doc.querySelector('test-run, nunit-results')) {
      const suiteNodes = [...doc.querySelectorAll('test-suite')].filter((n) => n.querySelector(':scope > test-case'));
      const suites = suiteNodes.map((s) => makeSuite(attr(s, 'fullname') || attr(s, 'name'), [...s.querySelectorAll(':scope > test-case')].map((c) => {
        const failure = c.querySelector('failure');
        return makeTest(attr(c, 'fullname') || attr(c, 'name'), {
          status: attr(c, 'result'), duration: seconds(attr(c, 'duration')),
          message: failure ? text(failure, 'message') : '', stack: failure ? text(failure, 'stack-trace') : '',
          stdout: text(c, 'output'),
        });
      })));
      return suites.length ? normalize('NUnit XML', suites) : null;
    }

    if (doc.querySelector('testsuite, testsuites')) {
      let suiteNodes = [...doc.querySelectorAll('testsuite')].filter((n) => n.querySelector(':scope > testcase'));
      if (!suiteNodes.length && doc.documentElement.matches('testsuite')) suiteNodes = [doc.documentElement];
      const suites = suiteNodes.map((s) => makeSuite(attr(s, 'name') || 'JUnit suite', [...s.querySelectorAll(':scope > testcase')].map((c) => {
        const failure = c.querySelector('failure, error');
        const skipped = c.querySelector('skipped');
        return makeTest([attr(c, 'classname'), attr(c, 'name')].filter(Boolean).join(' › '), {
          status: skipped ? 'skipped' : failure ? 'failed' : 'passed', duration: seconds(attr(c, 'time')),
          message: failure ? attr(failure, 'message') || failure.textContent.trim() : skipped ? attr(skipped, 'message') : '',
          stack: failure?.textContent?.trim() || '', stdout: text(c, 'system-out'), stderr: text(c, 'system-err'),
        });
      })));
      return suites.length ? normalize('JUnit XML', suites) : null;
    }
    return null;
  }

  function parseDuration(value) {
    const m = String(value || '').match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
    return m ? ((Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : ms(value);
  }

  function parsePlaywright(data) {
    if (!Array.isArray(data?.suites)) return null;
    const suites = [];
    const walk = (suite, path = []) => {
      const here = [...path, suite.title].filter(Boolean);
      const tests = [];
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const results = test.results || [];
          const last = results[results.length - 1] || {};
          tests.push(makeTest([...here, spec.title, test.projectName].filter(Boolean).join(' › '), {
            status: test.status || last.status,
            duration: results.reduce((sum, r) => sum + ms(r.duration), 0),
            message: last.error?.message || last.errors?.map((e) => e.message).filter(Boolean).join('\n') || '',
            stack: last.error?.stack || last.errors?.map((e) => e.stack).filter(Boolean).join('\n\n') || '',
            stdout: (last.stdout || []).map((v) => typeof v === 'string' ? v : v.text).join(''),
            stderr: (last.stderr || []).map((v) => typeof v === 'string' ? v : v.text).join(''),
            attachments: (last.attachments || []).map((a) => ({ name: a.name, path: a.path, contentType: a.contentType })),
          }));
        }
      }
      if (tests.length) suites.push(makeSuite(here.join(' › ') || 'Playwright', tests));
      for (const child of suite.suites || []) walk(child, here);
    };
    data.suites.forEach((s) => walk(s));
    return suites.length ? normalize('Playwright JSON', suites) : null;
  }

  function parseJest(data) {
    if (!Array.isArray(data?.testResults)) return null;
    const suites = data.testResults.map((r) => makeSuite(r.name || r.testFilePath || 'Jest/Vitest', (r.assertionResults || r.testResults || []).map((t) => {
      const failure = (t.failureMessages || []).join('\n\n');
      return makeTest([...(t.ancestorTitles || []), t.title || t.fullName].filter(Boolean).join(' › '), {
        status: t.status, duration: t.duration, message: failure.split('\n')[0], stack: failure,
      });
    })));
    return suites.some((s) => s.tests.length) ? normalize('Jest / Vitest JSON', suites) : null;
  }

  function parsePytest(data) {
    if (!Array.isArray(data?.tests) || !data.tests.some((t) => t.nodeid || t.outcome)) return null;
    const groups = new Map();
    for (const t of data.tests) {
      const nodeid = t.nodeid || t.name || 'pytest';
      const parts = nodeid.split('::');
      const suiteName = parts.length > 1 ? parts.slice(0, -1).join(' › ') : 'pytest';
      const phase = t.call || t.setup || t.teardown || {};
      if (!groups.has(suiteName)) groups.set(suiteName, []);
      groups.get(suiteName).push(makeTest(parts.at(-1), {
        status: t.outcome || phase.outcome,
        duration: (Number(t.duration) || Number(phase.duration) || 0) * 1000,
        message: phase.longrepr || t.longrepr || '', stack: phase.longrepr || '',
      }));
    }
    return normalize('pytest JSON', [...groups].map(([name, tests]) => makeSuite(name, tests)));
  }

  function parseAllure(data) {
    if (!data || typeof data !== 'object' || !data.uuid || !data.status || !(data.name || data.fullName)) return null;
    const labels = (data.labels || []).filter((l) => ['suite','parentSuite','subSuite'].includes(l.name)).map((l) => l.value);
    const duration = data.start && data.stop ? Math.max(0, data.stop - data.start) : 0;
    return normalize('Allure result', [makeSuite(labels.join(' › ') || 'Allure', [makeTest(data.fullName || data.name, {
      status: data.status, duration,
      message: data.statusDetails?.message || '', stack: data.statusDetails?.trace || '',
      attachments: (data.attachments || []).map((a) => ({ name: a.name, path: a.source, contentType: a.type })),
    })])]);
  }

  function parseJson(source) {
    let data;
    try { data = JSON.parse(source); } catch { return null; }
    return parsePlaywright(data) || parseJest(data) || parsePytest(data) || parseAllure(data);
  }

  function parseGo(source) {
    const lines = source.trim().split(/\r?\n/).filter(Boolean);
    const events = [];
    for (const line of lines) {
      try { const value = JSON.parse(line); if (value?.Action && value?.Package) events.push(value); } catch { return null; }
    }
    if (!events.length || !events.some((e) => e.Test)) return null;
    const groups = new Map();
    const output = new Map();
    for (const e of events) {
      if (!e.Test) continue;
      const key = `${e.Package}\0${e.Test}`;
      if (e.Action === 'output') output.set(key, (output.get(key) || '') + (e.Output || ''));
      if (!['pass','fail','skip'].includes(e.Action)) continue;
      if (!groups.has(e.Package)) groups.set(e.Package, []);
      groups.get(e.Package).push(makeTest(e.Test, { status: e.Action, duration: seconds(e.Elapsed), message: e.Action === 'fail' ? output.get(key) || '' : '', stdout: output.get(key) || '' }));
    }
    return normalize('Go test JSON', [...groups].map(([name, tests]) => makeSuite(name, tests)));
  }

  function parseTap(source) {
    if (!/^TAP version\s+\d+/mi.test(source) && !/^\s*(?:ok|not ok)\b/m.test(source)) return null;
    const tests = [];
    for (const line of source.split(/\r?\n/)) {
      const m = line.match(/^\s*(not ok|ok)\b(?:\s+\d+)?(?:\s*-?\s*)?(.*)$/i);
      if (!m) continue;
      const name = (m[2] || '').replace(/\s+#\s*(?:SKIP|TODO).*$/i, '').trim() || `Test ${tests.length + 1}`;
      const skipped = /#\s*(?:SKIP|TODO)\b/i.test(line);
      tests.push(makeTest(name, { status: skipped ? 'skipped' : /^ok$/i.test(m[1]) ? 'passed' : 'failed', message: /^not ok$/i.test(m[1]) ? line.trim() : '' }));
    }
    return tests.length ? normalize('TAP', [makeSuite('TAP', tests)]) : null;
  }

  function parseReport(file, source) {
    const lower = String(file.name || '').toLowerCase();
    if (/\.trx$/.test(lower)) return parseXml(source);
    if (/\.(xml|nunit)$/.test(lower)) return parseXml(source);
    if (/\.(tap|t)$/.test(lower)) return parseTap(source);
    if (/\.jsonl?$/.test(lower)) return parseGo(source) || parseJson(source);
    return null;
  }

  function summary(report) {
    const tests = report.suites.flatMap((s) => s.tests);
    const counts = { passed: 0, failed: 0, skipped: 0 };
    let duration = 0;
    tests.forEach((t) => { counts[t.status]++; duration += t.duration || 0; });
    return { tests, counts, duration };
  }

  function durationLabel(value) {
    if (!value) return '—';
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} s`;
    return `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
  }

  function renderReport(report) {
    const root = document.createElement('div');
    root.className = 'test-report';
    const s = summary(report);
    root.innerHTML = `<div class="test-report-summary">
      <div><strong>${s.tests.length}</strong><span>tests</span></div>
      <div class="test-count-passed"><strong>${s.counts.passed}</strong><span>passed</span></div>
      <div class="test-count-failed"><strong>${s.counts.failed}</strong><span>failed</span></div>
      <div class="test-count-skipped"><strong>${s.counts.skipped}</strong><span>skipped</span></div>
      <div><strong>${durationLabel(s.duration)}</strong><span>duration</span></div>
    </div>
    <div class="test-report-toolbar"><div class="test-report-filters" role="group" aria-label="Test status filter">
      <button class="active" data-status="all">All</button><button data-status="failed">Failed</button><button data-status="passed">Passed</button><button data-status="skipped">Skipped</button>
    </div><div class="muted">${escapeHtml(report.format)}</div></div>
    <div class="test-report-suites"></div>`;
    const list = root.querySelector('.test-report-suites');
    for (const suite of report.suites) {
      const section = document.createElement('section');
      section.className = 'test-suite';
      const failed = suite.tests.filter((t) => t.status === 'failed').length;
      section.innerHTML = `<div class="test-suite-heading"><strong>${escapeHtml(suite.name)}</strong><span class="muted">${suite.tests.length} test${suite.tests.length === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}</span></div>`;
      for (const test of suite.tests) section.appendChild(renderTest(test));
      list.appendChild(section);
    }
    root.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', () => {
      root.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('active', b === button));
      const filter = button.dataset.status;
      root.querySelectorAll('.test-result').forEach((row) => row.classList.toggle('hidden', filter !== 'all' && row.dataset.status !== filter));
      root.querySelectorAll('.test-suite').forEach((suite) => suite.classList.toggle('hidden', !suite.querySelector('.test-result:not(.hidden)')));
    }));
    return root;
  }

  function renderTest(test) {
    const row = document.createElement('details');
    row.className = `test-result test-${test.status}`;
    row.dataset.status = test.status;
    const icon = test.status === 'passed' ? '✓' : test.status === 'skipped' ? '−' : '×';
    row.innerHTML = `<summary><span class="test-status-icon" aria-hidden="true">${icon}</span><span class="test-name">${escapeHtml(test.name)}</span><span class="test-duration">${durationLabel(test.duration)}</span></summary>`;
    const detail = document.createElement('div');
    detail.className = 'test-detail';
    if (test.message) detail.appendChild(block('Failure', test.message));
    if (test.stack && test.stack !== test.message) detail.appendChild(block('Stack trace', test.stack));
    if (test.stdout) detail.appendChild(block('stdout', test.stdout));
    if (test.stderr) detail.appendChild(block('stderr', test.stderr));
    if (test.attachments?.length) {
      const attachments = document.createElement('div');
      attachments.className = 'test-attachments';
      attachments.innerHTML = `<strong>Attachments</strong>${test.attachments.map((a) => `<div>${escapeHtml(a.name || a.path || 'attachment')}<span class="muted">${a.contentType ? ` · ${escapeHtml(a.contentType)}` : ''}${a.path ? ` · ${escapeHtml(a.path)}` : ''}</span></div>`).join('')}`;
      detail.appendChild(attachments);
    }
    if (!detail.children.length) detail.innerHTML = '<div class="muted">No additional output for this test.</div>';
    row.appendChild(detail);
    return row;
  }

  function block(label, value) {
    const wrap = document.createElement('div');
    wrap.className = 'test-output';
    const heading = document.createElement('strong');
    heading.textContent = label;
    const pre = document.createElement('pre');
    pre.textContent = value;
    wrap.append(heading, pre);
    return wrap;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function renderSource(source) {
    const pre = document.createElement('pre');
    pre.className = 'source-preview';
    pre.textContent = source;
    return pre;
  }

  function showMode(mode) {
    if (!state) return;
    state.mode = mode;
    renderedTab.classList.toggle('active', mode === 'rendered');
    sourceTab.classList.toggle('active', mode === 'source');
    body.replaceChildren(mode === 'rendered' ? renderReport(state.report) : renderSource(state.source));
  }

  function resetReportState() {
    state = null;
    renderedTab.textContent = 'Rendered';
    sourceTab.textContent = 'Source';
  }

  function candidate(file) {
    return /\.(?:xml|trx|nunit|json|jsonl|tap|t)$/i.test(file.name || '');
  }

  window.openArtifactFilePreviewEncoded = async function (encodedFile) {
    const file = JSON.parse(decodeURIComponent(encodedFile));
    if (!candidate(file) || Number(file.size || 0) > 5 * 1024 * 1024 || typeof S === 'undefined' || !S.artifact) {
      resetReportState();
      return originalOpen(encodedFile);
    }

    try {
      const response = await fetch(artifactFileUrl(S.artifact.id, file.name), { headers: { Accept: 'text/plain,*/*;q=0.1' } });
      if (!response.ok) {
        resetReportState();
        return originalOpen(encodedFile);
      }
      const source = await response.text();
      const report = parseReport(file, source);
      if (!report || !report.suites.length) {
        resetReportState();
        return originalOpen(encodedFile);
      }

      originalClose?.();
      state = { file, source, report, mode: 'rendered' };
      title.textContent = file.name.split('/').pop();
      meta.textContent = `${file.name} · ${Math.round(file.size / 1024)} KB · ${report.format}`;
      download.href = artifactFileUrl(S.artifact.id, file.name, true);
      renderedTab.textContent = 'Report';
      sourceTab.textContent = 'Source';
      tabs.classList.remove('hidden');
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      showMode('rendered');
    } catch {
      resetReportState();
      originalOpen(encodedFile);
    }
  };

  window.closeArtifactFilePreview = function () {
    resetReportState();
    originalClose?.();
  };

  renderedTab.addEventListener('click', () => { if (state) showMode('rendered'); });
  sourceTab.addEventListener('click', () => { if (state) showMode('source'); });
})();
