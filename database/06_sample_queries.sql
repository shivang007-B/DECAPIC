-- ============================================================================
--  06_sample_queries.sql : 30 ready-to-demo queries, grouped by DBMS topic
--  Every query was tested on the loaded database. IDs are looked up with
--  subqueries, so nothing is hard-coded.
-- ============================================================================
USE cineops;

-- ############################ A. BASICS (SELECT, WHERE, GROUP BY, ORDER BY) ###############################

-- Q1. How many projects are in each production status?
SELECT production_status, COUNT(*) AS projects
FROM projects GROUP BY production_status ORDER BY projects DESC;

-- Q2. The 10 projects with the highest approved budget
SELECT project_code, project_name, approved_budget
FROM projects ORDER BY approved_budget DESC LIMIT 10;

-- Q3. Scenes that need VFX and stunts and are weather dependent
SELECT scene_id, heading, location_type, complexity_score
FROM scenes WHERE vfx_required = 1 AND stunt_required = 1 AND weather_dependent = 1
ORDER BY complexity_score DESC LIMIT 15;

-- Q4. Films with all their genres in one column (uses the film_genres junction table)
SELECT * FROM v_film_genres WHERE genres LIKE '%Thriller%' ORDER BY release_year DESC LIMIT 10;

-- ############################ B. JOINS #######################################################################

-- Q5. Cast list of the most expensive project (4-table join)
SELECT p.project_code, ch.character_name, pe.name AS actor, ca.assignment_type, ca.salary
FROM cast_assignments ca
JOIN projects p    ON p.project_id = ca.project_id
JOIN characters ch ON ch.character_id = ca.character_id
JOIN people pe     ON pe.person_id = ca.person_id
WHERE p.project_id = (SELECT project_id FROM projects ORDER BY approved_budget DESC LIMIT 1)
ORDER BY ca.salary DESC;

-- Q6. Key crew of a project with their department (join through industry_roles -> departments)
SELECT d.department_name, r.role_name, pe.name, pp.employment_type, pp.daily_rate
FROM project_people pp
JOIN people pe         ON pe.person_id = pp.person_id
JOIN industry_roles r  ON r.role_id = pp.role_id
JOIN departments d     ON d.department_id = r.department_id
WHERE pp.project_id = (SELECT project_id FROM shoot_days GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1)
ORDER BY d.department_name, r.role_name;

-- Q7. LEFT JOIN / anti-join: projects that have NO distribution record
SELECT p.project_code, p.project_name, p.production_status
FROM projects p LEFT JOIN distribution d ON d.project_id = p.project_id
WHERE d.distribution_id IS NULL ORDER BY p.project_code LIMIT 15;

-- Q8. Lead production house and partners of every project (self-explaining bridge table)
SELECT p.project_code, ph.name AS company, pph.company_role, pph.ownership_percentage
FROM project_production_houses pph
JOIN projects p ON p.project_id = pph.project_id
JOIN production_houses ph ON ph.production_house_id = pph.production_house_id
WHERE pph.project_id IN (SELECT project_id FROM project_production_houses GROUP BY project_id HAVING COUNT(*) >= 3)
ORDER BY p.project_code, pph.ownership_percentage DESC LIMIT 20;

-- Q9. Scenes, the equipment rented for them and the vendor (scene_equipment bridge, 5 tables)
SELECT s.scene_id, s.heading, e.category, e.equipment_name, se.quantity, v.vendor_name
FROM scene_equipment se
JOIN scenes s             ON s.scene_id = se.scene_id
JOIN equipment_rentals er ON er.rental_id = se.rental_id
JOIN equipment e          ON e.equipment_id = er.equipment_id
JOIN vendors v            ON v.vendor_id = er.vendor_id
WHERE s.project_id = (SELECT project_id FROM scenes GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1)
ORDER BY s.scene_id LIMIT 20;

-- ############################ C. AGGREGATES, GROUP BY ... HAVING ###########################################

-- Q10. Delay minutes per department; only departments with more than 5,000 minutes
SELECT d.department_name, COUNT(*) AS delays, SUM(x.delay_minutes) AS total_minutes, ROUND(AVG(x.delay_minutes),1) AS avg_minutes
FROM production_delays x JOIN departments d ON d.department_id = x.department_id
GROUP BY d.department_name HAVING SUM(x.delay_minutes) > 5000 ORDER BY total_minutes DESC;

-- Q11. Average overtime per job role (crew attendance)
SELECT r.role_name, COUNT(*) AS days, ROUND(AVG(ca.overtime_hours),2) AS avg_overtime_h, ROUND(AVG(ca.daily_rate),2) AS avg_rate
FROM crew_assignments ca JOIN industry_roles r ON r.role_id = ca.role_id
GROUP BY r.role_name ORDER BY avg_overtime_h DESC LIMIT 10;

