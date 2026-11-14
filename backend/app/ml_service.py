"""Machine-learning service: loads the models trained by ml/train_models.py and builds live inputs from the database."""
import json, time, threading
import numpy as np, pandas as pd, joblib
from . import config as C, db

BUNDLES, SUMMARY, LOAD_ERROR = {}, None, None


def load():
    global SUMMARY, LOAD_ERROR
    try:
        for f in C.ML_DIR.glob('*.joblib'):
            b = joblib.load(f); BUNDLES[b['name']] = b
        SUMMARY = json.loads((C.ML_DIR / 'summary.json').read_text())
        LOAD_ERROR = None if BUNDLES else 'no model files found - run: python ml/train_models.py'
    except Exception as e:                                       # e.g. scikit-learn version mismatch
        LOAD_ERROR = f'{type(e).__name__}: {e}  ->  re-train with: python ml/train_models.py'


load()


def ready(name=None):
    return (name in BUNDLES) if name else bool(BUNDLES)


def _frame(b, rows):
    df = pd.DataFrame(rows)
    for f in b['features']:
        if f not in df.columns: df[f] = np.nan
    df = df[b['features']].copy()
    for c in b['features']:
        if c in b['categories']:
            v = df[c].astype(object).where(df[c].notna(), None)
            df[c] = pd.Categorical(v, categories=b['categories'][c])
        else:
            df[c] = pd.to_numeric(df[c], errors='coerce')
    return df


def predict(name, rows):
    b = BUNDLES[name]; X = _frame(b, rows); m = b['model']
    return m.predict_proba(X)[:, 1] if b['task'] == 'classification' else m.predict(X)


def explain(name, row, top=6):
    """Local explanation: how much does the prediction move if ONE input is replaced by its typical value?"""
    b = BUNDLES[name]; meta = {f['name']: f for f in b['feature_meta']}
    base = float(predict(name, [row])[0]); out = []
    for f in b['features']:
        alt = dict(row); d = meta[f].get('default')
        if d is None or alt.get(f) == d: continue
        alt[f] = d
        out.append(dict(feature=f, value=row.get(f), typical=d, impact=base - float(predict(name, [alt])[0])))
    out.sort(key=lambda x: -abs(x['impact']))
    return out[:top]


def _clean(v):
    return None if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))) else v


# ------------------------------------------------------------------ scene planner
def scene_inputs(scene_id):
    s = db.one("""SELECT s.scene_id, s.project_id, s.scene_number, s.heading, s.complexity_score, s.interior_exterior, s.location_type, s.time_of_day,
                         s.vfx_required, s.stunt_required, s.special_effects_required, s.night_shoot, s.weather_dependent, s.dialogue_word_count,
                         s.estimated_duration, s.actual_duration_hours, s.crew_required, s.equipment_required, s.camera_units, s.lighting_units, s.audio_units, s.grip_units,
                         (SELECT COUNT(*) FROM scene_characters sc WHERE sc.scene_id = s.scene_id) cast_count,
                         (SELECT genre FROM v_primary_genre pg WHERE pg.project_id = s.project_id) genre,
                         f.location_change, f.day_night, f.historical_scene_duration
                  FROM scenes s LEFT JOIN ml_scene_features f ON f.scene_id = s.scene_id WHERE s.scene_id = :s""", s=scene_id)
    if not s: return None
    if s['historical_scene_duration'] is None:
        s['historical_scene_duration'] = db.scalar('SELECT AVG(actual_duration_hours) FROM scenes WHERE location_type = :l AND actual_duration_hours IS NOT NULL', l=s['location_type'])
    s['location_change'] = int(s['location_change'] or 0)
    s['day_night'] = s['day_night'] or ('Night' if s['time_of_day'] in ('Night', 'Dusk') else 'Day')
    return s


