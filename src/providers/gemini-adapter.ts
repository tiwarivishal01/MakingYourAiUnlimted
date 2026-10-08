import { AppError } from "../errors.js";
import type { Page, Locator } from "playwright";
import type { ProviderAdapter, ProviderStatus } from "./provider-adapter.js";

const assistantSelector = [
  '[data-message-author-role="model"]',
  "model-response",
  "message-content.model-response",
  '[class*="model-response"]'
].join(", ");

const inputSelectors = [
  'textarea[aria-label*="prompt" i]',
  'textarea[placeholder*="prompt" i]',
  'div[contenteditable="true"][role="textbox"]',
  "rich-textarea [contenteditable=\"true\"]"
];

const sendSelectors = [
  'button[aria-label*="send" i]',
  'button[mattooltip*="send" i]',
  'button[data-tooltip*="send" i]'
];

export class GeminiAdapter implements ProviderAdapter {
  public readonly id = "gemini";

  public matchesPage(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "gemini.google.com" && parsed.pathname.startsWith("/app");
    } catch {
      return false;
    }
  }

  public async getStatus(page: Page): Promise<ProviderStatus> {
    if (await page.getByText("Sign in", { exact: true }).first().isVisible().catch(() => false)) {
      return { status: "LOGIN_REQUIRED", message: "Gemini requires an authenticated Google session." };
    }

    if (await this.stopButton(page).isVisible().catch(() => false)) {
      return { status: "BUSY" };
    }

    if (await page.getByText(/rate limit|try again later/i).first().isVisible().catch(() => false)) {
      return { status: "ERROR", message: "Gemini reports a rate or access restriction." };
    }

    const input = await this.findInput(page);
    if (input === undefined) {
      return { status: "ERROR", message: "Gemini prompt input was not found." };
    }
    return { status: "READY" };
  }

  public async submitPrompt(page: Page, prompt: string): Promise<number> {
    const assistantCount = await page.locator(assistantSelector).count();
    const input = await this.findInput(page);
    if (input === undefined) {
      throw new AppError("PROMPT_INSERT_FAILED", "Gemini prompt input was not found.", 502);
    }

    await input.fill(prompt);
    const send = await this.findSendButton(page);
    if (send === undefined) {
      await input.press("Enter");
    } else {
      await send.click();
    }
    return assistantCount;
  }

  public async waitForResponse(page: Page, assistantCountBeforeSubmit: number, signal: AbortSignal): Promise<string> {
    const startedAt = Date.now();
    let lastText = "";
    let stableSince = Date.now();

    while (Date.now() - startedAt < 240_000) {
      if (signal.aborted) {
        await this.cancel(page);
        throw new AppError("REQUEST_CANCELLED", "Request was cancelled.", 409);
      }

      const messages = page.locator(assistantSelector);
      const count = await messages.count();
      if (count > assistantCountBeforeSubmit) {
        const text = (await messages.nth(count - 1).innerText()).trim();
        if (text !== lastText) {
          lastText = text;
          stableSince = Date.now();
        }
        const generating = await this.stopButton(page).isVisible().catch(() => false);
        if (!generating && text.length > 0 && Date.now() - stableSince >= 250) {
          return text;
        }
      }
      await page.waitForTimeout(50);
    }

    throw new AppError("EXECUTION_TIMEOUT", "Gemini response timed out.", 504);
  }

  public async cancel(page: Page): Promise<void> {
    const stop = this.stopButton(page);
    if (await stop.isVisible().catch(() => false)) {
      await stop.click();
    }
  }

  private async findInput(page: Page): Promise<Locator | undefined> {
    for (const selector of inputSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
    return undefined;
  }

  private async findSendButton(page: Page): Promise<Locator | undefined> {
    for (const selector of sendSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
    return undefined;
  }

  private stopButton(page: Page): Locator {
    return page.locator('button[aria-label*="stop" i], button[mattooltip*="stop" i]').first();
  }
}