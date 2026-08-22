window.LDD = window.LDD || {};

LDD.project = (function () {
  const AUTOSAVE_KEY = 'LDD_autosave_v1';

  function serialize(state) {
    return {
      version: 1,
      projectName: state.projectName,
      imageDataURL: state.imageDataURL || null,
      imageName: state.imageName || '',
      nodes: state.nodes,
      closed: state.closed,
      metersPerPixel: state.metersPerPixel,
      calibrationLine: state.calibrationLine,
      deed: state.deed,
      savedAt: new Date().toISOString()
    };
  }

  function downloadJSON(state) {
    const data = JSON.stringify(serialize(state), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.projectName || 'project') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function autosave(state) {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serialize(state))); }
    catch (e) { console.warn('autosave failed', e); }
  }

  function loadAutosave() {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function hasAutosave() { return !!localStorage.getItem(AUTOSAVE_KEY); }
  function clearAutosave() { localStorage.removeItem(AUTOSAVE_KEY); }

  return { serialize, downloadJSON, autosave, loadAutosave, hasAutosave, clearAutosave };
})();
