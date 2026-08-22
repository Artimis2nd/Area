/* exportPDF.js — builds a printable PDF (plot drawing + scale + area) via jsPDF (loaded from CDN).
 *
 * Note: jsPDF's built-in fonts (Helvetica/Times/Courier) have no Thai glyphs, and embedding a
 * custom Thai font file is heavyweight. Instead, all Thai text is rendered onto an offscreen
 * <canvas> (using the browser's own Thai-capable system fonts) and embedded as a PNG image —
 * the same technique already used for the plot drawing itself.
 */
(function (global) {
  "use strict";
  const G = global.LDD.Geometry;

  const THAI_FONT_STACK = '"Noto Sans Thai","Leelawadee UI","Tahoma","Segoe UI",sans-serif';
  const TEXT_DPI = 220;
  const MM_PER_PX = 25.4 / TEXT_DPI;

  // ---- plot drawing snapshot (image + polygon + scale bar), no UI chrome ----
  function renderSnapshot(state, targetWidthPx) {
    const d = state.data;
    let box = null;
    if (d.image) box = { minX: d.image.x, minY: d.image.y, maxX: d.image.x + d.image.width, maxY: d.image.y + d.image.height };
    if (d.nodes.length) {
      const nb = G.boundingBox(d.nodes);
      box = box
        ? { minX: Math.min(box.minX, nb.minX), minY: Math.min(box.minY, nb.minY), maxX: Math.max(box.maxX, nb.maxX), maxY: Math.max(box.maxY, nb.maxY) }
        : nb;
    }
    if (!box) throw new Error("ไม่มีภาพหรือรูปหลายเหลี่ยมให้ Export");

    const contentW = box.maxX - box.minX || 1;
    const contentH = box.maxY - box.minY || 1;
    const pad = Math.max(contentW, contentH) * 0.06;
    const worldW = contentW + pad * 2;
    const worldH = contentH + pad * 2;

    const scale = targetWidthPx / worldW;
    const width = Math.round(worldW * scale);
    const height = Math.round(worldH * scale);

    const cnv = document.createElement("canvas");
    cnv.width = width;
    cnv.height = height;
    const ctx = cnv.getContext("2d");

    const toScreen = (x, y) => ({ x: (x - box.minX + pad) * scale, y: (y - box.minY + pad) * scale });

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (d.image && d.image.el) {
      const p1 = toScreen(d.image.x, d.image.y);
      const p2 = toScreen(d.image.x + d.image.width, d.image.y + d.image.height);
      ctx.drawImage(d.image.el, p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }

    if (d.nodes.length >= 2) {
      const pts = d.nodes.map((n) => toScreen(n.x, n.y));
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (d.closed) ctx.closePath();
      ctx.fillStyle = "rgba(37,130,245,0.18)";
      if (d.closed) ctx.fill();
      ctx.strokeStyle = "#1f6fe0";
      ctx.lineWidth = Math.max(1.5, scale * 0.02);
      ctx.stroke();

      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3, scale * 0.03), 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#1f6fe0";
        ctx.stroke();
      });
    }

    const niceMeters = pickNiceScaleBarMeters(worldW / d.unitsPerMeter / 4);
    const barPxWidth = niceMeters * d.unitsPerMeter * scale;
    drawScaleBar(ctx, 24, height - 34, barPxWidth, `${niceMeters} ม.`);

    return { dataUrl: cnv.toDataURL("image/png"), width, height, scale, worldW, worldH };
  }

  function pickNiceScaleBarMeters(approx) {
    const magnitudes = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    let best = magnitudes[0];
    for (const m of magnitudes) if (m <= approx) best = m;
    return best;
  }

  function drawScaleBar(ctx, x, y, widthPx, label) {
    if (!(widthPx > 2)) return;
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + widthPx, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.moveTo(x + widthPx, y - 5);
    ctx.lineTo(x + widthPx, y + 5);
    ctx.stroke();
    ctx.font = `bold 13px ${THAI_FONT_STACK}`;
    ctx.fillText(label, x, y - 8);
  }

  function computePrintScaleRatio(worldWCu, unitsPerMeter, imageMmWidth) {
    const mmPerCu = imageMmWidth / worldWCu;
    const metersPerCu = 1 / unitsPerMeter;
    const mmPerMeterOnPaper = mmPerCu / metersPerCu;
    if (mmPerMeterOnPaper <= 0) return null;
    return Math.round(1000 / mmPerMeterOnPaper);
  }

  // ---- Thai-capable text block rendered to a PNG (left-aligned lines, mixed sizes/weights) ----
  function renderTextBlock(lines, opts) {
    opts = opts || {};
    const padPx = (opts.paddingMm || 2) / MM_PER_PX;
    const measureCtx = document.createElement("canvas").getContext("2d");
    const prepared = lines.map((l) => {
      const pxSize = Math.round((l.sizePt || 10) * (TEXT_DPI / 72));
      const font = `${l.bold ? "bold " : ""}${pxSize}px ${THAI_FONT_STACK}`;
      measureCtx.font = font;
      const width = measureCtx.measureText(l.text).width;
      const lineHeight = pxSize * 1.55 + (l.gapAfterPt ? l.gapAfterPt * (TEXT_DPI / 72) : 0);
      return { text: l.text, font, width, pxSize, lineHeight, color: l.color || "#1a2233" };
    });

    const blockWidth = Math.ceil(Math.max(...prepared.map((p) => p.width)) + padPx * 2);
    const blockHeight = Math.ceil(prepared.reduce((s, p) => s + p.lineHeight, 0) + padPx * 2);

    const cnv = document.createElement("canvas");
    cnv.width = blockWidth;
    cnv.height = blockHeight;
    const ctx = cnv.getContext("2d");
    ctx.textBaseline = "alphabetic";

    let y = padPx;
    prepared.forEach((p) => {
      y += p.pxSize; // move to this line's baseline
      ctx.font = p.font;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, padPx, y);
      y += p.lineHeight - p.pxSize;
    });

    return {
      dataUrl: cnv.toDataURL("image/png"),
      widthMm: blockWidth * MM_PER_PX,
      heightMm: blockHeight * MM_PER_PX,
    };
  }

  async function exportPDF(state) {
    if (!global.jspdf || !global.jspdf.jsPDF) {
      throw new Error("ไม่พบไลบรารี jsPDF (ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลดครั้งแรก)");
    }
    const d = state.data;
    const snap = renderSnapshot(state, 1600);
    const areaM2 = d.nodes.length >= 3 ? G.area(d.nodes) / (d.unitsPerMeter * d.unitsPerMeter) : 0;
    const rgwDigitized = G.m2ToRaiNganWa(areaM2);
    const deedAreaM2 = G.raiNganWaToM2(d.deed.rai, d.deed.ngan, d.deed.wa);

    const isLandscape = snap.width >= snap.height;
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    const maxContentW = pageW - margin * 2;

    // --- title block ---
    const titleBlock = renderTextBlock(
      [
        { text: "แผนที่ระวางถอดสเกลโฉนดที่ดิน (Land Title Deed Plot)", sizePt: 15, bold: true },
        { text: `โครงการ: ${d.projectName || "-"}    วันที่พิมพ์: ${new Date().toLocaleDateString("th-TH")}`, sizePt: 9.5, color: "#555" },
      ],
      { paddingMm: 0 }
    );
    const titleScale = Math.min(1, maxContentW / titleBlock.widthMm);
    const titleW = titleBlock.widthMm * titleScale;
    const titleH = titleBlock.heightMm * titleScale;
    doc.addImage(titleBlock.dataUrl, "PNG", margin, margin, titleW, titleH);

    // --- plot snapshot ---
    const imgTop = margin + titleH + 4;
    const infoBudget = 40; // reserved mm for the stats block below
    const imgMaxW = maxContentW;
    const imgMaxH = pageH - imgTop - infoBudget;
    let drawW = imgMaxW, drawH = (snap.height / snap.width) * drawW;
    if (drawH > imgMaxH) {
      drawH = imgMaxH;
      drawW = (snap.width / snap.height) * drawH;
    }
    const imgX = margin + (imgMaxW - drawW) / 2;
    doc.addImage(snap.dataUrl, "PNG", imgX, imgTop, drawW, drawH);
    doc.setDrawColor(200);
    doc.rect(imgX, imgTop, drawW, drawH);

    const printScaleN = computePrintScaleRatio(snap.worldW, d.unitsPerMeter, drawW);

    // --- stats block ---
    const infoLines = [
      { text: "ข้อมูลพื้นที่และสเกล", sizePt: 11.5, bold: true, gapAfterPt: 2 },
      { text: `เนื้อที่ตามโฉนด: ${d.deed.rai || 0} ไร่ ${d.deed.ngan || 0} งาน ${G.formatNumber(d.deed.wa || 0, 2)} ตร.วา  ( = ${G.formatNumber(deedAreaM2, 2)} ตร.ม. )`, sizePt: 9.5 },
      { text: `เนื้อที่จากการถอดสเกล (Digitized): ${G.formatNumber(areaM2, 2)} ตร.ม.  ( ${rgwDigitized.rai} ไร่ ${rgwDigitized.ngan} งาน ${G.formatNumber(rgwDigitized.wa, 2)} ตร.วา )`, sizePt: 9.5 },
    ];
    if (deedAreaM2 > 0) {
      const diff = areaM2 - deedAreaM2;
      const pct = (diff / deedAreaM2) * 100;
      infoLines.push({ text: `ผลต่างจากโฉนด: ${G.formatNumber(diff, 2)} ตร.ม. (${pct >= 0 ? "+" : ""}${G.formatNumber(pct, 2)}%)`, sizePt: 9.5 });
    }
    infoLines.push({
      text: `การปรับสเกล (Calibration): 1 เมตร = ${G.formatNumber(d.unitsPerMeter, 3)} หน่วยภาพ` +
        (d.lastCalibration ? `  [วิธี: ${d.lastCalibration.method === "distance" ? "ระบุระยะจริง" : "Auto-Scale ตามพื้นที่"}]` : ""),
      sizePt: 9.5,
    });
    if (printScaleN) infoLines.push({ text: `มาตราส่วนพิมพ์โดยประมาณ: 1:${printScaleN.toLocaleString("th-TH")}`, sizePt: 9.5 });

    const infoBlock = renderTextBlock(infoLines, { paddingMm: 0 });
    const infoScale = Math.min(1, maxContentW / infoBlock.widthMm);
    const infoTop = imgTop + drawH + 5;
    doc.addImage(infoBlock.dataUrl, "PNG", margin, infoTop, infoBlock.widthMm * infoScale, infoBlock.heightMm * infoScale);

    doc.save((d.projectName || "land-plot") + ".pdf");
  }

  global.LDD = global.LDD || {};
  global.LDD.ExportPDF = { exportPDF, renderSnapshot };
})(window);
