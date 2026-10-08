import assert from "node:assert/strict";
import test from "node:test";
import { RequestEngine, type BrowserExecutor } from "../src/request-engine.js";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../src/api-types.js";
import { InMemoryStore } from "../src/store.js";

const input: ChatCompletionRequest = {
  model: "fake-ai",
  messages: [{ role: "user", content: "Hello" }],
  stream: false
};

function response(id: string): ChatCompletionResponse {
  return {
    id,
    object: "chat.completion",
    model: "fake-ai",
    choices: [{ index: 0, message: { role: "assistant", content: id }, finish_reason: "stop" }]
  };
}

test("request engine processes jobs FIFO with one active execution", async () => {
  const store = new InMemoryStore();
  const order: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const executor: BrowserExecutor = {
    async execute(_request, _signal) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const id = `response_${order.length + 1}`;
      order.push(id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return response(id);
    }
  };
  const engine = new RequestEngine(store, executor, 100, 100);

  const first = engine.submit(input, "req_first");
  const second = engine.submit(input, "req_second");
  const results = await Promise.all([first, second]);

  assert.deepEqual(order, ["response_1", "response_2"]);
  assert.equal(maximumActive, 1);
  assert.equal(results[0]?.choices[0].message.content, "response_1");
  assert.equal(store.getRequest("req_first")?.status, "COMPLETED");
  assert.equal(store.getRequest("req_second")?.status, "COMPLETED");
});

test("request engine records execution timeout", async () => {
  const store = new InMemoryStore();
  const executor: BrowserExecutor = {
    execute: async () => new Promise<ChatCompletionResponse>(() => undefined)
  };
  const engine = new RequestEngine(store, executor, 100, 10);

  await assert.rejects(engine.submit(input, "req_timeout"), { code: "EXECUTION_TIMEOUT" });
  assert.equal(store.getRequest("req_timeout")?.status, "TIMEOUT");
});