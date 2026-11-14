/* Dashboard */
(function () {
  'use strict';
  const { h, icon, ui, fmt: F, card } = { ...DP, card: DP.card, h: DP.h, icon: DP.icon, ui: DP.ui, fmt: DP.fmt };
  const STATUS_COLORS = { Completed: '#10c49f', 'In Production': '#4f9de8', 'Post-production': '#8b7cf0', 'Pre-production': '#e8b64a', Development: '#c5aa8d' };

  DP.pages.dashboard = async (ctx) => {
    const view = DP.page(ctx, { title: 'Dashboard', nav: 'dashboard' });
    const hr = new Date().getHours(); const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    view.append(DP.pageHead(h('span', null, greet, ', ', h('span', null, DP.state.user.name.split(' ')[0])), 'Everything below is read live from the cineops MySQL database.', ui.tag(DP.state.user.role_label, 'teal'),
      ui.btn('Refresh', { icon: 'refresh-cw', onClick: () => DP.render() })));
    DP.loading(view, 3);
    await DP.loadMeta().catch(() => {});
    let d; try { d = await DP.api('/dashboard'); } catch (e) { DP.clear(view).append(ui.callout(e.message, 'bad')); return; }
    if (!ctx.alive()) return;
    const k = d.kpis; const fin = d.can_see_finance; const C = DP.colors();
    const pal = () => (DP.colorPalette ? DP.colorPalette() : [C.teal, C.tan, C.coral, C.sky, C.violet, C.gold, C.mint, '#9aa9a3']);
    while (view.children.length > 1) view.removeChild(view.lastChild);

    view.append(h('div', { class: 'grid g6' },
      DP.kpi({ icon: 'clapperboard', label: 'Projects', value: k.projects, detail: k.active_projects + ' active now' }), DP.kpi({ icon: 'film', label: 'Films', value: k.films }),
      DP.kpi({ icon: 'video', label: 'Scenes', value: k.scenes }), DP.kpi({ icon: 'calendar', label: 'Shoot days', value: k.shoot_days }),
      DP.kpi({ icon: 'users', label: 'Cast & crew', value: k.people }), DP.kpi({ icon: 'camera', label: 'Equipment items', value: k.equipment })));
    if (fin) view.append(h('div', { class: 'grid g4 mt' },
      DP.kpi({ icon: 'wallet', label: 'Approved budgets', value: k.approved_budget, fmt: (v) => F.money(v), detail: 'across all projects' }), DP.kpi({ icon: 'banknote', label: 'Spent so far', value: k.spent, fmt: (v) => F.money(v), detail: F.pct((k.spent / k.approved_budget) * 100, 0) + ' of approved' }),
      DP.kpi({ icon: 'trending-up', label: 'Over-budget projects', value: k.over_budget_projects, warn: true, detail: 'spent more than approved' }), DP.kpi({ icon: 'clock', label: 'Hours lost to delays', value: k.delay_hours, warn: true, fmt: (v) => F.num(v), detail: F.num(k.delays) + ' delay records' })));

    // ---- charts row 1
    const r1 = h('div', { class: 'grid g3 mt2' }); view.append(r1);
    const cStatus = card('Projects by stage', 'layers'); r1.append(cStatus);
    DP.chart(cStatus, { type: 'doughnut', data: { labels: (d.status || []).map((x) => x.label), datasets: [{ data: (d.status || []).map((x) => x.n), backgroundColor: (d.status || []).map((x) => STATUS_COLORS[x.label] || '#9aa9a3'), borderWidth: 3, borderColor: C.card, hoverOffset: 10 }] }, options: { cutout: '68%', plugins: { legend: { position: 'bottom' } } } });
    if (fin) {
      const cBud = card('Biggest budgets: approved vs spent', 'chart-column'); cBud.style.gridColumn = 'span 2'; r1.append(cBud);
      DP.chart(cBud, { type: 'bar', data: { labels: (d.budget_top || []).map((x) => x.project_code.replace('CO-', '')), datasets: [{ label: 'Approved', data: (d.budget_top || []).map((x) => x.approved), backgroundColor: C.tan, borderRadius: 8 }, { label: 'Spent', data: (d.budget_top || []).map((x) => x.spent), backgroundColor: C.teal, borderRadius: 8 }] },
        options: { plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + F.money(c.raw) } } }, scales: { y: { ticks: { callback: (v) => F.money(v) }, grid: { color: C.grid } }, x: { grid: { display: false } } } } });
    } else {
      const cG = card('Genres in the catalogue', 'popcorn'); cG.style.gridColumn = 'span 2'; r1.append(cG);
      DP.chart(cG, { type: 'bar', data: { labels: (d.genres || []).map((x) => x.label), datasets: [{ data: (d.genres || []).map((x) => x.n), backgroundColor: pal(), borderRadius: 8 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } } });
    }

    // ---- charts row 2
    const r2 = h('div', { class: 'grid g3 mt' }); view.append(r2);
    if (fin) {
      const cCat = card('Where the money goes', 'receipt'); r2.append(cCat);
      DP.chart(cCat, { type: 'bar', data: { labels: (d.expense_categories || []).map((x) => x.label), datasets: [{ data: (d.expense_categories || []).map((x) => x.total), backgroundColor: C.teal, borderRadius: 7 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => F.money(c.raw) } } }, scales: { x: { ticks: { callback: (v) => F.money(v) }, grid: { color: C.grid } }, y: { grid: { display: false } } } } });
      const cYr = card('Spending by year', 'trending-up'); r2.append(cYr);
      const ch = DP.chart(cYr, { type: 'line', data: { labels: (d.expense_years || []).map((x) => x.label), datasets: [{ data: (d.expense_years || []).map((x) => x.total), borderColor: C.teal, borderWidth: 3, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: C.card, pointBorderColor: C.teal, pointBorderWidth: 2, backgroundColor: 'rgba(16,196,159,.16)' }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => F.money(c.raw) } } }, scales: { y: { ticks: { callback: (v) => F.money(v) }, grid: { color: C.grid } }, x: { grid: { display: false } } } } });
    }
    const cDel = card('Delays: hours lost by cause', 'clock'); r2.append(cDel);
    DP.chart(cDel, { type: 'bar', data: { labels: (d.delay_types || []).map((x) => x.label), datasets: [{ data: (d.delay_types || []).map((x) => x.hours), backgroundColor: (d.delay_types || []).map((_, i) => (i === 0 ? C.coral : C.tan)), borderRadius: 7 }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => F.num(c.raw) + ' hours' } } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 55, minRotation: 40 } } } } });
    if (!fin) { const cG2 = card('Project types', 'clapperboard'); r2.append(cG2); DP.chart(cG2, { type: 'polarArea', data: { labels: (d.types || []).map((x) => x.label), datasets: [{ data: (d.types || []).map((x) => x.n), backgroundColor: pal().map((c) => c + 'cc') }] }, options: { plugins: { legend: { position: 'bottom' } } } }); }

    // ---- lists
    const r3 = h('div', { class: 'grid g-21 mt2' }); view.append(r3);
    const left = h('div', { class: 'grid', style: { gap: '18px' } }); r3.append(left);
    if (DP.can('ai')) {
      const wl = card('AI watchlist: productions most likely to be delayed', 'sparkles'); left.append(wl); const slot = h('div', null, ui.skeleton(4)); wl.append(slot);
      DP.api('/ai/watchlist').then((rows) => { if (!ctx.alive()) return; DP.clear(slot).append(ui.table({ cols: [{ label: 'Project', render: (r) => h('div', null, h('div', { class: 'bold' }, r.title), h('div', { class: 'tiny muted' }, r.project_code + ' · day ' + r.day + ' of ' + r.days)) }, { label: 'Stage', render: (r) => ui.status(r.status) },
          { label: 'Delay risk', render: (r) => h('div', { style: { minWidth: '130px' } }, h('div', { class: 'tiny bold', style: { marginBottom: '4px' } }, F.pctf(r.risk)), ui.bar(r.risk * 100, 100, r.risk > 0.66 ? 'bad' : r.risk > 0.33 ? 'warn' : '')) },
          { label: 'Projected overrun', render: (r) => h('span', { class: r.overrun_pct > 0.1 ? 'bold' : '', style: { color: r.overrun_pct > 0.1 ? 'var(--bad)' : 'inherit' } }, (r.overrun_pct > 0 ? '+' : '') + F.pctf(r.overrun_pct, 0)), right: true }], rows: rows.slice(0, 7), onRow: (r) => DP.go('/projects/' + r.project_id + '?tab=ai') }),
        h('div', { class: 'tiny muted', style: { marginTop: '10px' } }, 'Computed live by the trained models from each project’s expenses, schedule, crew attendance and delays.')); }).catch((e) => DP.clear(slot).append(ui.callout('AI watchlist unavailable: ' + e.message, 'warn')));
    }
    if (fin && d.overruns && d.overruns.length) left.append(card('Biggest budget overruns', 'triangle-alert', ui.table({ cols: [{ label: 'Project', render: (r) => h('div', null, h('div', { class: 'bold' }, r.project_code), h('div', { class: 'tiny muted' }, r.project_name)) }, { label: 'Approved', render: (r) => F.money(r.approved), right: true }, { label: 'Spent', render: (r) => F.money(r.spent), right: true }, { label: 'Used', render: (r) => ui.tag(F.pct(r.pct, 0), 'bad'), right: true }], rows: d.overruns, onRow: (r) => DP.go('/projects/' + r.project_id + '?tab=budget') })));
    const right = h('div', { class: 'grid', style: { gap: '18px', alignContent: 'start' } }); r3.append(right);
    right.append(card('Activity (audit trail)', 'activity', (d.activity || []).length ? h('div', { class: 'feed' }, d.activity.map((a) => h('div', { class: 'it' }, h('div', { class: 'dot' }, icon(a.action === 'DELETE' ? 'scissors' : a.action === 'INSERT' ? 'plus' : 'pencil')), h('div', { class: 'grow' }, h('div', { class: 'small' }, h('b', null, a.actor), ' ', a.action.toLowerCase(), 'd a ', a.entity_type.replace('_', ' ')), h('div', { class: 'tiny muted' }, F.ago(a.logged_at))))))
      : ui.empty('No activity yet'), h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, 'Budget changes made in DecaPic are written here by a database trigger.')));
    right.append(card('Shooting now', 'camera', (d.recent_days || []).length ? d.recent_days.map((x) => h('div', { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => DP.go('/projects/' + x.project_id + '?tab=schedule') }, h('div', { class: 'avatar sm' }, icon('map-pin')), h('div', { class: 'grow' }, h('div', { class: 'bold small' }, x.project_code), h('div', { class: 'tiny muted' }, x.location + ' · ' + F.date(x.shoot_date))), ui.status(x.status))) : ui.empty('Nothing in production', 'camera')));
    DP.reveal(view);
  };
  DP.route('/dashboard', DP.pages.dashboard);
})();