-- Q12. Budget discipline per cost category (all projects)
SELECT category, ROUND(AVG(100*spent_amount/allocated_amount),1) AS avg_pct_spent,
       SUM(remaining_amount < 0) AS categories_over_budget, COUNT(*) AS total
FROM budget_departments GROUP BY category ORDER BY avg_pct_spent DESC;

-- Q13. Top 10 vendors by equipment rental spending
SELECT v.vendor_name, v.vendor_type, COUNT(*) AS rentals, SUM(er.actual_cost) AS total_cost
FROM equipment_rentals er JOIN vendors v ON v.vendor_id = er.vendor_id
GROUP BY v.vendor_id, v.vendor_name, v.vendor_type ORDER BY total_cost DESC LIMIT 10;

-- Q14. Revenue (deal value) by platform and year of release
SELECT platform, YEAR(release_date) AS year, COUNT(*) AS deals, ROUND(SUM(deal_value)/1e6,1) AS deal_value_millions
FROM distribution WHERE deal_value IS NOT NULL
GROUP BY platform, YEAR(release_date) ORDER BY year DESC, deal_value_millions DESC LIMIT 15;

-- ############################ D. SUBQUERIES, EXISTS, CTE ###################################################

-- Q15. Projects that spent more than their approved budget (uses a view)
SELECT project_code, project_name, approved_amount, spent_amount, pct_of_approved_spent
FROM v_project_budget_summary WHERE is_over_budget = 1 ORDER BY pct_of_approved_spent DESC LIMIT 10;

-- Q16. In the biggest project: scenes longer than the average scene of the SAME location type (correlated subquery)
SELECT s.scene_id, s.location_type, s.actual_duration_hours
FROM scenes s
WHERE s.project_id = (SELECT project_id FROM scenes GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1)
  AND s.actual_duration_hours > (SELECT AVG(x.actual_duration_hours) FROM scenes x WHERE x.location_type = s.location_type)
ORDER BY s.actual_duration_hours DESC LIMIT 10;

-- Q17. People who worked both as cast and as crew (EXISTS)
SELECT pe.person_id, pe.name
FROM people pe
WHERE EXISTS (SELECT 1 FROM cast_assignments c WHERE c.person_id = pe.person_id)
  AND EXISTS (SELECT 1 FROM crew_assignments w WHERE w.person_id = pe.person_id)
ORDER BY pe.name LIMIT 10;

-- Q18. Actors who played in more than 3 different projects (HAVING + DISTINCT)
SELECT pe.name, COUNT(DISTINCT ca.project_id) AS projects, SUM(ca.salary) AS total_salary
FROM cast_assignments ca JOIN people pe ON pe.person_id = ca.person_id
GROUP BY pe.person_id, pe.name HAVING COUNT(DISTINCT ca.project_id) > 3 ORDER BY projects DESC, total_salary DESC LIMIT 10;

-- Q19. CTE: budget overrun per production house (WITH ... AS)
WITH lead_house AS (
    SELECT pph.project_id, pph.production_house_id FROM project_production_houses pph WHERE pph.company_role = 'Primary Producer'
), overrun AS (
    SELECT l.production_house_id, SUM(b.spent_amount - b.approved_amount) AS net_overrun, COUNT(*) AS projects
    FROM lead_house l JOIN v_project_budget_summary b ON b.project_id = l.project_id GROUP BY l.production_house_id
)
SELECT ph.name, o.projects, ROUND(o.net_overrun/1e6, 2) AS net_overrun_millions
FROM overrun o JOIN production_houses ph ON ph.production_house_id = o.production_house_id
ORDER BY o.net_overrun DESC LIMIT 10;

-- Q20. UNION: everybody (cast OR vendor contracts) with an active contract
SELECT 'Person' AS party_type, pe.name AS party, c.contract_value FROM contracts c JOIN people pe ON pe.person_id = c.person_id WHERE c.status = 'Active'
UNION ALL
SELECT 'Vendor', v.vendor_name, c.contract_value FROM contracts c JOIN vendors v ON v.vendor_id = c.vendor_id WHERE c.status = 'Active'
ORDER BY contract_value DESC LIMIT 10;

-- ############################ E. WINDOW FUNCTIONS ##########################################################

-- Q21. Rank projects by budget overrun inside each production status
SELECT * FROM (
  SELECT production_status, project_code, pct_of_approved_spent,
         RANK() OVER (PARTITION BY production_status ORDER BY pct_of_approved_spent DESC) AS rnk
  FROM v_project_budget_summary) t
WHERE rnk <= 3 ORDER BY production_status, rnk;