def plan_scene(x):
    """x: dict of scene attributes (complexity_score, location_type, genre, cast_count, flags ...). Returns all scene predictions."""
    g = lambda k, d=0: x.get(k) if x.get(k) is not None else d
    res_row = dict(scene_complexity=g('complexity_score', 5), genre=x.get('genre'), location_type=x.get('location_type'), cast_count=g('cast_count', 2),
                   vfx_required=int(g('vfx_required')), stunt_required=int(g('stunt_required')), night_shoot=int(g('night_shoot')), weather_dependency=int(g('weather_dependent')))
    crew = float(predict('crew_required', [res_row])[0]); equip = float(predict('equipment_required', [res_row])[0])
    day_night = x.get('day_night') or ('Night' if g('night_shoot') else 'Day')
    shoot_type = f"{x.get('interior_exterior') or 'EXT'}-{day_night}"
    units = {}
    for cat in ('Camera', 'Lighting', 'Audio', 'Grip'):
        units[cat] = max(0.0, float(predict('equipment_units', [dict(scene_complexity=g('complexity_score', 5), location_type=x.get('location_type'), shoot_type=shoot_type,
                                                                      vfx_required=int(g('vfx_required')), stunt_required=int(g('stunt_required')), equipment_category=cat)])[0]))
    hist = x.get('historical_scene_duration')
    if hist is None: hist = db.scalar('SELECT AVG(actual_duration_hours) FROM scenes WHERE actual_duration_hours IS NOT NULL') or 3
    dur_row = dict(scene_complexity=g('complexity_score', 5), cast_count=g('cast_count', 2), crew_count=round(crew) if x.get('crew_required') is None else x['crew_required'],
                   equipment_count=round(equip) if x.get('equipment_required') is None else x['equipment_required'], location_type=x.get('location_type'),
                   location_change=int(g('location_change')), day_night=day_night, vfx_required=int(g('vfx_required')), stunt_required=int(g('stunt_required')),
                   special_effects_required=int(g('special_effects_required')), dialogue_length=g('dialogue_word_count', 150), weather_dependent=int(g('weather_dependent')),
                   historical_scene_duration=hist, estimated_duration=g('estimated_duration', 3))
    dur = float(predict('scene_duration', [dur_row])[0])
    return dict(duration_hours=max(0.1, dur), crew=max(1.0, crew), equipment=max(1.0, equip), units=units,
                explain_duration=explain('scene_duration', dur_row, 5), explain_crew=explain('crew_required', res_row, 4), inputs=dict(duration=dur_row, resources=res_row))


# ------------------------------------------------------------------ project health (risk + budget forecast on a timeline of shoot days)
COST_GROUPS = {'Cast Salary': 'cast_cost', 'Talent Fee': 'cast_cost', 'Cast Overage': 'cast_cost', 'Crew Payroll': 'crew_cost', 'Equipment Rental': 'equipment_cost',
               'Location Fee': 'location_cost', 'Location Overage': 'location_cost', 'Permit': 'location_cost', 'Unit Transport': 'transport_cost',
               'Catering': 'catering_cost', 'Props & Set': 'production_design_cost', 'Costume': 'production_design_cost', 'Makeup & Hair': 'production_design_cost',
               'VFX Vendor': 'vfx_cost', 'Post-production': 'postproduction_cost', 'Delay Costs': 'delay_cost'}
COST_COLS = ['cast_cost', 'crew_cost', 'equipment_cost', 'location_cost', 'transport_cost', 'catering_cost', 'production_design_cost', 'vfx_cost', 'postproduction_cost', 'delay_cost']


def _df(rows, nums=()):
    d = pd.DataFrame(rows)
    for c in nums:
        if c in d: d[c] = pd.to_numeric(d[c], errors='coerce')
    return d


