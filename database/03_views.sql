-- ============================================================================
--  03_views.sql : views = stored SELECT queries. They replace the derived
--  columns that were removed from the tables (3NF) and give ready-made reports.
--  Run after 01_schema.sql and 02_load_data.sql.
-- ============================================================================
USE cineops;

-- ---------------------------------------------------------------------------
-- A. BUSINESS VIEWS
-- ---------------------------------------------------------------------------

-- A1. Budget per project (replaces the removed budgets.allocated/spent/remaining columns)
CREATE OR REPLACE VIEW v_project_budget_summary AS
SELECT p.project_id, p.project_code, p.project_name, p.production_status,
       b.budget_id, b.status AS budget_status, b.total_budget, b.approved_amount, b.contingency_amount,
       SUM(bd.allocated_amount)                         AS allocated_amount,
       SUM(bd.spent_amount)                             AS spent_amount,
       SUM(bd.remaining_amount)                         AS remaining_amount,
       ROUND(100 * SUM(bd.spent_amount) / NULLIF(b.approved_amount, 0), 2) AS pct_of_approved_spent,
       SUM(bd.spent_amount) > b.approved_amount         AS is_over_budget
FROM projects p
JOIN budgets b            ON b.project_id = p.project_id
JOIN budget_departments bd ON bd.budget_id = b.budget_id
GROUP BY p.project_id, p.project_code, p.project_name, p.production_status,
         b.budget_id, b.status, b.total_budget, b.approved_amount, b.contingency_amount;

-- A2. Budget per cost category
CREATE OR REPLACE VIEW v_budget_category_status AS
SELECT p.project_id, p.project_code, bd.budget_department_id, bd.category,
       bd.allocated_amount, bd.spent_amount, bd.remaining_amount,
       ROUND(100 * bd.spent_amount / NULLIF(bd.allocated_amount, 0), 1) AS pct_used,
       CASE WHEN bd.remaining_amount < 0 THEN 'OVER BUDGET'
            WHEN bd.spent_amount >= 0.9 * bd.allocated_amount THEN 'WARNING' ELSE 'OK' END AS budget_state
FROM budget_departments bd
JOIN budgets b  ON b.budget_id = bd.budget_id
JOIN projects p ON p.project_id = b.project_id;

-- A3. One-line overview of every project
CREATE OR REPLACE VIEW v_project_overview AS
SELECT p.project_id, p.project_code, f.title AS film_title, p.project_type, p.production_status,
       ph.name AS lead_production_house,
       p.production_start, p.production_end, p.planned_completion_date, p.actual_completion_date,
       DATEDIFF(p.actual_completion_date, p.planned_completion_date) AS days_late,
       p.approved_budget,
       (SELECT COUNT(*) FROM scenes s      WHERE s.project_id = p.project_id)   AS scene_count,
       (SELECT COUNT(*) FROM shoot_days sd WHERE sd.project_id = p.project_id)  AS shoot_day_count,
       (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.project_id = p.project_id) AS total_expenses
FROM projects p
JOIN films f ON f.film_id = p.film_id
JOIN project_production_houses pph ON pph.project_id = p.project_id AND pph.company_role = 'Primary Producer'
JOIN production_houses ph ON ph.production_house_id = pph.production_house_id;

-- A4. Daily production report (replaces the removed daily_production_reports table)
CREATE OR REPLACE VIEW v_daily_production_report AS
SELECT sd.shoot_day_id, sd.project_id, sd.shoot_date, sd.day_number, l.name AS location_name,
       sd.planned_hours, sd.actual_hours, sd.weather_condition, sd.status, sd.delay_minutes AS day_delay_minutes,
       (SELECT COUNT(*) FROM shoot_day_scenes x WHERE x.shoot_day_id = sd.shoot_day_id)                          AS scenes_planned,
       (SELECT COUNT(*) FROM shoot_day_scenes x WHERE x.shoot_day_id = sd.shoot_day_id AND x.status='Completed') AS scenes_completed,
       (SELECT COUNT(*) FROM crew_assignments c WHERE c.shoot_day_id = sd.shoot_day_id AND c.attendance_status IN ('Present','Late')) AS crew_present,
       (SELECT COUNT(*) FROM crew_assignments c WHERE c.shoot_day_id = sd.shoot_day_id AND c.attendance_status = 'Absent')          AS crew_absent,
       (SELECT COUNT(*) FROM production_events ev WHERE ev.shoot_day_id = sd.shoot_day_id AND ev.event_type IN ('Equipment Failure','Technical Problem')) AS equipment_issues,
       (SELECT COUNT(*) FROM production_delays d WHERE d.shoot_day_id = sd.shoot_day_id)                          AS delays_today,
       (SELECT COALESCE(SUM(d.delay_minutes),0) FROM production_delays d WHERE d.shoot_day_id = sd.shoot_day_id)  AS delay_minutes_logged