-- Q22. Running total of expenses of one project by date
SELECT expense_date, expense_category, amount,
       SUM(amount) OVER (ORDER BY expense_date, expense_id) AS running_total
FROM expenses
WHERE project_id = (SELECT project_id FROM expenses GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1)
ORDER BY expense_date, expense_id LIMIT 15;

-- Q23. LAG: day-to-day change of delay minutes on the shoot days of a project
SELECT shoot_date, day_number, delay_minutes,
       delay_minutes - LAG(delay_minutes) OVER (ORDER BY shoot_date) AS change_vs_previous_day
FROM shoot_days
WHERE project_id = (SELECT project_id FROM shoot_days GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1)
ORDER BY shoot_date LIMIT 15;

-- Q24. NTILE: budget quartiles - average duration of the shoot per quartile
SELECT quartile, COUNT(*) AS projects, ROUND(AVG(approved_budget)/1e6,1) AS avg_budget_m,
       ROUND(AVG(DATEDIFF(production_end, production_start)),0) AS avg_shoot_days
FROM (SELECT approved_budget, production_start, production_end, NTILE(4) OVER (ORDER BY approved_budget) AS quartile FROM projects) t
GROUP BY quartile ORDER BY quartile;

-- Q25. CASE pivot: number of delays per type and year
SELECT YEAR(sd.shoot_date) AS year,
       SUM(d.delay_type = 'Weather')   AS weather,
       SUM(d.delay_type = 'Equipment') AS equipment,
       SUM(d.delay_type = 'Cast')      AS cast_issues,
       SUM(d.delay_type = 'Technical') AS technical,
       COUNT(*) AS all_delays
FROM production_delays d JOIN shoot_days sd ON sd.shoot_day_id = d.shoot_day_id
GROUP BY YEAR(sd.shoot_date) ORDER BY year DESC LIMIT 8;

-- ############################ F. VIEWS, FUNCTIONS, PROCEDURES ##############################################

-- Q26. The daily production report view (replaces the removed table)
SELECT * FROM v_daily_production_report
WHERE project_id = (SELECT project_id FROM shoot_days GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1)
ORDER BY shoot_date LIMIT 5;

-- Q27. Stored function + procedure
SELECT project_code, fn_budget_used_pct(project_id) AS pct_used FROM projects ORDER BY pct_used DESC LIMIT 5;
CALL sp_project_summary((SELECT project_id FROM shoot_days GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1));

-- ############################ G. TRANSACTION DEMO (rolled back - leaves data unchanged) ####################
START TRANSACTION;
    SET @bd = (SELECT bd.budget_department_id FROM budget_departments bd JOIN budgets b ON b.budget_id = bd.budget_id WHERE b.status <> 'Closed' LIMIT 1);
    SELECT spent_amount AS spent_before FROM budget_departments WHERE budget_department_id = @bd;
    CALL sp_add_expense(@bd, 'Catering', 'transaction demo', 25000, (SELECT person_id FROM people LIMIT 1));
    SELECT spent_amount AS spent_after_trigger FROM budget_departments WHERE budget_department_id = @bd;
ROLLBACK;
SELECT spent_amount AS spent_after_rollback FROM budget_departments WHERE budget_department_id = @bd;

-- ############################ H. PERFORMANCE: INDEXES AND EXPLAIN ##########################################
-- Q28. With the index idx_expenses_expense_date the optimiser reads only the matching range ...
EXPLAIN SELECT SUM(amount) FROM expenses WHERE expense_date BETWEEN '2016-01-01' AND '2016-03-31';
-- ... without it MySQL must scan the whole table (compare the "type" and "rows" columns)
EXPLAIN SELECT SUM(amount) FROM expenses IGNORE INDEX (idx_expenses_expense_date) WHERE expense_date BETWEEN '2016-01-01' AND '2016-03-31';

-- ############################ I. MACHINE LEARNING RESULTS (after running ml/train_models.py) ###############
-- Q29. Quality of every trained model
SELECT model_name, task_type, algorithm, n_train, n_test, metric_1_name, ROUND(metric_1_value,3) AS m1, metric_2_name, ROUND(metric_2_value,3) AS m2
FROM ml_models ORDER BY model_id;

-- Q30. Projects the risk model considers most likely to be delayed (test split) vs what really happened
SELECT p.project_code, ROUND(AVG(r.predicted_value),2) AS avg_predicted_delay_probability, ROUND(AVG(r.actual_value),2) AS actual_delay_rate, COUNT(*) AS snapshots
FROM v_ml_prediction_results r JOIN projects p ON p.project_id = r.project_id
WHERE r.model_name = 'production_risk_delay'
GROUP BY p.project_id, p.project_code ORDER BY avg_predicted_delay_probability DESC LIMIT 10;
