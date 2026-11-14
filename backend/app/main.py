"""DecaPic - FastAPI application:  browser  ->  FastAPI  ->  MySQL (cineops)"""
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from . import config as C, db
from .routes import auth, dashboard, projects, catalog

app = FastAPI(title='DecaPic', version='1.0', default_response_class=db.DPJSON)

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/vendor"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

for r in (auth.router, dashboard.router, projects.router, catalog.router):
    app.include_router(r)
try:                                           # ML + SQL Lab routers
    from .routes import ml, lab
    app.include_router(ml.router); app.include_router(lab.router)
except ImportError as e:                       # pragma: no cover
    print('optional routers not loaded:', e)


@app.get('/api/health')
def health():
    return dict(status='ok', database=db.scalar('SELECT DATABASE()'), projects=db.scalar('SELECT COUNT(*) FROM projects'))


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content=dict(detail=f'Server error: {type(exc).__name__}: {exc}'))


app.mount('/assets', StaticFiles(directory=C.FRONTEND_DIR / 'assets'), name='assets')
app.mount('/css', StaticFiles(directory=C.FRONTEND_DIR / 'css'), name='css')
app.mount('/js', StaticFiles(directory=C.FRONTEND_DIR / 'js'), name='js')
app.mount('/vendor', StaticFiles(directory=C.FRONTEND_DIR / 'vendor'), name='vendor')


@app.get('/{path:path}', include_in_schema=False)
def spa(path: str):
    return FileResponse(C.FRONTEND_DIR / 'index.html', headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"})
