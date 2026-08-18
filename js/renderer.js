/**
 * renderer.js
 * ---------------------------------------------------------------------------
 * วาดจุด/เส้นบน Canvas พร้อมป้ายชื่อและระยะทาง, รองรับ Pan/Zoom/Auto-Fit
 * และตรวจจับการคลิกจุด/เส้นเพื่อส่ง event กลับไปให้ app.js เลือกแก้ไข
 * ---------------------------------------------------------------------------
 */

class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(sel:{type:'point'|'edge', id:string}|null) => void} onSelect callback เมื่อคลิกเลือกจุด/เส้น
   * @param {(sel:{type:'point'|'edge', id:string}|null) => void} onHover callback เมื่อ hover จุด/เส้น
   */
  constructor(canvas, onSelect, onHover) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});

    // view transform: world -> screen ; screen = world * scale + offset (Y กลับด้าน)
    this.scale = 40;      // px ต่อ 1 หน่วยเมตร
    this.offsetX = 0;
    this.offsetY = 0;

    this.points = {};     // cache ล่าสุดจาก engine (world coords, meters)
    this.edges = [];
    this.selected = null; // { type, id }
    this.hovered = null;

    this._isPanning = false;
    this._panStart = { x: 0, y: 0 };
    this._offsetStart = { x: 0, y: 0 };

    this._bindEvents();
    this._resizeObserver = new ResizeObserver(() => this._handleResize());
    this._resizeObserver.observe(canvas);
  }

  // --------------------------------------------------------------- lifecycle
  _handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.draw();
  }

  /** อัปเดตข้อมูลที่จะวาด (เรียกทุกครั้งที่ state เปลี่ยน) */
  setData(points, edges) {
    this.points = points;
    this.edges = edges;
    this.draw();
  }

  setSelected(sel) {
    this.selected = sel;
    this.draw();
  }

  // ------------------------------------------------------------ coord helpers
  worldToScreen(x, y) {
    return {
      x: x * this.scale + this.offsetX,
      y: -y * this.scale + this.offsetY // แกน Y ใน world ชี้ขึ้น, screen ชี้ลง
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: -(sy - this.offsetY) / this.scale
    };
  }

  /** จัดกึ่งกลางและสเกลให้พอดีกับข้อมูลทั้งหมด */
  fitToView() {
    const names = Object.keys(this.points);
    const w = this.cssWidth || this.canvas.clientWidth || 800;
    const h = this.cssHeight || this.canvas.clientHeight || 600;

    if (names.length === 0) {
      this.scale = 40;
      this.offsetX = w / 2;
      this.offsetY = h / 2;
      this.draw();
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    names.forEach(n => {
      const p = this.points[n];
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });

    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const pad = 90; // px padding รอบขอบ (เผื่อป้ายชื่อ/ตัวเลข)

    const scaleX = (w - pad * 2) / spanX;
    const scaleY = (h - pad * 2) / spanY;
    this.scale = Math.max(2, Math.min(scaleX, scaleY, 400));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.offsetX = w / 2 - cx * this.scale;
    this.offsetY = h / 2 + cy * this.scale;

    this.draw();
  }

  zoomBy(factor, pivotScreen) {
    const w = this.cssWidth || this.canvas.clientWidth;
    const h = this.cssHeight || this.canvas.clientHeight;
    const pivot = pivotScreen || { x: w / 2, y: h / 2 };
    const worldBefore = this.screenToWorld(pivot.x, pivot.y);
    this.scale = Math.max(2, Math.min(this.scale * factor, 1200));
    const screenAfter = this.worldToScreen(worldBefore.x, worldBefore.y);
    this.offsetX += pivot.x - screenAfter.x;
    this.offsetY += pivot.y - screenAfter.y;
    this.draw();
  }

  getZoomPercent() {
    return Math.round((this.scale / 40) * 100);
  }

  // --------------------------------------------------------------- rendering
  draw() {
    const ctx = this.ctx;
    const w = this.cssWidth || this.canvas.clientWidth;
    const h = this.cssHeight || this.canvas.clientHeight;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    this._drawGrid(w, h);
    this._drawAxes(w, h);
    this._drawEdges();
    this._drawPoints();
  }

  _drawGrid(w, h) {
    const ctx = this.ctx;
    // เลือกขนาดกริดให้อ่านง่ายตามระดับซูม (1, 2, 5, 10, ... เมตร)
    const targetPx = 60;
    const rawWorld = targetPx / this.scale;
    const niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    let step = niceSteps[niceSteps.length - 1];
    for (const s of niceSteps) { if (s >= rawWorld) { step = s; break; } }

    const startWorld = this.screenToWorld(0, h);
    const endWorld = this.screenToWorld(w, 0);

    ctx.save();
    ctx.strokeStyle = 'rgba(87, 103, 138, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const xStart = Math.floor(startWorld.x / step) * step;
    for (let x = xStart; x <= endWorld.x; x += step) {
      const sx = this.worldToScreen(x, 0).x;
      ctx.moveTo(sx + 0.5, 0);
      ctx.lineTo(sx + 0.5, h);
    }
    const yStart = Math.floor(startWorld.y / step) * step;
    for (let y = yStart; y <= endWorld.y; y += step) {
      const sy = this.worldToScreen(0, y).y;
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(w, sy + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawAxes(w, h) {
    const ctx = this.ctx;
    const origin = this.worldToScreen(0, 0);
    ctx.save();
    ctx.strokeStyle = 'rgba(143, 161, 190, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, origin.y + 0.5); ctx.lineTo(w, origin.y + 0.5);
    ctx.moveTo(origin.x + 0.5, 0); ctx.lineTo(origin.x + 0.5, h);
    ctx.stroke();
    ctx.restore();
  }

  _drawEdges() {
    const ctx = this.ctx;
    this.edges.forEach(edge => {
      const A = this.points[edge.from];
      const B = this.points[edge.to];
      if (!A || !B) return;
      const p1 = this.worldToScreen(A.x, A.y);
      const p2 = this.worldToScreen(B.x, B.y);

      const isSel = this.selected && this.selected.type === 'edge' && this.selected.id === edge.id;
      const isHov = this.hovered && this.hovered.type === 'edge' && this.hovered.id === edge.id;
      const hasError = Number.isNaN(edge.length);

      ctx.save();
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.strokeStyle = hasError ? '#E1595A' : (isSel ? '#E8A33D' : (isHov ? '#7FE3D8' : '#4FD1C5'));
      ctx.globalAlpha = edge.isBase ? 1 : 0.85;
      if (!edge.isBase) ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();

      // ป้ายระยะทางกึ่งกลางเส้น พร้อมพื้นหลังกันทับกับกริด
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const label = hasError ? '⚠ ERR' : edge.length.toFixed(3);
      ctx.save();
      ctx.font = '600 11px "JetBrains Mono", monospace';
      const textW = ctx.measureText(label).width;
      const padX = 5, padY = 3;
      ctx.fillStyle = 'rgba(15, 26, 44, 0.92)';
      ctx.strokeStyle = hasError ? 'rgba(225,89,90,.5)' : 'rgba(34,49,77,0.9)';
      ctx.lineWidth = 1;
      const boxW = textW + padX * 2;
      const boxH = 16 + padY;
      this._roundRect(ctx, mx - boxW / 2, my - boxH / 2, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hasError ? '#E1595A' : '#B9D3F0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, mx, my + 0.5);
      ctx.restore();
    });
  }

  _drawPoints() {
    const ctx = this.ctx;
    Object.keys(this.points).forEach(name => {
      const p = this.points[name];
      const s = this.worldToScreen(p.x, p.y);
      const isSel = this.selected && this.selected.type === 'point' && this.selected.id === name;
      const isHov = this.hovered && this.hovered.type === 'point' && this.hovered.id === name;
      const hasError = !!p.error;

      const r = isSel ? 7 : (isHov ? 6.5 : 5.5);

      ctx.save();
      // glow เมื่อเลือก
      if (isSel) {
        ctx.shadowColor = 'rgba(232,163,61,.9)';
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hasError ? '#E1595A' : (p.isBase ? '#E8A33D' : (isSel ? '#E8A33D' : '#4FD1C5'));
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0B1220';
      ctx.stroke();
      ctx.restore();

      // ป้ายชื่อจุด + พิกัด
      ctx.save();
      ctx.font = '700 12.5px "Space Grotesk", sans-serif';
      ctx.fillStyle = '#E7ECF3';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(name, s.x + 10, s.y - 6);

      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#8FA1BE';
      ctx.textBaseline = 'top';
      const coordText = `${p.x.toFixed(3)}, ${p.y.toFixed(3)}`;
      ctx.fillText(coordText, s.x + 10, s.y + 5);
      ctx.restore();
    });
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ----------------------------------------------------------- hit-testing
  _hitTest(sx, sy) {
    // ลำดับความสำคัญ: จุด > เส้น (จุดเล็กกว่าและสำคัญกว่าในการเลือก)
    const names = Object.keys(this.points);
    for (const name of names) {
      const p = this.points[name];
      const s = this.worldToScreen(p.x, p.y);
      const dist = Math.hypot(s.x - sx, s.y - sy);
      if (dist <= 10) return { type: 'point', id: name };
    }
    for (const edge of this.edges) {
      const A = this.points[edge.from];
      const B = this.points[edge.to];
      if (!A || !B) continue;
      const p1 = this.worldToScreen(A.x, A.y);
      const p2 = this.worldToScreen(B.x, B.y);
      const d = this._pointToSegmentDist(sx, sy, p1.x, p1.y, p2.x, p2.y);
      if (d <= 6) return { type: 'edge', id: edge.id };
    }
    return null;
  }

  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  // -------------------------------------------------------------- events
  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => {
      this._isPanning = true;
      this._dragged = false;
      this._panStart = { x: e.clientX, y: e.clientY };
      this._offsetStart = { x: this.offsetX, y: this.offsetY };
      canvas.classList.add('is-panning');
    });

    window.addEventListener('mousemove', (e) => {
      if (this._isPanning) {
        const dx = e.clientX - this._panStart.x;
        const dy = e.clientY - this._panStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._dragged = true;
        this.offsetX = this._offsetStart.x + dx;
        this.offsetY = this._offsetStart.y + dy;
        this.draw();
      } else {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return;
        const hit = this._hitTest(sx, sy);
        const changed = JSON.stringify(hit) !== JSON.stringify(this.hovered);
        if (changed) {
          this.hovered = hit;
          canvas.classList.toggle('is-hovering-clickable', !!hit);
          this.onHover(hit);
          this.draw();
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this._isPanning) return;
      this._isPanning = false;
      canvas.classList.remove('is-panning');
      if (!this._dragged) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const hit = this._hitTest(sx, sy);
        this.onSelect(hit);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pivot = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.zoomBy(factor, pivot);
    }, { passive: false });

    // touch support (มือถือ/แท็บเล็ต): pan ด้วยนิ้วเดียว, zoom ด้วยสองนิ้ว
    let lastTouchDist = null;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this._isPanning = true;
        this._dragged = false;
        this._panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this._offsetStart = { x: this.offsetX, y: this.offsetY };
      } else if (e.touches.length === 2) {
        this._isPanning = false;
        lastTouchDist = this._touchDist(e.touches);
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this._isPanning) {
        const dx = e.touches[0].clientX - this._panStart.x;
        const dy = e.touches[0].clientY - this._panStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._dragged = true;
        this.offsetX = this._offsetStart.x + dx;
        this.offsetY = this._offsetStart.y + dy;
        this.draw();
      } else if (e.touches.length === 2) {
        const dist = this._touchDist(e.touches);
        if (lastTouchDist) {
          const factor = dist / lastTouchDist;
          const rect = canvas.getBoundingClientRect();
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          this.zoomBy(factor, { x: midX, y: midY });
        }
        lastTouchDist = dist;
      }
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        if (this._isPanning && !this._dragged) {
          // แตะเบาๆ ถือเป็นคลิกเลือก
        }
        this._isPanning = false;
        lastTouchDist = null;
      }
    }, { passive: true });
  }

  _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }
}
