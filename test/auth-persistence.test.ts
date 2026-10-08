import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ApiKeyAuthenticator } from "../src/auth.js";
import { FileBackedStore } from "../src/store.js";

test("API key authenticator accepts configured bearer keys and rejects invalid keys", () => {
  const authenticator = new ApiKeyAuthenticator(["local-secret"]);
  authenticator.authenticate("Bearer local-secret");
  assert.throws(() => authenticator.authenticate("Bearer wrong"), { code: "UNAUTHORIZED" });
  assert.throws(() => authenticator.authenticate(undefined), { code: "UNAUTHORIZED" });
});

test("file-backed store restores request records", () => {
  const directory = mkdtempSync(join(tmpdir(), "browser-ai-bridge-"));
  const path = join(directory, "nested", "state.json");
  try {
    const first = new FileBackedStore(path);
    first.createRequest({ model: "fake-ai", messages: [{ role: "user", content: "persist me" }], stream: false }, "req_persisted");
    assert.match(readFileSync(path, "utf8"), /req_persisted/);

    const second = new FileBackedStore(path);
    assert.equal(second.getRequest("req_persisted")?.status, "CREATED");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});