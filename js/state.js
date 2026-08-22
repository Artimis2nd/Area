window.LDD = window.LDD || {};

LDD.state = {
  image: null,
  imageDataURL: null,
  imageName: '',

  nodes: [],
  closed: false,

  view: { zoom: 1, panX: 0, panY: 0 },

  metersPerPixel: null,
  calibrationLine: null,

  deed: { rai: 0, ngan: 0, wa: 0 },

  mode: 'idle',
  scaleLinePoints: [],
  selectedNode: -1,
  mouseScreen: null,

  projectName: 'untitled'
};
