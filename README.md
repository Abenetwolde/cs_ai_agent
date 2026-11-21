# Addis AI Customer Support

FastAPI + PostgreSQL customer support API with LangChain/Gemini tool orchestration, Addis AI multilingual response generation, Chroma RAG, and a React + TypeScript + Tailwind/Vite web client in `frontend/`. The web client runs on port `5174`.

## Local development

The local setup uses Python 3.11.18 in `.python/` with dependencies in `.venv311/`, and a project-local PostgreSQL cluster in `.data/`. Both are ignored by Git. `backend/.env` is also ignored; keep API keys there and never copy them into frontend code.

For a fresh checkout, provision the backend with Python 3.11, install CPU-only PyTorch first (to avoid pulling CUDA libraries for CPU embeddings), then the application requirements:

```sh
python3 -m venv .setup-venv
.setup-venv/bin/python -m pip install uv
UV_CACHE_DIR="$PWD/.data/uv-cache" .setup-venv/bin/uv python install 3.11 --install-dir "$PWD/.python"
UV_CACHE_DIR="$PWD/.data/uv-cache" .setup-venv/bin/uv venv --python 3.11 .venv311
.venv311/bin/python -m ensurepip --upgrade
.venv311/bin/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv311/bin/python -m pip install -r backend/requirements.txt
```

Install frontend packages after selecting the pinned Node version from `.nvmrc` (the workspace installs the app in `frontend/`):

```sh
nvm install
nvm use
pnpm install
```

Start PostgreSQL and the API in one terminal:

```sh
bash scripts/run_backend.sh
```

Start the React app in another terminal:

```sh
pnpm run dev
```

Open `http://localhost:5174`. Vite proxies `/api` to FastAPI on port `8001`. The API runs Alembic migrations and seeds a demo user/order on startup. The demo profile is `demo.customer@example.com`; sample orders are `ADDIS-1001` and `ADDIS-1002`.

## Configuration

`backend/.env.example` documents the settings. The local `.env` has a generated PostgreSQL URL (`DATABASE_URL`), model (`GEMINI_MODEL`), Chroma path (`CHROMA_PERSIST_DIR`), embedding model, and a generated knowledge-upload token. Add valid `ADDIS_API_KEY` and `GEMINI_API_KEY` values there. Addis AI handles multilingual customer replies; Gemini performs query rewriting, structured database tools, and fallback response generation. If both providers are unavailable, the API uses a grounded local fallback rather than dropping the conversation.

The PostgreSQL cluster listens on `127.0.0.1:55432` and persists under `.data/postgres`. `bash scripts/start_postgres.sh` starts it after a reboot. To stop it, run:

```sh
/usr/lib/postgresql/18/bin/pg_ctl -D .data/postgres stop
```

## RAG knowledge

Company-approved Markdown and text files belong in `backend/data/kb/`. The multilingual embedding model is `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`; Chroma persists in `chroma_db/`. Ingest or refresh documents with:

```sh
HF_HOME="$PWD/.data/hf_cache" .venv311/bin/python scripts/ingest_docs.py
```

`POST /api/kb/upload` accepts `.md` and `.txt` files with the `X-Admin-Token` value from `backend/.env`. Answers include source names for the UI to display.

## Database and API

Tables are managed with Alembic (`alembic upgrade head`) and include users, chat sessions, messages, orders, and support tickets. Orders are scoped to the profile selected by the customer. Gemini tools can look up orders, create tickets, update approved profile fields, and escalate a session. Every response persists tool metadata and RAG source citations.

Useful endpoints:

- `GET /api/health` — database and provider configuration status
- `POST /api/users` — identify or register a support profile
- `GET /api/users/{user_id}/sessions` — conversation history
- `POST /api/sessions`, `GET /api/sessions/{session_id}`, `DELETE /api/sessions/{session_id}`
- `POST /api/chat` — grounded multilingual customer support
- `POST /api/kb/upload` — admin-protected knowledge ingestion
- `POST /api/transcribe` and `POST /api/speak` — optional Addis voice endpoints

Sample policy documents are fictional starter examples and must be reviewed and replaced with the company’s approved policies. The profile form identifies a customer but does not verify email/phone ownership; add a real authentication and verification provider before exposing account-specific support publicly. The local PostgreSQL setup is for development; use a managed PostgreSQL service, secret manager, backups, TLS, and operational monitoring for production.
