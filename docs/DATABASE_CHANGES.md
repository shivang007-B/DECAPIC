# CHANGES - from the original CineOps dataset to CineOps-MySQL (college edition)

This file lists **everything** that was changed and why. The reasoning follows the evaluation of your original database.

## Before / after

| | Original | Now |
|---|---:|---:|
| Tables | 54 (48 core + 6 ML) | **52** (45 core + 7 ML) |
| Views | 0 | **17** (10 business + 7 ML) |
| Rows | 4,415,020 (3.92 M core + 0.50 M ML) | **499,399** |
| CSV size | 404 MB | **36 MB** |
| Columns | 600 | **497** |
| Foreign keys | 114 (added after loading) | 104 (inside `CREATE TABLE`, `ON DELETE CASCADE` only where a row is purely a detail of its parent) |
| NOT NULL / UNIQUE / CHECK / DEFAULT | none (only PK + FK) | NOT NULL on every column that is never empty, **29 UNIQUE**, **32 CHECK**, defaults, ENUMs, generated columns |
| Indexes besides keys | 0 | 16 |
| Triggers / functions / procedures | 0 | 7 / 1 / 4 |
| Roles | 0 | 4 roles + 3 demo users |
| Dialect | PostgreSQL | **MySQL 8.0** |

Only 2 fewer tables on paper, because you asked to keep the ML part and I *added* tables that fix design problems (departments, genres, film_genres,
scene_equipment, and 4 small ML tables). The real simplification is in **rows (-89 %)**, **columns (600 -> 497; 31 redundant columns removed from tables that were kept)**, **redundancy** and **the 3 ML copy-tables that became views**.
If your teacher wants fewer tables, the best candidates to drop next are listed at the end.

## 1. Sampling
500 of the 5,000 projects were kept (seed 42, stratified by status: 340 Completed, 50 Post-production, 40 In Production, 40 Pre-production, 30 Development) together with **all** rows that belong to them.
Every one of the 104 foreign keys was verified to have 0 orphans before export, and again by MySQL while loading with foreign-key checks ON.
IDs were **not renumbered** (so a row can always be traced back to the original dataset); they are therefore not contiguous.
Small reference tables (countries, cities, languages, vendors, equipment, locations, distributors, production houses) were kept completely.

