window.LDD = window.LDD || {};

// Interactive crop-region picker shown before PDF export, so the user can
// guarantee the exported image doesn't cut off part of the traced plot.
// Sits as an overlay on top of #canvasWrapper and intercepts all pointer
// events there while active, so it never interferes with normal canvas
// editing (node placement, pan, zoom).
LDD.cropTool = (function () {
  const overlay = document.getElementById('cropOverlay');
  const maskTop = document.getElementById('cropMaskTop');
  const maskBottom = document.getElementById('cropMaskBottom');
  const maskLeft = document.getElementById('cropMaskLeft');
  const maskRight = document.getElementById('cropMaskRight');
  const box = document.getElementById('cropBox');
  const btnConfirm = document.getElementById('btnCropConfirm');
  const btnCancel = document.getElementById('btnCropCancel');
  const btnReset = document.getElementById('btnCropReset');

  const MIN_SIZE = 30;
  let bounds = null;
  let rect = null;
  let defaultRect = null;
  let dragState = null;
  let resolveFn = null;

  function clampRect(r) {
    let w = Math.max(MIN_SIZE, Math.min(r.w, bounds.w));
    let h = Math.max(MIN_SIZE, Math.min(r.h, bounds.h));
    let x = Math.min(Math.max(r.x, 0), bounds.w - w);
    let y = Math.min(Math.max(r.y, 0), bounds.h - h);
    return { x, y, w, h };
  }

  function applyRectToDOM() {
    box.style.left = rect.x + 'px';
    box.style.top = rect.y + 'px';
    box.style.width = rect.w + 'px';
    box.style.height = rect.h + 'px';

    const top = rect.y, bottom = rect.y + rect.h, left = rect.x, right = rect.x + rect.w;
    maskTop.style.left = '0'; maskTop.style.top = '0'; maskTop.style.width = '100%'; maskTop.style.height = top + 'px';
    maskBottom.style.left = '0'; maskBottom.style.top = bottom + 'px'; maskBottom.style.width = '100%'; maskBottom.style.height = Math.max(0, bounds.h - bottom) + 'px';
    maskLeft.style.left = '0'; maskLeft.style.top = top + 'px'; maskLeft.style.width = left + 'px'; maskLeft.style.height = (bottom - top) + 'px';
    maskRight.style.left = right + 'px'; maskRight.style.top = top + 'px'; maskRight.style.width = Math.max(0, bounds.w - right) + 'px'; maskRight.style.height = (bottom - top) + 'px';
  }

  function setRect(r) {
    rect = clampRect(r);
    applyRectToDOM();
  }

  function onPointerDown(e, mode) {
    e.preventDefault();
    e.stopPropagation();
    dragState = { mode, startX: e.clientX, startY: e.clientY, startRect: Object.assign({}, rect) };
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const s = dragState.startRect;
    let next;
    if (dragState.mode === 'move') {
      next = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
    } else {
      next = Object.assign({}, s);
      if (dragState.mode.indexOf('n') >= 0) { next.y = s.y + dy; next.h = s.h - dy; }
      if (dragState.mode.indexOf('s') >= 0) { next.h = s.h + dy; }
      if (dragState.mode.indexOf('w') >= 0) { next.x = s.x + dx; next.w = s.w - dx; }
      if (dragState.mode.indexOf('e') >= 0) { next.w = s.w + dx; }
      if (next.w < MIN_SIZE) { if (dragState.mode.indexOf('w') >= 0) next.x = s.x + s.w - MIN_SIZE; next.w = MIN_SIZE; }
      if (next.h < MIN_SIZE) { if (dragState.mode.indexOf('n') >= 0) next.y = s.y + s.h - MIN_SIZE; next.h = MIN_SIZE; }
    }
    setRect(next);
  }

  function onPointerUp() {
    dragState = null;
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
  }

  box.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('crop-handle')) return;
    onPointerDown(e, 'move');
  });
  Array.prototype.forEach.call(box.querySelectorAll('.crop-handle'), (h) => {
    h.addEventListener('mousedown', (e) => onPointerDown(e, h.dataset.handle));
  });

  function cleanupAndResolve(value) {
    overlay.classList.remove('active');
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    dragState = null;
    const r = resolveFn;
    resolveFn = null;
    if (r) r(value);
  }

  btnConfirm.addEventListener('click', () => cleanupAndResolve(Object.assign({}, rect)));
  btnCancel.addEventListener('click', () => cleanupAndResolve(null));
  btnReset.addEventListener('click', () => setRect(Object.assign({}, defaultRect)));

  function pick(wrapperEl, initialRect) {
    return new Promise((resolve) => {
      resolveFn = resolve;
      const r = wrapperEl.getBoundingClientRect();
      bounds = { w: r.width, h: r.height };
      defaultRect = clampRect(initialRect);
      setRect(defaultRect);
      overlay.classList.add('active');
    });
  }

  // Suggests a starting crop box around the traced polygon (or the whole
  // image if nothing is traced yet), with a little padding, in CSS px
  // relative to the wrapper. Falls back to the full viewport.
  function computeDefaultRect(state, wrapperEl) {
    const r = wrapperEl.getBoundingClientRect();
    let worldBox = null;
    if (state.nodes.length) {
      const xs = state.nodes.map(n => n.x), ys = state.nodes.map(n => n.y);
      worldBox = { minX: Math.min.apply(null, xs), minY: Math.min.apply(null, ys), maxX: Math.max.apply(null, xs), maxY: Math.max.apply(null, ys) };
    } else if (state.image) {
      worldBox = { minX: 0, minY: 0, maxX: state.image.width, maxY: state.image.height };
    }
    if (!worldBox) return { x: 0, y: 0, w: r.width, h: r.height };

    const p1 = LDD.canvas.worldToScreen(worldBox.minX, worldBox.minY);
    const p2 = LDD.canvas.worldToScreen(worldBox.maxX, worldBox.maxY);
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
    const padX = (maxX - minX) * 0.08 + 16;
    const padY = (maxY - minY) * 0.08 + 16;
    return { x: minX - padX, y: minY - padY, w: (maxX - minX) + padX * 2, h: (maxY - minY) + padY * 2 };
  }

  // Extracts the chosen rect (CSS px) from the live canvas at full device
  // resolution, returning a standalone image ready to embed in the PDF.
  function captureImage(canvasEl, rectCss) {
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.max(0, Math.round(rectCss.x * dpr));
    const sy = Math.max(0, Math.round(rectCss.y * dpr));
    const sw = Math.max(1, Math.min(canvasEl.width - sx, Math.round(rectCss.w * dpr)));
    const sh = Math.max(1, Math.min(canvasEl.height - sy, Math.round(rectCss.h * dpr)));
    const tmp = document.createElement('canvas');
    tmp.width = sw;
    tmp.height = sh;
    tmp.getContext('2d').drawImage(canvasEl, sx, sy, sw, sh, 0, 0, sw, sh);
    return { dataURL: tmp.toDataURL('image/png'), width: sw, height: sh };
  }

  return { pick, computeDefaultRect, captureImage };
})();
