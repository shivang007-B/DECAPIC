"""SQL Lab: browse the database, run read-only queries, try the triggers/procedures (always rolled back)."""
import re, time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from .. import db, config as C, security as S

router = APIRouter(prefix='/api/lab', tags=['lab'], dependencies=[Depends(S.require('lab'))])
SAFE = re.compile(r'^\s*(select|with|show|describe|desc|explain)\b', re.I)
BAD = re.compile(r'\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|call|load|outfile|dumpfile|sleep|benchmark|set\s+global|lock|handler)\b', re.I)


def _triggers():
    src = (C.SQL_DIR / '04_triggers_procedures.sql').read_text(encoding='utf-8')
    return [dict(name=m.group(1), timing=m.group(2).upper(), event=m.group(3).upper(), tbl=m.group(4))
            for m in re.finditer(r'CREATE TRIGGER (\w+)\s+(BEFORE|AFTER)\s+(INSERT|UPDATE|DELETE)\s+ON\s+(\w+)', src, re.I)]


@router.get('/overview')
def overview():
    tables = db.rows("SELECT table_name name, table_rows approx, table_comment comment FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name")
    for t in tables:
        t['rows'] = db.scalar(f"SELECT COUNT(*) FROM `{t['name']}`")
        t.pop('approx', None)
    views = [r['name'] for r in db.rows("SELECT table_name name FROM information_schema.views WHERE table_schema = DATABASE() ORDER BY 1")]
    trig = _triggers()
    rout = db.rows("SELECT routine_name name, routine_type type FROM information_schema.routines WHERE routine_schema = DATABASE() ORDER BY 2, 1")
    fks = db.scalar("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_type = 'FOREIGN KEY'")
    checks = db.scalar("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_type = 'CHECK'")
    return dict(tables=tables, views=views, triggers=trig, routines=rout, fks=fks, checks=checks, total_rows=sum(t['rows'] for t in tables))


@router.get('/table/{name}')
def table(name: str, limit: int = 25, offset: int = 0):
    if not re.fullmatch(r'[A-Za-z0-9_]+', name): raise HTTPException(400, 'bad name')
    exists = db.scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :n", n=name)
    if not exists: raise HTTPException(404, 'No such table')
    cols = db.rows("""SELECT column_name name, column_type type, is_nullable = 'YES' nullable, column_key `key`, extra FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = :n ORDER BY ordinal_position""", n=name)
    fks = db.rows("""SELECT column_name col, referenced_table_name ref_table, referenced_column_name ref_col FROM information_schema.key_column_usage
                     WHERE table_schema = DATABASE() AND table_name = :n AND referenced_table_name IS NOT NULL""", n=name)
    limit = max(1, min(limit, 100))
    data = db.rows(f'SELECT * FROM `{name}` LIMIT :l OFFSET :o', l=limit, o=max(0, offset))
    return dict(name=name, columns=cols, fks=fks, rows=data, total=db.scalar(f'SELECT COUNT(*) FROM `{name}`'))


class Query(BaseModel):
    sql: str


def run_readonly(sql: str, maxrows=500):
    sql = sql.strip().rstrip(';').strip()
    if not sql: raise HTTPException(400, 'Type a query first')
    if ';' in sql: raise HTTPException(400, 'Only one statement at a time')
    if not SAFE.match(sql) or BAD.search(sql): raise HTTPException(400, 'SQL Lab is read-only: use SELECT, WITH, SHOW, DESCRIBE or EXPLAIN')
    t0 = time.time()
    try:
        with db.ro_engine.connect() as c:
            c.execute(text('SET SESSION max_execution_time = 8000'))
            res = c.execute(text(sql))
            cols = list(res.keys()); data = [list(r) for r in res.fetchmany(maxrows + 1)]
    except DBAPIError as e:
        raise HTTPException(400, str(getattr(e, 'orig', e)))
    return dict(columns=cols, rows=data[:maxrows], truncated=len(data) > maxrows, ms=round((time.time() - t0) * 1000))


@router.post('/query')
def query(q: Query):
    return run_readonly(q.sql)