## 2. Table by table
| Original table | Rows (orig) | Decision | Rows (now) | Notes |
|---|---:|---|---:|---|
| asset_versions | 189,853 | **REMOVED** | - | version history of files; not needed for the project scope |
| audit_logs | 300,000 | kept | 5,000 | sampled to 5,000 rows; `timestamp` renamed `logged_at`; `user_id` nullable (system actions) |
| budget_departments | 50,000 | kept | 5,000 | `department` -> `category` (ENUM); `remaining_amount` now a GENERATED column; `spent_amount` re-synchronised with expenses |
| budgets | 5,000 | kept | 500 | removed derived `allocated_amount`, `spent_amount`, `remaining_amount` (see view `v_project_budget_summary`) |
| call_sheets | 96,540 | kept | 8,946 | removed `project_id` and `location_id` (derivable through `shoot_days`) |
| campaign_channels | 29,178 | **REMOVED** | - | marketing is outside "production management" |
| cast_assignments | 40,980 | kept | 4,376 |  |
| characters | 27,287 | kept | 2,931 |  |
| cities | 5,000 | kept | 5,000 |  |
| contracts | 39,587 | kept | 4,078 |  |
| countries | 250 | kept | 250 |  |
| crew_assignments | 438,258 | kept | 39,669 | removed `project_id` (derivable through `shoot_days`) |
| daily_production_reports | 88,532 | **REPLACED BY VIEW** | - | everything in it can be computed -> `v_daily_production_report` |
| distribution | 9,996 | kept | 1,493 | now also holds the release language/certificate that used to be in `releases` |
| distributors | 1,000 | kept | 1,000 |  |
| equipment | 3,000 | kept | 3,000 | `condition` renamed `equipment_condition` (reserved word in MySQL) |
| equipment_rentals | 78,650 | kept | 8,606 |  |
| expenses | 314,006 | kept | 26,668 |  |
| film_alternate_titles | 30,000 | **REMOVED** | - | IMDb catalogue detail, never used by any other table |
| film_people | 154,160 | **REMOVED** | - | duplicated project_people / cast_assignments (real IMDb credits, unrelated to the generated people) |
| films | 20,000 | kept | 500 | trimmed to films used by the 500 projects; removed `genres` (1NF), `imdb_id` (empty), `is_adult` (constant), `imputed_fields` (generator metadata) |
| industry_roles | 50 | kept | 50 | `department` text -> `department_id` FK |
| languages | 49 | kept | 49 |  |
| location_bookings | 34,112 | kept | 3,529 |  |
| locations | 5,000 | kept | 5,000 |  |
| marketing_campaigns | 9,726 | **REMOVED** | - | marketing is outside "production management" |
| media_assets | 174,843 | kept | 16,392 | removed `scene_id` (100 % NULL; also removed a circular FK) and constant `status` |
| ml_budget_forecast | 21,730 | kept | 1,700 | `split` moved to `ml_project_split` |
| ml_crew_recommendation | 100,000 | kept | 11,256 | `split` moved to `ml_project_split`; 5 look-up-able columns removed (re-joined in `v_ml_crew_training`) |
| ml_equipment_demand | 102,943 | **REPLACED BY VIEW** | - | unpivot of scenes.camera/lighting/audio/grip_units -> `v_ml_equipment_demand` |
| ml_production_risk | 23,080 | kept | 1,950 | `split` moved to `ml_project_split` |
| ml_resource_demand | 100,000 | **REPLACED BY VIEW** | - | 100 % copy of scenes columns -> `v_ml_resource_demand` |
| ml_schedule_prediction | 150,000 | **REPLACED BY VIEW** | - | 100 % copy of scenes columns -> `v_ml_schedule_training` |
| payments | 80,000 | kept | 8,160 |  |
| people | 30,000 | kept | 13,067 | ANONYMISED: names/emails regenerated; removed `imdb_nconst`, `death_year`, `is_synthetic_profile` |
| person_roles | 60,000 | kept | 30,490 |  |
| post_production | 5,000 | kept | 500 | `overall_progress` now GENERATED; removed `planned_completion`/`actual_completion` (duplicates of projects) |
| postproduction_tasks | 101,100 | kept | 10,643 | `department` -> `task_category` (ENUM) |
| production_delays | 65,892 | kept | 5,969 | `department` text -> `department_id` FK |
| production_events | 142,425 | kept | 12,981 | `department` text -> `department_id` FK |
| production_houses | 300 | kept | 300 |  |
| project_people | 82,623 | kept | 9,281 | removed `department` (always equal to the role's department) |
| project_production_houses | 6,899 | kept | 693 |  |
| projects | 5,000 | kept | 500 | removed `production_house_id` (exact duplicate of the Primary Producer row in project_production_houses); date columns TEXT -> DATE |
| releases | 14,996 | **MERGED** | - | same rows as `distribution` (same project/platform/territory/date) -> merged into `distribution` |
| scene_characters | 411,062 | kept | 44,800 |  |
| scenes | 237,677 | kept | 25,894 | removed `cast_count` (= count of scene_characters) |
| scripts | 5,000 | kept | 500 | removed `version` (always NULL) |
| shoot_day_scenes | 399,395 | kept | 41,733 |  |
| shoot_days | 97,203 | kept | 10,558 | `notes` (one constant text) -> `is_added_day` flag |
| system_roles | 10 | kept | 10 |  |
| user_roles | 14,628 | kept | 1,673 |  |
| users | 10,000 | kept | 1,624 | emails regenerated from the anonymised names |
| vendors | 3,000 | kept | 3,000 |  |

| New table | Rows | Why |
|---|---:|---|
| departments | 16 | lookup replacing repeated free-text department names (normalisation) |
| genres | 26 | lookup (1NF fix for the comma-separated `films.genres`) |
| film_genres | 819 | many-to-many films <-> genres |
| scene_equipment | 87,173 | bridge scene <-> rented equipment (generated; the original model had no link between scenes and equipment) |
| ml_project_split | 500 | one train/validation/test split per project (was repeated in every ML row) |
| ml_scene_features | 12,236 | the computed per-scene ML features that are not in `scenes` |
| ml_models | 7 | trained models + metrics |
| ml_predictions | 19,303 | test-set predictions of every model |

## 3. Data fixes
* **People anonymised.** The original used real IMDb names (e.g. famous directors) with invented emails, phone numbers and rates. Names/emails are now generated (deterministic, seed 42); `imdb_nconst` and `death_year` were removed. This also removes the "27 deceased people on crews" problem from the original quality report. Film titles are still real titles of public films.
* `projects` date columns were TEXT (`preproduction_start`, `production_start`, `production_end`, `postproduction_start`) -> `DATE`. `scene_characters.scene_id` / `shoot_day_scenes.scene_id` were INTEGER while `scenes.scene_id` was BIGINT -> all ids are now `INT` everywhere.
* `budget_departments.spent_amount` differed from `SUM(expenses)` in 27 of the 5,000 category rows of the sample -> re-computed. A trigger keeps it correct from now on.
* `contracts` / `payments`: exactly one of `person_id` / `vendor_id` is set (this was already true in the data; now it is a `CHECK`).
* Status / category columns are `ENUM`s (values taken from the **full** original dataset, not only from the sample).
* All integer columns are signed (no `UNSIGNED`), because unsigned subtraction raises "BIGINT UNSIGNED value is out of range" errors in ordinary queries.
* The "overlapping crew engagements" item of the original quality report was **not changed**: it concerns producers/heads working on several projects at once, which is normal. Double booking of a person on the same *date* does not exist (checked: 0 of 438,258 rows in the original).

## 4. Deliberate denormalisations (be ready to explain them)
* `budget_departments.spent_amount` - maintained by triggers `trg_expenses_ai/au/ad` (performance; `remaining_amount` is generated from it).
* `scenes.project_id`, `production_events.project_id`, `production_delays.project_id`, `expenses.project_id` - derivable through a parent table, kept because almost every report filters by project. Their consistency was verified at build time (100 % equal to the value reached through the parent).
* The three flat ML tables (`ml_production_risk`, `ml_budget_forecast`, `ml_crew_recommendation`) are feature stores by design.

## 5. Corrections to my earlier evaluation
While building this I re-checked some of my own statements against the data:
* I said `projects.production_house_id` "disagrees with the bridge table in 28 % of rows". **That was wrong** - I had compared against *all* bridge rows including partner companies. It is identical to the Primary Producer row in all 5,000 original projects. The column is still redundant, so it was removed, but there was no inconsistency.
* I estimated "roughly 35 tables". The real number after adding the normalisation tables and keeping ML is 45 core + 7 ML = 52.
* "3.9 M rows" referred to the 48 core tables only; with ML tables the original had 4.4 M.

## 6. Known limitations
* `scene_equipment` is **generated** by a deterministic rule (a scene's camera/lighting/audio/grip units are matched to an equipment rental of the same project and category that is active on the scene's shoot date). It makes the model complete but it is synthetic, like all the data. About 84 % of the scene requirements (camera 73 %, lighting 95 %, audio 82 %, grip 86 %) found a matching rental; the rest have no row.
* The ML `budget_overrun` model is weak on 500 projects (see `ml/README_ML.md`).
* Tested on **MySQL 8.0.46** (Linux). `CHECK` constraints need MySQL **8.0.16+** (older versions parse but ignore them); roles need 8.0+. Not tested on MariaDB or in MySQL Workbench itself (the scripts are plain SQL).
* The original generator is not included (it produces the original PostgreSQL design). `tools/build_dataset.py` reproduces *this* dataset from the original CSV files.

## 7. If your teacher wants even fewer tables
In order of least loss: `scene_equipment` (generated), `call_sheets` (a document, derivable from shoot_days), `audit_logs` (replace by the trigger-only version), `production_delays` (overlaps `production_events`), `ml_models` + `ml_predictions` (keep results in Python only).
