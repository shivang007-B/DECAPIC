import re
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from .. import db, security as S

router = APIRouter(prefix='/api', tags=['projects'])
SORTS = {'newest': 'p.production_start DESC', 'oldest': 'p.production_start ASC', 'budget': 'p.approved_budget DESC',
         'name': 'p.project_name ASC', 'spent': 'spent DESC', 'overrun': 'pct DESC'}


def db_error(e: DBAPIError) -> HTTPException:
    """Turn a MySQL error (trigger SIGNAL, CHECK, FK ...) into a readable message for the user."""
    msg = str(getattr(e, 'orig', e))
    m = re.search(r"\((\d+),\s*['\"](.*)['\"]\)", msg, re.S)
    code, text_ = (int(m.group(1)), m.group(2)) if m else (0, msg)
    if code == 3819:
        cm = re.search(r"Check constraint '([^']+)'", text_)
        text_ = f"Rule violated: {cm.group(1) if cm else 'CHECK constraint'}"
    return HTTPException(409, text_)


def _ensure_project(pid):
    if not db.scalar('SELECT 1 FROM projects WHERE project_id = :p', p=pid):
        raise HTTPException(404, 'Project not found')


# ------------------------------------------------------------------ list
@router.get('/projects')
def projects(q: str = '', status: str = '', type: str = '', priority: str = '', sort: str = 'newest',
             page: int = 1, size: int = 12, user: dict = Depends(S.current_user)):
    size, off = db.page_args(page, size)
    like = f'%{q}%'
    where = """WHERE (:q = '' OR p.project_name LIKE :like OR p.project_code LIKE :like OR f.title LIKE :like)
               AND (:status = '' OR p.production_status = :status) AND (:type = '' OR p.project_type = :type)
               AND (:priority = '' OR p.priority = :priority)"""
    args = dict(q=q, like=like, status=status, type=type, priority=priority)
    total = db.scalar(f'SELECT COUNT(*) FROM projects p JOIN films f ON f.film_id = p.film_id {where}', **args)
    order = SORTS.get(sort, SORTS['newest'])
    items = db.rows(f"""
        SELECT p.project_id, p.project_code, p.project_name, p.project_type, p.production_status, p.priority, p.production_start, p.production_end,
               p.approved_budget, f.film_id, f.title film_title, f.release_year,
               (SELECT ph.name FROM project_production_houses pph JOIN production_houses ph ON ph.production_house_id = pph.production_house_id
                 WHERE pph.project_id = p.project_id AND pph.company_role = 'Primary Producer' LIMIT 1) lead_house,
               (SELECT GROUP_CONCAT(g.genre_name ORDER BY fg.is_primary DESC SEPARATOR ', ') FROM film_genres fg
                  JOIN genres g ON g.genre_id = fg.genre_id WHERE fg.film_id = p.film_id) genres,
               COALESCE(bs.spent_amount, 0) spent, COALESCE(bs.pct_of_approved_spent, 0) pct,
               (SELECT COUNT(*) FROM shoot_days sd WHERE sd.project_id = p.project_id) shoot_days,
               (SELECT COUNT(*) FROM shoot_days sd WHERE sd.project_id = p.project_id AND sd.status = 'Completed') days_done,
               (SELECT COUNT(*) FROM scenes s WHERE s.project_id = p.project_id) scenes
        FROM projects p JOIN films f ON f.film_id = p.film_id LEFT JOIN v_project_budget_summary bs ON bs.project_id = p.project_id
        {where} ORDER BY {order}, p.project_id LIMIT :size OFFSET :off""", size=size, off=off, **args)
    return dict(total=total, page=page, size=size, items=items)


