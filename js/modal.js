window.LDD = window.LDD || {};

LDD.modal = (function () {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');

  function show(html) {
    box.innerHTML = html;
    overlay.classList.add('active');
  }
  function hide() {
    overlay.classList.remove('active');
    box.innerHTML = '';
  }

  function promptNumber({ title, label, placeholder, defaultValue }) {
    return new Promise((resolve) => {
      show(`
        <h3>${title}</h3>
        <label>${label}</label>
        <input type="number" step="any" id="modalInput" placeholder="${placeholder || ''}" value="${defaultValue || ''}" />
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modalCancel">ยกเลิก</button>
          <button class="btn btn-primary" id="modalOk">ตกลง</button>
        </div>
      `);
      const input = document.getElementById('modalInput');
      input.focus();
      input.select();
      const ok = () => { const v = parseFloat(input.value); hide(); resolve(isNaN(v) ? null : v); };
      const cancel = () => { hide(); resolve(null); };
      document.getElementById('modalOk').onclick = ok;
      document.getElementById('modalCancel').onclick = cancel;
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') ok();
        if (e.key === 'Escape') cancel();
      });
    });
  }

  function confirm({ title, message }) {
    return new Promise((resolve) => {
      show(`
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modalCancel">ยกเลิก</button>
          <button class="btn btn-danger-outline" id="modalOk">ยืนยัน</button>
        </div>
      `);
      document.getElementById('modalOk').onclick = () => { hide(); resolve(true); };
      document.getElementById('modalCancel').onclick = () => { hide(); resolve(false); };
    });
  }

  function alert({ title, message }) {
    return new Promise((resolve) => {
      show(`
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="modalOk">ตกลง</button>
        </div>
      `);
      document.getElementById('modalOk').onclick = () => { hide(); resolve(); };
    });
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });

  return { promptNumber, confirm, alert };
})();
