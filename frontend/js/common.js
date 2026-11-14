/* Shared page components used by several pages */
(function () {
  'use strict';
  const { h, icon, ui, fmt: F } = DP;

  DP.card = (title, ic, ...kids) => h('div', { class: 'card' }, title ? h('div', { class: 'card-title' }, ic ? icon(ic) : null, title) : null, ...kids);
  DP.pageHead = (title, sub, ...right) => h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', null, sub) : null), right.length ? h('div', { class: 'right' }, ...right) : null);
  DP.kpi = (o) => {
    const v = h('div', { class: 'v' }, '0'); requestAnimationFrame(() => ui.countUp(v, o.value, o.fmt));
    return h('div', { class: 'card kpi hover' + (o.warn ? ' warn' : '') }, h('div', { class: 'ic' }, icon(o.icon)), v, h('div', { class: 'l' }, o.label), o.detail ? h('div', { class: 'd' }, o.detail) : null);
  };
  DP.loading = (view, n) => { view.append(h('div', { class: 'grid g3' }, Array.from({ length: n || 3 }, () => h('div', { class: 'card' }, ui.skeleton(4, true))))); };
  DP.searchBox = (placeholder, onInput, value) => { const i = h('input', { class: 'input', placeholder, value: value || '' }); i.addEventListener('input', DP.debounce(() => onInput(i.value.trim()), 320)); return i; };

  const GENRE_ICON = { Action: 'flame', Comedy: 'popcorn', Drama: 'film', Thriller: 'zap', Romance: 'heart', Horror: 'moon-star', Documentary: 'video', Animation: 'wand-sparkles' };

  DP.projectCard = (p) => h('div', { class: 'card hover proj-card', onclick: () => DP.go('/projects/' + p.project_id) },
    ui.poster(p.film_title, { year: p.release_year }),
    h('div', { class: 'meta' }, ui.status(p.production_status), ui.tag(p.project_type, 'tan'), p.priority === 'High' || p.priority === 'Critical' ? ui.tag(p.priority, 'bad') : null),
    h('div', null, h('div', { class: 'bold', style: { fontSize: '16px' } }, p.project_code), h('div', { class: 'small muted' }, p.genres || '—', ' · ', p.lead_house || '')),
    h('div', null,
      DP.can('finance_view') ? h('div', null, h('div', { class: 'stat' }, h('span', null, 'Budget used'), h('b', { class: 'num', style: { color: 'var(--text)' } }, F.pct(p.pct, 0), ' of ', F.money(p.approved_budget))), ui.bar(p.pct, 100, p.pct > 100 ? 'bad' : p.pct > 85 ? 'warn' : '')) : null,
      h('div', { class: 'stat', style: { marginTop: '10px' } }, h('span', null, 'Shoot days'), h('b', { class: 'num', style: { color: 'var(--text)' } }, p.days_done, ' / ', p.shoot_days)), ui.bar(p.days_done, p.shoot_days || 1, 'tan')));

  DP.filmCard = (f) => h('div', { class: 'card hover film-card', onclick: () => DP.go('/projects/' + f.project_id) },
    ui.poster(f.title, { year: f.release_year, style: { aspectRatio: '2 / 3' } }), h('div', { class: 't' }, f.title),
    h('div', { class: 's row', style: { justifyContent: 'space-between' } }, h('span', null, (f.genres || '').split(',')[0] || '—'), f.imdb_rating ? h('span', null, icon('star'), ' ', Number(f.imdb_rating).toFixed(1)) : null), h('div', { style: { padding: '0 6px' } }, ui.status(f.production_status)));

  // ---------------------------------------------------------------- scene drawer (with AI comparison)
  DP.openScene = async (sid) => {
    const body = h('div', null, ui.skeleton(6, true)); const dr = ui.drawer({ title: 'Scene', body });
    let s; try { s = await DP.api('/scenes/' + sid); } catch (e) { DP.clear(body).append(ui.callout(e.message, 'bad')); return; }
    dr.el.querySelector('h2').textContent = 'Scene ' + s.scene_number;
    const flags = [['vfx_required', 'VFX', 'violet'], ['stunt_required', 'Stunts', 'bad'], ['special_effects_required', 'SFX', 'warn'], ['night_shoot', 'Night', 'info'], ['weather_dependent', 'Weather dependent', 'tan']].filter((f) => s[f[0]]);
    DP.clear(body).append(
      h('div', { class: 'muted', style: { marginTop: '-14px', marginBottom: '14px' } }, s.heading), h('div', { class: 'row wrap gap-s' }, ui.status(s.status), ui.tag(s.interior_exterior, 'teal'), ui.tag(s.time_of_day), ui.tag(s.location_type, 'tan'), flags.map((f) => ui.tag(f[1], f[2]))),
      h('div', { class: 'grid g3 mt' }, [['Complexity', s.complexity_score + ' / 10'], ['Estimated', F.hours(s.estimated_duration)], ['Actual', s.actual_duration_hours != null ? F.hours(s.actual_duration_hours) : 'not shot yet']].map((x) => h('div', { class: 'card soft' }, h('div', { class: 'tiny muted' }, x[0]), h('div', { class: 'bold', style: { fontSize: '20px' } }, x[1])))),
      h('dl', { class: 'kv mt' }, h('dt', null, 'Project'), h('dd', { class: 'row' }, h('a', { class: 'bold', style: { color: 'var(--teal-600)', cursor: 'pointer' }, onclick: () => { dr.close(); DP.go('/projects/' + s.project_id); } }, s.project_code), ' ', s.project_name),
        h('dt', null, 'Location'), h('dd', null, s.location || '-'), h('dt', null, 'Needs'), h('dd', null, s.crew_required + ' crew · ' + s.equipment_required + ' equipment units'), h('dt', null, 'Gear'), h('dd', null, `${s.camera_units} camera · ${s.lighting_units} lighting · ${s.audio_units} audio · ${s.grip_units} grip`)),
      h('h2', { class: 'sec mt2' }, icon('users'), 'Characters in this scene'),
      s.characters.length ? s.characters.map((c) => h('div', { class: 'list-row' }, ui.avatar(c.actor || c.character_name, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'bold' }, c.character_name), h('div', { class: 'tiny muted' }, c.actor ? 'played by ' + c.actor : 'not cast yet')), ui.tag('importance ' + c.importance, 'tan'))) : ui.empty('No characters linked'),
      h('h2', { class: 'sec mt2' }, icon('camera'), 'Equipment linked to the scene'),
      s.equipment.length ? ui.table({ cols: [{ label: 'Equipment', key: 'equipment_name' }, { label: 'Category', key: 'category' }, { label: 'Qty', key: 'quantity', right: true }, { label: 'Vendor', key: 'vendor_name' }], rows: s.equipment }) : ui.empty('No rented equipment linked'),
      h('h2', { class: 'sec mt2' }, icon('calendar'), 'Shoot history'),
      s.shoots.length ? ui.table({ cols: [{ label: 'Date', render: (r) => F.date(r.shoot_date) }, { label: 'Day', key: 'day_number' }, { label: 'Status', render: (r) => ui.status(r.status) }, { label: 'Delay', render: (r) => (r.delay_minutes != null ? F.dur(r.delay_minutes) : '-') }], rows: s.shoots }) : ui.empty('Not scheduled'));
    if (DP.can('ai')) {
      const slot = h('div', { class: 'mt2' }, h('h2', { class: 'sec' }, icon('sparkles'), 'AI check: actual vs predicted'), ui.skeleton(3)); body.append(slot);
      try {
        const r = await DP.api('/ai/scene/' + sid); const p = r.prediction, sc = r.scene;
        DP.clear(slot).append(h('h2', { class: 'sec' }, icon('sparkles'), 'AI check: actual vs predicted', h('span', { class: 'sub' }, 'trained on this database')),
          ui.table({ cols: [{ label: '' , key: 'm' }, { label: 'Recorded', key: 'a', right: true }, { label: 'AI predicted', key: 'p', right: true }], rows: [
            { m: 'Shooting time', a: sc.actual_duration_hours != null ? F.hours(sc.actual_duration_hours) : '-', p: F.hours(p.duration_hours) },
            { m: 'Crew needed', a: sc.crew_required, p: p.crew.toFixed(1) }, { m: 'Equipment units', a: sc.equipment_required, p: p.equipment.toFixed(1) },
            { m: 'Camera / lighting / audio / grip', a: `${sc.camera_units} / ${sc.lighting_units} / ${sc.audio_units} / ${sc.grip_units}`, p: ['Camera', 'Lighting', 'Audio', 'Grip'].map((k) => p.units[k].toFixed(1)).join(' / ') }] }),
          h('div', { class: 'small muted', style: { margin: '14px 0 8px' } }, 'What pushes the predicted shooting time up (+) or down (−):'), ui.impact(p.explain_duration),
          h('div', { class: 'mt' }, ui.btn('Open in AI Studio', { icon: 'sparkles', onClick: () => { dr.close(); DP.go('/ai?tab=scene&scene=' + sid); } })));
      } catch (e) { DP.clear(slot).append(ui.callout('AI unavailable: ' + e.message, 'warn')); }
    }
  };

  // ---------------------------------------------------------------- shoot day drawer (wrap scene = trigger, log delay)
  DP.openShootDay = async (did, onChange) => {
    const body = h('div', null, ui.skeleton(6, true)); const dr = ui.drawer({ title: 'Shoot day', body });
    const load = async () => {
      let d; try { d = await DP.api('/shoot-days/' + did); } catch (e) { DP.clear(body).append(ui.callout(e.message, 'bad')); return; }
      dr.el.querySelector('h2').textContent = 'Day ' + d.day_number + ' · ' + F.date(d.shoot_date);
      const canS = DP.can('schedule_write'); const present = d.crew.filter((c) => c.attendance_status !== 'Absent').length;
      DP.clear(body).append(
        h('div', { class: 'row wrap gap-s', style: { marginTop: '-12px' } }, ui.status(d.status), ui.tag(d.weather_condition, 'info'), ui.tag(d.location, 'tan'), d.is_added_day ? ui.tag('added day (overrun)', 'bad') : null),
        h('div', { class: 'grid g4 mt' }, [['Planned', F.hours(d.planned_hours)], ['Actual', d.actual_hours != null ? F.hours(d.actual_hours) : '-'], ['Crew present', present + ' / ' + d.crew.length], ['Delay', F.dur(d.delay_minutes || 0)]].map((x) => h('div', { class: 'card soft' }, h('div', { class: 'tiny muted' }, x[0]), h('div', { class: 'bold', style: { fontSize: '18px' } }, x[1])))),
        h('h2', { class: 'sec mt2' }, icon('video'), 'Scenes', canS ? h('span', { class: 'sub' }, 'Wrapping a scene fires a database trigger') : null),
        d.scenes.length ? ui.table({ cols: [{ label: '#', key: 'scene_number' }, { label: 'Heading', render: (r) => h('a', { style: { cursor: 'pointer', color: 'var(--teal-600)' }, onclick: () => DP.openScene(r.scene_id) }, r.heading) }, { label: 'Planned', render: (r) => F.time(r.planned_start) + '–' + F.time(r.planned_end) },
          { label: 'Status', render: (r) => ui.status(r.status) }, { label: 'Delay', render: (r) => (r.delay_minutes != null ? F.dur(r.delay_minutes) : '-') },
          { label: '', render: (r) => (canS && r.status !== 'Completed' ? ui.btn('Wrap', { cls: 'sm primary', onClick: () => wrap(r) }) : '') }], rows: d.scenes }) : ui.empty('No scenes scheduled'),
        h('h2', { class: 'sec mt2' }, icon('users'), 'Crew attendance'),
        d.crew.length ? ui.table({ cols: [{ label: 'Name', render: (r) => h('a', { style: { cursor: 'pointer' }, onclick: () => DP.openPerson(r.person_id) }, r.name) }, { label: 'Role', key: 'role_name' }, { label: 'Dept', key: 'department_name' }, { label: 'Hours', render: (r) => Number(r.hours_worked).toFixed(1) }, { label: 'Status', render: (r) => ui.status(r.attendance_status) }], rows: d.crew }) : ui.empty('No crew assigned'),
        h('h2', { class: 'sec mt2' }, icon('triangle-alert'), 'Problems & delays', canS ? ui.btn('Log delay', { cls: 'sm right-a', icon: 'plus', onClick: () => logDelay(d) }) : null),
        d.events.length || d.delays.length ? h('div', null, d.delays.map((x) => h('div', { class: 'list-row' }, h('div', { class: 'dot avatar sm', style: { background: 'var(--coral-100)', color: 'var(--coral)' } }, icon('clock')), h('div', { class: 'grow' }, h('div', { class: 'bold' }, x.delay_type + ' · ' + F.dur(x.delay_minutes)), h('div', { class: 'tiny muted' }, x.cause + ' · ' + x.department_name)), ui.status(x.severity))),
          d.events.map((x) => h('div', { class: 'list-row' }, h('div', { class: 'avatar sm' }, icon('flag')), h('div', { class: 'grow' }, h('div', { class: 'bold' }, x.event_type), h('div', { class: 'tiny muted' }, x.description)), ui.status(x.severity)))) : ui.empty('A clean day: nothing went wrong', 'circle-check'));
      async function wrap(r) {
        let mins = 0; const sl = ui.slider('Minutes over the planned end time', 0, 180, 5, 0, (v) => (mins = v), (v) => (v ? '+' + v + ' min' : 'on time'));
        ui.modal({ title: 'Wrap scene ' + r.scene_number, sub: r.heading, body: h('div', null, sl, h('p', { class: 'small muted', style: { marginTop: '14px' } }, 'The app only sets the real finish time. The database trigger ', h('code', null, 'trg_shoot_day_scenes_bu'), ' then calculates the delay and marks the scene Completed by itself.')),
          actions: [{ label: 'Cancel' }, { label: 'Wrap scene', cls: 'primary', onClick: async () => { try { const x = await DP.api('/shoot-day-scenes/' + r.shoot_day_scene_id + '/wrap', { body: { delay_minutes: mins } }); ui.toast(`Scene wrapped. Trigger set status "${x.status}" and delay ${F.dur(x.delay_minutes)}`); await load(); onChange && onChange(); } catch (e) { ui.toast(e.message, 'err'); return false; } } }] });
      }
      function logDelay(dd) {
        const meta = DP.state.meta; const f = { delay_type: meta.delay_types[0], cause: '', delay_minutes: 30, severity: 'Moderate', department_id: meta.departments[0].id };
        const type = ui.select(meta.delay_types, f.delay_type, (v) => (f.delay_type = v)), sev = ui.select(meta.delay_severity, f.severity, (v) => (f.severity = v)), dep = ui.select(meta.departments.map((d) => ({ value: d.id, label: d.name })), f.department_id, (v) => (f.department_id = Number(v)));
        const cause = h('input', { class: 'input', placeholder: 'e.g. Generator failure on set', oninput: (e) => (f.cause = e.target.value) }); const mins = ui.slider('Minutes lost', 5, 360, 5, 30, (v) => (f.delay_minutes = v), (v) => F.dur(v));
        ui.modal({ title: 'Log a delay', sub: 'Day ' + dd.day_number + ' · ' + F.date(dd.shoot_date), body: h('div', { class: 'grid', style: { gap: '14px' } }, ui.field('Type', type), ui.field('Cause', cause), h('div', { class: 'grid g2' }, ui.field('Severity', sev), ui.field('Department', dep)), mins),
          actions: [{ label: 'Cancel' }, { label: 'Save delay', cls: 'primary', onClick: async () => { try { await DP.api('/shoot-days/' + did + '/delays', { body: f }); ui.toast('Delay logged'); await load(); onChange && onChange(); } catch (e) { ui.toast(e.message, 'err'); return false; } } }] });
      }
    };
    await load();
  };

  // ---------------------------------------------------------------- person drawer
  DP.openPerson = async (pid) => {
    const body = h('div', null, ui.skeleton(6, true)); const dr = ui.drawer({ title: 'Profile', body });
    let p; try { p = await DP.api('/people/' + pid); } catch (e) { DP.clear(body).append(ui.callout(e.message, 'bad')); return; }
    dr.el.querySelector('h2').textContent = p.name; const u = p.utilisation;
    DP.clear(body).append(
      h('div', { class: 'row', style: { marginTop: '-6px' } }, ui.avatar(p.name, 'lg'), h('div', null, h('div', { class: 'row wrap gap-s' }, ui.status(p.availability_status), p.gender ? ui.tag(p.gender) : null, ui.tag(p.country_name || '—', 'tan')), h('div', { class: 'small muted', style: { marginTop: '8px' } }, p.bio || ''), p.contact_email ? h('div', { class: 'small', style: { marginTop: '6px' } }, p.contact_email) : null)),
      u ? h('div', { class: 'grid g4 mt2' }, [['Days booked', u.days_booked], ['Days worked', u.days_worked], ['Hours', Number(u.total_hours).toFixed(0)], ['Projects', u.projects_worked]].map((x) => h('div', { class: 'card soft' }, h('div', { class: 'tiny muted' }, x[0]), h('div', { class: 'bold', style: { fontSize: '22px' } }, x[1])))) : null,
      h('h2', { class: 'sec mt2' }, icon('badge-check'), 'Roles & skills'),
      p.roles.length ? ui.table({ cols: [{ label: 'Role', key: 'role_name' }, { label: 'Department', key: 'department_name' }, { label: 'Level', render: (r) => ui.tag(r.skill_level, 'teal') }, { label: 'Experience', render: (r) => r.experience_years + ' yrs', right: true }], rows: p.roles }) : ui.empty('No roles recorded'),
      h('h2', { class: 'sec mt2' }, icon('film'), 'Credits'),
      p.credits.length ? ui.table({ cols: [{ label: 'Film', key: 'title' }, { label: 'As', render: (r) => ui.tag(r.kind, r.kind === 'Cast' ? 'violet' : 'teal') }, { label: 'Detail', key: 'detail' }, { label: 'Started', render: (r) => F.date(r.start_date) }], rows: p.credits, onRow: (r) => { dr.close(); DP.go('/projects/' + r.project_id); } }) : ui.empty('No credits yet'));
  };

  DP.loadMeta = async () => { if (!DP.state.meta) DP.state.meta = await DP.api('/meta'); return DP.state.meta; };
})();
