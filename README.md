# Addis AI customer support

A small FastAPI and React customer service app using the official `addisai` Python SDK. The API key stays on the backend. Features include per-session multi-turn context, local FAQ/policy retrieval, a demo order lookup, explicit human handoff flags, language selection, and optional Addis Scribe transcription and Addis Voices playback.

## Run locally

1. Create and activate a virtual environment, then install backend packages:

   ```sh
   python -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```

2. Put the Addis API key in `backend/.env` (the file is ignored by Git), or export it in the backend process environment. The backend loads `backend/.env` automatically. Do not put it in React or commit it:

   ```sh
   # Optional if ADDIS_API_KEY is already set in backend/.env:
   export ADDIS_API_KEY='your-key'
   uvicorn backend.main:app --reload --port 8000
   ```

3. In another terminal, install and run the frontend:

   ```sh
   npm install
   npm run dev
   ```

Open `http://localhost:5173`. Vite proxies `/api` requests to FastAPI. Set `FRONTEND_ORIGINS` to a comma-separated allowlist when serving the UI from another origin.

## Add company knowledge

Place approved `.md` and `.txt` FAQs, policies, and product documentation in `backend/knowledge/`. The backend scores blank-line-separated paragraphs by keyword overlap and gives the best matches to Addis AI. If no passage matches, the system prompt instructs the assistant to say it cannot verify the answer. This starter retriever is suitable for a small support corpus; replace it with a vector database or search service for larger collections.

## Backend endpoints

- `POST /api/chat` — `{ "session_id": null, "message": "...", "language": "en|am|om|ti" }`
- `DELETE /api/sessions/{session_id}` — clear server-side conversation history
- `POST /api/transcribe` — multipart audio upload (up to 12 MB)
- `POST /api/speak` — `{ "text": "...", "language": "am|om|ti" }`, returns base64 MP3
- `GET /api/health` — configuration status

Sessions and the included order records are in memory for demonstration. Use a persistent store and authenticated user-scoped customer/order service before production. Replace the demo `get_order_status` function in `backend/main.py` with a secure integration. Handoff is flagged and returned to the UI; connect it to a ticketing or staff queue for actual follow-up. Add rate limiting and application authentication before exposing this backend publicly.
