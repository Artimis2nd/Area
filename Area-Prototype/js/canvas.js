/* canvas.js — rendering + interaction engine for the tracing canvas. */
(function (global) {
  "use strict";
  const G = global.LDD.Geometry;

  const NODE_RADIUS = 6;
  const HIT_RADIUS = 11;
  const CLOSE_SNAP_RADIUS = 14;
  const MIN_SCALE = 0.02;
  const MAX_SCALE = 60;

  function CanvasEngine(canvasEl, state) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.state = state;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.dragging = null; // 'node' | 'pan'
    this.dragNodeIndex = -1;
    this.dragStartScreen = null;
    this.dragStartOffset = null;
    this.spaceHeld = false;
    this.lastPointerCu = { x: 0, y: 0 };
    this.rafPending = false;

    this._bindEvents();
    this._observeResize();
    // Repaint whenever the state changes for any reason, including programmatic
    // mutations that don't originate from a pointer event on this canvas
    // (ScaleEngine calibration, project load/import, clear, etc).
    this.state.on("changed", () => this.requestRender());
    this.requestRender();
  }

  // ---------------- coordinate transforms ----------------
  CanvasEngine.prototype.screenToCu = function (sx, sy) {
    const v = this.state.data.view;
    return { x: (sx - v.offsetX) / v.scale, y: (sy - v.offsetY) / v.scale };
  };
  CanvasEngine.prototype.cuToScreen = function (x, y) {
    const v = this.state.data.view;
    return { x: x * v.scale + v.offsetX, y: y * v.scale + v.offsetY };
  };

  // ---------------- sizing ----------------
  CanvasEngine.prototype._observeResize = function () {
    const ro = new ResizeObserver(() => this._resizeToContainer());
    ro.observe(this.canvas.parentElement);
    this._resizeToContainer();
  };
  CanvasEngine.prototype._resizeToContainer = function () {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.displayWidth = w;
    this.displayHeight = h;
    this.requestRender();
  };

  // ---------------- view control ----------------
  CanvasEngine.prototype.fitToImage = function () {
    const img = this.state.data.image;
    if (!img) return;
    this._fitBox(img.x, img.y, img.width, img.height);
  };
  CanvasEngine.prototype.fitToContent = function () {
    const d = this.state.data;
    let box = null;
    if (d.image) box = { minX: d.image.x, minY: d.image.y, maxX: d.image.x + d.image.width, maxY: d.image.y + d.image.height };
    if (d.nodes.length) {
      const nb = G.boundingBox(d.nodes);
      box = box
        ? { minX: Math.min(box.minX, nb.minX), minY: Math.min(box.minY, nb.minY), maxX: Math.max(box.maxX, nb.maxX), maxY: Math.max(box.maxY, nb.maxY) }
        : nb;
    }
    if (!box) return;
    this._fitBox(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
  };
  CanvasEngine.prototype._fitBox = function (x, y, w, h) {
    if (w <= 0 || h <= 0 || !this.displayWidth) return;
    const pad = 40;
    const scaleX = (this.displayWidth - pad * 2) / w;
    const scaleY = (this.displayHeight - pad * 2) / h;
    let scale = Math.min(scaleX, scaleY);
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    const v = this.state.data.view;
    v.scale = scale;
    v.offsetX = this.displayWidth / 2 - (x + w / 2) * scale;
    v.offsetY = this.displayHeight / 2 - (y + h / 2) * scale;
    this.requestRender();
    this.state.emit("view-changed");
  };
  CanvasEngine.prototype.zoomBy = function (factor, centerScreen) {
    const v = this.state.data.view;
    const center = centerScreen || { x: this.displayWidth / 2, y: this.displayHeight / 2 };
    const cuBefore = this.screenToCu(center.x, center.y);
    v.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
    const screenAfter = this.cuToScreen(cuBefore.x, cuBefore.y);
    v.offsetX += center.x - screenAfter.x;
    v.offsetY += center.y - screenAfter.y;
    this.requestRender();
    this.state.emit("view-changed");
  };

  // ---------------- render ----------------
  CanvasEngine.prototype.requestRender = function () {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.render();
    });
  };

  CanvasEngine.prototype.render = function () {
    const ctx = this.ctx;
    const d = this.state.data;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    // background grid
    this._drawGrid();

    // image
    if (d.image && d.image.el) {
      const p1 = this.cuToScreen(d.image.x, d.image.y);
      const p2 = this.cuToScreen(d.image.x + d.image.width, d.image.y + d.image.height);
      ctx.drawImage(d.image.el, p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }

    this._drawPolygon();
    this._drawMeasureLine();
    this._drawDrawPreview();

    ctx.restore();
  };

  CanvasEngine.prototype._drawGrid = function () {
    const ctx = this.ctx;
    ctx.fillStyle = "#eef1f5";
    ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    const v = this.state.data.view;
    const step = 100; // cu spacing at scale 1; adapt to zoom so lines aren't too dense/sparse
    let spacing = step * v.scale;
    while (spacing < 40) spacing *= 5;
    while (spacing > 250) spacing /= 5;
    ctx.strokeStyle = "#dde2e8";
    ctx.lineWidth = 1;
    const offX = v.offsetX % spacing;
    const offY = v.offsetY % spacing;
    ctx.beginPath();
    for (let x = offX; x < this.displayWidth; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.displayHeight);
    }
    for (let y = offY; y < this.displayHeight; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.displayWidth, y);
    }
    ctx.stroke();
  };

  CanvasEngine.prototype._drawPolygon = function () {
    const ctx = this.ctx;
    const d = this.state.data;
    const nodes = d.nodes;
    if (nodes.length === 0) return;
    const screenPts = nodes.map((n) => this.cuToScreen(n.x, n.y));

    // fill + stroke
    ctx.beginPath();
    screenPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (d.closed) ctx.closePath();
    ctx.fillStyle = "rgba(37, 130, 245, 0.16)";
    if (d.closed) ctx.fill();
    ctx.strokeStyle = "#1f6fe0";
    ctx.lineWidth = 2;
    ctx.stroke();

    // edge length labels (real meters, once calibrated)
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#0b3d91";
    const edgeCount = d.closed ? nodes.length : nodes.length - 1;
    for (let i = 0; i < edgeCount; i++) {
      const a = nodes[i], b = nodes[(i + 1) % nodes.length];
      const meters = G.distance(a, b) / d.unitsPerMeter;
      const sa = this.cuToScreen(a.x, a.y), sb = this.cuToScreen(b.x, b.y);
      const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
      const label = G.formatNumber(meters, 2) + " ม.";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(mx - tw / 2 - 3, my - 15, tw + 6, 16);
      ctx.fillStyle = "#0b3d91";
      ctx.fillText(label, mx - tw / 2, my - 3);
    }

    // nodes
    nodes.forEach((n, i) => {
      const p = this.cuToScreen(n.x, n.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2);
      const isSel = i === d.selectedNodeIndex;
      const isHover = i === d.hoverNodeIndex;
      ctx.fillStyle = isSel ? "#ff8a00" : isHover ? "#ffd166" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1f6fe0";
      ctx.stroke();
    });

    // area label at centroid
    if (d.closed && nodes.length >= 3) {
      const areaCu2 = G.area(nodes);
      const areaM2 = areaCu2 / (d.unitsPerMeter * d.unitsPerMeter);
      const rgw = G.m2ToRaiNganWa(areaM2);
      const c = this.cuToScreen(G.centroid(nodes).x, G.centroid(nodes).y);
      const lines = [
        `${G.formatNumber(areaM2, 2)} ตร.ม.`,
        `${rgw.rai} ไร่ ${rgw.ngan} งาน ${G.formatNumber(rgw.wa, 1)} ตร.วา`,
      ];
      ctx.font = "bold 13px system-ui, sans-serif";
      const widths = lines.map((l) => ctx.measureText(l).width);
      const w = Math.max(...widths) + 16;
      const h = lines.length * 18 + 10;
      ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
      ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h);
      ctx.fillStyle = "#fff";
      lines.forEach((l, i) => {
        ctx.fillText(l, c.x - widths[i] / 2, c.y - h / 2 + 20 + i * 18);
      });
    }
  };

  CanvasEngine.prototype._drawDrawPreview = function () {
    const d = this.state.data;
    if (d.mode !== "draw" || d.nodes.length === 0 || d.closed) return;
    const ctx = this.ctx;
    const last = d.nodes[d.nodes.length - 1];
    const sa = this.cuToScreen(last.x, last.y);
    const sb = this.cuToScreen(this.lastPointerCu.x, this.lastPointerCu.y);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "#1f6fe0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // snap indicator on first node
    if (d.nodes.length >= 3) {
      const first = this.cuToScreen(d.nodes[0].x, d.nodes[0].y);
      const dist = Math.hypot(sb.x - first.x, sb.y - first.y);
      if (dist <= CLOSE_SNAP_RADIUS) {
        ctx.beginPath();
        ctx.arc(first.x, first.y, CLOSE_SNAP_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  };

  CanvasEngine.prototype._drawMeasureLine = function () {
    const d = this.state.data;
    if (d.mode !== "measure" || d.measurePoints.length === 0) return;
    const ctx = this.ctx;
    const pts = d.measurePoints;
    ctx.fillStyle = "#e11d48";
    pts.forEach((p) => {
      const s = this.cuToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    if (pts.length === 2) {
      const s0 = this.cuToScreen(pts[0].x, pts[0].y);
      const s1 = this.cuToScreen(pts[1].x, pts[1].y);
      ctx.strokeStyle = "#e11d48";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
    } else if (pts.length === 1) {
      const s0 = this.cuToScreen(pts[0].x, pts[0].y);
      const s1 = this.cuToScreen(this.lastPointerCu.x, this.lastPointerCu.y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#e11d48";
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  // ---------------- hit testing ----------------
  CanvasEngine.prototype._nodeAtScreen = function (sx, sy) {
    const nodes = this.state.data.nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const p = this.cuToScreen(nodes[i].x, nodes[i].y);
      if (Math.hypot(p.x - sx, p.y - sy) <= HIT_RADIUS) return i;
    }
    return -1;
  };
  CanvasEngine.prototype._edgeAtScreen = function (sx, sy) {
    const d = this.state.data;
    const nodes = d.nodes;
    if (nodes.length < 2) return null;
    const cu = this.screenToCu(sx, sy);
    const edgeCount = d.closed ? nodes.length : nodes.length - 1;
    let best = null;
    for (let i = 0; i < edgeCount; i++) {
      const a = nodes[i], b = nodes[(i + 1) % nodes.length];
      const res = G.pointToSegment(cu, a, b);
      const screenDist = res.distance * this.state.data.view.scale;
      if (screenDist <= HIT_RADIUS && (!best || res.distance < best.distance)) {
        best = { index: i, distance: res.distance, point: res.point };
      }
    }
    return best;
  };

  // ---------------- events ----------------
  CanvasEngine.prototype._bindEvents = function () {
    const c = this.canvas;
    c.style.touchAction = "none";

    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = Math.exp(-e.deltaY * 0.0015);
      this.zoomBy(factor, center);
    }, { passive: false });

    c.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    c.addEventListener("pointermove", (e) => this._onPointerMove(e));
    c.addEventListener("pointerup", (e) => this._onPointerUp(e));
    c.addEventListener("pointercancel", (e) => this._onPointerUp(e));
    c.addEventListener("dblclick", (e) => this._onDblClick(e));
    c.addEventListener("contextmenu", (e) => this._onContextMenu(e));

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") this.spaceHeld = true;
      if ((e.key === "Delete" || e.key === "Backspace") && document.activeElement === document.body) {
        this._deleteSelectedNode();
      }
      if (e.key === "Escape") {
        this.state.data.mode = "select";
        this.state.data.measurePoints = [];
        this.state.touch("mode-changed");
      }
      if (e.key === "Enter" && this.state.data.mode === "draw") {
        this._tryClosePolygon(true);
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceHeld = false;
    });
  };

  CanvasEngine.prototype._localXY = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  CanvasEngine.prototype._onPointerDown = function (e) {
    const d = this.state.data;
    const { x: sx, y: sy } = this._localXY(e);
    this.canvas.setPointerCapture(e.pointerId);
    this._downScreen = { x: sx, y: sy };
    this._moved = false;

    const isPanTrigger = e.button === 1 || this.spaceHeld || d.mode === "pan";
    if (isPanTrigger) {
      this.dragging = "pan";
      this.dragStartScreen = { x: sx, y: sy };
      this.dragStartOffset = { x: d.view.offsetX, y: d.view.offsetY };
      return;
    }

    if (d.mode === "draw") {
      // handled on pointerup as a "click" to avoid accidental double placement while dragging view
      return;
    }

    if (d.mode === "select") {
      const idx = this._nodeAtScreen(sx, sy);
      if (idx >= 0) {
        d.selectedNodeIndex = idx;
        this.dragging = "node";
        this.dragNodeIndex = idx;
        this.state.touch("selection-changed");
      }
      return;
    }

    if (d.mode === "measure") {
      // handled on pointerup
      return;
    }
  };

  CanvasEngine.prototype._onPointerMove = function (e) {
    const d = this.state.data;
    const { x: sx, y: sy } = this._localXY(e);
    if (this._downScreen && Math.hypot(sx - this._downScreen.x, sy - this._downScreen.y) > 3) this._moved = true;
    this.lastPointerCu = this.screenToCu(sx, sy);

    if (this.dragging === "pan") {
      d.view.offsetX = this.dragStartOffset.x + (sx - this.dragStartScreen.x);
      d.view.offsetY = this.dragStartOffset.y + (sy - this.dragStartScreen.y);
      this.requestRender();
      this.state.emit("pointer-move", this.lastPointerCu);
      this.state.emit("view-changed");
      return;
    }

    if (this.dragging === "node") {
      d.nodes[this.dragNodeIndex].x = this.lastPointerCu.x;
      d.nodes[this.dragNodeIndex].y = this.lastPointerCu.y;
      this.requestRender();
      this.state.touch("nodes-changed");
      this.state.emit("pointer-move", this.lastPointerCu);
      return;
    }

    if (d.mode === "select") {
      const idx = this._nodeAtScreen(sx, sy);
      if (idx !== d.hoverNodeIndex) {
        d.hoverNodeIndex = idx;
        this.requestRender();
      }
      this.canvas.style.cursor = idx >= 0 ? "grab" : "default";
    }

    this.requestRender();
    this.state.emit("pointer-move", this.lastPointerCu);
  };

  CanvasEngine.prototype._onPointerUp = function (e) {
    const d = this.state.data;
    const { x: sx, y: sy } = this._localXY(e);
    const wasDragging = this.dragging;
    this.dragging = null;
    this.canvas.releasePointerCapture && this.canvas.releasePointerCapture(e.pointerId);

    const wasClick = !this._moved;
    this._downScreen = null;

    if (wasDragging === "node") {
      this.state.touch("nodes-changed");
      return;
    }
    if (wasDragging === "pan") return;

    if (!wasClick) return;
    if (e.button !== 0) return;

    if (d.mode === "draw") {
      if (d.nodes.length >= 3) {
        const first = this.cuToScreen(d.nodes[0].x, d.nodes[0].y);
        if (Math.hypot(sx - first.x, sy - first.y) <= CLOSE_SNAP_RADIUS) {
          this._tryClosePolygon(false);
          return;
        }
      }
      const cu = this.screenToCu(sx, sy);
      d.nodes.push({ id: this.state.nextNodeId(), x: cu.x, y: cu.y });
      this.state.touch("nodes-changed");
      return;
    }

    if (d.mode === "select") {
      const idx = this._nodeAtScreen(sx, sy);
      if (idx < 0) {
        d.selectedNodeIndex = -1;
        this.state.touch("selection-changed");
      }
      return;
    }

    if (d.mode === "measure") {
      const cu = this.screenToCu(sx, sy);
      // snap to an existing node if close, for precise calibration
      const nodeIdx = this._nodeAtScreen(sx, sy);
      const point = nodeIdx >= 0 ? { x: d.nodes[nodeIdx].x, y: d.nodes[nodeIdx].y } : cu;
      if (d.measurePoints.length >= 2) d.measurePoints = [];
      d.measurePoints.push(point);
      this.state.touch("measure-changed");
      return;
    }
  };

  CanvasEngine.prototype._onDblClick = function (e) {
    const d = this.state.data;
    if (d.mode !== "select" || !d.closed) return;
    const { x: sx, y: sy } = this._localXY(e);
    const edge = this._edgeAtScreen(sx, sy);
    if (edge) {
      d.nodes.splice(edge.index + 1, 0, { id: this.state.nextNodeId(), x: edge.point.x, y: edge.point.y });
      this.state.touch("nodes-changed");
    }
  };

  CanvasEngine.prototype._onContextMenu = function (e) {
    const d = this.state.data;
    if (d.mode !== "select") return;
    e.preventDefault();
    const { x: sx, y: sy } = this._localXY(e);
    const idx = this._nodeAtScreen(sx, sy);
    if (idx >= 0) {
      d.selectedNodeIndex = idx;
      this._deleteSelectedNode();
    }
  };

  CanvasEngine.prototype._deleteSelectedNode = function () {
    const d = this.state.data;
    if (d.selectedNodeIndex < 0) return;
    const minNodes = d.closed ? 3 : 0;
    if (d.nodes.length <= minNodes) {
      this.state.emit("toast", { text: "รูปหลายเหลี่ยมต้องมีอย่างน้อย 3 จุด", type: "warn" });
      return;
    }
    d.nodes.splice(d.selectedNodeIndex, 1);
    d.selectedNodeIndex = -1;
    if (d.nodes.length < 3) d.closed = false;
    this.state.touch("nodes-changed");
  };

  CanvasEngine.prototype.undoLastNode = function () {
    const d = this.state.data;
    if (d.closed || d.nodes.length === 0) return;
    d.nodes.pop();
    this.state.touch("nodes-changed");
  };

  CanvasEngine.prototype._tryClosePolygon = function (fromKeyboard) {
    const d = this.state.data;
    if (d.nodes.length < 3) {
      this.state.emit("toast", { text: "ต้องมีอย่างน้อย 3 จุดจึงจะปิดรูปได้", type: "warn" });
      return;
    }
    d.closed = true;
    d.mode = "select";
    this.state.touch("polygon-closed");
  };
  CanvasEngine.prototype.closePolygon = function () { this._tryClosePolygon(false); };

  global.LDD = global.LDD || {};
  global.LDD.CanvasEngine = CanvasEngine;
})(window);
