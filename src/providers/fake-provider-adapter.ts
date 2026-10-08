import { AppError } from "../errors.js";
import type { Page } from "playwright";
import type { ProviderAdapter, ProviderStatus } from "./provider-adapter.js";

export class FakeProviderAdapter implements ProviderAdapter {
  public readonly id = "fake";

  public matchesPage(url: string): boolean {
    return new URL(url).pathname === "/fake-ai";
  }

  public async getStatus(page: Page): Promise<ProviderStatus> {
    const status = await page.getByTestId("provider-status").innerText();
    if (status === "ready") {
      return { status: "READY" };
    }
    if (status === "generating") {
      return { status: "BUSY" };
    }
    return { status: "ERROR", message: `Unknown fake provider status: ${status}` };
  }

  public async submitPrompt(page: Page, prompt: string): Promise<number> {
    const assistantCount = await page.locator('[data-role="assistant"]').count();
    await page.getByTestId("prompt-input").fill(prompt);
    await page.getByTestId("send-button").click();
    return assistantCount;
  }

  public async waitForResponse(page: Page, assistantCountBeforeSubmit: number, signal: AbortSignal): Promise<string> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 240_000) {
      if (signal.aborted) {
        await this.cancel(page);
        throw new AppError("REQUEST_CANCELLED", "Request was cancelled.", 409);
      }

      const assistantMessages = page.locator('[data-role="assistant"]');
      const count = await assistantMessages.count();
      if (count > assistantCountBeforeSubmit) {
        const status = await page.getByTestId("provider-status").innerText();
        const response = await assistantMessages.nth(count - 1).innerText();
        if (status === "ready" && response.length > 0) {
          return response;
        }
      }
      await page.waitForTimeout(25);
    }

    throw new AppError("EXECUTION_TIMEOUT", "Fake provider response timed out.", 504);
  }

  public async cancel(page: Page): Promise<void> {
    const stopButton = page.getByTestId("stop-button");
    if (await stopButton.isVisible()) {
      await stopButton.click();
    }
  }
}