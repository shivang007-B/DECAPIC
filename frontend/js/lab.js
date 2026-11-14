/* SQL Lab: database explorer, query console, trigger & constraint playground, ER diagrams */
(function () {
  'use strict';
  const { h, icon, ui, fmt: F, card } = DP;

  const ER_DIAGRAMS = [
    { id: 'overview', title: 'Complete Schema Overview', file: '/assets/er/overview.png', desc: '52 tables, 17 views, foreign keys and high-level relationships across the entire cineops database.' },
    { id: 'project_film_release', title: 'Projects, Films & Releases', file: '/assets/er/project_film_release.png', desc: 'Core hierarchy linking projects, films, genres, certificates, box office and streaming releases.' },
    { id: 'script_scenes', title: 'Scripts & Scenes', file: '/assets/er/script_scenes.png', desc: 'Scene breakdown, locations, cast requirements, VFX/stunt tags and scene duration metrics.' },
    { id: 'people_roles', title: 'People, Cast & Crew Roles', file: '/assets/er/people_roles.png', desc: 'Industry roles, department taxonomy, skills, cast assignments and crew bookings.' },
    { id: 'budget_contracts', title: 'Budgets, Expenses & Contracts', file: '/assets/er/budget_contracts.png', desc: 'Budget allocations, expense transactions, vendor contracts, payments and trigger audits.' },
    { id: 'shooting_equipment', title: 'Shoot Days & Equipment', file: '/assets/er/shooting_equipment.png', desc: 'Daily shoot schedules, call sheets, equipment inventory, rentals and delay logs.' }
  ];

  const DEMO_SCENARIOS = [
    { id: 'trigger_expense', label: '1. Expense Trigger (trg_expenses_ai)', icon: 'zap', desc: 'Adding an expense automatically recalculates spent_amount and updates remaining_amount in budget_departments.' },
    { id: 'closed_budget', label: '2. Closed Budget Lock (trg_expenses_bi)', icon: 'lock', desc: 'BEFORE INSERT trigger trg_expenses_bi strictly blocks new expenses on closed budgets.' },
    { id: 'check_constraint', label: '3. CHECK Constraint (chk_expenses_amounts)', icon: 'shield-alert', desc: 'Database engine rejects an INSERT with negative expense amounts.' },
    { id: 'foreign_key', label: '4. Foreign Key Constraint', icon: 'link-2', desc: 'Integrity check prevents inserting an orphan expense with a non-existent budget department ID.' },
    { id: 'transaction', label: '5. Atomic Transaction Rollback', icon: 'rotate-ccw', desc: 'Stored procedure sp_transfer_budget rolls back atomically if any balance check fails.' },
    { id: 'payment_cap', label: '6. Payment Cap Trigger (trg_payments_bi)', icon: 'alert-triangle', desc: 'Payment trigger trg_payments_bi blocks payments exceeding the agreed contract value.' }
  ];

  DP.pages.lab = async (ctx) => {
    const view = DP.page(ctx, { title: 'SQL Lab', nav: 'lab' });
    view.append(
      DP.pageHead(
        'SQL Lab',
        'Direct window into the cineops MySQL database: table explorer, live read-only query console, trigger & constraint demos, and ER diagrams.',
        ui.tag('MySQL 8.0 · cineops', 'teal'),
        ui.btn('Refresh', { icon: 'refresh-cw', onClick: () => DP.render() })
      )
    );

    DP.loading(view, 3);
    let overview;
    try {
      overview = await DP.api('/lab/overview');
    } catch (e) {
      DP.clear(view).append(ui.callout(e.message, 'bad'));
      return;
    }
    if (!ctx.alive()) return;

    // Clear skeletons
    while (view.children.length > 1) view.removeChild(view.lastChild);

    // KPI row
    view.append(
      h('div', { class: 'grid g6' },
        DP.kpi({ icon: 'database', label: 'Tables', value: overview.tables.length, detail: F.num(overview.total_rows) + ' total rows' }),
        DP.kpi({ icon: 'layers', label: 'Views', value: overview.views.length, detail: 'analytical views' }),
        DP.kpi({ icon: 'zap', label: 'Triggers', value: overview.triggers.length, detail: 'automated business rules' }),
        DP.kpi({ icon: 'code', label: 'Procedures', value: overview.routines.length, detail: 'stored routines' }),
        DP.kpi({ icon: 'link', label: 'Foreign Keys', value: overview.fks, detail: 'referential integrity' }),
        DP.kpi({ icon: 'shield-check', label: 'CHECK Rules', value: overview.checks, detail: 'domain constraints' })
      )
    );

    // Main Tab container
    const tabContent = h('div', { class: 'mt2' });
    const tabs = [
      { id: 'explorer', label: 'Table Explorer', icon: 'table' },
      { id: 'console', label: 'Query Console', icon: 'terminal' },
      { id: 'playground', label: 'Trigger Playground', icon: 'zap' },
      { id: 'er', label: 'ER Diagrams', icon: 'file-text' },
      { id: 'schema', label: 'Triggers & Procedures', icon: 'code' }
    ];

    let currentTab = ctx.query.tab || 'explorer';

    const renderExplorer = (container) => {
      DP.clear(container);
      let selectedTable = overview.tables[0] ? overview.tables[0].name : '';
      let filterQ = '';
      let offset = 0;
      const limit = 20;

      const layout = h('div', { class: 'grid g-12 mt' });
      const leftCol = card('Database Tables', 'database');
      const rightCol = h('div', { class: 'grid', style: { gap: '16px' } });
      layout.append(leftCol, rightCol);

      const tableList = h('div', { class: 'feed', style: { maxHeight: '650px', overflowY: 'auto' } });

      const drawTableList = () => {
        DP.clear(tableList);
        const filtered = overview.tables.filter((t) => !filterQ || t.name.toLowerCase().includes(filterQ.toLowerCase()));
        if (!filtered.length) {
          tableList.append(ui.empty('No matching tables'));
          return;
        }
        filtered.forEach((t) => {
          const isSel = t.name === selectedTable;
          const row = h('div', {
            class: 'list-row' + (isSel ? ' sel' : ''),
            style: { cursor: 'pointer', padding: '10px 12px', borderRadius: '10px', background: isSel ? 'var(--teal-50, rgba(16,196,159,0.12))' : 'transparent', border: isSel ? '1px solid var(--teal)' : '1px solid transparent' },
            onclick: () => {
              if (selectedTable === t.name) return;
              selectedTable = t.name;
              offset = 0;
              drawTableList();
              loadTableDetails();
            }
          },
            h('div', { class: 'grow' },
              h('div', { class: 'bold small mono' }, t.name),
              t.comment ? h('div', { class: 'tiny muted' }, t.comment) : null
            ),
            h('span', { class: 'tag' }, F.num(t.rows))
          );
          tableList.append(row);
        });
      };

      const searchInput = DP.searchBox('Filter tables…', (val) => {
        filterQ = val;
        drawTableList();
      });
      leftCol.append(searchInput, h('div', { class: 'mt' }, tableList));

      const loadTableDetails = async () => {
        DP.clear(rightCol).append(card('Loading ' + selectedTable + '…', 'table', ui.skeleton(6, true)));
        try {
          const data = await DP.api(`/lab/table/${selectedTable}?limit=${limit}&offset=${offset}`);
          if (!ctx.alive()) return;
          DP.clear(rightCol);

          // Table Schema & Info Card
          const metaCard = card(
            selectedTable,
            'table',
            h('div', { class: 'row wrap gap-s mb', style: { marginBottom: '14px' } },
              ui.tag(F.num(data.total) + ' rows in table', 'teal'),
              ui.tag(data.columns.length + ' columns', 'tan'),
              data.fks.length ? ui.tag(data.fks.length + ' foreign keys', 'info') : null
            ),
            h('div', { class: 'small bold mb', style: { marginBottom: '8px' } }, 'Columns definition:'),
            ui.table({
              cols: [
                { label: 'Column', key: 'name', mono: true },
                { label: 'Type', key: 'type', mono: true },
                { label: 'Nullable', render: (r) => (r.nullable ? ui.tag('NULL', 'muted') : ui.tag('NOT NULL', 'tan')) },
                { label: 'Key', render: (r) => (r.key === 'PRI' ? ui.tag('PRIMARY', 'teal') : r.key === 'UNI' ? ui.tag('UNIQUE', 'info') : r.key === 'MUL' ? ui.tag('INDEX / FK', 'tan') : '-') },
                { label: 'Extra', key: 'extra', mono: true }
              ],
              rows: data.columns
            })
          );
          rightCol.append(metaCard);

          // Foreign keys if any
          if (data.fks && data.fks.length) {
            rightCol.append(
              card('Foreign Key Constraints', 'link',
                ui.table({
                  cols: [
                    { label: 'Local Column', key: 'col', mono: true },
                    { label: 'References Table', render: (r) => h('a', { class: 'bold mono', style: { color: 'var(--teal-600)', cursor: 'pointer' }, onclick: () => { selectedTable = r.ref_table; offset = 0; drawTableList(); loadTableDetails(); } }, r.ref_table) },
                    { label: 'Referenced Column', key: 'ref_col', mono: true }
                  ],
                  rows: data.fks
                })
              )
            );
          }

          // Sample data rows card
          const colsForRows = data.columns.map((c) => ({
            label: c.name,
            mono: true,
            render: (r) => {
              const v = r[c.name];
              if (v == null) return h('span', { class: 'faint' }, 'NULL');
              if (typeof v === 'boolean') return String(v);
              if (typeof v === 'object') return JSON.stringify(v);
              const s = String(v);
              return s.length > 50 ? s.slice(0, 48) + '…' : s;
            }
          }));

          const pager = ui.pager(Math.floor(offset / limit) + 1, data.total, limit, (p) => {
            offset = (p - 1) * limit;
            loadTableDetails();
          });

          rightCol.append(
            card(
              `Browse Rows (${offset + 1}–${Math.min(offset + limit, data.total)} of ${F.num(data.total)})`,
              'eye',
              ui.table({
                cols: colsForRows,
                rows: data.rows,
                empty: 'Table is empty'
              }),
              h('div', { class: 'mt' }, pager)
            )
          );

        } catch (err) {
          DP.clear(rightCol).append(ui.callout('Failed to load table: ' + err.message, 'bad'));
        }
      };

      drawTableList();
      loadTableDetails();
      container.append(layout);
    };

    const renderConsole = async (container) => {
      DP.clear(container);
      const layout = h('div', { class: 'grid g-21 mt' });
      const leftCol = h('div', { class: 'grid', style: { gap: '16px' } });
      const rightCol = card('Sample Queries (from 06_sample_queries.sql)', 'book-open');
      layout.append(leftCol, rightCol);

      const editor = h('textarea', {
        class: 'editor',
        placeholder: 'Enter read-only SQL query (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN)...',
        spellcheck: false,
        rows: 7
      });
      editor.value = "SELECT p.project_code, f.title, p.production_status, p.approved_budget,\n       COUNT(DISTINCT s.scene_id) AS scenes_count\nFROM projects p\nJOIN films f ON f.film_id = p.film_id\nLEFT JOIN scenes s ON s.project_id = p.project_id\nGROUP BY p.project_id, p.project_code, f.title, p.production_status, p.approved_budget\nORDER BY p.approved_budget DESC\nLIMIT 10;";

      const statusMsg = h('div', { class: 'row gap-s' });
      const resultBox = h('div');

      const executeQuery = async () => {
        const sql = editor.value.trim();
        if (!sql) {
          ui.toast('Please write a query first', 'warn');
          return;
        }
        DP.clear(statusMsg).append(h('span', { class: 'small muted' }, 'Executing query on read-only session…'));
        DP.clear(resultBox).append(ui.skeleton(4, true));
        try {
          const res = await DP.api('/lab/query', { body: { sql } });
          DP.clear(statusMsg).append(
            ui.tag(`${res.rows.length} rows returned in ${res.ms} ms`, 'teal'),
            res.truncated ? ui.tag('Result truncated at 500 rows limit', 'warn') : null
          );
          if (!res.rows.length) {
            DP.clear(resultBox).append(ui.empty('Query executed successfully. 0 rows returned.', 'check-circle'));
            return;
          }
          const cols = res.columns.map((c, i) => ({
            label: c,
            mono: true,
            render: (r) => {
              const val = r[i];
              if (val == null) return h('span', { class: 'faint' }, 'NULL');
              const s = String(val);
              return s.length > 80 ? s.slice(0, 77) + '…' : s;
            }
          }));
          DP.clear(resultBox).append(
            card('Query Result', 'table', ui.table({ cols, rows: res.rows }))
          );
        } catch (err) {
          DP.clear(statusMsg);
          DP.clear(resultBox).append(ui.callout(err.message, 'bad', 'circle-alert'));
        }
      };

      editor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          executeQuery();
        }
      });

      const runBtn = ui.btn('Run Query', { cls: 'primary', icon: 'play', onClick: executeQuery });
      const clearBtn = ui.btn('Clear', { cls: 'subtle', onClick: () => { editor.value = ''; editor.focus(); } });

      leftCol.append(
        card(
          'SQL Query Editor',
          'terminal',
          ui.callout('SQL Lab runs in a read-only transaction on the cineops database with a strict 8-second execution cap. Press Ctrl+Enter to run.', 'info'),
          h('div', { class: 'mt' }, editor),
          h('div', { class: 'row wrap gap-s mt', style: { justifyContent: 'space-between', alignItems: 'center' } },
            h('div', { class: 'row gap-s' }, runBtn, clearBtn),
            statusMsg
          )
        ),
        resultBox
      );

      // Load sample queries
      rightCol.append(ui.skeleton(5));
      try {
        const samples = await DP.api('/lab/samples');
        DP.clear(rightCol);
        rightCol.append(
          h('div', { class: 'card-title' }, icon('book-open'), 'Sample Queries (' + samples.length + ')'),
          h('div', { class: 'feed', style: { maxHeight: '600px', overflowY: 'auto' } },
            samples.map((s) => h('div', {
              class: 'list-row',
              style: { cursor: 'pointer', padding: '10px 12px', borderRadius: '10px' },
              onclick: () => {
                editor.value = s.sql;
                editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
                executeQuery();
              }
            },
              h('div', { class: 'grow' },
                h('div', { class: 'bold small' }, s.id + ': ' + s.title),
                s.section ? h('div', { class: 'tiny muted' }, s.section) : null
              ),
              ui.tag('Load', 'teal')
            ))
          )
        );
      } catch (err) {
        DP.clear(rightCol).append(ui.callout('Could not load samples: ' + err.message, 'warn'));
      }

      container.append(layout);
    };

    const renderPlayground = (container) => {
      DP.clear(container);
      const layout = h('div', { class: 'grid g-12 mt' });
      const leftCol = card('Trigger & Constraint Scenarios', 'zap');
      const rightCol = card('Execution Trace (Live Database Rollback)', 'activity');
      layout.append(leftCol, rightCol);

      leftCol.append(
        h('p', { class: 'small muted', style: { marginBottom: '14px' } },
          'Test MySQL stored procedures, BEFORE/AFTER triggers, and CHECK/FOREIGN KEY constraints safely. Every test executes inside a database transaction that is immediately ROLLED BACK.'
        )
      );

      const stepsContainer = h('div');
      rightCol.append(
        ui.callout('Select any scenario from the left to run it against the live cineops database.', 'info'),
        stepsContainer
      );

      const runDemo = async (scenario) => {
        DP.clear(stepsContainer).append(ui.skeleton(4, true));
        try {
          const res = await DP.api('/lab/demo', { body: { scenario } });
          DP.clear(stepsContainer);

          stepsContainer.append(
            h('div', { class: 'row wrap gap-s mb', style: { marginBottom: '14px' } },
              res.rolled_back ? ui.tag('Transaction Rolled Back (0 bytes modified)', 'ok') : null,
              res.error ? ui.tag('Caught DB Error', 'bad') : null
            )
          );

          res.steps.forEach((st, i) => {
            const stepEl = h('div', { class: 'step' + (st.bad ? ' bad' : ''), style: { '--i': i } },
              h('div', { class: 'n' }, String(i + 1)),
              h('div', { class: 'grow' },
                h('div', { class: 'tiny muted' }, st.label),
                h('div', { class: 'v' }, typeof st.value === 'number' ? F.num(st.value, 2) : String(st.value))
              )
            );
            stepsContainer.append(stepEl);
          });

          if (res.error) {
            stepsContainer.append(ui.callout('DB Engine Message: ' + res.error, 'bad'));
          }
        } catch (err) {
          DP.clear(stepsContainer).append(ui.callout('Scenario execution failed: ' + err.message, 'bad'));
        }
      };

      DEMO_SCENARIOS.forEach((demo) => {
        const item = h('div', {
          class: 'card hover soft',
          style: { cursor: 'pointer', marginBottom: '12px', padding: '14px' },
          onclick: () => runDemo(demo.id)
        },
          h('div', { class: 'bold small' }, demo.label),
          h('div', { class: 'tiny muted', style: { marginTop: '4px' } }, demo.desc),
          h('div', { class: 'mt', style: { display: 'flex', justifyContent: 'flex-end' } },
            ui.btn('Run Test', { cls: 'sm primary', icon: 'play' })
          )
        );
        leftCol.append(item);
      });

      container.append(layout);
    };

    const renderER = (container) => {
      DP.clear(container);
      let selectedER = ER_DIAGRAMS[0];

      const navRow = h('div', { class: 'chips' },
        ER_DIAGRAMS.map((er) =>
          h('button', {
            class: 'chip' + (er.id === selectedER.id ? ' active' : ''),
            onclick: (e) => {
              selectedER = er;
              [...navRow.children].forEach((c) => c.classList.toggle('active', c === e.currentTarget));
              drawER();
            }
          }, er.title)
        )
      );

      const previewBox = h('div', { class: 'mt' });

      const drawER = () => {
        DP.clear(previewBox);
        previewBox.append(
          card(
            selectedER.title,
            'file-text',
            h('p', { class: 'muted small', style: { marginBottom: '14px' } }, selectedER.desc),
            h('div', {
              style: {
                background: 'var(--card-2)',
                borderRadius: '14px',
                padding: '16px',
                textAlign: 'center',
                overflow: 'auto',
                border: '1px solid var(--line)'
              }
            },
              h('a', { href: selectedER.file, target: '_blank', title: 'Click to open full high-resolution diagram' },
                h('img', {
                  src: selectedER.file,
                  alt: selectedER.title,
                  style: {
                    maxWidth: '100%',
                    height: 'auto',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                  }
                })
              )
            ),
            h('div', { class: 'row gap-s mt', style: { justifyContent: 'flex-end' } },
              h('a', { href: selectedER.file, target: '_blank', class: 'btn' }, icon('external-link'), 'Open Full Size Image')
            )
          )
        );
      };

      container.append(
        card(
          'Entity Relationship Diagrams',
          'file-text',
          h('p', { class: 'muted small', style: { marginBottom: '14px' } }, 'High resolution visual ER diagrams generated from the cineops MySQL schema.'),
          navRow
        ),
        previewBox
      );
      drawER();
    };

    const renderSchema = (container) => {
      DP.clear(container);
      const grid = h('div', { class: 'grid g2 mt' });

      // Triggers Card
      const trigCard = card('Database Triggers (7)', 'zap',
        ui.table({
          cols: [
            { label: 'Trigger Name', key: 'name', mono: true },
            { label: 'Timing', render: (r) => ui.tag(r.timing, 'teal') },
            { label: 'Event', render: (r) => ui.tag(r.event, 'tan') },
            { label: 'Target Table', key: 'tbl', mono: true }
          ],
          rows: overview.triggers
        })
      );

      // Stored Procedures Card
      const procCard = card('Stored Procedures & Functions', 'code',
        ui.table({
          cols: [
            { label: 'Routine Name', key: 'name', mono: true },
            { label: 'Type', render: (r) => ui.tag(r.type, r.type === 'PROCEDURE' ? 'teal' : 'info') }
          ],
          rows: overview.routines
        })
      );

      // Views Card
      const viewCard = card('Analytical Views (17)', 'layers',
        ui.table({
          cols: [
            { label: 'View Name', key: 'name', mono: true }
          ],
          rows: overview.views.map((v) => ({ name: v }))
        })
      );

      grid.append(trigCard, procCard);
      container.append(grid, h('div', { class: 'mt' }, viewCard));
    };

    const tabSwitch = ui.tabs(tabs, (tabId) => {
      currentTab = tabId;
      if (tabId === 'explorer') renderExplorer(tabContent);
      else if (tabId === 'console') renderConsole(tabContent);
      else if (tabId === 'playground') renderPlayground(tabContent);
      else if (tabId === 'er') renderER(tabContent);
      else if (tabId === 'schema') renderSchema(tabContent);
    }, currentTab);

    view.append(tabSwitch, tabContent);
    tabSwitch.select(currentTab);
    DP.reveal(view);
  };

  DP.route('/lab', DP.pages.lab, { perm: 'lab' });
})();

