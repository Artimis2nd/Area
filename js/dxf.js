/**
 * dxf.js
 * ---------------------------------------------------------------------------
 * สร้างไฟล์ DXF (R12 / AC1009) จากข้อมูลโครงข่าย เพื่อเปิดใน CAD (AutoCAD,
 * BricsCAD, DraftSight, LibreCAD ฯลฯ) ได้ตรงกับรูปที่เห็นบน Canvas
 *
 * เอนทิตี้ที่ส่งออก:
 *   - จุด  : CIRCLE (marker เห็นชัด) + POINT (พิกัดจริง) + TEXT ชื่อ + TEXT พิกัด
 *   - เส้น : LINE + TEXT ตัวเลขระยะทางที่กึ่งกลาง
 *
 * เลเยอร์ 5 ชั้น:
 *   BASE       (สี 40 - ส้ม) จุดฐาน + เส้นฐาน
 *   POINT      (สี 4  - cyan) จุดลูก
 *   EDGE       (สี 4  - cyan) เส้นของจุดลูก
 *   EDGE_BASE  (สี 40 - ส้ม)  เส้นฐาน (แยกไว้ให้ filter ได้)
 *   LABEL      (สี 7  - ขาว)  ป้ายชื่อ/พิกัด/ระยะ
 * ---------------------------------------------------------------------------
 */

const DXF = (() => {
  'use strict';

  /** แปลงตัวเลขเป็นทศนิยมคงที่ 4 ตำแหน่ง (กันเลขติด power-of-ten) */
  function fmt(n) {
    if (!Number.isFinite(n)) return '0.0000';
    return n.toFixed(4);
  }

  /**
   * @param {Object} points map { name: {x,y,isBase,...} }
   * @param {Array}  edges  รายการจาก Engine.getEdges()
   * @returns {string} เนื้อหาไฟล์ DXF (หรือ '' หากไม่มีจุด)
   */
  function build(points, edges) {
    const names = Object.keys(points);
    if (names.length === 0) return '';

    // ------------------------------------------------------- คำนวณ bounds / ขนาด
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    names.forEach(n => {
      const p = points[n];
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const spanX = Math.max(maxX - minX, 0.001);
    const spanY = Math.max(maxY - minY, 0.001);
    const span = Math.max(spanX, spanY);

    // ความสูงตัวอักษร/รัศมี ปรับตามขนาดโครงข่าย ให้อ่านได้ชัดทุก scale
    const th = Math.max(0.15, Math.min(5, span * 0.02));
    const nameH = th;
    const coordH = th * 0.8;
    const distH = th * 0.8;
    const radius = th * 0.35;

    // ------------------------------------------------------- ตัวสะสม DXF
    const out = [];
    const w = (code, value) => { out.push(code); out.push(String(value)); };

    // ==================================================== HEADER
    w(0, 'SECTION'); w(2, 'HEADER');
    w(9, '$ACADVER'); w(1, 'AC1009');
    w(9, '$EXTMIN');
    w(10, fmt(minX - spanX * 0.05)); w(20, fmt(minY - spanY * 0.05)); w(30, '0.0');
    w(9, '$EXTMAX');
    w(10, fmt(maxX + spanX * 0.05)); w(20, fmt(maxY + spanY * 0.05)); w(30, '0.0');
    w(0, 'ENDSEC');

    // ==================================================== TABLES
    w(0, 'SECTION'); w(2, 'TABLES');

    // LTYPE: CONTINUOUS
    w(0, 'TABLE'); w(2, 'LTYPE'); w(70, '1');
    w(0, 'LTYPE');
    w(2, 'CONTINUOUS'); w(70, '0'); w(3, 'Solid line'); w(72, '65'); w(73, '0'); w(40, '0.0');
    w(0, 'ENDTAB');

    // LAYER
    const layers = [
      { name: '0',          color: 7  },
      { name: 'BASE',       color: 40 },
      { name: 'POINT',      color: 4  },
      { name: 'EDGE',       color: 4  },
      { name: 'EDGE_BASE',  color: 40 },
      { name: 'LABEL',      color: 7  }
    ];
    w(0, 'TABLE'); w(2, 'LAYER'); w(70, String(layers.length));
    layers.forEach(l => {
      w(0, 'LAYER');
      w(2, l.name); w(70, '0'); w(62, String(l.color)); w(6, 'CONTINUOUS');
    });
    w(0, 'ENDTAB');
    w(0, 'ENDSEC');

    // ==================================================== ENTITIES
    w(0, 'SECTION'); w(2, 'ENTITIES');

    // ---- จุด: marker + พิกัดจริง + ชื่อ + พิกัด
    names.forEach(name => {
      const p = points[name];
      const layer = p.isBase ? 'BASE' : 'POINT';

      // CIRCLE marker (ให้เห็นชัดใน CAD)
      w(0, 'CIRCLE'); w(8, layer);
      w(10, fmt(p.x)); w(20, fmt(p.y)); w(30, '0.0');
      w(40, fmt(radius));

      // POINT ณ พิกัดจริง
      w(0, 'POINT'); w(8, layer);
      w(10, fmt(p.x)); w(20, fmt(p.y)); w(30, '0.0');

      // ป้ายชื่อจุด (ขวาบนของจุด เหมือนบน Canvas)
      w(0, 'TEXT'); w(8, 'LABEL');
      w(10, fmt(p.x + th * 0.6)); w(20, fmt(p.y + th * 1.3)); w(30, '0.0');
      w(40, fmt(nameH)); w(1, name);

      // ป้ายพิกัด X,Y (ใต้ชื่อ)
      w(0, 'TEXT'); w(8, 'LABEL');
      w(10, fmt(p.x + th * 0.6)); w(20, fmt(p.y + th * 0.3)); w(30, '0.0');
      w(40, fmt(coordH)); w(1, `X=${fmt(p.x)}  Y=${fmt(p.y)}`);
    });

    // ---- เส้น: LINE + ป้ายระยะทางที่กึ่งกลาง
    (edges || []).forEach(edge => {
      const A = points[edge.from], B = points[edge.to];
      if (!A || !B) return;
      const layer = edge.isBase ? 'EDGE_BASE' : 'EDGE';

      w(0, 'LINE'); w(8, layer);
      w(10, fmt(A.x)); w(20, fmt(A.y)); w(30, '0.0');
      w(11, fmt(B.x)); w(21, fmt(B.y)); w(31, '0.0');

      if (Number.isFinite(edge.length)) {
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2;
        w(0, 'TEXT'); w(8, 'LABEL');
        w(10, fmt(mx)); w(20, fmt(my + distH * 0.6)); w(30, '0.0');
        w(40, fmt(distH)); w(1, `${edge.length.toFixed(3)} m`);
      }
    });

    w(0, 'ENDSEC');
    w(0, 'EOF');

    return out.join('\n');
  }

  return { build };
})();
