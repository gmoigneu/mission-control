# OpenAI-only agent via ChatGPT-subscription OAuth (device code) — Design

> Status: approved (2026-05-30). Replaces the Anthropic agent provider with an OpenAI provider that bills model calls to G's ChatGPT subscription via the Codex "Sign in with ChatGPT" OAuth flow.
>
> **Live-confirmed (2026-05-30):** device-code auth, token refresh, model inference, and multi-turn tool-calling all verified end-to-end against the real subscription endpoint. Two facts that had to be tuned live: **(1)** the request body must include `"store": false` — the endpoint returns `400 "Store must be set to false"` otherwise; **(2)** G's account reports `chatgpt_plan_type: "prolite"` (ChatGPT Go tier), which exposes base models (`gpt-5.5`, `gpt-5.2`) but **rejects every Codex-specific variant** (`gpt-5*-codex`, `codex-mini-*`) with a 400 `"model is not supported when using Codex with a ChatGPT account"`. `llm_model` is therefore set to `gpt-5.5`.

## 1. Goal

The mission-control AI agent ("Aya") must use **OpenAI models only**, paid by **G's existing ChatGPT subscription** (not pay-per-token API billing). This requires reusing OpenAI's **Codex "Sign in with ChatGPT"** OAuth flow (the only mechanism that charges model calls to a ChatGPT plan) with a **device-code** grant, storing the tokens in **Postgres**, and a **CLI command** to authenticate.

## 2. Decisions (from brainstorming)

- **Approach:** Codex-OAuth (subscription). Isolated behind the existing pluggable-LLM layer so it can be swapped for a standard `sk-` key provider quickly if it breaks.
- **Auth flow:** device-code only.
- **Token storage:** Postgres (a single-row credentials table).
- **Drop Anthropic** entirely. Keep `mock` (tests/no-auth). Add `openai_oauth`.

## 3. Honest risks (must remain documented)

This is **unofficial**: OpenAI does not support a third-party app billing a user's subscription. Reusing Codex's client_id + the private `chatgpt.com/backend-api/codex` endpoint means presenting as Codex. Consequences: **(a)** likely violates OpenAI's ToS (G's own subscription, G's risk); **(b)** can break without notice when OpenAI changes the flow (there have been Cloudflare-403 breakages); **(c)** the endpoint serves only the **Codex/ChatGPT model set** via the **Responses API** (not arbitrary models, not Chat Completions); **(d)** **function/tool-calling** support against this endpoint is unverified and must be validated live. Mitigation: keep everything behind the `LLMProvider` interface so switching to an `sk-`-key OpenAI provider is a small, contained change.

## 4. Researched technical facts (the implementer should confirm exact device-endpoint paths + `originator`/User-Agent against the open-source Codex reimplementations — values below are from research)

- **Public client_id:** `app_EMoamEEZ73f0CkXaXp7hrann`
- **Auth base:** `https://auth.openai.com` — authorize `/oauth/authorize`, token `/oauth/token`, device user-verification page `/device` (a.k.a. `/codex/device`).
- **Token grant (device):** `grant_type=urn:ietf:params:oauth:grant-type:device_code`, params `device_code`, `client_id`. Refresh: `grant_type=refresh_token`, `refresh_token`, `client_id`.
- **Tokens:** `access_token` (JWT), `refresh_token`, `id_token`. The JWT carries `chatgpt_account_id` (+ `organization_id`, `project_id`) under the `https://api.openai.com/auth` claim namespace, and `exp`. Refresh responses also carry the account id and (optionally) plan type.
- **Model endpoint:** `https://chatgpt.com/backend-api/codex/responses` (Responses API, SSE).
- **Required headers:** `Authorization: Bearer <access_token>`, `chatgpt-account-id: <account_id>`, `OpenAI-Beta: responses=experimental`, `originator: <codex-originator>`, `User-Agent: <matching UA>`, `accept: text/event-stream`, `content-type: application/json`.
- Codex itself stores creds in `~/.codex/auth.json`; we store in Postgres instead.

## 5. Architecture & components

All backend (Python/FastAPI). New/changed files under `backend/`.

### 5.1 `oauth_credential` table (migration 0018)
Columns: `id` (uuid pk), `provider` (String, **unique** — "openai"), `access_token` (Text), `refresh_token` (Text), `id_token` (Text, nullable), `account_id` (String, nullable), `plan_type` (String, nullable), `expires_at` (timestamptz, nullable), `created_at`, `updated_at`. Single-user → one row per provider (upsert).

### 5.2 `app/agent/token_store.py`
- `async def get_credential(db, provider="openai") -> OAuthCredential | None`
- `async def upsert_credential(db, provider, *, access_token, refresh_token, id_token, account_id, plan_type, expires_at) -> OAuthCredential`
- Pure DB access; no HTTP. Used by the CLI (write) and the provider (read/refresh).

### 5.3 `app/agent/openai_auth.py`
OAuth + the subscription HTTP client. Uses `httpx.AsyncClient` (inject the transport for tests).
- `async def request_device_code(http) -> DeviceCodeResponse` — POST the device-authorization request; returns `{device_code, user_code, verification_uri, interval, expires_in}`.
- `async def poll_for_token(http, device_code, interval, expires_in) -> TokenSet` — poll `/oauth/token` until `authorization_pending` resolves to a token (or timeout / `access_denied`).
- `def decode_account_id(access_token) -> (account_id, expires_at)` — decode the JWT (no signature verification needed for our own use; just read claims) to extract `chatgpt_account_id` + `exp`.
- `async def refresh(http, refresh_token) -> TokenSet` — refresh-grant exchange.
- `async def ensure_fresh(db, http) -> str` — load credential; refresh if `expires_at` within a margin (e.g. 60s); persist; return a valid `access_token` (+ account_id).
- `async def responses_call(http, access_token, account_id, body) -> AsyncIterator[dict]` — POST to the responses endpoint with the headers above, yield parsed SSE events.

