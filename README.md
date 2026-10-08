# MakingYourAiUnlimted

Browser-backed AI UI bridge. The browser session remains responsible for provider authentication; this service will expose a stable local HTTP API and delegate provider-specific UI behavior to adapters.

## Phase 1

Phase 1 provided the TypeScript/Fastify service skeleton and `GET /v1/health`. Phase 2 added the validated API contract and in-memory request/session surfaces. Phase 3 adds the serialized request engine, lifecycle states, cancellation, and timeouts. Phase 4 adds a Playwright browser controller and fake streaming AI UI. Phase 5 adds Gemini. Phase 7 adds Claude and proves the adapter boundary with two real-provider implementations.

### Requirements

- Node.js 20 or newer
- npm 10 or newer

### Run

```sh
npm install
npm run dev
```

The service listens on `http://localhost:8787` by default.

```sh
curl -i http://localhost:8787/v1/health
npm test
npm run build
```

Configuration is supplied through environment variables. See `.env.example` for the Phase 1 settings.

To run the fake browser-backed flow manually:

```sh
npm run fake-ui
FAKE_UI_URL=http://127.0.0.1:3001/fake-ai BROWSER_HEADLESS=true npm start
```

Phase 2 and 3 routes are available at `GET /v1/models`, `GET /v1/sessions`, `GET /v1/requests`, `GET /v1/requests/:requestId`, `POST /v1/requests/:requestId/cancel`, and `POST /v1/chat/completions`. Chat requests enter the serialized engine and use the Playwright executor when `FAKE_UI_URL` is configured; otherwise the safe default is `NO_SESSION`.

For the Gemini adapter, configure `BROWSER_PROVIDER=gemini` and `GEMINI_UI_URL=https://gemini.google.com/app`. The current controller launches an isolated Playwright browser, so authenticated existing-browser discovery is intentionally deferred to Phase 6.

Phase 6 can attach to an existing Chromium instance through CDP. Start Chromium with remote debugging enabled, set `BROWSER_CDP_URL=http://127.0.0.1:9222`, and start the API. The service discovers matching tabs, reports them through `/v1/sessions`, and leases each tab exclusively during execution.

Phase 8 adds `POST /v1/code`, fenced-code artifact extraction, and raw-response preservation. Phase 9 adds the VS Code client under `extensions/vscode`. Phase 10 supports `stream: true` through SSE. Phase 11 adds optional JSON-file persistence and bearer API-key authentication.

Build everything with:

```sh
npm run build:all
```

For production, replace the JSON store with a transactional database, store only API-key hashes in a secret-managed configuration, and add rate limiting and TLS at the deployment boundary.

## Architecture

The proposed final flow is:

```text
External client -> API -> request manager -> browser session -> provider adapter -> AI UI
									   <- response parser <- completed assistant response
```

The MVP is deliberately local-first: one API process, an in-memory queue, one active request per browser tab, and a fake provider page before any real provider adapter. Provider authentication, cookies, and tokens never enter this service.

See [docs/architecture.md](docs/architecture.md) and [docs/provider-adapter.md](docs/provider-adapter.md) for the design, contracts, state machine, risks, and testing strategy.