# mission-control

A single-user, self-hosted web app to track and manage life across all devices — the successor to the `aya` markdown vault. Postgres-canonical data, a Neo4j graph projection, pgvector search, and an AI agent that queries and mutates the same data.

- **Full specification:** [`SPEC.md`](SPEC.md)
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Status

Phase **P0 (Foundations)** in progress:

- ✅ **P0.1 Backend foundations** — FastAPI + SQLAlchemy 2.0 (async) + Alembic, Postgres + pgvector, single-user session auth, seed-user CLI. 20 tests, ruff + mypy clean.
- ✅ **P0.2 Frontend shell** — Vite + React + TanStack Router/Query + Tailwind v4. Login → protected dashboard inside an app shell. 7 tests, lint + typecheck + build clean. End-to-end login verified through the Vite dev proxy.
- ⏳ **P0.3 Infra (not started)** — full Docker Compose (Neo4j, worker, Caddy/TLS) for a one-box deploy.
- ⏳ **P1+** — domain CRUD (contexts, projects, people/CRM, tasks, journal, habits, meetings, knowledge), graph projection, AI agent, aya migration. See `SPEC.md` §19.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + TypeScript, Vite, TanStack Router/Query, Tailwind v4, Vitest |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, LangChain (later) |
| Data | PostgreSQL 16 + pgvector, Neo4j (later) |
| Tooling | uv, ruff, mypy, pnpm/npm, GitHub Actions |

## Prerequisites

- Docker (Postgres runs in a container) — Docker Desktop, OrbStack, or colima
- [uv](https://docs.astral.sh/uv/) (Python 3.12)
- Node 20.19+ / 22+ and npm

## Run it locally

```bash
# 1. Start Postgres (with pgvector) and create the test database
docker compose up -d --wait postgres
docker compose exec -T postgres psql -U mc -d mc -c "CREATE DATABASE mc_test;" || true

# 2. Backend: migrate, seed your user, run the API
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.cli seed-user --email you@example.com --password changeme --name You
uv run uvicorn app.main:app --port 8000        # http://localhost:8000  (/health, /auth/*)

# 3. Frontend (in another terminal): the dev server proxies /auth + /health to :8000
cd frontend
npm install
npm run dev                                     # http://localhost:5173
```

Open http://localhost:5173, sign in with the seeded credentials, and you land on the dashboard.

## Tests & checks

```bash
# Backend
cd backend && uv run pytest -v && uv run ruff check . && uv run mypy app

# Frontend
cd frontend && npm run test -- --run && npm run lint && npm run typecheck && npm run build
```

CI (`.github/workflows/ci.yml`) runs both suites on push/PR.

## Layout

```
backend/    FastAPI app, SQLAlchemy models, Alembic migrations, services, CLI, tests
frontend/   Vite SPA: routes/, components/, lib/ (api client + auth hooks)
docs/       SPEC + implementation plans
docker-compose.yml   Postgres + pgvector (more services in P0.3)
```
