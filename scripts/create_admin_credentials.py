#!/usr/bin/env python3
"""Create a local admin login; only the password hash is saved to backend/.env."""
import argparse
import base64
import hashlib
import os
import secrets
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / 'backend' / '.env'
ITERATIONS = 600_000


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode('ascii').rstrip('=')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--rotate', action='store_true', help='Generate a new password and invalidate existing admin sessions.')
    parser.add_argument('--email', help='Set the admin login email.')
    args = parser.parse_args()
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    values = dotenv_values(ENV_FILE)
    email = (args.email or values.get('ADMIN_EMAIL') or 'admin@addisai.local').strip().lower()
    existing_hash = values.get('ADMIN_PASSWORD_HASH')
    if existing_hash and not args.rotate:
        raise SystemExit('Admin credentials already exist. Use --rotate to generate a new password or change the email.')
    password = secrets.token_urlsafe(24)
    salt = secrets.token_urlsafe(18)
    digest = encode(hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), ITERATIONS))
    updates = {
        'ADMIN_EMAIL': email,
        'ADMIN_PASSWORD_HASH': f'pbkdf2_sha256${ITERATIONS}${salt}${digest}',
        'ADMIN_SESSION_SECRET': secrets.token_urlsafe(48),
    }
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    for key, value in updates.items():
        line = f'{key}="{value}"'
        for index, old in enumerate(lines):
            if old.strip().startswith(key + '='):
                lines[index] = line
                break
        else:
            lines.append(line)
    ENV_FILE.write_text('\n'.join(lines).rstrip() + '\n')
    ENV_FILE.chmod(0o600)
    print(f'Admin email: {email}')
    print(f'Admin password: {password}')
    print('Password saved as a PBKDF2 hash in backend/.env (not stored in plaintext).')


if __name__ == '__main__':
    main()
