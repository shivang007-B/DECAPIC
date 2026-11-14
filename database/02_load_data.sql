-- ============================================================================
--  02_load_data.sql : loads the CSV files in the data/ folder (dependency order)
--  HOW TO RUN (important): start the client FROM THIS FOLDER with local-infile enabled:
--      mysql --local-infile=1 -u root -p cineops < 02_load_data.sql
--  The server must allow it once:   SET GLOBAL local_infile = 1;
--  In MySQL Workbench: Edit Connection > Advanced > Others > add  OPT_LOCAL_INFILE=1,
--  and replace 'data/' below with the absolute path of the data folder (Find & Replace).
-- ============================================================================
USE cineops;
SET FOREIGN_KEY_CHECKS = 0;   -- speeds up loading; integrity is re-verified at the end
SET UNIQUE_CHECKS = 0;

LOAD DATA LOCAL INFILE 'data/countries.csv' INTO TABLE countries
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (country_id, country_name, iso_code, region);
LOAD DATA LOCAL INFILE 'data/languages.csv' INTO TABLE languages
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (language_id, iso_code, language_name);
LOAD DATA LOCAL INFILE 'data/departments.csv' INTO TABLE departments
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (department_id, department_name);
LOAD DATA LOCAL INFILE 'data/genres.csv' INTO TABLE genres
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (genre_id, genre_name);
LOAD DATA LOCAL INFILE 'data/system_roles.csv' INTO TABLE system_roles
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (role_id, role_name);
LOAD DATA LOCAL INFILE 'data/cities.csv' INTO TABLE cities
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (city_id, country_id, city_name, latitude, longitude, population, timezone);
LOAD DATA LOCAL INFILE 'data/industry_roles.csv' INTO TABLE industry_roles
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (role_id, role_name, description, department_id);
LOAD DATA LOCAL INFILE 'data/production_houses.csv' INTO TABLE production_houses
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (production_house_id, name, legal_name, founded_year, country_id, city_id, website, email, phone, description, company_size, status, created_at);
LOAD DATA LOCAL INFILE 'data/vendors.csv' INTO TABLE vendors
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (vendor_id, vendor_name, vendor_type, country_id, city_id, email, phone, rating, status);
LOAD DATA LOCAL INFILE 'data/distributors.csv' INTO TABLE distributors
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (distributor_id, name, company_type, country_id, city_id, website, contact_email, status);
LOAD DATA LOCAL INFILE 'data/equipment.csv' INTO TABLE equipment
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (equipment_id, equipment_name, category, manufacturer, model, serial_number, equipment_type, daily_rental_rate, replacement_cost, vendor_id, availability_status, equipment_condition, purchase_year);
LOAD DATA LOCAL INFILE 'data/locations.csv' INTO TABLE locations
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (location_id, name, location_type, country_id, city_id, latitude, longitude, indoor_outdoor, description, base_cost, availability_status);
LOAD DATA LOCAL INFILE 'data/people.csv' INTO TABLE people
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (person_id, name, birth_year, gender, country_id, city_id, bio, profile_image, contact_email, phone, union_name, availability_status, created_at);
LOAD DATA LOCAL INFILE 'data/person_roles.csv' INTO TABLE person_roles
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (person_role_id, person_id, role_id, experience_years, skill_level, specialization);
LOAD DATA LOCAL INFILE 'data/films.csv' INTO TABLE films
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (film_id, title, original_title, title_type, release_year, runtime_minutes, language_id, country_id, certificate, synopsis, poster_url, imdb_rating, imdb_votes);
LOAD DATA LOCAL INFILE 'data/film_genres.csv' INTO TABLE film_genres
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (film_id, genre_id, is_primary);
LOAD DATA LOCAL INFILE 'data/characters.csv' INTO TABLE characters
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (character_id, film_id, character_name, description, character_type, importance_level);
LOAD DATA LOCAL INFILE 'data/projects.csv' INTO TABLE projects
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (project_id, film_id, project_code, project_name, project_type, production_status, preproduction_start, production_start, production_end, postproduction_start, planned_completion_date, actual_completion_date, planned_budget, approved_budget, current_budget, priority, project_description, created_at);
LOAD DATA LOCAL INFILE 'data/project_production_houses.csv' INTO TABLE project_production_houses
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (project_company_id, project_id, production_house_id, company_role, ownership_percentage);
LOAD DATA LOCAL INFILE 'data/project_people.csv' INTO TABLE project_people
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (project_person_id, project_id, person_id, role_id, start_date, end_date, employment_type, daily_rate, status);
LOAD DATA LOCAL INFILE 'data/media_assets.csv' INTO TABLE media_assets
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (asset_id, project_id, asset_type, filename, file_extension, storage_key, file_size, uploaded_by, uploaded_at);
LOAD DATA LOCAL INFILE 'data/scripts.csv' INTO TABLE scripts
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (script_id, project_id, title, author_id, file_asset_id, page_count, status, created_at, approved_at);
LOAD DATA LOCAL INFILE 'data/scenes.csv' INTO TABLE scenes
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (scene_id, script_id, project_id, scene_number, sequence_number, heading, description, interior_exterior, location_type, time_of_day, estimated_duration, complexity_score, vfx_required, stunt_required, special_effects_required, night_shoot, status, location_id, script_pages, dialogue_word_count, weather_dependent, crew_required, equipment_required, camera_units, lighting_units, audio_units, grip_units, actual_duration_hours);
LOAD DATA LOCAL INFILE 'data/scene_characters.csv' INTO TABLE scene_characters
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (scene_character_id, scene_id, character_id, importance);
LOAD DATA LOCAL INFILE 'data/contracts.csv' INTO TABLE contracts
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (contract_id, project_id, person_id, vendor_id, contract_type, start_date, end_date, contract_value, payment_terms, status, document_asset_id);
LOAD DATA LOCAL INFILE 'data/payments.csv' INTO TABLE payments
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (payment_id, project_id, contract_id, vendor_id, person_id, amount, payment_date, payment_type, payment_status, transaction_reference);
LOAD DATA LOCAL INFILE 'data/cast_assignments.csv' INTO TABLE cast_assignments
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (cast_assignment_id, project_id, person_id, character_id, contract_id, start_date, end_date, salary, status, assignment_type);
LOAD DATA LOCAL INFILE 'data/location_bookings.csv' INTO TABLE location_bookings
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (booking_id, project_id, location_id, start_date, end_date, booking_cost, deposit, status, permit_required, permit_status);
LOAD DATA LOCAL INFILE 'data/shoot_days.csv' INTO TABLE shoot_days
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (shoot_day_id, project_id, shoot_date, day_number, location_id, call_time, wrap_time, planned_hours, actual_hours, weather_condition, weather_risk, status, delay_minutes, is_added_day);
LOAD DATA LOCAL INFILE 'data/shoot_day_scenes.csv' INTO TABLE shoot_day_scenes
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (shoot_day_scene_id, shoot_day_id, scene_id, planned_start, planned_end, actual_start, actual_end, status, delay_minutes);
LOAD DATA LOCAL INFILE 'data/call_sheets.csv' INTO TABLE call_sheets
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (call_sheet_id, shoot_day_id, version, issue_date, general_call_time, weather_info, special_instructions, status, file_asset_id);
LOAD DATA LOCAL INFILE 'data/crew_assignments.csv' INTO TABLE crew_assignments
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (assignment_id, person_id, shoot_day_id, role_id, call_time, wrap_time, hours_worked, overtime_hours, attendance_status, daily_rate);
LOAD DATA LOCAL INFILE 'data/equipment_rentals.csv' INTO TABLE equipment_rentals
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (rental_id, project_id, equipment_id, vendor_id, start_date, end_date, planned_cost, actual_cost, pickup_date, return_date, late_return, damage_status, status);
LOAD DATA LOCAL INFILE 'data/scene_equipment.csv' INTO TABLE scene_equipment
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (scene_equipment_id, scene_id, rental_id, quantity);
LOAD DATA LOCAL INFILE 'data/budgets.csv' INTO TABLE budgets
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (budget_id, project_id, version, total_budget, approved_amount, contingency_amount, status, created_at);
LOAD DATA LOCAL INFILE 'data/budget_departments.csv' INTO TABLE budget_departments
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (budget_department_id, budget_id, category, allocated_amount, spent_amount);
LOAD DATA LOCAL INFILE 'data/expenses.csv' INTO TABLE expenses
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (expense_id, project_id, budget_department_id, vendor_id, expense_category, description, amount, tax_amount, expense_date, payment_status, approved_by, receipt_asset_id);
LOAD DATA LOCAL INFILE 'data/production_events.csv' INTO TABLE production_events
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (event_id, project_id, shoot_day_id, scene_id, event_type, severity, start_time, end_time, duration_minutes, description, resolved, department_id);
LOAD DATA LOCAL INFILE 'data/production_delays.csv' INTO TABLE production_delays
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (delay_id, project_id, shoot_day_id, scene_id, delay_type, cause, delay_minutes, severity, weather_related, equipment_related, crew_related, location_related, cost_impact, event_id, department_id);
LOAD DATA LOCAL INFILE 'data/post_production.csv' INTO TABLE post_production
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (postproduction_id, project_id, editing_progress, vfx_progress, audio_progress, color_progress, subtitle_progress, current_stage, status);
LOAD DATA LOCAL INFILE 'data/postproduction_tasks.csv' INTO TABLE postproduction_tasks
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (task_id, project_id, task_category, task_type, assigned_to, asset_id, start_date, due_date, completion_date, progress, status);
LOAD DATA LOCAL INFILE 'data/distribution.csv' INTO TABLE distribution
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (distribution_id, project_id, distributor_id, platform, territory, release_type, release_date, language_id, certificate, deal_value, status);
LOAD DATA LOCAL INFILE 'data/users.csv' INTO TABLE users
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (user_id, person_id, email, password_hash, account_status, last_login, created_at);
LOAD DATA LOCAL INFILE 'data/user_roles.csv' INTO TABLE user_roles
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (user_role_id, user_id, role_id, organization_id, project_id);
LOAD DATA LOCAL INFILE 'data/audit_logs.csv' INTO TABLE audit_logs
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (audit_id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address, logged_at);
LOAD DATA LOCAL INFILE 'data/ml_project_split.csv' INTO TABLE ml_project_split
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (project_id, split);
LOAD DATA LOCAL INFILE 'data/ml_scene_features.csv' INTO TABLE ml_scene_features
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (scene_id, day_night, location_change, historical_scene_duration);
LOAD DATA LOCAL INFILE 'data/ml_production_risk.csv' INTO TABLE ml_production_risk
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (risk_sample_id, project_id, snapshot_day, snapshot_date, budget_used_pct, production_progress, days_completed_pct, days_remaining, scenes_remaining, crew_availability_pct, equipment_availability_pct, location_changes, previous_delay_count, equipment_delay_count, crew_absence_count, weather_risk, production_event_count, daily_burn_rate, current_schedule_variance, delay_occurred, delay_days, risk_category);
LOAD DATA LOCAL INFILE 'data/ml_budget_forecast.csv' INTO TABLE ml_budget_forecast
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (budget_sample_id, project_id, snapshot_day, snapshot_date, original_budget, approved_budget, budget_used, budget_used_pct, days_completed, days_remaining, daily_burn_rate, cast_cost, crew_cost, equipment_cost, location_cost, transport_cost, catering_cost, production_design_cost, vfx_cost, postproduction_cost, delay_cost, production_progress, scenes_completed, scenes_remaining, final_cost, budget_overrun, budget_overrun_pct, over_budget);
LOAD DATA LOCAL INFILE 'data/ml_crew_recommendation.csv' INTO TABLE ml_crew_recommendation
  CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n' IGNORE 1 LINES (sample_id, requirement_id, project_id, role_id, experience_required, project_scale, project_country_id, candidate_person_id, same_country, availability, previous_project_count, historical_assignment_count, label, required_skill_level);

SET UNIQUE_CHECKS = 1;
SET FOREIGN_KEY_CHECKS = 1;

-- Optional: ML results (predictions of the trained models). Skip these two lines if you want to retrain yourself (ml/train_models.py)
LOAD DATA LOCAL INFILE 'data/ml_models.csv' INTO TABLE ml_models CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES (model_id, model_name, source_view, target_column, task_type, algorithm, n_train, n_test, metric_1_name, metric_1_value, metric_2_name, metric_2_value, trained_at);
LOAD DATA LOCAL INFILE 'data/ml_predictions.csv' INTO TABLE ml_predictions CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES (prediction_id, model_id, sample_id, project_id, scene_id, actual_value, predicted_value);