# ------------------------------------------------------------------ detail
@router.get('/projects/{pid}')
def project(pid: int, user: dict = Depends(S.current_user)):
    p = db.one("""SELECT p.*, f.title film_title, f.original_title, f.release_year, f.runtime_minutes, f.certificate, f.synopsis, f.imdb_rating,
                         c.country_name, l.language_name
                  FROM projects p JOIN films f ON f.film_id = p.film_id LEFT JOIN countries c ON c.country_id = f.country_id
                  LEFT JOIN languages l ON l.language_id = f.language_id WHERE p.project_id = :p""", p=pid)
    if not p: raise HTTPException(404, 'Project not found')
    p['genres'] = db.rows("""SELECT g.genre_name name, fg.is_primary FROM film_genres fg JOIN genres g ON g.genre_id = fg.genre_id
                             WHERE fg.film_id = :f ORDER BY fg.is_primary DESC, g.genre_name""", f=p['film_id'])
    p['houses'] = db.rows("""SELECT ph.production_house_id id, ph.name, pph.company_role, pph.ownership_percentage FROM project_production_houses pph
                             JOIN production_houses ph ON ph.production_house_id = pph.production_house_id WHERE pph.project_id = :p
                             ORDER BY pph.ownership_percentage DESC""", p=pid)
    p['counts'] = db.one("""SELECT (SELECT COUNT(*) FROM scenes WHERE project_id = :p) scenes, (SELECT COUNT(*) FROM shoot_days WHERE project_id = :p) shoot_days,
        (SELECT COUNT(*) FROM shoot_days WHERE project_id = :p AND status = 'Completed') days_done,
        (SELECT COUNT(*) FROM cast_assignments WHERE project_id = :p) cast, (SELECT COUNT(*) FROM project_people WHERE project_id = :p) key_crew,
        (SELECT COUNT(DISTINCT ca.person_id) FROM crew_assignments ca JOIN shoot_days sd ON sd.shoot_day_id = ca.shoot_day_id WHERE sd.project_id = :p) crew_people,
        (SELECT COUNT(*) FROM contracts WHERE project_id = :p) contracts, (SELECT COUNT(*) FROM equipment_rentals WHERE project_id = :p) rentals,
        (SELECT COUNT(*) FROM production_delays WHERE project_id = :p) delays, (SELECT COUNT(*) FROM production_events WHERE project_id = :p) events,
        (SELECT COUNT(*) FROM distribution WHERE project_id = :p) releases""", p=pid)
    if 'finance_view' in S.ROLE_PERMS.get(user['role'], set()):
        p['budget'] = db.one('SELECT * FROM v_project_budget_summary WHERE project_id = :p', p=pid)
    p['post'] = db.one('SELECT * FROM post_production WHERE project_id = :p', p=pid)
    p['script'] = db.one('SELECT script_id, title, page_count, status FROM scripts WHERE project_id = :p', p=pid)
    return p


@router.get('/projects/{pid}/scenes')
def scenes(pid: int, q: str = '', status: str = '', page: int = 1, size: int = 20, user: dict = Depends(S.current_user)):
    size, off = db.page_args(page, size)
    where = "WHERE s.project_id = :p AND (:q = '' OR s.heading LIKE :like OR s.location_type LIKE :like) AND (:st = '' OR s.status = :st)"
    a = dict(p=pid, q=q, like=f'%{q}%', st=status)
    total = db.scalar(f'SELECT COUNT(*) FROM scenes s {where}', **a)
    items = db.rows(f"""SELECT s.scene_id, s.scene_number, s.heading, s.interior_exterior, s.location_type, s.time_of_day, s.estimated_duration, s.actual_duration_hours,
                               s.complexity_score, s.status, s.vfx_required, s.stunt_required, s.night_shoot, s.weather_dependent, s.crew_required, s.equipment_required,
                               l.name location, (SELECT COUNT(*) FROM scene_characters sc WHERE sc.scene_id = s.scene_id) cast_count
                        FROM scenes s LEFT JOIN locations l ON l.location_id = s.location_id {where}
                        ORDER BY s.sequence_number, s.scene_id LIMIT :size OFFSET :off""", size=size, off=off, **a)
    return dict(total=total, items=items)