def _samples():
    out, cur = [], None
    for line in (C.SQL_DIR / '06_sample_queries.sql').read_text(encoding='utf-8').splitlines():
        m = re.match(r'-- (Q\d+)\.\s*(.*)', line)
        sec = re.match(r'-- #+\s*([A-I])\.\s*(.*?)\s*(\(|#|$)', line)
        if sec: cur_sec = sec.group(2).strip().title(); continue
        if m:
            out.append(dict(id=m.group(1), title=m.group(2).strip(), sql=[], section=locals().get('cur_sec', '')))
        elif out and line.strip() and not line.startswith('--') and not line.startswith('USE '):
            out[-1]['sql'].append(line)
        elif out and line.startswith('-- ') and not re.match(r'-- Q\d+', line) and not out[-1]['sql']:
            out[-1]['title'] += ' ' + line[3:].strip()
    res = []
    for o in out:
        sql = '\n'.join(o['sql']).strip().rstrip(';')
        if not sql or ';' in sql or not SAFE.match(sql) or BAD.search(sql): continue     # skip CALL / transaction demos
        res.append(dict(id=o['id'], title=o['title'], section=o['section'], sql=sql))
    return res


@router.get('/samples')
def samples():
    return _samples()


# ---- live trigger / procedure demos (everything runs inside a transaction that is ROLLED BACK) ----
class Demo(BaseModel):
    scenario: str


def _demo_target(c):
    r = c.execute(text("""SELECT bd.budget_department_id, bd.category, bd.budget_id, b.status, b.project_id FROM budget_departments bd JOIN budgets b ON b.budget_id = bd.budget_id
                          WHERE b.status = 'Approved' AND bd.remaining_amount > 20000 ORDER BY bd.budget_department_id LIMIT 1""")).mappings().first()
    return dict(r)


