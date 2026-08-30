(() => {
  const PLANNED_STATUSES = new Set(['queued', 'requested', 'waiting', 'pending']);

  function runFromHandler(value) {
    const match = String(value || '').match(/pickRunEncoded\('([^']+)'\)/);
    if (!match) return null;
    try {
      return JSON.parse(decodeURIComponent(match[1]));
    } catch {
      return null;
    }
  }

  function runTitle(run) {
    return `Run #${run.id}`;
  }

  function runState(run) {
    const status = String(run.conclusion || run.status || 'unknown');
    if (run.planned || PLANNED_STATUSES.has(status)) return { label: 'Planned', kind: 'planned' };
    if (status === 'in_progress') return { label: 'Running', kind: 'running' };
    return { label: status.replaceAll('_', ' '), kind: status };
  }

  function styleStatusBadge(badge, state) {
    if (!badge) return;
    badge.textContent = state.label;
    if (state.kind === 'planned') {
      badge.style.color = '#f2cf82';
      badge.style.borderColor = '#6b5528';
      badge.style.background = '#251d0c';
    } else if (state.kind === 'running') {
      badge.style.color = '#9ec8ff';
      badge.style.borderColor = '#365a80';
      badge.style.background = '#122238';
    }
  }

  function decorateRunCards() {
    document.querySelectorAll('#app .run').forEach((card) => {
      if (card.dataset.runLabels === '1') return;
      const run = runFromHandler(card.getAttribute('onclick'));
      if (!run) return;

      card.dataset.runLabels = '1';

      const row = card.querySelector(':scope > .row');
      const title = row?.querySelector('strong');
      if (title) title.textContent = runTitle(run);
      styleStatusBadge(row?.querySelector('.badge'), runState(run));

      if (row) {
        let anchor = row;
        if (run.commit_message) {
          const commit = document.createElement('div');
          commit.className = 'run-commit-message';
          commit.textContent = run.commit_message;
          commit.style.marginTop = '8px';
          commit.style.fontWeight = '600';
          anchor.insertAdjacentElement('afterend', commit);
          anchor = commit;
        }

        const workflow = document.createElement('div');
        workflow.className = 'run-workflow-name';
        workflow.textContent = run.name || 'Workflow';
        workflow.style.marginTop = run.commit_message ? '5px' : '8px';
        anchor.insertAdjacentElement('afterend', workflow);
      }

      const metadata = card.querySelectorAll(':scope > .muted');
      if (metadata[0]) {
        if (run.active && !(run.artifacts || []).length) {
          const state = runState(run);
          const branch = run.head_branch ? `${run.head_branch} · ` : '';
          metadata[0].textContent = `${branch}${state.label} · updated ${ago(run.updated_at)} · no artifacts yet`;
        } else if (run.head_branch) {
          metadata[0].textContent = `${run.head_branch} · ${metadata[0].textContent}`;
        }
      }
    });
  }

  function decorateRunBreadcrumbsAndDetail() {
    const crumbs = document.querySelector('#app > .crumbs');
    if (!crumbs) return;

    let run = null;
    let hasArtifact = false;
    crumbs.querySelectorAll('button').forEach((button) => {
      const handler = button.getAttribute('onclick') || '';
      if (handler.includes('pickArtifactEncoded(')) hasArtifact = true;
      const parsed = runFromHandler(handler);
      if (parsed) {
        run = parsed;
        const title = runTitle(parsed);
        if (button.textContent !== title) button.textContent = title;
      }
    });

    if (!run || hasArtifact) return;
    const headingRow = crumbs.nextElementSibling;
    if (!headingRow?.classList.contains('row') || headingRow.dataset.runLabels === '1') return;
    const heading = headingRow.querySelector(':scope > h2');
    if (!heading) return;

    headingRow.dataset.runLabels = '1';

    const group = document.createElement('div');
    const workflow = document.createElement('div');
    const branch = document.createElement('div');

    heading.textContent = runTitle(run);
    headingRow.insertBefore(group, heading);
    group.appendChild(heading);

    if (run.active) {
      const state = runState(run);
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.display = 'inline-block';
      badge.style.marginTop = '4px';
      styleStatusBadge(badge, state);
      group.appendChild(badge);
    }

    if (run.commit_message) {
      const commit = document.createElement('div');
      commit.className = 'run-commit-message';
      commit.textContent = run.commit_message;
      commit.style.marginTop = '4px';
      commit.style.fontWeight = '600';
      group.appendChild(commit);
    }

    workflow.className = 'run-workflow-name';
    workflow.textContent = run.name || 'Workflow';
    workflow.style.marginTop = '4px';
    group.appendChild(workflow);

    branch.className = 'muted';
    branch.style.marginTop = '4px';
    branch.style.fontSize = '13px';
    branch.textContent = run.head_branch || '';
    if (run.head_branch) group.appendChild(branch);

    if (run.active && !(run.artifacts || []).length) {
      const grid = headingRow.nextElementSibling;
      if (grid?.classList.contains('grid') && !grid.children.length) {
        const state = runState(run);
        const pending = document.createElement('div');
        pending.className = 'security-note';
        pending.style.gridColumn = '1 / -1';
        pending.innerHTML = `<strong>${state.label} run</strong><div class="muted" style="margin-top:5px">No artifacts have been published yet. They will appear here as soon as the workflow uploads them.</div>`;
        grid.appendChild(pending);
      }
    }
  }

  function decorate() {
    decorateRunCards();
    decorateRunBreadcrumbsAndDetail();
  }

  const observer = new MutationObserver(decorate);
  observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
  decorate();
})();