@router.get('/scenes/{sid}')
def scene(sid: int, user: dict = Depends(S.current_user)):
    s = db.one("""SELECT s.*, l.name location, l.location_type loc_kind, p.project_code, p.project_name FROM scenes s
                  LEFT JOIN locations l ON l.location_id = s.location_id JOIN projects p ON p.project_id = s.project_id WHERE s.scene_id = :s""", s=sid)
    if not s: raise HTTPException(404, 'Scene not found')
    s['characters'] = db.rows("""SELECT ch.character_id, ch.character_name, ch.character_type, sc.importance,
                                        (SELECT pe.name FROM cast_assignments ca JOIN people pe ON pe.person_id = ca.person_id
                                          WHERE ca.character_id = ch.character_id AND ca.project_id = :p LIMIT 1) actor
                                 FROM scene_characters sc JOIN characters ch ON ch.character_id = sc.character_id WHERE sc.scene_id = :s
                                 ORDER BY sc.importance DESC""", s=sid, p=s['project_id'])
    s['equipment'] = db.rows("""SELECT e.equipment_name, e.category, se.quantity, v.vendor_name FROM scene_equipment se
                                JOIN equipment_rentals er ON er.rental_id = se.rental_id JOIN equipment e ON e.equipment_id = er.equipment_id
                                LEFT JOIN vendors v ON v.vendor_id = er.vendor_id WHERE se.scene_id = :s""", s=sid)
    s['shoots'] = db.rows("""SELECT sds.shoot_day_scene_id, sds.shoot_day_id, sd.shoot_date, sd.day_number, sds.planned_start, sds.planned_end,
                                    sds.actual_start, sds.actual_end, sds.status, sds.delay_minutes
                             FROM shoot_day_scenes sds JOIN shoot_days sd ON sd.shoot_day_id = sds.shoot_day_id WHERE sds.scene_id = :s ORDER BY sd.shoot_date""", s=sid)
    return s


# ------------------------------------------------------------------ schedule
@router.get('/projects/{pid}/schedule')
def schedule(pid: int, user: dict = Depends(S.current_user)):
    return db.rows("""SELECT shoot_day_id, shoot_date, day_number, location_name, planned_hours, actual_hours, weather_condition, status, day_delay_minutes,
                             scenes_planned, scenes_completed, crew_present, crew_absent, delays_today, delay_minutes_logged
                      FROM v_daily_production_report WHERE project_id = :p ORDER BY shoot_date, day_number""", p=pid)


@router.get('/shoot-days/{did}')
def shoot_day(did: int, user: dict = Depends(S.current_user)):
    d = db.one("""SELECT sd.*, l.name location, l.location_type, p.project_code, p.project_name FROM shoot_days sd JOIN locations l ON l.location_id = sd.location_id
                  JOIN projects p ON p.project_id = sd.project_id WHERE sd.shoot_day_id = :d""", d=did)
    if not d: raise HTTPException(404, 'Shoot day not found')
    d['scenes'] = db.rows("""SELECT sds.shoot_day_scene_id, s.scene_id, s.scene_number, s.heading, s.complexity_score, sds.planned_start, sds.planned_end,
                                    sds.actual_start, sds.actual_end, sds.status, sds.delay_minutes
                             FROM shoot_day_scenes sds JOIN scenes s ON s.scene_id = sds.scene_id WHERE sds.shoot_day_id = :d ORDER BY sds.planned_start""", d=did)
    d['crew'] = db.rows("""SELECT ca.assignment_id, pe.person_id, pe.name, r.role_name, dp.department_name, ca.call_time, ca.wrap_time, ca.hours_worked, ca.overtime_hours, ca.attendance_status
                           FROM crew_assignments ca JOIN people pe ON pe.person_id = ca.person_id JOIN industry_roles r ON r.role_id = ca.role_id
                           JOIN departments dp ON dp.department_id = r.department_id WHERE ca.shoot_day_id = :d ORDER BY dp.department_name, r.role_name""", d=did)
    d['events'] = db.rows("""SELECT e.event_id, e.event_type, e.severity, e.description, e.duration_minutes, e.resolved, dp.department_name FROM production_events e
                             JOIN departments dp ON dp.department_id = e.department_id WHERE e.shoot_day_id = :d ORDER BY e.start_time""", d=did)
    d['delays'] = db.rows("""SELECT x.delay_id, x.delay_type, x.cause, x.delay_minutes, x.severity, x.cost_impact, dp.department_name FROM production_delays x
                             JOIN departments dp ON dp.department_id = x.department_id WHERE x.shoot_day_id = :d ORDER BY x.delay_minutes DESC""", d=did)
    return d


class Wrap(BaseModel):
    delay_minutes: int = Field(0, ge=0, le=600)


