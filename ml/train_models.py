#!/usr/bin/env python3
"""
DecaPic - machine-learning training (reads the cineops MySQL database)

For every model:
  1. reads a training VIEW (v_ml_*)  - the view already carries the train / validation / test split (one split per project)
  2. trains a scikit-learn HistGradientBoosting model on 'train'
  3. measures it on 'validation' and 'test'
  4. computes permutation importance (which inputs matter) + data for the Model Lab charts
  5. SAVES the model + everything the web app needs:   ml/models/<name>.joblib   and   ml/models/summary.json
  6. writes the metrics to the table ml_models and the test predictions to ml_predictions

Run:   python ml/train_models.py --user root --password YOUR_PASSWORD
(the web app loads the saved files; run this again any time the data changes)
"""
import argparse, json, os, sys, time, warnings
from urllib.parse import quote_plus
import numpy as np
import pandas as pd
import joblib, sklearn
from sqlalchemy import create_engine, text
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import (mean_absolute_error, r2_score, roc_auc_score, accuracy_score, roc_curve,
                             confusion_matrix, f1_score)

warnings.filterwarnings('ignore')
SEED = 42
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'models')

# name, title, view, target, task, columns that must NOT be used as inputs (ids, split, outcomes = "data leakage")
MODELS = [
    dict(name='scene_duration', title='Scene shooting time', view='v_ml_schedule_training', target='actual_duration_hours', task='regression', unit='hours',
         about='How many hours a scene will really take to shoot.',
         drop=['sample_id', 'scene_id', 'project_id', 'split']),
    dict(name='crew_required', title='Crew needed for a scene', view='v_ml_resource_demand', target='crew_required_count', task='regression', unit='people',
         about='How many crew members a scene needs.',
         drop=['sample_id', 'scene_id', 'project_id', 'split', 'equipment_required_count']),
    dict(name='equipment_required', title='Equipment needed for a scene', view='v_ml_resource_demand', target='equipment_required_count', task='regression', unit='units',
         about='How many equipment units a scene needs in total.',
         drop=['sample_id', 'scene_id', 'project_id', 'split', 'crew_required_count']),
    dict(name='equipment_units', title='Equipment by category', view='v_ml_equipment_demand', target='equipment_quantity', task='regression', unit='units',
         about='Units of camera / lighting / audio / grip gear a scene needs.',
         drop=['sample_id', 'scene_id', 'project_id', 'split']),
    dict(name='production_risk_delay', title='Delay risk', view='v_ml_risk_training', target='delay_occurred', task='classification', unit='probability',
         about='Chance that the production will be delayed, from the current state of the project.',
         drop=['risk_sample_id', 'project_id', 'snapshot_date', 'split', 'delay_days', 'risk_category']),
    dict(name='budget_overrun', title='Budget overrun forecast', view='v_ml_budget_training', target='budget_overrun_pct', task='regression', unit='fraction',
         about='By what fraction the final cost will exceed the approved budget.',
         drop=['budget_sample_id', 'project_id', 'snapshot_date', 'split', 'final_cost', 'budget_overrun', 'over_budget']),
    dict(name='crew_match', title='Crew match', view='v_ml_crew_training', target='label', task='classification', unit='probability',
         about='How well a candidate fits a required crew role.',
         drop=['sample_id', 'requirement_id', 'project_id', 'role_id', 'project_country_id', 'candidate_person_id', 'split']),
]


def sample_id_col(df):
    for c in ('sample_id', 'risk_sample_id', 'budget_sample_id'):
        if c in df.columns: return c
    raise KeyError('no sample id column')


def prepare(df, drop, target):
    X = df.drop(columns=[c for c in drop + [target] if c in df.columns]).copy()
    cats = {}
    for c in X.columns:
        if X[c].dtype == object or str(X[c].dtype).startswith(('str', 'string')):
            try:
                X[c] = pd.to_numeric(X[c])                      # MySQL DECIMAL arrives as Decimal objects
            except (ValueError, TypeError):
                X[c] = X[c].astype('category'); cats[c] = [str(v) for v in X[c].cat.categories]
        elif X[c].dtype == bool:
            X[c] = X[c].astype(int)
    return X, cats