FROM shoot_days sd
JOIN locations l ON l.location_id = sd.location_id;

-- A5. Crew utilisation per person
CREATE OR REPLACE VIEW v_crew_utilization AS
SELECT pe.person_id, pe.name, COUNT(*) AS days_booked,
       SUM(ca.attendance_status <> 'Absent')        AS days_worked,
       SUM(ca.hours_worked)                          AS total_hours,
       SUM(ca.overtime_hours)                        AS overtime_hours,
       ROUND(AVG(ca.daily_rate), 2)                  AS avg_daily_rate,
       COUNT(DISTINCT sd.project_id)                 AS projects_worked
FROM crew_assignments ca
JOIN people pe     ON pe.person_id = ca.person_id
JOIN shoot_days sd ON sd.shoot_day_id = ca.shoot_day_id
GROUP BY pe.person_id, pe.name;

-- A6. Delays by project and type
CREATE OR REPLACE VIEW v_delay_summary AS
SELECT p.project_id, p.project_code, d.delay_type,
       COUNT(*) AS delay_count, SUM(d.delay_minutes) AS total_minutes,
       ROUND(SUM(d.delay_minutes) / 60, 1) AS total_hours, SUM(d.cost_impact) AS total_cost_impact
FROM production_delays d
JOIN projects p ON p.project_id = d.project_id
GROUP BY p.project_id, p.project_code, d.delay_type;

-- A7. Cast list of every film
CREATE OR REPLACE VIEW v_cast_list AS
SELECT p.project_id, p.project_code, f.title AS film_title, ch.character_name, ch.character_type,
       pe.name AS actor, ca.assignment_type, ca.salary, ca.status
FROM cast_assignments ca
JOIN projects p    ON p.project_id = ca.project_id
JOIN films f       ON f.film_id = p.film_id
JOIN characters ch ON ch.character_id = ca.character_id
JOIN people pe     ON pe.person_id = ca.person_id;

-- A8. Equipment rented per project with usage in scenes
CREATE OR REPLACE VIEW v_equipment_usage AS
SELECT er.rental_id, er.project_id, e.equipment_name, e.category, er.start_date, er.end_date,
       DATEDIFF(er.end_date, er.start_date) + 1 AS rental_days, er.planned_cost, er.actual_cost,
       er.late_return, COUNT(se.scene_equipment_id) AS scenes_used_in
FROM equipment_rentals er
JOIN equipment e ON e.equipment_id = er.equipment_id
LEFT JOIN scene_equipment se ON se.rental_id = er.rental_id
GROUP BY er.rental_id, er.project_id, e.equipment_name, e.category, er.start_date, er.end_date,
         er.planned_cost, er.actual_cost, er.late_return;

-- A9. Film with all its genres in one column (GROUP_CONCAT - the 1NF fix in action)
CREATE OR REPLACE VIEW v_film_genres AS
SELECT f.film_id, f.title, f.release_year,
       GROUP_CONCAT(g.genre_name ORDER BY fg.is_primary DESC, g.genre_name SEPARATOR ', ') AS genres
FROM films f
LEFT JOIN film_genres fg ON fg.film_id = f.film_id
LEFT JOIN genres g       ON g.genre_id = fg.genre_id
GROUP BY f.film_id, f.title, f.release_year;

-- ---------------------------------------------------------------------------
-- B. MACHINE-LEARNING VIEWS  (training data = JOIN of core tables, no duplicated copies)
--    Every view has a `split` column (train / validation / test), one split per project.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_primary_genre AS
SELECT p.project_id, g.genre_name AS genre
FROM projects p
JOIN film_genres fg ON fg.film_id = p.film_id AND fg.is_primary = 1
JOIN genres g ON g.genre_id = fg.genre_id;

-- B1. schedule prediction: how long will a scene really take?
CREATE OR REPLACE VIEW v_ml_schedule_training AS
SELECT s.scene_id AS sample_id, s.scene_id, s.project_id,
       s.complexity_score AS scene_complexity,
       COALESCE(sc.cast_count, 0) AS cast_count,
       s.crew_required AS crew_count, s.equipment_required AS equipment_count,
       s.location_type, f.location_change, f.day_night,
       s.vfx_required, s.stunt_required, s.special_effects_required,
       s.dialogue_word_count AS dialogue_length, s.weather_dependent,
       f.historical_scene_duration, s.estimated_duration,
       s.actual_duration_hours,                       -- TARGET
       sp.split
