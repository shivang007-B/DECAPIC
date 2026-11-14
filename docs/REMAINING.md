# What is DONE and what is LEFT (frontend)

## DONE and tested
| Part | Status |
|---|---|
| **Database** `cineops` (52 tables, 17 views, 7 triggers, procedures, roles) + `07_decapic_app.sql` (app DB users, 7 demo logins) | ✅ |
| **Backend** (FastAPI): 41 endpoints, login (JWT) + 10 roles with permissions, every write goes through stored procedures / triggers | ✅ tested |
| **ML**: 7 models trained on the database (`ml/train_models.py`), saved in `ml/models/`, live prediction service (scene planner, project health curve, what-if, watchlist, crew match, explanations) | ✅ tested |
| **SQL Lab backend**: table browser, read-only query console (blocks writes), 28 sample queries, 6 trigger/constraint/transaction demos that are always rolled back | ✅ tested |
| **Frontend core** (`core.js`, `common.js`, `shell.js`, `css/app.css`): design system, light/dark theme, animations, router, API client, modals, drawers, toasts, tabs, rings, gauge, tables, charts, Ctrl+K search | ✅ |
| **Login page** (animated DecaPic logo, demo account buttons) | ✅ |
| **Dashboard** (KPI count-up, 6 charts, AI watchlist, overruns, activity feed from the audit trigger) | ✅ |
| **Projects list** (search, status chips, type, sort, paging) | ✅ |
| **Project detail** with 9 tabs: Overview, Scenes, Schedule (click a day → drawer, *Wrap scene* fires the trigger, *Log delay*), Cast & Crew, Budget (*Add expense*, *Move budget*, Approve/Close), Equipment, Issues, Post & Release | ✅ |
| Scene drawer (with AI actual-vs-predicted), Shoot-day drawer, Person drawer | ✅ |
| Role-based UI (crew cannot see Budget / AI / SQL Lab; reviewer is read-only; director cannot book expenses) | ✅ |

An automated jsdom test (login → dashboard → projects → all 9 project tabs → drawers → placeholders → role check) passes with 0 JavaScript errors.

## LEFT TO BUILD (frontend only - every backend call already exists, see `docs/API.md`)
Each page = one file in `frontend/js/`, a `DP.route(...)` line and a `<script>` tag in `index.html` placed **before** `pages_todo.js` (the first matching route wins, so your page replaces the placeholder).

| # | File | What the page should do | API to call | Reuse | Effort |
|---|---|---|---|---|---|
| 1 | `films.js` | Poster wall with search, genre and stage filters, paging | `GET /api/films`, `GET /api/meta` | `DP.filmCard`, `ui.pager`, `DP.searchBox` | small (≈60 lines) |
| 2 | `people.js` | Search + department / role / availability filters; cards; click → profile | `GET /api/people`, `DP.openPerson(id)` already exists | `ui.avatar`, `ui.pager` | small (≈70 lines) |
| 3 | `resources.js` | 4 tabs (equipment, vendors, locations, companies) each a searchable table | `GET /api/resources/{kind}` | `ui.tabs`, `ui.table` | small (≈80 lines) |
| 4 | `ai.js` → **AI Studio** | Tabs: **Scene Planner** (sliders → predicted shooting time, crew, equipment, gear units, "why" bars) · **Project Health** (risk + projected cost curve over shoot days, day scrubber, what-if sliders) · **Crew Match** (replay real hirings / suggest crew for a role) · **Model Lab** (metrics vs baseline, importance, scatter/ROC) | `/api/ai/*` | `ui.gauge`, `ui.impact`, `ui.slider`, `DP.chart` | **largest** (≈400 lines) |
| 4b | inside `ai.js` | `DP.healthPanel(el, projectId)` - the *AI Health* tab of every project already calls it (currently a placeholder message) | `GET /api/ai/health/{id}`, `POST /api/ai/health/whatif` | same | part of #4 |
| 5 | `lab.js` → **SQL Lab** | Tabs: table explorer (row counts, columns, FKs, sample rows) · query console (textarea, Run, result table, sample-query picker) · trigger playground (6 buttons, show the returned `steps`) · ER diagrams (`assets/er/*.png`) · views / triggers / procedures list | `/api/lab/*` | `ui.tabs`, `ui.table`, `.editor`, `.step` CSS | medium (≈250 lines) |

Suggested order: 5 (SQL Lab - best for your DBMS viva), 4 (AI Studio), then 1-3 (quick wins).

## Not verified / known limits (be honest in the viva)
* The UI was tested with an automated DOM test (jsdom), **not in a real browser** - I could not open one in my environment. Layout, colours and animations are written to the design system but may need small visual tweaks when you first open it in Chrome.
* Demo roles are **global** (a Producer sees all projects). In the database `user_roles` also links a role to one project / organisation; per-project filtering is a possible extension.
* Live predictions are computed from the **500-project sample** database. Features such as "previous projects of a candidate" are therefore smaller than in the original 5,000-project training data (the Crew-Match *replay* mode uses the original stored features and is the most accurate view).
* `budget_overrun` is the weakest model (R² ≈ 0.20) - see `ml/README_ML.md`. All data is synthetic.
* Model files were trained with scikit-learn 1.8.0. If your version differs and the AI pages show "re-train", run `python ml/train_models.py --user root --password ...` (≈10 s).
* Passwords of the demo accounts and the database app users are for a laptop demo only; change them in `07_decapic_app.sql` / `.env` for anything else.
