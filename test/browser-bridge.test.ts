import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { PlaywrightBrowserExecutor } from "../src/browser-controller.js";
import { buildFakeUiServer } from "../src/fake-ui-server.js";
import { FakeProviderAdapter } from "../src/providers/fake-provider-adapter.js";
import { RequestEngine } from "../src/request-engine.js";
import { InMemoryStore } from "../src/store.js";
import type { AppConfig } from "../src/config.js";

const testConfig: AppConfig = {
  port: 8787,
  host: "127.0.0.1",
  logLevel: "silent",
  requestTimeoutMs: 10_000,
  queueTimeoutMs: 1_000,
  responseStabilityMs: 25,
  browserHeadless: true,
  fakeUiUrl: undefined,
  geminiUiUrl: undefined,
  claudeUiUrl: undefined,
  browserProvider: "fake",
  browserCdpUrl: undefined,
  persistencePath: undefined,
  apiKeys: []
};

test("API request reaches the fake streaming AI UI and extracts the new response", async () => {
  const fakeUi = buildFakeUiServer();
  const store = new InMemoryStore();
  await fakeUi.listen({ host: "127.0.0.1", port: 0 });
  const address = fakeUi.server.address();
  assert.equal(typeof address, "object");
  if (address === null || typeof address === "string") {
    throw new Error("Fake UI did not expose a TCP address.");
  }

  const executor = new PlaywrightBrowserExecutor(
    `http://127.0.0.1:${address.port}/fake-ai`,
    new FakeProviderAdapter(),
    true
  );
  const app = buildApp(
    testConfig,
    store,
    new RequestEngine(store, executor, testConfig.queueTimeoutMs, testConfig.requestTimeoutMs)
  );

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "fake-ai",
        messages: [{ role: "user", content: "Explain browser bridges." }],
        stream: false
      }
    });
    const body = response.json() as { choices: [{ message: { content: string } }]; id: string };

    assert.equal(response.statusCode, 200, response.body);
    assert.match(body.id, /^chatcmpl_/);
    assert.equal(body.choices[0].message.content, "Fake response: user: Explain browser bridges.");
    assert.equal(store.listRequests()[0]?.status, "COMPLETED");
  } finally {
    await app.close();
    await executor.close();
    await fakeUi.close();
  }
});