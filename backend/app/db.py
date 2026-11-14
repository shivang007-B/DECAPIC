"""Database access: one engine for the app (limited rights) and one read-only engine for the SQL Lab."""
import json, datetime, decimal
from urllib.parse import quote_plus
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text, bindparam
from . import config as C


def _url(u, p):
    return f"mysql+pymysql://{quote_plus(u)}:{quote_plus(p)}@{C.DB_HOST}:{C.DB_PORT}/{C.DB_NAME}?charset=utf8mb4"


app_engine = create_engine(_url(C.APP_USER, C.APP_PASSWORD), pool_size=8, max_overflow=8, pool_recycle=1800, pool_pre_ping=True)
ro_engine = create_engine(_url(C.RO_USER, C.RO_PASSWORD), pool_size=3, max_overflow=3, pool_recycle=1800, pool_pre_ping=True)


def _enc(o):
    if isinstance(o, decimal.Decimal): return float(o)
    if isinstance(o, (datetime.datetime, datetime.date)): return o.isoformat()
    if isinstance(o, datetime.timedelta):
        s = int(o.total_seconds()); return f'{s // 3600:02d}:{(s % 3600) // 60:02d}'
    if isinstance(o, (set, tuple)): return list(o)
    if isinstance(o, bytes): return o.decode('utf-8', 'replace')
    if hasattr(o, 'item'): return o.item()                      # numpy scalars
    raise TypeError(f'not serialisable: {type(o)}')


class DPJSON(JSONResponse):
    def render(self, content):
        return json.dumps(content, default=_enc, ensure_ascii=False, allow_nan=False).encode('utf-8')


def _stmt(sql, p):
    st = text(sql)
    lists = [bindparam(k, expanding=True) for k, v in p.items() if isinstance(v, (list, tuple))]   # IN (:ids) support
    return st.bindparams(*lists) if lists else st


def rows(sql, **p):
    with app_engine.connect() as c:
        return [dict(r._mapping) for r in c.execute(_stmt(sql, p), p)]


def one(sql, **p):
    r = rows(sql, **p)
    return r[0] if r else None


def scalar(sql, **p):
    with app_engine.connect() as c:
        return c.execute(text(sql), p).scalar()


def page_args(page, size, max_size=100):
    size = max(1, min(int(size), max_size)); page = max(1, int(page))
    return size, (page - 1) * size
