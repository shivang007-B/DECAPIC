-- ============================================================================
--  05_security_roles.sql : users, roles and privileges (MySQL 8.0 roles)
--  Change the demo passwords before using this anywhere except your own laptop.
-- ============================================================================
USE cineops;

-- ---- roles -----------------------------------------------------------------
CREATE ROLE IF NOT EXISTS 'cineops_viewer', 'cineops_accountant', 'cineops_producer', 'cineops_admin';

-- viewer: read-only on everything
GRANT SELECT ON cineops.* TO 'cineops_viewer';

-- accountant: read everything, manage money tables only
GRANT SELECT ON cineops.* TO 'cineops_accountant';
GRANT INSERT, UPDATE ON cineops.expenses            TO 'cineops_accountant';
GRANT INSERT, UPDATE ON cineops.payments            TO 'cineops_accountant';
GRANT UPDATE         ON cineops.budget_departments  TO 'cineops_accountant';
GRANT EXECUTE ON PROCEDURE cineops.sp_add_expense      TO 'cineops_accountant';
GRANT EXECUTE ON PROCEDURE cineops.sp_transfer_budget  TO 'cineops_accountant';

-- producer: read everything, full DML on production tables (not on users / security / ML tables)
GRANT SELECT ON cineops.* TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.shoot_days          TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.shoot_day_scenes    TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.scenes              TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.crew_assignments    TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.call_sheets         TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.production_events   TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.production_delays   TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.equipment_rentals   TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.scene_equipment     TO 'cineops_producer';
GRANT INSERT, UPDATE, DELETE ON cineops.location_bookings   TO 'cineops_producer';
GRANT UPDATE                 ON cineops.projects            TO 'cineops_producer';

-- admin: everything on the database
GRANT ALL PRIVILEGES ON cineops.* TO 'cineops_admin';

-- ---- demo users --------------------------------------------------------------
DROP USER IF EXISTS 'demo_viewer'@'localhost', 'demo_accountant'@'localhost', 'demo_producer'@'localhost';
CREATE USER 'demo_viewer'@'localhost'     IDENTIFIED BY 'Viewer#2026';
CREATE USER 'demo_accountant'@'localhost' IDENTIFIED BY 'Account#2026';
CREATE USER 'demo_producer'@'localhost'   IDENTIFIED BY 'Produce#2026';
GRANT 'cineops_viewer'     TO 'demo_viewer'@'localhost';
GRANT 'cineops_accountant' TO 'demo_accountant'@'localhost';
GRANT 'cineops_producer'   TO 'demo_producer'@'localhost';
SET DEFAULT ROLE ALL TO 'demo_viewer'@'localhost', 'demo_accountant'@'localhost', 'demo_producer'@'localhost';

-- ---- check it ---------------------------------------------------------------
-- SHOW GRANTS FOR 'demo_accountant'@'localhost' USING 'cineops_accountant';
-- Log in as demo_viewer and try:  DELETE FROM expenses;   -> ERROR 1142 (command denied)
SELECT 'roles and demo users created' AS result;
