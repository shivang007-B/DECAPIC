#!/usr/bin/env python3
"""Creates the `cineops` database from the SQL files in ./database (schema, data, views, triggers, roles, app users).
   Needs the `mysql` command-line client in PATH.  WARNING: it drops and re-creates the database `cineops`.

   python setup_database.py --user root --password YOUR_PASSWORD [--host 127.0.0.1] [--port 3306]
"""
import argparse, os, shutil, subprocess, sys

FILES = [('01_schema.sql', False), ('02_load_data.sql', True), ('03_views.sql', True), ('04_triggers_procedures.sql', True),
         ('05_security_roles.sql', False), ('07_decapic_app.sql', True)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--user', default='root'); ap.add_argument('--password', default=''); ap.add_argument('--host', default=''); ap.add_argument('--port', default='')
    a = ap.parse_args()
    mysql = shutil.which('mysql')
    if not mysql: sys.exit("The 'mysql' command-line client was not found in PATH. Install MySQL 8.0+ / add its bin folder to PATH.")
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database')
    base = [mysql, '--local-infile=1', '-u', a.user] + (['-h', a.host] if a.host else []) + (['-P', a.port] if a.port else []) + ([f'-p{a.password}'] if a.password else [])
    print('Setting up database `cineops` (this drops the old one) ...')
    for name, uses_db in FILES:
        print(f'  running {name} ...', end=' ', flush=True)
        with open(os.path.join(here, name), 'rb') as f:
            r = subprocess.run(base + (['cineops'] if uses_db else []), stdin=f, cwd=here, capture_output=True, text=True)
        if r.returncode != 0:
            print('FAILED\n' + r.stderr.strip())
            if 'local' in r.stderr.lower() and 'infile' in r.stderr.lower():
                print("\nHint: run  SET GLOBAL local_infile = 1;  in MySQL as an admin, then run this script again.")
            sys.exit(1)
        print('ok')
    print('\nDone. Next:  python ml/train_models.py --user %s --password ...   (recommended)   then   python run.py' % a.user)


if __name__ == '__main__':
    main()
