(function () {
  const state = LDD.state;
  let autosaveTimer = null;

  const els = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    imageFileName: document.getElementById('imageFileName'),

    deedRai: document.getElementById('deedRai'),
    deedNgan: document.getElementById('deedNgan'),
    deedWa: document.getElementById('deedWa'),
    deedM2Display: document.getElementById('deedM2Display'),

    btnToggleTrace: document.getElementById('btnToggleTrace'),
    btnClosePolygon: document.getElementById('btnClosePolygon'),
    btnUndoNode: document.getElementById('btnUndoNode'),
    btnClearPolygon: document.getElementById('btnClearPolygon'),
    nodeCount: document.getElementById('nodeCount'),

    btnSetScaleDistance: document.getElementById('btnSetScaleDistance'),
    btnAutoScaleArea: document.getElementById('btnAutoScaleArea'),
    scaleInfo: document.getElementById('scaleInfo'),

    resultAreaPx: document.getElementById('resultAreaPx'),
    resultAreaM2: document.getElementById('resultAreaM2'),
    resultRaiNganWa: document.getElementById('resultRaiNganWa'),
    resultDiff: document.getElementById('resultDiff'),

    projectNameInput: document.getElementById('projectNameInput'),
    btnSaveProject: document.getElementById('btnSaveProject'),
    btnLoadProjectTrigger: document.getElementById('btnLoadProjectTrigger'),
    fileLoadProject: document.getElementById('fileLoadProject'),
    btnLoadAutosave: document.getElementById('btnLoadAutosave'),
    btnNewProject: document.getElementById('btnNewProject'),

    btnExportDXF: document.getElementById('btnExportDXF'),
    btnExportPDF: document.getElementById('btnExportPDF'),

    canvasWrapper: document.getElementById('canvasWrapper'),
    mainCanvas: document.getElementById('mainCanvas'),
    zoomLevel: document.getElementById('zoomLevel'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnZoomFit: document.getElementById('btnZoomFit'),
    btnZoomReset: document.getElementById('btnZoomReset'),
    btnPanMode: document.getElementById('btnPanMode'),

    statusBar: document.getElementById('statusBar')
  };

  function defaultProjectName() {
    return 'โฉนดที่ดิน-' + new Date().toISOString().slice(0, 10);
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      LDD.project.autosave(state);
      els.btnLoadAutosave.disabled = false;
    }, 800);
  }

  function updateResults() {
    els.nodeCount.textContent = state.nodes.length;

    const areaPx = state.nodes.length >= 3 ? LDD.utils.polygonAreaPx(state.nodes) : 0;
    const mpp = state.metersPerPixel;
    const areaM2 = mpp && state.nodes.length >= 3 ? areaPx * mpp * mpp : null;
    const deedM2 = LDD.utils.raiNganWaToM2(state.deed.rai, state.deed.ngan, state.deed.wa);

    els.resultAreaPx.textContent = state.nodes.length >= 3 ? LDD.utils.fmt(areaPx, 1) + ' px²' : '-';
    els.resultAreaM2.textContent = areaM2 != null ? LDD.utils.fmt(areaM2, 2) + ' ตร.ม.' : (state.nodes.length >= 3 ? 'ยังไม่ได้ตั้งสเกล' : '-');

    if (areaM2 != null) {
      const rnw = LDD.utils.m2ToRaiNganWa(areaM2);
      els.resultRaiNganWa.textContent = rnw.rai + ' ไร่ ' + rnw.ngan + ' งาน ' + rnw.wa.toFixed(1) + ' ตร.วา';
    } else {
      els.resultRaiNganWa.textContent = '-';
    }

    if (areaM2 != null && deedM2 > 0) {
      const diff = areaM2 - deedM2;
      const diffPct = (diff / deedM2) * 100;
      els.resultDiff.textContent = (diff >= 0 ? '+' : '') + LDD.utils.fmt(diff, 2) + ' ตร.ม. (' + (diffPct >= 0 ? '+' : '') + diffPct.toFixed(2) + '%)';
      els.resultDiff.className = 'result-value ' + (Math.abs(diffPct) < 0.5 ? 'ok' : 'warn');
    } else {
      els.resultDiff.textContent = '-';
      els.resultDiff.className = 'result-value';
    }

    els.scaleInfo.textContent = mpp ? ('1 พิกเซล ≈ ' + mpp.toFixed(6) + ' เมตร (ประมาณ 1:' + Math.round(1 / mpp) + ')') : 'ยังไม่ได้ตั้งสเกล';
    els.deedM2Display.textContent = LDD.utils.fmt(deedM2, 2) + ' ตร.ม.';

    els.btnAutoScaleArea.disabled = !(state.nodes.length >= 3 && deedM2 > 0);
    els.btnExportDXF.disabled = !(mpp && state.nodes.length >= 2);
    els.btnExportPDF.disabled = state.nodes.length < 2;
    els.btnClosePolygon.disabled = state.nodes.length < 3 || state.closed;
    els.btnUndoNode.disabled = state.nodes.length === 0;
  }

  function updateZoomLabel() {
    els.zoomLevel.textContent = Math.round(state.view.zoom * 100) + '%';
  }

  function updateStatus() {
    let text = 'พร้อมใช้งาน';
    if (state.mode === 'trace') text = 'โหมดวาดรูปหลายเหลี่ยม — คลิกบนภาพเพื่อปักหมุด, คลิกจุดแรก (สีส้ม) เพื่อปิดรูป, กด Esc เพื่อออก';
    else if (state.mode === 'scaleLine') text = 'โหมดตั้งสเกล — คลิกจุดที่ 1 แล้วคลิกจุดที่ 2 บนภาพเพื่อระบุระยะจริง';
    else if (state.mode === 'pan') text = 'โหมดเลื่อนภาพ — ลากเพื่อเลื่อนมุมมอง';
    else text = 'พร้อมใช้งาน — คลิกจุดเพื่อเลือก/ลาก, คลิกขวาเพื่อลบจุด, เลื่อนล้อเมาส์เพื่อซูม';
    els.statusBar.textContent = text;

    els.btnToggleTrace.classList.toggle('active', state.mode === 'trace');
    els.btnPanMode.classList.toggle('active', state.mode === 'pan');
    els.btnSetScaleDistance.classList.toggle('active', state.mode === 'scaleLine');
  }

  function handleCanvasUpdate() {
    updateResults();
    updateZoomLabel();
    scheduleAutosave();
  }

  function loadImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result;
      const img = new Image();
      img.onload = () => {
        state.image = img;
        state.imageDataURL = dataURL;
        state.imageName = file.name;
        els.imageFileName.textContent = file.name;
        LDD.canvas.setImage(img);
        updateResults();
        updateZoomLabel();
        scheduleAutosave();
      };
      img.src = dataURL;
    };
    reader.readAsDataURL(file);
  }

  function loadFromProjectData(data) {
    state.image = null;
    state.imageDataURL = data.imageDataURL || null;
    state.imageName = data.imageName || '';
    state.nodes = data.nodes || [];
    state.closed = !!data.closed;
    state.metersPerPixel = data.metersPerPixel || null;
    state.calibrationLine = data.calibrationLine || null;
    state.deed = data.deed || { rai: 0, ngan: 0, wa: 0 };
    state.projectName = data.projectName || defaultProjectName();
    state.mode = 'idle';
    state.selectedNode = -1;
    state.scaleLinePoints = [];

    els.deedRai.value = state.deed.rai;
    els.deedNgan.value = state.deed.ngan;
    els.deedWa.value = state.deed.wa;
    els.projectNameInput.value = state.projectName;
    els.imageFileName.textContent = state.imageName || 'ยังไม่ได้เลือกไฟล์';

    if (state.imageDataURL) {
      const img = new Image();
      img.onload = () => { LDD.canvas.setImage(img); updateResults(); updateZoomLabel(); };
      img.src = state.imageDataURL;
    } else {
      LDD.canvas.render();
      updateResults();
      updateZoomLabel();
    }
    updateStatus();
  }

  function resetState() {
    state.image = null;
    state.imageDataURL = null;
    state.imageName = '';
    state.nodes = [];
    state.closed = false;
    state.view = { zoom: 1, panX: 0, panY: 0 };
    state.metersPerPixel = null;
    state.calibrationLine = null;
    state.deed = { rai: 0, ngan: 0, wa: 0 };
    state.mode = 'idle';
    state.scaleLinePoints = [];
    state.selectedNode = -1;
    state.projectName = defaultProjectName();

    els.deedRai.value = 0;
    els.deedNgan.value = 0;
    els.deedWa.value = 0;
    els.imageFileName.textContent = 'ยังไม่ได้เลือกไฟล์';
    els.projectNameInput.value = state.projectName;

    LDD.canvas.render();
    updateResults();
    updateZoomLabel();
    updateStatus();
  }

  function init() {
    els.projectNameInput.value = defaultProjectName();
    state.projectName = els.projectNameInput.value;

    LDD.canvas.init(els.mainCanvas, els.canvasWrapper);
    LDD.canvas.onUpdate = handleCanvasUpdate;

    // --- Image upload ---
    els.dropzone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) loadImageFile(e.target.files[0]);
    });
    ['dragover', 'dragenter'].forEach(evt =>
      els.dropzone.addEventListener(evt, (e) => { e.preventDefault(); els.dropzone.classList.add('dragover'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      els.dropzone.addEventListener(evt, (e) => { e.preventDefault(); els.dropzone.classList.remove('dragover'); })
    );
    els.dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]);
    });

    // --- Deed area ---
    function clampDeedInput(inp, min, max) {
      let v = parseFloat(inp.value);
      if (isNaN(v)) return;
      const clamped = Math.min(Math.max(v, min), max);
      if (clamped !== v) inp.value = clamped;
    }
    els.deedRai.addEventListener('input', () => {
      clampDeedInput(els.deedRai, 0, Infinity);
      state.deed.rai = parseFloat(els.deedRai.value) || 0;
      updateResults();
      scheduleAutosave();
    });
    els.deedNgan.addEventListener('input', () => {
      // 4 งาน = 1 ไร่ ดังนั้นกรอกได้สูงสุด 3 งาน
      clampDeedInput(els.deedNgan, 0, 3);
      state.deed.ngan = parseFloat(els.deedNgan.value) || 0;
      updateResults();
      scheduleAutosave();
    });
    els.deedWa.addEventListener('input', () => {
      // 100 ตร.วา = 1 งาน ดังนั้นกรอกได้สูงสุด 99.99 ตร.วา
      clampDeedInput(els.deedWa, 0, 99.99);
      state.deed.wa = parseFloat(els.deedWa.value) || 0;
      updateResults();
      scheduleAutosave();
    });

    // --- Drawing tools ---
    els.btnToggleTrace.addEventListener('click', () => {
      state.mode = state.mode === 'trace' ? 'idle' : 'trace';
      state.scaleLinePoints = [];
      updateStatus();
      LDD.canvas.render();
    });
    els.btnClosePolygon.addEventListener('click', () => {
      if (state.nodes.length >= 3) {
        state.closed = true;
        state.mode = 'idle';
        updateResults(); updateStatus(); LDD.canvas.render(); scheduleAutosave();
      }
    });
    els.btnUndoNode.addEventListener('click', () => {
      state.nodes.pop();
      if (state.nodes.length < 3) state.closed = false;
      state.selectedNode = -1;
      updateResults(); LDD.canvas.render(); scheduleAutosave();
    });
    els.btnClearPolygon.addEventListener('click', async () => {
      if (state.nodes.length === 0) return;
      const ok = await LDD.modal.confirm({ title: 'ล้างรูปทั้งหมด', message: 'ต้องการลบจุดและรูปหลายเหลี่ยมทั้งหมดใช่หรือไม่?' });
      if (ok) {
        state.nodes = [];
        state.closed = false;
        state.selectedNode = -1;
        updateResults(); LDD.canvas.render(); scheduleAutosave();
      }
    });

    // --- Scale tools ---
    els.btnSetScaleDistance.addEventListener('click', () => {
      state.mode = state.mode === 'scaleLine' ? 'idle' : 'scaleLine';
      state.scaleLinePoints = [];
      updateStatus();
      LDD.canvas.render();
    });
    els.btnAutoScaleArea.addEventListener('click', async () => {
      const deedM2 = LDD.utils.raiNganWaToM2(state.deed.rai, state.deed.ngan, state.deed.wa);
      if (deedM2 <= 0) { await LDD.modal.alert({ title: 'แจ้งเตือน', message: 'กรุณากรอกเนื้อที่ตามโฉนดก่อน' }); return; }
      if (state.nodes.length < 3) { await LDD.modal.alert({ title: 'แจ้งเตือน', message: 'กรุณาวาดรูปหลายเหลี่ยมอย่างน้อย 3 จุดก่อน' }); return; }
      const areaPx = LDD.utils.polygonAreaPx(state.nodes);
      if (areaPx <= 0) return;
      // Scale Factor = sqrt(Target Area / Current Area) → sets meters-per-pixel directly.
      state.metersPerPixel = Math.sqrt(deedM2 / areaPx);
      state.calibrationLine = null;
      updateResults(); LDD.canvas.render(); scheduleAutosave();
    });

    // --- Project ---
    els.projectNameInput.addEventListener('input', () => {
      state.projectName = els.projectNameInput.value || 'untitled';
      scheduleAutosave();
    });
    els.btnSaveProject.addEventListener('click', () => LDD.project.downloadJSON(state));
    els.btnLoadProjectTrigger.addEventListener('click', () => els.fileLoadProject.click());
    els.fileLoadProject.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          loadFromProjectData(data);
        } catch (err) {
          LDD.modal.alert({ title: 'ผิดพลาด', message: 'ไม่สามารถอ่านไฟล์โปรเจกต์นี้ได้' });
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    els.btnLoadAutosave.addEventListener('click', async () => {
      const data = LDD.project.loadAutosave();
      if (!data) return;
      const ok = await LDD.modal.confirm({ title: 'โหลดข้อมูลอัตโนมัติ', message: 'จะโหลดข้อมูลที่บันทึกไว้ล่าสุด และแทนที่งานปัจจุบัน ใช่หรือไม่?' });
      if (ok) loadFromProjectData(data);
    });
    els.btnNewProject.addEventListener('click', async () => {
      const ok = await LDD.modal.confirm({ title: 'โปรเจกต์ใหม่', message: 'ต้องการเริ่มโปรเจกต์ใหม่หรือไม่? งานปัจจุบันที่ยังไม่ได้บันทึกจะหายไป' });
      if (ok) resetState();
    });

    // --- Export ---
    els.btnExportDXF.addEventListener('click', () => {
      try {
        LDD.exportDXF.download(state, LDD.utils.safeFilename(state.projectName, 'land_plot') + '.dxf');
      } catch (err) {
        LDD.modal.alert({ title: 'ไม่สามารถ Export ได้', message: err.message });
      }
    });
    els.btnExportPDF.addEventListener('click', async () => {
      if (state.nodes.length < 2) return;
      try {
        state.mode = 'idle';
        updateStatus();
        LDD.canvas.zoomFit();

        const canvasEl = LDD.canvas.getEl();
        const defaultRect = LDD.cropTool.computeDefaultRect(state, els.canvasWrapper);
        const picked = await LDD.cropTool.pick(els.canvasWrapper, defaultRect);
        if (!picked) return;

        const cropped = LDD.cropTool.captureImage(canvasEl, picked);
        await LDD.exportPDF.download(state, canvasEl, LDD.utils.safeFilename(state.projectName, 'land_plot') + '.pdf', cropped);
      } catch (err) {
        LDD.modal.alert({ title: 'ไม่สามารถ Export ได้', message: err.message });
      }
    });

    // --- Zoom / pan toolbar ---
    els.btnZoomIn.addEventListener('click', LDD.canvas.zoomIn);
    els.btnZoomOut.addEventListener('click', LDD.canvas.zoomOut);
    els.btnZoomFit.addEventListener('click', LDD.canvas.zoomFit);
    els.btnZoomReset.addEventListener('click', LDD.canvas.zoomReset);
    els.btnPanMode.addEventListener('click', () => {
      state.mode = state.mode === 'pan' ? 'idle' : 'pan';
      updateStatus();
    });

    updateResults();
    updateZoomLabel();
    updateStatus();

    if (LDD.project.hasAutosave()) {
      els.btnLoadAutosave.disabled = false;
      LDD.modal.confirm({
        title: 'พบข้อมูลที่บันทึกไว้อัตโนมัติ',
        message: 'ระบบพบงานที่บันทึกไว้อัตโนมัติจากการใช้งานครั้งก่อน ต้องการโหลดขึ้นมาทำต่อหรือไม่?'
      }).then(ok => {
        if (ok) {
          const data = LDD.project.loadAutosave();
          if (data) loadFromProjectData(data);
        }
      });
    }
  }

  init();
})();
