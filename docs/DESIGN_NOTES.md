# Design notes - normalisation, constraints and viva preparation

## 1. Domain in one paragraph
A **production house** runs several **projects**. Each project makes one **film** (with genres and characters), has one **script** split into **scenes**,
a **budget** split into cost categories against which **expenses** are booked, **contracts** and **payments** with people and vendors, rented **equipment**,
booked **locations**, a **shooting schedule** (shoot days -> scenes, crew attendance, call sheets), an on-set **incident/delay log**,
**post-production** work and **distribution** deals. Users with roles operate the system; an ML layer predicts durations, resource needs, delays and budget overruns.

## 2. Relationship types (for the ER diagram)
| Type | Examples |
|---|---|
| 1 : 1 | projects - scripts (`UNIQUE project_id`), projects - post_production (`UNIQUE project_id`); projects - films is 1 : 1 in the data (one film per project) but not enforced with a UNIQUE key |
| 1 : N | projects -> budgets / expenses / scenes / shoot_days; budgets -> budget_departments; production_events -> production_delays; countries -> cities |
| M : N (junction table) | films <-> genres (`film_genres`), scenes <-> characters (`scene_characters`), shoot_days <-> scenes (`shoot_day_scenes`), scenes <-> equipment rentals (`scene_equipment`), projects <-> production_houses (`project_production_houses`), people <-> industry_roles (`person_roles`), people <-> shoot_days (`crew_assignments`), people <-> characters (`cast_assignments`) |
| Either-or (exclusive arc) | contracts and payments belong to **a person XOR a vendor** (CHECK `(person_id IS NOT NULL) + (vendor_id IS NOT NULL) = 1`) |

ER diagrams: `docs/er/ER_overview.png` plus five detailed diagrams. They are generated from the live schema.

## 3. Normalisation story (use this in the report)
**1NF - atomic values, no repeating groups**
* `films.genres` held values such as `Crime,Thriller` -> split into `genres` + `film_genres`.

**2NF - no partial dependency on a composite key**
* Junction tables (`film_genres`, `scene_characters`, ...) carry only attributes that depend on the *whole* relationship (e.g. `is_primary`, `quantity`, `importance`).

**3NF - no transitive dependency / no derived data**
| Problem in the original | Fix |
|---|---|
| `department` repeated as free text in 4 tables | `departments` lookup + `department_id` FK |
| `project_people.department` determined by `role_id` | column removed (role -> department) |
| `projects.production_house_id` duplicated the Primary Producer row of the bridge table | column removed |
| `crew_assignments.project_id`, `call_sheets.project_id/location_id` determined by `shoot_day_id` | columns removed |
| `scenes.cast_count` = count of `scene_characters` | column removed |
| `budgets.allocated/spent/remaining` = sums of `budget_departments` | removed; view `v_project_budget_summary` |
| `budget_departments.remaining_amount`, `post_production.overall_progress` | MySQL **generated columns** |
| `daily_production_reports` fully computable | table replaced by view `v_daily_production_report` |
| `releases` and `distribution` stored the same facts | merged |

**Deliberate denormalisation** (always justify it): `budget_departments.spent_amount` (trigger-maintained running total), and `project_id` repeated in `scenes`, `expenses`, `production_events`, `production_delays` for fast per-project reporting. See `CHANGES.md` section 4.

## 4. Integrity constraints used
| Kind | Count | Examples |
|---|---:|---|
| PRIMARY KEY | 52 | surrogate `AUTO_INCREMENT` ids; composite PK on `film_genres` |
| FOREIGN KEY | 104 | `ON DELETE CASCADE` only for pure detail rows (scene_characters, shoot_day_scenes, film_genres, budget_departments, ...); everything else `RESTRICT` (default) |
| UNIQUE | 29 | `project_code`, `users.email`, `equipment.serial_number`, `(project_id, version)` for budgets, `(person_id, shoot_day_id)` for crew |
| CHECK | 32 | date order (`start_date <= end_date`), amounts >= 0, rating 0-5, progress 0-100, complexity 1-10, person XOR vendor |
| NOT NULL | every column that is never empty in the data | |
| DEFAULT | statuses, booleans, `created_at` | |
| ENUM | 69 columns | statuses and types with <= 20 values |
| Generated columns | 2 | `remaining_amount`, `overall_progress` |
| Triggers | 7 | block expenses on closed budgets, keep `spent_amount` in sync, audit budget changes, auto-compute scene delay, cap payments at contract value |

**Why ENUM and not lookup tables for statuses?** ENUM is simple and readable for fixed small value sets. The trade-off: adding a value needs `ALTER TABLE`. Values that behave like *entities* (departments, genres, countries, languages) are real tables.

## 5. Where to demonstrate each DBMS topic
| Topic | File / object |
|---|---|
| DDL, constraints, indexes | `01_schema.sql` |
| Bulk loading | `02_load_data.sql` |
| Views | `03_views.sql` (`v_project_budget_summary`, `v_daily_production_report`, ...) |
| Triggers | `04_...sql` - try: insert an expense with `CALL sp_add_expense(...)` and watch `spent_amount` change |
| Stored function / procedures / cursor | `fn_budget_used_pct`, `sp_project_summary`, `sp_overspent_categories` |
| **Transaction / ACID** | `sp_transfer_budget` (rollback on error) and section G of `06_sample_queries.sql` |
| Security / DCL | `05_security_roles.sql` - log in as `demo_viewer` and try a `DELETE` |
| Joins, aggregates, subqueries, CTE, windows | `06_sample_queries.sql` Q1-Q27 |
| Indexing / query plans | Q28 (`EXPLAIN` with and without `idx_expenses_expense_date`) |
| Data mining / ML | `ml/`, Q29-Q30 |

## 6. Probable viva questions
* *Why is `remaining_amount` a generated column and `spent_amount` a real column?* Remaining is a pure function of two columns of the same row; spent depends on rows of another table (expenses), so it needs a trigger.
* *What happens if I delete a project?* `RESTRICT` - MySQL refuses while child rows exist (budgets, scenes, ...). Only detail rows (e.g. `film_genres` of a film) cascade.
* *How do you guarantee a contract has either a person or a vendor?* CHECK constraint (exclusive arc).
* *Which normal form is the schema in?* 3NF with the documented denormalisations (section 3).
* *Why split the ML datasets by project?* Rows of one film are highly correlated; a random row split would leak information between train and test.
* *Why are the three ML tables now views?* They duplicated `scenes` columns exactly; views avoid redundancy and inconsistency (this is normalisation applied to the ML layer).

## 7. Suggested report outline
1. Problem statement and scope - 2. Entities and ER diagram (`docs/er`) - 3. Relational schema and data dictionary (`docs/DATA_DICTIONARY.md`) -
4. Normalisation (section 3 above) - 5. Implementation: DDL, constraints, indexes - 6. Views, triggers, procedures - 7. Queries and results -
8. Security - 9. ML extension and honest evaluation - 10. Limitations (synthetic, sampled, ML weak spots) and future work.
