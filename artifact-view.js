(() => {
  const STORAGE_KEY = 'artifactLensArtifactView';
  const originalPickArtifact = window.pickArtifact;
  const originalSetArtifactViewMode = window.setArtifactViewMode;
  let artifactViewMode = localStorage.getItem(STORAGE_KEY) === 'folders' ? 'folders' : 'flat';
  let lastArtifactFiles = null;
  let currentFolderPath = [];
  let appliedRoutePath = null;
  let syncingRoute = false;

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

  function renderOtherFiles(files, id, compact = false) {
    if (!files.length) return '';
    return `<div class="grid folder-other-files">${files.map((file) => {
      const label = compact ? basename(file.name) : file.name;
      return `<div class="artifact other-file"><div><strong>${esc(label)}</strong><div class="muted" style="margin-top:6px">${Math.round(file.size / 1024)} KB</div></div><a class="download-button" href="${artifactFileUrl(id, file.name, true)}" download>Download</a></div>`;
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

  window.pickArtifact = async function (...args) {
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
