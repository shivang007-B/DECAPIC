"""People, films, resources (equipment / vendors / locations / companies) and global search."""
from fastapi import APIRouter, Depends, HTTPException
from .. import db, security as S

router = APIRouter(prefix='/api', tags=['catalog'])


@router.get('/people')
def people(q: str = '', department_id: int = 0, role_id: int = 0, availability: str = '', page: int = 1, size: int = 24, user: dict = Depends(S.current_user)):
    size, off = db.page_args(page, size)
    where = """WHERE (:q = '' OR pe.name LIKE :like) AND (:av = '' OR pe.availability_status = :av)
               AND (:r = 0 OR EXISTS (SELECT 1 FROM person_roles x WHERE x.person_id = pe.person_id AND x.role_id = :r))
               AND (:d = 0 OR EXISTS (SELECT 1 FROM person_roles x JOIN industry_roles ir ON ir.role_id = x.role_id WHERE x.person_id = pe.person_id AND ir.department_id = :d))"""
    a = dict(q=q, like=f'%{q}%', av=availability, r=role_id, d=department_id)
    total = db.scalar(f'SELECT COUNT(*) FROM people pe {where}', **a)
    items = db.rows(f"""SELECT pe.person_id, pe.name, pe.gender, pe.availability_status, pe.birth_year, c.country_name,
                               (SELECT GROUP_CONCAT(ir.role_name ORDER BY pr.experience_years DESC SEPARATOR ', ') FROM person_roles pr JOIN industry_roles ir ON ir.role_id = pr.role_id
                                 WHERE pr.person_id = pe.person_id) roles,
                               (SELECT COUNT(DISTINCT sd.project_id) FROM crew_assignments ca JOIN shoot_days sd ON sd.shoot_day_id = ca.shoot_day_id WHERE ca.person_id = pe.person_id) projects
                        FROM people pe LEFT JOIN countries c ON c.country_id = pe.country_id {where} ORDER BY pe.name, pe.person_id LIMIT :size OFFSET :off""", size=size, off=off, **a)
    return dict(total=total, items=items)


@router.get('/people/{pid}')
def person(pid: int, user: dict = Depends(S.current_user)):
    p = db.one("""SELECT pe.*, c.country_name, ci.city_name FROM people pe LEFT JOIN countries c ON c.country_id = pe.country_id
                  LEFT JOIN cities ci ON ci.city_id = pe.city_id WHERE pe.person_id = :p""", p=pid)
    if not p: raise HTTPException(404, 'Person not found')
    for k in ('contact_email', 'phone'):                           # contact details only for roles that may see finance data
        if 'finance_view' not in S.ROLE_PERMS.get(user['role'], set()): p[k] = None
    p['roles'] = db.rows("""SELECT ir.role_name, d.department_name, pr.skill_level, pr.experience_years, pr.specialization FROM person_roles pr
                            JOIN industry_roles ir ON ir.role_id = pr.role_id JOIN departments d ON d.department_id = ir.department_id
                            WHERE pr.person_id = :p ORDER BY pr.experience_years DESC""", p=pid)
    p['utilisation'] = db.one('SELECT days_booked, days_worked, total_hours, overtime_hours, avg_daily_rate, projects_worked FROM v_crew_utilization WHERE person_id = :p', p=pid)
    p['credits'] = db.rows("""SELECT * FROM (
          SELECT p.project_id, p.project_code, f.title, 'Cast' kind, ch.character_name detail, ca.start_date FROM cast_assignments ca JOIN projects p ON p.project_id = ca.project_id
            JOIN films f ON f.film_id = p.film_id JOIN characters ch ON ch.character_id = ca.character_id WHERE ca.person_id = :p
          UNION ALL
          SELECT p.project_id, p.project_code, f.title, 'Key crew', ir.role_name, pp.start_date FROM project_people pp JOIN projects p ON p.project_id = pp.project_id
            JOIN films f ON f.film_id = p.film_id JOIN industry_roles ir ON ir.role_id = pp.role_id WHERE pp.person_id = :p
          UNION ALL
          SELECT p.project_id, p.project_code, f.title, 'Crew', ir.role_name, MIN(sd.shoot_date) FROM crew_assignments ca JOIN shoot_days sd ON sd.shoot_day_id = ca.shoot_day_id
            JOIN projects p ON p.project_id = sd.project_id JOIN films f ON f.film_id = p.film_id JOIN industry_roles ir ON ir.role_id = ca.role_id WHERE ca.person_id = :p
            GROUP BY p.project_id, p.project_code, f.title, ir.role_name) t ORDER BY start_date DESC LIMIT 40""", p=pid)
    return p


