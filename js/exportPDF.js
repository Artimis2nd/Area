window.LDD = window.LDD || {};

LDD.exportPDF = (function () {

  function ensureLib() {
    return new Promise((resolve, reject) => {
      if (window.jspdf && window.jspdf.jsPDF) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('โหลดไลบรารีสร้าง PDF ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'));
      document.head.appendChild(s);
    });
  }

  // jsPDF's built-in fonts don't support Thai glyphs, so the info block is
  // rasterized on an offscreen <canvas> (which the browser renders correctly)
  // and embedded into the PDF as an image instead of using doc.text().
  function renderInfoImage(state, widthPx) {
    const mpp = state.metersPerPixel;
    const deedM2 = LDD.utils.raiNganWaToM2(state.deed.rai, state.deed.ngan, state.deed.wa);
    const areaPx = state.nodes.length >= 3 ? LDD.utils.polygonAreaPx(state.nodes) : 0;
    const areaM2 = mpp ? areaPx * mpp * mpp : null;
    const rnw = areaM2 != null ? LDD.utils.m2ToRaiNganWa(areaM2) : null;

    const lines = [
      { text: 'แผนที่ถอดสเกลโฉนดที่ดิน (Land Title Deed Digitizer)', bold: true, size: 18 },
      { text: 'โครงการ/ไฟล์: ' + (state.projectName || '-'), size: 14 },
      { text: 'วันที่ออกเอกสาร: ' + new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }), size: 14 },
      { text: 'มาตราส่วน: ' + (mpp ? ('1 พิกเซล = ' + mpp.toFixed(6) + ' เมตร  (ประมาณ 1:' + Math.round(1 / mpp) + ')') : 'ยังไม่ได้ตั้งสเกล'), size: 14 },
      { text: 'เนื้อที่ตามโฉนด: ' + state.deed.rai + '-' + state.deed.ngan + '-' + state.deed.wa + '  (' + LDD.utils.fmt(deedM2, 2) + ' ตร.ม.)', size: 14 },
      { text: 'เนื้อที่จากการวาด: ' + (areaM2 != null ? (LDD.utils.fmt(areaM2, 2) + ' ตร.ม.  (' + rnw.rai + '-' + rnw.ngan + '-' + rnw.wa.toFixed(1) + ')') : '-'), size: 14 }
    ];

    const dpr = window.devicePixelRatio || 1;
    const lineHeight = 26;
    const height = lineHeight * lines.length + 20;
    const canvas = document.createElement('canvas');
    canvas.width = widthPx * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, height);
    ctx.fillStyle = '#111827';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.font = (line.bold ? '600 ' : '400 ') + line.size + 'px Sarabun, sans-serif';
      ctx.fillText(line.text, 0, 10 + i * lineHeight);
    });

    return { dataURL: canvas.toDataURL('image/png'), width: widthPx, height };
  }

  // `croppedImage` is an optional { dataURL, width, height } produced by
  // LDD.cropTool.captureImage — the user-picked crop region. When present it
  // replaces the raw full canvas so nothing outside the chosen bounds ends
  // up in the PDF.
  async function download(state, canvasEl, filename, croppedImage) {
    await ensureLib();
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.load('600 18px Sarabun');
        await document.fonts.load('400 14px Sarabun');
        await document.fonts.ready;
      } catch (e) { /* font preload is best-effort */ }
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;

    const info = renderInfoImage(state, 900);
    const infoMmWidth = pageW - margin * 2;
    const infoMmHeight = infoMmWidth * (info.height / info.width);
    doc.addImage(info.dataURL, 'PNG', margin, margin, infoMmWidth, infoMmHeight);

    const image = croppedImage || { dataURL: canvasEl.toDataURL('image/png'), width: canvasEl.width, height: canvasEl.height };

    const imgTop = margin + infoMmHeight + 5;
    const maxW = pageW - margin * 2;
    const maxH = pageH - imgTop - margin;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale, h = image.height * scale;
    const x = margin + (maxW - w) / 2;

    doc.setDrawColor(200);
    doc.rect(x, imgTop, w, h);
    doc.addImage(image.dataURL, 'PNG', x, imgTop, w, h);

    doc.save(filename || ((state.projectName || 'land-plot') + '.pdf'));
  }

  return { download };
})();
