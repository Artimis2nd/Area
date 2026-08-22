/* geometry.js — pure math helpers: no DOM, no state. */
(function (global) {
  "use strict";

  const Geometry = {};

  // ---- Conversion constants (Thai land units) ----
  Geometry.M2_PER_WA = 4;
  Geometry.M2_PER_NGAN = 400;
  Geometry.M2_PER_RAI = 1600;

  Geometry.raiNganWaToM2 = function (rai, ngan, wa) {
    rai = Number(rai) || 0;
    ngan = Number(ngan) || 0;
    wa = Number(wa) || 0;
    return rai * Geometry.M2_PER_RAI + ngan * Geometry.M2_PER_NGAN + wa * Geometry.M2_PER_WA;
  };

  // Reverse conversion, used to show digitized-polygon area in rai-ngan-wa form.
  Geometry.m2ToRaiNganWa = function (m2) {
    m2 = Math.max(0, Number(m2) || 0);
    const rai = Math.floor(m2 / Geometry.M2_PER_RAI);
    let rem = m2 - rai * Geometry.M2_PER_RAI;
    const ngan = Math.floor(rem / Geometry.M2_PER_NGAN);
    rem = rem - ngan * Geometry.M2_PER_NGAN;
    const wa = rem / Geometry.M2_PER_WA;
    return { rai, ngan, wa };
  };

  // ---- Vector / polygon math (points are {x,y} in a shared coordinate space) ----
  Geometry.distance = function (p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  };

  // Signed area via the shoelace formula. Positive = counter-clockwise (screen coords, y-down).
  Geometry.signedArea = function (points) {
    if (!points || points.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return sum / 2;
  };

  Geometry.area = function (points) {
    return Math.abs(Geometry.signedArea(points));
  };

  Geometry.centroid = function (points) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1) return { x: points[0].x, y: points[0].y };
    if (points.length === 2) {
      return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    }
    let cx = 0, cy = 0;
    const a = Geometry.signedArea(points);
    if (Math.abs(a) < 1e-9) {
      // Degenerate (collinear) polygon — fall back to the simple average.
      for (const p of points) { cx += p.x; cy += p.y; }
      return { x: cx / points.length, y: cy / points.length };
    }
    for (let i = 0; i < points.length; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % points.length];
      const cross = p0.x * p1.y - p1.x * p0.y;
      cx += (p0.x + p1.x) * cross;
      cy += (p0.y + p1.y) * cross;
    }
    const factor = 1 / (6 * a);
    return { x: cx * factor, y: cy * factor };
  };

  Geometry.boundingBox = function (points) {
    if (!points || points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  };

  // Perpendicular distance from point p to segment a-b, plus the closest point on it.
  Geometry.pointToSegment = function (p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    let t = lenSq > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t, cy = a.y + aby * t;
    return { distance: Math.hypot(p.x - cx, p.y - cy), point: { x: cx, y: cy }, t };
  };

  Geometry.scalePointsAround = function (points, center, factor) {
    return points.map((p) => ({
      x: center.x + (p.x - center.x) * factor,
      y: center.y + (p.y - center.y) * factor,
    }));
  };

  Geometry.formatNumber = function (n, decimals) {
    if (!isFinite(n)) return "-";
    const d = decimals == null ? 2 : decimals;
    return Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  global.LDD = global.LDD || {};
  global.LDD.Geometry = Geometry;
})(window);
