#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec .venv311/bin/python scripts/bootstrap_local_db.py
