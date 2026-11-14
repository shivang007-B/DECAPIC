# DecaPic API reference

All endpoints live under `/api` and return JSON. Send the token from `POST /api/auth/login` as `Authorization: Bearer <token>` (the frontend does this in `DP.api()`).
Interactive docs while the server runs: **http://127.0.0.1:8000/docs** (Swagger UI) - the easiest way to see exact responses.

| Method | Path | Query / body | Needs |
|---|---|---|---|
| GET | `/api/ai/crew/requirement/{rid}` |  | ai |
| GET | `/api/ai/crew/requirements` | project_id | ai |
| GET | `/api/ai/crew/suggest` | project_id, role_id, required_skill, limit | ai |
| POST | `/api/ai/health/whatif` | body: project_id, day, overrides | ai |
| GET | `/api/ai/health/{pid}` |  | ai |
| GET | `/api/ai/models` |  | ai |
| POST | `/api/ai/scene/plan` | body: complexity_score, location_type, genre, interior_exterior, cast_count, vfx_required, stunt_required, special_effects_required, night_shoot, weather_dependent, dialogue_word_count, estimated_duration, location_change | ai |
| GET | `/api/ai/scene/{sid}` |  | ai |
| GET | `/api/ai/watchlist` | refresh | ai |
| GET | `/api/auth/demo-accounts` |  | public |
| POST | `/api/auth/login` | body: email, password | public |
| GET | `/api/auth/me` |  | any signed-in user |
| POST | `/api/budget/transfer` | body: from_id, to_id, amount | finance_write |
| POST | `/api/budgets/{bid}/status` | body: status | finance_write |
| GET | `/api/dashboard` |  | any signed-in user |
| GET | `/api/films` | q, genre_id, status, page, size | any signed-in user |
| GET | `/api/health` |  | public |
| POST | `/api/lab/demo` | body: scenario | lab |
| GET | `/api/lab/overview` |  | lab |
| POST | `/api/lab/query` | body: sql | lab |
| GET | `/api/lab/samples` |  | lab |
| GET | `/api/lab/table/{name}` | limit, offset | lab |
| GET | `/api/meta` |  | any signed-in user |
| GET | `/api/people` | q, department_id, role_id, availability, page, size | any signed-in user |
| GET | `/api/people/{pid}` |  | any signed-in user |
| GET | `/api/projects` | q, status, type, priority, sort, page, size | any signed-in user |
| GET | `/api/projects/{pid}` |  | any signed-in user |
| GET | `/api/projects/{pid}/budget` |  | finance_view |
| GET | `/api/projects/{pid}/equipment` |  | any signed-in user |
| POST | `/api/projects/{pid}/expenses` | body: budget_department_id, expense_category, description, amount | finance_write |
| GET | `/api/projects/{pid}/issues` |  | any signed-in user |
| GET | `/api/projects/{pid}/people` |  | any signed-in user |
| GET | `/api/projects/{pid}/post` |  | any signed-in user |
| GET | `/api/projects/{pid}/scenes` | q, status, page, size | any signed-in user |
| GET | `/api/projects/{pid}/schedule` |  | any signed-in user |
| GET | `/api/resources/{kind}` | q, category, page, size | any signed-in user |
| GET | `/api/scenes/{sid}` |  | any signed-in user |
| GET | `/api/search` | q | any signed-in user |
| POST | `/api/shoot-day-scenes/{sid}/wrap` | body: delay_minutes | schedule_write |
| GET | `/api/shoot-days/{did}` |  | any signed-in user |
| POST | `/api/shoot-days/{did}/delays` | body: delay_type, cause, delay_minutes, severity, department_id, cost_impact | schedule_write |

## Roles and permissions

| Role | view | finance_view | finance_write | schedule_write | ai | lab |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Super Admin | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Producer | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Finance Manager | ✔ | ✔ | ✔ |  | ✔ | ✔ |
| Production Manager | ✔ | ✔ |  | ✔ | ✔ | ✔ |
| Director | ✔ |  |  | ✔ | ✔ | ✔ |
| Post-production | ✔ |  |  |  | ✔ | ✔ |
| Distribution | ✔ |  |  |  | ✔ | ✔ |
| Client | ✔ | ✔ |  |  | ✔ | ✔ |
| Authorised Reviewer | ✔ | ✔ |  |  | ✔ | ✔ |
| Crew Member | ✔ |  |  |  |  |  |

`GET /api/auth/me` returns the user with a `permissions` list; the frontend hides what a role cannot use with `DP.can("finance_write")` etc., and the backend enforces it again (HTTP 403).

## Demo logins (password for all: `Decapic@2026`)

admin@ · producer@ · director@ · manager@ · finance@ · crew@ · reviewer@  `decapic.com`

## Response shapes worth knowing

* `GET /api/ai/models` -> `{models:[{name,title,task,metrics:{test,validation,baseline},importance:[{feature,importance}],feature_meta,lab:{scatter|roc|confusion|hist|error_hist}}], crew_accuracy}`
* `GET /api/ai/health/{project_id}` -> `{curve:[{day,date,risk,overrun_pct,projected_cost,budget_used,progress}], features:[...one dict per day...], actual:{spent,overrun_pct}}`; `POST /api/ai/health/whatif {project_id, day, overrides:{feature:value}}` -> `{risk, overrun_pct, projected_cost, explain_risk, explain_budget}`
* `POST /api/ai/scene/plan {complexity_score, location_type, genre, ...}` -> `{duration_hours, crew, equipment, units:{Camera,Lighting,Audio,Grip}, explain_duration, explain_crew}`; `GET /api/ai/scene/{id}` -> `{scene, prediction}`
* `GET /api/ai/crew/requirement/{id}` -> candidates with `score` and `hired` (replay of a real hiring decision); `GET /api/ai/crew/suggest?project_id=&role_id=` -> ranked candidates from the live database
* `POST /api/lab/demo {scenario}` -> `{steps:[{label,value,bad?}], rolled_back:true}` (nothing is ever saved)
* Errors: `{"detail": "message"}` with status 400/401/403/404/409 (409 = a database rule such as a trigger or CHECK rejected the change; the message is safe to show to the user).
