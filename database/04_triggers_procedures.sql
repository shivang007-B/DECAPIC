-- ============================================================================
--  04_triggers_procedures.sql : business rules inside the database
--  Triggers, a stored function, stored procedures (incl. a transaction and a cursor)
--  Run in the mysql client or MySQL Workbench (the DELIMITER lines are handled by both).
-- ============================================================================
USE cineops;
DELIMITER $$

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

-- T1. BEFORE INSERT on expenses: no new expenses on a closed budget
DROP TRIGGER IF EXISTS trg_expenses_bi $$
CREATE TRIGGER trg_expenses_bi BEFORE INSERT ON expenses
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(20);
    SELECT b.status INTO v_status
      FROM budget_departments bd JOIN budgets b ON b.budget_id = bd.budget_id
     WHERE bd.budget_department_id = NEW.budget_department_id;
    IF v_status = 'Closed' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Budget is closed: expense rejected';
    END IF;
END $$

-- T2-T4. keep budget_departments.spent_amount in sync with the expenses table
--        (spent_amount is a deliberate, trigger-maintained denormalisation; remaining_amount is a generated column)
DROP TRIGGER IF EXISTS trg_expenses_ai $$
CREATE TRIGGER trg_expenses_ai AFTER INSERT ON expenses
FOR EACH ROW
BEGIN
    UPDATE budget_departments SET spent_amount = spent_amount + NEW.amount
     WHERE budget_department_id = NEW.budget_department_id;
END $$

DROP TRIGGER IF EXISTS trg_expenses_au $$
CREATE TRIGGER trg_expenses_au AFTER UPDATE ON expenses
FOR EACH ROW
BEGIN
    IF OLD.amount <> NEW.amount OR OLD.budget_department_id <> NEW.budget_department_id THEN
        UPDATE budget_departments SET spent_amount = spent_amount - OLD.amount
         WHERE budget_department_id = OLD.budget_department_id;
        UPDATE budget_departments SET spent_amount = spent_amount + NEW.amount
         WHERE budget_department_id = NEW.budget_department_id;
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_expenses_ad $$
CREATE TRIGGER trg_expenses_ad AFTER DELETE ON expenses
FOR EACH ROW
BEGIN
    UPDATE budget_departments SET spent_amount = spent_amount - OLD.amount
     WHERE budget_department_id = OLD.budget_department_id;
END $$

-- T5. AFTER UPDATE on budgets: write an audit-trail row (who = @app_user_id, set by the application; NULL = system)
DROP TRIGGER IF EXISTS trg_budgets_au $$
CREATE TRIGGER trg_budgets_au AFTER UPDATE ON budgets
FOR EACH ROW
BEGIN
    IF OLD.status <> NEW.status OR OLD.approved_amount <> NEW.approved_amount THEN
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, logged_at)
        VALUES (@app_user_id, 'UPDATE', 'budget', NEW.budget_id,
                CONCAT('{"status": "', OLD.status, '"}'),
                CONCAT('{"status": "', NEW.status, '", "approved": ', NEW.approved_amount, '}'),
                '127.0.0.1', NOW());
    END IF;
END $$

-- T6. BEFORE UPDATE on shoot_day_scenes: compute the delay automatically when a scene is wrapped
DROP TRIGGER IF EXISTS trg_shoot_day_scenes_bu $$
CREATE TRIGGER trg_shoot_day_scenes_bu BEFORE UPDATE ON shoot_day_scenes
FOR EACH ROW
BEGIN
    IF NEW.actual_end IS NOT NULL AND NEW.planned_end IS NOT NULL THEN
        SET NEW.delay_minutes = GREATEST(0, TIMESTAMPDIFF(MINUTE, NEW.planned_end, NEW.actual_end));
        SET NEW.status = 'Completed';
    END IF;
END $$

-- T7. BEFORE INSERT on payments: total payments may not exceed the contract value
DROP TRIGGER IF EXISTS trg_payments_bi $$
CREATE TRIGGER trg_payments_bi BEFORE INSERT ON payments
FOR EACH ROW
BEGIN
    DECLARE v_paid DECIMAL(15,2);
    DECLARE v_value DECIMAL(15,2);
    IF NEW.contract_id IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_paid  FROM payments  WHERE contract_id = NEW.contract_id;
        SELECT contract_value           INTO v_value FROM contracts WHERE contract_id = NEW.contract_id;
        IF v_paid + NEW.amount > v_value THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment would exceed the contract value';
        END IF;
    END IF;
END $$

-- ---------------------------------------------------------------------------
-- STORED FUNCTION
-- ---------------------------------------------------------------------------
-- F1. percentage of the approved budget already spent by a project
DROP FUNCTION IF EXISTS fn_budget_used_pct $$
CREATE FUNCTION fn_budget_used_pct(p_project_id INT) RETURNS DECIMAL(7,2)
    DETERMINISTIC READS SQL DATA
