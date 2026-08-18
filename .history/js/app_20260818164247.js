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
  const baseAngle = $('#baseAngle');
  const baseMsg = $('#baseMsg');

  const btnSaveProject = $('#btnSaveProject');
  const btnLoadProject = $('#btnLoadProject');
  const fileLoadProject = $('#fileLoadProject');

  const formAdd = $('#formAdd');
  const refASel = $('#refA');
  const refBSel = $('#refB');
  const distAInput = $('#distA');
  const distBInput = $('#distB');
  const newNameInput = $('#newName');
  const flipSideInput = $('#flipSide');
  const addMsg = $('#addMsg');

  const formClosure = $('#formClosure');
  const clEdgeA = $('#clEdgeA');
  const clEdgeB = $('#clEdgeB');
  const closureMsg = $('#closureMsg');
  const formMeasurePt = $('#formMeasurePt');
  const clPointA = $('#clPointA');
  const clPointB = $('#clPointB');
  const measurePtMsg = $('#measurePtMsg');

  const pointsTableBody = $('#pointsTable tbody');
  const edgesTableBody = $('#edgesTable tbody');
  const pointCountEl = $('#pointCount');
  const edgeCountEl = $('#edgeCount');

  // const hudBadge = $('#hudBadge');
  // const hudX = $('#hudX');
  // const hudY = $('#hudY');

  const btnFit = $('#btnFit');
  const zoomInBtn = $('#zoomIn');
  const zoomOutBtn = $('#zoomOut');
  const zoomLevelEl = $('#zoomLevel');
  const toggleCoords = $('#toggleCoords');

  const btnExportCsv = $('#btnExportCsv');
  const btnExportJson = $('#btnExportJson');
  const btnExportDxf = $('#btnExportDxf');
  const btnExportPdf = $('#btnExportPdf');
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
    (sel) => { onCanvasSelect(sel); },
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
      parseFloat(baseLength.value),
      baseAngle.value === '' ? 0 : parseFloat(baseAngle.value)
    );
    if (!result.ok) {
      setMsg(baseMsg, result.error, true);
      return;
    }
    setMsg(baseMsg, `วางเส้นฐาน ${result.names[0]}–${result.names[1]} สำเร็จ`, false);
    formBase.reset();
    populateRefSelectors();
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

  // ============================================= STEP 3 : CLOSURE (เส้นวัด)
  formClosure.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = Engine.addClosureEdge(clEdgeA.value, clEdgeB.value);
    if (!result.ok) {
      setMsg(closureMsg, result.error, true);
      return;
    }
    setMsg(closureMsg, `สร้างเส้น ${result.from}–${result.to} แล้ว (จุดร่วม ${result.shared}) ยาว ${result.length.toFixed(3)} ม.`, false);
    refreshAll();
    clearPicks();
  });

  function populateClosureSelectors() {
    const edges = Engine.getEdges();
    [clEdgeA, clEdgeB].forEach((sel, idx) => {
      const prevVal = sel.value;
      sel.innerHTML = '';
      if (edges.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'ยังไม่มีเส้น';
        opt.value = '';
        sel.appendChild(opt);
        sel.disabled = true;
        return;
      }
      sel.disabled = false;
      edges.forEach(edge => {
        const opt = document.createElement('option');
        opt.value = edge.id;
        opt.textContent = `${edge.from}–${edge.to}`;
        sel.appendChild(opt);
      });
      if (edges.some(e => e.id === prevVal)) {
        sel.value = prevVal;
      } else if (idx === 0) {
        sel.value = edges[Math.max(0, edges.length - 2)].id;
      } else {
        sel.value = edges[edges.length - 1].id;
      }
    });
  }

  // ====================== MEASURE MODE (toggle + คลิกเลือกบนหน้าจอ) ==========
  const measureModeBtns = document.querySelectorAll('[data-measure-mode]');
  let measureMode = 'edge';             // 'edge' | 'point'
  let pickEdge = { a: null, b: null };  // edge ids ของ เส้นที่ 1/2
  let pickPoint = { a: null, b: null }; // ชื่อจุด ของ จุดที่ 1/2

  function switchMeasureMode(mode) {
    measureMode = mode;
    measureModeBtns.forEach(b => b.classList.toggle('is-active', b.dataset.measureMode === mode));
    formClosure.style.display = mode === 'edge' ? '' : 'none';
    formMeasurePt.style.display = mode === 'point' ? '' : 'none';
    clearPicks();
  }

  measureModeBtns.forEach(btn => {
    btn.addEventListener('click', () => switchMeasureMode(btn.dataset.measureMode));
  });

  function clearPicks() {
    pickEdge = { a: null, b: null };
    pickPoint = { a: null, b: null };
    selection = null;
    renderer.setSelected(null);
    // updateHud();
  }

  /** นำค่าที่คลิกเลือกไปใส่ช่องดรอปดาวน์ที่ตรงกัน ให้เห็น "เส้นที่1/2" หรือ "จุดที่1/2" */
  function syncPicksToSelects() {
    if (measureMode === 'edge') {
      clEdgeA.value = pickEdge.a || clEdgeA.value;
      clEdgeB.value = pickEdge.b || clEdgeB.value;
    } else {
      clPointA.value = pickPoint.a || clPointA.value;
      clPointB.value = pickPoint.b || clPointB.value;
    }
  }

  /** ตอนอยู่แท็บ "เส้นวัด": คลิกเส้น/จุดบนหน้าจอ = เติม เส้นที่1/2 หรือ จุดที่1/2 (ไม่เปิดป็อปอัพ, ไม่ auto-create) */
  function handleMeasurePick(sel) {
    if (!sel) return;
    const isEdgeMode = measureMode === 'edge';
    const msgEl = isEdgeMode ? closureMsg : measurePtMsg;
    const label = isEdgeMode ? 'เส้น' : 'จุด';
    if (isEdgeMode && sel.type !== 'edge') { showToast(`โหมดนี้ให้คลิก${label} 2 ${label}`, true); return; }
    if (!isEdgeMode && sel.type !== 'point') { showToast(`โหมดนี้ให้คลิก${label} 2 ${label}`, true); return; }

    const arr = isEdgeMode ? pickEdge : pickPoint;
    const id = sel.id;

    // ถ้าจับคู่ครบแล้ว -> เริ่มคู่ใหม่
    if (arr.a !== null && arr.b !== null) { arr.a = null; arr.b = null; }

    if (arr.a === null) {
      arr.a = id;
      setMsg(msgEl, `เลือก${label}ที่ 1 แล้ว — คลิก${label}อีก 1 เพื่อเป็น${label}ที่ 2`, false);
    } else if (arr.a === id) {
      showToast(`เลือก${label}นี้ไว้แล้ว — กรุณาเลือก${label}อื่น`, true);
      return;
    } else {
      arr.b = id;
      setMsg(msgEl, `ครบ ${label}ที่ 1 + ${label}ที่ 2 — กดปุ่ม "สร้าง" ได้เลย`, false);
    }
    syncPicksToSelects();
    selection = sel;
    renderer.setSelected(sel);
    // updateHud();
  }

  /** handler คลิกบนหน้าจอ: ถ้าอยู่แท็บ "เส้นวัด" ให้เลือกเส้น/จุด, แท็บอื่นใช้ work flow เดิม */
  function onCanvasSelect(sel) {
    const activeTab = document.querySelector('.tab.is-active')?.dataset.tab;
    if (activeTab === 'line') {
      handleMeasurePick(sel);
      return;
    }
    selectItem(sel);
  }

  // เพิ่มเส้นวัดจาก 2 จุด (โหมด "จาก 2 จุด")
  formMeasurePt.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = pickPoint.a || clPointA.value;
    const b = pickPoint.b || clPointB.value;
    const result = Engine.addExtraEdge(a, b);
    if (!result.ok) { setMsg(measurePtMsg, result.error, true); return; }
    setMsg(measurePtMsg, `เพิ่มเส้นวัด ${result.from}–${result.to} แล้ว ยาว ${result.length.toFixed(3)} ม.`, false);
    refreshAll();
    clearPicks();
  });

  function populatePointMeasureSelectors() {
    const names = Engine.getPointNames();
    [clPointA, clPointB].forEach((sel, idx) => {
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
      if (names.includes(prevVal)) sel.value = prevVal;
      else if (idx === 0) sel.value = names[Math.max(0, names.length - 2)];
      else sel.value = names[names.length - 1];
    });
  }

  // ============================================================ SELECTION
  function selectItem(sel) {
    selection = sel;
    renderer.setSelected(sel);
    // updateHud();
    if (!sel) return;

    if (sel.type === 'edge') {
      const edge = Engine.getEdges().find(e => e.id === sel.id);
      if (edge) applyEdgeAsReference(edge);
    }

    const activeTab = document.querySelector('.tab.is-active')?.dataset.tab;
    if (activeTab === 'add' && sel.type === 'edge') {
      // อยู่ในแท็บ "เพิ่มจุด" และเลือกเส้น -> ตั้งจุดอ้างอิงให้แล้ว ไม่ต้องเปิดโมดัลรบกวน
      return;
    }
    openEditModal(sel);
  }

  /** ตั้งค่าจุดอ้างอิงที่ 1/2 ในฟอร์ม "เพิ่มจุด" ให้ตรงกับปลายทั้งสองของเส้นที่เลือก */
  function applyEdgeAsReference(edge) {
    if (refASel.disabled || refBSel.disabled) return;
    refASel.value = edge.from;
    refBSel.value = edge.to;
    showToast(`ตั้งจุดอ้างอิงเป็น "${edge.from}" และ "${edge.to}" ให้แล้ว`);
  }

  // function updateHud() {
  //   if (!selection || selection.type !== 'point') {
  //     hudBadge.textContent = '—';
  //     hudX.textContent = '0.000';
  //     hudY.textContent = '0.000';
  //     return;
  //   }
  //   const p = Engine.getPoint(selection.id);
  //   if (!p) return;
  //   hudBadge.textContent = selection.id;
  //   hudX.textContent = p.x.toFixed(3);
  //   hudY.textContent = p.y.toFixed(3);
  // }

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
          <input type="number" id="mBaseLen" step="any" min="0.001" value="${Engine.distance(Engine.getPoint(nameA), p).toFixed(3)}">
        </label>
        <p class="panel__hint" style="margin:0;">ต้องการหมุนทิศทาง? ปิดหน้าต่างนี้แล้วคลิกเลือก "เส้น A–B" บน Canvas หรือในตารางแทน</p>` : ''}
      `;
    } else {
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
    editingContext = { kind: 'edge', edge };
    modalTitle.textContent = `แก้ไขเส้น ${edge.from}–${edge.to}`;

    const currentAngle = Engine.getEdgeAngle(edge.from, edge.to);
    const angleText = currentAngle === null ? '—' : currentAngle.toFixed(3);
    const lengthFieldHtml = edge.isBase
      ? `<label class="field">
           <span>ระยะ ${edge.from}–${edge.to} (เมตร)</span>
           <input type="number" id="mBaseLen" step="any" min="0.001" value="${edge.length.toFixed(3)}">
         </label>`
      : edge.isExtra
        ? `<div class="rotate-box" style="margin-top:0;">
             <p class="panel__hint" style="margin:0;">เส้นวัด (closure) — ความยาวคำนวณจากพิกัดจริงโดยอัตโนมัติ</p>
             <p class="panel__hint" style="margin:6px 0 0;"><strong>ความยาว ${edge.from}–${edge.to}:</strong>
               <span style="color:var(--cyan);font-family:var(--font-mono);">${edge.length.toFixed(3)} ม.</span></p>
           </div>`
        : `<p class="panel__hint" style="margin:0 0 6px;">
             เส้นนี้คือระยะจาก "${edge.from}" ไปยัง "${edge.to}" (แก้ไขระยะของจุด ${edge.to})
           </p>
           <label class="field">
             <span>ระยะ ${edge.from}–${edge.to} (เมตร)</span>
             <input type="number" id="mEdgeLen" step="any" min="0.001" value="${edge.length.toFixed(3)}">
           </label>`;

    modalBody.innerHTML = `
      ${lengthFieldHtml}

      <div class="rotate-box">
        <p class="panel__hint" style="margin:0 0 8px;">
          🧭 <strong>ตั้งเส้นนี้เป็นแนวอ้างอิง</strong> — ถ้ารู้ว่าเส้นนี้คือแนวนอน/แนวตั้งจริงของแบบ
          หมุนทั้งโครงข่ายให้เข้ากับมุมนี้ได้ทันที (ระยะทุกเส้นจะไม่เปลี่ยนแปลง)
        </p>
        <p class="panel__hint" style="margin:0 0 8px;">มุมทิศทางปัจจุบันของเส้นนี้: <strong style="color:var(--cyan)">${angleText}°</strong></p>
        <label class="field">
          <span>ตั้งมุมทิศทางใหม่ (องศา)</span>
          <input type="number" id="mRotateAngle" step="any" placeholder="เช่น 0">
        </label>
        <div class="quick-angle-row">
          <button type="button" class="btn btn--ghost btn--small" data-quick-angle="0">แนวนอน 0°</button>
          <button type="button" class="btn btn--ghost btn--small" data-quick-angle="90">แนวตั้ง 90°</button>
          <button type="button" class="btn btn--ghost btn--small" data-quick-angle="180">แนวนอน 180°</button>
          <button type="button" class="btn btn--ghost btn--small" data-quick-angle="270">แนวตั้ง 270°</button>
        </div>
        <button type="button" class="btn btn--accent" id="mApplyRotate" style="width:100%;margin-top:10px;">
          🧭 หมุนทั้งโครงข่ายให้เส้นนี้เป็นมุมที่ตั้ง
        </button>
      </div>
    `;

    // ปุ่มลัดตั้งค่ามุม
    modalBody.querySelectorAll('[data-quick-angle]').forEach(btn => {
      btn.addEventListener('click', () => {
        $('#mRotateAngle').value = btn.dataset.quickAngle;
      });
    });

    // ปุ่มหมุนทั้งโครงข่าย (แยกอิสระจากปุ่ม "บันทึก" หลัก เพราะกระทบทุกจุดในภาพ)
    $('#mApplyRotate').addEventListener('click', () => {
      const angleVal = $('#mRotateAngle').value;
      if (angleVal === '') {
        showToast('กรุณากรอกหรือเลือกมุมทิศทางก่อน', true);
        return;
      }
      const confirmed = window.confirm(
        `หมุนทั้งโครงข่ายให้เส้น ${edge.from}–${edge.to} เป็นมุม ${angleVal}° ?\nจุดทุกจุดจะถูกคำนวณตำแหน่งใหม่ (ระยะทางระหว่างจุดจะไม่เปลี่ยนแปลง)`
      );
      if (!confirmed) return;
      const r = Engine.rotateNetworkToEdgeAngle(edge.from, edge.to, parseFloat(angleVal));
      if (!r.ok) { showToast(r.error, true); return; }
      hideModal();
      populateRefSelectors();
      refreshAll();
      renderer.fitToView();
      updateZoomLabel();
      showToast(`หมุนโครงข่ายให้เส้น ${edge.from}–${edge.to} เป็นมุม ${angleVal}° สำเร็จ`);
    });

    modalDelete.style.display = edge.isExtra ? '' : 'none'; // เส้นวัดลบได้โดยตรง, เส้นโครงสร้างลบผ่านการลบจุดปลายทางแทน
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
        // เปลี่ยนชื่อก่อน (ถ้ามี) แล้วค่อยอัปเดตความยาว (คงมุมทิศทางเดิม)
        if (newName && newName !== name) {
          const r = Engine.renamePoint(name, newName);
          if (!r.ok) { showToast(r.error, true); return; }
        }
        if (baseLenInput) {
          const r2 = Engine.updateBaseGeometry({ length: baseLenInput.value });
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
      if (edge.isExtra) {
        // เส้นวัดไม่มีค่าความยาวให้แก้ -> ปิดโมดัลเฉย ๆ
      } else if (edge.isBase) {
        const r = Engine.updateBaseGeometry({ length: $('#mBaseLen').value });
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
    if (!editingContext) return;
    if (editingContext.kind === 'edge' && editingContext.edge.isExtra) {
      const edge = editingContext.edge;
      const confirmed = window.confirm(`ลบเส้นวัด ${edge.from} – ${edge.to} ?`);
      if (!confirmed) return;
      Engine.removeExtraEdge(edge.from, edge.to);
      hideModal();
      refreshAll();
      showToast(`ลบเส้นวัด ${edge.from} – ${edge.to} แล้ว`);
      return;
    }
    if (editingContext.kind !== 'point') return;
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
    // updateHud();
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
          <td>${escapeHtml(edge.from)} – ${escapeHtml(edge.to)}${edge.isBase ? '<span class="tag-base">BASE</span>' : ''}${edge.isExtra ? '<span class="tag-base">MEASURE</span>' : ''}</td>
          <td>${Number.isNaN(edge.length) ? '⚠ ERR' : edge.length.toFixed(3)}</td>
          <td class="actions-cell">
            <button class="btn btn--ghost btn--small" data-action="edit-edge" data-id="${escapeHtml(edge.id)}">แก้ไข</button>
            ${edge.isExtra ? `<button class="btn btn--danger-ghost btn--small" data-action="delete-extra-edge" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}">ลบ</button>` : ''}
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
      // กดปุ่ม "แก้ไข" ในตารางถือเป็นความตั้งใจแก้ไขเส้นโดยตรง -> เปิดโมดัลเสมอ
      // (ต่างจากคลิกเลือกเส้นบน Canvas ขณะอยู่แท็บ "เพิ่มจุด" ซึ่งจะแค่ตั้งจุดอ้างอิงให้)
      const id = btn.dataset.id;
      selection = { type: 'edge', id };
      renderer.setSelected(selection);
      // updateHud();
      const edge = Engine.getEdges().find(e => e.id === id);
      if (edge) applyEdgeAsReference(edge);
      openEditModal(selection);
    } else if (action === 'delete-extra-edge') {
      const from = btn.dataset.from, to = btn.dataset.to;
      const confirmed = window.confirm(`ลบเส้นวัด ${from} – ${to} ?`);
      if (!confirmed) return;
      Engine.removeExtraEdge(from, to);
      refreshAll();
      showToast(`ลบเส้นวัด ${from} – ${to} แล้ว`);
    }
  });

  // ========================================================= ZOOM / FIT
  btnFit.addEventListener('click', () => { renderer.fitToView(); updateZoomLabel(); });
  zoomInBtn.addEventListener('click', () => { renderer.zoomBy(1.2); updateZoomLabel(); });
  zoomOutBtn.addEventListener('click', () => { renderer.zoomBy(1 / 1.2); updateZoomLabel(); });

  // สลับแสดง/ซ่อนตัวเลขพิกัดบนหน้าจอ
  toggleCoords.addEventListener('change', () => {
    renderer.showCoords = toggleCoords.checked;
    renderer.draw();
  });

  function updateZoomLabel() {
    zoomLevelEl.textContent = `${renderer.getZoomPercent()}%`;
  }
  // อัปเดตป้ายซูมทุกครั้งที่มีการ wheel/pinch (renderer วาดใหม่ตลอด จึงตั้ง interval เบา ๆ)
  setInterval(updateZoomLabel, 300);

  // ================================================ SAVE / LOAD PROJECT
  // บันทึกโปรเจกต์ทั้งหมด (ระยะ/จุดอ้างอิง/มุม) เป็นไฟล์ .json เพื่อนำกลับมาโหลดแก้ไขต่อได้
  btnSaveProject.addEventListener('click', () => {
    if (Engine.getPointNames().length === 0) {
      showToast('ยังไม่มีข้อมูลให้บันทึก', true);
      return;
    }
    const project = Engine.exportProject();
    const dateTag = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadFile(JSON.stringify(project, null, 2), `trilateration_project_${dateTag}.json`, 'application/json');
    showToast('บันทึกโปรเจกต์สำเร็จ — เก็บไฟล์นี้ไว้เปิดกลับมาทำต่อได้');
  });

  // เปิด file picker เมื่อกดปุ่ม "โหลดโปรเจกต์"
  btnLoadProject.addEventListener('click', () => {
    fileLoadProject.value = ''; // เคลียร์ค่าเดิม เผื่อเลือกไฟล์เดิมซ้ำ
    fileLoadProject.click();
  });

  fileLoadProject.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const proceed = () => {
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try {
          data = JSON.parse(reader.result);
        } catch (err) {
          showToast('ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง', true);
          return;
        }
        const result = Engine.loadProject(data);
        if (!result.ok) {
          showToast(result.error, true);
          return;
        }
        selection = null;
        renderer.setSelected(null);
        populateRefSelectors();
        refreshAll();
        renderer.fitToView();
        updateZoomLabel();
        switchToTab('table');
        showToast(`โหลดโปรเจกต์สำเร็จ (${result.pointCount} จุด) — แก้ไขต่อได้เลย`);
      };
      reader.onerror = () => showToast('อ่านไฟล์ไม่สำเร็จ', true);
      reader.readAsText(file);
    };

    if (Engine.getPointNames().length > 0) {
      const confirmed = window.confirm('การโหลดโปรเจกต์จะแทนที่ข้อมูลปัจจุบันทั้งหมด ต้องการดำเนินการต่อหรือไม่?');
      if (!confirmed) return;
    }
    proceed();
  });

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

  btnExportDxf.addEventListener('click', () => {
    const names = Engine.getPointNames();
    if (names.length === 0) { showToast('ยังไม่มีข้อมูลให้ Export', true); return; }
    const dxf = DXF.build(Engine.getState().points, Engine.getEdges());
    downloadFile(dxf, 'trilateration_export.dxf', 'application/dxf');
    showToast('Export DXF สำเร็จ — เปิดใน CAD (หน่วย: เมตร)');
  });

  btnExportPdf.addEventListener('click', () => {
    const names = Engine.getPointNames();
    if (names.length === 0) { showToast('ยังไม่มีข้อมูลให้ Export', true); return; }
    const pdf = PDF.build(Engine.getState().points, Engine.getEdges());
    downloadFile(pdf, 'trilateration_export.pdf', 'application/pdf');
    showToast('Export PDF สำเร็จ — วางใน ArchiCAD ที่สเกล 1:1');
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
    populateClosureSelectors();
    populatePointMeasureSelectors();
    // updateHud();
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
