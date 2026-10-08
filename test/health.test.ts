import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

const testConfig: AppConfig = {
  port: 8787,
  host: "127.0.0.1",
  logLevel: "silent",
  requestTimeoutMs: 240_000,
  queueTimeoutMs: 30_000,
  responseStabilityMs: 1_500,
  browserHeadless: false,
  fakeUiUrl: undefined,
  geminiUiUrl: undefined,
  claudeUiUrl: undefined,
  browserProvider: "fake",
  browserCdpUrl: undefined,
  persistencePath: undefined,
  apiKeys: []
};

test("GET /v1/health returns a request-correlated healthy response", async () => {
  const app = buildApp(testConfig);

  try {
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    const body = response.json() as { status: string; service: string; requestId: string };

    assert.equal(response.statusCode, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "browser-ai-bridge");
    assert.match(body.requestId, /^req_[0-9a-f-]+$/);
    assert.equal(response.headers["x-request-id"], undefined);
  } finally {
    await app.close();
  }
});

test("Phase 2 routes expose models and currently empty browser sessions", async () => {
  const app = buildApp(testConfig);

  try {
    const models = await app.inject({ method: "GET", url: "/v1/models" });
    const sessions = await app.inject({ method: "GET", url: "/v1/sessions" });

    assert.equal(models.statusCode, 200);
    assert.deepEqual(models.json(), {
      object: "list",
      data: [
        { id: "fake-ai", object: "model", provider: "fake", transport: "browser" },
        { id: "gemini-ui", object: "model", provider: "gemini", transport: "browser" },
        { id: "claude-ui", object: "model", provider: "claude", transport: "browser" }
      ]
    });
    assert.deepEqual(sessions.json(), { sessions: [] });
  } finally {
    await app.close();
  }
});

test("chat completion validation and request correlation are explicit", async () => {
  const app = buildApp(testConfig);

  try {
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "fake-ai", messages: [] }
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "INVALID_REQUEST");

    const unavailable = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "fake-ai",
        messages: [{ role: "user", content: "Hello" }],
        stream: false
      }
    });
    const errorBody = unavailable.json() as { error: { code: string; requestId: string } };
    assert.equal(unavailable.statusCode, 503);
    assert.equal(errorBody.error.code, "NO_SESSION");
    assert.match(errorBody.error.requestId, /^req_[0-9a-f-]+$/);

    const request = await app.inject({
      method: "GET",
      url: `/v1/requests/${errorBody.error.requestId}`
    });
    assert.equal(request.statusCode, 200);
    assert.equal(request.json().id, errorBody.error.requestId);

    const cancelled = await app.inject({
      method: "POST",
      url: `/v1/requests/${errorBody.error.requestId}/cancel`
    });
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().status, "NO_SESSION");
  } finally {
    await app.close();
  }
});