@router.post('/demo')
def demo(body: Demo, user: dict = Depends(S.require('lab'))):
    steps = []
    err = None
    with db.app_engine.connect() as c:
        tx = c.begin()
        try:
            t = _demo_target(c)
            spent = lambda: float(c.execute(text('SELECT spent_amount FROM budget_departments WHERE budget_department_id = :b'), dict(b=t['budget_department_id'])).scalar())
            if body.scenario == 'trigger_expense':
                steps.append(dict(label=f"Before: '{t['category']}' category has spent", value=spent()))
                steps.append(dict(label='CALL sp_add_expense(…, amount = 12,500)', value='procedure runs, inserts the row'))
                c.execute(text('CALL sp_add_expense(:b, :cat, :d, 12500, :pe)'), dict(b=t['budget_department_id'], cat='Catering', d='SQL Lab trigger demo', pe=user.get('pid'))).fetchall()
                steps.append(dict(label='After: the TRIGGER trg_expenses_ai updated spent_amount to', value=spent()))
                steps.append(dict(label='remaining_amount (generated column) is now', value=float(c.execute(text('SELECT remaining_amount FROM budget_departments WHERE budget_department_id = :b'), dict(b=t['budget_department_id'])).scalar())))
            elif body.scenario == 'closed_budget':
                c.execute(text("UPDATE budgets SET status = 'Closed' WHERE budget_id = :b"), dict(b=t['budget_id']))
                steps.append(dict(label='Budget status set to Closed', value='UPDATE budgets …'))
                try:
                    c.execute(text('CALL sp_add_expense(:b, :cat, :d, 1000, :pe)'), dict(b=t['budget_department_id'], cat='Catering', d='should be blocked', pe=user.get('pid'))).fetchall()
                    steps.append(dict(label='Expense inserted (unexpected)', value='-'))
                except DBAPIError as e:
                    steps.append(dict(label='BEFORE INSERT trigger trg_expenses_bi rejected the expense', value=str(getattr(e.orig, 'args', ['?'])[-1]), bad=True))
            elif body.scenario == 'check_constraint':
                steps.append(dict(label='INSERT an expense with a NEGATIVE amount', value='INSERT INTO expenses …'))
                try:
                    c.execute(text("""INSERT INTO expenses (project_id, budget_department_id, expense_category, description, amount, tax_amount, expense_date, payment_status, approved_by)
                                      VALUES (:p, :b, 'Catering', 'negative test', -50, 0, CURDATE(), 'Pending', :pe)"""), dict(p=t['project_id'], b=t['budget_department_id'], pe=user.get('pid')))
                    steps.append(dict(label='Inserted (unexpected)', value='-'))
                except DBAPIError as e:
                    steps.append(dict(label='CHECK constraint chk_expenses_amounts rejected it', value=str(getattr(e.orig, 'args', ['?'])[-1]), bad=True))
            elif body.scenario == 'foreign_key':
                steps.append(dict(label='INSERT an expense for a budget category that does not exist', value='INSERT INTO expenses (budget_department_id = 99999999) …'))
                try:
                    c.execute(text("""INSERT INTO expenses (project_id, budget_department_id, expense_category, description, amount, tax_amount, expense_date, payment_status, approved_by)
                                      VALUES (:p, 99999999, 'Catering', 'orphan', 10, 0, CURDATE(), 'Pending', :pe)"""), dict(p=t['project_id'], pe=user.get('pid')))
                    steps.append(dict(label='Inserted (unexpected)', value='-'))
                except DBAPIError as e:
                    steps.append(dict(label='FOREIGN KEY rejected the orphan row', value=str(getattr(e.orig, 'args', ['?'])[-1]), bad=True))
            elif body.scenario == 'transaction':
                a = c.execute(text("""SELECT budget_department_id, category, allocated_amount FROM budget_departments WHERE budget_id = :b ORDER BY budget_department_id LIMIT 2"""), dict(b=t['budget_id'])).mappings().all()
                steps.append(dict(label='Allocated amounts before', value=f"{a[0]['category']}: {float(a[0]['allocated_amount']):,.0f}  |  {a[1]['category']}: {float(a[1]['allocated_amount']):,.0f}"))
                try:
                    c.execute(text('CALL sp_transfer_budget(:f, :to, 99999999999)'), dict(f=a[0]['budget_department_id'], to=a[1]['budget_department_id'])).fetchall()
                except DBAPIError as e:
                    steps.append(dict(label='sp_transfer_budget failed half-way -> the procedure ROLLED BACK', value=str(getattr(e.orig, 'args', ['?'])[-1]), bad=True))
                b = c.execute(text('SELECT budget_department_id, category, allocated_amount FROM budget_departments WHERE budget_id = :b ORDER BY budget_department_id LIMIT 2'), dict(b=t['budget_id'])).mappings().all()
                steps.append(dict(label='Allocated amounts after (unchanged = atomic)', value=f"{b[0]['category']}: {float(b[0]['allocated_amount']):,.0f}  |  {b[1]['category']}: {float(b[1]['allocated_amount']):,.0f}"))
            elif body.scenario == 'payment_cap':
                k = c.execute(text("""SELECT c.contract_id, c.project_id, c.person_id, c.vendor_id, c.contract_value FROM contracts c WHERE c.contract_value > 0 ORDER BY c.contract_id LIMIT 1""")).mappings().first()
                steps.append(dict(label=f"Contract #{k['contract_id']} has value", value=float(k['contract_value'])))
                try:
                    c.execute(text("""INSERT INTO payments (project_id, contract_id, person_id, vendor_id, amount, payment_date, payment_type, payment_status, transaction_reference)
                                      VALUES (:p, :c, :pe, :v, :a, CURDATE(), 'Advance', 'Scheduled', 'DEMO-CAP-1')"""),
                              dict(p=k['project_id'], c=k['contract_id'], pe=k['person_id'], v=k['vendor_id'], a=float(k['contract_value']) * 5))
                    steps.append(dict(label='Inserted (unexpected)', value='-'))
                except DBAPIError as e:
                    steps.append(dict(label='Trigger trg_payments_bi blocked a payment of 5x the contract value', value=str(getattr(e.orig, 'args', ['?'])[-1]), bad=True))
            else:
                raise HTTPException(404, 'Unknown scenario')
        except HTTPException:
            tx.rollback(); raise
        except DBAPIError as e:
            err = str(getattr(e, 'orig', e))
        finally:
            if tx.is_active: tx.rollback()
    return dict(steps=steps, error=err, rolled_back=True)
