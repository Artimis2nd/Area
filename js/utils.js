window.LDD = window.LDD || {};

LDD.utils = (function () {

  function raiNganWaToM2(rai, ngan, wa) {
    rai = Number(rai) || 0;
    ngan = Number(ngan) || 0;
    wa = Number(wa) || 0;
    return rai * 1600 + ngan * 400 + wa * 4;
  }

  function m2ToRaiNganWa(m2) {
    m2 = Math.max(0, Number(m2) || 0);
    const rai = Math.floor(m2 / 1600);
    let rem = m2 - rai * 1600;
    const ngan = Math.floor(rem / 400);
    rem = rem - ngan * 400;
    const wa = rem / 4;
    return { rai, ngan, wa };
  }

  // Shoelace formula — points in any consistent unit (px or m), returns positive area.
  function polygonAreaPx(points) {
    const n = points.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const p1 = points[i], p2 = points[(i + 1) % n];
      sum += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(sum) / 2;
  }

  function polygonCentroid(points) {
    let x = 0, y = 0;
    points.forEach(p => { x += p.x; y += p.y; });
    return { x: x / points.length, y: y / points.length };
  }

  function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function fmt(n, digits) {
    if (digits === undefined) digits = 2;
    if (!isFinite(n)) return '-';
    return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  return { raiNganWaToM2, m2ToRaiNganWa, polygonAreaPx, polygonCentroid, dist, fmt };
})();
