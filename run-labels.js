(() => {
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

  function decorateRunCards() {
    document.querySelectorAll('#app .run').forEach((card) => {
      if (card.dataset.runLabels === '1') return;
      const run = runFromHandler(card.getAttribute('onclick'));
      if (!run) return;

      card.dataset.runLabels = '1';

      const row = card.querySelector(':scope > .row');
      const title = row?.querySelector('strong');
      if (title) title.textContent = runTitle(run);

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
      if (metadata[0] && run.head_branch) {
        metadata[0].textContent = `${run.head_branch} · ${metadata[0].textContent}`;
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
  }

  function decorate() {
    decorateRunCards();
    decorateRunBreadcrumbsAndDetail();
  }

  const observer = new MutationObserver(decorate);
  observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
  decorate();
})();
