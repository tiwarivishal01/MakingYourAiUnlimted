import { AppError } from "../errors.js";
import type { Locator, Page } from "playwright";
import type { ProviderAdapter, ProviderStatus } from "./provider-adapter.js";

const assistantSelector = [
  '[data-testid="assistant-message"]',
  '[data-author="assistant"]',
  '[data-message-author-role="assistant"]'
].join(", ");

const inputSelectors = [
  'div[contenteditable="true"][role="textbox"]',
  'textarea[placeholder*="reply" i]',
  'textarea[placeholder*="message" i]'
];

export class ClaudeAdapter implements ProviderAdapter {
  public readonly id = "claude";

  public matchesPage(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "claude.ai" && parsed.pathname.startsWith("/chat");
    } catch {
      return false;
    }
  }

  public async getStatus(page: Page): Promise<ProviderStatus> {
    if (await page.getByText("Log in", { exact: true }).first().isVisible().catch(() => false)) {
      return { status: "LOGIN_REQUIRED", message: "Claude requires an authenticated session." };
    }
    if (await this.stopButton(page).isVisible().catch(() => false)) {
      return { status: "BUSY" };
    }
    if (await page.getByText(/rate limit|try again later/i).first().isVisible().catch(() => false)) {
      return { status: "ERROR", message: "Claude reports a rate or access restriction." };
    }
    return (await this.findInput(page)) === undefined
      ? { status: "ERROR", message: "Claude prompt input was not found." }
      : { status: "READY" };
  }

  public async submitPrompt(page: Page, prompt: string): Promise<number> {
    const assistantCount = await page.locator(assistantSelector).count();
    const input = await this.findInput(page);
    if (input === undefined) {
      throw new AppError("PROMPT_INSERT_FAILED", "Claude prompt input was not found.", 502);
    }
    await input.fill(prompt);
    const send = page.getByRole("button", { name: /send/i }).first();
    if (await send.isVisible().catch(() => false)) {
      await send.click();
    } else {
      await input.press("Enter");
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
    throw new AppError("EXECUTION_TIMEOUT", "Claude response timed out.", 504);
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

  private stopButton(page: Page): Locator {
    return page.getByRole("button", { name: /stop generating|stop/i }).first();
  }
}