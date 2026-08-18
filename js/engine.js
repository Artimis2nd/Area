/**
 * engine.js
 * ---------------------------------------------------------------------------
 * แกนหลักด้านคณิตศาสตร์และการจัดการสถานะข้อมูล (Data State) ของโปรแกรม
 * Mark Port Coordinate by Trilateration
 *
 * แนวคิด:
 *  - จุด A, B คือ "เส้นฐาน" (Base Line) : A=(0,0), B=(L,0)
 *  - จุดถัดไปทุกจุดคำนวณจากจุดอ้างอิง 2 จุดที่มีอยู่แล้ว + ระยะทาง 2 ค่า
 *    โดยใช้ "กฎของโคไซน์" (Law of Cosines) หามุมที่จุดอ้างอิงที่ 1
 *    แล้วหมุนเวกเตอร์ (Vector Rotation) ไปตามทิศทางเส้นอ้างอิง
 *  - เก็บกราฟความสัมพันธ์ (dependency graph) เพื่อให้แก้ไข/ลบจุดแล้ว
 *    คำนวณจุดลูกที่ต่อเนื่องกันใหม่โดยอัตโนมัติ (Auto-Recalculate)
 * ---------------------------------------------------------------------------
 */

const Engine = (() => {

  // ------------------------------------------------------------------ state
  // points: { [name]: PointRecord }
  // PointRecord (base)   : { x, y, isBase:true }
  // PointRecord (derived): { x, y, isBase:false, refA, refB, distA, distB, flip }
  // order: ลำดับการสร้างจุด (ใช้อ้างอิงลำดับ/รัน A,B,C.. อัตโนมัติ)
  let state = {
    points: {},   // name -> record
    order: []     // array of names, insertion order
  };

  const EPS = 1e-9;

  // -------------------------------------------------------------- utilities
  /** คืนอักษรถัดไปตามลำดับ A,B,C,...,Z,AA,AB,... สำหรับตั้งชื่ออัตโนมัติ */
  function nextAutoName() {
    let n = state.order.length;
    let name = '';
    n += 1; // 1-indexed
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    // กันชื่อชนกับชื่อที่ผู้ใช้ตั้งเองไว้ก่อนหน้า
    while (state.points[name]) {
      name = incrementName(name);
    }
    return name;
  }

  function incrementName(name) {
    // เพิ่มชื่อแบบ base-26 (A->B ... Z->AA)
    const arr = name.split('');
    let i = arr.length - 1;
    while (i >= 0) {
      if (arr[i] === 'Z') { arr[i] = 'A'; i--; }
      else { arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1); break; }
    }
    if (i < 0) arr.unshift('A');
    return arr.join('');
  }

  function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  /**
   * คำนวณพิกัดจุดใหม่จากจุดอ้างอิง A, B ด้วยกฎของโคไซน์ + การหมุนเวกเตอร์
   * @param {{x:number,y:number}} A พิกัดจุดอ้างอิงที่ 1
   * @param {{x:number,y:number}} B พิกัดจุดอ้างอิงที่ 2
   * @param {number} distA ระยะจาก A ไปจุดใหม่
   * @param {number} distB ระยะจาก B ไปจุดใหม่
   * @param {boolean} flip สลับด้านของคำตอบ (วงกลม 2 วงตัดกัน 2 จุด)
   * @returns {{x:number,y:number}|null} null หากรูปสามเหลี่ยมไม่ถูกต้อง (triangle inequality)
   */
  function trilaterate(A, B, distA, distB, flip) {
    const d = distance(A, B);
    if (d < EPS) return null; // จุดอ้างอิงซ้อนทับกัน คำนวณไม่ได้

    // ตรวจสอบอสมการสามเหลี่ยม (ต้องสร้างสามเหลี่ยมได้จริง)
    if (distA + distB <= d + EPS) return null;
    if (Math.abs(distA - distB) >= d - EPS) return null;

    // กฎของโคไซน์: หามุมที่จุด A ระหว่างเส้น AB และเส้น A-จุดใหม่
    // distB^2 = distA^2 + d^2 - 2*distA*d*cos(angle)
    let cosAngle = (distA * distA + d * d - distB * distB) / (2 * distA * d);
    cosAngle = Math.max(-1, Math.min(1, cosAngle)); // กันค่าคลาดเคลื่อนจากทศนิยม
    const angle = Math.acos(cosAngle);

    // ทิศทางอ้างอิงของเส้น A->B
    const baseAngle = Math.atan2(B.y - A.y, B.x - A.x);

    // หมุนไปทางซ้าย/ขวาตามสวิตช์ Flip Side
    const targetAngle = flip ? (baseAngle - angle) : (baseAngle + angle);

    return {
      x: A.x + distA * Math.cos(targetAngle),
      y: A.y + distA * Math.sin(targetAngle)
    };
  }

  /** หา list ของจุดที่ "อ้างอิงถึง" จุดชื่อ name (ลูกโดยตรง) */
  function directChildren(name) {
    return state.order.filter(n => {
      const p = state.points[n];
      return !p.isBase && (p.refA === name || p.refB === name);
    });
  }

  /** คำนวณพิกัดของจุดเดี่ยว ๆ ใหม่จาก refA/refB ปัจจุบัน (ไม่ recursive) */
  function recomputeSingle(name) {
    const p = state.points[name];
    if (!p || p.isBase) return true;
    const A = state.points[p.refA];
    const B = state.points[p.refB];
    if (!A || !B) return false;
    const result = trilaterate(A, B, p.distA, p.distB, p.flip);
    if (!result) return false;
    p.x = result.x;
    p.y = result.y;
    p.error = false;
    return true;
  }

  /** คำนวณจุด name ใหม่ แล้วไล่คำนวณจุดลูกทุกระดับ (cascade) */
  function cascadeRecompute(name) {
    const ok = recomputeSingle(name);
    if (!ok) {
      const p = state.points[name];
      if (p) p.error = true;
    }
    const children = directChildren(name);
    children.forEach(childName => cascadeRecompute(childName));
  }

  /** คำนวณทุกจุดใหม่ทั้งหมดตามลำดับ order (ใช้กรณี base line เปลี่ยน) */
  function recomputeAll() {
    state.order.forEach(name => {
      const p = state.points[name];
      if (!p.isBase) recomputeSingle(name);
    });
  }

  // ---------------------------------------------------------------- public API

  /** ล้างข้อมูลทั้งหมด */
  function reset() {
    state = { points: {}, order: [] };
  }

  /** คืนสถานะปัจจุบันแบบ read-only (shallow clone เพื่อความปลอดภัย) */
  function getState() {
    return {
      points: JSON.parse(JSON.stringify(state.points)),
      order: [...state.order]
    };
  }

  function getPointNames() {
    return [...state.order];
  }

  function getPoint(name) {
    return state.points[name] ? { ...state.points[name] } : null;
  }

  function hasPoint(name) {
    return !!state.points[name];
  }

  /**
   * วางเส้นฐานแรก A=(0,0), B=(L,0)
   * ถ้ามีข้อมูลอยู่แล้วจะล้างของเดิมทั้งหมดก่อน (เส้นฐานใหม่ = เริ่มโครงข่ายใหม่)
   */
  function setBaseLine(nameA, nameB, length) {
    if (!nameA || !nameA.trim()) nameA = 'A';
    if (!nameB || !nameB.trim()) nameB = 'B';
    nameA = nameA.trim();
    nameB = nameB.trim();
    if (nameA === nameB) {
      return { ok: false, error: 'ชื่อจุด A และ B ต้องไม่ซ้ำกัน' };
    }
    if (!(length > 0)) {
      return { ok: false, error: 'ระยะ A–B ต้องมากกว่า 0' };
    }
    reset();
    state.points[nameA] = { x: 0, y: 0, isBase: true };
    state.points[nameB] = { x: length, y: 0, isBase: true };
    state.order.push(nameA, nameB);
    return { ok: true, names: [nameA, nameB] };
  }

  /**
   * อัปเดตความยาวเส้นฐาน A–B (คงชื่อจุดเดิม) แล้ว auto-recalculate จุดลูกทั้งหมด
   */
  function updateBaseLength(newLength) {
    if (state.order.length < 2) return { ok: false, error: 'ยังไม่มีเส้นฐาน' };
    if (!(newLength > 0)) return { ok: false, error: 'ระยะต้องมากกว่า 0' };
    const nameA = state.order[0];
    const nameB = state.order[1];
    state.points[nameB].x = newLength;
    state.points[nameB].y = 0;
    recomputeAll();
    return { ok: true };
  }

  /**
   * เพิ่มจุดใหม่ด้วยการเลือก 2 จุดอ้างอิงใด ๆ ที่มีอยู่แล้ว
   */
  function addPoint({ name, refA, refB, distA, distB, flip }) {
    if (!refA || !refB || !state.points[refA] || !state.points[refB]) {
      return { ok: false, error: 'กรุณาเลือกจุดอ้างอิงที่มีอยู่จริงทั้งสองจุด' };
    }
    if (refA === refB) {
      return { ok: false, error: 'จุดอ้างอิงทั้งสองต้องไม่ใช่จุดเดียวกัน' };
    }
    distA = parseFloat(distA);
    distB = parseFloat(distB);
    if (!(distA > 0) || !(distB > 0)) {
      return { ok: false, error: 'ระยะทางต้องเป็นตัวเลขมากกว่า 0' };
    }

    let finalName = (name || '').trim();
    if (!finalName) {
      finalName = nextAutoName();
    } else if (state.points[finalName]) {
      return { ok: false, error: `มีจุดชื่อ "${finalName}" อยู่แล้ว` };
    }

    const A = state.points[refA];
    const B = state.points[refB];
    const result = trilaterate(A, B, distA, distB, !!flip);
    if (!result) {
      return { ok: false, error: 'ระยะทางที่กรอกไม่สามารถสร้างเป็นรูปสามเหลี่ยมได้ (ตรวจสอบอสมการสามเหลี่ยม)' };
    }

    state.points[finalName] = {
      x: result.x,
      y: result.y,
      isBase: false,
      refA, refB, distA, distB,
      flip: !!flip
    };
    state.order.push(finalName);
    return { ok: true, name: finalName, x: result.x, y: result.y };
  }

  /**
   * อัปเดตค่าระยะ/flip ของจุดที่มีอยู่ แล้ว auto-recalculate จุดนั้น + จุดลูกทั้งหมด
   */
  function updatePointGeometry(name, { distA, distB, flip, refA, refB }) {
    const p = state.points[name];
    if (!p || p.isBase) return { ok: false, error: 'ไม่พบจุด หรือเป็นจุดฐานที่แก้ระยะแบบนี้ไม่ได้' };

    const newRefA = refA || p.refA;
    const newRefB = refB || p.refB;
    if (!state.points[newRefA] || !state.points[newRefB]) {
      return { ok: false, error: 'จุดอ้างอิงไม่ถูกต้อง' };
    }
    if (newRefA === newRefB) {
      return { ok: false, error: 'จุดอ้างอิงทั้งสองต้องไม่ใช่จุดเดียวกัน' };
    }
    // ป้องกันการอ้างอิงวนกลับไปหาตัวเอง (ทำให้เกิด infinite loop ใน cascade)
    if (isDescendant(name, newRefA) || isDescendant(name, newRefB)) {
      return { ok: false, error: 'ไม่สามารถอ้างอิงจุดที่เป็นจุดลูกของตัวเองได้ (จะเกิดการอ้างอิงวนซ้ำ)' };
    }

    const newDistA = distA !== undefined ? parseFloat(distA) : p.distA;
    const newDistB = distB !== undefined ? parseFloat(distB) : p.distB;
    if (!(newDistA > 0) || !(newDistB > 0)) {
      return { ok: false, error: 'ระยะทางต้องเป็นตัวเลขมากกว่า 0' };
    }

    const A = state.points[newRefA];
    const B = state.points[newRefB];
    const newFlip = flip !== undefined ? !!flip : p.flip;
    const result = trilaterate(A, B, newDistA, newDistB, newFlip);
    if (!result) {
      return { ok: false, error: 'ระยะทางใหม่ไม่สามารถสร้างเป็นรูปสามเหลี่ยมได้' };
    }

    p.refA = newRefA;
    p.refB = newRefB;
    p.distA = newDistA;
    p.distB = newDistB;
    p.flip = newFlip;

    cascadeRecompute(name);
    return { ok: true };
  }

  /** ตรวจว่า candidateName เป็นจุดลูก(สืบทอด)ของ ancestorName หรือไม่ */
  function isDescendant(ancestorName, candidateName) {
    if (ancestorName === candidateName) return true;
    const children = directChildren(ancestorName);
    return children.some(c => isDescendant(c, candidateName));
  }

  /**
   * เปลี่ยนชื่อจุด แล้วอัปเดตทุกจุดที่อ้างอิงชื่อเดิมให้เป็นชื่อใหม่โดยอัตโนมัติ
   */
  function renamePoint(oldName, newName) {
    newName = (newName || '').trim();
    if (!newName) return { ok: false, error: 'กรุณากรอกชื่อจุด' };
    if (!state.points[oldName]) return { ok: false, error: 'ไม่พบจุดเดิม' };
    if (newName !== oldName && state.points[newName]) {
      return { ok: false, error: `มีจุดชื่อ "${newName}" อยู่แล้ว` };
    }
    if (newName === oldName) return { ok: true }; // ไม่มีอะไรเปลี่ยน

    // ย้าย record ไปคีย์ใหม่
    state.points[newName] = state.points[oldName];
    delete state.points[oldName];

    // อัปเดตลำดับ (order)
    const idx = state.order.indexOf(oldName);
    if (idx !== -1) state.order[idx] = newName;

    // อัปเดตทุกจุดที่อ้างอิง oldName ให้ชี้ไปที่ newName
    state.order.forEach(n => {
      const p = state.points[n];
      if (!p.isBase) {
        if (p.refA === oldName) p.refA = newName;
        if (p.refB === oldName) p.refB = newName;
      }
    });

    return { ok: true };
  }

  /**
   * ลบจุด และลบจุดลูกที่อ้างอิงถึงจุดนั้นทั้งหมด (cascade delete)
   * @returns {{ok:boolean, removed:string[]}}
   */
  function deletePoint(name) {
    if (!state.points[name]) return { ok: false, error: 'ไม่พบจุด', removed: [] };

    const toRemove = new Set();
    const collect = (n) => {
      toRemove.add(n);
      directChildren(n).forEach(collect);
    };
    collect(name);

    // ถ้าลบจุดฐาน (A หรือ B) จะทำให้ทั้งโครงข่ายไม่มีจุดอ้างอิง -> ล้างทั้งหมด
    const isBasePoint = state.points[name].isBase;
    if (isBasePoint) {
      const removed = [...state.order];
      reset();
      return { ok: true, removed, clearedAll: true };
    }

    toRemove.forEach(n => {
      delete state.points[n];
    });
    state.order = state.order.filter(n => !toRemove.has(n));

    return { ok: true, removed: [...toRemove] };
  }

  /**
   * คืนรายการเส้น (edges) ทั้งหมดสำหรับวาดและตาราง
   * แต่ละจุด (ที่ไม่ใช่ฐาน) มี 2 เส้นไปยัง refA และ refB
   * เส้นฐาน A-B นับเป็น 1 เส้นเพิ่มเติม
   */
  function getEdges() {
    const edges = [];
    if (state.order.length >= 2) {
      const nameA = state.order[0];
      const nameB = state.order[1];
      const A = state.points[nameA];
      const B = state.points[nameB];
      edges.push({
        id: `${nameA}__${nameB}`,
        from: nameA, to: nameB,
        length: distance(A, B),
        isBase: true,
        ownerPoint: nameB
      });
    }
    state.order.forEach(name => {
      const p = state.points[name];
      if (p.isBase) return;
      const A = state.points[p.refA];
      const B = state.points[p.refB];
      if (A) {
        edges.push({
          id: `${p.refA}__${name}`,
          from: p.refA, to: name,
          length: A.error ? NaN : distance(A, p),
          isBase: false,
          ownerPoint: name,
          isRefA: true
        });
      }
      if (B) {
        edges.push({
          id: `${p.refB}__${name}`,
          from: p.refB, to: name,
          length: B.error ? NaN : distance(B, p),
          isBase: false,
          ownerPoint: name,
          isRefA: false
        });
      }
    });
    return edges;
  }

  /** คืนขอบเขต (bounding box) ของจุดทั้งหมด สำหรับ Auto-Fit */
  function getBounds() {
    const names = state.order;
    if (names.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    names.forEach(n => {
      const p = state.points[n];
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    return { minX, maxX, minY, maxY };
  }

  function getBaseNames() {
    return state.order.length >= 2 ? [state.order[0], state.order[1]] : null;
  }

  return {
    reset,
    getState,
    getPointNames,
    getPoint,
    hasPoint,
    setBaseLine,
    updateBaseLength,
    addPoint,
    updatePointGeometry,
    renamePoint,
    deletePoint,
    getEdges,
    getBounds,
    getBaseNames,
    distance
  };
})();
