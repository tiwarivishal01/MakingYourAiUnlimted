import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { GeminiAdapter } from "../src/providers/gemini-adapter.js";

test("Gemini adapter detects supported pages and extracts a newly streamed response", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new GeminiAdapter();

  try {
    assert.equal(adapter.matchesPage("https://gemini.google.com/app"), true);
    assert.equal(adapter.matchesPage("https://example.com/app"), false);

    await page.setContent(`
      <div contenteditable="true" role="textbox" aria-label="Prompt"></div>
      <button aria-label="Send">Send</button>
      <button aria-label="Stop" hidden>Stop</button>
      <div data-message-author-role="model">Previous response</div>
      <script>
        const send = document.querySelector('[aria-label="Send"]');
        const stop = document.querySelector('[aria-label="Stop"]');
        send.addEventListener('click', () => {
          const response = document.createElement('div');
          response.dataset.messageAuthorRole = 'model';
          document.body.appendChild(response);
          stop.hidden = false;
          let index = 0;
          const text = 'Gemini answer';
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

    const status = await adapter.getStatus(page);
    assert.equal(status.status, "READY");
    const baseline = await adapter.submitPrompt(page, "Explain this.");
    const response = await adapter.waitForResponse(page, baseline, new AbortController().signal);

    assert.equal(baseline, 1);
    assert.equal(response, "Gemini answer");
  } finally {
    await browser.close();
  }
});