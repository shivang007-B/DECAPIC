-- ============================================================================
--  07_decapic_app.sql : accounts used by the DecaPic web application
--  * decapic_app : the web backend (SELECT everywhere, EXECUTE procedures, a few UPDATE/INSERT rights)
--  * decapic_ro  : read-only account used by the SQL Lab page
--  * 7 demo logins (one per role), password for all of them:  Decapic@2026
--  Re-runnable. Run after 01..05:  mysql -u root -p cineops < 07_decapic_app.sql
-- ============================================================================
USE cineops;

-- ---- database accounts (change these passwords for anything except a laptop demo) -----------
CREATE USER IF NOT EXISTS 'decapic_app'@'localhost' IDENTIFIED BY 'DecaPic#App2026';
CREATE USER IF NOT EXISTS 'decapic_app'@'127.0.0.1' IDENTIFIED BY 'DecaPic#App2026';
CREATE USER IF NOT EXISTS 'decapic_ro'@'localhost'  IDENTIFIED BY 'DecaPic#Read2026';
CREATE USER IF NOT EXISTS 'decapic_ro'@'127.0.0.1'  IDENTIFIED BY 'DecaPic#Read2026';

GRANT SELECT  ON cineops.* TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT EXECUTE ON cineops.* TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';   -- stored procedures run with definer rights
GRANT UPDATE  ON cineops.budgets          TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT UPDATE  ON cineops.shoot_day_scenes TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT UPDATE  ON cineops.shoot_days       TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT UPDATE  ON cineops.projects         TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT UPDATE  ON cineops.scenes           TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT UPDATE (last_login) ON cineops.users TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT INSERT  ON cineops.expenses           TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT INSERT  ON cineops.payments           TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT INSERT  ON cineops.production_delays  TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT INSERT  ON cineops.production_events  TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT UPDATE  ON cineops.budget_departments TO 'decapic_app'@'localhost', 'decapic_app'@'127.0.0.1';
GRANT SELECT  ON cineops.* TO 'decapic_ro'@'localhost', 'decapic_ro'@'127.0.0.1';

-- ---- demo logins (one per role) --------------------------------------------------------------
DELETE FROM audit_logs WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@decapic.com');
DELETE FROM users WHERE email LIKE '%@decapic.com';          -- user_roles rows go with them (ON DELETE CASCADE)

SET @pw   = 'pbkdf2$120000$d3c4a1c0d3c4f1a1$533e30fe8a63bc369d1d7c8a9b784298fee1aa1d0cfa494cc21990c086e2258b';
SET @org  = (SELECT MIN(production_house_id) FROM production_houses);
SET @proj = (SELECT MIN(project_id) FROM projects);

INSERT INTO users (person_id, email, password_hash, account_status)
SELECT p.person_id, d.email, @pw, 'Active'
FROM (SELECT person_id, ROW_NUMBER() OVER (ORDER BY person_id) AS rn
        FROM people
       WHERE availability_status = 'Available' AND person_id NOT IN (SELECT person_id FROM users WHERE person_id IS NOT NULL)
       LIMIT 7) p
JOIN (SELECT 1 AS rn, 'admin@decapic.com' AS email UNION ALL SELECT 2, 'producer@decapic.com' UNION ALL SELECT 3, 'director@decapic.com'
      UNION ALL SELECT 4, 'manager@decapic.com' UNION ALL SELECT 5, 'finance@decapic.com' UNION ALL SELECT 6, 'crew@decapic.com'
      UNION ALL SELECT 7, 'reviewer@decapic.com') d ON d.rn = p.rn;

INSERT INTO user_roles (user_id, role_id, organization_id, project_id)
SELECT u.user_id, r.role_id, @org, @proj
FROM users u
JOIN (SELECT 'admin@decapic.com' AS email, 'SUPER_ADMIN' AS role UNION ALL SELECT 'producer@decapic.com', 'PRODUCER'
      UNION ALL SELECT 'director@decapic.com', 'DIRECTOR' UNION ALL SELECT 'manager@decapic.com', 'PRODUCTION_MANAGER'
      UNION ALL SELECT 'finance@decapic.com', 'FINANCE_MANAGER' UNION ALL SELECT 'crew@decapic.com', 'CREW'
      UNION ALL SELECT 'reviewer@decapic.com', 'AUDITOR') m ON m.email = u.email
JOIN system_roles r ON r.role_name = m.role;

SELECT u.email, sr.role_name, pe.name AS person FROM users u
JOIN user_roles ur ON ur.user_id = u.user_id JOIN system_roles sr ON sr.role_id = ur.role_id
LEFT JOIN people pe ON pe.person_id = u.person_id WHERE u.email LIKE '%@decapic.com' ORDER BY u.user_id;
