/* Resources: Equipment, Vendors, Locations, and Production Companies */
(function () {
  'use strict';
  const { h, icon, ui, fmt: F, card } = DP;

  const TABS = [
    { id: 'equipment', label: 'Equipment', icon: 'camera' },
    { id: 'vendors', label: 'Vendors', icon: 'building-2' },
    { id: 'locations', label: 'Locations', icon: 'map-pin' },
    { id: 'companies', label: 'Production Houses', icon: 'clapperboard' }
  ];

  DP.pages.resources = async (ctx) => {
    const view = DP.page(ctx, { title: 'Resources', nav: 'resources' });

    let activeTab = ctx.query.tab || 'equipment';
    const st = {
      q: '',
      category: '',
      page: 1,
      size: 20
    };

    const count = h('span', { class: 'muted' });
    const content = h('div', { class: 'mt2' });

    const loadTab = async () => {
      DP.clear(content).append(card('Loading ' + activeTab + '…', 'package', ui.skeleton(6, true)));
      try {
        const res = await DP.api(`/resources/${activeTab}` + DP.qs(st));
        if (!ctx.alive()) return;

        count.textContent = F.num(res.total) + ' records';
        DP.clear(content);

        // Toolbar
        const catOptions = [
          { value: '', label: 'All Categories' },
          ...(res.categories || []).map((c) => ({ value: c, label: c }))
        ];

        const catSelect = (res.categories && res.categories.length)
          ? ui.select(catOptions, st.category, (v) => {
              st.category = v;
              st.page = 1;
              loadTab();
            })
          : null;

        const toolbar = h('div', { class: 'toolbar' },
          DP.searchBox(`Search ${activeTab}…`, (v) => {
            st.q = v;
            st.page = 1;
            loadTab();
          }, st.q),
          catSelect
        );

        let cols = [];
        if (activeTab === 'equipment') {
          cols = [
            { label: 'Equipment', render: (r) => h('div', null, h('div', { class: 'bold' }, r.name), h('div', { class: 'tiny muted' }, (r.manufacturer || '') + (r.model ? ' ' + r.model : ''))) },
            { label: 'Category', render: (r) => ui.tag(r.category, 'teal') },
            { label: 'Daily Rate', render: (r) => F.money(r.daily_rental_rate), right: true },
            { label: 'Status', render: (r) => ui.status(r.availability_status) },
            { label: 'Condition', render: (r) => ui.tag(r.equipment_condition, r.equipment_condition === 'Excellent' ? 'ok' : 'tan') },
            { label: 'Supplier / Vendor', key: 'vendor' },
            { label: 'Rentals', key: 'rentals', right: true },
            { label: 'Revenue Generated', render: (r) => F.money(r.revenue), right: true }
          ];
        } else if (activeTab === 'vendors') {
          cols = [
            { label: 'Vendor Name', render: (r) => h('div', { class: 'bold' }, r.name) },
            { label: 'Type', render: (r) => ui.tag(r.category, 'tan') },
            { label: 'Status', render: (r) => ui.status(r.status) },
            { label: 'Rating', render: (r) => (r.rating ? h('span', null, icon('star'), ' ', Number(r.rating).toFixed(1)) : '-') },
            { label: 'Country', key: 'country_name' },
            { label: 'Catalog Items', key: 'equipment', right: true },
            { label: 'Total Spend', render: (r) => F.money(r.spend), right: true }
          ];
        } else if (activeTab === 'locations') {
          cols = [
            { label: 'Location Name', render: (r) => h('div', null, h('div', { class: 'bold' }, r.name), h('div', { class: 'tiny muted' }, [r.city_name, r.country_name].filter(Boolean).join(', '))) },
            { label: 'Type', render: (r) => ui.tag(r.category, 'teal') },
            { label: 'Setting', render: (r) => ui.tag(r.indoor_outdoor, r.indoor_outdoor === 'Outdoor' ? 'info' : 'tan') },
            { label: 'Status', render: (r) => ui.status(r.availability_status) },
            { label: 'Base Cost', render: (r) => F.money(r.base_cost), right: true },
            { label: 'Shoot Days Hosted', key: 'shoot_days', right: true }
          ];
        } else if (activeTab === 'companies') {
          cols = [
            { label: 'Production House', render: (r) => h('div', null, h('div', { class: 'bold' }, r.name), r.founded_year ? h('div', { class: 'tiny muted' }, 'Founded ' + r.founded_year) : null) },
            { label: 'Size', render: (r) => ui.tag(r.category, 'teal') },
            { label: 'Status', render: (r) => ui.status(r.status) },
            { label: 'Country', key: 'country_name' },
            { label: 'Projects Linked', render: (r) => h('span', { class: 'bold' }, r.projects), right: true }
          ];
        }

        const tableEl = ui.table({
          cols,
          rows: res.items,
          empty: 'No resources match your query'
        });

        const pagerEl = ui.pager(st.page, res.total, st.size, (p) => {
          st.page = p;
          loadTab();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        content.append(toolbar, card(TABS.find((t) => t.id === activeTab)?.label || 'Directory', 'package', tableEl), h('div', { class: 'mt' }, pagerEl));
      } catch (err) {
        DP.clear(content).append(ui.callout(err.message, 'bad'));
      }
    };

    const tabSwitch = ui.tabs(TABS, (tabId) => {
      activeTab = tabId;
      st.q = '';
      st.category = '';
      st.page = 1;
      loadTab();
    }, activeTab);

    view.append(
      DP.pageHead(
        'Resources',
        'Directory of physical equipment inventory, trusted vendors, shoot locations and associated production houses.',
        count
      ),
      tabSwitch,
      content
    );

    DP.reveal(view);
    loadTab();
  };

  DP.route('/resources', DP.pages.resources);
})();

