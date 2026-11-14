"""AI Studio endpoints - every prediction is computed live from the trained models and the real tables."""
from typing import Optional
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from .. import db, ml_service as ML, security as S

router = APIRouter(prefix='/api/ai', tags=['ai'], dependencies=[Depends(S.require('ai'))])


def _need(name=None):
    if not ML.ready(name):
        raise HTTPException(503, ML.LOAD_ERROR or 'Models are not trained yet - run: python ml/train_models.py')


@router.get('/models')
def models():
    _need()
    s = ML.SUMMARY
    return dict(sklearn=s['sklearn'], trained_at=s['trained_at'], models=s['models'], crew_accuracy=ML.crew_accuracy())


# ---- scene planner ------------------------------------------------------------------------------
@router.get('/scene/{sid}')
def scene_inputs(sid: int):
    _need()
    x = ML.scene_inputs(sid)
    if not x: raise HTTPException(404, 'Scene not found')
    return dict(scene=x, prediction=ML.plan_scene(x))


class ScenePlan(BaseModel):
    complexity_score: int = 5
    location_type: str = 'Street'
    genre: Optional[str] = None
    interior_exterior: str = 'EXT'
    cast_count: int = 2
    vfx_required: int = 0
    stunt_required: int = 0
    special_effects_required: int = 0
    night_shoot: int = 0
    weather_dependent: int = 0
    dialogue_word_count: int = 150
    estimated_duration: float = 3.0
    location_change: int = 0


@router.post('/scene/plan')
def plan(body: ScenePlan):
    _need()
    return ML.plan_scene(body.model_dump())


# ---- project health -----------------------------------------------------------------------------
@router.get('/health/{pid}')
def health(pid: int):
    _need()
    r = ML.health_curve(pid)
    if r is None: raise HTTPException(404, 'This project has fewer than 2 shoot days - nothing to forecast yet')
    return r


class WhatIf(BaseModel):
    project_id: int
    day: int
    overrides: dict = {}


@router.post('/health/whatif')
def whatif(body: WhatIf):
    _need()
    r = ML.health_whatif(body.project_id, body.day, body.overrides)
    if r is None: raise HTTPException(404, 'No data for this project')
    return r


@router.get('/watchlist')
def watchlist(refresh: bool = False):
    _need()
    return ML.watchlist(refresh)


# ---- crew match -----------------------------------------------------------------------------------
@router.get('/crew/requirements')
def crew_requirements(project_id: int):
    return db.rows("""SELECT c.requirement_id, c.role_id, ir.role_name, d.department_name, MAX(c.required_skill_level) skill, MAX(c.project_scale) scale
                      FROM ml_crew_recommendation c JOIN industry_roles ir ON ir.role_id = c.role_id JOIN departments d ON d.department_id = ir.department_id
                      WHERE c.project_id = :p GROUP BY c.requirement_id, c.role_id, ir.role_name, d.department_name ORDER BY c.requirement_id LIMIT 40""", p=project_id)


@router.get('/crew/requirement/{rid}')
def crew_requirement(rid: int):
    _need('crew_match')
    rows = db.rows("SELECT * FROM v_ml_crew_training WHERE requirement_id = :r", r=rid)
    if not rows: raise HTTPException(404, 'Requirement not found')
    df = pd.DataFrame(rows)
    for c in df.columns:
        if df[c].dtype == object:
            try: df[c] = pd.to_numeric(df[c])
            except Exception: pass
    sc = ML.predict('crew_match', df.to_dict('records'))
    names = {r['person_id']: r for r in db.rows('SELECT person_id, name, availability_status FROM people WHERE person_id IN :ids', ids=[int(x) for x in df['candidate_person_id']])}
    out = []
    for r, s in zip(rows, sc):
        n = names.get(r['candidate_person_id'], {})
        out.append(dict(person_id=r['candidate_person_id'], name=n.get('name'), availability=n.get('availability_status'), skill=r['candidate_skill_level'], experience=r['candidate_experience_years'],
                        same_country=bool(r['same_country']), previous_projects=r['previous_project_count'], hired=bool(r['label']), score=float(s)))
    out.sort(key=lambda x: -x['score'])
    meta = db.one('SELECT ir.role_name, d.department_name FROM industry_roles ir JOIN departments d ON d.department_id = ir.department_id WHERE ir.role_id = :r', r=rows[0]['role_id'])
    return dict(requirement_id=rid, role=meta, candidates=out, model_pick_is_real_hire=bool(out and out[0]['hired']))


@router.get('/crew/suggest')
def crew_suggest(project_id: int, role_id: int, required_skill: int = 3, limit: int = 8):
    _need('crew_match')
    r = ML.crew_suggest(project_id, role_id, max(1, min(required_skill, 4)), max(1, min(limit, 20)))
    if r is None: raise HTTPException(404, 'Project or role not found')
    return r