def health_features(pid):
    """One feature row per shoot day, built from the live tables (same meaning as the ml_* snapshot tables)."""
    pr = db.one('SELECT project_id, planned_budget, approved_budget, production_status FROM projects WHERE project_id = :p', p=pid)
    days = _df(db.rows("""SELECT shoot_day_id, shoot_date, planned_hours, delay_minutes, weather_risk, location_id FROM shoot_days
                          WHERE project_id = :p AND status <> 'Cancelled' ORDER BY shoot_date, day_number, shoot_day_id""", p=pid), ['planned_hours', 'delay_minutes', 'weather_risk'])
    if days.empty or len(days) < 2: return None, pr
    days['shoot_date'] = pd.to_datetime(days['shoot_date'])
    sc = _df(db.rows("""SELECT sds.shoot_day_id, SUM(sds.status = 'Completed') done, COUNT(*) total FROM shoot_day_scenes sds
                        JOIN shoot_days sd ON sd.shoot_day_id = sds.shoot_day_id WHERE sd.project_id = :p GROUP BY sds.shoot_day_id""", p=pid), ['done', 'total'])
    cr = _df(db.rows("""SELECT ca.shoot_day_id, SUM(ca.attendance_status IN ('Present','Late')) present, SUM(ca.attendance_status = 'Absent') absent FROM crew_assignments ca
                        JOIN shoot_days sd ON sd.shoot_day_id = ca.shoot_day_id WHERE sd.project_id = :p GROUP BY ca.shoot_day_id""", p=pid), ['present', 'absent'])
    dl = _df(db.rows("""SELECT shoot_day_id, COUNT(*) n_delays, SUM(equipment_related) equip_delays FROM production_delays WHERE project_id = :p GROUP BY shoot_day_id""", p=pid), ['n_delays', 'equip_delays'])
    ev = _df(db.rows('SELECT shoot_day_id, COUNT(*) n_events FROM production_events WHERE project_id = :p GROUP BY shoot_day_id', p=pid), ['n_events'])
    for t in (sc, cr, dl, ev):
        days = days.merge(t, how='left', on='shoot_day_id') if len(t) else days
    for c in ('done', 'total', 'present', 'absent', 'n_delays', 'equip_delays', 'n_events'):
        if c not in days: days[c] = 0
    days = days.fillna({c: 0 for c in ('done', 'total', 'present', 'absent', 'n_delays', 'equip_delays', 'n_events')})
    n = len(days); k = np.arange(1, n + 1)
    f = pd.DataFrame({'snapshot_day': k})
    total_sc = max(float(days['total'].sum()), 1.0)
    f['scenes_completed'] = days['done'].cumsum().values
    f['scenes_remaining'] = np.maximum(total_sc - f['scenes_completed'], 0)
    f['production_progress'] = f['scenes_completed'] / total_sc
    f['days_completed'] = k; f['days_remaining'] = n - k; f['days_completed_pct'] = k / n
    # money: cumulative expenses up to each shoot date
    ex = _df(db.rows('SELECT expense_date d, expense_category c, SUM(amount) a FROM expenses WHERE project_id = :p GROUP BY expense_date, expense_category', p=pid), ['a'])
    for c in COST_COLS: f[c] = 0.0
    f['budget_used'] = 0.0
    final_cost = 0.0
    if len(ex):
        ex['d'] = pd.to_datetime(ex['d']); ex['g'] = ex['c'].map(COST_GROUPS).fillna('other')
        piv = ex.pivot_table(index='d', columns='g', values='a', aggfunc='sum', fill_value=0).sort_index().cumsum()
        pos = piv.index.searchsorted(days['shoot_date'].values, side='right') - 1
        for col in piv.columns:
            vals = np.where(pos >= 0, piv[col].values[np.clip(pos, 0, None)], 0.0)
            if col in COST_COLS: f[col] = vals
        f['budget_used'] = np.where(pos >= 0, piv.sum(axis=1).values[np.clip(pos, 0, None)], 0.0)
        final_cost = float(ex['a'].sum())
    appr = float(pr['approved_budget']); orig = float(pr['planned_budget'])
    f['original_budget'] = orig; f['approved_budget'] = appr
    f['budget_used_pct'] = f['budget_used'] / appr; f['daily_burn_rate'] = f['budget_used'] / k
    pres, absn = days['present'].cumsum().values, days['absent'].cumsum().values
    f['crew_availability_pct'] = np.where(pres + absn > 0, pres / np.maximum(pres + absn, 1), 1.0)
    f['crew_absence_count'] = absn
    f['previous_delay_count'] = days['n_delays'].cumsum().values
    f['equipment_delay_count'] = days['equip_delays'].cumsum().values
    f['equipment_availability_pct'] = 1 - np.minimum(1, f['equipment_delay_count'] / k)
    f['production_event_count'] = days['n_events'].cumsum().values
    f['weather_risk'] = days['weather_risk'].expanding().mean().values
    f['location_changes'] = (days['location_id'] != days['location_id'].shift()).astype(int).cumsum().values - 1
    f['current_schedule_variance'] = days['delay_minutes'].cumsum().values / np.maximum(days['planned_hours'].cumsum().values * 60, 1)
    f['date'] = days['shoot_date'].dt.strftime('%Y-%m-%d').values
    f.attrs['final_cost'] = final_cost
    return f, pr


