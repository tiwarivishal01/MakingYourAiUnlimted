import type { Page } from "playwright";
import type { SessionStatus } from "../api-types.js";

export type ProviderStatus = {
  status: SessionStatus;
  message?: string;
};

export type ProviderAdapter = {
  readonly id: string;
  matchesPage(url: string): boolean;
  getStatus(page: Page): Promise<ProviderStatus>;
  submitPrompt(page: Page, prompt: string): Promise<number>;
  waitForResponse(page: Page, assistantCountBeforeSubmit: number, signal: AbortSignal): Promise<string>;
  cancel(page: Page): Promise<void>;
};