@router.post('/shoot-day-scenes/{sid}/wrap')
def wrap_scene(sid: int, body: Wrap, user: dict = Depends(S.require('schedule_write'))):
    """Wrap a scene. The TRIGGER trg_shoot_day_scenes_bu then computes delay_minutes and sets the status itself."""
    row = db.one('SELECT shoot_day_scene_id, scene_id, planned_end FROM shoot_day_scenes WHERE shoot_day_scene_id = :s', s=sid)
    if not row: raise HTTPException(404, 'Not found')
    try:
        with db.app_engine.begin() as c:
            c.execute(text("""UPDATE shoot_day_scenes SET actual_start = COALESCE(actual_start, planned_start),
                              actual_end = DATE_ADD(planned_end, INTERVAL :m MINUTE) WHERE shoot_day_scene_id = :s"""), dict(m=body.delay_minutes, s=sid))
            c.execute(text("UPDATE scenes SET status = 'Completed' WHERE scene_id = :x"), dict(x=row['scene_id']))
    except DBAPIError as e:
        raise db_error(e)
    return db.one('SELECT shoot_day_scene_id, status, delay_minutes, actual_end FROM shoot_day_scenes WHERE shoot_day_scene_id = :s', s=sid)


class DelayIn(BaseModel):
    delay_type: str
    cause: str = Field(min_length=3, max_length=100)
    delay_minutes: int = Field(gt=0, le=720)
    severity: str = 'Moderate'
    department_id: int
    cost_impact: float = 0


@router.post('/shoot-days/{did}/delays')
def log_delay(did: int, body: DelayIn, user: dict = Depends(S.require('schedule_write'))):
    d = db.one('SELECT project_id FROM shoot_days WHERE shoot_day_id = :d', d=did)
    if not d: raise HTTPException(404, 'Shoot day not found')
    try:
        with db.app_engine.begin() as c:
            r = c.execute(text("""INSERT INTO production_delays (project_id, shoot_day_id, delay_type, cause, delay_minutes, severity, weather_related, equipment_related,
                                  crew_related, location_related, cost_impact, department_id)
                                  VALUES (:p, :d, :t, :c, :m, :s, :w, :e, :cr, :l, :ci, :dp)"""),
                          dict(p=d['project_id'], d=did, t=body.delay_type, c=body.cause, m=body.delay_minutes, s=body.severity,
                               w=int(body.delay_type == 'Weather'), e=int(body.delay_type in ('Equipment', 'Technical', 'Power')), cr=int(body.delay_type == 'Cast'),
                               l=int(body.delay_type in ('Location', 'Permit')), ci=body.cost_impact, dp=body.department_id))
            return dict(delay_id=r.lastrowid)
    except DBAPIError as e:
        raise db_error(e)


# ------------------------------------------------------------------ people on a project
@router.get('/projects/{pid}/people')
def project_people(pid: int, user: dict = Depends(S.current_user)):
    cast = db.rows("""SELECT ca.cast_assignment_id, pe.person_id, pe.name, ch.character_name, ch.character_type, ca.assignment_type, ca.status,
                             ca.salary, (SELECT COUNT(*) FROM scene_characters sc WHERE sc.character_id = ch.character_id) scenes
                      FROM cast_assignments ca JOIN people pe ON pe.person_id = ca.person_id JOIN characters ch ON ch.character_id = ca.character_id
                      WHERE ca.project_id = :p ORDER BY ch.importance_level DESC, ca.salary DESC""", p=pid)
    crew = db.rows("""SELECT pp.project_person_id, pe.person_id, pe.name, r.role_name, dp.department_name, pp.employment_type, pp.daily_rate, pp.status
                      FROM project_people pp JOIN people pe ON pe.person_id = pp.person_id JOIN industry_roles r ON r.role_id = pp.role_id
                      JOIN departments dp ON dp.department_id = r.department_id WHERE pp.project_id = :p ORDER BY dp.department_name, r.role_name""", p=pid)
    util = db.rows("""SELECT pe.person_id, pe.name, COUNT(*) days_booked, SUM(ca.attendance_status <> 'Absent') days_worked, ROUND(SUM(ca.hours_worked),1) hours,
                             ROUND(SUM(ca.overtime_hours),1) overtime
                      FROM crew_assignments ca JOIN shoot_days sd ON sd.shoot_day_id = ca.shoot_day_id JOIN people pe ON pe.person_id = ca.person_id
                      WHERE sd.project_id = :p GROUP BY pe.person_id, pe.name ORDER BY hours DESC LIMIT 15""", p=pid)
    return dict(cast=cast, crew=crew, utilisation=util)


