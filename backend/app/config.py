"""Settings. Values come from environment variables or from the file  decapic/.env  (see .env.example)."""
import os, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]          # .../decapic


def _load_env():
    f = ROOT / '.env'
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()
DB_HOST = os.getenv('DB_HOST', '127.0.0.1')
DB_PORT = int(os.getenv('DB_PORT', '3306'))
DB_NAME = os.getenv('DB_NAME', 'cineops')
APP_USER = os.getenv('APP_USER', 'decapic_app')
APP_PASSWORD = os.getenv('APP_PASSWORD', 'DecaPic#App2026')
RO_USER = os.getenv('RO_USER', 'decapic_ro')
RO_PASSWORD = os.getenv('RO_PASSWORD', 'DecaPic#Read2026')
SECRET_KEY = os.getenv('SECRET_KEY', 'decapic-demo-secret-change-me-please-0123456789')
TOKEN_HOURS = int(os.getenv('TOKEN_HOURS', '12'))
PORT = int(os.getenv('PORT', '8000'))
FRONTEND_DIR = ROOT / 'frontend'
ML_DIR = ROOT / 'ml' / 'models'
SQL_DIR = ROOT / 'database'
