window.LDD = window.LDD || {};

// Full, standards-complete ASCII DXF R12 (AC1009) writer.
//
// AutoCAD tolerates a bare-bones file (HEADER + a minimal LAYER table +
// ENTITIES), but stricter importers such as ArchiCAD expect the whole
// classic R12 skeleton to be present: HEADER, a TABLES section with every
// standard table (VPORT/LTYPE/LAYER/STYLE/VIEW/UCS/APPID/DIMSTYLE), a
// BLOCKS section defining *MODEL_SPACE / *PAPER_SPACE, then ENTITIES, then
// EOF. Missing any of these is what produced ArchiCAD's
// "file is too small / probably damaged" error even though the file parsed
// fine in AutoCAD.
//
// Note: $CLASSES is not part of DXF R12 — it was introduced in R13
// (AC1012). Including it here would make this an invalid AC1009 file, so
// it is intentionally omitted.
LDD.exportDXF = (function () {

  function pair(code, value) { return code + '\n' + value; }
  function lines(pairs) { return pairs.map(p => pair(p[0], p[1])).join('\n') + '\n'; }

  function bbox(pts) {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }

  function buildHeader(ext) {
    const w = Math.max(ext.maxX - ext.minX, 1);
    const h = Math.max(ext.maxY - ext.minY, 1);
    return lines([
      [0, 'SECTION'], [2, 'HEADER'],
      [9, '$ACADVER'], [1, 'AC1009'],
      [9, '$INSBASE'], [10, '0.0'], [20, '0.0'], [30, '0.0'],
      [9, '$EXTMIN'], [10, ext.minX.toFixed(4)], [20, ext.minY.toFixed(4)], [30, '0.0'],
      [9, '$EXTMAX'], [10, ext.maxX.toFixed(4)], [20, ext.maxY.toFixed(4)], [30, '0.0'],
      [9, '$LIMMIN'], [10, '0.0'], [20, '0.0'],
      [9, '$LIMMAX'], [10, w.toFixed(4)], [20, h.toFixed(4)],
      [9, '$LUNITS'], [70, '2'],
      [9, '$LUPREC'], [70, '4'],
      [9, '$AUNITS'], [70, '0'],
      [9, '$AUPREC'], [70, '0'],
      // Meters — matches the meters-per-pixel scale used to build the geometry below.
      [9, '$INSUNITS'], [70, '6'],
      [0, 'ENDSEC']
    ]);
  }

  function buildTables() {
    const vport = lines([[0, 'TABLE'], [2, 'VPORT'], [70, '0'], [0, 'ENDTAB']]);

    const ltype = lines([
      [0, 'TABLE'], [2, 'LTYPE'], [70, '1'],
      [0, 'LTYPE'], [2, 'CONTINUOUS'], [70, '0'], [3, 'Solid line'], [72, '65'], [73, '0'], [40, '0.0'],
      [0, 'ENDTAB']
    ]);

    const style = lines([
      [0, 'TABLE'], [2, 'STYLE'], [70, '1'],
      [0, 'STYLE'], [2, 'STANDARD'], [70, '0'], [40, '0.0'], [41, '1.0'], [50, '0.0'], [71, '0'], [42, '0.2'], [3, ''], [4, ''],
      [0, 'ENDTAB']
    ]);

    const view = lines([[0, 'TABLE'], [2, 'VIEW'], [70, '0'], [0, 'ENDTAB']]);
    const ucs = lines([[0, 'TABLE'], [2, 'UCS'], [70, '0'], [0, 'ENDTAB']]);

    const appid = lines([
      [0, 'TABLE'], [2, 'APPID'], [70, '1'],
      [0, 'APPID'], [2, 'ACAD'], [70, '0'],
      [0, 'ENDTAB']
    ]);

    const dimstyle = lines([
      [0, 'TABLE'], [2, 'DIMSTYLE'], [70, '1'],
      [0, 'DIMSTYLE'], [2, 'STANDARD'], [70, '0'],
      [0, 'ENDTAB']
    ]);

    const layer = lines([
      [0, 'TABLE'], [2, 'LAYER'], [70, '3'],
      [0, 'LAYER'], [2, '0'], [70, '0'], [62, '7'], [6, 'CONTINUOUS'],
      [0, 'LAYER'], [2, 'LAND_BOUNDARY'], [70, '0'], [62, '5'], [6, 'CONTINUOUS'],
      [0, 'LAYER'], [2, 'LAND_BOUNDARY_LABEL'], [70, '0'], [62, '3'], [6, 'CONTINUOUS'],
      [0, 'ENDTAB']
    ]);

    return pair(0, 'SECTION') + '\n' + pair(2, 'TABLES') + '\n'
      + vport + ltype + layer + style + view + ucs + appid + dimstyle
      + pair(0, 'ENDSEC') + '\n';
  }

  function buildBlocks() {
    const modelSpace = lines([
      [0, 'BLOCK'], [8, '0'], [2, '*MODEL_SPACE'], [70, '0'], [10, '0.0'], [20, '0.0'], [30, '0.0'], [3, '*MODEL_SPACE'], [1, ''],
      [0, 'ENDBLK'], [8, '0']
    ]);
    const paperSpace = lines([
      [0, 'BLOCK'], [8, '0'], [2, '*PAPER_SPACE'], [70, '0'], [10, '0.0'], [20, '0.0'], [30, '0.0'], [3, '*PAPER_SPACE'], [1, ''],
      [0, 'ENDBLK'], [8, '0']
    ]);
    return pair(0, 'SECTION') + '\n' + pair(2, 'BLOCKS') + '\n'
      + modelSpace + paperSpace
      + pair(0, 'ENDSEC') + '\n';
  }

  function buildEntities(state, pts) {
    const rows = [];
    rows.push([0, 'POLYLINE'], [8, 'LAND_BOUNDARY'], [66, '1'], [70, state.closed ? '1' : '0']);
    pts.forEach(p => {
      rows.push([0, 'VERTEX'], [8, 'LAND_BOUNDARY'], [10, p.x.toFixed(4)], [20, p.y.toFixed(4)], [30, '0.0']);
    });
    rows.push([0, 'SEQEND'], [8, 'LAND_BOUNDARY']);

    if (state.closed && state.nodes.length >= 3) {
      const areaM2 = LDD.utils.polygonAreaPx(state.nodes) * state.metersPerPixel * state.metersPerPixel;
      const rnw = LDD.utils.m2ToRaiNganWa(areaM2);
      const c = LDD.utils.polygonCentroid(pts);
      // ASCII-only label — DXF R12 text encoding is unreliable for Thai glyphs across CAD apps.
      const label = 'AREA ' + areaM2.toFixed(2) + ' SQM (' + rnw.rai + '-' + rnw.ngan + '-' + rnw.wa.toFixed(1) + ' RAI-NGAN-WA)';
      rows.push(
        [0, 'TEXT'], [8, 'LAND_BOUNDARY_LABEL'],
        [10, c.x.toFixed(4)], [20, c.y.toFixed(4)], [30, '0.0'],
        [40, '1.0'], [1, label]
      );
    }

    return pair(0, 'SECTION') + '\n' + pair(2, 'ENTITIES') + '\n'
      + lines(rows)
      + pair(0, 'ENDSEC') + '\n';
  }

  function build(state) {
    if (!state.metersPerPixel) throw new Error('กรุณาตั้งสเกลก่อน Export เป็น DXF');
    if (state.nodes.length < 2) throw new Error('ต้องมีจุดอย่างน้อย 2 จุดจึงจะ Export ได้');

    const mpp = state.metersPerPixel;
    // Flip Y: image pixel-space grows downward, CAD space grows upward.
    const pts = state.nodes.map(n => ({ x: n.x * mpp, y: -n.y * mpp }));
    const ext = bbox(pts);

    return buildHeader(ext)
      + buildTables()
      + buildBlocks()
      + buildEntities(state, pts)
      + pair(0, 'EOF') + '\n';
  }

  function download(state, filename) {
    const dxf = build(state);
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'land_plot.dxf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { build, download };
})();
