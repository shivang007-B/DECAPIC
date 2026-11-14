"""Passwords (PBKDF2), JWT tokens and role-based permissions."""
import hashlib, hmac, os, time
import jwt
from fastapi import Depends, HTTPException, Request
from . import config as C

ALL = {'view', 'finance_view', 'finance_write', 'schedule_write', 'ai', 'lab', 'admin'}
ROLE_PERMS = {
    'SUPER_ADMIN':        ALL,
    'PRODUCER':           ALL - {'admin'},
    'FINANCE_MANAGER':    {'view', 'finance_view', 'finance_write', 'ai', 'lab'},
    'PRODUCTION_MANAGER': {'view', 'finance_view', 'schedule_write', 'ai', 'lab'},
    'DIRECTOR':           {'view', 'schedule_write', 'ai', 'lab'},
    'POST_PRODUCTION':    {'view', 'ai', 'lab'},
    'DISTRIBUTION':       {'view', 'ai', 'lab'},
    'CLIENT':             {'view', 'finance_view', 'ai', 'lab'},
    'AUDITOR':            {'view', 'finance_view', 'ai', 'lab'},          # the "authorised reviewer": read-only
    'CREW':               {'view'},
}
ROLE_LABEL = {'SUPER_ADMIN': 'Super Admin', 'PRODUCER': 'Producer', 'FINANCE_MANAGER': 'Finance Manager', 'PRODUCTION_MANAGER': 'Production Manager',
              'DIRECTOR': 'Director', 'POST_PRODUCTION': 'Post-production', 'DISTRIBUTION': 'Distribution', 'CLIENT': 'Client',
              'AUDITOR': 'Authorised Reviewer', 'CREW': 'Crew Member'}
PRIORITY = ['SUPER_ADMIN', 'PRODUCER', 'FINANCE_MANAGER', 'PRODUCTION_MANAGER', 'DIRECTOR', 'AUDITOR', 'CLIENT', 'DISTRIBUTION', 'POST_PRODUCTION', 'CREW']


def hash_password(pw: str, salt: bytes = None, iters: int = 120000) -> str:
    salt = salt or os.urandom(8)
    return f"pbkdf2${iters}${salt.hex()}${hashlib.pbkdf2_hmac('sha256', pw.encode(), salt, iters).hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        scheme, iters, salt, digest = stored.split('$')
        if scheme != 'pbkdf2': return False
        calc = hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), int(iters)).hex()
        return hmac.compare_digest(calc, digest)
    except Exception:
        return False


def best_role(roles):
    for r in PRIORITY:
        if r in roles: return r
    return roles[0] if roles else 'CREW'


def make_token(user: dict) -> str:
    payload = dict(uid=user['user_id'], pid=user.get('person_id'), name=user['name'], email=user['email'], role=user['role'],
                   exp=int(time.time()) + C.TOKEN_HOURS * 3600)
    return jwt.encode(payload, C.SECRET_KEY, algorithm='HS256')


def public_user(c: dict) -> dict:
    role = c['role']
    return dict(user_id=c['uid'], person_id=c.get('pid'), name=c['name'], email=c['email'], role=role, role_label=ROLE_LABEL.get(role, role),
                permissions=sorted(ROLE_PERMS.get(role, {'view'})))


def current_user(request: Request) -> dict:
    h = request.headers.get('authorization', '')
    tok = h[7:] if h.lower().startswith('bearer ') else request.query_params.get('token')
    if not tok: raise HTTPException(401, 'Please sign in')
    try:
        return jwt.decode(tok, C.SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, 'Session expired, please sign in again')
    except Exception:
        raise HTTPException(401, 'Invalid session')


def require(perm: str):
    def dep(user: dict = Depends(current_user)):
        if perm not in ROLE_PERMS.get(user['role'], {'view'}):
            raise HTTPException(403, f"Your role ({ROLE_LABEL.get(user['role'], user['role'])}) is not allowed to do this")
        return user
    return dep
