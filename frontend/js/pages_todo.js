/* ===========================================================================
   PLACEHOLDER PAGES  -  these are the parts of the frontend that are NOT built yet.
   The BACKEND for every one of them is finished and tested (see docs/API.md).
   To build a page: create js/<name>.js, register it with DP.route(...) and add its <script> tag to
   index.html BEFORE this file (the first matching route wins, so your real page replaces the placeholder).
   =========================================================================== */
(function () {
  'use strict';
  const h = DP.h, ui = DP.ui;
  const todo = (path, title, nav, file, desc, endpoints, perm) => DP.route(path, async (ctx) => {
    const view = DP.page(ctx, { title, nav });
    view.append(DP.pageHead(title, desc), DP.card('Not built yet', 'wrench',
      h('p', { class: 'muted', style: { margin: '8px 0 14px' } }, 'Create ', h('code', null, 'frontend/js/' + file), ' and register it with ', h('code', null, "DP.route('" + path + "', …)"), '. The backend is ready:'),
      h('ul', { style: { paddingLeft: '20px', lineHeight: 1.9 } }, endpoints.map((e) => h('li', null, h('code', null, e)))),
      h('p', { class: 'small muted', style: { marginTop: '14px' } }, 'Full request/response details: docs/API.md · helper components you can reuse: DP.card, DP.kpi, DP.pageHead, ui.table, ui.tabs, ui.ring, ui.gauge, ui.impact, ui.modal, ui.drawer, DP.chart.')));
    DP.reveal(view);
  }, perm ? { perm } : {});

  todo('/films', 'Films', 'films', 'films.js', 'Browse the film catalogue as a poster wall.', ['GET /api/films?q=&genre_id=&status=&page=&size=  (use DP.filmCard)', 'GET /api/meta  (genres list for the filter)']);
  todo('/people', 'People', 'people', 'people.js', 'Search cast and crew; open a profile.', ['GET /api/people?q=&department_id=&role_id=&availability=&page=', 'GET /api/people/{id}  (already used by DP.openPerson(id))']);
  todo('/resources', 'Resources', 'resources', 'resources.js', 'Equipment, vendors, locations and production companies.', ['GET /api/resources/{equipment|vendors|locations|companies}?q=&category=&page=']);
  todo('/ai', 'AI Studio', 'ai', 'ai.js', 'Live predictions from the trained models + model lab.', ['GET /api/ai/models  (metrics, importance, ROC / scatter data for the Model Lab)', 'GET /api/ai/scene/{scene_id}  and  POST /api/ai/scene/plan  (Scene Planner)', 'GET /api/ai/health/{project_id}  and  POST /api/ai/health/whatif  (Project Health)', 'GET /api/ai/watchlist', 'GET /api/ai/crew/requirements?project_id=  ·  GET /api/ai/crew/requirement/{id}  ·  GET /api/ai/crew/suggest?project_id=&role_id=  (Crew Match)'], 'ai');
  todo('/lab', 'SQL Lab', 'lab', 'lab.js', 'Show the database itself: tables, ER diagrams, read-only SQL console, trigger demos.', ['GET /api/lab/overview  ·  GET /api/lab/table/{name}', 'POST /api/lab/query {sql}  ·  GET /api/lab/samples', 'POST /api/lab/demo {scenario}  (trigger_expense, closed_budget, check_constraint, foreign_key, transaction, payment_cap)', 'ER images are in frontend/assets/er/*.png'], 'lab');

  // used by the "AI Health" tab of the project page
  DP.healthPanel = DP.healthPanel || (async (el, pid) => { el.append(ui.callout(h('span', null, 'The AI Health panel is not built yet. Backend is ready: ', h('code', null, 'GET /api/ai/health/' + pid), ' returns the risk / projected-cost curve for every shoot day.'), 'warn', 'wrench')); });
})();
