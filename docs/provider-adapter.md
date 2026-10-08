# Provider adapter contract

Provider-specific logic stays behind an adapter boundary. The API and request manager operate on provider-neutral sessions and responses.

```ts
interface ProviderAdapter {
  readonly id: string;
  matchesPage(url: string): boolean;
  getStatus(page: Page): Promise<ProviderStatus>;
  submitPrompt(page: Page, prompt: string): Promise<number>;
  waitForResponse(page: Page, assistantCountBeforeSubmit: number, signal: AbortSignal): Promise<string>;
  cancel(page: Page): Promise<void>;
}
```

`FakeProviderAdapter` is the first implementation. It uses only fake-page selectors, records the assistant count before submit, waits for a newly appended assistant node, and requires the provider status to return to `ready` before extraction. `ProviderStatus` must distinguish ready, busy, offline, login-required, CAPTCHA, rate-limited, and error states.

`GeminiAdapter` is the first real-provider implementation. It matches `gemini.google.com/app`, uses semantic and attribute-based selector fallbacks, detects login and rate-limit states, and requires a newly appended model response to remain stable before returning it. Its selectors may require maintenance as Gemini's public DOM changes.

In Phase 6, adapters are registered with `BrowserSessionManager`. A page is eligible only when an adapter matches its URL and reports `READY`. The manager owns tab leases; adapters remain responsible for all provider DOM interaction.

`ClaudeAdapter` is the second real-provider implementation. It matches `claude.ai/chat`, supports contenteditable and textarea input fallbacks, tracks newly appended assistant messages, and waits for streaming text to stabilize. Both real adapters are fixture-tested independently from live accounts.

To add a provider: create the adapter, register it, define page and input detection, implement submission and completion/extraction heuristics, add fixture tests, and expose only provider-neutral capabilities through the API.