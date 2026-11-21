#!/usr/bin/env python3
"""Create/ensure the project-local PostgreSQL database without printing credentials."""
from pathlib import Path
import os
import secrets
import shutil
import subprocess
from urllib.parse import quote

from dotenv import dotenv_values
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / 'backend' / '.env'
PGDATA = ROOT / '.data' / 'postgres'
PGSOCKET = ROOT / '.data' / 'pgsocket'
PORT = 55432


def command(args: list[str], *, input_text: str | None = None, check: bool = True):
    return subprocess.run(args, input=input_text, text=True, capture_output=True, check=check)


def set_env(name: str, value: str) -> None:
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    replacement = f'{name}="{value}"'
    for index, line in enumerate(lines):
        if line.strip().startswith(name + '='):
            lines[index] = replacement
            break
    else:
        lines.append(replacement)
    ENV_FILE.write_text('\n'.join(lines).rstrip() + '\n')
    ENV_FILE.chmod(0o600)


def main() -> None:
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not ENV_FILE.exists() and (ENV_FILE.parent / '.env.example').exists():
        shutil.copyfile(ENV_FILE.parent / '.env.example', ENV_FILE)
    config = dotenv_values(ENV_FILE)
    raw_url = config.get('DATABASE_URL') or ''
    if not raw_url or 'change-me' in raw_url:
        password = secrets.token_urlsafe(36)
        role, database = 'addis_app', 'addis_support'
    else:
        parsed = make_url(raw_url)
        role = parsed.username or 'addis_app'
        database = parsed.database or 'addis_support'
        password = parsed.password or secrets.token_urlsafe(36)
        if parsed.password in (None, '', 'change-me'):
            password = secrets.token_urlsafe(36)

    parsed = make_url(raw_url) if raw_url and 'change-me' not in raw_url else None
    host = parsed.host if parsed else '127.0.0.1'
    if host not in (None, 'localhost', '127.0.0.1'):
        # A configured managed PostgreSQL URL is preserved and checked directly.
        import psycopg
        with psycopg.connect(raw_url, connect_timeout=5) as connection:
            connection.execute('SELECT 1')
        print('Configured PostgreSQL endpoint is reachable; left its URL unchanged.')
        return

    port = (parsed.port if parsed else None) or PORT
    pg_bin = Path(command(['pg_config', '--bindir']).stdout.strip())
    PGSOCKET.mkdir(parents=True, exist_ok=True)
    if not (PGDATA / 'PG_VERSION').exists():
        command([str(pg_bin / 'initdb'), '-D', str(PGDATA), '-U', 'postgres', '--auth-local=trust', '--auth-host=scram-sha-256'])
    status = command([str(pg_bin / 'pg_ctl'), '-D', str(PGDATA), 'status'], check=False)
    if status.returncode:
        command([str(pg_bin / 'pg_ctl'), '-D', str(PGDATA), '-l', str(ROOT / '.data' / 'postgres.log'),
                 '-o', f'-h 127.0.0.1 -p {port} -k {PGSOCKET} -c shared_memory_type=mmap', 'start'])

    import psycopg
    from psycopg import sql
    with psycopg.connect(host=str(PGSOCKET), port=port, dbname='postgres', user='postgres', autocommit=True) as connection:
        exists = connection.execute('SELECT 1 FROM pg_roles WHERE rolname = %s', (role,)).fetchone()
        statement = sql.SQL('ALTER ROLE {} WITH LOGIN PASSWORD {}').format(sql.Identifier(role), sql.Literal(password)) if exists else \
                    sql.SQL('CREATE ROLE {} WITH LOGIN PASSWORD {}').format(sql.Identifier(role), sql.Literal(password))
        connection.execute(statement)
        db_exists = connection.execute('SELECT 1 FROM pg_database WHERE datname = %s', (database,)).fetchone()
        if not db_exists:
            connection.execute(sql.SQL('CREATE DATABASE {} OWNER {}').format(sql.Identifier(database), sql.Identifier(role)))

    url = f'postgresql+psycopg://{quote(role, safe="")}:{quote(password, safe="")}@127.0.0.1:{port}/{quote(database, safe="")}'
    set_env('DATABASE_URL', url)
    print('Local PostgreSQL is ready; generated connection details are stored in backend/.env.')


if __name__ == '__main__':
    main()
