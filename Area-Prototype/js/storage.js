/* storage.js — project persistence: browser localStorage + portable JSON file. */
(function (global) {
  "use strict";

  const LS_KEY = "ldd.projects.v1";

  function readAll() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("Failed reading localStorage", e);
      return {};
    }
  }

  function writeAll(obj) {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  }

  const Storage = {};

  Storage.listProjects = function () {
    const all = readAll();
    return Object.keys(all)
      .map((name) => ({ name, savedAt: all[name].savedAt }))
      .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  };

  Storage.saveProject = function (state, name) {
    const all = readAll();
    const json = state.serialize();
    json.savedAt = new Date().toISOString();
    all[name] = json;
    try {
      writeAll(all);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: "บันทึกไม่สำเร็จ (พื้นที่จัดเก็บเต็ม) ลองใช้ Export JSON แทน: " + e.message };
    }
  };

  Storage.loadProject = function (state, name, onImageReady) {
    const all = readAll();
    const json = all[name];
    if (!json) return { ok: false, message: "ไม่พบโปรเจกต์นี้" };
    state.restore(json, onImageReady);
    return { ok: true };
  };

  Storage.deleteProject = function (name) {
    const all = readAll();
    delete all[name];
    writeAll(all);
  };

  Storage.exportJSONFile = function (state) {
    const json = state.serialize();
    json.savedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (state.data.projectName || "land-plot-project") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  Storage.importJSONFile = function (state, file, onImageReady) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result);
          state.restore(json, onImageReady);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

  global.LDD = global.LDD || {};
  global.LDD.Storage = Storage;
})(window);
