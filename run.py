#!/usr/bin/env python3
"""Starts DecaPic:  python run.py   ->  http://127.0.0.1:8000"""
import os, sys, threading, time, webbrowser
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'backend'))
import uvicorn
from app import config

if __name__ == '__main__':
    url = f'http://127.0.0.1:{config.PORT}'
    if '--no-browser' not in sys.argv:
        threading.Thread(target=lambda: (time.sleep(2.5), webbrowser.open(url)), daemon=True).start()
    print(f'\n  DecaPic is starting at {url}   (Ctrl+C to stop)\n')
    uvicorn.run('app.main:app', host='127.0.0.1', port=config.PORT, app_dir=os.path.join(ROOT, 'backend'), log_level='info', reload=True)
