window.LDD = window.LDD || {};

LDD.canvas = (function () {
  const state = LDD.state;
  const NODE_HIT_RADIUS = 9;
  const ZOOM_MIN = 0.01, ZOOM_MAX = 50;

  let canvasEl, ctx, wrapperEl;
  let panning = false, panStart = null;
  let draggingNode = false;
  let spaceDown = false;

  const api = { onUpdate: null };

  function notify() { if (api.onUpdate) api.onUpdate(); }

  function worldToScreen(x, y) {
    return { x: x * state.view.zoom + state.view.panX, y: y * state.view.zoom + state.view.panY };
  }
  function screenToWorld(x, y) {
    return { x: (x - state.view.panX) / state.view.zoom, y: (y - state.view.panY) / state.view.zoom };
  }

  function hitTestNode(mx, my) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const s = worldToScreen(state.nodes[i].x, state.nodes[i].y);
      if (Math.hypot(s.x - mx, s.y - my) <= NODE_HIT_RADIUS) return i;
    }
    return -1;
  }

  function render() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = canvasEl.width / dpr, ch = canvasEl.height / dpr;
    ctx.clearRect(0, 0, cw, ch);

    if (state.image) {
      const s = worldToScreen(0, 0);
      ctx.drawImage(state.image, s.x, s.y, state.image.width * state.view.zoom, state.image.height * state.view.zoom);
    }

    if (state.calibrationLine) {
      const a = worldToScreen(state.calibrationLine.p1.x, state.calibrationLine.p1.y);
      const b = worldToScreen(state.calibrationLine.p2.x, state.calibrationLine.p2.y);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#059669';
      ctx.font = '12px Sarabun, sans-serif';
      ctx.fillText(state.calibrationLine.meters + ' ม.', (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6);
    }

    if (state.nodes.length) {
      ctx.beginPath();
      state.nodes.forEach((n, i) => {
        const s = worldToScreen(n.x, n.y);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      if (state.closed) {
        ctx.closePath();
      } else if (state.mode === 'trace' && state.mouseScreen) {
        ctx.lineTo(state.mouseScreen.x, state.mouseScreen.y);
      }
      if (state.closed) { ctx.fillStyle = 'rgba(37,99,235,0.15)'; ctx.fill(); }
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.stroke();

      state.nodes.forEach((n, i) => {
        const s = worldToScreen(n.x, n.y);
        const isFirst = i === 0;
        const isSelected = i === state.selectedNode;
        const closeHint = isFirst && state.mode === 'trace' && state.nodes.length >= 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, closeHint ? 9 : (isSelected ? 7 : 5), 0, Math.PI * 2);
        ctx.fillStyle = closeHint ? '#f59e0b' : (isSelected ? '#ef4444' : '#2563eb');
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    if (state.mode === 'scaleLine' && state.scaleLinePoints.length) {
      const p0 = worldToScreen(state.scaleLinePoints[0].x, state.scaleLinePoints[0].y);
      ctx.beginPath(); ctx.arc(p0.x, p0.y, 6, 0, Math.PI * 2); ctx.fillStyle = '#10b981'; ctx.fill();
      if (state.mouseScreen) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(state.mouseScreen.x, state.mouseScreen.y); ctx.stroke();
        ctx.restore();
      }
    }
  }

  async function finishScaleLine() {
    const [p1, p2] = state.scaleLinePoints;
    const pixelDist = LDD.utils.dist(p1, p2);
    state.scaleLinePoints = [];
    state.mode = 'idle';
    if (pixelDist <= 0) { render(); notify(); return; }
    const meters = await LDD.modal.promptNumber({
      title: 'ระบุระยะจริง',
      label: 'ระยะจริงระหว่าง 2 จุดที่เลือก (หน่วย: เมตร)',
      placeholder: 'เช่น 20'
    });
    if (meters && meters > 0) {
      state.metersPerPixel = meters / pixelDist;
      state.calibrationLine = { p1, p2, meters };
    }
    render();
    notify();
  }

  function onMouseDown(e) {
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    if (e.button === 1 || spaceDown || state.mode === 'pan') {
      e.preventDefault();
      panning = true;
      panStart = { x: mx, y: my, panX: state.view.panX, panY: state.view.panY };
      return;
    }
    if (e.button !== 0) return;

    if (state.mode === 'scaleLine') {
      let world = screenToWorld(mx, my);
      const hit = hitTestNode(mx, my);
      if (hit >= 0) world = { x: state.nodes[hit].x, y: state.nodes[hit].y };
      state.scaleLinePoints.push(world);
      if (state.scaleLinePoints.length === 2) finishScaleLine();
      render();
      return;
    }

    if (state.mode === 'trace') {
      const hit = hitTestNode(mx, my);
      if (hit === 0 && state.nodes.length >= 3) {
        state.closed = true;
        state.mode = 'idle';
        render(); notify();
        return;
      }
      state.nodes.push(screenToWorld(mx, my));
      render(); notify();
      return;
    }

    const hit = hitTestNode(mx, my);
    if (hit >= 0) {
      state.selectedNode = hit;
      draggingNode = true;
    } else {
      state.selectedNode = -1;
    }
    render();
  }

  function onMouseMove(e) {
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    state.mouseScreen = { x: mx, y: my };

    if (panning) {
      state.view.panX = panStart.panX + (mx - panStart.x);
      state.view.panY = panStart.panY + (my - panStart.y);
      render();
      return;
    }
    if (draggingNode && state.selectedNode >= 0) {
      state.nodes[state.selectedNode] = screenToWorld(mx, my);
      render();
      notify();
      return;
    }
    if (state.mode === 'trace' || state.mode === 'scaleLine') {
      render();
    }
  }

  function onMouseUp() {
    if (panning) { panning = false; notify(); }
    if (draggingNode) { draggingNode = false; notify(); }
  }

  function onContextMenu(e) {
    e.preventDefault();
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = hitTestNode(mx, my);
    if (hit >= 0) {
      state.nodes.splice(hit, 1);
      if (state.nodes.length < 3) state.closed = false;
      if (state.selectedNode === hit) state.selectedNode = -1;
      render(); notify();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const worldBefore = screenToWorld(mx, my);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    state.view.zoom = Math.min(Math.max(state.view.zoom * factor, ZOOM_MIN), ZOOM_MAX);
    const screenAfter = worldToScreen(worldBefore.x, worldBefore.y);
    state.view.panX += mx - screenAfter.x;
    state.view.panY += my - screenAfter.y;
    render();
    notify();
  }

  function onKeyDown(e) {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space') { spaceDown = true; canvasEl.style.cursor = 'grab'; e.preventDefault(); }

    if (e.key === 'Escape') {
      if (state.mode === 'trace' || state.mode === 'scaleLine') {
        state.mode = 'idle';
        state.scaleLinePoints = [];
        notify();
      }
      if (state.selectedNode >= 0) state.selectedNode = -1;
      render();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedNode >= 0) {
      state.nodes.splice(state.selectedNode, 1);
      if (state.nodes.length < 3) state.closed = false;
      state.selectedNode = -1;
      render(); notify();
    }
  }
  function onKeyUp(e) {
    if (e.code === 'Space') { spaceDown = false; canvasEl.style.cursor = ''; }
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = wrapperEl.getBoundingClientRect();
    canvasEl.width = Math.max(1, Math.round(rect.width * dpr));
    canvasEl.height = Math.max(1, Math.round(rect.height * dpr));
    canvasEl.style.width = rect.width + 'px';
    canvasEl.style.height = rect.height + 'px';
    render();
  }

  function zoomAt(factor) {
    const rect = canvasEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const worldBefore = screenToWorld(cx, cy);
    state.view.zoom = Math.min(Math.max(state.view.zoom * factor, ZOOM_MIN), ZOOM_MAX);
    const screenAfter = worldToScreen(worldBefore.x, worldBefore.y);
    state.view.panX += cx - screenAfter.x;
    state.view.panY += cy - screenAfter.y;
    render();
    notify();
  }

  function zoomIn() { zoomAt(1.25); }
  function zoomOut() { zoomAt(1 / 1.25); }
  function zoomReset() { state.view.zoom = 1; state.view.panX = 0; state.view.panY = 0; render(); notify(); }

  function zoomFit() {
    let bbox = null;
    if (state.image) bbox = { minX: 0, minY: 0, maxX: state.image.width, maxY: state.image.height };
    if (state.nodes.length) {
      const xs = state.nodes.map(n => n.x), ys = state.nodes.map(n => n.y);
      const nb = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
      bbox = bbox
        ? { minX: Math.min(bbox.minX, nb.minX), minY: Math.min(bbox.minY, nb.minY), maxX: Math.max(bbox.maxX, nb.maxX), maxY: Math.max(bbox.maxY, nb.maxY) }
        : nb;
    }
    if (!bbox) return;
    const w = Math.max(bbox.maxX - bbox.minX, 1), h = Math.max(bbox.maxY - bbox.minY, 1);
    const rect = canvasEl.getBoundingClientRect();
    const zoom = Math.min(rect.width / w, rect.height / h) * 0.9;
    state.view.zoom = Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX);
    const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
    state.view.panX = rect.width / 2 - state.view.zoom * cx;
    state.view.panY = rect.height / 2 - state.view.zoom * cy;
    render();
    notify();
  }

  function setImage(img) {
    state.image = img;
    zoomFit();
  }

  function init(canvasElement, wrapperElement) {
    canvasEl = canvasElement;
    wrapperEl = wrapperElement;
    ctx = canvasEl.getContext('2d');

    canvasEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvasEl.addEventListener('contextmenu', onContextMenu);
    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(wrapperEl);
    resizeCanvas();
  }

  api.init = init;
  api.render = render;
  api.setImage = setImage;
  api.zoomIn = zoomIn;
  api.zoomOut = zoomOut;
  api.zoomFit = zoomFit;
  api.zoomReset = zoomReset;
  api.getEl = () => canvasEl;
  api.worldToScreen = worldToScreen;

  return api;
})();