FROM scenes s
JOIN ml_scene_features f ON f.scene_id = s.scene_id
JOIN ml_project_split sp ON sp.project_id = s.project_id
LEFT JOIN (SELECT scene_id, COUNT(*) AS cast_count FROM scene_characters GROUP BY scene_id) sc ON sc.scene_id = s.scene_id
WHERE s.actual_duration_hours IS NOT NULL;

-- B2. resource demand: how many crew / equipment units does a scene need?
CREATE OR REPLACE VIEW v_ml_resource_demand AS
SELECT s.scene_id AS sample_id, s.scene_id, s.project_id,
       s.complexity_score AS scene_complexity, pg.genre, s.location_type,
       COALESCE(sc.cast_count, 0) AS cast_count,
       s.vfx_required, s.stunt_required, s.night_shoot, s.weather_dependent AS weather_dependency,
       s.equipment_required AS equipment_required_count,   -- TARGET 1
       s.crew_required      AS crew_required_count,        -- TARGET 2
       sp.split
FROM scenes s
JOIN ml_scene_features f ON f.scene_id = s.scene_id
JOIN ml_project_split sp ON sp.project_id = s.project_id
LEFT JOIN v_primary_genre pg ON pg.project_id = s.project_id
LEFT JOIN (SELECT scene_id, COUNT(*) AS cast_count FROM scene_characters GROUP BY scene_id) sc ON sc.scene_id = s.scene_id;

-- B3. equipment demand: how many units of each equipment category does a scene need?
CREATE OR REPLACE VIEW v_ml_equipment_demand AS
SELECT s.scene_id * 10 + k.k AS sample_id, s.scene_id, s.project_id,
       s.complexity_score AS scene_complexity, s.location_type,
       CONCAT(s.interior_exterior, '-', f.day_night) AS shoot_type,
       s.vfx_required, s.stunt_required,
       k.category AS equipment_category,
       CASE k.k WHEN 1 THEN s.camera_units WHEN 2 THEN s.lighting_units WHEN 3 THEN s.audio_units ELSE s.grip_units END AS equipment_quantity,  -- TARGET
       sp.split
FROM scenes s
JOIN ml_scene_features f ON f.scene_id = s.scene_id
JOIN ml_project_split sp ON sp.project_id = s.project_id
CROSS JOIN (SELECT 1 AS k, 'Camera' AS category UNION ALL SELECT 2, 'Lighting'
            UNION ALL SELECT 3, 'Audio' UNION ALL SELECT 4, 'Grip') k;

-- B4. crew recommendation: is this candidate a good match for the required role?
CREATE OR REPLACE VIEW v_ml_crew_training AS
SELECT c.sample_id, c.requirement_id, c.project_id, c.role_id, d.department_name AS department,
       c.required_skill_level, c.experience_required, c.project_scale, pg.genre, c.project_country_id,
       c.candidate_person_id,
       CASE pr.skill_level WHEN 'Junior' THEN 1 WHEN 'Mid-level' THEN 2 WHEN 'Senior' THEN 3 ELSE 4 END AS candidate_skill_level,
       pr.experience_years AS candidate_experience_years,
       c.same_country, c.availability, c.previous_project_count, c.historical_assignment_count,
       c.label,                                       -- TARGET (1 = candidate was chosen)
       sp.split
FROM ml_crew_recommendation c
JOIN ml_project_split sp  ON sp.project_id = c.project_id
JOIN industry_roles r     ON r.role_id = c.role_id
JOIN departments d        ON d.department_id = r.department_id
LEFT JOIN person_roles pr ON pr.person_id = c.candidate_person_id AND pr.role_id = c.role_id
LEFT JOIN v_primary_genre pg ON pg.project_id = c.project_id;

-- B5. production risk (target = delay_occurred; delay_days / risk_category are alternative targets -> never use them as features)
CREATE OR REPLACE VIEW v_ml_risk_training AS
SELECT r.*, sp.split FROM ml_production_risk r JOIN ml_project_split sp ON sp.project_id = r.project_id;

-- B6. budget forecast (target = budget_overrun_pct; final_cost, budget_overrun, over_budget are outcomes -> never features)
CREATE OR REPLACE VIEW v_ml_budget_training AS
SELECT b.*, sp.split FROM ml_budget_forecast b JOIN ml_project_split sp ON sp.project_id = b.project_id;

-- B7. model results joined with real names (works once ml_predictions is filled)
CREATE OR REPLACE VIEW v_ml_prediction_results AS
SELECT m.model_name, m.task_type, p.sample_id, p.project_id, p.scene_id,
       p.actual_value, p.predicted_value, ROUND(p.predicted_value - p.actual_value, 4) AS error
FROM ml_predictions p JOIN ml_models m ON m.model_id = p.model_id;

SELECT CONCAT(COUNT(*), ' views created') AS result FROM information_schema.views WHERE table_schema = 'cineops';
