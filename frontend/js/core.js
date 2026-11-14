/* DecaPic frontend core - tiny framework: DOM helper, API client, UI components, charts, router. No build step. */
(function () {
  'use strict';
  const DP = (window.DP = { pages: {}, state: { user: null, token: localStorage.getItem('dp_token') || null, theme: localStorage.getItem('dp_theme') || 'light', sound: localStorage.getItem('dp_sound') !== 'off', meta: null }, charts: [] });

  // ---------------------------------------------------------------- DOM helper
  function append(el, kids) { for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k.nodeType ? k : document.createTextNode(String(k))); } }
  DP.h = function (tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    append(el, kids); return el;
  };
  const h = DP.h;
  DP.icon = function (name, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('class', 'i ' + (cls || ''));
    s.innerHTML = (window.DP_ICONS || {})[name] || ''; return s;
  };
  const icon = DP.icon;
  DP.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  DP.qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== '' && v != null && v !== 0 && v !== false) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };
  DP.debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  DP.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  DP.can = (perm) => !!(DP.state.user && DP.state.user.permissions.includes(perm));

  // ---------------------------------------------------------------- sound effects (Web Audio API, 100% offline)
  let audioCtx = null;
  function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  let lastHoverSound = 0;
  DP.sound = {
    hover: (freq = 520, drop = 360, dur = 0.035, vol = 0.035) => {
      if (DP.state.sound === false) return;
      const now = performance.now();
      if (now - lastHoverSound < 40) return;
      lastHoverSound = now;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = ctx.currentTime;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(drop, t + dur);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.005);
      } catch (e) {}
    },
    click: () => {
      if (DP.state.sound === false) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = ctx.currentTime;
        osc.frequency.setValueAtTime(560, t);
        osc.frequency.exponentialRampToValueAtTime(260, t + 0.045);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.05);
      } catch (e) {}
    }
  };

  DP.toggleSound = () => {
    DP.state.sound = !DP.state.sound;
    localStorage.setItem('dp_sound', DP.state.sound ? 'on' : 'off');
    const btn = document.getElementById('sound-btn');
    if (btn) {
      DP.clear(btn).append(icon(DP.state.sound ? 'volume-2' : 'volume-x'));
      btn.title = DP.state.sound ? 'Mute sound effects' : 'Enable sound effects';
    }
    ui.toast(DP.state.sound ? 'Sound effects enabled' : 'Sound effects muted', 'info');
    if (DP.state.sound) DP.sound.click();
  };

  // ---------------------------------------------------------------- formatting
  const F = (DP.fmt = {});
  F.num = (n, d = 0) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
  F.money = (n, full) => {
    if (n == null || isNaN(n)) return '-'; n = Number(n); const a = Math.abs(n);
    if (full || a < 1000) return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const u = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
    return (n < 0 ? '-' : '') + '$' + (a / u[0]).toFixed(a / u[0] >= 100 ? 0 : 1).replace(/\.0$/, '') + u[1];
  };
  F.pct = (v, d = 0) => (v == null || isNaN(v) ? '-' : Number(v).toFixed(d) + '%');
  F.pctf = (v, d = 0) => (v == null || isNaN(v) ? '-' : (Number(v) * 100).toFixed(d) + '%');
  F.date = (s) => { if (!s) return '-'; const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
  F.time = (s) => (!s ? '-' : String(s).slice(11, 16) || String(s).slice(0, 5));
  F.dur = (min) => { if (min == null) return '-'; min = Math.round(min); const hh = Math.floor(min / 60), m = min % 60; return hh ? hh + 'h ' + (m ? m + 'm' : '') : m + 'm'; };
  F.hours = (x) => (x == null ? '-' : Number(x).toFixed(1) + ' h');
  F.title = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  F.ago = (s) => { const d = new Date(s); const m = Math.round((Date.now() - d) / 60000); if (isNaN(m)) return ''; if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; if (m < 1440) return Math.round(m / 60) + ' h ago'; return Math.round(m / 1440) + ' d ago'; };
  F.initials = (n) => String(n || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  F.hash = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; };

  // ---------------------------------------------------------------- API
  DP.api = async function (path, opts = {}) {
    const headers = { Accept: 'application/json' };
    if (DP.state.token) headers.Authorization = 'Bearer ' + DP.state.token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch('/api' + path, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { throw Object.assign(new Error('Cannot reach the DecaPic server. Is it running?'), { status: 0 }); }
    let data = null; try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      if (res.status === 401 && DP.state.token && !path.startsWith('/auth/login')) { DP.logout(true); }
      let msg = (data && data.detail) || res.statusText || 'Request failed';
      if (Array.isArray(msg)) msg = msg.map((m) => (m.loc ? m.loc.slice(-1)[0] + ': ' : '') + m.msg).join('; ');
      throw Object.assign(new Error(msg), { status: res.status });
    }
    return data;
  };
  DP.login = async (email, password) => {
    const r = await DP.api('/auth/login', { body: { email, password } });
    DP.state.token = r.token; DP.state.user = r.user; localStorage.setItem('dp_token', r.token); return r.user;
  };
  DP.logout = (expired) => { DP.state.token = null; DP.state.user = null; localStorage.removeItem('dp_token'); DP.destroyCharts(); if (expired) DP.ui.toast('Session expired, please sign in again', 'warn'); location.hash = '#/login'; };

  // ---------------------------------------------------------------- theme + charts
  DP.setTheme = (t) => {
    DP.state.theme = t; localStorage.setItem('dp_theme', t); document.documentElement.setAttribute('data-theme', t);
    DP.chartDefaults(); DP.charts.forEach((c) => { try { c.update('none'); } catch (e) { /* destroyed */ } });
  };
  DP.colors = () => { const d = DP.state.theme === 'dark'; return { teal: '#10c49f', mint: '#00cc99', tan: '#c5aa8d', coral: '#ef7b5f', gold: '#e8b64a', sky: '#4f9de8', violet: '#8b7cf0', ink: d ? '#e9f6f2' : '#06130f', grid: d ? 'rgba(255,255,255,.07)' : 'rgba(6,40,30,.07)', text: d ? '#8fa89e' : '#62766e', card: d ? '#0d1a17' : '#ffffff' }; };
  DP.palette = () => { const c = DP.colors(); return [c.teal, c.tan, c.coral, c.sky, c.violet, c.gold, c.mint, '#9aa9a3']; };
  DP.chartDefaults = () => {
    if (!window.Chart) return; const c = DP.colors();
    Chart.defaults.font.family = "'Outfit', system-ui, sans-serif"; Chart.defaults.font.size = 12; Chart.defaults.color = c.text; Chart.defaults.borderColor = c.grid;
    Chart.defaults.animation = { duration: 1100, easing: 'easeOutQuart' }; Chart.defaults.plugins.legend.labels.usePointStyle = true; Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.tooltip.backgroundColor = c.ink; Chart.defaults.plugins.tooltip.titleColor = c.card; Chart.defaults.plugins.tooltip.bodyColor = c.card; Chart.defaults.plugins.tooltip.cornerRadius = 10; Chart.defaults.plugins.tooltip.padding = 10;
  };
  DP.chart = (parent, config) => {
    const box = h('div', { class: 'chart-box' }); const cv = h('canvas'); box.append(cv); parent.append(box);
    if (!window.Chart) return null; DP.chartDefaults();
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {});
    const ch = new Chart(cv, config); DP.charts.push(ch); return ch;
  };
  DP.mkChart = (cv, config) => { if (!window.Chart) return null; DP.chartDefaults(); config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {}); const ch = new Chart(cv, config); DP.charts.push(ch); return ch; };
  DP.destroyCharts = () => { DP.charts.forEach((c) => { try { c.destroy(); } catch (e) { /* ignore */ } }); DP.charts = []; };
  DP.gradient = (cv, c1, c2) => { try { const ctx = cv.getContext('2d'); const g = ctx.createLinearGradient(0, 0, 0, cv.height || 260); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; } catch (e) { return c1; } };

  // ---------------------------------------------------------------- UI components
  const ui = (DP.ui = {});
  ui.toast = (msg, type) => {
    let box = document.querySelector('.toasts'); if (!box) { box = h('div', { class: 'toasts' }); document.body.append(box); }
    const t = h('div', { class: 'toast ' + (type === 'err' ? 'err' : type === 'warn' ? 'warn' : '') }, icon(type === 'err' ? 'circle-alert' : type === 'warn' ? 'triangle-alert' : 'circle-check'), h('span', null, msg));
    box.append(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 360); }, type === 'err' ? 6000 : 3800);
  };
  ui.overlay = (cls) => { const o = h('div', { class: 'overlay ' + (cls || '') }); document.body.append(o); const close = () => { o.style.animation = 'fadeIn .2s reverse both'; setTimeout(() => o.remove(), 190); document.removeEventListener('keydown', esc); }; const esc = (e) => e.key === 'Escape' && close(); document.addEventListener('keydown', esc); o.addEventListener('mousedown', (e) => e.target === o && close()); return { o, close }; };
  ui.modal = ({ title, sub, body, actions }) => {
    const { o, close } = ui.overlay(); const m = h('div', { class: 'modal', style: { position: 'relative' } });
    m.append(h('button', { class: 'icon-btn close', onclick: close, 'aria-label': 'Close' }, icon('x')), h('h3', null, title), sub ? h('div', { class: 'muted small' }, sub) : null, h('div', { style: { marginTop: '18px' } }, body));
    if (actions) m.append(h('div', { class: 'actions' }, actions.map((a) => h('button', { class: 'btn ' + (a.cls || ''), onclick: async (e) => { ui.ripple(e); const r = a.onClick ? await a.onClick(close) : null; if (!a.keepOpen && r !== false) close(); } }, a.label))));
    o.append(m); return { close, el: m };
  };
  ui.drawer = ({ title, sub, body }) => {
    const { o, close } = ui.overlay('drawer-o'); const d = h('div', { class: 'drawer', style: { position: 'relative' } });
    d.append(h('button', { class: 'icon-btn close', onclick: close, 'aria-label': 'Close' }, icon('x')), h('h2', { style: { fontSize: '26px', fontWeight: 700, letterSpacing: '-.6px', paddingRight: '50px' } }, title), sub ? h('div', { class: 'muted', style: { marginTop: '2px' } }, sub) : null, h('div', { style: { marginTop: '20px' } }, body));
    o.append(d); return { close, el: d };
  };
  ui.ripple = (e) => { DP.sound.click(); const b = e.currentTarget; if (!b || !b.getBoundingClientRect) return; const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height); const sp = h('span', { class: 'rip', style: { width: s + 'px', height: s + 'px', left: (e.clientX - r.left - s / 2) + 'px', top: (e.clientY - r.top - s / 2) + 'px' } }); b.append(sp); setTimeout(() => sp.remove(), 650); };
  ui.btn = (label, o = {}) => h('button', { class: 'btn ' + (o.cls || ''), onclick: (e) => { ui.ripple(e); o.onClick && o.onClick(e); }, title: o.title, disabled: o.disabled }, o.icon ? icon(o.icon) : null, label);
  ui.skeleton = (n = 3, block) => h('div', null, block ? h('div', { class: 'skeleton block' }) : null, Array.from({ length: n }, (_, i) => h('div', { class: 'skeleton line', style: { width: 100 - i * 11 + '%' } })));
  ui.empty = (msg, ic) => h('div', { class: 'empty' }, icon(ic || 'search'), h('div', null, msg || 'Nothing here yet'));
  ui.tag = (text, kind) => h('span', { class: 'tag ' + (kind || '') }, text);
  const STATUS_KIND = { Completed: 'ok', Active: 'ok', Approved: 'ok', Available: 'ok', Released: 'ok', Present: 'ok', Signed: 'ok', Resolved: 'ok', 'In Production': 'teal', 'Post-production': 'violet', 'Pre-production': 'info', Development: 'tan', Scheduled: 'info', Draft: 'tan',
    Closed: 'bad', Cancelled: 'bad', Absent: 'bad', Late: 'warn', Critical: 'bad', High: 'warn', Delayed: 'warn', Pending: 'warn', Negotiating: 'warn', 'In Progress': 'teal', Moderate: 'warn', Low: 'info', Medium: 'warn', Major: 'bad', Minor: 'info', Unavailable: 'bad', Busy: 'warn' };
  ui.status = (s) => ui.tag(s || '-', STATUS_KIND[s] || '');
  ui.bar = (value, max, kind) => { const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0)); const i = h('i'); requestAnimationFrame(() => setTimeout(() => (i.style.width = pct + '%'), 60)); return h('div', { class: 'bar ' + (kind || '') }, i); };
  ui.ring = (frac, label, o = {}) => {
    const size = o.size || 110, sw = o.stroke || 11, r = (size - sw) / 2, C = 2 * Math.PI * r; const col = o.color || 'var(--teal)';
    const fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); ['cx', 'cy'].forEach((a) => fg.setAttribute(a, size / 2)); fg.setAttribute('r', r); fg.setAttribute('fill', 'none'); fg.setAttribute('class', 'fg'); fg.setAttribute('stroke', col); fg.setAttribute('stroke-width', sw); fg.setAttribute('stroke-dasharray', C); fg.setAttribute('stroke-dashoffset', C);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); ['cx', 'cy'].forEach((a) => bg.setAttribute(a, size / 2)); bg.setAttribute('r', r); bg.setAttribute('fill', 'none'); bg.setAttribute('class', 'bg'); bg.setAttribute('stroke-width', sw);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.append(bg, fg);
    requestAnimationFrame(() => setTimeout(() => fg.setAttribute('stroke-dashoffset', C * (1 - Math.max(0, Math.min(1, frac)))), 80));
    return h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } }, svg, h('div', { class: 'c' }, h('b', null, o.center != null ? o.center : F.pctf(frac)), h('span', null, label || '')));
  };
  ui.gauge = (p) => {   // semicircle risk gauge, p in 0..1
    const W = 260, H = 150, R = 110, cx = 130, cy = 130, NS = 'http://www.w3.org/2000/svg';
    const arc = (a0, a1) => { const x = (a) => cx + R * Math.cos(Math.PI * (1 - a)), y = (a) => cy - R * Math.sin(Math.PI * (1 - a)); return `M ${x(a0)} ${y(a0)} A ${R} ${R} 0 0 1 ${x(a1)} ${y(a1)}`; };
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', '100%');
    const mk = (d, col, w) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', col); p.setAttribute('stroke-width', w); p.setAttribute('stroke-linecap', 'round'); return p; };
    svg.append(mk(arc(0, 1), 'var(--line)', 16));
    const col = p < 0.33 ? '#10b981' : p < 0.66 ? '#f59e0b' : '#ef5b4b'; const fg = mk(arc(0, 0.999), col, 16); const L = Math.PI * R; fg.setAttribute('stroke-dasharray', L); fg.setAttribute('stroke-dashoffset', L); fg.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.22,.9,.3,1), stroke .6s'; svg.append(fg);
    requestAnimationFrame(() => setTimeout(() => fg.setAttribute('stroke-dashoffset', L * (1 - Math.max(0.02, p))), 60));
    const level = p < 0.33 ? 'Low risk' : p < 0.66 ? 'Medium risk' : 'High risk';
    return h('div', { class: 'gauge' }, svg, h('div', { class: 'c' }, h('b', { style: { color: col } }, F.pctf(p)), h('span', null, level)));
  };
  ui.countUp = (el, to, fmt, dur = 1100) => {
    to = Number(to) || 0; fmt = fmt || ((v) => F.num(v)); const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to); };
    requestAnimationFrame(step);
  };
  ui.avatar = (name, cls) => { const hh = F.hash(name) % 360; return h('div', { class: 'avatar ' + (cls || ''), style: { background: `linear-gradient(135deg, hsl(${(hh % 40) + 160} 70% 52%), hsl(${(hh % 50) + 20} 55% 68%))` } }, F.initials(name)); };
  ui.poster = (title, o = {}) => {
    const hh = F.hash(title), a = (hh % 60) + 150, b = (hh >> 3) % 50 + 10;
    return h('div', { class: 'poster ' + (o.cls || ''), style: Object.assign({ background: `linear-gradient(145deg, hsl(${a} 62% 38%), hsl(${b} 70% 52%))` }, o.style || {}) }, o.year ? h('span', { class: 'yr' }, o.year) : null, h('div', { class: 'pt' }, title));
  };
  ui.table = ({ cols, rows, onRow, empty }) => {
    if (!rows || !rows.length) return ui.empty(empty || 'No records');
    const t = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.right ? 'r' : '' }, c.label)))),
      h('tbody', null, rows.map((r, i) => h('tr', { class: onRow ? 'click' : '', style: { '--i': Math.min(i, 30) }, onclick: onRow ? () => onRow(r) : null },
        cols.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h('td', { class: (c.right ? 'r ' : '') + (c.mono ? 'mono' : '') }, v == null ? '-' : v); })))));
    return h('div', { class: 'tbl-wrap' }, t);
  };
  ui.tabs = (items, onChange, initial) => {
    const wrap = h('div', { class: 'tabs' }); const slider = h('span', { class: 'slider' }); wrap.append(slider); const btns = {};
    const place = (b) => { slider.style.left = b.offsetLeft + 'px'; slider.style.width = b.offsetWidth + 'px'; };
    const select = (id, silent) => { Object.entries(btns).forEach(([k, b]) => b.classList.toggle('active', k === id)); place(btns[id]); if (!silent) onChange(id); };
    items.forEach((it) => { const b = h('button', { onclick: () => select(it.id) }, it.icon ? icon(it.icon) : null, it.label); btns[it.id] = b; wrap.append(b); });
    wrap.select = select; const start = initial || items[0].id;
    requestAnimationFrame(() => { select(start, true); setTimeout(() => place(btns[wrap.querySelector('.active') ? wrap.querySelector('.active').dataset.id || start : start]), 150); });
    Object.keys(btns).forEach((k) => (btns[k].dataset.id = k));
    window.addEventListener('resize', () => { const a = wrap.querySelector('.active'); if (a) place(a); });
    return wrap;
  };
  ui.pager = (page, total, size, cb) => {
    const pages = Math.max(1, Math.ceil(total / size)); if (pages <= 1) return h('div');
    const nums = []; const add = (n) => nums.push(n); add(1); if (page > 3) add('…'); for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) add(i); if (page < pages - 2) add('…'); if (pages > 1) add(pages);
    return h('div', { class: 'pager' }, h('button', { disabled: page <= 1, onclick: () => cb(page - 1) }, icon('chevron-left')),
      nums.map((n) => (n === '…' ? h('span', { class: 'muted' }, '…') : h('button', { class: n === page ? 'active' : '', onclick: () => cb(n) }, n))), h('button', { disabled: page >= pages, onclick: () => cb(page + 1) }, icon('chevron-right')));
  };
  ui.field = (label, input, hint) => h('div', { class: 'field' }, h('label', null, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
  ui.select = (options, value, onchange, cls) => { const s = h('select', { class: 'select ' + (cls || ''), onchange: (e) => onchange && onchange(e.target.value) }, options.map((o) => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return h('option', { value: v, selected: String(v) === String(value) ? true : null }, l); })); return s; };
  ui.slider = (label, min, max, step, value, onchange, fmt) => {
    const out = h('b', null, fmt ? fmt(value) : value); const input = h('input', { type: 'range', min, max, step, value });
    const sync = () => { input.style.setProperty('--pct', ((input.value - min) / (max - min)) * 100 + '%'); out.textContent = fmt ? fmt(Number(input.value)) : input.value; }; sync();
    input.addEventListener('input', () => { sync(); onchange && onchange(Number(input.value)); });
    const el = h('div', { class: 'field' }, h('div', { class: 'row small' }, h('label', null, label), h('span', { class: 'right-a' }, out)), input); el.setValue = (v) => { input.value = v; sync(); }; el.input = input; return el;
  };
  ui.switch = (label, checked, onchange) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: checked ? true : null, onchange: (e) => onchange && onchange(e.target.checked) }), h('span', { class: 'tr' }), h('span', null, label));
  ui.callout = (msg, kind, ic) => h('div', { class: 'callout ' + (kind || '') }, icon(ic || (kind === 'bad' ? 'circle-alert' : kind === 'warn' ? 'triangle-alert' : 'info')), h('div', null, msg));
  ui.impact = (items, nameMap) => {
    const max = Math.max(0.0001, ...items.map((i) => Math.abs(i.impact)));
    return h('div', { class: 'impact' }, items.map((i) => { const w = (Math.abs(i.impact) / max) * 50; const bar = h('i', { class: i.impact > 0 ? 'pos' : 'neg' }); requestAnimationFrame(() => setTimeout(() => (bar.style.width = w + '%'), 80));
      return h('div', { class: 'r' }, h('span', { class: 'nm', title: i.feature }, (nameMap && nameMap[i.feature]) || F.title(i.feature)), h('div', { class: 'b' }, bar), h('span', { class: 'num tiny muted', style: { textAlign: 'right' } }, (i.impact > 0 ? '+' : '') + (Math.abs(i.impact) < 1 ? i.impact.toFixed(2) : i.impact.toFixed(1)))); }));
  };
  ui.confirm = (msg, onYes, label) => ui.modal({ title: 'Are you sure?', body: h('p', { class: 'muted' }, msg), actions: [{ label: 'Cancel' }, { label: label || 'Yes, continue', cls: 'primary', onClick: onYes }] });

  // ---------------------------------------------------------------- router
  const routes = []; let renderToken = 0;
  DP.route = (pattern, handler, opts) => { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'); routes.push({ re, keys, handler, opts: opts || {}, pattern }); };
  DP.go = (path) => { if (location.hash === '#' + path) DP.render(); else location.hash = '#' + path; };
  DP.current = () => { const raw = location.hash.slice(1) || '/dashboard'; const [path, q] = raw.split('?'); return { path, query: Object.fromEntries(new URLSearchParams(q || '')) }; };
  DP.reveal = (view) => { Array.from(view.children).forEach((c, i) => c.style.setProperty('--i', i)); view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); };
  DP.render = async () => {
    const cur = DP.current(); const token = ++renderToken;
    for (const r of routes) {
      const m = r.re.exec(cur.path); if (!m) continue;
      if (!r.opts.public && !DP.state.user) { if (DP.state.token) { try { DP.state.user = await DP.api('/auth/me'); } catch (e) { DP.go('/login'); return; } } else { DP.go('/login'); return; } }
      if (r.opts.perm && !DP.can(r.opts.perm)) { DP.go('/dashboard'); DP.ui.toast('Your role does not have access to that page', 'warn'); return; }
      const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      DP.destroyCharts(); const ctx = { params, query: cur.query, path: cur.path, token, alive: () => token === renderToken };
      try { await r.handler(ctx); } catch (e) { console.error(e); if (ctx.alive()) { const v = document.getElementById('view'); if (v) { DP.clear(v); v.append(ui.callout('Something went wrong: ' + e.message, 'bad')); } } }
      return;
    }
    DP.go('/dashboard');
  };
  window.addEventListener('hashchange', () => DP.render());
  document.documentElement.setAttribute('data-theme', DP.state.theme);

  // Global hover sound for interactive elements across all dashboards & pages
  if (typeof document !== 'undefined') {
    const unlockAudio = () => {
      getAudioContext();
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    document.addEventListener('keydown', unlockAudio, { passive: true });

    document.addEventListener('mouseover', (e) => {
      if (!e.target || !e.target.closest) return;
      const target = e.target.closest(
        '.card.hover, .card.kpi, .proj-card, .film-card, .btn, .icon-btn, .nav a, .chip, .tabs button, .list-row, .tbl tr.click, .searchbtn, .demo, .account-switcher, .switch'
      );
      if (!target) return;
      if (e.relatedTarget && target.contains(e.relatedTarget)) return;
      DP.sound.hover();
    }, { passive: true });
  }
})();
