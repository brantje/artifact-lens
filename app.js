const app = document.querySelector('#app');
const account = document.querySelector('#account');
const err = document.querySelector('#error');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = document.querySelector('#lightboxImage');
const lightboxMeta = document.querySelector('#lightboxMeta');
const lightboxPrev = document.querySelector('#lightboxPrev');
const lightboxNext = document.querySelector('#lightboxNext');
const shareModal = document.querySelector('#shareModal');
const shareScope = document.querySelector('#shareScope');
const shareExpiry = document.querySelector('#shareExpiry');
const shareResult = document.querySelector('#shareResult');
const shareUrl = document.querySelector('#shareUrl');
const shareCreate = document.querySelector('#shareCreate');

let S = { repo: null, branch: null, run: null, artifact: null };
let currentImages = [];
let lightboxIndex = 0;
let navigatingHistory = false;
let viewerMode = 'user';
let shareInfo = null;

async function api(url, options = {}) {
  err.textContent = '';
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { ...options, headers });
  let d = null;
  try { d = await r.json(); } catch { d = {}; }
  if (r.status === 401) {
    renderLogin();
    throw new Error('AUTH');
  }
  if (!r.ok) throw new Error(d.error || JSON.stringify(d));
  return d;
}

function esc(v = '') {
  return String(v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function enc(v) {
  return encodeURIComponent(String(v)).replace(/'/g, '%27');
}

function pack(v) {
  return encodeURIComponent(JSON.stringify(v)).replace(/'/g, '%27');
}

window.pickRepoEncoded = (v) => window.pickRepo(decodeURIComponent(v));
window.pickBranchEncoded = (v) => window.pickBranch(decodeURIComponent(v));
window.pickRunEncoded = (v) => window.pickRun(JSON.parse(decodeURIComponent(v)));
window.pickArtifactEncoded = (v) => window.pickArtifact(JSON.parse(decodeURIComponent(v)));

function ago(d) {
  const n = (Date.now() - new Date(d)) / 1000;
  if (n < 60) return `${Math.max(0, Math.floor(n))}s ago`;
  if (n < 3600) return `${Math.floor(n / 60)}m ago`;
  if (n < 86400) return `${Math.floor(n / 3600)}h ago`;
  return `${Math.floor(n / 86400)}d ago`;
}

function statusClass(s = '') {
  return s === 'success' ? 'success' : s === 'failure' ? 'failure' : '';
}

function pathFor() {
  if (!S.repo) return '/';
  const [owner, repo] = S.repo.split('/');
  let path = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  if (S.branch) path += `/branch/${encodeURIComponent(S.branch)}`;
  if (S.run) path += `/run/${encodeURIComponent(S.run.id)}`;
  if (S.artifact) path += `/artifact/${encodeURIComponent(S.artifact.id)}`;
  return path;
}

function setRoute(replace = false) {
  if (navigatingHistory) return;
  const path = pathFor();
  if (location.pathname !== path) history[replace ? 'replaceState' : 'pushState']({}, '', path);
}

function parseRoute() {
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return {};
  if (parts[0] !== 'repo' || parts.length < 3) return {};
  const route = { repo: `${parts[1]}/${parts[2]}` };
  for (let i = 3; i < parts.length;) {
    if (parts[i] === 'branch' && parts[i + 1]) {
      route.branch = parts[i + 1];
      i += 2;
    } else if (parts[i] === 'run' && parts[i + 1]) {
      route.runId = parts[i + 1];
      i += 2;
    } else if (parts[i] === 'artifact' && parts[i + 1]) {
      route.artifactId = parts[i + 1];
      i += 2;
    } else break;
  }
  return route;
}

function renderLogin() {
  viewerMode = 'guest';
  shareInfo = null;
  account.innerHTML = '';
  app.innerHTML = `
    <div class="login-panel">
      <h2>Sign in with GitHub</h2>
      <p class="muted">Artifact Lens turns GitHub Actions artifacts into a browsable media gallery. Pick an installed repository, choose a branch and workflow run, then inspect the files produced by CI without downloading and unpacking ZIP files yourself.</p>
      <div class="file-types">
        <div class="file-type"><strong>Images</strong><span class="muted">PNG, JPEG, GIF, WebP and SVG are shown inline. Click an image for a lightbox; use previous/next when the artifact contains multiple images.</span></div>
        <div class="file-type"><strong>Video & audio</strong><span class="muted">MP4, WebM, MOV, MP3, WAV and OGG are embedded with native browser playback controls.</span></div>
        <div class="file-type"><strong>PDF</strong><span class="muted">PDF reports are embedded directly in the artifact view for quick inspection.</span></div>
        <div class="file-type"><strong>Other files</strong><span class="muted">Files that cannot be safely previewed are listed with their name and size and can still be downloaded individually.</span></div>
      </div>
      <div class="security-note"><strong>Least-privilege access</strong><div class="muted" style="margin-top:5px">Artifact Lens uses a GitHub App with read-only Metadata + Actions permissions. It can only see repositories where the app is installed and that your GitHub account can access.</div></div>
      <button class="primary" onclick="location.href='/api/auth/login'">Continue with GitHub</button>
    </div>`;
}

function shareButton() {
  return viewerMode === 'user' && S.repo ? '<button onclick="openShareDialog()">Share</button>' : '';
}

function viewActions() {
  return `<div class="actions"><button onclick="refreshCurrent()">Refresh</button>${shareButton()}</div>`;
}

async function boot() {
  try {
    const me = await api('/api/me');
    if (me.shared) {
      viewerMode = 'share';
      shareInfo = me;
      const expiry = me.expires_at ? ` · expires ${new Date(me.expires_at).toLocaleString()}` : '';
      account.innerHTML = `<div class="login"><span class="badge shared">Shared ${esc(me.scope)} view</span><span class="muted share-account">${esc(me.repo)}${esc(expiry)}</span><button onclick="refreshCurrent()">Refresh</button><button onclick="location.href='/api/auth/login'">Sign in</button></div>`;
    } else {
      viewerMode = 'user';
      shareInfo = null;
      account.innerHTML = `<div class="login"><img class="avatar" src="${esc(me.avatar_url)}" alt=""><span>${esc(me.login)}</span><button onclick="refreshCurrent()">Refresh</button><button onclick="location.href='/api/auth/logout'">Log out</button></div>`;
    }
    await restoreFromRoute();
  } catch (e) {
    if (e.message !== 'AUTH') {
      err.textContent = e.message;
      renderLogin();
    }
  }
}

async function showRepos(opt = {}) {
  closeLightbox();
  closeShareDialog();
  S = { repo: null, branch: null, run: null, artifact: null };
  if (!opt.preserveRoute) setRoute(opt.replace);
  app.innerHTML = '<div class="muted">Loading repositories…</div>';
  try {
    const data = await api('/api/repos');
    const repos = data.repositories || [];
    const shared = Boolean(data.shared || viewerMode === 'share');
    const canInstall = !shared && Boolean(data.install_available);
    const installButton = canInstall ? '<button onclick="openInstallPopup()">Install / add repositories</button>' : '';
    const list = repos.length
      ? `<div class="grid">${repos.map((r) => `<div class="repo" onclick="pickRepoEncoded('${enc(r.full_name)}')"><div class="row"><strong>${esc(r.full_name)}</strong>${r.private ? '<span class="badge">private</span>' : ''}</div><div class="muted" style="margin-top:8px">${esc(r.description || 'No description')}</div><div class="muted" style="margin-top:10px;font-size:12px">Updated ${ago(r.updated_at)}</div></div>`).join('')}</div>`
      : `<div style="padding:28px 8px;text-align:center"><h3>No installed repositories</h3><p class="muted">Install Artifact Lens on one or more repositories, then refresh this list.</p>${installButton}</div>`;
    const configureHint = canInstall
      ? `<div class="repo-config-hint muted">Missing a repository? <button class="link-button" onclick="openInstallPopup()">Configure the GitHub App installation</button> to add or remove repositories.</div>`
      : shared
        ? `<div class="repo-config-hint muted">This anonymous link only exposes the repository and content included by the person who shared it.</div>`
        : '';
    const manual = shared ? '' : `<div style="margin:16px 0"><input placeholder="owner/repository" onkeydown="if(event.key==='Enter')pickRepo(this.value)"></div>`;

    app.innerHTML = `<div class="row"><div><h2 style="margin:0">${shared ? 'Shared repository' : 'Repositories'}</h2><div class="muted">${shared ? 'Repository available through this share link.' : 'Repositories available through your GitHub App installations.'}</div></div><div class="actions"><button onclick="refreshCurrent()">Refresh</button>${installButton}</div></div>${manual}${list}${configureHint}`;
    return repos;
  } catch (e) {
    err.textContent = e.message;
  }
}

window.openInstallPopup = function () {
  const width = Math.min(960, screen.availWidth - 40);
  const height = Math.min(820, screen.availHeight - 80);
  const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
  const popup = window.open('/api/auth/install', 'artifactLensGitHubInstall', `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
  if (!popup) {
    err.textContent = 'The GitHub installation popup was blocked by your browser. Allow popups for this site and try again.';
    return;
  }
  popup.focus();
  const timer = setInterval(() => {
    if (popup.closed) {
      clearInterval(timer);
      showRepos({ replace: true });
    }
  }, 700);
};

window.pickRepo = async function (repo, opt = {}) {
  repo = String(repo).trim();
  if (!/^[^/]+\/[^/]+$/.test(repo)) return;
  closeLightbox();
  closeShareDialog();
  S = { repo, branch: null, run: null, artifact: null };
  if (!opt.preserveRoute) setRoute(opt.replace);
  app.innerHTML = '<div class="muted">Finding branches with artifacts…</div>';
  try {
    const rows = await api('/api/repo/branches?repo=' + encodeURIComponent(repo));
    app.innerHTML = crumbs() + `<div class="row"><h2>Branches with artifacts</h2>${viewActions()}</div><div class="grid">${rows.map((b) => `<div class="branch" onclick="pickBranchEncoded('${enc(b.branch)}')"><div class="row"><strong>${esc(b.branch)}</strong><span class="badge">${b.count} artifacts</span></div><div class="muted" style="margin-top:8px">Last artifact ${ago(b.updated_at)}</div></div>`).join('') || '<div class="muted">No artifacts found.</div>'}</div>`;
    return rows;
  } catch (e) {
    err.textContent = e.message;
  }
};

window.pickBranch = async function (branch, opt = {}) {
  closeLightbox();
  closeShareDialog();
  S.branch = String(branch);
  S.run = null;
  S.artifact = null;
  if (!opt.preserveRoute) setRoute(opt.replace);
  app.innerHTML = '<div class="muted">Loading workflow runs…</div>';
  try {
    const runs = await api('/api/repo/runs?repo=' + encodeURIComponent(S.repo) + '&branch=' + encodeURIComponent(S.branch));
    app.innerHTML = crumbs() + `<div class="row"><h2>Runs</h2>${viewActions()}</div><div class="grid">${runs.map((r) => { const status = r.conclusion || r.status; return `<div class="run" onclick="pickRunEncoded('${pack(r)}')"><div class="row"><strong>${esc(r.name)}</strong><span class="badge ${statusClass(status)}">${esc(status)}</span></div><div class="muted" style="margin-top:8px">${ago(r.updated_at)} · ${r.artifacts.length} artifact${r.artifacts.length !== 1 ? 's' : ''}</div><div class="muted" style="margin-top:6px;font-size:12px">${esc(r.head_sha.slice(0, 8))}</div></div>`; }).join('') || '<div class="muted">No artifact-bearing runs found.</div>'}</div>`;
    return runs;
  } catch (e) {
    err.textContent = e.message;
  }
};

window.pickRun = function (run, opt = {}) {
  closeLightbox();
  closeShareDialog();
  S.run = run;
  S.artifact = null;
  if (!opt.preserveRoute) setRoute(opt.replace);
  app.innerHTML = crumbs() + `<div class="row"><h2>${esc(run.name)}</h2>${viewActions()}</div><div class="grid">${run.artifacts.map((a) => `<div class="artifact" onclick="pickArtifactEncoded('${pack(a)}')"><strong>${esc(a.name)}</strong><div class="muted" style="margin-top:8px">${(a.size_in_bytes / 1048576).toFixed(1)} MB · ${ago(a.updated_at)}</div></div>`).join('')}</div>`;
};

function artifactFileUrl(id, name, download = false) {
  const base = `/api/repo/artifact?repo=${encodeURIComponent(S.repo)}&id=${encodeURIComponent(id)}&file=${encodeURIComponent(name)}`;
  return download ? `${base}&download=1` : base;
}

window.pickArtifact = async function (artifact, opt = {}) {
  closeLightbox();
  closeShareDialog();
  S.artifact = typeof artifact === 'object' ? artifact : { id: String(artifact), name: `Artifact ${artifact}` };
  if (!opt.preserveRoute) setRoute(opt.replace);
  app.innerHTML = crumbs() + `<h2>${esc(S.artifact.name)}</h2><div class="muted">Inspecting artifact…</div>`;
  try {
    const id = S.artifact.id;
    const files = await api(`/api/repo/artifact?repo=${encodeURIComponent(S.repo)}&id=${encodeURIComponent(id)}`);
    const media = files.filter((x) => x.media);
    const other = files.filter((x) => !x.media);
    currentImages = media.filter((x) => x.mime.startsWith('image/')).map((f) => ({ name: f.name, url: artifactFileUrl(id, f.name) }));
    const otherFiles = other.length
      ? `<h3>Other files</h3><div class="grid">${other.map((f) => `<div class="artifact other-file"><div><strong>${esc(f.name)}</strong><div class="muted" style="margin-top:6px">${Math.round(f.size / 1024)} KB</div></div><a class="download-button" href="${artifactFileUrl(id, f.name, true)}" download>Download</a></div>`).join('')}</div>`
      : '';
    app.innerHTML = crumbs() + `<div class="row"><h2>${esc(S.artifact.name)}</h2>${viewActions()}</div><div class="media">${media.map((f) => renderMedia(id, f)).join('') || '<div class="muted">No embeddable media detected.</div>'}</div>${otherFiles}`;
    return files;
  } catch (e) {
    err.textContent = e.message;
  }
};

function renderMedia(id, f) {
  const url = artifactFileUrl(id, f.name);
  let body = '';
  if (f.mime.startsWith('image/')) body = `<img loading="lazy" src="${url}" alt="${esc(f.name)}" onclick="openLightbox(${currentImages.findIndex((x) => x.name === f.name)})">`;
  else if (f.mime.startsWith('video/')) body = `<video controls preload="metadata" src="${url}"></video>`;
  else if (f.mime.startsWith('audio/')) body = `<audio controls preload="metadata" src="${url}"></audio>`;
  else if (f.mime === 'application/pdf') body = `<iframe src="${url}" title="${esc(f.name)}"></iframe>`;
  return `<figure>${body}<figcaption>${esc(f.name)}</figcaption></figure>`;
}

window.openLightbox = function (index) {
  if (!currentImages.length || index < 0) return;
  lightboxIndex = index;
  renderLightbox();
  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

function renderLightbox() {
  const image = currentImages[lightboxIndex];
  if (!image) return;
  lightboxImage.src = image.url;
  lightboxImage.alt = image.name;
  lightboxMeta.innerHTML = `${esc(image.name)}<span class="lightbox-counter">${lightboxIndex + 1} / ${currentImages.length}</span>`;
  const multiple = currentImages.length > 1;
  lightboxPrev.style.display = multiple ? '' : 'none';
  lightboxNext.style.display = multiple ? '' : 'none';
}

window.lightboxStep = function (delta) {
  if (currentImages.length < 2) return;
  lightboxIndex = (lightboxIndex + delta + currentImages.length) % currentImages.length;
  renderLightbox();
};

window.closeLightbox = function () {
  lightbox.classList.add('hidden');
  lightboxImage.removeAttribute('src');
  document.body.style.overflow = '';
};

function availableShareScopes() {
  const scopes = [];
  if (S.artifact) scopes.push(['artifact', 'This artifact']);
  if (S.run) scopes.push(['run', 'This workflow run']);
  if (S.branch) scopes.push(['branch', 'This branch']);
  if (S.repo) scopes.push(['repository', 'Entire repository']);
  return scopes;
}

window.openShareDialog = function () {
  if (viewerMode !== 'user' || !S.repo) return;
  const scopes = availableShareScopes();
  shareScope.innerHTML = scopes.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  shareExpiry.value = '7';
  shareUrl.value = '';
  shareResult.classList.add('hidden');
  shareCreate.disabled = false;
  shareCreate.textContent = 'Create link';
  shareModal.classList.remove('hidden');
};

window.closeShareDialog = function () {
  if (!shareModal) return;
  shareModal.classList.add('hidden');
};

window.createShareLink = async function () {
  if (viewerMode !== 'user' || !S.repo) return;
  shareCreate.disabled = true;
  shareCreate.textContent = 'Creating…';
  try {
    const data = await api('/api/share/create', {
      method: 'POST',
      body: JSON.stringify({
        repo: S.repo,
        scope: shareScope.value,
        branch: S.branch,
        run_id: S.run?.id || null,
        artifact_id: S.artifact?.id || null,
        expires: shareExpiry.value,
      }),
    });
    shareUrl.value = data.url;
    shareResult.classList.remove('hidden');
    shareCreate.textContent = 'Create another link';
  } catch (e) {
    err.textContent = e.message;
    shareCreate.textContent = 'Create link';
  } finally {
    shareCreate.disabled = false;
  }
};

window.copyShareLink = async function () {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    const btn = document.querySelector('#shareCopy');
    if (btn) {
      const old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = old; }, 1200);
    }
  } catch {
    shareUrl.focus();
    shareUrl.select();
    document.execCommand('copy');
  }
};

lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => lightboxStep(-1));
lightboxNext.addEventListener('click', () => lightboxStep(1));
shareModal.addEventListener('click', (e) => { if (e.target === shareModal) closeShareDialog(); });
shareModal.querySelector('.share-close').addEventListener('click', closeShareDialog);
document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('hidden')) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lightboxStep(-1);
    if (e.key === 'ArrowRight') lightboxStep(1);
    return;
  }
  if (!shareModal.classList.contains('hidden') && e.key === 'Escape') closeShareDialog();
});

function crumbs() {
  return `<div class="crumbs"><button onclick="showRepos()">Repositories</button>${S.repo ? `<button onclick="pickRepoEncoded('${enc(S.repo)}')">${esc(S.repo)}</button>` : ''}${S.branch ? `<button onclick="pickBranchEncoded('${enc(S.branch)}')">${esc(S.branch)}</button>` : ''}${S.run ? `<button onclick="pickRunEncoded('${pack(S.run)}')">Run #${S.run.id}</button>` : ''}${S.artifact ? `<button onclick="pickArtifactEncoded('${pack(S.artifact)}')">${esc(S.artifact.name)}</button>` : ''}</div>`;
}

window.refreshCurrent = async function () {
  const artifact = S.artifact;
  const run = S.run;
  const branch = S.branch;
  const repo = S.repo;
  if (artifact) return pickArtifact(artifact, { preserveRoute: true });
  if (run) {
    const runs = await pickBranch(branch, { preserveRoute: true });
    const fresh = (runs || []).find((x) => String(x.id) === String(run.id));
    if (fresh) return pickRun(fresh, { preserveRoute: true });
  }
  if (branch) return pickBranch(branch, { preserveRoute: true });
  if (repo) return pickRepo(repo, { preserveRoute: true });
  return showRepos({ preserveRoute: true });
};

async function restoreFromRoute() {
  const route = parseRoute();
  if (!route.repo) return showRepos({ replace: true });
  navigatingHistory = true;
  try {
    await pickRepo(route.repo, { preserveRoute: true });
    if (!route.branch) return;
    const runs = await pickBranch(route.branch, { preserveRoute: true });
    if (!route.runId) return;
    const run = (runs || []).find((x) => String(x.id) === String(route.runId));
    if (!run) throw new Error(`Workflow run ${route.runId} was not found on branch ${route.branch}.`);
    pickRun(run, { preserveRoute: true });
    if (!route.artifactId) return;
    const artifact = run.artifacts.find((x) => String(x.id) === String(route.artifactId));
    if (!artifact) throw new Error(`Artifact ${route.artifactId} was not found in run ${route.runId}.`);
    await pickArtifact(artifact, { preserveRoute: true });
  } catch (e) {
    err.textContent = e.message;
  } finally {
    navigatingHistory = false;
  }
}

window.addEventListener('popstate', () => restoreFromRoute());
window.showRepos = showRepos;
boot();
