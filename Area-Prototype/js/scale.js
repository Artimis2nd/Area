/* scale.js — the two auto-scaling strategies described in the spec. */
(function (global) {
  "use strict";
  const G = global.LDD.Geometry;

  const ScaleEngine = {};

  ScaleEngine.currentAreaM2 = function (state) {
    const d = state.data;
    if (d.nodes.length < 3) return 0;
    const areaCu2 = G.area(d.nodes);
    return areaCu2 / (d.unitsPerMeter * d.unitsPerMeter);
  };

  ScaleEngine.deedTargetAreaM2 = function (state) {
    const dd = state.data.deed;
    return G.raiNganWaToM2(dd.rai, dd.ngan, dd.wa);
  };

  // Method 1: user selected two points + knows the true distance between them (meters).
  ScaleEngine.calibrateByDistance = function (state, realMeters) {
    const d = state.data;
    if (d.measurePoints.length !== 2) {
      return { ok: false, message: "กรุณาคลิกเลือก 2 จุดบนภาพก่อน" };
    }
    if (!(realMeters > 0)) {
      return { ok: false, message: "กรุณาระบุระยะจริง (เมตร) ที่มากกว่า 0" };
    }
    const pivot = d.measurePoints[0];
    const pixelDist = G.distance(d.measurePoints[0], d.measurePoints[1]);
    if (pixelDist < 1e-6) {
      return { ok: false, message: "จุดสองจุดที่เลือกอยู่ตำแหน่งเดียวกัน" };
    }
    // Bake the true scale into the geometry itself (image + vector), anchored at the
    // first measured point, so canvas-units become real meters (unitsPerMeter -> 1)
    // for every measurement/export from now on.
    const factor = realMeters / pixelDist;
    if (d.image) {
      const scaledImg = G.scalePointsAround(
        [
          { x: d.image.x, y: d.image.y },
          { x: d.image.x + d.image.width, y: d.image.y + d.image.height },
        ],
        pivot,
        factor
      );
      d.image.x = scaledImg[0].x;
      d.image.y = scaledImg[0].y;
      d.image.width = scaledImg[1].x - scaledImg[0].x;
      d.image.height = scaledImg[1].y - scaledImg[0].y;
    }
    const scaledNodes = G.scalePointsAround(d.nodes, pivot, factor);
    d.nodes.forEach((n, i) => { n.x = scaledNodes[i].x; n.y = scaledNodes[i].y; });

    const previousUnitsPerMeter = d.unitsPerMeter;
    d.unitsPerMeter = 1;
    d.lastCalibration = { method: "distance", pixelDist, realMeters, factor, previousUnitsPerMeter };
    d.measurePoints = [];
    d.mode = "select";
    state.touch("calibrated");
    return { ok: true, unitsPerMeter: d.unitsPerMeter };
  };

  // Method 2: no known reference length — scale the traced vector so its area matches the deed exactly.
  ScaleEngine.autoScaleByArea = function (state) {
    const d = state.data;
    if (d.nodes.length < 3) {
      return { ok: false, message: "กรุณาวาดรูปหลายเหลี่ยมอย่างน้อย 3 จุดก่อน" };
    }
    const targetAreaM2 = ScaleEngine.deedTargetAreaM2(state);
    if (!(targetAreaM2 > 0)) {
      return { ok: false, message: "กรุณากรอกเนื้อที่ตามโฉนด (ไร่/งาน/วา) ก่อน" };
    }
    const currentAreaM2 = ScaleEngine.currentAreaM2(state);
    if (!(currentAreaM2 > 0)) {
      return { ok: false, message: "รูปหลายเหลี่ยมปัจจุบันมีพื้นที่เป็นศูนย์" };
    }
    const scaleFactor = Math.sqrt(targetAreaM2 / currentAreaM2);
    const center = G.centroid(d.nodes);
    const scaled = G.scalePointsAround(d.nodes, center, scaleFactor);
    d.nodes.forEach((n, i) => { n.x = scaled[i].x; n.y = scaled[i].y; });
    d.lastCalibration = { method: "area", scaleFactor, targetAreaM2, previousAreaM2: currentAreaM2 };
    state.touch("nodes-changed");
    state.touch("calibrated");
    return { ok: true, scaleFactor, targetAreaM2 };
  };

  global.LDD = global.LDD || {};
  global.LDD.ScaleEngine = ScaleEngine;
})(window);
