from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from .. import db, security as S

router = APIRouter(prefix='/api/auth', tags=['auth'])


class Login(BaseModel):
    email: str
    password: str


@router.post('/login')
def login(body: Login):
    u = db.one("""SELECT u.user_id, u.person_id, u.email, u.password_hash, u.account_status, pe.name
                  FROM users u LEFT JOIN people pe ON pe.person_id = u.person_id WHERE u.email = :e""", e=body.email.strip().lower())
    if not u or not S.verify_password(body.password, u['password_hash']):
        raise HTTPException(401, 'Wrong email or password')
    if u['account_status'] != 'Active':
        raise HTTPException(403, f"Account is {u['account_status'].lower()}")
    roles = [r['role_name'] for r in db.rows("SELECT sr.role_name FROM user_roles ur JOIN system_roles sr ON sr.role_id = ur.role_id WHERE ur.user_id = :u", u=u['user_id'])]
    u['role'] = S.best_role(roles)
    u['name'] = u['name'] or u['email']
    with db.app_engine.begin() as c:
        c.execute(db.text('UPDATE users SET last_login = NOW() WHERE user_id = :u'), dict(u=u['user_id']))
    claims = dict(uid=u['user_id'], pid=u['person_id'], name=u['name'], email=u['email'], role=u['role'])
    return dict(token=S.make_token(u), user=S.public_user(claims))


@router.get('/me')
def me(user: dict = Depends(S.current_user)):
    return S.public_user(user)


@router.get('/demo-accounts')
def demo_accounts():
    rows = db.rows("""SELECT u.email, pe.name, sr.role_name FROM users u JOIN user_roles ur ON ur.user_id = u.user_id
                      JOIN system_roles sr ON sr.role_id = ur.role_id LEFT JOIN people pe ON pe.person_id = u.person_id
                      WHERE u.email LIKE '%@decapic.com' ORDER BY u.user_id""")
    return [dict(email=r['email'], name=r['name'], role=r['role_name'], role_label=S.ROLE_LABEL.get(r['role_name'], r['role_name'])) for r in rows]
