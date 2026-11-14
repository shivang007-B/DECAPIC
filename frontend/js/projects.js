/* Projects list + project detail (tabs) */
(function () {
  'use strict';
  const h = DP.h, icon = DP.icon, ui = DP.ui, F = DP.fmt, card = DP.card;
  const STATUSES = ['In Production', 'Pre-production', 'Post-production', 'Development', 'Completed'];

  // ================================================================= list
  DP.pages.projects = async (ctx) => {
    const view = DP.page(ctx, { title: 'Projects', nav: 'projects' }); const meta = await DP.loadMeta();
    const st = { q: '', status: ctx.query.status || '', type: '', sort: 'newest', page: 1 };
    const grid = h('div', { class: 'grid g-auto' }); const pager = h('div'); const count = h('span', { class: 'muted' });
    const load = async () => {
      DP.clear(grid).append(...Array.from({ length: 6 }, () => h('div', { class: 'card' }, ui.skeleton(5, true))));
      try {
        const r = await DP.api('/projects' + DP.qs({ ...st, size: 12 })); if (!ctx.alive()) return;
        count.textContent = F.num(r.total) + ' projects'; DP.clear(grid);
        if (!r.items.length) grid.append(ui.empty('No projects match your filters', 'clapperboard'));
        r.items.forEach((p, i) => { const c = DP.projectCard(p); c.style.animation = `fadeUp .55s var(--ease) ${i * 45}ms both`; grid.append(c); });
        DP.clear(pager).append(ui.pager(st.page, r.total, 12, (p) => { st.page = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
      } catch (e) { DP.clear(grid).append(ui.callout(e.message, 'bad')); }
    };
    const chips = h('div', { class: 'chips' }, ['All', ...STATUSES].map((s) => h('button', { class: 'chip' + ((s === 'All' && !st.status) || s === st.status ? ' active' : ''), onclick: (e) => { st.status = s === 'All' ? '' : s; st.page = 1; [...chips.children].forEach((c) => c.classList.toggle('active', c === e.currentTarget)); load(); } }, s)));
    view.append(DP.pageHead('Projects', 'Every production in the database. Pick one to open its scenes, schedule, crew, budget and AI forecasts.', count),
      h('div', { class: 'toolbar' }, DP.searchBox('Search title, code or name…', (v) => { st.q = v; st.page = 1; load(); }), chips,
        ui.select([{ value: '', label: 'All types' }, ...meta.project_types.map((t) => ({ value: t, label: t }))], '', (v) => { st.type = v; st.page = 1; load(); }),
        ui.select([{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'budget', label: 'Biggest budget' }, { value: 'spent', label: 'Most spent' }, { value: 'overrun', label: 'Highest budget use' }, { value: 'name', label: 'Name A–Z' }], 'newest', (v) => { st.sort = v; st.page = 1; load(); })),
      grid, pager);
    DP.reveal(view); load();
  };
  DP.route('/projects', DP.pages.projects);

  // ================================================================= detail
  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' }, { id: 'scenes', label: 'Scenes', icon: 'video' }, { id: 'schedule', label: 'Schedule', icon: 'calendar' },
    { id: 'people', label: 'Cast & Crew', icon: 'users' }, { id: 'budget', label: 'Budget', icon: 'wallet', perm: 'finance_view' }, { id: 'equipment', label: 'Equipment', icon: 'camera' },
    { id: 'issues', label: 'Issues', icon: 'triangle-alert' }, { id: 'post', label: 'Post & Release', icon: 'rocket' }, { id: 'ai', label: 'AI Health', icon: 'sparkles', perm: 'ai' },
  ];

  DP.pages.project = async (ctx) => {
    const view = DP.page(ctx, { title: 'Project', nav: 'projects' }); await DP.loadMeta();
    view.append(h('div', { class: 'card' }, ui.skeleton(6, true)));
    let p; try { p = await DP.api('/projects/' + ctx.params.id); } catch (e) { DP.clear(view).append(ui.callout(e.message, 'bad')); return; }
    if (!ctx.alive()) return; document.title = p.film_title + ' · DecaPic'; const c = document.getElementById('crumb'); if (c) DP.clear(c).append('DecaPic', icon('chevron-right'), 'Projects', icon('chevron-right'), h('b', null, p.project_code));
    const hh = F.hash(p.film_title), a = (hh % 60) + 150, b = ((hh >> 3) % 50) + 10;
    DP.clear(view).append(
      h('a', { class: 'back', onclick: () => DP.go('/projects') }, icon('arrow-left'), 'All projects'),
      h('div', { class: 'hero', style: { background: `linear-gradient(135deg, hsl(${a} 60% 34%), hsl(${b} 68% 46%))` } },
        h('div', { class: 'row wrap gap-s' }, ui.status(p.production_status), ui.tag(p.project_type), ui.tag(p.priority + ' priority'), p.genres.map((g) => ui.tag(g.name))),
        h('h1', null, p.film_title), h('div', { class: 'sub' }, h('span', null, p.project_code), p.release_year ? h('span', null, p.release_year) : null, p.runtime_minutes ? h('span', null, p.runtime_minutes + ' min') : null, p.country_name ? h('span', null, p.country_name) : null, p.language_name ? h('span', null, p.language_name) : null, p.imdb_rating ? h('span', null, icon('star'), ' ', Number(p.imdb_rating).toFixed(1)) : null)));
    const body = h('div'); const tabs = TABS.filter((t) => !t.perm || DP.can(t.perm));
    const renderers = { overview: tabOverview, scenes: tabScenes, schedule: tabSchedule, people: tabPeople, budget: tabBudget, equipment: tabEquipment, issues: tabIssues, post: tabPost, ai: tabAI };
    const open = async (id) => {
      DP.destroyCharts(); history.replaceState(null, '', '#/projects/' + p.project_id + '?tab=' + id); DP.clear(body).append(h('div', { class: 'card' }, ui.skeleton(5, true)));
      const holder = h('div', { class: 'pagefade' });
      try { await renderers[id](holder, p, ctx); } catch (e) { holder.append(ui.callout(e.message, 'bad')); }
      if (ctx.alive()) { DP.clear(body).append(holder); }
    };
    const start = tabs.find((t) => t.id === ctx.query.tab) ? ctx.query.tab : 'overview';
    view.append(ui.tabs(tabs, open, start), body); DP.reveal(view); open(start);
    if (ctx.query.scene) DP.openScene(ctx.query.scene);
  };
  DP.route('/projects/:id', DP.pages.project);
  DP.route('/scene/:id', async (ctx) => { const s = await DP.api('/scenes/' + ctx.params.id); DP.go('/projects/' + s.project_id + '?tab=scenes&scene=' + ctx.params.id); });

  // ----------------------------------------------------------------- overview
  async function tabOverview(el, p) {
    const stage = { Development: 0, 'Pre-production': 1, 'In Production': 2, 'Post-production': 3, Completed: 4 }[p.production_status] ?? 0;
    const steps = [['Pre-production', p.preproduction_start, 'clipboard'], ['Principal photography', p.production_start, 'camera'], ['Wrap', p.production_end, 'flag'], ['Post-production', p.postproduction_start, 'scissors'], ['Delivered', p.actual_completion_date || p.planned_completion_date, 'rocket']];
    const doneUpTo = [1, 2, 3, 4, 5][Math.min(stage, 4)] - (stage === 4 ? 0 : 1);
    const tl = h('div', { class: 'timeline' }, steps.map((s, i) => h('div', { class: 'st' + (i < stage + (stage === 4 ? 1 : 0) ? ' done' : '') + (i === stage && stage < 4 ? ' now' : '') }, h('div', { class: 'dot' }, i < stage + (stage === 4 ? 1 : 0) ? icon('check') : String(i + 1)), h('div', { class: 'lb' }, s[0]), h('div', { class: 'dt' }, F.date(s[1])))));
    const c = p.counts;
    el.append(card('Production timeline', 'calendar', h('div', { style: { marginTop: '14px' } }, tl), h('div', { class: 'row wrap small muted', style: { marginTop: '16px', gap: '22px' } }, h('span', null, 'Planned completion: ', h('b', null, F.date(p.planned_completion_date))), p.actual_completion_date ? h('span', null, 'Actual: ', h('b', null, F.date(p.actual_completion_date))) : null)));
    el.append(h('div', { class: 'grid g6 mt' }, [['video', 'Scenes', c.scenes], ['calendar', 'Shoot days', c.days_done + ' / ' + c.shoot_days], ['users', 'Cast', c.cast], ['id-card', 'Key crew', c.key_crew], ['handshake', 'Contracts', c.contracts], ['rocket', 'Releases', c.releases]].map((x) => h('div', { class: 'card kpi' }, h('div', { class: 'ic' }, icon(x[0])), h('div', { class: 'v', style: { fontSize: '26px' } }, x[2]), h('div', { class: 'l' }, x[1])))));
    const row = h('div', { class: 'grid g-21 mt' }); el.append(row);
    row.append(card('About the film', 'film', h('p', { class: 'muted', style: { margin: '6px 0 16px', lineHeight: 1.65 } }, p.synopsis || 'No synopsis.'),
      h('dl', { class: 'kv' }, h('dt', null, 'Original title'), h('dd', null, p.original_title || p.film_title), h('dt', null, 'Certificate'), h('dd', null, p.certificate || '-'), h('dt', null, 'Project'), h('dd', null, p.project_name), h('dt', null, 'Description'), h('dd', null, p.project_description || '-'), h('dt', null, 'Script'), h('dd', null, p.script ? `${p.script.title} · ${p.script.page_count} pages · ${p.script.status}` : '-'))));
    const side = h('div', { class: 'grid', style: { gap: '18px', alignContent: 'start' } }); row.append(side);
    side.append(card('Production companies', 'building-2', p.houses.map((x) => h('div', { class: 'list-row' }, h('div', { class: 'avatar sm' }, F.initials(x.name)), h('div', { class: 'grow' }, h('div', { class: 'bold small' }, x.name), h('div', { class: 'tiny muted' }, x.company_role)), ui.tag(F.pct(x.ownership_percentage, 0), 'tan')))));
    if (p.budget) { const b = p.budget; side.append(card('Budget at a glance', 'wallet', h('div', { class: 'row', style: { marginTop: '14px', gap: '20px' } }, ui.ring(Math.min(b.pct_of_approved_spent / 100, 1), 'used', { color: b.pct_of_approved_spent > 100 ? 'var(--bad)' : 'var(--teal)', center: F.pct(b.pct_of_approved_spent, 0), size: 118 }), h('div', null, h('div', { class: 'tiny muted' }, 'Approved'), h('div', { class: 'bold', style: { fontSize: '20px' } }, F.money(b.approved_amount)), h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, 'Spent'), h('div', { class: 'bold', style: { fontSize: '20px' } }, F.money(b.spent_amount)))), h('div', { style: { marginTop: '12px' } }, ui.status(b.budget_status)))); }
    if (p.post) { const q = p.post; el.append(card('Post-production progress', 'scissors', h('div', { class: 'row wrap', style: { justifyContent: 'space-around', marginTop: '16px', gap: '16px' } }, [['Editing', q.editing_progress], ['VFX', q.vfx_progress], ['Audio', q.audio_progress], ['Colour', q.color_progress], ['Subtitles', q.subtitle_progress]].map((x) => ui.ring(x[1] / 100, x[0], { size: 100, stroke: 10, center: Math.round(x[1]) + '%', color: 'var(--tan)' }))), h('div', { class: 'tiny muted', style: { marginTop: '12px', textAlign: 'center' } }, 'Stage: ', h('b', null, q.current_stage), ' · overall (generated column): ', h('b', null, F.pct(q.overall_progress, 0))))); el.lastChild.classList.add('mt'); }
  }

  // ----------------------------------------------------------------- scenes
  async function tabScenes(el, p) {
    const st = { q: '', status: '', page: 1 }; const slot = h('div'); const pager = h('div');
    const load = async () => {
      const r = await DP.api('/projects/' + p.project_id + '/scenes' + DP.qs({ ...st, size: 15 }));
      DP.clear(slot).append(ui.table({ cols: [{ label: '#', key: 'scene_number' }, { label: 'Scene', render: (s) => h('div', null, h('div', { class: 'bold' }, s.heading), h('div', { class: 'tiny muted' }, s.location || '')) }, { label: 'Setting', render: (s) => s.interior_exterior + ' · ' + s.time_of_day },
        { label: 'Needs', render: (s) => [s.vfx_required ? ui.tag('VFX', 'violet') : null, s.stunt_required ? ui.tag('Stunts', 'bad') : null, s.night_shoot ? ui.tag('Night', 'info') : null] }, { label: 'Cx', render: (s) => s.complexity_score, right: true },
        { label: 'Est / Actual', render: (s) => F.hours(s.estimated_duration) + ' / ' + (s.actual_duration_hours != null ? F.hours(s.actual_duration_hours) : '-'), right: true }, { label: 'Status', render: (s) => ui.status(s.status) }], rows: r.items, onRow: (s) => DP.openScene(s.scene_id), empty: 'No scenes match' }));
      DP.clear(pager).append(ui.pager(st.page, r.total, 15, (n) => { st.page = n; load(); }));
    };
    el.append(h('div', { class: 'toolbar' }, DP.searchBox('Search scenes by heading or location type…', (v) => { st.q = v; st.page = 1; load(); }), ui.select([{ value: '', label: 'All statuses' }, 'Planned', 'Scheduled', 'Completed'].map((x) => (typeof x === 'string' ? { value: x, label: x } : x)), '', (v) => { st.status = v; st.page = 1; load(); }), h('span', { class: 'muted small right-a' }, 'Click a scene to see characters, equipment and the AI check')), card(null, null, slot), pager);
    await load();
  }

  // ----------------------------------------------------------------- schedule
  async function tabSchedule(el, p) {
    const reload = () => DP.pages._reopen && DP.pages._reopen('schedule');
    const days = await DP.api('/projects/' + p.project_id + '/schedule'); const C = DP.colors();
    if (!days.length) { el.append(ui.empty('No shoot days scheduled yet', 'calendar')); return; }
    const done = days.filter((d) => d.status === 'Completed').length, late = days.filter((d) => (d.day_delay_minutes || 0) > 0).length;
    el.append(h('div', { class: 'grid g4' }, [['calendar', 'Shoot days', days.length], ['circle-check', 'Completed', done], ['clock', 'Days with delay', late], ['users', 'Avg crew present', Math.round(days.reduce((s, d) => s + d.crew_present, 0) / days.length)]].map((x) => DP.kpi({ icon: x[0], label: x[1], value: x[2] }))));
    const strip = h('div', { class: 'daystrip' }, days.map((d, i) => h('div', { class: 'day ' + d.status + ((d.day_delay_minutes || 0) > 0 ? ' late' : ''), style: { '--i': Math.min(i, 80) }, title: `Day ${d.day_number} · ${F.date(d.shoot_date)} · ${d.status}`, onclick: () => DP.openShootDay(d.shoot_day_id, () => DP.render()) }, d.day_number)));
    el.append(h('div', { class: 'mt' }, card('Shooting calendar', 'calendar', h('div', { class: 'legend', style: { margin: '6px 0 14px' } }, h('span', null, h('i', { style: { background: 'color-mix(in srgb, var(--teal) 40%, transparent)' } }), 'Completed'), h('span', null, h('i', { style: { background: 'var(--card-2)', border: '1px solid var(--line)' } }), 'Scheduled'), h('span', null, h('i', { style: { background: 'var(--coral)' } }), 'Ran late'), h('span', { class: 'right-a' }, 'Click a day to open it')), strip)));
    const cc = card('Delay minutes per shoot day', 'clock'); cc.classList.add('mt'); el.append(cc);
    DP.chart(cc, { type: 'bar', data: { labels: days.map((d) => 'D' + d.day_number), datasets: [{ label: 'Day delay (min)', data: days.map((d) => d.day_delay_minutes || 0), backgroundColor: days.map((d) => ((d.day_delay_minutes || 0) > 60 ? C.coral : C.tan)), borderRadius: 6 }, { label: 'Logged delays (min)', data: days.map((d) => d.delay_minutes_logged), type: 'line', borderColor: C.teal, tension: 0.35, pointRadius: 0, borderWidth: 2 }] }, options: { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 24 } } } } });
  }

  // ----------------------------------------------------------------- people
  async function tabPeople(el, p) {
    const d = await DP.api('/projects/' + p.project_id + '/people'); const fin = DP.can('finance_view'); const C = DP.colors();
    el.append(h('h2', { class: 'sec' }, icon('star'), 'Cast', h('span', { class: 'sub' }, d.cast.length + ' people')));
    el.append(d.cast.length ? h('div', { class: 'grid g-auto-s' }, d.cast.map((c, i) => h('div', { class: 'card hover', style: { cursor: 'pointer', animation: `fadeUp .5s var(--ease) ${i * 35}ms both` }, onclick: () => DP.openPerson(c.person_id) }, h('div', { class: 'row' }, ui.avatar(c.name), h('div', { class: 'grow' }, h('div', { class: 'bold' }, c.name), h('div', { class: 'small muted' }, 'as ' + c.character_name))), h('div', { class: 'row wrap gap-s', style: { marginTop: '12px' } }, ui.tag(c.assignment_type, 'violet'), ui.status(c.status), ui.tag(c.scenes + ' scenes', 'tan')), fin ? h('div', { class: 'small muted', style: { marginTop: '10px' } }, 'Salary ', h('b', null, F.money(c.salary))) : null))) : ui.empty('No cast assigned yet'));
    el.append(h('h2', { class: 'sec mt2' }, icon('id-card'), 'Key crew', h('span', { class: 'sub' }, d.crew.length + ' department heads and key roles')));
    const groups = {}; d.crew.forEach((x) => (groups[x.department_name] = groups[x.department_name] || []).push(x));
    el.append(Object.keys(groups).length ? h('div', { class: 'grid g-auto-s' }, Object.entries(groups).map(([dep, list]) => card(dep, null, list.map((x) => h('div', { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => DP.openPerson(x.person_id) }, ui.avatar(x.name, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'bold small' }, x.name), h('div', { class: 'tiny muted' }, x.role_name + ' · ' + x.employment_type)), ui.status(x.status)))))) : ui.empty('No key crew'));
    if (d.utilisation.length) { const cc = card('Most booked crew (hours worked)', 'chart-column'); cc.classList.add('mt2'); el.append(cc); DP.chart(cc, { type: 'bar', data: { labels: d.utilisation.map((u) => u.name), datasets: [{ label: 'Hours', data: d.utilisation.map((u) => u.hours), backgroundColor: C.teal, borderRadius: 7 }, { label: 'Overtime', data: d.utilisation.map((u) => u.overtime), backgroundColor: C.coral, borderRadius: 7 }] }, options: { scales: { x: { grid: { display: false }, ticks: { maxRotation: 50, minRotation: 40 } } } } }); }
  }

  // ----------------------------------------------------------------- budget (finance)
  async function tabBudget(el, p) {
    const reload = async () => { DP.clear(el); await tabBudget(el, p); };
    const d = await DP.api('/projects/' + p.project_id + '/budget'); const s = d.summary, C = DP.colors(); const canW = DP.can('finance_write');
    if (!s) { el.append(ui.empty('This project has no budget yet', 'wallet')); return; }
    const used = s.pct_of_approved_spent;
    el.append(h('div', { class: 'grid g-12' }, card('Budget health', 'wallet', h('div', { style: { display: 'grid', placeItems: 'center', margin: '14px 0' } }, ui.ring(Math.min(used / 100, 1), 'of approved', { size: 170, stroke: 16, center: F.pct(used, 0), color: used > 100 ? 'var(--bad)' : used > 85 ? 'var(--warn)' : 'var(--teal)' })),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, ui.status(s.budget_status), s.is_over_budget ? ui.tag('over budget', 'bad') : null),
        canW ? h('div', { class: 'row wrap', style: { marginTop: '16px', justifyContent: 'center' } }, ['Draft', 'Approved', 'Closed'].filter((x) => x !== s.budget_status).map((x) => ui.btn('Set ' + x, { cls: 'sm', onClick: async () => { try { await DP.api('/budgets/' + s.budget_id + '/status', { body: { status: x } }); ui.toast('Budget is now ' + x + '. A trigger wrote the audit trail.'); reload(); } catch (e) { ui.toast(e.message, 'err'); } } }))) : null),
      h('div', { class: 'grid', style: { gap: '18px' } }, h('div', { class: 'grid g4' }, [['Approved', s.approved_amount, 'wallet'], ['Allocated', s.allocated_amount, 'layers'], ['Spent', s.spent_amount, 'banknote'], ['Remaining', s.remaining_amount, 'piggy']].map((x) => DP.kpi({ icon: x[2] === 'piggy' ? 'wallet' : x[2], label: x[0], value: x[1], fmt: (v) => F.money(v), warn: x[0] === 'Remaining' && x[1] < 0 }))),
        (() => { const cc = card('Spending over time', 'trending-up'); DP.chart(cc, { type: 'line', data: { labels: d.monthly.map((m) => m.ym), datasets: [{ data: d.monthly.map((m) => m.total), borderColor: C.teal, backgroundColor: 'rgba(16,196,159,.15)', fill: true, tension: 0.35, borderWidth: 3, pointRadius: 2 }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => F.money(c.raw) } } }, scales: { y: { ticks: { callback: (v) => F.money(v) } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } } } } }); return cc; })())));
    const catCard = card('Budget by cost category', 'layers', canW ? h('div', { class: 'row', style: { margin: '4px 0 12px' } }, ui.btn('Add expense', { cls: 'primary sm', icon: 'plus', onClick: () => addExpense() }), ui.btn('Move budget', { cls: 'sm', icon: 'shuffle', onClick: () => transfer() }), h('span', { class: 'tiny muted' }, 'Both call stored procedures; triggers keep everything in sync.')) : null);
    d.categories.forEach((c) => catCard.append(h('div', { style: { margin: '14px 0' } }, h('div', { class: 'row small', style: { marginBottom: '6px' } }, h('b', null, c.category), ui.tag(c.budget_state, c.budget_state === 'OK' ? 'ok' : c.budget_state === 'WARNING' ? 'warn' : 'bad'), h('span', { class: 'right-a muted num' }, F.money(c.spent_amount) + ' / ' + F.money(c.allocated_amount))), ui.bar(c.pct_used, 100, c.pct_used > 100 ? 'bad' : c.pct_used > 85 ? 'warn' : ''))));
    catCard.classList.add('mt'); el.append(catCard);
    el.append(h('div', { class: 'mt' }, card('Latest expenses', 'receipt', ui.table({ cols: [{ label: 'Date', render: (r) => F.date(r.expense_date) }, { label: 'Category', key: 'expense_category' }, { label: 'Description', key: 'description' }, { label: 'Vendor', key: 'vendor_name' }, { label: 'Status', render: (r) => ui.status(r.payment_status) }, { label: 'Amount', render: (r) => F.money(r.amount, true), right: true, mono: true }], rows: d.expenses.slice(0, 25) }))));
    el.append(h('div', { class: 'mt' }, card('Contracts & payments', 'handshake', ui.table({ cols: [{ label: 'Party', key: 'party' }, { label: 'Type', key: 'contract_type' }, { label: 'Status', render: (r) => ui.status(r.status) }, { label: 'Value', render: (r) => F.money(r.contract_value), right: true }, { label: 'Paid', render: (r) => h('div', { style: { minWidth: '120px' } }, h('div', { class: 'tiny muted' }, F.money(r.paid) + ' (' + F.pct((r.paid / (r.contract_value || 1)) * 100, 0) + ')'), ui.bar(r.paid, r.contract_value || 1, 'tan')) }], rows: d.contracts }))));
    const meta = DP.state.meta;
    function addExpense() {
      const f = { bd: d.categories[0].budget_department_id, cat: meta.expense_categories.includes('Catering') ? 'Catering' : meta.expense_categories[0], desc: '', amt: 5000 };
      const amt = h('input', { class: 'input', type: 'number', min: '1', step: '100', value: f.amt, oninput: (e) => (f.amt = Number(e.target.value)) });
      ui.modal({ title: 'Add expense', sub: 'Calls the stored procedure sp_add_expense', body: h('div', { class: 'grid', style: { gap: '14px' } }, ui.field('Budget category', ui.select(d.categories.map((c) => ({ value: c.budget_department_id, label: c.category + ' · remaining ' + F.money(c.remaining_amount) })), f.bd, (v) => (f.bd = Number(v)))),
        ui.field('Expense type', ui.select(meta.expense_categories, f.cat, (v) => (f.cat = v))), ui.field('Description', h('input', { class: 'input', maxlength: 50, placeholder: 'e.g. Crew lunch, day 14', oninput: (e) => (f.desc = e.target.value) })), ui.field('Amount ($)', amt)),
        actions: [{ label: 'Cancel' }, { label: 'Book expense', cls: 'primary', onClick: async () => { try { const r = await DP.api('/projects/' + p.project_id + '/expenses', { body: { budget_department_id: f.bd, expense_category: f.cat, description: f.desc || 'Expense', amount: f.amt } }); ui.toast(`Booked. Trigger updated spent: ${F.money(r.spent_before, true)} → ${F.money(r.spent_after, true)}`); reload(); } catch (e) { ui.toast(e.message, 'err'); return false; } } }] });
    }
    function transfer() {
      if (d.categories.length < 2) return ui.toast('Need two categories', 'warn'); const f = { from: d.categories[0].budget_department_id, to: d.categories[1].budget_department_id, amt: 10000 };
      ui.modal({ title: 'Move budget between categories', sub: 'Calls sp_transfer_budget: one all-or-nothing transaction', body: h('div', { class: 'grid', style: { gap: '14px' } }, ui.field('From', ui.select(d.categories.map((c) => ({ value: c.budget_department_id, label: c.category + ' · free ' + F.money(c.remaining_amount) })), f.from, (v) => (f.from = Number(v)))),
        ui.field('To', ui.select(d.categories.map((c) => ({ value: c.budget_department_id, label: c.category })), f.to, (v) => (f.to = Number(v)))), ui.field('Amount ($)', h('input', { class: 'input', type: 'number', min: '1', value: f.amt, oninput: (e) => (f.amt = Number(e.target.value)) }), 'Try more than the source has free: the whole transaction rolls back.')),
        actions: [{ label: 'Cancel' }, { label: 'Move money', cls: 'primary', onClick: async () => { try { await DP.api('/budget/transfer', { body: { from_id: f.from, to_id: f.to, amount: f.amt } }); ui.toast('Budget moved'); reload(); } catch (e) { ui.toast(e.message, 'err'); return false; } } }] });
    }
  }

  // ----------------------------------------------------------------- equipment
  async function tabEquipment(el, p) {
    const d = await DP.api('/projects/' + p.project_id + '/equipment'); const fin = DP.can('finance_view');
    el.append(card('Equipment rentals', 'camera', ui.table({ cols: [{ label: 'Equipment', render: (r) => h('div', null, h('div', { class: 'bold' }, r.equipment_name), h('div', { class: 'tiny muted' }, r.category)) }, { label: 'Period', render: (r) => F.date(r.start_date) + ' → ' + F.date(r.end_date) }, { label: 'Days', key: 'rental_days', right: true },
      ...(fin ? [{ label: 'Planned', render: (r) => F.money(r.planned_cost), right: true }, { label: 'Actual', render: (r) => F.money(r.actual_cost), right: true }] : []), { label: 'Used in', render: (r) => r.scenes_used_in + ' scenes', right: true }, { label: '', render: (r) => (r.late_return ? ui.tag('late return', 'bad') : '') }], rows: d.rentals, empty: 'No equipment rented' })));
    el.append(h('div', { class: 'mt' }, card('Location bookings & permits', 'map-pin', ui.table({ cols: [{ label: 'Location', key: 'location' }, { label: 'Type', key: 'location_type' }, { label: 'Dates', render: (r) => F.date(r.start_date) + ' → ' + F.date(r.end_date) }, ...(fin ? [{ label: 'Cost', render: (r) => F.money(r.booking_cost), right: true }] : []), { label: 'Permit', render: (r) => ui.status(r.permit_status) }, { label: 'Status', render: (r) => ui.status(r.status) }], rows: d.bookings, empty: 'No location bookings' }))));
  }

  // ----------------------------------------------------------------- issues
  async function tabIssues(el, p) {
    const d = await DP.api('/projects/' + p.project_id + '/issues'); const C = DP.colors();
    if (!d.summary.length && !d.events.length) { el.append(ui.empty('No delays or incidents recorded: a clean production', 'circle-check')); return; }
    const row = h('div', { class: 'grid g-12' }); el.append(row);
    const cc = card('Time lost by cause', 'clock'); row.append(cc); DP.chart(cc, { type: 'doughnut', data: { labels: d.summary.map((x) => x.delay_type), datasets: [{ data: d.summary.map((x) => x.total_hours), backgroundColor: DP.palette(), borderWidth: 3, borderColor: C.card }] }, options: { cutout: '60%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => c.label + ': ' + c.raw + ' h' } } } } });
    row.append(card('Delay summary (view v_delay_summary)', 'triangle-alert', ui.table({ cols: [{ label: 'Cause', key: 'delay_type' }, { label: 'Count', key: 'delay_count', right: true }, { label: 'Hours lost', render: (r) => Number(r.total_hours).toFixed(1), right: true }, ...(DP.can('finance_view') ? [{ label: 'Cost impact', render: (r) => F.money(r.total_cost_impact), right: true }] : [])], rows: d.summary })));
    el.append(h('div', { class: 'mt' }, card('Recent delays', 'clock', ui.table({ cols: [{ label: 'Date', render: (r) => F.date(r.shoot_date) }, { label: 'Type', key: 'delay_type' }, { label: 'Cause', key: 'cause' }, { label: 'Dept', key: 'department_name' }, { label: 'Lost', render: (r) => F.dur(r.delay_minutes), right: true }, { label: 'Severity', render: (r) => ui.status(r.severity) }], rows: d.delays.slice(0, 20) }))));
    el.append(h('div', { class: 'mt' }, card('Incident log', 'flag', ui.table({ cols: [{ label: 'Date', render: (r) => F.date(r.shoot_date) }, { label: 'Event', key: 'event_type' }, { label: 'What happened', key: 'description' }, { label: 'Dept', key: 'department_name' }, { label: 'Severity', render: (r) => ui.status(r.severity) }, { label: 'Resolved', render: (r) => (r.resolved ? ui.tag('yes', 'ok') : ui.tag('open', 'warn')) }], rows: d.events.slice(0, 20) }))));
  }

  // ----------------------------------------------------------------- post & release
  async function tabPost(el, p) {
    const d = await DP.api('/projects/' + p.project_id + '/post'); const fin = DP.can('finance_view');
    if (d.post) el.append(card('Post-production', 'scissors', h('div', { class: 'grid g-auto-s', style: { marginTop: '12px' } }, [['Editing', d.post.editing_progress], ['VFX', d.post.vfx_progress], ['Audio', d.post.audio_progress], ['Colour grading', d.post.color_progress], ['Subtitles', d.post.subtitle_progress]].map((x) => h('div', null, h('div', { class: 'row small', style: { marginBottom: '6px' } }, h('b', null, x[0]), h('span', { class: 'right-a muted' }, Math.round(x[1]) + '%')), ui.bar(x[1], 100, 'tan'))))), h('div', { class: 'row small muted', style: { marginTop: '14px' } }, 'Current stage: ', ui.tag(d.post.current_stage, 'violet'), ui.status(d.post.status), h('span', { class: 'right-a' }, 'Overall (generated column): ', h('b', null, F.pct(d.post.overall_progress, 0)))));
    el.append(h('div', { class: 'mt' }, card('Post-production tasks', 'list', ui.table({ cols: [{ label: 'Task', render: (r) => h('div', null, h('div', { class: 'bold' }, r.task_type), h('div', { class: 'tiny muted' }, r.task_category)) }, { label: 'Assignee', key: 'assignee' }, { label: 'Due', render: (r) => F.date(r.due_date) }, { label: 'Progress', render: (r) => h('div', { style: { minWidth: '110px' } }, ui.bar(r.progress, 100)) }, { label: 'Status', render: (r) => ui.status(r.status) }], rows: d.tasks, empty: 'No tasks' }))));
    el.append(h('div', { class: 'mt' }, card('Releases & distribution deals', 'rocket', ui.table({ cols: [{ label: 'Platform', key: 'platform' }, { label: 'Territory', key: 'territory' }, { label: 'Type', key: 'release_type' }, { label: 'Date', render: (r) => F.date(r.release_date) }, { label: 'Distributor', key: 'distributor' }, ...(fin ? [{ label: 'Deal', render: (r) => (r.deal_value ? F.money(r.deal_value) : '-'), right: true }] : []), { label: 'Status', render: (r) => ui.status(r.status) }], rows: d.releases, empty: 'No releases planned' }))));
  }

  // ----------------------------------------------------------------- AI health (implemented in ai.js)
  async function tabAI(el, p) {
    if (!DP.healthPanel) throw new Error('AI module not loaded');
    await DP.healthPanel(el, p.project_id, { compact: true });
  }
})();
