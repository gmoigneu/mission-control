# Deploying Mission Control on Portainer

This directory holds everything needed to run Mission Control as a Portainer
stack using prebuilt images from GitHub Container Registry (GHCR).

## Architecture

```
                            ┌──────────────── host ────────────────┐
  https://mc.domain/api/* ──▶ global Caddy ──▶ :42002 api (FastAPI)
  https://mc.domain/*     ──▶ global Caddy ──▶ :42001 frontend (nginx, SPA)
                              (TLS)             │
                            api ──▶ postgres (pgvector) · neo4j   (internal)
                            worker, search-worker ──▶ same network
```

| Service         | Image                                         | Host port | Notes |
|-----------------|-----------------------------------------------|-----------|-------|
| `frontend`      | `ghcr.io/gmoigneu/mission-control-frontend`   | **42001** | nginx: serves the SPA |
| `api`           | `ghcr.io/gmoigneu/mission-control-api`        | **42002** | FastAPI; Caddy routes `/api/*` here; runs DB migrations on startup |
| `worker`        | `ghcr.io/gmoigneu/mission-control-api`        | —         | graph worker |
| `search-worker` | `ghcr.io/gmoigneu/mission-control-api`        | —         | embeddings/search worker |
| `postgres`      | `pgvector/pgvector:pg16`                       | internal  | volume `pgdata` |
| `neo4j`         | `neo4j:5-community`                            | internal  | volume `neo4jdata` |

The frontend is a **same-origin** SPA: it always calls `/api` on its own host
(see `src/lib/api.ts`). The global Caddy routes `/api/*` to the api container
(port 42002, stripping the prefix) and everything else to the frontend (port
42001) — one domain, no CORS. (The frontend image also proxies `/api` itself, so
the container still works standalone in local docker-compose, where there is no
global Caddy.)

## 1. Images on GHCR

The two images are built from `backend/` and `frontend/` and pushed to:

- `ghcr.io/gmoigneu/mission-control-api`
- `ghcr.io/gmoigneu/mission-control-frontend`

Build and push manually (linux/amd64) from the repo root:

```sh
echo "$GITHUB_TOKEN" | docker login ghcr.io -u gmoigneu --password-stdin   # or: gh auth token | docker login ...

docker buildx build --platform linux/amd64 \
  -t ghcr.io/gmoigneu/mission-control-api:latest ./backend --push

docker buildx build --platform linux/amd64 \
  -t ghcr.io/gmoigneu/mission-control-frontend:latest ./frontend --push
```

> If the packages are private, give the Portainer host registry access:
> `docker login ghcr.io` on the host, or add a GHCR registry in Portainer
> (Registries → Add registry → Custom, URL `ghcr.io`, your username + a PAT
> with `read:packages`). Make the packages public on GitHub to skip this.

## 2. Deploy the stack in Portainer

1. **Stacks → Add stack.**
2. Either point it at this Git repo with the compose path `deploy/docker-stack.yml`,
   or paste the contents of [`docker-stack.yml`](docker-stack.yml) into the web editor.
3. Under **Environment variables**, load [`stack.env.example`](stack.env.example)
   and fill in the real values. Required: `SESSION_SECRET`, `NEO4J_PASSWORD`,
   `INITIAL_USER_EMAIL`, `INITIAL_USER_PASSWORD`, and the `WEBAUTHN_*` domains.
4. **Deploy the stack.** On first boot the `api` service runs the Alembic
   migrations; the workers wait for it to become healthy.

Generate the session secret with:

```sh
python -c "import secrets; print(secrets.token_hex(32))"
```

## 3. Global Caddy (TLS) on the host

Caddy runs directly on the server (not in this stack). Add the vhost from
[`Caddyfile.global.example`](Caddyfile.global.example) to your global
`/etc/caddy/Caddyfile` and `caddy reload`. It serves the whole app from one
domain: `/api/*` → host port 42002 (api), everything else → host port 42001
(frontend). Keep the domain in sync with `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_ORIGIN`.

Because TLS is terminated by Caddy, the API keeps `ENVIRONMENT=production`
(session cookies get the `Secure` flag, which is correct over HTTPS).

## Notes & troubleshooting

- **Login fails / not staying logged in:** you're likely hitting the app over
  plain HTTP. The session cookie is `Secure` in production and only travels over
  HTTPS — always reach the app through the global Caddy (https), not
  `http://host:42001` directly.
- **Passkeys:** require HTTPS and a correct `WEBAUTHN_RP_ID`/`RP_ORIGIN`.
  Password login (the `INITIAL_USER_*` account) works regardless.
- **AI features:** default to offline stubs (`EMBEDDINGS_PROVIDER=fake`,
  `LLM_PROVIDER=mock`). Set the relevant provider + API key to enable real ones.
- **Exposing Neo4j/Postgres:** they're intentionally internal. To reach the
  Neo4j browser, add `ports: ["7474:7474", "7687:7687"]` to the `neo4j` service.
- **Upgrades:** push a new `latest` (or set `IMAGE_TAG`), then re-pull/redeploy
  the stack in Portainer.
```
