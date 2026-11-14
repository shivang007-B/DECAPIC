/* Films: poster wall catalogue with genre & stage filters, search and pagination */
(function () {
  'use strict';
  const { h, icon, ui, fmt: F } = DP;
  const STATUSES = ['All', 'In Production', 'Post-production', 'Completed', 'Pre-production', 'Development'];

  DP.pages.films = async (ctx) => {
    const view = DP.page(ctx, { title: 'Films', nav: 'films' });
    const meta = await DP.loadMeta().catch(() => ({ genres: [] }));

    const st = {
      q: '',
      genre_id: ctx.query.genre_id || 0,
      status: ctx.query.status || '',
      page: 1,
      size: 24
    };

    const count = h('span', { class: 'muted' });
    const grid = h('div', { class: 'grid g-auto-s' });
    const pager = h('div', { class: 'mt2' });

    const load = async () => {
      DP.clear(grid).append(...Array.from({ length: 12 }, () => h('div', { class: 'card' }, ui.skeleton(4, true))));
      try {
        const res = await DP.api('/films' + DP.qs(st));
        if (!ctx.alive()) return;

        count.textContent = F.num(res.total) + ' films in catalogue';
        DP.clear(grid);

        if (!res.items || !res.items.length) {
          grid.append(ui.empty('No films match your search criteria', 'film'));
          DP.clear(pager);
          return;
        }

        res.items.forEach((film, idx) => {
          const cardEl = DP.filmCard(film);
          cardEl.style.animation = `fadeUp .5s var(--ease) ${Math.min(idx, 24) * 35}ms both`;
          grid.append(cardEl);
        });

        DP.clear(pager).append(
          ui.pager(st.page, res.total, st.size, (p) => {
            st.page = p;
            load();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
        );
      } catch (err) {
        DP.clear(grid).append(ui.callout(err.message, 'bad'));
      }
    };

    const chips = h('div', { class: 'chips' },
      STATUSES.map((s) =>
        h('button', {
          class: 'chip' + ((s === 'All' && !st.status) || s === st.status ? ' active' : ''),
          onclick: (e) => {
            st.status = s === 'All' ? '' : s;
            st.page = 1;
            [...chips.children].forEach((c) => c.classList.toggle('active', c === e.currentTarget));
            load();
          }
        }, s)
      )
    );

    const genreOptions = [
      { value: 0, label: 'All Genres' },
      ...(meta.genres || []).map((g) => ({ value: g.id, label: g.name }))
    ];

    const genreSelect = ui.select(genreOptions, st.genre_id, (v) => {
      st.genre_id = Number(v);
      st.page = 1;
      load();
    });

    view.append(
      DP.pageHead(
        'Films',
        'Browse the complete film catalogue as a visual poster wall. Filter by genre, production stage or keyword.',
        count
      ),
      h('div', { class: 'toolbar' },
        DP.searchBox('Search by title…', (v) => {
          st.q = v;
          st.page = 1;
          load();
        }),
        chips,
        genreSelect
      ),
      grid,
      pager
    );

    DP.reveal(view);
    load();
  };

  DP.route('/films', DP.pages.films);
})();

