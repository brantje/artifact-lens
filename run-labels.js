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
    return `Run #${run.run_number ?? run.id}`;
  }

  function decorateRunCards() {
    document.querySelectorAll('#app .run').forEach((card) => {
      if (card.dataset.runLabels === '1') return;
      const run = runFromHandler(card.getAttribute('onclick'));
      if (!run) return;

      const row = card.querySelector(':scope > .row');
      const title = row?.querySelector('strong');
      if (title) title.textContent = runTitle(run);

      if (row) {
        const workflow = document.createElement('div');
        workflow.textContent = run.name || 'Workflow';
        workflow.style.marginTop = '8px';
        row.insertAdjacentElement('afterend', workflow);
      }

      const metadata = card.querySelectorAll(':scope > .muted');
      if (metadata[0] && run.head_branch) {
        metadata[0].textContent = `${run.head_branch} · ${metadata[0].textContent}`;
      }

      card.dataset.runLabels = '1';
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
        button.textContent = runTitle(parsed);
      }
    });

    if (!run || hasArtifact) return;
    const headingRow = crumbs.nextElementSibling;
    if (!headingRow?.classList.contains('row') || headingRow.dataset.runLabels === '1') return;
    const heading = headingRow.querySelector(':scope > h2');
    if (!heading) return;

    const group = document.createElement('div');
    const workflow = document.createElement('div');
    const branch = document.createElement('div');

    heading.textContent = runTitle(run);
    workflow.textContent = run.name || 'Workflow';
    workflow.style.marginTop = '4px';
    branch.className = 'muted';
    branch.style.marginTop = '4px';
    branch.style.fontSize = '13px';
    branch.textContent = run.head_branch || '';

    headingRow.insertBefore(group, heading);
    group.appendChild(heading);
    group.appendChild(workflow);
    if (run.head_branch) group.appendChild(branch);
    headingRow.dataset.runLabels = '1';
  }

  function decorate() {
    decorateRunCards();
    decorateRunBreadcrumbsAndDetail();
  }

  const observer = new MutationObserver(decorate);
  observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
  decorate();
})();
