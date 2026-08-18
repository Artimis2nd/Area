/**
 * pdf.js
 * ---------------------------------------------------------------------------
 * สร้างไฟล์ PDF แบบ vector จากข้อมูลโครงข่าย เพื่อนำเข้า ArchiCAD (V28) หรือ
 * โปรแกรมอื่น โดยมี "สเกลตรงเป๊ะ": ขนาดหน้ากระดาษ (MediaBox) เท่ากับขนาดจริง
 * ของโครงข่ายเป็นมิลลิเมตรพอดี จึงวางใน ArchiCAD ที่สเกล 1:1 แล้ววัดได้เท่าจริง
 *
 * สเกล: 1 เมตร = 2834.645669 pt  (เพราะ 1pt = 25.4/72 มม. -> 1ม. = 1000 มม.)
 *
 * เอนทิตี้ (vector ล้วน):
 *   - เส้น : operator m ... l ... S
 *   - จุด  : วงกลม (Bézier 4 ท่อน) + สีจุดฐาน/จุดลูก
 *   - ป้าย : ชื่อ / พิกัด / ระยะ ด้วย Helvetica / Helvetica-Bold (WinAnsi)
 *
 * หมายเหตุ: ฟอนต์พื้นฐาน (Helvetica/WinAnsiEncoding) รองรับเฉพาะอักขระ ASCII
 *           ตัวอักษรอื่น (เช่น ไทย) จะถูกแทนด้วย '?'
 * ---------------------------------------------------------------------------
 */

