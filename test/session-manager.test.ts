import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { buildFakeUiServer } from "../src/fake-ui-server.js";
import { FakeProviderAdapter } from "../src/providers/fake-provider-adapter.js";
import { BrowserSessionManager } from "../src/session-manager.js";

test("session manager discovers, leases, and releases a provider tab", async () => {
  const fakeUi = buildFakeUiServer();
  await fakeUi.listen({ host: "127.0.0.1", port: 0 });
  const address = fakeUi.server.address();
  assert.equal(typeof address, "object");
  if (address === null || typeof address === "string") {
    throw new Error("Fake UI did not expose a TCP address.");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/fake-ai`);
  const manager = new BrowserSessionManager([new FakeProviderAdapter()]);

  try {
    await manager.connect(browser);
    const sessions = manager.listSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.provider, "fake");
    assert.equal(sessions[0]?.status, "READY");
    assert.equal(sessions[0]?.busy, false);

    const lease = await manager.acquire("fake");
    assert.equal(manager.listSessions()[0]?.status, "BUSY");
    await assert.rejects(manager.acquire("fake"), { code: "NO_SESSION" });

    lease.release();
    assert.equal(manager.listSessions()[0]?.status, "READY");
    const secondLease = await manager.acquire("fake");
    secondLease.release();
  } finally {
    await manager.close();
    await fakeUi.close();
  }
});