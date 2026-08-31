(() => {
  const baseCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const tieBreaker = new Intl.Collator(undefined, { numeric: true, sensitivity: 'variant' });

  function artifactFileName(file) {
    return String(file?.name || '');
  }

  function compareArtifactFiles(a, b) {
    const left = artifactFileName(a);
    const right = artifactFileName(b);
    return baseCollator.compare(left, right) || tieBreaker.compare(left, right);
  }

  window.sortArtifactFiles = function (files) {
    return Array.isArray(files) ? [...files].sort(compareArtifactFiles) : files;
  };

  const previousPickArtifact = window.pickArtifact;
  if (typeof previousPickArtifact !== 'function') return;

  window.pickArtifact = async function (...args) {
    const files = await previousPickArtifact.apply(this, args);
    if (!Array.isArray(files)) return files;

    const ordered = window.sortArtifactFiles(files);
    files.splice(0, files.length, ...ordered);
    return files;
  };
})();
