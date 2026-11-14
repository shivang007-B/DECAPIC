# Machine-learning layer

The ML part answers six practical film-production questions. **All training data lives in MySQL** and is exposed through views;
`train_models.py` reads those views, trains a model, and writes the metrics and the test-set predictions back into MySQL.

| Model (`ml_models.model_name`) | Question | Training view | Target | Type |
|---|---|---|---|---|
| `scene_duration` | How many hours will this scene really take? | `v_ml_schedule_training` | `actual_duration_hours` | regression |
| `crew_required` | How many crew members does a scene need? | `v_ml_resource_demand` | `crew_required_count` | regression |
| `equipment_required` | How many equipment units does a scene need? | `v_ml_resource_demand` | `equipment_required_count` | regression |
| `equipment_units` | How many units of each category (camera/lighting/audio/grip)? | `v_ml_equipment_demand` | `equipment_quantity` | regression |
| `production_risk_delay` | Will a production day be delayed (given the state of the project)? | `v_ml_risk_training` | `delay_occurred` | classification |
| `budget_overrun` | By what fraction will the project exceed its budget? | `v_ml_budget_training` | `budget_overrun_pct` | regression |
| `crew_match` | Is this candidate the right person for the required role? | `v_ml_crew_training` | `label` | classification |

## What changed compared with the original 6 ML tables
* `ml_schedule_prediction`, `ml_resource_demand`, `ml_equipment_demand` were **100 % copies of columns of `scenes`** (verified column by column).
  They are now **views** over `scenes` (+ `ml_scene_features` for the two truly computed columns `location_change`, `historical_scene_duration`, `day_night`).
  Same data, no duplicated storage, can never get out of sync.
* The `split` column (train / validation / test) was identical for every project in all six tables -> stored **once** in `ml_project_split` (one row per project).
  Splitting by *project* (not by row) avoids leakage: scenes of one film never appear in both train and test.
* `ml_crew_recommendation` lost five columns that can be looked up (`department`, `required_skill` text, `genre`, `candidate_skill_level`, `candidate_experience_years`); the view `v_ml_crew_training` re-joins them.
* `ml_production_risk` and `ml_budget_forecast` stay as tables (snapshots computed during the simulated shoot cannot be recomputed with a simple query).
* New: `ml_models` (one row per trained model with metrics) and `ml_predictions` (test-set predictions) so results can be queried with SQL, e.g. query Q29/Q30 in `06_sample_queries.sql`.

## Leakage rules (important for the viva)
Columns that are *outcomes* of the target are never used as features: `delay_days`, `risk_category` (for `production_risk_delay`);
`final_cost`, `budget_overrun`, `over_budget` (for `budget_overrun`); the other target of `v_ml_resource_demand`; all ids.

## Results of the shipped run (test split, seed 42)
Run `SELECT * FROM ml_models;` for the live numbers. Baseline = predicting the training mean (regression) or the majority class (classification).

| Model | Metric 1 | Metric 2 | Baseline | Verdict |
|---|---|---|---|---|
| scene_duration | MAE 0.85 h | R2 0.61 | MAE 1.39 | good improvement |
| crew_required | MAE 4.54 | R2 0.54 | MAE 6.55 | moderate |
| equipment_required | MAE 4.82 | R2 0.55 | MAE 7.21 | moderate |
| equipment_units | MAE 1.33 | R2 0.70 | MAE 2.53 | good |
| production_risk_delay | AUC 0.89 | accuracy 0.81 | 0.54 | good |
| crew_match | AUC 0.82 | accuracy 0.75 | 0.50 | good |
| **budget_overrun** | MAE 0.107 | **R2 0.20** | MAE 0.117 | **weak - barely better than the baseline** |

The data is **synthetic**, so these numbers say how learnable the *simulation* is, not how well the approach would work on real productions - say so in your report.
`budget_overrun` has only ~1,700 rows (500 projects); on the original 5,000-project data it will do better.

## Re-running
```
pip install -r ../requirements.txt
python train_models.py --user root --password YOUR_PASSWORD --export-csv ../data
```
Results differ slightly between scikit-learn versions. `--export-csv` rewrites `data/ml_models.csv` and `data/ml_predictions.csv` (loaded by `02_load_data.sql`).