def feature_meta(X, cats):
    """what the web app needs to draw an input form: kind, range, typical value, allowed values"""
    meta = []
    for c in X.columns:
        if c in cats:
            meta.append(dict(name=c, kind='cat', values=cats[c], default=X[c].mode().iloc[0] if len(X[c].dropna()) else cats[c][0]))
            continue
        s = pd.to_numeric(X[c], errors='coerce').dropna()
        uniq = set(s.unique().tolist())
        if uniq <= {0, 1}:
            meta.append(dict(name=c, kind='bool', default=int(s.median()) if len(s) else 0)); continue
        integer = bool((s == s.round()).all())
        meta.append(dict(name=c, kind='num', integer=integer, min=float(s.min()), max=float(s.max()),
                         p10=float(s.quantile(.10)), median=float(s.median()), p90=float(s.quantile(.90)), default=float(s.median())))
    return meta


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--host', default='localhost'); ap.add_argument('--port', type=int, default=3306)
    ap.add_argument('--user', default='root'); ap.add_argument('--password', default=os.environ.get('MYSQL_PWD', ''))
    ap.add_argument('--database', default='cineops')
    ap.add_argument('--no-db-write', action='store_true', help='do not write ml_models / ml_predictions')
    a = ap.parse_args()
    eng = create_engine(f"mysql+pymysql://{quote_plus(a.user)}:{quote_plus(a.password)}@{a.host}:{a.port}/{a.database}")
    os.makedirs(OUT, exist_ok=True)

    summary, results, preds = [], [], []
    t0 = time.time()
    for m in MODELS:
        with eng.connect() as cx:
            df = pd.read_sql(text(f"SELECT * FROM {m['view']}"), cx)
        sid = sample_id_col(df)
        y = pd.to_numeric(df[m['target']]).astype(float)
        X, cats = prepare(df, m['drop'], m['target'])
        tr, va, te = (df.split == 'train').values, (df.split == 'validation').values, (df.split == 'test').values
        clf = m['task'] == 'classification'
        Model = HistGradientBoostingClassifier if clf else HistGradientBoostingRegressor
        mdl = Model(random_state=SEED, categorical_features='from_dtype')
        mdl.fit(X[tr], y[tr].astype(int) if clf else y[tr])

        def score(mask):
            if clf:
                p = mdl.predict_proba(X[mask])[:, 1]
                return p, dict(roc_auc=float(roc_auc_score(y[mask], p)), accuracy=float(accuracy_score(y[mask], p >= .5)), f1=float(f1_score(y[mask], p >= .5)))
            p = mdl.predict(X[mask])
            return p, dict(mae=float(mean_absolute_error(y[mask], p)), r2=float(r2_score(y[mask], p)))
        pv, mv = score(va); pt, mt = score(te)
        if clf:
            base = dict(accuracy=float(max(y[te].mean(), 1 - y[te].mean())))
            m1, m2 = ('ROC_AUC', mt['roc_auc']), ('Accuracy', mt['accuracy'])
        else:
            base = dict(mae=float(mean_absolute_error(y[te], np.full(te.sum(), y[tr].mean()))))
            m1, m2 = ('MAE', mt['mae']), ('R2', mt['r2'])

        # which inputs matter (permutation importance on the test split)
        rs = np.random.RandomState(SEED); idx = np.where(te)[0]
        idx = rs.choice(idx, size=min(1500, len(idx)), replace=False)
        pi = permutation_importance(mdl, X.iloc[idx], y.iloc[idx].astype(int) if clf else y.iloc[idx], n_repeats=4, random_state=SEED,
                                    scoring='roc_auc' if clf else 'r2')
        imp = sorted(({'feature': c, 'importance': float(max(v, 0))} for c, v in zip(X.columns, pi.importances_mean)), key=lambda d: -d['importance'])

        # data for the Model Lab charts
        lab = {}
        if clf:
            fpr, tpr, _ = roc_curve(y[te], pt)
            k = np.unique(np.linspace(0, len(fpr) - 1, 60).astype(int))
            lab['roc'] = dict(fpr=fpr[k].round(4).tolist(), tpr=tpr[k].round(4).tolist())
            cm = confusion_matrix(y[te], pt >= .5); lab['confusion'] = cm.tolist()
            lab['hist'] = dict(pos=np.histogram(pt[y[te] == 1], bins=10, range=(0, 1))[0].tolist(), neg=np.histogram(pt[y[te] == 0], bins=10, range=(0, 1))[0].tolist())
        else:
            ii = rs.choice(np.arange(te.sum()), size=min(300, te.sum()), replace=False)
            lab['scatter'] = dict(actual=y[te].values[ii].round(4).tolist(), predicted=np.asarray(pt)[ii].round(4).tolist())
            err = np.asarray(pt) - y[te].values
            lab['error_hist'] = dict(counts=np.histogram(err, bins=20)[0].tolist(), edges=np.histogram(err, bins=20)[1].round(3).tolist())

        bundle = dict(name=m['name'], title=m['title'], task=m['task'], target=m['target'], unit=m['unit'], about=m['about'], view=m['view'],
                      features=list(X.columns), categories=cats, feature_meta=feature_meta(X[tr], cats), model=mdl,
                      metrics=dict(validation=mv, test=mt, baseline=base), importance=imp[:12],
                      n_train=int(tr.sum()), n_val=int(va.sum()), n_test=int(te.sum()),
                      target_stats=dict(mean=float(y[tr].mean()), std=float(y[tr].std()), min=float(y.min()), max=float(y.max())),
                      sklearn=sklearn.__version__, trained_at=time.strftime('%Y-%m-%d %H:%M:%S'))
        joblib.dump(bundle, os.path.join(OUT, f"{m['name']}.joblib"), compress=3)
        summary.append({k: v for k, v in bundle.items() if k != 'model'} | dict(lab=lab))
        print(f"{m['name']:22s} {m['task']:14s} train={tr.sum():6d} test={te.sum():5d}  {m1[0]}={m1[1]:.3f}  {m2[0]}={m2[1]:.3f}  top input: {imp[0]['feature']}")
        results.append(dict(model_name=m['name'], source_view=m['view'], target_column=m['target'], task_type=m['task'], algorithm='HistGradientBoosting',
                            n_train=int(tr.sum()), n_test=int(te.sum()), metric_1_name=m1[0], metric_1_value=float(m1[1]), metric_2_name=m2[0], metric_2_value=float(m2[1])))
        out = pd.DataFrame({'sample_id': df.loc[te, sid].astype(int).values, 'project_id': df.loc[te, 'project_id'].astype(int).values,
                            'scene_id': df.loc[te, 'scene_id'].astype('Int64').values if 'scene_id' in df.columns else pd.array([None] * te.sum(), dtype='Int64'),
                            'actual_value': y[te].values, 'predicted_value': pt})
        preds.append(out)

    json.dump(dict(sklearn=sklearn.__version__, trained_at=time.strftime('%Y-%m-%d %H:%M:%S'), models=summary), open(os.path.join(OUT, 'summary.json'), 'w'))
    print(f'\nsaved {len(MODELS)} models to {OUT}  ({time.time() - t0:.0f}s)')

    if not a.no_db_write:
        with eng.begin() as cx:
            cx.execute(text('DELETE FROM ml_models'))
            cx.execute(text('ALTER TABLE ml_models AUTO_INCREMENT = 1'))
            for r, out in zip(results, preds):
                cx.execute(text("""INSERT INTO ml_models (model_name, source_view, target_column, task_type, algorithm, n_train, n_test,
                                   metric_1_name, metric_1_value, metric_2_name, metric_2_value)
                                   VALUES (:model_name, :source_view, :target_column, :task_type, :algorithm, :n_train, :n_test,
                                           :metric_1_name, :metric_1_value, :metric_2_name, :metric_2_value)"""), r)
                mid = cx.execute(text('SELECT LAST_INSERT_ID()')).scalar()
                out = out.assign(model_id=mid)[['model_id', 'sample_id', 'project_id', 'scene_id', 'actual_value', 'predicted_value']]
                out['scene_id'] = out['scene_id'].astype(object).where(out['scene_id'].notna(), None)
                out.to_sql('ml_predictions', cx, if_exists='append', index=False, method='multi', chunksize=2000)
        print(f"stored {len(results)} models and {sum(len(o) for o in preds)} predictions in {a.database}.ml_models / ml_predictions")


if __name__ == '__main__':
    sys.exit(main())
