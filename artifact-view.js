(() => {
  const STORAGE_KEY = 'artifactLensArtifactView';
  const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
  const originalPickArtifact = window.pickArtifact;
  let artifactViewMode = localStorage.getItem(STORAGE_KEY) === 'folders' ? 'folders' : 'flat';
  let lastArtifactFiles = null;
  let currentFolderPath = [];
  let appliedRoutePath = null;
  let syncingRoute = false;
  let previewState = null;

  const previewModal = document.querySelector('#filePreviewModal');
  const previewTitle = document.querySelector('#filePreviewTitle');
  const previewMeta = document.querySelector('#filePreviewMeta');
  const previewBody = document.querySelector('#filePreviewBody');
  const previewTabs = document.querySelector('#filePreviewTabs');
  const previewRenderedTab = document.querySelector('#filePreviewRenderedTab');
  const previewSourceTab = document.querySelector('#filePreviewSourceTab');
  const previewDownload = document.querySelector('#filePreviewDownload');
  const previewClose = document.querySelector('#filePreviewClose');

  function basename(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    return parts[parts.length - 1] || String(path || '');
  }

  function artifactRouteInfo() {
    const rawParts = location.pathname.split('/').filter(Boolean);
    const decoded = [];
    try {
      for (const part of rawParts) decoded.push(decodeURIComponent(part));
    } catch {
      return null;
    }

    if (decoded[0] !== 'repo' || decoded[3] !== 'branch' || decoded[5] !== 'run' || decoded[7] !== 'artifact' || !decoded[8]) return null;
    const basePath = '/' + rawParts.slice(0, 9).join('/');
    if (decoded.length === 9) return { basePath, folderPath: '' };
    if (decoded[9] !== 'path' || decoded.length < 11) return { basePath, folderPath: '' };
    return { basePath, folderPath: decoded.slice(10).join('/') };
  }

  function folderRoute(path) {
    const route = artifactRouteInfo();
    if (!route) return null;
    const parts = String(path || '').split('/').filter(Boolean);
    return parts.length
      ? `${route.basePath}/path/${parts.map((part) => encodeURIComponent(part)).join('/')}`
      : route.basePath;
  }

  function updateFolderRoute(path, replace = false) {
    const next = folderRoute(path);
    if (!next || location.pathname === next) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', `${next}${location.search}${location.hash}`);
  }

  function toggleHtml() {
    return `<div class="view-toggle" role="group" aria-label="Artifact file view">
      <button class="${artifactViewMode === 'flat' ? 'active' : ''}" onclick="setArtifactViewMode('flat')" aria-pressed="${artifactViewMode === 'flat'}">Flat</button>
      <button class="${artifactViewMode === 'folders' ? 'active' : ''}" onclick="setArtifactViewMode('folders')" aria-pressed="${artifactViewMode === 'folders'}">Folders</button>
    </div>`;
  }

  function toolbarHtml() {
    return `<div class="artifact-toolbar">${toggleHtml()}${viewActions()}</div>`;
  }

  function prepareImages(files, id) {
    currentImages = files
      .filter((file) => file.media && file.mime.startsWith('image/'))
      .map((file) => ({ name: file.name, url: artifactFileUrl(id, file.name) }));
  }

  function previewKind(file) {
    if (file.preview) return file.preview;
    const name = String(file.name || '').toLowerCase();
    if (/\.(md|markdown|mdown|mkd)$/.test(name)) return 'markdown';
    if (/\.(html?|xhtml)$/.test(name)) return 'html';
    if (/\.(txt|log|json|jsonl|xml|ya?ml|toml|ini|cfg|conf|csv|tsv|css|js|mjs|cjs|ts|tsx|jsx|py|rb|php|java|kt|kts|go|rs|c|cc|cpp|cxx|h|hh|hpp|hxx|sh|bash|zsh|fish|ps1|sql|graphql|gql|diff|patch|env|properties)$/.test(name)) return 'text';
    return null;
  }

  function fileActions(file, id) {
    const preview = previewKind(file) && Number(file.size || 0) <= PREVIEW_MAX_BYTES
      ? `<button class="download-button preview-button" onclick="openArtifactFilePreviewEncoded('${pack(file)}')">Preview</button>`
      : '';
    return `<div class="file-row-actions">${preview}<a class="download-button" href="${artifactFileUrl(id, file.name, true)}" download>Download</a></div>`;
  }

  function renderOtherFiles(files, id, compact = false) {
    if (!files.length) return '';
    return `<div class="grid folder-other-files">${files.map((file) => {
      const label = compact ? basename(file.name) : file.name;
      const tooLarge = previewKind(file) && Number(file.size || 0) > PREVIEW_MAX_BYTES;
      return `<div class="artifact other-file"><div class="file-row-info"><strong>${esc(label)}</strong><div class="muted file-row-meta">${Math.round(file.size / 1024)} KB${tooLarge ? ' · too large to preview' : ''}</div></div>${fileActions(file, id)}</div>`;
    }).join('')}</div>`;
  }

  function renderFolderMedia(id, file) {
    const url = artifactFileUrl(id, file.name);
    const label = basename(file.name);
    let body = '';
    if (file.mime.startsWith('image/')) {
      body = `<img loading="lazy" src="${url}" alt="${esc(label)}" onclick="openLightbox(${currentImages.findIndex((image) => image.name === file.name)})">`;
    } else if (file.mime.startsWith('video/')) {
      body = `<video controls preload="metadata" src="${url}"></video>`;
    } else if (file.mime.startsWith('audio/')) {
      body = `<audio controls preload="metadata" src="${url}"></audio>`;
    } else if (file.mime === 'application/pdf') {
      body = `<iframe src="${url}" title="${esc(label)}"></iframe>`;
    }
    return `<figure>${body}<figcaption>${esc(label)}</figcaption></figure>`;
  }

  function renderFlat(files, id) {
    prepareImages(files, id);
    const media = files.filter((file) => file.media);
    const other = files.filter((file) => !file.media);
    return `<div class="media">${media.map((file) => renderMedia(id, file)).join('') || '<div class="muted">No embeddable media detected.</div>'}</div>${other.length ? `<h3>Other files</h3>${renderOtherFiles(other, id)}` : ''}`;
  }

  function folderTree(files) {
    const root = { name: '', path: '', dirs: new Map(), files: [] };
    for (const file of files) {
      const parts = String(file.name || '').split('/').filter(Boolean);
      if (!parts.length) continue;
      parts.pop();
      let node = root;
      for (const part of parts) {
        if (!node.dirs.has(part)) {
          const path = node.path ? `${node.path}/${part}` : part;
          node.dirs.set(part, { name: part, path, dirs: new Map(), files: [] });
        }
        node = node.dirs.get(part);
      }
      node.files.push(file);
    }
    return root;
  }

  function descendantCount(node) {
    let count = node.files.length;
    for (const child of node.dirs.values()) count += descendantCount(child);
    return count;
  }

  function nodeAtPath(root, pathParts) {
    let node = root;
    for (const part of pathParts) {
      node = node.dirs.get(part);
      if (!node) return root;
    }
    return node;
  }

  function pathBreadcrumbHtml() {
    const items = [`<button class="folder-path-part ${currentFolderPath.length ? '' : 'current'}" onclick="openArtifactFolderEncoded('')">Artifact</button>`];
    let path = [];
    currentFolderPath.forEach((part, index) => {
      path.push(part);
      items.push('<span class="folder-path-separator">/</span>');
      items.push(`<button class="folder-path-part ${index === currentFolderPath.length - 1 ? 'current' : ''}" onclick="openArtifactFolderEncoded('${enc(path.join('/'))}')">${esc(part)}</button>`);
    });
    return `<nav class="folder-path" aria-label="Artifact folder path">${items.join('')}</nav>`;
  }

  function renderFolderRows(node) {
    const folders = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (!folders.length) return '';
    return `<div class="folder-list">${folders.map((folder) => {
      const count = descendantCount(folder);
      return `<button class="folder-row" onclick="openArtifactFolderEncoded('${enc(folder.path)}')">
        <span class="folder-icon" aria-hidden="true">📁</span>
        <span class="folder-row-main"><span class="folder-row-name">${esc(folder.name)}</span><span class="folder-row-pattern muted">${esc(folder.path)}/*</span></span>
        <span class="folder-row-count">${count} file${count === 1 ? '' : 's'}</span>
        <span class="folder-row-arrow" aria-hidden="true">›</span>
      </button>`;
    }).join('')}</div>`;
  }

  function renderCurrentFolderFiles(node, id) {
    const media = node.files.filter((file) => file.media);
    const other = node.files.filter((file) => !file.media);
    prepareImages(node.files, id);
    if (!node.files.length) return '';
    return `<section class="folder-files">
      ${media.length ? `<div class="media">${media.map((file) => renderFolderMedia(id, file)).join('')}</div>` : ''}
      ${other.length ? `<h3>Other files</h3>${renderOtherFiles(other, id, true)}` : ''}
    </section>`;
  }

  function renderFolders(files, id) {
    const tree = folderTree(files);
    const node = nodeAtPath(tree, currentFolderPath);
    const folderRows = renderFolderRows(node);
    const fileRows = renderCurrentFolderFiles(node, id);
    const empty = !folderRows && !fileRows ? '<div class="muted folder-empty">This folder is empty.</div>' : '';
    return `<div class="folder-browser">${pathBreadcrumbHtml()}${folderRows}${fileRows}${empty}</div>`;
  }

  function renderArtifact(files) {
    if (!Array.isArray(files) || !S.artifact) return;
    const id = S.artifact.id;
    const body = artifactViewMode === 'folders' ? renderFolders(files, id) : renderFlat(files, id);
    app.innerHTML = crumbs() + `<div class="row"><h2>${esc(S.artifact.name)}</h2>${toolbarHtml()}</div><div class="artifact-file-view">${body}</div>`;
  }

  function openFolderPath(path, { preserveRoute = false, replace = false } = {}) {
    const normalized = String(path || '').split('/').filter(Boolean).join('/');
    currentFolderPath = normalized ? normalized.split('/') : [];
    appliedRoutePath = normalized;
    if (!preserveRoute) updateFolderRoute(normalized, replace);
    if (lastArtifactFiles && S.artifact && artifactViewMode === 'folders') renderArtifact(lastArtifactFiles);
  }

  window.openArtifactFolderEncoded = function (encodedPath) {
    const path = encodedPath ? decodeURIComponent(encodedPath) : '';
    openFolderPath(path);
  };

  window.setArtifactViewMode = function (mode) {
    if (!['flat', 'folders'].includes(mode)) return;
    artifactViewMode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    currentFolderPath = [];
    appliedRoutePath = '';
    updateFolderRoute('');
    if (lastArtifactFiles && S.artifact) renderArtifact(lastArtifactFiles);
  };

  function syncFolderFromRoute() {
    if (syncingRoute || !S.artifact || !lastArtifactFiles) return;
    const route = artifactRouteInfo();
    if (!route) return;
    const desired = route.folderPath || '';
    if (appliedRoutePath === desired) return;

    syncingRoute = true;
    try {
      if (desired && artifactViewMode !== 'folders') {
        artifactViewMode = 'folders';
        localStorage.setItem(STORAGE_KEY, 'folders');
      }
      openFolderPath(desired, { preserveRoute: true });
    } finally {
      syncingRoute = false;
    }
  }

  function sanitizeRenderedHtml(html) {
    if (!window.DOMPurify) throw new Error('HTML sanitizer failed to load.');
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'meta', 'base'],
      FORBID_ATTR: ['style', 'srcset'],
    });
  }

  function hardenPreviewLinks(root) {
    root.querySelectorAll('a[href]').forEach((link) => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer nofollow';
    });
  }

  function renderMarkdown(source) {
    if (!window.marked) throw new Error('Markdown renderer failed to load.');
    const html = marked.parse(source, { gfm: true, breaks: false });
    const wrapper = document.createElement('article');
    wrapper.className = 'markdown-preview';
    wrapper.innerHTML = sanitizeRenderedHtml(html);
    hardenPreviewLinks(wrapper);
    return wrapper;
  }

  function renderHtmlDocument(source) {
    const sanitized = sanitizeRenderedHtml(source);
    const iframe = document.createElement('iframe');
    iframe.className = 'html-preview-frame';
    iframe.setAttribute('sandbox', '');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.title = `${previewState?.file?.name || 'HTML'} preview`;
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"><style>html{color-scheme:light dark}body{font:16px/1.55 system-ui,sans-serif;margin:24px;overflow-wrap:anywhere}img,video{max-width:100%;height:auto}pre{white-space:pre-wrap}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #8888;padding:.4em .6em}</style></head><body>${sanitized}</body></html>`;
    return iframe;
  }

  function renderSource(source) {
    const pre = document.createElement('pre');
    pre.className = 'source-preview';
    pre.textContent = source;
    return pre;
  }

  function setPreviewMode(mode) {
    if (!previewState) return;
    previewState.mode = mode;
    const hasRendered = ['markdown', 'html'].includes(previewState.kind);
    previewTabs.classList.toggle('hidden', !hasRendered);
    previewRenderedTab.classList.toggle('active', mode === 'rendered');
    previewSourceTab.classList.toggle('active', mode === 'source');
    previewBody.replaceChildren();
    try {
      if (mode === 'source' || previewState.kind === 'text') previewBody.appendChild(renderSource(previewState.source));
      else if (previewState.kind === 'markdown') previewBody.appendChild(renderMarkdown(previewState.source));
      else if (previewState.kind === 'html') previewBody.appendChild(renderHtmlDocument(previewState.source));
    } catch (e) {
      const failure = document.createElement('div');
      failure.className = 'error file-preview-error';
      failure.textContent = e.message;
      previewBody.appendChild(failure);
    }
  }

  window.openArtifactFilePreviewEncoded = async function (encodedFile) {
    if (!S.artifact || !previewModal) return;
    const file = JSON.parse(decodeURIComponent(encodedFile));
    const kind = previewKind(file);
    if (!kind) return;
    if (Number(file.size || 0) > PREVIEW_MAX_BYTES) {
      err.textContent = `${file.name} is too large to preview (5 MB maximum).`;
      return;
    }

    previewState = { file, kind, source: '', mode: kind === 'text' ? 'source' : 'rendered' };
    previewTitle.textContent = basename(file.name);
    previewMeta.textContent = `${file.name} · ${Math.round(file.size / 1024)} KB`;
    previewDownload.href = artifactFileUrl(S.artifact.id, file.name, true);
    previewBody.innerHTML = '<div class="muted file-preview-loading">Loading preview…</div>';
    previewTabs.classList.toggle('hidden', kind === 'text');
    previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    try {
      const response = await fetch(artifactFileUrl(S.artifact.id, file.name), { headers: { Accept: 'text/plain,*/*;q=0.1' } });
      if (!response.ok) throw new Error(`Could not load preview (${response.status}).`);
      const source = await response.text();
      if (!previewState || previewState.file.name !== file.name) return;
      previewState.source = source;
      setPreviewMode(previewState.mode);
    } catch (e) {
      if (!previewState || previewState.file.name !== file.name) return;
      previewBody.innerHTML = '';
      const failure = document.createElement('div');
      failure.className = 'error file-preview-error';
      failure.textContent = e.message;
      previewBody.appendChild(failure);
    }
  };

  window.closeArtifactFilePreview = function () {
    if (!previewModal) return;
    previewModal.classList.add('hidden');
    previewBody.replaceChildren();
    previewState = null;
    document.body.style.overflow = '';
  };

  previewRenderedTab?.addEventListener('click', () => setPreviewMode('rendered'));
  previewSourceTab?.addEventListener('click', () => setPreviewMode('source'));
  previewClose?.addEventListener('click', window.closeArtifactFilePreview);
  previewModal?.addEventListener('click', (event) => {
    if (event.target === previewModal) window.closeArtifactFilePreview();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && previewModal && !previewModal.classList.contains('hidden')) {
      window.closeArtifactFilePreview();
    }
  });

  window.pickArtifact = async function (...args) {
    window.closeArtifactFilePreview();
    const previousArtifactId = S.artifact?.id;
    const opt = args[1] || {};
    const files = await originalPickArtifact(...args);
    if (Array.isArray(files)) {
      const artifactChanged = String(previousArtifactId || '') !== String(S.artifact?.id || '');
      if (artifactChanged || !opt.preserveRoute) {
        currentFolderPath = [];
        appliedRoutePath = '';
      }
      lastArtifactFiles = files;
      renderArtifact(files);
      queueMicrotask(syncFolderFromRoute);
    }
    return files;
  };

  window.addEventListener('popstate', () => {
    appliedRoutePath = null;
    setTimeout(syncFolderFromRoute, 0);
  });

  const observer = new MutationObserver(() => queueMicrotask(syncFolderFromRoute));
  observer.observe(app, { childList: true, subtree: true });
})();
