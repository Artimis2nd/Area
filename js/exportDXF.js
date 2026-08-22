window.LDD = window.LDD || {};

// Minimal ASCII DXF R12 writer (POLYLINE/VERTEX + optional TEXT label).
// Uses classic POLYLINE (not LWPOLYLINE) for maximum compatibility with
// older AutoCAD / ArchiCAD DXF importers.
LDD.exportDXF = (function () {

  function build(state) {
    if (!state.metersPerPixel) throw new Error('กรุณาตั้งสเกลก่อน Export เป็น DXF');
    if (state.nodes.length < 2) throw new Error('ต้องมีจุดอย่างน้อย 2 จุดจึงจะ Export ได้');

    const mpp = state.metersPerPixel;
    // Flip Y: image pixel-space grows downward, CAD space grows upward.
    const pts = state.nodes.map(n => ({ x: n.x * mpp, y: -n.y * mpp }));

    let entities = '';
    entities += '0\nPOLYLINE\n8\nLAND_BOUNDARY\n66\n1\n70\n' + (state.closed ? 1 : 0) + '\n';
    pts.forEach(p => {
      entities += '0\nVERTEX\n8\nLAND_BOUNDARY\n10\n' + p.x.toFixed(4) + '\n20\n' + p.y.toFixed(4) + '\n30\n0.0\n';
    });
    entities += '0\nSEQEND\n';

    if (state.closed && state.nodes.length >= 3) {
      const areaM2 = LDD.utils.polygonAreaPx(state.nodes) * mpp * mpp;
      const rnw = LDD.utils.m2ToRaiNganWa(areaM2);
      const c = LDD.utils.polygonCentroid(pts);
      // ASCII-only label — DXF R12 text encoding is unreliable for Thai glyphs across CAD apps.
      const label = 'AREA ' + areaM2.toFixed(2) + ' SQM (' + rnw.rai + '-' + rnw.ngan + '-' + rnw.wa.toFixed(1) + ' RAI-NGAN-WA)';
      entities += '0\nTEXT\n8\nLAND_BOUNDARY_LABEL\n10\n' + c.x.toFixed(4) + '\n20\n' + c.y.toFixed(4) + '\n30\n0.0\n40\n1.0\n1\n' + label + '\n';
    }

    const header = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n';
    const tables = '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n1\n' +
      '0\nLAYER\n2\nLAND_BOUNDARY\n70\n0\n62\n5\n6\nCONTINUOUS\n' +
      '0\nENDTAB\n0\nENDSEC\n';
    const entSection = '0\nSECTION\n2\nENTITIES\n' + entities + '0\nENDSEC\n';

    return header + tables + entSection + '0\nEOF\n';
  }

  function download(state, filename) {
    const dxf = build(state);
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'land-plot.dxf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { build, download };
})();
