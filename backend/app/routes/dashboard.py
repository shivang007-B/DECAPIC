from fastapi import APIRouter, Depends
from .. import db, security as S

router = APIRouter(prefix='/api', tags=['dashboard'])


@router.get('/dashboard')
def dashboard(user: dict = Depends(S.current_user)):
    fin = 'finance_view' in S.ROLE_PERMS.get(user['role'], set())
    k = db.one("""SELECT
        (SELECT COUNT(*) FROM projects) projects,
        (SELECT COUNT(*) FROM projects WHERE production_status IN ('In Production','Pre-production','Post-production')) active_projects,
        (SELECT COUNT(*) FROM films) films, (SELECT COUNT(*) FROM people) people,
        (SELECT COUNT(*) FROM scenes) scenes, (SELECT COUNT(*) FROM shoot_days) shoot_days,
        (SELECT COUNT(*) FROM production_delays) delays,
        (SELECT COALESCE(SUM(delay_minutes),0)/60 FROM production_delays) delay_hours,
        (SELECT COALESCE(SUM(approved_amount),0) FROM budgets) approved_budget,
        (SELECT COALESCE(SUM(spent_amount),0) FROM budget_departments) spent,
        (SELECT COUNT(*) FROM v_project_budget_summary WHERE is_over_budget = 1) over_budget_projects,
        (SELECT COUNT(*) FROM equipment) equipment, (SELECT COUNT(*) FROM locations) locations""")
    out = dict(kpis=k, can_see_finance=fin)
    out['status'] = db.rows("SELECT production_status label, COUNT(*) n FROM projects GROUP BY production_status ORDER BY n DESC")
    out['types'] = db.rows("SELECT project_type label, COUNT(*) n FROM projects GROUP BY project_type ORDER BY n DESC")
    out['delay_types'] = db.rows("SELECT delay_type label, COUNT(*) n, ROUND(SUM(delay_minutes)/60,1) hours FROM production_delays GROUP BY delay_type ORDER BY hours DESC")
    out['genres'] = db.rows("""SELECT g.genre_name label, COUNT(*) n FROM film_genres fg JOIN genres g ON g.genre_id = fg.genre_id
                               JOIN projects p ON p.film_id = fg.film_id GROUP BY g.genre_name ORDER BY n DESC LIMIT 8""")
    out['recent_days'] = db.rows("""SELECT sd.shoot_day_id, sd.project_id, p.project_code, sd.shoot_date, sd.status, l.name location, sd.delay_minutes
                                    FROM shoot_days sd JOIN projects p ON p.project_id = sd.project_id JOIN locations l ON l.location_id = sd.location_id
                                    WHERE p.production_status = 'In Production' ORDER BY sd.shoot_date DESC LIMIT 6""")
    if fin:
        out['budget_top'] = db.rows("""SELECT project_id, project_code, project_name, approved_amount approved, spent_amount spent, pct_of_approved_spent pct
                                       FROM v_project_budget_summary ORDER BY spent_amount DESC LIMIT 8""")
        out['expense_categories'] = db.rows("SELECT expense_category label, ROUND(SUM(amount)) total FROM expenses GROUP BY expense_category ORDER BY total DESC LIMIT 10")
        out['expense_years'] = db.rows("SELECT YEAR(expense_date) label, ROUND(SUM(amount)) total FROM expenses GROUP BY YEAR(expense_date) ORDER BY label")
        out['overruns'] = db.rows("""SELECT project_id, project_code, project_name, pct_of_approved_spent pct, spent_amount spent, approved_amount approved
                                     FROM v_project_budget_summary WHERE is_over_budget = 1 ORDER BY pct_of_approved_spent DESC LIMIT 6""")
    out['activity'] = db.rows("""SELECT a.audit_id, a.action, a.entity_type, a.entity_id, a.new_value, a.logged_at, COALESCE(pe.name, u.email, 'System') actor
                                 FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id LEFT JOIN people pe ON pe.person_id = u.person_id
                                 ORDER BY a.logged_at DESC, a.audit_id DESC LIMIT 8""")
    return out


@router.get('/meta')
def meta(user: dict = Depends(S.current_user)):
    enum = lambda t, c: db.scalar("SELECT column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c", t=t, c=c)

    def vals(ct):
        import re
        return re.findall(r"'((?:[^']|'')*)'", ct or '')
    return dict(
        expense_categories=vals(enum('expenses', 'expense_category')), delay_types=vals(enum('production_delays', 'delay_type')),
        delay_severity=vals(enum('production_delays', 'severity')), budget_status=vals(enum('budgets', 'status')),
        production_status=vals(enum('projects', 'production_status')), project_types=vals(enum('projects', 'project_type')),
        priorities=vals(enum('projects', 'priority')), location_types=vals(enum('scenes', 'location_type')),
        departments=db.rows('SELECT department_id id, department_name name FROM departments ORDER BY department_name'),
        roles=db.rows('SELECT role_id id, role_name name, department_id FROM industry_roles ORDER BY role_name'),
        genres=db.rows('SELECT genre_id id, genre_name name FROM genres ORDER BY genre_name'),
        equipment_categories=vals(enum('equipment', 'category')))
