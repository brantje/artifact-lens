(() => {
  const STORAGE_KEY = 'artifactLensArtifactSort';
  const MODES = new Set(['name', 'artifact', 'size']);
  const baseCollator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const tieBreaker = new Intl.Collator(undefined, { sensitivity: 'variant' });
  let sortMode = MODES.has(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'name';
  let artifactFiles = [];
  let artifactOrder = new Map();

  function naturalParts(value) {
    return String(value || '').match(/\d+|\D+/g) || [];
  }

  function compareNames(a, b) {
    const left = naturalParts(a);
    const right = naturalParts(b);
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
      if (left[index] === undefined) return -1;
      if (right[index] === undefined) return 1;

      const leftPart = left[index];
      const rightPart = right[index];
      const leftNumber = /^\d+$/.test(leftPart);
      const rightNumber = /^\d+$/.test(rightPart);

      if (leftNumber && rightNumber) {
        const leftValue = BigInt(leftPart);
        const rightValue = BigInt(rightPart);
        if (leftValue < rightValue) return -1;
        if (leftValue > rightValue) return 1;
        if (leftPart.length !== rightPart.length) return leftPart.length - rightPart.length;
        continue;
      }

      if (leftNumber !== rightNumber) {
        const mixed = baseCollator.compare(leftPart, rightPart);
        if (mixed) return mixed;
      } else {
        const compared = baseCollator.compare(leftPart, rightPart) || tieBreaker.compare(leftPart, rightPart);
        if (compared) return compared;
      }
    }

    return tieBreaker.compare(String(a || ''), String(b || ''));
  }

  function normalizeName(value) {
    return String(value || '');
  }

  function rememberFiles(files) {
    artifactFiles = Array.isArray(files) ? [...files] : [];
    artifactOrder = new Map();
    artifactFiles.forEach((file, index) => artifactOrder.set(normalizeName(file?.name), index));
  }

  function fileForName(name) {
    return artifactFiles.find((file) => normalizeName(file?.name) === normalizeName(name));
  }

  function currentFolderPrefix() {
    const parts = location.pathname.split('/').filter(Boolean);
    const pathIndex = parts.indexOf('path');
    if (pathIndex < 0) return '';
    try {
      return parts.slice(pathIndex + 1).map(decodeURIComponent).join('/');
    } catch {
      return '';
    }
  }

  function resolveVisibleFile(label, compact) {
    if (!compact) return fileForName(label);
    const prefix = currentFolderPrefix();
    const full = prefix ? `${prefix}/${label}` : label;
    return fileForName(full);
  }

  function fileSortValue(file) {
    const name = normalizeName(file?.name);
    return {
      name,
      size: Number(file?.size || 0),
      order: artifactOrder.has(name) ? artifactOrder.get(name) : Number.MAX_SAFE_INTEGER,
    };
  }

  function compareFiles(a, b) {
    const left = fileSortValue(a);
    const right = fileSortValue(b);
    if (sortMode === 'artifact') return left.order - right.order;
    if (sortMode === 'size') return (right.size - left.size) || compareNames(left.name, right.name);
    return compareNames(left.name, right.name);
  }

  function folderInfo(path) {
    const prefix = path ? `${path}/` : '';
    const descendants = artifactFiles.filter((file) => normalizeName(file?.name).startsWith(prefix));
    const first = descendants.reduce((min, file) => Math.min(min, artifactOrder.get(normalizeName(file?.name)) ?? Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    const size = descendants.reduce((sum, file) => sum + Number(file?.size || 0), 0);
    const name = path.split('/').filter(Boolean).pop() || path;
    return { path, name, order: first, size };
  }

  function compareFolders(a, b) {
    const left = folderInfo(a);
    const right = folderInfo(b);
    if (sortMode === 'artifact') return left.order - right.order;
    if (sortMode === 'size') return (right.size - left.size) || compareNames(left.name, right.name);
    return compareNames(left.name, right.name);
  }

  function reorder(container, entries, comparator) {
    if (!container || entries.length < 2) return;
    const current = entries.map((entry) => entry.node);
    const sorted = [...entries].sort(comparator).map((entry) => entry.node);
    const changed = sorted.some((node, index) => node !== current[index]);
    if (!changed) return;
    sorted.forEach((node) => container.appendChild(node));
  }

  function sortMedia() {
    document.querySelectorAll('.artifact-file-view .media').forEach((container) => {
      const compact = Boolean(container.closest('.folder-browser'));
      const entries = [...container.children].map((node) => {
        const label = node.querySelector('figcaption')?.textContent?.trim() || '';
        return { node, file: resolveVisibleFile(label, compact) };
      }).filter((entry) => entry.file);
      reorder(container, entries, (a, b) => compareFiles(a.file, b.file));
    });
  }

  function sortOtherFiles() {
    document.querySelectorAll('.artifact-file-view .folder-other-files').forEach((container) => {
      const compact = Boolean(container.closest('.folder-browser'));
      const entries = [...container.children].map((node) => {
        const label = node.querySelector('.file-row-info strong')?.textContent?.trim() || '';
        return { node, file: resolveVisibleFile(label, compact) };
      }).filter((entry) => entry.file);
      reorder(container, entries, (a, b) => compareFiles(a.file, b.file));
    });
  }

  function sortFolders() {
    document.querySelectorAll('.artifact-file-view .folder-list').forEach((container) => {
      const entries = [...container.children].map((node) => {
        const pattern = node.querySelector('.folder-row-pattern')?.textContent?.trim() || '';
        return { node, path: pattern.replace(/\/\*$/, '') };
      }).filter((entry) => entry.path);
      reorder(container, entries, (a, b) => compareFolders(a.path, b.path));
    });
  }

  function sortLabel() {
    if (sortMode === 'artifact') return 'Artifact order';
    if (sortMode === 'size') return 'Size';
    return 'Name';
  }

  function ensureControl() {
    const toolbar = document.querySelector('.artifact-toolbar');
    if (!toolbar || toolbar.querySelector('.artifact-sort-control')) return;
    const label = document.createElement('label');
    label.className = 'artifact-sort-control';
    label.innerHTML = `<span>Sort</span><select aria-label="Sort artifact files">
      <option value="name">Name</option>
      <option value="artifact">Artifact order</option>
      <option value="size">Size</option>
    </select>`;
    const select = label.querySelector('select');
    select.value = sortMode;
    select.title = `Sort by ${sortLabel()}`;
    select.addEventListener('change', () => {
      sortMode = MODES.has(select.value) ? select.value : 'name';
      localStorage.setItem(STORAGE_KEY, sortMode);
      select.title = `Sort by ${sortLabel()}`;
      applySorting();
    });
    toolbar.prepend(label);
  }

  function applySorting() {
    if (!artifactFiles.length || !window.S?.artifact) return;
    ensureControl();
    sortFolders();
    sortMedia();
    sortOtherFiles();
  }

  function deferApply() {
    queueMicrotask(() => requestAnimationFrame(applySorting));
  }

  const previousPickArtifact = window.pickArtifact;
  if (typeof previousPickArtifact === 'function') {
    window.pickArtifact = async function (...args) {
      const files = await previousPickArtifact.apply(this, args);
      if (Array.isArray(files)) rememberFiles(files);
      deferApply();
      return files;
    };
  }

  for (const name of ['setArtifactViewMode', 'openArtifactFolderEncoded']) {
    const previous = window[name];
    if (typeof previous !== 'function') continue;
    window[name] = function (...args) {
      const result = previous.apply(this, args);
      deferApply();
      return result;
    };
  }

  const observer = new MutationObserver(() => {
    if (window.S?.artifact && artifactFiles.length) deferApply();
  });
  observer.observe(document.querySelector('#app'), { childList: true, subtree: true });

  window.setArtifactSortMode = function (mode) {
    if (!MODES.has(mode)) return;
    sortMode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    const select = document.querySelector('.artifact-sort-control select');
    if (select) select.value = mode;
    applySorting();
  };
})();
