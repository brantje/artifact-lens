(() => {
  const originalPickRepo = window.pickRepo;
  let currentRepoSettings = null;

  function publicIconHtml(enabled) {
    return `<div class="repo-public-icon ${enabled ? 'is-on' : ''}" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/>
        <path d="M3.6 9h16.8M3.6 15h16.8M12 3c2.2 2.46 3.33 5.46 3.4 9-.07 3.54-1.2 6.54-3.4 9-2.2-2.46-3.33-5.46-3.4-9 .07-3.54 1.2-6.54 3.4-9Z"/>
      </svg>
    </div>`;
  }

  function switchHtml(settings, enabled) {
    const checked = enabled ? 'true' : 'false';
    if (!settings.store_configured) {
      return `<div class="repo-public-control" title="Connect Upstash Redis in Vercel to enable this setting">
        <span class="repo-public-control-label muted">Unavailable</span>
        <button class="repo-public-switch" type="button" role="switch" aria-checked="false" aria-label="Public artifact URLs" disabled><span></span></button>
      </div>`;
    }
    if (!settings.can_manage) {
      return `<div class="repo-public-control" title="Repository admin access is required">
        <span class="repo-public-control-label muted">Admin only</span>
        <button class="repo-public-switch ${enabled ? 'is-on' : ''}" type="button" role="switch" aria-checked="${checked}" aria-label="Public artifact URLs" disabled><span></span></button>
      </div>`;
    }
    return `<div class="repo-public-control">
      <span class="repo-public-control-label">${enabled ? 'On' : 'Off'}</span>
      <button id="repoPublicToggle" class="repo-public-switch ${enabled ? 'is-on' : ''}" type="button" role="switch" aria-checked="${checked}" aria-label="Toggle public artifact URLs" onclick="toggleRepoPublicArtifacts()"><span></span></button>
    </div>`;
  }

  function settingsPanelHtml(settings) {
    const enabled = Boolean(settings.public_artifacts);
    const stateLabel = enabled ? 'Public by URL' : 'Protected';
    const summary = enabled
      ? 'Anyone with an artifact URL can open and download that artifact without signing in.'
      : 'Artifact URLs require sign-in or an explicit share link.';
    const privateWarning = settings.private && enabled
      ? '<div class="repo-public-warning"><strong>Private repository</strong><span>Artifact files are accessible without GitHub authentication while this is enabled.</span></div>'
      : '';
    const storeHint = settings.store_configured
      ? ''
      : '<div class="repo-public-store-hint">Connect Upstash Redis to this Vercel project to save repository-level sharing preferences.</div>';

    return `<div class="repo-public-main ${enabled ? 'is-on' : ''}">
      ${publicIconHtml(enabled)}
      <div class="repo-public-copy">
        <div class="repo-public-title-row"><strong>Public artifact URLs</strong><span class="repo-public-state ${enabled ? 'is-on' : ''}">${stateLabel}</span></div>
        <div class="repo-public-summary">${summary}</div>
        <div class="repo-public-detail">Repository, branch, and run pages stay private.</div>
        ${privateWarning}
      </div>
      ${switchHtml(settings, enabled)}
    </div>${storeHint}`;
  }

  async function renderRepoSettings(repo) {
    if (viewerMode !== 'user' || S.repo !== repo) return;
    const panel = document.querySelector('#repoPublicSettings');
    if (!panel) return;

    panel.innerHTML = '<div class="repo-public-loading"><span class="repo-public-loading-dot"></span><span class="muted">Loading repository sharing…</span></div>';
    try {
      const settings = await api('/api/repo/settings?repo=' + encodeURIComponent(repo));
      if (viewerMode !== 'user' || S.repo !== repo || !document.querySelector('#repoPublicSettings')) return;
      currentRepoSettings = settings;
      document.querySelector('#repoPublicSettings').innerHTML = settingsPanelHtml(settings);
    } catch (e) {
      if (e.message !== 'AUTH' && document.querySelector('#repoPublicSettings')) {
        document.querySelector('#repoPublicSettings').innerHTML = `<div class="repo-public-error">${esc(e.message)}</div>`;
      }
    }
  }

  window.pickRepo = async function (repo, opt = {}) {
    const normalizedRepo = String(repo).trim();
    currentRepoSettings = null;
    const rows = await originalPickRepo(normalizedRepo, opt);
    if (viewerMode === 'user' && S.repo === normalizedRepo && app.innerHTML) {
      let panel = document.querySelector('#repoPublicSettings');
      if (!panel) {
        panel = document.createElement('section');
        panel.id = 'repoPublicSettings';
        panel.className = 'repo-public-setting';
      }
      const grid = app.querySelector(':scope > .grid');
      if (grid) app.insertBefore(panel, grid);
      else app.appendChild(panel);
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
      button.classList.add('is-busy');
      button.setAttribute('aria-busy', 'true');
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
        button.classList.remove('is-busy');
        button.removeAttribute('aria-busy');
      }
    }
  };
})();