def health_curve(pid):
    f, pr = health_features(pid)
    if f is None: return None
    appr = float(pr['approved_budget'])
    risk = predict('production_risk_delay', f.to_dict('records'))
    over = predict('budget_overrun', f.to_dict('records'))
    final = f.attrs.get('final_cost', 0.0)
    curve = [dict(day=int(r['snapshot_day']), date=r['date'], risk=float(risk[i]), overrun_pct=float(over[i]), projected_cost=appr * (1 + float(over[i])),
                  budget_used=float(r['budget_used']), progress=float(r['production_progress']))
             for i, r in enumerate(f.to_dict('records'))]
    feats = [{k: _clean(float(v)) if isinstance(v, (int, float, np.floating, np.integer)) else v for k, v in row.items()} for row in f.to_dict('records')]
    return dict(project_id=pid, status=pr['production_status'], approved_budget=appr, days=len(f), curve=curve, features=feats,
                actual=dict(spent=final, overrun_pct=(final - appr) / appr if appr else None))


def health_whatif(pid, day, overrides):
    f, pr = health_features(pid)
    if f is None: return None
    row = f.iloc[max(0, min(day, len(f)) - 1)].to_dict()
    row.update({k: v for k, v in (overrides or {}).items() if k in row})
    appr = float(pr['approved_budget'])
    risk = float(predict('production_risk_delay', [row])[0]); over = float(predict('budget_overrun', [row])[0])
    return dict(risk=risk, overrun_pct=over, projected_cost=appr * (1 + over), explain_risk=explain('production_risk_delay', row, 6),
                explain_budget=explain('budget_overrun', row, 6))


_WATCH = dict(t=0, data=None)
_LOCK = threading.Lock()


def watchlist(refresh=False):
    """In-production projects ranked by predicted delay risk at their current progress (cached 5 minutes)."""
    with _LOCK:
        if not refresh and _WATCH['data'] is not None and time.time() - _WATCH['t'] < 300: return _WATCH['data']
        ps = db.rows("""SELECT p.project_id, p.project_code, p.project_name, f.title, p.production_status, p.approved_budget FROM projects p JOIN films f ON f.film_id = p.film_id
                        WHERE p.production_status IN ('In Production','Post-production') ORDER BY p.project_id""")
        out = []
        for p in ps:
            try:
                f, pr = health_features(p['project_id'])
                if f is None: continue
                done = db.scalar("SELECT COUNT(*) FROM shoot_days WHERE project_id = :p AND status = 'Completed'", p=p['project_id']) or 0
                i = max(0, min(int(done), len(f)) - 1) if p['production_status'] == 'In Production' else len(f) - 1
                row = f.iloc[i].to_dict()
                risk = float(predict('production_risk_delay', [row])[0]); over = float(predict('budget_overrun', [row])[0])
                out.append(dict(project_id=p['project_id'], project_code=p['project_code'], title=p['title'], status=p['production_status'], day=int(row['snapshot_day']),
                                days=len(f), risk=risk, overrun_pct=over, projected_cost=float(p['approved_budget']) * (1 + over),
                                approved=float(p['approved_budget']), progress=float(row['production_progress'])))
            except Exception:
                continue
        out.sort(key=lambda r: -r['risk'])
        _WATCH.update(t=time.time(), data=out)
        return out


# ------------------------------------------------------------------ crew match
SCALE_EXP = {'micro': 1, 'low': 2, 'mid': 4, 'high': 6, 'tentpole': 8}
SKILL = {'Junior': 1, 'Mid-level': 2, 'Senior': 3, 'Expert': 4}


