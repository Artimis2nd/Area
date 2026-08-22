/* exportDXF.js — hand-rolled minimal DXF R12 writer (no external library needed). */
(function (global) {
  "use strict";
  const G = global.LDD.Geometry;

  function dxfLine(arr, code, value) {
    arr.push(String(code));
    arr.push(String(value));
  }

  function buildDXF(state) {
    const d = state.data;
    if (d.nodes.length < 3) throw new Error("ต้องมีรูปหลายเหลี่ยมอย่างน้อย 3 จุดก่อน Export");

    // Convert canvas-units -> meters, flip Y (screen is y-down, CAD is y-up),
    // then translate so the plot's bounding box starts near the origin.
    const metersPts = d.nodes.map((n) => ({ x: n.x / d.unitsPerMeter, y: -n.y / d.unitsPerMeter }));
    const bbox = G.boundingBox(metersPts);
    const pts = metersPts.map((p) => ({ x: p.x - bbox.minX, y: p.y - bbox.minY }));

    const areaM2 = G.area(d.nodes) / (d.unitsPerMeter * d.unitsPerMeter);
    const rgw = G.m2ToRaiNganWa(areaM2);

    const L = [];
    // HEADER
    dxfLine(L, 0, "SECTION");
    dxfLine(L, 2, "HEADER");
    dxfLine(L, 9, "$INSUNITS");
    dxfLine(L, 70, 6); // 6 = meters
    dxfLine(L, 0, "ENDSEC");

    // TABLES (define a layer)
    dxfLine(L, 0, "SECTION");
    dxfLine(L, 2, "TABLES");
    dxfLine(L, 0, "TABLE");
    dxfLine(L, 2, "LAYER");
    dxfLine(L, 70, 1);
    dxfLine(L, 0, "LAYER");
    dxfLine(L, 2, "LAND_PLOT");
    dxfLine(L, 70, 0);
    dxfLine(L, 62, 5);
    dxfLine(L, 6, "CONTINUOUS");
    dxfLine(L, 0, "ENDTAB");
    dxfLine(L, 0, "ENDSEC");

    // ENTITIES
    dxfLine(L, 0, "SECTION");
    dxfLine(L, 2, "ENTITIES");

    // Closed polyline of the land plot
    dxfLine(L, 0, "POLYLINE");
    dxfLine(L, 8, "LAND_PLOT");
    dxfLine(L, 66, 1);
    dxfLine(L, 70, 1); // closed
    pts.forEach((p) => {
      dxfLine(L, 0, "VERTEX");
      dxfLine(L, 8, "LAND_PLOT");
      dxfLine(L, 10, p.x.toFixed(4));
      dxfLine(L, 20, p.y.toFixed(4));
      dxfLine(L, 30, "0.0");
    });
    dxfLine(L, 0, "SEQEND");

    // Node markers + vertex numbers
    pts.forEach((p, i) => {
      dxfLine(L, 0, "CIRCLE");
      dxfLine(L, 8, "LAND_PLOT");
      dxfLine(L, 10, p.x.toFixed(4));
      dxfLine(L, 20, p.y.toFixed(4));
      dxfLine(L, 30, "0.0");
      dxfLine(L, 40, "0.15");

      dxfLine(L, 0, "TEXT");
      dxfLine(L, 8, "LAND_PLOT");
      dxfLine(L, 10, (p.x + 0.2).toFixed(4));
      dxfLine(L, 20, (p.y + 0.2).toFixed(4));
      dxfLine(L, 30, "0.0");
      dxfLine(L, 40, "0.3");
      dxfLine(L, 1, String(i + 1));
    });

    // Area label near centroid
    const c = G.centroid(pts);
    const label = `AREA ${areaM2.toFixed(2)} SQM (${rgw.rai}-${rgw.ngan}-${rgw.wa.toFixed(1)} RAI-NGAN-WA)`;
    dxfLine(L, 0, "TEXT");
    dxfLine(L, 8, "LAND_PLOT");
    dxfLine(L, 10, c.x.toFixed(4));
    dxfLine(L, 20, c.y.toFixed(4));
    dxfLine(L, 30, "0.0");
    dxfLine(L, 40, "0.5");
    dxfLine(L, 1, label);

    dxfLine(L, 0, "ENDSEC");
    dxfLine(L, 0, "EOF");

    return L.join("\n");
  }

  function download(state, filename) {
    const content = buildDXF(state);
    const blob = new Blob([content], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || (state.data.projectName || "land-plot") + ".dxf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  global.LDD = global.LDD || {};
  global.LDD.ExportDXF = { buildDXF, download };
})(window);