const PDF = (() => {
  'use strict';

  const PT_PER_M = 2834.645669; // จุดต่อ 1 เมตร (สเกลจริง)
  const MARGIN_PT = 20;         // ขอบว่างรอบรูป (จุด)

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /** แปลงตัวเลขเป็นทศนิยมสั้น ๆ สำหรับเขียนลง PDF */
  function fmt(n) {
    if (!Number.isFinite(n)) return '0';
    return String(Math.round(n * 1000) / 1000);
  }

  /** หนีอักขระพิเศษใน PDF string และกรองให้เหลือ ASCII เท่านั้น */
  function escapeText(s) {
    let out = '';
    for (const ch of String(s)) {
      const code = ch.codePointAt(0);
      if (code >= 32 && code <= 126) {
        if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
        else out += ch;
      } else {
        out += '?'; // อักขระนอก ASCII (เช่น ไทย) -> ?
      }
    }
    return out;
  }

  /** สร้าง path วงกลมด้วย Bézier 4 ท่อน (คืนคำสั่ง m/c...) */
  function circlePath(cx, cy, r) {
    const k = 0.5522847498 * r;
    return [
      `${fmt(cx + r)} ${fmt(cy)} m`,
      `${fmt(cx + r)} ${fmt(cy + k)} ${fmt(cx + k)} ${fmt(cy + r)} ${fmt(cx)} ${fmt(cy + r)} c`,
      `${fmt(cx - k)} ${fmt(cy + r)} ${fmt(cx - r)} ${fmt(cy + k)} ${fmt(cx - r)} ${fmt(cy)} c`,
      `${fmt(cx - r)} ${fmt(cy - k)} ${fmt(cx - k)} ${fmt(cy - r)} ${fmt(cx)} ${fmt(cy - r)} c`,
      `${fmt(cx + k)} ${fmt(cy - r)} ${fmt(cx + r)} ${fmt(cy - k)} ${fmt(cx + r)} ${fmt(cy)} c`
    ].join('\n');
  }

  /** สร้างบรรทัดข้อความใน content stream */
  function textLine(fontNum, size, x, y, str) {
    return `BT /F${fontNum} ${fmt(size)} Tf 0 0 0 rg 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm (${escapeText(str)}) Tj ET`;
  }

  /**
   * @param {Object} points map { name: {x,y,isBase,...} }
   * @param {Array}  edges  รายการจาก Engine.getEdges()
   * @returns {string} เนื้อหาไฟล์ PDF (หรือ '' หากไม่มีจุด)
   */
  function build(points, edges) {
    const names = Object.keys(points);
    if (names.length === 0) return '';

    // ------------------------------------------------------- bounds / ขนาด
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    names.forEach(n => {
      const p = points[n];
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const spanX = Math.max(maxX - minX, 0.001);
    const spanY = Math.max(maxY - minY, 0.001);
    const span = Math.max(spanX, spanY);

    const padM = MARGIN_PT / PT_PER_M;   // ขอบในหน่วยเมตร
    const scale = PT_PER_M;

    const pageW = (spanX + padM * 2) * scale;
    const pageH = (spanY + padM * 2) * scale;

    // ขนาดตัวอักษร/รัศมี (ปรับตามขนาดโครงข่าย) - หน่วยเมตรแล้วแปลงเป็น pt
    const th = clamp(span * 0.02, 0.15, 5);   // เมตร
    const nameH = th * scale;
    const coordH = th * 0.8 * scale;
    const distH = th * 0.8 * scale;
    const radius = th * 0.35 * scale;

    // แปลงพิกัด world (เมตร, Y ขึ้น) -> พิกัด PDF (pt, Y ขึ้น) ให้เป็นบวกเสมอ
    const px = (x) => (x - minX + padM) * scale;
    const py = (y) => (y - minY + padM) * scale;

    // ------------------------------------------------------- content stream
    const content = [];
    const allEdges = edges || [];

    // เส้นของจุดลูก
    content.push('0.10 0.45 0.75 RG');  // cyan เข้ม
    content.push('0.8 w');
    allEdges.forEach(e => {
      if (e.isBase) return;
      const A = points[e.from], B = points[e.to];
      if (!A || !B) return;
      content.push(`${fmt(px(A.x))} ${fmt(py(A.y))} m ${fmt(px(B.x))} ${fmt(py(B.y))} l S`);
    });

    // เส้นฐาน
    content.push('0.85 0.55 0.10 RG');  // ส้ม
    content.push('1.4 w');
    allEdges.forEach(e => {
      if (!e.isBase) return;
      const A = points[e.from], B = points[e.to];
      if (!A || !B) return;
      content.push(`${fmt(px(A.x))} ${fmt(py(A.y))} m ${fmt(px(B.x))} ${fmt(py(B.y))} l S`);
    });

    // จุด (วงกลม) + ป้ายชื่อ + ป้ายพิกัด
    names.forEach(name => {
      const p = points[name];
      const cx = px(p.x), cy = py(p.y);

      // วงกลมแทนจุด
      content.push(p.isBase ? '0.85 0.55 0.10 rg' : '0.10 0.55 0.75 rg');
      content.push(circlePath(cx, cy, radius));
      content.push('f');

      // ป้ายชื่อจุด (ขวาบน)
      content.push(textLine(2, nameH, px(p.x + th * 0.6), py(p.y + th * 1.3), name));

      // ป้ายพิกัด (ใต้ชื่อ)
      content.push(textLine(1, coordH, px(p.x + th * 0.6), py(p.y + th * 0.3), `X=${p.x.toFixed(4)}  Y=${p.y.toFixed(4)}`));
    });

    // ตัวเลขระยะทางที่กึ่งกลางเส้น
    allEdges.forEach(e => {
      const A = points[e.from], B = points[e.to];
      if (!A || !B || !Number.isFinite(e.length)) return;
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      content.push(textLine(1, distH, px(mx), py(my + th * 0.4), `${e.length.toFixed(3)} m`));
    });

    // ------------------------------------------------------- ประกอบ PDF
    return buildFile(pageW, pageH, content.join('\n'));
  }

  /** สร้างโครงสร้าง PDF + xref ครบถ้วน */
  function buildFile(pageW, pageH, streamContent) {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageW)} ${fmt(pageH)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`
    ];

    // เริ่มจาก header
    // หมายเหตุ: เจตนาให้ไฟล์เป็น ASCII ล้วน เพื่อให้ความยาว string = จำนวนไบต์
    //           (xref offset ที่คำนวณจาก out.length จะตรงกับไบต์ในไฟล์จริง)
    let out = '%PDF-1.4\n';

    // เขียนแต่ละ object + เก็บ offset สำหรับ xref
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    // xref / trailer
    const xrefPos = out.length;
    out += `xref\n0 ${objects.length + 1}\n`;
    out += '0000000000 65535 f \n';
    offsets.forEach(off => {
      out += String(off).padStart(10, '0') + ' 00000 n \n';
    });
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    out += `startxref\n${xrefPos}\n%%EOF\n`;

    return out;
  }

  return { build };
})();

