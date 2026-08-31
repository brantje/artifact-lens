(() => {
  const previousOpen = window.openArtifactFilePreviewEncoded;
  const previousClose = window.closeArtifactFilePreview;
  const modal = document.querySelector('#filePreviewModal');
  const title = document.querySelector('#filePreviewTitle');
  const meta = document.querySelector('#filePreviewMeta');
  const body = document.querySelector('#filePreviewBody');
  const tabs = document.querySelector('#filePreviewTabs');
  const renderedTab = document.querySelector('#filePreviewRenderedTab');
  const sourceTab = document.querySelector('#filePreviewSourceTab');
  const download = document.querySelector('#filePreviewDownload');
  const close = document.querySelector('#filePreviewClose');
  const MAX_BYTES = 5 * 1024 * 1024;
  let state = null;

  function isHtml(file) {
    return /\.html?$/i.test(file?.name || '');
  }

  function isPlaywrightReport(source) {
    return /<title>\s*Playwright Test Report\s*<\/title>/i.test(source)
      || /playwright-report/i.test(source) && /<script\b[^>]*type=["']module["']/i.test(source);
  }

  function sourceView(source) {
    const pre = document.createElement('pre');
    pre.className = 'source-preview';
    pre.textContent = source;
    return pre;
  }

  function withRestrictedCsp(source) {
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob: data:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob:; worker-src blob:; child-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`;
    if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, (head) => `${head}${csp}`);
    return `<!doctype html><html><head>${csp}</head><body>${source}</body></html>`;
  }

  function renderedView(source, file) {
    const iframe = document.createElement('iframe');
    iframe.className = 'html-preview-frame playwright-report-frame';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.title = `${file.name} Playwright report`;
    iframe.srcdoc = withRestrictedCsp(source);
    return iframe;
  }

  function show(mode) {
    if (!state) return;
    state.mode = mode;
    renderedTab.textContent = 'Rendered';
    sourceTab.textContent = 'Source';
    renderedTab.classList.toggle('active', mode === 'rendered');
    sourceTab.classList.toggle('active', mode === 'source');
    body.replaceChildren(mode === 'rendered' ? renderedView(state.source, state.file) : sourceView(state.source));
  }

  window.openArtifactFilePreviewEncoded = async function (encodedFile) {
    let file;
    try {
      file = JSON.parse(decodeURIComponent(encodedFile));
    } catch {
      return previousOpen(encodedFile);
    }

    if (!isHtml(file) || Number(file.size || 0) > MAX_BYTES || !window.S?.artifact) return previousOpen(encodedFile);

    try {
      const response = await fetch(artifactFileUrl(S.artifact.id, file.name), { headers: { Accept: 'text/plain,*/*;q=0.1' } });
      if (!response.ok) return previousOpen(encodedFile);
      const source = await response.text();
      if (!isPlaywrightReport(source)) return previousOpen(encodedFile);

      state = { file, source, mode: 'rendered' };
      title.textContent = file.name.split('/').pop() || file.name;
      meta.textContent = `${file.name} · ${Math.round(file.size / 1024)} KB · Playwright HTML report`;
      download.href = artifactFileUrl(S.artifact.id, file.name, true);
      tabs.classList.remove('hidden');
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      show('rendered');
    } catch {
      return previousOpen(encodedFile);
    }
  };

  window.closeArtifactFilePreview = function () {
    state = null;
    renderedTab.textContent = 'Rendered';
    sourceTab.textContent = 'Source';
    return previousClose();
  };

  renderedTab?.addEventListener('click', () => { if (state) show('rendered'); });
  sourceTab?.addEventListener('click', () => { if (state) show('source'); });
  close?.addEventListener('click', () => { state = null; });
})();
