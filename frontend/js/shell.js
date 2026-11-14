/* App shell (sidebar, top bar, command palette) and the animated login page */
(function () {
  'use strict';
  const { h, icon, ui, fmt: F } = DP;
  const root = () => document.getElementById('root');

  DP.logo = (cls, animated) => {
    const word = (t, c) => h('span', { class: c }, animated ? t.split('').map((ch, i) => h('span', { class: 'ch', style: { animationDelay: 0.15 + i * 0.09 + 's' } }, ch)) : t);
    const pic = h('span', { class: 'pic' }, ...('Pıc'.split('').map((ch, i) => (ch === 'ı' ? h('i', animated ? { class: 'ch', style: { animationDelay: 0.15 + (4 + i) * 0.09 + 's' } } : null, 'ı') : h('span', animated ? { class: 'ch', style: { animationDelay: 0.15 + (4 + i) * 0.09 + 's' } } : null, ch)))));
    return h('span', { class: 'logo ' + (cls || '') }, word('Deca', 'deca'), pic);
  };

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', path: '/dashboard' },
    { id: 'projects', label: 'Projects', icon: 'clapperboard', path: '/projects' },
    { id: 'films', label: 'Films', icon: 'film', path: '/films' },
    { id: 'people', label: 'People', icon: 'users', path: '/people' },
    { id: 'resources', label: 'Resources', icon: 'package', path: '/resources' },
    { sect: 'Intelligence' },
    { id: 'ai', label: 'AI Studio', icon: 'sparkles', path: '/ai', perm: 'ai' },
    { id: 'lab', label: 'SQL Lab', icon: 'database', path: '/lab', perm: 'lab' },
  ];

  const DEMO_ACCOUNTS = [
    { email: 'producer@decapic.com', label: 'Producer', name: 'Elena Vance', desc: 'Full production oversight: budgets, schedule, crew, AI & SQL Lab' },
    { email: 'admin@decapic.com', label: 'Super Admin', name: 'System Admin', desc: 'Full root access to all data, settings, AI and database tools' },
    { email: 'finance@decapic.com', label: 'Finance Manager', name: 'Marcus Sterling', desc: 'Full budget & expense management, transfers and approvals' },
    { email: 'manager@decapic.com', label: 'Production Manager', name: 'Sara Khan', desc: 'Daily shoot schedules, crew assignments, equipment & logistics' },
    { email: 'director@decapic.com', label: 'Director', name: 'Christopher Nolan', desc: 'Scenes, script breakdown, cast and shot progress tracking' },
    { email: 'crew@decapic.com', label: 'Crew Member', name: 'Alex Rivera', desc: 'Restricted view: no Budget, AI Studio or SQL Lab access' },
    { email: 'reviewer@decapic.com', label: 'Authorised Reviewer', name: 'Priya Sharma', desc: 'Executive read-only access for compliance and approvals' }
  ];

  DP.switchAccount = async (email) => {
    if (!email || email.toLowerCase() === (DP.state.user?.email || '').toLowerCase()) return;
    try {
      const user = await DP.login(email, 'Decapic@2026');
      ui.toast(`Switched to ${user.role_label} (${user.name.split(' ')[0]})`, 'ok');
      buildShell();
      DP.render();
    } catch (e) {
      ui.toast('Cannot switch account: ' + e.message, 'err');
    }
  };

  DP.showRolesGuide = () => {
    const curEmail = (DP.state.user?.email || '').toLowerCase();
    const rows = DEMO_ACCOUNTS.map((acc) => {
      const isCur = acc.email.toLowerCase() === curEmail;
      return h('div', {
        class: 'list-row' + (isCur ? ' sel' : ''),
        style: {
          padding: '12px 14px',
          borderRadius: '12px',
          background: isCur ? 'var(--teal-50, rgba(16,196,159,0.12))' : 'var(--card-2)',
          border: isCur ? '1px solid var(--teal)' : '1px solid transparent',
          marginBottom: '8px',
          alignItems: 'center'
        }
      },
        ui.avatar(acc.name, 'sm'),
        h('div', { class: 'grow' },
          h('div', { class: 'row gap-s', style: { alignItems: 'center' } },
            h('b', null, acc.label),
            ui.tag(acc.email.split('@')[0], 'tan'),
            isCur ? ui.tag('Current', 'teal') : null
          ),
          h('div', { class: 'tiny muted', style: { marginTop: '3px' } }, acc.desc)
        ),
        !isCur ? ui.btn('Switch', {
          cls: 'sm primary',
          icon: 'log-in',
          onClick: (close) => {
            close && close();
            DP.switchAccount(acc.email);
          }
        }) : h('span', { class: 'tag ok' }, 'Active')
      );
    });

    ui.modal({
      title: 'Demo Account Switcher',
      sub: 'Switch between any of the 7 demo roles to experience role-based access control live.',
      body: h('div', { style: { maxHeight: '60vh', overflowY: 'auto' } }, rows),
      actions: [{ label: 'Close' }]
    });
  };

  function buildAccountSwitcher() {
    const curEmail = (DP.state.user?.email || '').toLowerCase();
    const sel = h('select', {
      class: 'select',
      style: {
        border: 'none',
        background: 'transparent',
        padding: '3px 24px 3px 6px',
        fontSize: '13px',
        fontWeight: '600',
        color: 'var(--text)',
        cursor: 'pointer',
        outline: 'none',
        width: 'auto'
      },
      title: 'Switch demo accounts',
      onchange: (e) => DP.switchAccount(e.target.value)
    },
      DEMO_ACCOUNTS.map((a) => h('option', {
        value: a.email,
        selected: a.email.toLowerCase() === curEmail ? true : null
      }, `${a.label} (${a.email.split('@')[0]})`))
    );

    const infoBtn = h('button', {
      class: 'icon-btn',
      style: { width: '30px', height: '30px', borderRadius: '8px', border: 'none', background: 'transparent' },
      title: 'View all demo roles & permissions',
      onclick: () => DP.showRolesGuide()
    }, icon('shield'));

    return h('div', {
      class: 'account-switcher',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 6px 3px 10px',
        borderRadius: '13px',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        boxShadow: '0 1px 4px rgba(0,0,0,.04)',
        flexShrink: 0
      }
    },
      ui.avatar(DP.state.user?.name || 'User', 'sm'),
      h('div', { style: { display: 'flex', flexDirection: 'column', lineHeight: 1 } },
        h('span', { class: 'tiny muted', style: { fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 } }, 'Demo Role'),
        sel
      ),
      infoBtn
    );
  }

  function buildShell() {
    const r = DP.clear(root());
    const side = h('aside', { class: 'sidebar', id: 'sidebar' },
      h('div', { class: 'brand', onclick: () => DP.go('/dashboard') }, DP.logo(), h('span', { class: 'heart' }, icon('heart'))),
      h('nav', { class: 'nav' }, NAV.map((n) => (n.sect ? h('div', { class: 'sect' }, n.sect) : (!n.perm || DP.can(n.perm)) ? h('a', { id: 'nav-' + n.id, onclick: () => { DP.go(n.path); side.classList.remove('open'); } }, icon(n.icon), n.label) : null))),
      h('div', { class: 'sidebar-foot' },
        h('div', {
          class: 'usercard',
          style: { cursor: 'pointer' },
          title: 'Click to switch demo role',
          onclick: () => DP.showRolesGuide()
        },
          ui.avatar(DP.state.user.name, 'sm'),
          h('div', { class: 'grow' },
            h('div', { class: 'nm' }, DP.state.user.name),
            h('div', { class: 'rl' }, DP.state.user.role_label)
          ),
          h('span', { class: 'tag tiny', style: { fontSize: '10px', padding: '2px 6px' } }, 'Switch')
        ),
        h('div', { class: 'row' },
          h('button', { class: 'icon-btn', id: 'theme-btn', title: 'Toggle dark mode', onclick: () => { DP.setTheme(DP.state.theme === 'dark' ? 'light' : 'dark'); const b = document.getElementById('theme-btn'); DP.clear(b).append(icon(DP.state.theme === 'dark' ? 'sun' : 'moon')); } }, icon(DP.state.theme === 'dark' ? 'sun' : 'moon')),
          h('button', { class: 'btn grow', onclick: () => DP.logout() }, icon('log-out'), 'Sign out'))));
    const top = h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn menu-btn', onclick: () => side.classList.toggle('open'), 'aria-label': 'Menu' }, icon('menu')),
      h('div', { class: 'title', id: 'crumb' }, 'DecaPic'),
      h('div', { class: 'searchbtn', id: 'searchbtn', onclick: () => DP.openPalette() }, icon('search'), 'Search projects, people, scenes…', h('kbd', null, 'Ctrl K')),
      buildAccountSwitcher());
    r.append(h('div', { class: 'app' }, side, h('div', { class: 'main' }, top, h('main', { class: 'view', id: 'view' }))));
  }

  /** Called by every page: makes sure the shell exists, highlights the nav item, clears the view. */
  DP.page = (ctx, o) => {
    if (!document.getElementById('view') || !document.getElementById('sidebar')) buildShell();
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.id === 'nav-' + o.nav));
    const c = document.getElementById('crumb'); if (c) { DP.clear(c).append('DecaPic', icon('chevron-right'), h('b', null, o.title)); }
    document.title = o.title + ' · DecaPic'; window.scrollTo({ top: 0 });
    const v = DP.clear(document.getElementById('view')); v.classList.remove('enter'); return v;
  };

  // ---------------------------------------------------------------- command palette (Ctrl+K)
  DP.openPalette = () => {
    const { o, close } = ui.overlay(); let sel = 0, items = [];
    const box = h('div', { class: 'cmdk' }); const res = h('div', { class: 'res' });
    const quick = NAV.filter((n) => n.path && (!n.perm || DP.can(n.perm))).map((n) => ({ type: 'page', label: 'Go to ' + n.label, sub: '', path: n.path, ic: n.icon }));
    const ICON = { project: 'clapperboard', person: 'user', vendor: 'building-2', scene: 'video', page: 'arrow-right' };
    const go = (it) => { close(); DP.go(it.path || (it.type === 'project' ? '/projects/' + it.id : it.type === 'person' ? '/people/' + it.id : it.type === 'scene' ? '/scene/' + it.id : '/resources')); };
    const draw = () => {
      DP.clear(res); if (!items.length) res.append(h('div', { class: 'empty' }, 'No matches')); items.forEach((it, i) => res.append(h('div', { class: 'it' + (i === sel ? ' sel' : ''), onclick: () => go(it), onmousemove: () => { sel = i;[...res.children].forEach((c, k) => c.classList.toggle('sel', k === i)); } },
        h('div', { class: 'avatar sm' }, icon(it.ic || ICON[it.type] || 'search')), h('div', null, h('div', { class: 'bold' }, it.label), it.sub ? h('div', { class: 'tiny muted' }, it.sub) : null), h('span', { class: 'k' }, it.type))));
    };
    const input = h('input', { placeholder: 'Search projects, films, people, vendors, scenes…', autofocus: true });
    const run = DP.debounce(async () => { const q = input.value.trim(); if (q.length < 2) { items = quick; sel = 0; draw(); return; } try { items = (await DP.api('/search' + DP.qs({ q }))).results; } catch (e) { items = []; } sel = 0; draw(); }, 220);
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && items[sel]) go(items[sel]); });
    box.append(input, res); o.append(box); items = quick; draw(); setTimeout(() => input.focus(), 50);
  };
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && DP.state.user) { e.preventDefault(); DP.openPalette(); } });

  // ---------------------------------------------------------------- login
  DP.pages.login = async (ctx) => {
    if (DP.state.user) { DP.go('/dashboard'); return; }
    const r = DP.clear(root()); document.title = 'Sign in · DecaPic';
    const email = h('input', { class: 'input', type: 'email', placeholder: 'you@decapic.com', autocomplete: 'username' });
    const pass = h('input', { class: 'input', type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
    const err = h('div'); const btn = h('button', { class: 'btn primary', style: { padding: '13px' }, type: 'submit' }, 'Sign in', icon('arrow-right'));
    const demoBox = h('div', { class: 'demo-grid' });
    const submit = async (e) => {
      e && e.preventDefault(); DP.clear(err); btn.disabled = true; btn.firstChild.textContent = 'Signing in…';
      try { await DP.login(email.value, pass.value); ui.toast('Welcome back, ' + DP.state.user.name.split(' ')[0] + '!'); DP.go('/dashboard'); }
      catch (ex) { err.append(ui.callout(ex.message, 'bad')); btn.disabled = false; btn.firstChild.textContent = 'Sign in'; }
    };
    const form = h('form', { class: 'form', onsubmit: submit }, ui.field('Email', email), ui.field('Password', pass), err, btn);
    r.append(h('div', { class: 'login' },
      h('div', { class: 'hero-pane' }, h('div', { class: 'blob b1' }), h('div', { class: 'blob b2' }), h('div', { class: 'blob b3' }),
        DP.logo('on-teal wordmark', true),
        h('p', { class: 'tagline' }, 'Every script, schedule, rupee and shot of a film production — in one frame.'), h('div', { class: 'heart-fab' }, icon('heart'))),
      h('div', { class: 'form-pane' }, h('div', { class: 'box' }, h('h2', null, 'Welcome back'), h('p', { class: 'muted' }, 'Sign in to the production control room.'), form,
        h('div', { class: 'mt2' }, h('div', { class: 'small muted bold' }, 'Demo accounts · password ', h('span', { class: 'tag teal mono' }, 'Decapic@2026')), demoBox)))));
    try {
      const demos = await DP.api('/auth/demo-accounts');
      demos.forEach((d) => demoBox.append(h('button', { class: 'demo', type: 'button', onclick: () => { email.value = d.email; pass.value = 'Decapic@2026'; submit(); } }, ui.avatar(d.role_label, 'sm'), h('div', null, h('b', null, d.role_label), h('span', null, d.email)))));
    } catch (e) { demoBox.append(ui.callout('Could not load demo accounts: ' + e.message, 'warn')); }
  };
  DP.route('/login', DP.pages.login, { public: true });
})();
