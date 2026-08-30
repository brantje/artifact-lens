(() => {
  const STORAGE_KEY = 'artifactLensArtifactView';
  const originalPickArtifact = window.pickArtifact;
  let artifactViewMode = localStorage.getItem(STORAGE_KEY) === 'folders' ? 'folders' : 'flat';
  let lastArtifactFiles = null;

  function basename(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    return parts[parts.length - 1] || String(path || '');
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
    const media = files.filter((file) => file.media);
    const other = files.filter((file) => !file.media);
    return `<div class="media">${media.map((file) => renderMedia(id, file)).join('') || '<div class="muted">No embeddable media detected.</div>'}</div>${other.length ? `<h3>Other files</h3>${renderOtherFiles(other, id)}` : ''}`;
  }

  function folderTree(files) {
    const root = { name: '', path: '', dirs: new Map(), files: [] };
    for (const file of files) {
      const parts = String(file.name || '').split('/').filter(Boolean);
      if (!parts.length) continue;
      const fileName = parts.pop();
      let node = root;
      for (const part of parts) {
        if (!node.dirs.has(part)) {
          const path = node.path ? `${node.path}/${part}` : part;
          node.dirs.set(part, { name: part, path, dirs: new Map(), files: [] });
        }
        node = node.dirs.get(part);
      }
      node.files.push({ ...file, _basename: fileName });
    }
    return root;
  }

  function descendantCount(node) {
    let count = node.files.length;
    for (const child of node.dirs.values()) count += descendantCount(child);
    return count;
  }

  function renderNodeFiles(node, id) {
    const media = node.files.filter((file) => file.media);
    const other = node.files.filter((file) => !file.media);
    let html = '';
    if (media.length) html += `<div class="media folder-media">${media.map((file) => renderFolderMedia(id, file)).join('')}</div>`;
    if (other.length) html += renderOtherFiles(other, id, true);
    return html;
  }

  function renderFolderNode(node, id) {
    const children = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    const filesHtml = renderNodeFiles(node, id);
    const childrenHtml = children.map((child) => renderFolderNode(child, id)).join('');
    if (!node.path) {
      const rootFiles = filesHtml ? `<section class="folder-root-files"><div class="folder-root-label">Root files</div>${filesHtml}</section>` : '';
      return `${rootFiles}${childrenHtml || (!filesHtml ? '<div class="muted">No files found.</div>' : '')}`;
    }
    const count = descendantCount(node);
    return `<details class="folder-group" open>
      <summary><span class="folder-name">${esc(node.name)}</span><span class="folder-pattern">${esc(node.path)}/*</span><span class="folder-count">${count} file${count === 1 ? '' : 's'}</span></summary>
      <div class="folder-contents">${filesHtml}${childrenHtml}</div>
    </details>`;
  }

  function renderFolders(files, id) {
    return `<div class="folder-view">${renderFolderNode(folderTree(files), id)}</div>`;
  }

  function renderArtifact(files) {
    if (!Array.isArray(files) || !S.artifact) return;
    const id = S.artifact.id;
    prepareImages(files, id);
    const body = artifactViewMode === 'folders' ? renderFolders(files, id) : renderFlat(files, id);
    app.innerHTML = crumbs() + `<div class="row"><h2>${esc(S.artifact.name)}</h2>${toolbarHtml()}</div><div class="artifact-file-view">${body}</div>`;
  }

  window.setArtifactViewMode = function (mode) {
    if (!['flat', 'folders'].includes(mode)) return;
    artifactViewMode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    if (lastArtifactFiles && S.artifact) renderArtifact(lastArtifactFiles);
  };

  window.pickArtifact = async function (...args) {
    const files = await originalPickArtifact(...args);
    if (Array.isArray(files)) {
      lastArtifactFiles = files;
      renderArtifact(files);
    }
    return files;
  };
})();
