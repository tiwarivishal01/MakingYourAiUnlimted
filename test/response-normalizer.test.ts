import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResponse } from "../src/response-normalizer.js";

test("response normalization preserves raw text and extracts multiple code artifacts", () => {
  const raw = "Here is the fix:\n\n```cpp\nint main() { return 0; }\n```\n\n```python\nprint('ok')\n```";
  const normalized = normalizeResponse(raw);

  assert.equal(normalized.raw, raw);
  assert.match(normalized.text, /int main\(\)/);
  assert.doesNotMatch(normalized.text, /```/);
  assert.deepEqual(normalized.artifacts, [
    { type: "code", language: "cpp", content: "int main() { return 0; }" },
    { type: "code", language: "python", content: "print('ok')" }
  ]);
});