# ------------------------------------------------------------------ money
@router.get('/projects/{pid}/budget')
def budget(pid: int, user: dict = Depends(S.require('finance_view'))):
    b = db.one('SELECT * FROM v_project_budget_summary WHERE project_id = :p', p=pid)
    cats = db.rows("""SELECT budget_department_id, category, allocated_amount, spent_amount, remaining_amount, pct_used, budget_state
                      FROM v_budget_category_status WHERE project_id = :p ORDER BY spent_amount DESC""", p=pid)
    exp = db.rows("""SELECT e.expense_id, e.expense_date, e.expense_category, e.description, e.amount, e.payment_status, bd.category budget_category,
                            v.vendor_name, pe.name approved_by FROM expenses e JOIN budget_departments bd ON bd.budget_department_id = e.budget_department_id
                     LEFT JOIN vendors v ON v.vendor_id = e.vendor_id LEFT JOIN people pe ON pe.person_id = e.approved_by
                     WHERE e.project_id = :p ORDER BY e.expense_date DESC, e.expense_id DESC LIMIT 60""", p=pid)
    monthly = db.rows("""SELECT DATE_FORMAT(expense_date, '%Y-%m') ym, ROUND(SUM(amount)) total FROM expenses WHERE project_id = :p GROUP BY ym ORDER BY ym""", p=pid)
    contracts = db.rows("""SELECT c.contract_id, c.contract_type, c.status, c.contract_value, c.start_date, c.end_date, COALESCE(pe.name, v.vendor_name) party,
                                  (SELECT COALESCE(SUM(py.amount),0) FROM payments py WHERE py.contract_id = c.contract_id) paid
                           FROM contracts c LEFT JOIN people pe ON pe.person_id = c.person_id LEFT JOIN vendors v ON v.vendor_id = c.vendor_id
                           WHERE c.project_id = :p ORDER BY c.contract_value DESC LIMIT 40""", p=pid)
    return dict(summary=b, categories=cats, expenses=exp, monthly=monthly, contracts=contracts)


class ExpenseIn(BaseModel):
    budget_department_id: int
    expense_category: str
    description: str = Field(min_length=2, max_length=50)
    amount: float = Field(gt=0)


@router.post('/projects/{pid}/expenses')
def add_expense(pid: int, body: ExpenseIn, user: dict = Depends(S.require('finance_write'))):
    """Book an expense by calling the stored procedure sp_add_expense. TRIGGERS then update the budget and may block it."""
    ok = db.one("""SELECT bd.budget_department_id FROM budget_departments bd JOIN budgets b ON b.budget_id = bd.budget_id
                   WHERE bd.budget_department_id = :bd AND b.project_id = :p""", bd=body.budget_department_id, p=pid)
    if not ok: raise HTTPException(400, 'That budget category does not belong to this project')
    try:
        with db.app_engine.begin() as c:
            before = c.execute(text('SELECT spent_amount FROM budget_departments WHERE budget_department_id = :b'), dict(b=body.budget_department_id)).scalar()
            new_id = c.execute(text('CALL sp_add_expense(:bd, :cat, :d, :a, :pe)'),
                               dict(bd=body.budget_department_id, cat=body.expense_category, d=body.description, a=body.amount, pe=user.get('pid'))).scalar()
            after = c.execute(text('SELECT spent_amount, remaining_amount FROM budget_departments WHERE budget_department_id = :b'), dict(b=body.budget_department_id)).one()
    except DBAPIError as e:
        raise db_error(e)
    return dict(expense_id=new_id, spent_before=float(before), spent_after=float(after[0]), remaining=float(after[1]))


class TransferIn(BaseModel):
    from_id: int
    to_id: int
    amount: float = Field(gt=0)