@router.get('/films')
def films(q: str = '', genre_id: int = 0, status: str = '', page: int = 1, size: int = 24, user: dict = Depends(S.current_user)):
    size, off = db.page_args(page, size)
    where = """WHERE (:q = '' OR f.title LIKE :like) AND (:g = 0 OR EXISTS (SELECT 1 FROM film_genres x WHERE x.film_id = f.film_id AND x.genre_id = :g))
               AND (:st = '' OR p.production_status = :st)"""
    a = dict(q=q, like=f'%{q}%', g=genre_id, st=status)
    total = db.scalar(f'SELECT COUNT(*) FROM films f JOIN projects p ON p.film_id = f.film_id {where}', **a)
    items = db.rows(f"""SELECT f.film_id, f.title, f.release_year, f.runtime_minutes, f.imdb_rating, f.certificate, p.project_id, p.project_code, p.production_status,
                               p.approved_budget, (SELECT GROUP_CONCAT(g.genre_name ORDER BY fg.is_primary DESC SEPARATOR ', ') FROM film_genres fg JOIN genres g ON g.genre_id = fg.genre_id
                                                    WHERE fg.film_id = f.film_id) genres
                        FROM films f JOIN projects p ON p.film_id = f.film_id {where} ORDER BY f.imdb_rating DESC, f.title LIMIT :size OFFSET :off""", size=size, off=off, **a)
    return dict(total=total, items=items)


