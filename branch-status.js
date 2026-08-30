(() => {
  const originalPickRepo = window.pickRepo;
  const PLANNED_STATUSES = new Set(['queued', 'requested', 'waiting', 'pending']);

  function activeRunState(run) {
    if (!run) return null;
    if (PLANNED_STATUSES.has(run.status)) {
      return {
        label: 'Planned run',
        color: '#f2cf82',
        border: '#6b5528',
        background: '#251d0c',
      };
    }
    if (run.status === 'in_progress') {
      return {
        label: 'Running',
        color: '#9ec8ff',
        border: '#365a80',
        background: '#122238',
      };
    }
    return null;
  }

  function decorateBranchCards(rows) {
    if (!Array.isArray(rows)) return;
    const byBranch = new Map(rows.map((row) => [String(row.branch), row]));

    document.querySelectorAll('#app .branch').forEach((card) => {
      const name = card.querySelector(':scope > .row strong')?.textContent || '';
      const row = byBranch.get(name);
      const state = activeRunState(row?.active_run);
      if (!state || card.querySelector('.branch-active-run')) return;

      const heading = card.querySelector(':scope > .row');
      const artifactBadge = heading?.querySelector('.badge');
      if (heading) {
        const badge = document.createElement('span');
        badge.className = 'badge branch-active-run';
        badge.textContent = state.label === 'Running' ? 'Running' : 'Planned';
        badge.style.color = state.color;
        badge.style.borderColor = state.border;
        badge.style.background = state.background;
        if (artifactBadge) heading.insertBefore(badge, artifactBadge);
        else heading.appendChild(badge);
      }

      const lastArtifact = card.querySelector(':scope > .muted');
      const activity = document.createElement('div');
      activity.className = 'muted branch-active-run';
      activity.style.marginTop = '8px';
      activity.innerHTML = `<span style="color:${state.color};font-weight:650">${state.label}</span> · ${ago(row.active_run.updated_at)}`;
      if (lastArtifact) card.insertBefore(activity, lastArtifact);
      else card.appendChild(activity);
    });
  }

  window.pickRepo = async function (repo, opt = {}) {
    const rows = await originalPickRepo(repo, opt);
    decorateBranchCards(rows);
    return rows;
  };
})();
