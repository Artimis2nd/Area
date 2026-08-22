/* main.js — wires DOM controls to State / CanvasEngine / ScaleEngine / exporters. */
(function () {
  "use strict";
  const G = window.LDD.Geometry;
  const Storage = window.LDD.Storage;
  const ScaleEngine = window.LDD.ScaleEngine;

  const state = new window.LDD.State();
  const canvasEl = document.getElementById("mainCanvas");
  const engine = new window.LDD.CanvasEngine(canvasEl, state);
  window.LDD.instance = { state, engine }; // handy for debugging in devtools

  // ---------- element refs ----------
  const el = (id) => document.getElementById(id);
  const projectNameInput = el("projectNameInput");
  const imageInput = el("imageInput");
  const imageNameLabel = el("imageNameLabel");

  const btnDraw = el("btnDraw");
  const btnSelectMode = el("btnSelectMode");
  const btnClosePolygon = el("btnClosePolygon");
  const btnUndoNode = el("btnUndoNode");
  const btnClearPolygon = el("btnClearPolygon");
  const nodeCountLabel = el("nodeCountLabel");
  const polygonStatusLabel = el("polygonStatusLabel");

  const deedRai = el("deedRai"), deedNgan = el("deedNgan"), deedWa = el("deedWa");
  const deedTotalM2Label = el("deedTotalM2Label");

  const btnMeasureMode = el("btnMeasureMode");
  const measureInfo = el("measureInfo");
  const realDistanceInput = el("realDistanceInput");
  const btnApplyDistanceScale = el("btnApplyDistanceScale");
  const btnAutoScaleArea = el("btnAutoScaleArea");
  const calibrationLabel = el("calibrationLabel");
  const currentAreaLabel = el("currentAreaLabel");
  const areaDiffLabel = el("areaDiffLabel");

  const btnSaveLocal = el("btnSaveLocal");
  const btnExportJSON = el("btnExportJSON");
  const importJSONInput = el("importJSONInput");
  const savedProjectsList = el("savedProjectsList");

  const btnExportDXF = el("btnExportDXF");
  const btnExportPDF = el("btnExportPDF");

  const modeIndicator = el("modeIndicator");
  const btnZoomIn = el("btnZoomIn"), btnZoomOut = el("btnZoomOut"), btnFit = el("btnFit");
  const zoomLabel = el("zoomLabel");
  const statusCoords = el("statusCoords");
  const emptyState = el("emptyState");
  const toastContainer = el("toastContainer");

  // ---------- toast ----------
  function showToast(text, type) {
    const div = document.createElement("div");
    div.className = "toast" + (type ? " " + type : "");
    div.textContent = text;
    toastContainer.appendChild(div);
    setTimeout(() => div.remove(), 3600);
  }
  state.on("toast", (t) => showToast(t.text, t.type));

  // ---------- image import ----------
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.data.image = {
          el: img,
          dataUrl: reader.result,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          x: 0,
          y: 0,
          width: img.naturalWidth,
          height: img.naturalHeight,
          name: file.name,
        };
        imageNameLabel.textContent = file.name;
        state.touch("image-loaded");
        engine.fitToImage();
      };
      img.onerror = () => showToast("ไม่สามารถโหลดไฟล์ภาพนี้ได้", "error");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // ---------- polygon drawing controls ----------
  btnDraw.addEventListener("click", () => {
    if (state.data.closed) {
      showToast("รูปหลายเหลี่ยมถูกปิดแล้ว หากต้องการวาดใหม่ให้กด 'ล้างรูปหลายเหลี่ยม' ก่อน", "warn");
      return;
    }
    state.data.mode = "draw";
    state.touch("mode-changed");
  });
  btnSelectMode.addEventListener("click", () => {
    state.data.mode = "select";
    state.touch("mode-changed");
  });
  btnClosePolygon.addEventListener("click", () => engine.closePolygon());
  btnUndoNode.addEventListener("click", () => engine.undoLastNode());
  btnClearPolygon.addEventListener("click", () => {
    if (state.data.nodes.length === 0) return;
    if (!confirm("ล้างรูปหลายเหลี่ยมทั้งหมด?")) return;
    state.data.nodes = [];
    state.data.closed = false;
    state.data.selectedNodeIndex = -1;
    state.data.mode = "select";
    state.touch("nodes-changed");
  });

  // ---------- deed area inputs ----------
  function readDeedInputs() {
    state.data.deed = {
      rai: parseFloat(deedRai.value) || 0,
      ngan: parseFloat(deedNgan.value) || 0,
      wa: parseFloat(deedWa.value) || 0,
    };
    state.touch("deed-changed");
  }
  [deedRai, deedNgan, deedWa].forEach((inp) => inp.addEventListener("input", readDeedInputs));

  // ---------- scale: method 1 (known distance) ----------
  btnMeasureMode.addEventListener("click", () => {
    state.data.mode = "measure";
    state.data.measurePoints = [];
    state.touch("mode-changed");
  });
  btnApplyDistanceScale.addEventListener("click", () => {
    const res = ScaleEngine.calibrateByDistance(state, parseFloat(realDistanceInput.value));
    if (!res.ok) return showToast(res.message, "warn");
    showToast("ปรับสเกลภาพและรูปหลายเหลี่ยมให้ตรงสเกลจริงแล้ว", "success");
    realDistanceInput.value = "";
    engine.fitToContent();
  });

  // ---------- scale: method 2 (auto by area) ----------
  btnAutoScaleArea.addEventListener("click", () => {
    const res = ScaleEngine.autoScaleByArea(state);
    if (!res.ok) return showToast(res.message, "warn");
    showToast(`Auto-Scale สำเร็จ (Scale Factor = ${G.formatNumber(res.scaleFactor, 4)})`, "success");
  });

  // ---------- save / load ----------
  function currentProjectName() {
    return (projectNameInput.value || "").trim() || "โฉนดที่ดิน-ไม่มีชื่อ";
  }
  projectNameInput.addEventListener("input", () => {
    state.data.projectName = currentProjectName();
  });

  function refreshSavedList() {
    const items = Storage.listProjects();
    savedProjectsList.innerHTML = "";
    if (items.length === 0) {
      savedProjectsList.innerHTML = '<div class="saved-empty">ยังไม่มีโปรเจกต์ที่บันทึกไว้</div>';
      return;
    }
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "saved-item";
      const savedDate = item.savedAt ? new Date(item.savedAt).toLocaleString("th-TH") : "";
      row.innerHTML = `
        <span class="name" title="${item.name} — ${savedDate}">${item.name}</span>
        <span class="actions">
          <button class="load" title="โหลด">📂</button>
          <button class="del" title="ลบ">🗑</button>
        </span>`;
      row.querySelector(".load").addEventListener("click", () => {
        const res = Storage.loadProject(state, item.name, () => {
          engine.fitToContent();
        });
        if (!res.ok) return showToast(res.message, "error");
        projectNameInput.value = state.data.projectName;
        syncDeedInputsFromState();
        engine.fitToContent();
        showToast(`โหลดโปรเจกต์ "${item.name}" แล้ว`, "success");
      });
      row.querySelector(".del").addEventListener("click", () => {
        if (!confirm(`ลบโปรเจกต์ "${item.name}"?`)) return;
        Storage.deleteProject(item.name);
        refreshSavedList();
      });
      savedProjectsList.appendChild(row);
    });
  }

  btnSaveLocal.addEventListener("click", () => {
    state.data.projectName = currentProjectName();
    const res = Storage.saveProject(state, state.data.projectName);
    if (!res.ok) return showToast(res.message, "error");
    showToast(`บันทึก "${state.data.projectName}" แล้ว`, "success");
    refreshSavedList();
  });

  btnExportJSON.addEventListener("click", () => {
    state.data.projectName = currentProjectName();
    Storage.exportJSONFile(state);
  });

  importJSONInput.addEventListener("change", () => {
    const file = importJSONInput.files[0];
    if (!file) return;
    Storage.importJSONFile(state, file, () => engine.fitToContent())
      .then(() => {
        projectNameInput.value = state.data.projectName;
        syncDeedInputsFromState();
        engine.fitToContent();
        showToast("Import โปรเจกต์สำเร็จ", "success");
      })
      .catch((e) => showToast("Import ล้มเหลว: " + e.message, "error"))
      .finally(() => { importJSONInput.value = ""; });
  });

  function syncDeedInputsFromState() {
    deedRai.value = state.data.deed.rai || 0;
    deedNgan.value = state.data.deed.ngan || 0;
    deedWa.value = state.data.deed.wa || 0;
  }

  // ---------- export DXF / PDF ----------
  btnExportDXF.addEventListener("click", () => {
    try {
      state.data.projectName = currentProjectName();
      window.LDD.ExportDXF.download(state);
      showToast("Export DXF สำเร็จ", "success");
    } catch (e) {
      showToast(e.message, "warn");
    }
  });

  btnExportPDF.addEventListener("click", async () => {
    try {
      state.data.projectName = currentProjectName();
      showToast("กำลังสร้างไฟล์ PDF...", "info");
      await window.LDD.ExportPDF.exportPDF(state);
      showToast("Export PDF สำเร็จ", "success");
    } catch (e) {
      showToast(e.message, "warn");
    }
  });

  // ---------- canvas toolbar ----------
  btnZoomIn.addEventListener("click", () => engine.zoomBy(1.25));
  btnZoomOut.addEventListener("click", () => engine.zoomBy(1 / 1.25));
  btnFit.addEventListener("click", () => engine.fitToContent());

  // ---------- UI refresh ----------
  function updateModeUI() {
    const mode = state.data.mode;
    const labels = { draw: "โหมด: วาดขอบเขต", select: "โหมด: เลือก/แก้ไข", pan: "โหมด: เลื่อนภาพ", measure: "โหมด: เลือกเส้นวัดระยะ" };
    modeIndicator.textContent = labels[mode] || mode;
    [btnDraw, btnSelectMode, btnMeasureMode].forEach((b) => b.classList.remove("active"));
    if (mode === "draw") btnDraw.classList.add("active");
    if (mode === "select") btnSelectMode.classList.add("active");
    if (mode === "measure") btnMeasureMode.classList.add("active");
    canvasEl.style.cursor = mode === "draw" ? "crosshair" : mode === "measure" ? "crosshair" : mode === "pan" ? "grab" : "default";
  }

  function updatePolygonStats() {
    nodeCountLabel.textContent = String(state.data.nodes.length);
    polygonStatusLabel.textContent = state.data.closed ? "ปิดแล้ว" : "ยังไม่ปิด";
  }

  function updateDeedTotal() {
    const m2 = G.raiNganWaToM2(state.data.deed.rai, state.data.deed.ngan, state.data.deed.wa);
    deedTotalM2Label.textContent = G.formatNumber(m2, 2) + " ตร.ม.";
  }

  function updateMeasureInfo() {
    const pts = state.data.measurePoints;
    if (pts.length < 2) {
      measureInfo.textContent = pts.length === 1 ? "เลือกแล้ว 1 จุด — คลิกจุดที่สอง" : "ยังไม่ได้เลือกจุด";
    } else {
      const d = G.distance(pts[0], pts[1]);
      measureInfo.textContent = `เลือกครบ 2 จุด — ระยะบนภาพ = ${G.formatNumber(d, 2)} หน่วยภาพ`;
    }
  }

  function updateCalibrationStats() {
    calibrationLabel.textContent = `1 ม. = ${G.formatNumber(state.data.unitsPerMeter, 3)} หน่วยภาพ`;
    const areaM2 = ScaleEngine.currentAreaM2(state);
    currentAreaLabel.textContent = G.formatNumber(areaM2, 2) + " ตร.ม.";
    const targetM2 = ScaleEngine.deedTargetAreaM2(state);
    if (targetM2 > 0 && areaM2 > 0) {
      const diff = areaM2 - targetM2;
      const pct = (diff / targetM2) * 100;
      areaDiffLabel.textContent = `${diff >= 0 ? "+" : ""}${G.formatNumber(diff, 2)} ตร.ม. (${pct >= 0 ? "+" : ""}${G.formatNumber(pct, 2)}%)`;
    } else {
      areaDiffLabel.textContent = "-";
    }
  }

  function updateZoomLabel() {
    zoomLabel.textContent = Math.round(state.data.view.scale * 100) + "%";
  }

  function updateEmptyState() {
    emptyState.classList.toggle("hidden", !!state.data.image);
  }

  function refreshAll() {
    updateModeUI();
    updatePolygonStats();
    updateDeedTotal();
    updateMeasureInfo();
    updateCalibrationStats();
    updateZoomLabel();
    updateEmptyState();
  }

  state.on("changed", refreshAll);
  state.on("view-changed", updateZoomLabel);
  state.on("pointer-move", (cu) => {
    statusCoords.textContent = `x: ${G.formatNumber(cu.x, 1)}, y: ${G.formatNumber(cu.y, 1)}`;
  });
  state.on("restored", () => { imageNameLabel.textContent = state.data.image ? state.data.image.name || "โหลดจากไฟล์" : "ยังไม่ได้เลือกภาพ"; });
  state.on("image-loaded", () => { imageNameLabel.textContent = state.data.image ? state.data.image.name || "โหลดจากไฟล์" : "ยังไม่ได้เลือกภาพ"; });

  // ---------- init ----------
  projectNameInput.value = state.data.projectName;
  syncDeedInputsFromState();
  refreshSavedList();
  refreshAll();
})();
