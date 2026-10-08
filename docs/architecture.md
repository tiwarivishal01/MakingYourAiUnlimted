# Architecture

## Proposed final architecture

The stable boundary is an HTTP API. A request manager owns lifecycle, queueing, timeout, cancellation, idempotency, and session assignment. A browser controller owns tabs and Playwright connectivity. Provider adapters own all provider-specific selectors, page detection, UI states, submission, completion detection, and extraction. A response parser preserves raw text and produces coding artifacts.

The three identities remain separate:

- API user: the caller authorized to use this service
- Browser session: an authenticated local browser context or tab group
- Provider: the adapter and AI web interface being targeted

## MVP architecture

1. Fastify API with Zod validation and request IDs.
2. In-memory request store and queue.
3. One active job per browser tab.
4. Playwright browser controller behind an interface.
5. A local fake AI page used for integration and end-to-end tests.
6. One provider adapter first; real providers follow only after the fake loop is reliable.

Phase 1 implemented the service skeleton and health endpoint. Phase 2 added Zod-validated model, session, request, cancellation, and chat intake routes backed by an in-memory store. Phase 3 adds the request engine: one active execution at a time, FIFO ordering, queue and execution timeouts, lifecycle updates, and cancellation. Phase 4 added the fake browser executor. Phase 5 adds the Gemini adapter. The default executor still returns `NO_SESSION` unless a provider URL is configured.

Phase 6 adds CDP browser session management. `BrowserSessionManager` discovers matching pages, gives each tab a stable process-local session ID, tracks provider status and last-seen time, rejects a second lease while a tab is busy, and marks sessions offline when the browser disconnects. `/v1/sessions` refreshes discovery before returning results. Phase 7 adds Claude alongside Gemini without changing the API or request engine.

## API contract

- `GET /v1/health`: service health and request ID.
- `GET /v1/models`: browser-backed model descriptors.
- `GET /v1/sessions`: available browser sessions.
- `GET /v1/requests`: request records.
- `GET /v1/requests/:requestId`: one request record.
- `POST /v1/requests/:requestId/cancel`: cancel a request record.
- `POST /v1/chat/completions`: accepts OpenAI-shaped non-streaming input. It returns `NO_SESSION` until execution is available.

The chat schema accepts `model`, non-empty `messages`, optional `stream`, and optional `provider` and `conversationId`. Non-streaming execution remains the source of truth; the SSE layer currently packages its completed result as one chunk.

## Phase 3 request engine

`RequestEngine` receives a validated request and an injected `BrowserExecutor`. It records `QUEUED`, processes one item at a time, advances through assignment and generation states, then records `EXTRACTING` and `COMPLETED` on success. Queue timeout and execution timeout become explicit terminal `TIMEOUT` records. Cancellation removes queued work or aborts an active executor through `AbortSignal`; the engine does not start another item until the active executor settles.

## Completed later phases

- Phase 8: `response-normalizer.ts` preserves `raw`, produces cleaned `text`, extracts fenced `artifacts`, and powers `/v1/code`.
- Phase 9: `extensions/vscode` provides API-backed Ask, Explain, Fix, Refactor, and Optimize commands.
- Phase 10: `stream: true` emits an SSE completion chunk and `[DONE]`; provider token streaming remains a future refinement.
- Phase 11: `FileBackedStore` provides a replaceable local persistence boundary and `ApiKeyAuthenticator` protects non-health routes when keys are configured.

The JSON store is local MVP persistence, not multi-process storage. SSE currently sends the completed response as one chunk. API keys supplied through environment variables are hashed in memory, but production should use a secret manager and TLS/rate limiting.

## Provider status and authentication

`GeminiAdapter` owns Gemini URL matching, prompt input fallbacks, send-button fallbacks, model-message detection, streaming stability, login detection, rate-limit detection, and cancellation. It never reads credentials or tokens. Phase 5 launches a separate Playwright browser; attaching to an already-authenticated browser and discovering tabs belongs to Phase 6.

## Request state machine

Normal states:

`CREATED -> QUEUED -> ASSIGNED -> CONNECTING -> WAITING_FOR_UI -> PROMPT_INSERTING -> SUBMITTING -> GENERATING -> EXTRACTING -> COMPLETED`

Terminal failure states include `CANCELLED`, `TIMEOUT`, `NO_SESSION`, `SESSION_OFFLINE`, `LOGIN_REQUIRED`, `PROVIDER_BUSY`, `PROVIDER_ERROR`, `PROVIDER_RATE_LIMITED`, `RESPONSE_PARSE_FAILED`, and `UNKNOWN_EXECUTION_STATE`.

An uncertain execution must not be blindly retried: after a prompt may have been submitted, the request is recorded as uncertain and requires an explicit recovery policy.

## Browser execution lifecycle

Capture the assistant-message baseline, insert and submit the prompt through the adapter, identify the new assistant message, then observe streaming text and provider completion signals. Completion requires stable text for a configured interval plus any available provider-specific signal. The adapter returns only the new response; it never hands page-wide text to the API.

## Main risks

- Provider DOM changes can break selectors and completion heuristics.
- A browser disconnect after submission creates an ambiguous execution.
- Existing conversations can make baseline detection incorrect.
- Provider terms and automation restrictions differ; blocked states must be surfaced, never bypassed.
- Source code and prompts may contain secrets, so production logs default to metadata only.

## Testing strategy

Unit-test state transitions, configuration, normalization, and each adapter's page heuristics. Use a local fake AI page to test prompt insertion, streaming, delayed completion, provider errors, and code responses. Use Playwright end-to-end tests for the complete HTTP-to-browser loop. Real provider pages are compatibility checks, not the foundation of the test suite.