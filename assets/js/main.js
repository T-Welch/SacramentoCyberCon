(function () {
  'use strict';

  var config = window.SCC_CONFIG || {};
  var ENDPOINT = (config.SHEET_ENDPOINT || '').trim();
  var loadedAt = Date.now();

  // ---- Title typing effect (same feel as dc916.com) ----
  document.querySelectorAll('.console-effect').forEach(function (el) {
    var text = el.textContent;
    var cursor = document.createElement('span');
    cursor.className = 'cursor';
    el.textContent = '';
    el.appendChild(cursor);
    var i = 0;
    (function type() {
      if (i >= text.length) return;
      cursor.before(text.charAt(i++));
      setTimeout(type, 50 + Math.random() * 100);
    })();
  });

  // ---- Event date + countdown ----
  var eventDate = config.EVENT_DATE ? new Date(config.EVENT_DATE) : null;
  if (eventDate && !isNaN(eventDate)) {
    document.getElementById('event-date').textContent = eventDate.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    var line = document.getElementById('countdown-line');
    var out = document.getElementById('countdown');
    line.hidden = false;
    var tick = function () {
      var ms = eventDate - Date.now();
      if (ms <= 0) { out.textContent = "We're live!"; return; }
      var d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
      out.textContent = d + 'd ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's';
      setTimeout(tick, 1000);
    };
    tick();
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  // ---- Form ----
  var form = document.getElementById('signup-form');
  var status = document.getElementById('form-status');
  var rolesError = document.getElementById('roles-error');
  var submitBtn = form.querySelector('button[type="submit"]');
  var roleBoxes = form.querySelectorAll('input[name="roles"]');

  if (!ENDPOINT) document.getElementById('demo-banner').hidden = false;

  // Show/hide the extra fields for each selected role. Disabled fieldsets are
  // skipped by both browser validation and FormData, so hidden required fields
  // never block submission.
  function syncRoleSections() {
    roleBoxes.forEach(function (box) {
      var section = form.querySelector('.role-section[data-role="' + box.value + '"]');
      section.hidden = !box.checked;
      section.disabled = !box.checked;
    });
    if (selectedRoles().length) rolesError.hidden = true;
  }
  function selectedRoles() {
    return Array.prototype.filter.call(roleBoxes, function (b) { return b.checked; }).map(function (b) { return b.value; });
  }
  roleBoxes.forEach(function (box) { box.addEventListener('change', syncRoleSections); });

  // "Get Involved" cards pre-select a role
  document.querySelectorAll('[data-role-link]').forEach(function (link) {
    link.addEventListener('click', function () {
      var box = form.querySelector('input[name="roles"][value="' + link.dataset.roleLink + '"]');
      box.checked = true;
      syncRoleSections();
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.textContent = '';
    status.className = 'form-status';

    if (!selectedRoles().length) {
      rolesError.hidden = false;
      roleBoxes[0].focus();
      return;
    }
    if (!form.reportValidity()) return;

    var fd = new FormData(form);
    var payload = { roles: fd.getAll('roles'), elapsed_ms: Date.now() - loadedAt };
    fd.forEach(function (value, key) {
      if (key !== 'roles') payload[key] = typeof value === 'string' ? value.trim() : value;
    });

    submitBtn.disabled = true;
    setStatus('Transmitting…', '');

    send(payload)
      .then(function () {
        form.reset();
        syncRoleSections();
        loadedAt = Date.now();
        setStatus("✔ Received! We'll be in touch as details are finalized.", 'ok');
      })
      .catch(function (err) {
        console.error(err);
        setStatus('✖ Something went wrong sending your submission. Please try again, or reach us on Discord.', 'err');
      })
      .finally(function () { submitBtn.disabled = false; });
  });

  function send(payload) {
    if (!ENDPOINT) {
      console.info('[demo mode] would submit:', payload);
      return new Promise(function (r) { setTimeout(r, 600); });
    }
    // text/plain keeps this a "simple" CORS request (no preflight), which
    // Apps Script web apps require. The script parses the JSON body itself.
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || 'Unknown error');
        return data;
      });
  }

  function setStatus(msg, cls) {
    status.textContent = msg;
    status.className = 'form-status' + (cls ? ' ' + cls : '');
  }
})();
