import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { RequestEngine, type BrowserExecutor } from "../src/request-engine.js";
import { InMemoryStore } from "../src/store.js";
import type { AppConfig, } from "../src/config.js";
import type { ChatCompletionResponse } from "../src/api-types.js";

const config: AppConfig = {
  port: 8787,
  host: "127.0.0.1",
  logLevel: "silent",
  requestTimeoutMs: 1000,
  queueTimeoutMs: 1000,
  responseStabilityMs: 100,
  browserHeadless: true,
  fakeUiUrl: undefined,
  geminiUiUrl: undefined,
  claudeUiUrl: undefined,
  browserProvider: "fake",
  browserCdpUrl: undefined,
  persistencePath: undefined,
  apiKeys: []
};

const executor: BrowserExecutor = {
  async execute(input): Promise<ChatCompletionResponse> {
    return {
      id: "chatcmpl_sse",
      object: "chat.completion",
      model: input.model,
      choices: [{ index: 0, message: { role: "assistant", content: "streamed answer" }, finish_reason: "stop" }]
    };
  }
};

test("stream=true returns SSE data and a DONE sentinel", async () => {
  const store = new InMemoryStore();
  const app = buildApp(config, store, new RequestEngine(store, executor, 1000, 1000));

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "fake-ai", messages: [{ role: "user", content: "Hello" }], stream: true }
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /text\/event-stream/);
    assert.match(response.body, /chat\.completion\.chunk/);
    assert.match(response.body, /streamed answer/);
    assert.match(response.body, /data: \[DONE\]/);
  } finally {
    await app.close();
  }
});
