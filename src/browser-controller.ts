import { chromium, type Browser, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./api-types.js";
import type { BrowserExecutor } from "./request-engine.js";
import type { ProviderAdapter } from "./providers/provider-adapter.js";
import { BrowserSessionManager } from "./session-manager.js";
import { normalizeResponse } from "./response-normalizer.js";

export class PlaywrightBrowserExecutor implements BrowserExecutor {
  private browser: Browser | undefined;
  private page: Page | undefined;

  public constructor(
    private readonly pageUrl: string,
    private readonly adapter: ProviderAdapter,
    private readonly headless = true
  ) {}

  public async execute(input: ChatCompletionRequest, signal: AbortSignal): Promise<ChatCompletionResponse> {
    const page = await this.getPage();
    if (!this.adapter.matchesPage(page.url())) {
      throw new AppError("NO_SESSION", "The configured browser page is not supported by this provider.", 503);
    }

    const status = await this.adapter.getStatus(page);
    if (status.status !== "READY") {
      const error = status.status === "LOGIN_REQUIRED"
        ? "LOGIN_REQUIRED"
        : status.status === "ERROR" && status.message?.toLowerCase().includes("rate")
          ? "PROVIDER_RATE_LIMITED"
          : "PROVIDER_BUSY";
      throw new AppError(error, status.message ?? "The provider page is not ready.", error === "LOGIN_REQUIRED" ? 401 : 409);
    }

    const prompt = input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
    const assistantCount = await this.adapter.submitPrompt(page, prompt);
    const content = await this.adapter.waitForResponse(page, assistantCount, signal);

    const result: ChatCompletionResponse = {
      id: `chatcmpl_${randomUUID()}`,
      object: "chat.completion",
      model: input.model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
    };
    return { ...result, normalized: normalizeResponse(content) };
  }

  public async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.page = undefined;
  }

  private async getPage(): Promise<Page> {
    if (this.page !== undefined && !this.page.isClosed()) {
      return this.page;
    }
    this.browser = await chromium.launch({ headless: this.headless });
    this.page = await this.browser.newPage();
    await this.page.goto(this.pageUrl, { waitUntil: "domcontentloaded" });
    return this.page;
  }
}

export class ManagedBrowserExecutor implements BrowserExecutor {
  public constructor(private readonly sessions: BrowserSessionManager) {}

  public async execute(input: ChatCompletionRequest, signal: AbortSignal): Promise<ChatCompletionResponse> {
    const provider = input.provider ?? (input.model === "gemini-ui" ? "gemini" : input.model === "claude-ui" ? "claude" : undefined);
    const lease = await this.sessions.acquire(provider);
    try {
      const status = await lease.adapter.getStatus(lease.page);
      if (status.status !== "READY") {
        throw new AppError(
          status.status === "LOGIN_REQUIRED" ? "LOGIN_REQUIRED" : "PROVIDER_BUSY",
          status.message ?? "The provider page is not ready.",
          status.status === "LOGIN_REQUIRED" ? 401 : 409
        );
      }
      const prompt = input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
      const assistantCount = await lease.adapter.submitPrompt(lease.page, prompt);
      const content = await lease.adapter.waitForResponse(lease.page, assistantCount, signal);
      const result: ChatCompletionResponse = {
        id: `chatcmpl_${randomUUID()}`,
        object: "chat.completion",
        model: input.model,
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
      };
      return { ...result, normalized: normalizeResponse(content) };
    } finally {
      lease.release();
    }
  }
}