/* People: search and filter cast & crew; open comprehensive profile drawer */
(function () {
  'use strict';
  const { h, icon, ui, fmt: F } = DP;

  const AVAILABILITIES = ['All', 'Available', 'Busy', 'Unavailable'];

  DP.pages.people = async (ctx) => {
    const view = DP.page(ctx, { title: 'People', nav: 'people' });
    const meta = await DP.loadMeta().catch(() => ({ departments: [], roles: [] }));

    const st = {
      q: '',
      department_id: ctx.query.department_id || 0,
      role_id: ctx.query.role_id || 0,
      availability: ctx.query.availability || '',
      page: 1,
      size: 24
    };

    const count = h('span', { class: 'muted' });
    const grid = h('div', { class: 'grid g-auto' });
    const pager = h('div', { class: 'mt2' });

    const load = async () => {
      DP.clear(grid).append(...Array.from({ length: 8 }, () => h('div', { class: 'card' }, ui.skeleton(4, true))));
      try {
        const res = await DP.api('/people' + DP.qs(st));
        if (!ctx.alive()) return;

        count.textContent = F.num(res.total) + ' professionals found';
        DP.clear(grid);

        if (!res.items || !res.items.length) {
          grid.append(ui.empty('No cast or crew match your search', 'users'));
          DP.clear(pager);
          return;
        }

        res.items.forEach((p, idx) => {
          const cardEl = h('div', {
            class: 'card hover',
            style: { cursor: 'pointer', padding: '18px', animation: `fadeUp .5s var(--ease) ${Math.min(idx, 24) * 35}ms both` },
            onclick: () => DP.openPerson(p.person_id)
          },
            h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '14px' } },
              ui.avatar(p.name, 'md'),
              h('div', { class: 'grow' },
                h('div', { class: 'bold', style: { fontSize: '16px' } }, p.name),
                h('div', { class: 'small muted', style: { marginTop: '2px', lineClamp: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  p.roles || 'Cast / Crew'
                ),
                h('div', { class: 'row wrap gap-s mt', style: { marginTop: '10px' } },
                  ui.status(p.availability_status),
                  p.country_name ? ui.tag(p.country_name, 'tan') : null,
                  p.projects ? ui.tag(p.projects + ' ' + (p.projects === 1 ? 'project' : 'projects'), 'teal') : null
                )
              )
            )
          );
          grid.append(cardEl);
        });

        DP.clear(pager).append(
          ui.pager(st.page, res.total, st.size, (pg) => {
            st.page = pg;
            load();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
        );
      } catch (err) {
        DP.clear(grid).append(ui.callout(err.message, 'bad'));
      }
    };

    const availChips = h('div', { class: 'chips' },
      AVAILABILITIES.map((a) =>
        h('button', {
          class: 'chip' + ((a === 'All' && !st.availability) || a === st.availability ? ' active' : ''),
          onclick: (e) => {
            st.availability = a === 'All' ? '' : a;
            st.page = 1;
            [...availChips.children].forEach((c) => c.classList.toggle('active', c === e.currentTarget));
            load();
          }
        }, a)
      )
    );

    const deptOptions = [
      { value: 0, label: 'All Departments' },
      ...(meta.departments || []).map((d) => ({ value: d.id, label: d.name }))
    ];

    const deptSelect = ui.select(deptOptions, st.department_id, (v) => {
      st.department_id = Number(v);
      st.page = 1;
      load();
    });

    const roleOptions = [
      { value: 0, label: 'All Specific Roles' },
      ...(meta.roles || []).map((r) => ({ value: r.id, label: r.name }))
    ];

    const roleSelect = ui.select(roleOptions, st.role_id, (v) => {
      st.role_id = Number(v);
      st.page = 1;
      load();
    });

    view.append(
      DP.pageHead(
        'People',
        'Directory of actors, directors, cinematographers, grips and key crew. Click any card to inspect full filmography, skills and bookings.',
        count
      ),
      h('div', { class: 'toolbar' },
        DP.searchBox('Search name or keyword…', (v) => {
          st.q = v;
          st.page = 1;
          load();
        }),
        availChips,
        deptSelect,
        roleSelect
      ),
      grid,
      pager
    );

    DP.reveal(view);
    load();
  };

  DP.route('/people', DP.pages.people);
})();