@router.post('/budget/transfer')
def transfer(body: TransferIn, user: dict = Depends(S.require('finance_write'))):
    """Move budget between two categories: stored procedure sp_transfer_budget = one all-or-nothing TRANSACTION."""
    try:
        with db.app_engine.begin() as c:
            c.execute(text('CALL sp_transfer_budget(:f, :t, :a)'), dict(f=body.from_id, t=body.to_id, a=body.amount))
    except DBAPIError as e:
        raise db_error(e)
    rows = db.rows('SELECT budget_department_id, category, allocated_amount, spent_amount, remaining_amount FROM budget_departments WHERE budget_department_id IN (:a, :b)', a=body.from_id, b=body.to_id)
    return dict(ok=True, categories=rows)


class StatusIn(BaseModel):
    status: str


@router.post('/budgets/{bid}/status')
def budget_status(bid: int, body: StatusIn, user: dict = Depends(S.require('finance_write'))):
    """Change a budget's status. The TRIGGER trg_budgets_au writes the audit-trail row (who = @app_user_id)."""
    if body.status not in ('Draft', 'Approved', 'Closed'): raise HTTPException(400, 'Invalid status')
    try:
        with db.app_engine.begin() as c:
            c.execute(text('SET @app_user_id = :u'), dict(u=user['uid']))
            r = c.execute(text('UPDATE budgets SET status = :s WHERE budget_id = :b'), dict(s=body.status, b=bid))
    except DBAPIError as e:
        raise db_error(e)
    return dict(ok=True, changed=r.rowcount)


# ------------------------------------------------------------------ resources / issues / post / distribution
@router.get('/projects/{pid}/equipment')
def equipment(pid: int, user: dict = Depends(S.current_user)):
    rentals = db.rows("""SELECT * FROM v_equipment_usage WHERE project_id = :p ORDER BY start_date""", p=pid)
    bookings = db.rows("""SELECT lb.booking_id, l.name location, l.location_type, lb.start_date, lb.end_date, lb.booking_cost, lb.status, lb.permit_status
                          FROM location_bookings lb JOIN locations l ON l.location_id = lb.location_id WHERE lb.project_id = :p ORDER BY lb.start_date""", p=pid)
    return dict(rentals=rentals, bookings=bookings)


@router.get('/projects/{pid}/issues')
def issues(pid: int, user: dict = Depends(S.current_user)):
    summary = db.rows('SELECT delay_type, delay_count, total_minutes, total_hours, total_cost_impact FROM v_delay_summary WHERE project_id = :p ORDER BY total_minutes DESC', p=pid)
    delays = db.rows("""SELECT x.delay_id, sd.shoot_date, x.delay_type, x.cause, x.delay_minutes, x.severity, x.cost_impact, dp.department_name
                        FROM production_delays x JOIN shoot_days sd ON sd.shoot_day_id = x.shoot_day_id JOIN departments dp ON dp.department_id = x.department_id
                        WHERE x.project_id = :p ORDER BY sd.shoot_date DESC LIMIT 60""", p=pid)
    events = db.rows("""SELECT e.event_id, sd.shoot_date, e.event_type, e.severity, e.description, e.duration_minutes, e.resolved, dp.department_name
                        FROM production_events e JOIN shoot_days sd ON sd.shoot_day_id = e.shoot_day_id JOIN departments dp ON dp.department_id = e.department_id
                        WHERE e.project_id = :p ORDER BY sd.shoot_date DESC LIMIT 60""", p=pid)
    return dict(summary=summary, delays=delays, events=events)


@router.get('/projects/{pid}/post')
def post(pid: int, user: dict = Depends(S.current_user)):
    return dict(post=db.one('SELECT * FROM post_production WHERE project_id = :p', p=pid),
                tasks=db.rows("""SELECT t.task_id, t.task_category, t.task_type, t.start_date, t.due_date, t.completion_date, t.progress, t.status, pe.name assignee
                                 FROM postproduction_tasks t LEFT JOIN people pe ON pe.person_id = t.assigned_to WHERE t.project_id = :p ORDER BY t.start_date""", p=pid),
                releases=db.rows("""SELECT d.distribution_id, d.platform, d.territory, d.release_type, d.release_date, d.certificate, d.deal_value, d.status,
                                           di.name distributor, l.language_name FROM distribution d LEFT JOIN distributors di ON di.distributor_id = d.distributor_id
                                    LEFT JOIN languages l ON l.language_id = d.language_id WHERE d.project_id = :p ORDER BY d.release_date""", p=pid))
