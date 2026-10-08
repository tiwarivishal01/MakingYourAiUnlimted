import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { ClaudeAdapter } from "../src/providers/claude-adapter.js";

test("Claude adapter detects its page and extracts a new streamed message", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new ClaudeAdapter();

  try {
    assert.equal(adapter.matchesPage("https://claude.ai/chat/abc"), true);
    assert.equal(adapter.matchesPage("https://gemini.google.com/app"), false);
    await page.setContent(`
      <div contenteditable="true" role="textbox" aria-label="Message"></div>
      <button aria-label="Send">Send</button>
      <button aria-label="Stop generating" hidden>Stop</button>
      <div data-testid="assistant-message">Previous response</div>
      <script>
        document.querySelector('[aria-label="Send"]').addEventListener('click', () => {
          const response = document.createElement('div');
          response.dataset.testid = 'assistant-message';
          document.body.appendChild(response);
          const stop = document.querySelector('[aria-label="Stop generating"]');
          stop.hidden = false;
          const text = 'Claude answer';
          let index = 0;
          const timer = setInterval(() => {
            response.textContent = text.slice(0, ++index);
            if (index === text.length) {
              clearInterval(timer);
              stop.hidden = true;
            }
          }, 10);
        });
      </script>
    `);

    assert.equal((await adapter.getStatus(page)).status, "READY");
    const baseline = await adapter.submitPrompt(page, "Explain this.");
    const response = await adapter.waitForResponse(page, baseline, new AbortController().signal);
    assert.equal(baseline, 1);
    assert.equal(response, "Claude answer");
  } finally {
    await browser.close();
  }
});
