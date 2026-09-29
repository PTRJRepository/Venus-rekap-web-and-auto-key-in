# Setup after cloning

## 1. Node version

**Requires Node `^20.19.0 || >=22.12.0`** (Vite 7). Verified on v24.12.0.
No `engines` field is declared in the manifests, so npm will not warn you —
check with `node -v` before installing.

## 2. Environment file — only ONE is needed

All components read the **same** file, `backend/.env`:

| Consumer | How it loads |
|---|---|
| `backend/server.js` | `require('dotenv').config()` (cwd-relative) |
| `browser-automation-engine/*` | `dotenv.config({ path: '../backend/.env' })` |

You do **not** need a `.env` inside `browser-automation-engine/`.

`.env` is gitignored, so it is not in the clone — obtain it out-of-band
(gateway host, token, DB credentials). To see which keys exist:

```bash
cp backend/.env.example backend/.env   # then fill in the real values
```

`backend/.env.example` lists the required keys with placeholders only.

## 3. Install

```bash
cd backend                  && npm ci
cd frontend                 && npm ci      # builds the UI
cd browser-automation-engine && npm install # NOTE: no package-lock.json here
```

`browser-automation-engine/` has no lockfile, so `npm ci` fails there — use
`npm install`.

## 4. Run

**Development** (Vite proxies `/api` → `127.0.0.1:3002`):

```bash
cd backend  && npm run dev     # terminal 1 — API on :3002
cd frontend && npm run dev     # terminal 2 — UI on :5173
```

**Production** (backend serves the built UI itself):

```bash
cd frontend && npm run build   # -> frontend/dist  (NOT committed)
cd backend  && npm start       # serves API + frontend/dist on :3002
```

The clone does **not** contain `frontend/dist/`. Run the build before
`npm start`, or the server has no static UI to serve.

## 5. Automation input

`browser-automation-engine/parallel-runner.js` generates and cleans up
`templates/_temp_engine_N.json` / `testing_data/_temp_engine_N.json` per run,
so a missing `_temp_engine_*` file is expected and does not need recreating.
Input data comes from `testing_data/current_data.json`, written by the backend
via `saveAutomationData()`.
