(() => {
  const originalPickRepo = window.pickRepo;
  let currentRepoSettings = null;

  function settingsPanelHtml(settings) {
    const enabled = Boolean(settings.public_artifacts);
    const status = enabled ? '<span class="badge success">On</span>' : '<span class="badge">Off</span>';
    const privateWarning = settings.private
      ? '<div class="repo-public-warning">This repository is private. Enabling this makes artifact contents accessible to anyone who has a canonical Artifact Lens artifact URL.</div>'
      : '';

    let action = '';
    if (!settings.store_configured) {
      action = '<button disabled title="Configure Upstash Redis first">Unavailable</button>';
    } else if (!settings.can_manage) {
      action = '<span class="muted repo-public-permission">Repository admin access is required to change this.</span>';
    } else {
      action = `<button id="repoPublicToggle" class="${enabled ? '' : 'primary'}" onclick="toggleRepoPublicArtifacts()">${enabled ? 'Disable' : 'Enable'}</button>`;
    }

    const storeHint = settings.store_configured
      ? ''
      : '<div class="muted repo-public-store-hint">Persistent repository settings need Upstash Redis configured on the Vercel project.</div>';

    return `<div class="row repo-public-heading"><div><strong>Public artifact URLs</strong><div class="muted repo-public-summary">Anyone with a canonical <code>/repo/.../run/.../artifact/...</code> URL can view that artifact without signing in. Repository, branch, and run indexes are not made public.</div></div><div class="repo-public-actions">${status}${action}</div></div>${privateWarning}${storeHint}`;
  }

  async function renderRepoSettings(repo) {
    if (viewerMode !== 'user' || S.repo !== repo) return;
    const panel = document.querySelector('#repoPublicSettings');
    if (!panel) return;

    panel.innerHTML = '<div class="muted">Loading public URL setting…</div>';
    try {
      const settings = await api('/api/repo/settings?repo=' + encodeURIComponent(repo));
      if (viewerMode !== 'user' || S.repo !== repo || !document.querySelector('#repoPublicSettings')) return;
      currentRepoSettings = settings;
      document.querySelector('#repoPublicSettings').innerHTML = settingsPanelHtml(settings);
    } catch (e) {
      if (e.message !== 'AUTH' && document.querySelector('#repoPublicSettings')) {
        document.querySelector('#repoPublicSettings').innerHTML = `<div class="error">${esc(e.message)}</div>`;
      }
    }
  }

  window.pickRepo = async function (repo, opt = {}) {
    const normalizedRepo = String(repo).trim();
    const rows = await originalPickRepo(normalizedRepo, opt);
    if (viewerMode === 'user' && S.repo === normalizedRepo && app.innerHTML) {
      let panel = document.querySelector('#repoPublicSettings');
      if (!panel) {
        panel = document.createElement('section');
        panel.id = 'repoPublicSettings';
        panel.className = 'repo-public-setting';
        app.appendChild(panel);
      }
      await renderRepoSettings(normalizedRepo);
    }
    return rows;
  };

  window.toggleRepoPublicArtifacts = async function () {
    if (viewerMode !== 'user' || !S.repo || !currentRepoSettings?.can_manage || !currentRepoSettings?.store_configured) return;

    const enable = !currentRepoSettings.public_artifacts;
    if (enable) {
      const privateNote = currentRepoSettings.private
        ? '\n\nThis is a private repository. Artifact files will become accessible without GitHub authentication.'
        : '';
      const ok = window.confirm(`Enable public artifact URLs for ${S.repo}?\n\nAnyone with a canonical Artifact Lens artifact URL for this repository will be able to view and download that artifact without signing in.${privateNote}`);
      if (!ok) return;
    }

    const button = document.querySelector('#repoPublicToggle');
    if (button) {
      button.disabled = true;
      button.textContent = enable ? 'Enabling…' : 'Disabling…';
    }

    try {
      const settings = await api('/api/repo/settings', {
        method: 'POST',
        body: JSON.stringify({ repo: S.repo, public_artifacts: enable }),
      });
      currentRepoSettings = settings;
      const panel = document.querySelector('#repoPublicSettings');
      if (panel) panel.innerHTML = settingsPanelHtml(settings);
    } catch (e) {
      err.textContent = e.message;
      if (button) {
        button.disabled = false;
        button.textContent = enable ? 'Enable' : 'Disable';
      }
    }
  };
})();
