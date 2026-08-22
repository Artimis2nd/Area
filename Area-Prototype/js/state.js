/* state.js — single source of truth for the app + a tiny pub/sub bus. */
(function (global) {
  "use strict";

  function EventBus() {
    this.listeners = {};
  }
  EventBus.prototype.on = function (evt, cb) {
    (this.listeners[evt] = this.listeners[evt] || []).push(cb);
    return () => this.off(evt, cb);
  };
  EventBus.prototype.off = function (evt, cb) {
    const arr = this.listeners[evt];
    if (!arr) return;
    const i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  };
  EventBus.prototype.emit = function (evt, data) {
    const arr = this.listeners[evt];
    if (!arr) return;
    arr.slice().forEach((cb) => cb(data));
  };

  let nodeIdCounter = 1;

  function createInitialState() {
    return {
      projectName: "โฉนดที่ดิน-ใหม่",
      image: null, // { el, naturalWidth, naturalHeight, x, y, width, height, name }
      nodes: [], // [{ id, x, y }] in "cu" (canvas-unit) document space
      closed: false,
      unitsPerMeter: 1, // calibration: how many cu === 1 real meter
      deed: { rai: 0, ngan: 0, wa: 0 },
      view: { scale: 1, offsetX: 0, offsetY: 0 },
      mode: "select", // 'draw' | 'select' | 'pan' | 'measure'
      selectedNodeIndex: -1,
      hoverNodeIndex: -1,
      measurePoints: [], // up to 2 {x,y} points chosen for distance calibration
      lastCalibration: null, // { pixelDist, realMeters }
    };
  }

  function State() {
    this.data = createInitialState();
    this.bus = new EventBus();
  }

  State.prototype.on = function (evt, cb) { return this.bus.on(evt, cb); };
  State.prototype.emit = function (evt, data) { this.bus.emit(evt, data); };

  // Broad "changed" event covers most UI refresh needs; specific events allow targeted updates.
  State.prototype.touch = function (evt) {
    this.emit(evt || "changed");
    this.emit("changed");
  };

  State.prototype.nextNodeId = function () { return nodeIdCounter++; };

  State.prototype.reset = function () {
    this.data = createInitialState();
    this.touch("reset");
  };

  State.prototype.serialize = function () {
    const d = this.data;
    return {
      version: 1,
      projectName: d.projectName,
      image: d.image
        ? {
            dataUrl: d.image.dataUrl || null,
            naturalWidth: d.image.naturalWidth,
            naturalHeight: d.image.naturalHeight,
            x: d.image.x,
            y: d.image.y,
            width: d.image.width,
            height: d.image.height,
            name: d.image.name || "",
          }
        : null,
      nodes: d.nodes.map((n) => ({ x: n.x, y: n.y })),
      closed: d.closed,
      unitsPerMeter: d.unitsPerMeter,
      deed: d.deed,
      lastCalibration: d.lastCalibration,
    };
  };

  State.prototype.restore = function (json, onImageReady) {
    const d = this.data;
    d.projectName = json.projectName || "โฉนดที่ดิน";
    d.nodes = (json.nodes || []).map((n) => ({ id: this.nextNodeId(), x: n.x, y: n.y }));
    d.closed = !!json.closed;
    d.unitsPerMeter = json.unitsPerMeter || 1;
    d.deed = json.deed || { rai: 0, ngan: 0, wa: 0 };
    d.lastCalibration = json.lastCalibration || null;
    d.selectedNodeIndex = -1;
    d.measurePoints = [];
    d.mode = "select";

    if (json.image && json.image.dataUrl) {
      const img = new Image();
      img.onload = () => {
        d.image = {
          el: img,
          dataUrl: json.image.dataUrl,
          naturalWidth: json.image.naturalWidth || img.naturalWidth,
          naturalHeight: json.image.naturalHeight || img.naturalHeight,
          x: json.image.x || 0,
          y: json.image.y || 0,
          width: json.image.width || img.naturalWidth,
          height: json.image.height || img.naturalHeight,
          name: json.image.name || "",
        };
        this.touch("image-loaded");
        if (onImageReady) onImageReady(d.image);
      };
      img.src = json.image.dataUrl;
    } else {
      d.image = null;
    }
    this.touch("restored");
  };

  global.LDD = global.LDD || {};
  global.LDD.State = State;
})(window);