BEGIN
    DECLARE v_pct DECIMAL(7,2);
    SELECT ROUND(100 * SUM(bd.spent_amount) / NULLIF(MAX(b.approved_amount), 0), 2) INTO v_pct
      FROM budgets b JOIN budget_departments bd ON bd.budget_id = b.budget_id
     WHERE b.project_id = p_project_id;
    RETURN v_pct;
END $$

-- ---------------------------------------------------------------------------
-- STORED PROCEDURES
-- ---------------------------------------------------------------------------
-- P1. one-call project dashboard (returns 3 result sets)
DROP PROCEDURE IF EXISTS sp_project_summary $$
CREATE PROCEDURE sp_project_summary(IN p_project_id INT)
BEGIN
    SELECT * FROM v_project_overview        WHERE project_id = p_project_id;
    SELECT * FROM v_budget_category_status  WHERE project_id = p_project_id ORDER BY spent_amount DESC;
    SELECT delay_type, delay_count, total_minutes, total_cost_impact
      FROM v_delay_summary WHERE project_id = p_project_id ORDER BY total_minutes DESC;
END $$

-- P2. TRANSACTION demo: move budget between two categories of the SAME budget (all-or-nothing)
DROP PROCEDURE IF EXISTS sp_transfer_budget $$
CREATE PROCEDURE sp_transfer_budget(IN p_from INT, IN p_to INT, IN p_amount DECIMAL(15,2))
BEGIN
    DECLARE v_budget_from INT; DECLARE v_budget_to INT; DECLARE v_free DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;                       -- any error undoes both updates
        RESIGNAL;
    END;
    IF p_amount <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Amount must be positive';
    END IF;
    START TRANSACTION;
        SELECT budget_id, remaining_amount INTO v_budget_from, v_free
          FROM budget_departments WHERE budget_department_id = p_from FOR UPDATE;   -- row lock
        SELECT budget_id INTO v_budget_to
          FROM budget_departments WHERE budget_department_id = p_to FOR UPDATE;
        IF v_budget_from <> v_budget_to THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Categories belong to different budgets';
        END IF;
        IF v_free < p_amount THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Not enough unspent budget in the source category';
        END IF;
        UPDATE budget_departments SET allocated_amount = allocated_amount - p_amount WHERE budget_department_id = p_from;
        UPDATE budget_departments SET allocated_amount = allocated_amount + p_amount WHERE budget_department_id = p_to;
    COMMIT;
END $$

-- P3. CURSOR demo: list the over-budget categories of a project and total the overspend
DROP PROCEDURE IF EXISTS sp_overspent_categories $$
CREATE PROCEDURE sp_overspent_categories(IN p_project_id INT)
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_cat VARCHAR(40); DECLARE v_over DECIMAL(15,2); DECLARE v_total DECIMAL(15,2) DEFAULT 0;
    DECLARE cur CURSOR FOR
        SELECT category, -remaining_amount FROM v_budget_category_status
         WHERE project_id = p_project_id AND remaining_amount < 0;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
    DROP TEMPORARY TABLE IF EXISTS tmp_overspent;
    CREATE TEMPORARY TABLE tmp_overspent (category VARCHAR(40), overspend DECIMAL(15,2));
    OPEN cur;
    loop_cats: LOOP
        FETCH cur INTO v_cat, v_over;
        IF done = 1 THEN LEAVE loop_cats; END IF;
        INSERT INTO tmp_overspent VALUES (v_cat, v_over);
        SET v_total = v_total + v_over;
    END LOOP;
    CLOSE cur;
    SELECT * FROM tmp_overspent ORDER BY overspend DESC;
    SELECT v_total AS total_overspend;
END $$

-- P4. book an expense safely (validates the budget category, then inserts; the triggers do the rest)
DROP PROCEDURE IF EXISTS sp_add_expense $$
CREATE PROCEDURE sp_add_expense(IN p_budget_department_id INT, IN p_category VARCHAR(30), IN p_description VARCHAR(50),
                                IN p_amount DECIMAL(15,2), IN p_approved_by INT)
BEGIN
    DECLARE v_project INT;
    SELECT b.project_id INTO v_project
      FROM budget_departments bd JOIN budgets b ON b.budget_id = bd.budget_id
     WHERE bd.budget_department_id = p_budget_department_id;
    IF v_project IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown budget category';
    END IF;
    INSERT INTO expenses (project_id, budget_department_id, expense_category, description, amount, tax_amount,
                          expense_date, payment_status, approved_by)
    VALUES (v_project, p_budget_department_id, p_category, p_description, p_amount, 0, CURDATE(), 'Pending', p_approved_by);
    SELECT LAST_INSERT_ID() AS new_expense_id;
END $$

DELIMITER ;
SELECT 'triggers / functions / procedures created' AS result;