### 5.4 LLM provider — `app/agent/llm.py`
- **Remove** `_anthropic_complete` and the `anthropic` branch.
- Add `_openai_oauth_complete(messages, tools, system)`:
  1. `access_token, account_id = await ensure_fresh(db, http)` (the agent passes its `db` session in; see 5.6).
  2. Build the Responses request body: `{model: settings.llm_model, instructions: system, input: <messages mapped to Responses input>, tools: <our tool specs mapped to Responses function tools>, stream: true}`.
  3. Stream `responses_call(...)`, assemble output items → if the model emitted `function_call` items, return `LLMTurn(text=None, tool_calls=[...])`; else `LLMTurn(text=<assembled text>, tool_calls=[])`.
  4. On HTTP 401, refresh once and retry; on other errors, raise.
- Keep the `mock` provider unchanged. `complete()` dispatches on `settings.llm_provider`.

### 5.5 CLI — `app/cli.py`
- `auth-openai` command: open a `SessionLocal()` + `httpx.AsyncClient`, `request_device_code`, print `verification_uri` + `user_code` and a "waiting…" line, `poll_for_token`, decode account id + expiry, `upsert_credential`. `--status` prints whether a credential exists, the account id, and expiry.

### 5.6 Threading `db`/`http` into `complete()`
`complete()` currently takes `(messages, tools, system)`. The OAuth provider needs a DB session (token store) + an httpx client. Options: (a) add optional `db`/`http` params to `complete()` and pass them from `run_agent` (which already has `db`); (b) a contextvar carrying the db session. **Decision:** thread `db` (and a lazily-created module-level `httpx.AsyncClient`) explicitly — add `db: AsyncSession | None = None` to `complete()` and have `run_agent` pass its session. The `mock` provider ignores it.

### 5.7 Config (`app/config.py`)
- `llm_provider: str = "mock"` (set `openai_oauth` for real use), `llm_model: str = "<chatgpt/codex model, e.g. gpt-5.x>"`, `openai_oauth_client_id: str = "app_EMoamEEZ73f0CkXaXp7hrann"`, `openai_auth_base_url: str = "https://auth.openai.com"`, `openai_responses_url: str = "https://chatgpt.com/backend-api/codex/responses"`, `openai_originator: str = "<codex-originator>"`, `openai_user_agent: str = "<UA>"`. Remove `anthropic_api_key`. No secret in `.env` — the token lives in the DB.

## 6. Data flow

1. **Auth:** `python -m app.cli auth-openai` → device code → G approves at `auth.openai.com/device` → tokens stored in `oauth_credential`.
2. **Inference:** `/agent/chat` → `run_agent` → `complete(provider=openai_oauth)` → `ensure_fresh` (refresh if needed) → Responses call with subscription headers → SSE assembled → tool loop continues as today.
3. **Refresh:** transparent, on expiry-margin or 401; the row is updated.

## 7. Error handling

- Device flow: handle `authorization_pending` (keep polling), `slow_down` (increase interval), `expired_token`/timeout (clear message, exit non-zero), `access_denied`.
- Refresh failure / no credential: the provider raises a clear error ("Run `auth-openai` first"); `/agent/chat` surfaces it as the assistant error bubble (the agent loop already catches tool/LLM errors).
- 401 on responses: refresh once, retry once, then fail.
- Tool-calling unsupported by the endpoint: if no `function_call` items ever appear and the model only returns text for an obvious tool request, degrade to text answers (logged); capture/tool flows still work under `mock`. (Validated in the live smoke; tune `originator`/model there.)

## 8. Testing

- **No-network unit tests:** inject a fake `httpx` transport. Test: `request_device_code` parses the response; `poll_for_token` handles `authorization_pending` → token; `decode_account_id` extracts the claim from a hand-crafted JWT; `refresh` swaps tokens; `ensure_fresh` refreshes when expired and persists; `token_store` upsert/get. Provider: feed a **recorded Responses SSE byte stream** through the fake transport → assert `complete()` yields the expected `LLMTurn` (both a text turn and a function-call turn).
- **Existing agent tests** keep `llm_provider="mock"` (unchanged).
- **Live smoke (G runs once):** `python -m app.cli auth-openai` with the real account, then `LLM_PROVIDER=openai_oauth /agent/chat "create a task to …"` — confirm the subscription endpoint + headers + tool-calling work end-to-end and tune `originator`/`llm_model`.
- CI stays green (no network; `mock` default).

## 9. Out of scope

- **Embeddings via the subscription** (the Codex endpoint is chat-only) — semantic search keeps the `fake` local embedder; real OpenAI embeddings would need a separate `sk-` key. Not changed here.
- Browser-PKCE flow (device-code only, per decision).
- Multi-user / multiple stored accounts (single `provider` row).
- An `sk-`-key OpenAI fallback provider (the interface makes it easy to add later if OAuth breaks; not built now).

## 10. Acceptance

- `python -m app.cli auth-openai` authenticates G's ChatGPT account via device code and stores tokens in `oauth_credential`; `--status` reports them.
- With `LLM_PROVIDER=openai_oauth`, `/agent/chat` produces a real model response billed to the subscription, refreshing tokens transparently, with the agent tool-loop intact (or gracefully degrading to text if tools aren't honored).
- Anthropic is gone; `mock` still powers the test suite; backend + frontend gates green.
