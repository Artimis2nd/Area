/**
 * app.js
 * ---------------------------------------------------------------------------
 * เชื่อมต่อ UI (Sidebar, ฟอร์ม, ตาราง, Modal) เข้ากับ Engine (คำนวณ/state)
 * และ Renderer (วาดผลบน Canvas) — เป็นชั้น Controller ของแอปพลิเคชัน
 * ---------------------------------------------------------------------------
 */

(() => {
  'use strict';

  // ------------------------------------------------------------- DOM refs
  const $ = (sel) => document.querySelector(sel);
  const canvas = $('#canvas');
  const stageEmpty = $('#stageEmpty');

  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  const formBase = $('#formBase');
  const baseNameA = $('#baseNameA');
  const baseNameB = $('#baseNameB');
  const baseLength = $('#baseLength');
  const baseMsg = $('#baseMsg');

  const formAdd = $('#formAdd');
  const refASel = $('#refA');
  const refBSel = $('#refB');
  const distAInput = $('#distA');
  const distBInput = $('#distB');
  const newNameInput = $('#newName');
  const flipSideInput = $('#flipSide');
  const addMsg = $('#addMsg');

  const pointsTableBody = $('#pointsTable tbody');
  const edgesTableBody = $('#edgesTable tbody');
  const pointCountEl = $('#pointCount');
  const edgeCountEl = $('#edgeCount');

  const hudBadge = $('#hudBadge');
  const hudX = $('#hudX');
  const hudY = $('#hudY');

  const btnFit = $('#btnFit');
  const zoomInBtn = $('#zoomIn');
  const zoomOutBtn = $('#zoomOut');
  const zoomLevelEl = $('#zoomLevel');

  const btnExportCsv = $('#btnExportCsv');
  const btnExportJson = $('#btnExportJson');
  const btnReset = $('#btnReset');

  const modalBackdrop = $('#modalBackdrop');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const modalSave = $('#modalSave');
  const modalCancel = $('#modalCancel');
  const modalClose = $('#modalClose');
  const modalDelete = $('#modalDelete');

  const toastEl = $('#toast');

  // ------------------------------------------------------------- app state
  let selection = null;      // { type:'point'|'edge', id:string }
  let editingContext = null; // ข้อมูลชั่วคราวสำหรับ modal ที่กำลังเปิดอยู่

  // ------------------------------------------------------------- renderer
  const renderer = new Renderer(
    canvas,
    (sel) => { selectItem(sel); },
    () => { /* hover handled internally by renderer for cursor/highlight */ }
  );

  // =============================================================== TABS
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-active'));
      panels.forEach(p => p.classList.remove('is-active'));
      tab.classList.add('is-active');
      document.querySelector(`.panel[data-panel="${tab.dataset.tab}"]`).classList.add('is-active');
    });
  });

  function switchToTab(tabName) {
    document.querySelector(`.tab[data-tab="${tabName}"]`)?.click();
  }

  // =============================================================== TOAST
  let toastTimer = null;
  function showToast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle('is-error', !!isError);
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  }

  // ======================================================== STEP 1 : BASE
  formBase.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = Engine.setBaseLine(
      baseNameA.value,
      baseNameB.value,
      parseFloat(baseLength.value)
    );
    if (!result.ok) {
      setMsg(baseMsg, result.error, true);
      return;
    }
    setMsg(baseMsg, `วางเส้นฐาน ${result.names[0]}–${result.names[1]} สำเร็จ`, false);
    formBase.reset();
    refreshAll();
    renderer.fitToView();
    updateZoomLabel();
    switchToTab('add');
  });

  function setMsg(el, text, isError) {
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('is-ok', !isError && !!text);
  }

  // ======================================================= STEP 2 : ADD POINT
  formAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = Engine.addPoint({
      name: newNameInput.value,
      refA: refASel.value,
      refB: refBSel.value,
      distA: distAInput.value,
      distB: distBInput.value,
      flip: flipSideInput.checked
    });
    if (!result.ok) {
      setMsg(addMsg, result.error, true);
      return;
    }
    setMsg(addMsg, `เพิ่มจุด "${result.name}" สำเร็จ (X=${result.x.toFixed(3)}, Y=${result.y.toFixed(3)})`, false);
    formAdd.reset();
    flipSideInput.checked = false;
    populateRefSelectors();
    refreshAll();
  });

  function populateRefSelectors() {
    const names = Engine.getPointNames();
    [refASel, refBSel].forEach((sel, idx) => {
      const prevVal = sel.value;
      sel.innerHTML = '';
      if (names.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'ยังไม่มีจุด';
        opt.value = '';
        sel.appendChild(opt);
        sel.disabled = true;
        return;
      }
      sel.disabled = false;
      names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        sel.appendChild(opt);
      });
      // ค่าเริ่มต้นอัจฉริยะ: refA = จุดก่อนสุดท้าย, refB = จุดล่าสุด (โฟลว์ต่อจุดต่อเนื่อง)
      if (names.includes(prevVal)) {
        sel.value = prevVal;
      } else if (idx === 0) {
        sel.value = names[Math.max(0, names.length - 2)];
      } else {
        sel.value = names[names.length - 1];
      }
    });
  }

  // ============================================================ SELECTION
  function selectItem(sel) {
    selection = sel;
    renderer.setSelected(sel);
    updateHud();
    if (sel) openEditModal(sel);
  }

  function updateHud() {
    if (!selection || selection.type !== 'point') {
      hudBadge.textContent = '—';
      hudX.textContent = '0.000';
      hudY.textContent = '0.000';
      return;
    }
    const p = Engine.getPoint(selection.id);
    if (!p) return;
    hudBadge.textContent = selection.id;
    hudX.textContent = p.x.toFixed(3);
    hudY.textContent = p.y.toFixed(3);
  }

  // ============================================================ EDIT MODAL
  function openEditModal(sel) {
    if (sel.type === 'point') openPointModal(sel.id);
    else openEdgeModal(sel.id);
  }

  function openPointModal(name) {
    const p = Engine.getPoint(name);
    if (!p) return;
    editingContext = { kind: 'point', name };
    modalTitle.textContent = `แก้ไขจุด "${name}"`;

    if (p.isBase) {
      const [nameA, nameB] = Engine.getBaseNames();
      const isA = name === nameA;
      modalBody.innerHTML = `
        <label class="field">
          <span>ชื่อจุด</span>
          <input type="text" id="mName" value="${escapeHtml(name)}" maxlength="12">
        </label>
        <p class="panel__hint" style="margin:0;">
          จุดนี้เป็นจุดฐาน (${isA ? 'จุดเริ่มต้น A' : 'จุดปลายเส้นฐาน B'})
          ${isA ? 'ตรึงอยู่ที่ (0, 0) เสมอ' : 'แก้ไข "ระยะฐาน A–B" ได้ด้านล่าง'}
        </p>
        ${!isA ? `
        <label class="field">
          <span>ระยะฐาน A–B (เมตร)</span>
          <input type="number" id="mBaseLen" step="any" min="0.001" value="${p.x.toFixed(3)}">
        </label>` : ''}
      `;
    } else {
      const names = Engine.getPointNames().filter(n => n !== name && !Engine.getPoint(n).isBase || Engine.getPoint(n).isBase);
      const validRefs = Engine.getPointNames().filter(n => n !== name);
      modalBody.innerHTML = `
        <label class="field">
          <span>ชื่อจุด</span>
          <input type="text" id="mName" value="${escapeHtml(name)}" maxlength="12">
        </label>
        <div class="field-row">
          <label class="field">
            <span>จุดอ้างอิงที่ 1</span>
            <select id="mRefA">${validRefs.map(n => `<option value="${n}" ${n === p.refA ? 'selected' : ''}>${n}</option>`).join('')}</select>
          </label>
          <label class="field">
            <span>จุดอ้างอิงที่ 2</span>
            <select id="mRefB">${validRefs.map(n => `<option value="${n}" ${n === p.refB ? 'selected' : ''}>${n}</option>`).join('')}</select>
          </label>
        </div>
        <div class="field-row">
          <label class="field">
            <span>ระยะจากอ้างอิง 1 (ม.)</span>
            <input type="number" id="mDistA" step="any" min="0.001" value="${p.distA}">
          </label>
          <label class="field">
            <span>ระยะจากอ้างอิง 2 (ม.)</span>
            <input type="number" id="mDistB" step="any" min="0.001" value="${p.distB}">
          </label>
        </div>
        <label class="switch">
          <input type="checkbox" id="mFlip" ${p.flip ? 'checked' : ''}>
          <span class="switch__track"><span class="switch__thumb"></span></span>
          <span class="switch__label">Flip Side</span>
        </label>
        <p class="panel__hint" style="margin:0;">พิกัดปัจจุบัน: X=${p.x.toFixed(3)}, Y=${p.y.toFixed(3)}</p>
      `;
    }
    modalDelete.style.display = '';
    showModal();
  }

  function openEdgeModal(edgeId) {
    const edge = Engine.getEdges().find(e => e.id === edgeId);
    if (!edge) return;
    // เส้นแก้ไขผ่านจุดปลายทาง (ownerPoint) เสมอ เพราะเส้นถูกกำหนดโดยระยะของจุดนั้น
    editingContext = { kind: 'edge', edge };
    const owner = Engine.getPoint(edge.ownerPoint);
    modalTitle.textContent = `แก้ไขเส้น ${edge.from}–${edge.to}`;

    if (edge.isBase) {
      modalBody.innerHTML = `
        <p class="panel__hint" style="margin:0 0 6px;">นี่คือเส้นฐาน (Base Line) ของโครงข่ายทั้งหมด</p>
        <label class="field">
          <span>ระยะ ${edge.from}–${edge.to} (เมตร)</span>
          <input type="number" id="mBaseLen" step="any" min="0.001" value="${edge.length.toFixed(3)}">
        </label>
      `;
    } else {
      const isDistA = edge.isRefA;
      modalBody.innerHTML = `
        <p class="panel__hint" style="margin:0 0 6px;">
          เส้นนี้คือระยะจาก "${edge.from}" ไปยัง "${edge.to}" (แก้ไขระยะของจุด ${edge.to})
        </p>
        <label class="field">
          <span>ระยะ ${edge.from}–${edge.to} (เมตร)</span>
          <input type="number" id="mEdgeLen" step="any" min="0.001" value="${edge.length.toFixed(3)}">
        </label>
      `;
    }
    modalDelete.style.display = 'none'; // ลบเส้นทำผ่านการลบจุดปลายทางแทน เพื่อความชัดเจนของโครงสร้าง
    showModal();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showModal() {
    modalBackdrop.classList.add('is-visible');
  }
  function hideModal() {
    modalBackdrop.classList.remove('is-visible');
    editingContext = null;
  }

  modalClose.addEventListener('click', hideModal);
  modalCancel.addEventListener('click', hideModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) hideModal();
  });

  modalSave.addEventListener('click', () => {
    if (!editingContext) return;

    if (editingContext.kind === 'point') {
      const name = editingContext.name;
      const p = Engine.getPoint(name);
      const newName = $('#mName').value.trim();

      if (p.isBase) {
        const baseLenInput = $('#mBaseLen');
        // เปลี่ยนชื่อก่อน (ถ้ามี) แล้วค่อยอัปเดตความยาว
        if (newName && newName !== name) {
          const r = Engine.renamePoint(name, newName);
          if (!r.ok) { showToast(r.error, true); return; }
        }
        if (baseLenInput) {
          const r2 = Engine.updateBaseLength(parseFloat(baseLenInput.value));
          if (!r2.ok) { showToast(r2.error, true); return; }
        }
        showToast('บันทึกการแก้ไขจุดฐานสำเร็จ');
      } else {
        const refA = $('#mRefA').value;
        const refB = $('#mRefB').value;
        const distA = $('#mDistA').value;
        const distB = $('#mDistB').value;
        const flip = $('#mFlip').checked;

        const r = Engine.updatePointGeometry(name, { refA, refB, distA, distB, flip });
        if (!r.ok) { showToast(r.error, true); return; }

        if (newName && newName !== name) {
          const r2 = Engine.renamePoint(name, newName);
          if (!r2.ok) { showToast(r2.error, true); return; }
        }
        showToast(`อัปเดตจุด "${newName || name}" และจุดลูกที่เกี่ยวข้องแล้ว`);
      }
    } else if (editingContext.kind === 'edge') {
      const edge = editingContext.edge;
      if (edge.isBase) {
        const r = Engine.updateBaseLength(parseFloat($('#mBaseLen').value));
        if (!r.ok) { showToast(r.error, true); return; }
        showToast('อัปเดตระยะเส้นฐานแล้ว');
      } else {
        const newLen = parseFloat($('#mEdgeLen').value);
        const p = Engine.getPoint(edge.ownerPoint);
        const payload = edge.isRefA ? { distA: newLen } : { distB: newLen };
        const r = Engine.updatePointGeometry(edge.ownerPoint, payload);
        if (!r.ok) { showToast(r.error, true); return; }
        showToast(`อัปเดตระยะเส้น ${edge.from}–${edge.to} แล้ว`);
      }
    }

    hideModal();
    populateRefSelectors();
    refreshAll();
  });

  modalDelete.addEventListener('click', () => {
    if (!editingContext || editingContext.kind !== 'point') return;
    const name = editingContext.name;
    const confirmed = window.confirm(
      `ลบจุด "${name}" และจุดลูกทั้งหมดที่อ้างอิงถึงจุดนี้?\nการกระทำนี้ไม่สามารถย้อนกลับได้`
    );
    if (!confirmed) return;
    const r = Engine.deletePoint(name);
    if (!r.ok) { showToast(r.error, true); return; }
    hideModal();
    selection = null;
    renderer.setSelected(null);
    updateHud();
    populateRefSelectors();
    refreshAll();
    if (r.clearedAll) {
      showToast('ลบจุดฐาน — ล้างโครงข่ายทั้งหมดแล้ว');
    } else {
      showToast(`ลบจุด ${r.removed.join(', ')} แล้ว`);
    }
  });

  // =============================================================== TABLE
  function renderTables() {
    const names = Engine.getPointNames();
    const [baseA, baseB] = Engine.getBaseNames() || [null, null];

    pointCountEl.textContent = names.length;
    pointsTableBody.innerHTML = '';
    if (names.length === 0) {
      pointsTableBody.innerHTML = `<tr class="empty-row"><td colspan="4">ยังไม่มีจุด</td></tr>`;
    } else {
      names.forEach(name => {
        const p = Engine.getPoint(name);
        const tr = document.createElement('tr');
        const isBase = p.isBase;
        tr.innerHTML = `
          <td>${escapeHtml(name)}${isBase ? `<span class="tag-base">${name === baseA ? 'BASE A' : 'BASE B'}</span>` : ''}</td>
          <td>${p.error ? '⚠' : p.x.toFixed(3)}</td>
          <td>${p.error ? '⚠' : p.y.toFixed(3)}</td>
          <td class="actions-cell">
            <button class="btn btn--ghost btn--small" data-action="edit-point" data-name="${escapeHtml(name)}">แก้ไข</button>
            <button class="btn btn--danger-ghost btn--small" data-action="delete-point" data-name="${escapeHtml(name)}">ลบ</button>
          </td>
        `;
        pointsTableBody.appendChild(tr);
      });
    }

    const edges = Engine.getEdges();
    edgeCountEl.textContent = edges.length;
    edgesTableBody.innerHTML = '';
    if (edges.length === 0) {
      edgesTableBody.innerHTML = `<tr class="empty-row"><td colspan="3">ยังไม่มีเส้น</td></tr>`;
    } else {
      edges.forEach(edge => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(edge.from)} – ${escapeHtml(edge.to)}${edge.isBase ? '<span class="tag-base">BASE</span>' : ''}</td>
          <td>${Number.isNaN(edge.length) ? '⚠ ERR' : edge.length.toFixed(3)}</td>
          <td class="actions-cell">
            <button class="btn btn--ghost btn--small" data-action="edit-edge" data-id="${escapeHtml(edge.id)}">แก้ไข</button>
          </td>
        `;
        edgesTableBody.appendChild(tr);
      });
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'edit-point') {
      selectItem({ type: 'point', id: btn.dataset.name });
    } else if (action === 'delete-point') {
      const name = btn.dataset.name;
      const confirmed = window.confirm(`ลบจุด "${name}" และจุดลูกทั้งหมดที่เกี่ยวข้อง?`);
      if (!confirmed) return;
      const r = Engine.deletePoint(name);
      if (!r.ok) { showToast(r.error, true); return; }
      populateRefSelectors();
      refreshAll();
      showToast(r.clearedAll ? 'ลบจุดฐาน — ล้างโครงข่ายทั้งหมดแล้ว' : `ลบจุด ${r.removed.join(', ')} แล้ว`);
    } else if (action === 'edit-edge') {
      selectItem({ type: 'edge', id: btn.dataset.id });
    }
  });

  // ========================================================= ZOOM / FIT
  btnFit.addEventListener('click', () => { renderer.fitToView(); updateZoomLabel(); });
  zoomInBtn.addEventListener('click', () => { renderer.zoomBy(1.2); updateZoomLabel(); });
  zoomOutBtn.addEventListener('click', () => { renderer.zoomBy(1 / 1.2); updateZoomLabel(); });

  function updateZoomLabel() {
    zoomLevelEl.textContent = `${renderer.getZoomPercent()}%`;
  }
  // อัปเดตป้ายซูมทุกครั้งที่มีการ wheel/pinch (renderer วาดใหม่ตลอด จึงตั้ง interval เบา ๆ)
  setInterval(updateZoomLabel, 300);

  // =============================================================== EXPORT
  btnExportCsv.addEventListener('click', () => {
    const names = Engine.getPointNames();
    if (names.length === 0) { showToast('ยังไม่มีข้อมูลให้ Export', true); return; }
    let csv = 'Point,X,Y\n';
    names.forEach(n => {
      const p = Engine.getPoint(n);
      csv += `${n},${p.x.toFixed(4)},${p.y.toFixed(4)}\n`;
    });
    downloadFile(csv, 'trilateration_coordinates.csv', 'text/csv;charset=utf-8;');
    showToast('Export CSV สำเร็จ');
  });

  btnExportJson.addEventListener('click', () => {
    const names = Engine.getPointNames();
    if (names.length === 0) { showToast('ยังไม่มีข้อมูลให้ Export', true); return; }
    const data = {
      points: names.map(n => {
        const p = Engine.getPoint(n);
        return { name: n, x: +p.x.toFixed(4), y: +p.y.toFixed(4), isBase: !!p.isBase, refA: p.refA || null, refB: p.refB || null, distA: p.distA ?? null, distB: p.distB ?? null, flip: p.flip ?? null };
      }),
      edges: Engine.getEdges().map(e => ({ from: e.from, to: e.to, length: +e.length.toFixed(4), isBase: e.isBase })),
      exportedAt: new Date().toISOString()
    };
    downloadFile(JSON.stringify(data, null, 2), 'trilateration_coordinates.json', 'application/json');
    showToast('Export JSON สำเร็จ');
  });

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  btnReset.addEventListener('click', () => {
    if (Engine.getPointNames().length === 0) return;
    const confirmed = window.confirm('ล้างข้อมูลทั้งหมด (จุดและเส้นทุกจุด)? การกระทำนี้ไม่สามารถย้อนกลับได้');
    if (!confirmed) return;
    Engine.reset();
    selection = null;
    renderer.setSelected(null);
    populateRefSelectors();
    refreshAll();
    renderer.fitToView();
    showToast('ล้างข้อมูลทั้งหมดแล้ว');
    switchToTab('setup');
  });

  // ============================================================ REFRESH
  function refreshAll() {
    const state = Engine.getState();
    const edges = Engine.getEdges();
    renderer.setData(state.points, edges);
    renderTables();
    updateHud();
    stageEmpty.classList.toggle('is-visible', state.order.length === 0);
  }

  // =============================================================== INIT
  function init() {
    populateRefSelectors();
    // ให้ renderer มีขนาดถูกต้องก่อนคำนวณ fit ครั้งแรก
    requestAnimationFrame(() => {
      refreshAll();
      renderer.fitToView();
      updateZoomLabel();
    });
  }

  init();
})();