@router.get('/resources/{kind}')
def resources(kind: str, q: str = '', category: str = '', page: int = 1, size: int = 24, user: dict = Depends(S.current_user)):
    size, off = db.page_args(page, size)
    like = f'%{q}%'
    if kind == 'equipment':
        where = "WHERE (:q = '' OR e.equipment_name LIKE :like OR e.manufacturer LIKE :like) AND (:c = '' OR e.category = :c)"
        a = dict(q=q, like=like, c=category)
        total = db.scalar(f'SELECT COUNT(*) FROM equipment e {where}', **a)
        items = db.rows(f"""SELECT e.equipment_id id, e.equipment_name name, e.category, e.manufacturer, e.model, e.daily_rental_rate, e.availability_status, e.equipment_condition,
                                   v.vendor_name vendor, (SELECT COUNT(*) FROM equipment_rentals r WHERE r.equipment_id = e.equipment_id) rentals,
                                   (SELECT COALESCE(SUM(r.actual_cost),0) FROM equipment_rentals r WHERE r.equipment_id = e.equipment_id) revenue
                            FROM equipment e LEFT JOIN vendors v ON v.vendor_id = e.vendor_id {where} ORDER BY rentals DESC, e.equipment_name LIMIT :size OFFSET :off""", size=size, off=off, **a)
    elif kind == 'vendors':
        where = "WHERE (:q = '' OR v.vendor_name LIKE :like) AND (:c = '' OR v.vendor_type = :c)"
        a = dict(q=q, like=like, c=category)
        total = db.scalar(f'SELECT COUNT(*) FROM vendors v {where}', **a)
        items = db.rows(f"""SELECT v.vendor_id id, v.vendor_name name, v.vendor_type category, v.rating, v.status, c.country_name,
                                   (SELECT COUNT(*) FROM equipment e WHERE e.vendor_id = v.vendor_id) equipment,
                                   (SELECT COALESCE(SUM(x.amount),0) FROM expenses x WHERE x.vendor_id = v.vendor_id) spend
                            FROM vendors v LEFT JOIN countries c ON c.country_id = v.country_id {where} ORDER BY spend DESC, v.vendor_name LIMIT :size OFFSET :off""", size=size, off=off, **a)
    elif kind == 'locations':
        where = "WHERE (:q = '' OR l.name LIKE :like) AND (:c = '' OR l.location_type = :c)"
        a = dict(q=q, like=like, c=category)
        total = db.scalar(f'SELECT COUNT(*) FROM locations l {where}', **a)
        items = db.rows(f"""SELECT l.location_id id, l.name, l.location_type category, l.indoor_outdoor, l.base_cost, l.availability_status, ci.city_name, c.country_name,
                                   (SELECT COUNT(*) FROM shoot_days sd WHERE sd.location_id = l.location_id) shoot_days
                            FROM locations l LEFT JOIN cities ci ON ci.city_id = l.city_id LEFT JOIN countries c ON c.country_id = l.country_id {where}
                            ORDER BY shoot_days DESC, l.name LIMIT :size OFFSET :off""", size=size, off=off, **a)
    elif kind == 'companies':
        where = "WHERE (:q = '' OR ph.name LIKE :like)"
        a = dict(q=q, like=like)
        total = db.scalar(f'SELECT COUNT(*) FROM production_houses ph {where}', **a)
        items = db.rows(f"""SELECT ph.production_house_id id, ph.name, ph.company_size category, ph.status, ph.founded_year, c.country_name,
                                   (SELECT COUNT(*) FROM project_production_houses x WHERE x.production_house_id = ph.production_house_id) projects
                            FROM production_houses ph LEFT JOIN countries c ON c.country_id = ph.country_id {where} ORDER BY projects DESC, ph.name LIMIT :size OFFSET :off""", size=size, off=off, **a)
    else:
        raise HTTPException(404, 'Unknown resource type')
    cats = {'equipment': "SELECT DISTINCT category x FROM equipment ORDER BY 1", 'vendors': "SELECT DISTINCT vendor_type x FROM vendors ORDER BY 1",
            'locations': "SELECT DISTINCT location_type x FROM locations ORDER BY 1"}.get(kind)
    return dict(total=total, items=items, categories=[r['x'] for r in db.rows(cats)] if cats else [])


@router.get('/search')
def search(q: str = '', user: dict = Depends(S.current_user)):
    q = q.strip()
    if len(q) < 2: return dict(results=[])
    like = f'%{q}%'; res = []
    for r in db.rows("""SELECT p.project_id id, p.project_code sub, f.title label FROM projects p JOIN films f ON f.film_id = p.film_id
                        WHERE f.title LIKE :l OR p.project_name LIKE :l OR p.project_code LIKE :l ORDER BY f.title LIMIT 6""", l=like):
        res.append(dict(type='project', id=r['id'], label=r['label'], sub=r['sub']))
    for r in db.rows("""SELECT pe.person_id id, pe.name label, (SELECT ir.role_name FROM person_roles pr JOIN industry_roles ir ON ir.role_id = pr.role_id
                        WHERE pr.person_id = pe.person_id ORDER BY pr.experience_years DESC LIMIT 1) sub FROM people pe WHERE pe.name LIKE :l ORDER BY pe.name LIMIT 6""", l=like):
        res.append(dict(type='person', id=r['id'], label=r['label'], sub=r['sub'] or 'Cast / crew'))
    for r in db.rows("SELECT vendor_id id, vendor_name label, vendor_type sub FROM vendors WHERE vendor_name LIKE :l LIMIT 3", l=like):
        res.append(dict(type='vendor', id=r['id'], label=r['label'], sub=r['sub']))
    for r in db.rows("""SELECT s.scene_id id, s.heading label, CONCAT(p.project_code, ' · scene ', s.scene_number) sub FROM scenes s JOIN projects p ON p.project_id = s.project_id
                        WHERE s.heading LIKE :l LIMIT 4""", l=like):
        res.append(dict(type='scene', id=r['id'], label=r['label'], sub=r['sub']))
    return dict(results=res)