def scale_of(budget):
    b = float(budget)
    return 'micro' if b < 1e6 else 'low' if b < 5e6 else 'mid' if b < 2e7 else 'high' if b < 8e7 else 'tentpole'


def crew_suggest(pid, role_id, required_skill=3, limit=8):
    p = db.one("""SELECT p.project_id, p.approved_budget, f.country_id, (SELECT genre FROM v_primary_genre g WHERE g.project_id = p.project_id) genre
                  FROM projects p JOIN films f ON f.film_id = p.film_id WHERE p.project_id = :p""", p=pid)
    role = db.one('SELECT ir.role_id, ir.role_name, d.department_name FROM industry_roles ir JOIN departments d ON d.department_id = ir.department_id WHERE ir.role_id = :r', r=role_id)
    if not p or not role: return None
    cands = db.rows("""SELECT pe.person_id, pe.name, pe.country_id, pe.availability_status, pr.skill_level, pr.experience_years
                       FROM person_roles pr JOIN people pe ON pe.person_id = pr.person_id WHERE pr.role_id = :r
                       ORDER BY pr.experience_years DESC, pe.person_id LIMIT 300""", r=role_id)
    if not cands: return dict(role=role, candidates=[], scale=scale_of(p['approved_budget']))
    ids = [c['person_id'] for c in cands]
    prev = {r['person_id']: r['n'] for r in db.rows("""SELECT person_id, COUNT(DISTINCT project_id) n FROM (
            SELECT person_id, project_id FROM project_people WHERE person_id IN :ids UNION SELECT person_id, project_id FROM cast_assignments WHERE person_id IN :ids
            UNION SELECT ca.person_id, sd.project_id FROM crew_assignments ca JOIN shoot_days sd ON sd.shoot_day_id = ca.shoot_day_id WHERE ca.person_id IN :ids) x GROUP BY person_id""", ids=ids)}
    hist = {r['person_id']: r['n'] for r in db.rows('SELECT person_id, COUNT(*) n FROM crew_assignments WHERE person_id IN :ids GROUP BY person_id', ids=ids)}
    scale = scale_of(p['approved_budget'])
    rows = [dict(department=role['department_name'], required_skill_level=required_skill, experience_required=SCALE_EXP[scale], project_scale=scale, genre=p['genre'],
                 candidate_skill_level=SKILL.get(c['skill_level'], 2), candidate_experience_years=c['experience_years'], same_country=int(c['country_id'] == p['country_id']),
                 availability=int(c['availability_status'] == 'Available'), previous_project_count=prev.get(c['person_id'], 0), historical_assignment_count=hist.get(c['person_id'], 0)) for c in cands]
    sc = predict('crew_match', rows)
    out = []
    for c, r, s in zip(cands, rows, sc):
        out.append(dict(person_id=c['person_id'], name=c['name'], skill=c['skill_level'], experience=c['experience_years'], availability=c['availability_status'],
                        same_country=bool(r['same_country']), previous_projects=r['previous_project_count'], score=float(s)))
    out.sort(key=lambda x: -x['score'])
    return dict(role=role, scale=scale, genre=p['genre'], candidates=out[:limit], pool=len(cands))


_ACC = dict(data=None)


def crew_accuracy():
    """On the held-out test projects: how often does the model rank the person who was REALLY hired first?"""
    if _ACC['data'] is not None: return _ACC['data']
    rows = db.rows("SELECT * FROM v_ml_crew_training WHERE split = 'test'")
    df = pd.DataFrame(rows)
    if df.empty: return dict(requirements=0, top1=None)
    for c in df.columns:
        if df[c].dtype == object:
            try: df[c] = pd.to_numeric(df[c])
            except Exception: pass
    df['score'] = predict('crew_match', df.to_dict('records'))
    hit = tot = 0
    for _, g in df.groupby('requirement_id'):
        if g['label'].sum() != 1 or len(g) < 2: continue
        tot += 1; hit += int(g.loc[g['score'].idxmax(), 'label'] == 1)
    _ACC['data'] = dict(requirements=tot, top1=hit / tot if tot else None, random=0.5)
    return _ACC['data']
