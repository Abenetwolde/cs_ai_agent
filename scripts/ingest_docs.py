#!/usr/bin/env python3
from pathlib import Path
import sys
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / 'backend' / '.env', override=True)

from backend.rag import ingest_directory

if __name__ == '__main__':
    total = ingest_directory()
    print(f'Indexed {total} document chunks from backend/data/kb.')
