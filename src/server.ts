import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { FileBackedStore, InMemoryStore, type RequestStore } from "./store.js";
import { RequestEngine } from "./request-engine.js";
import { ManagedBrowserExecutor, PlaywrightBrowserExecutor } from "./browser-controller.js";
import { FakeProviderAdapter } from "./providers/fake-provider-adapter.js";
import { GeminiAdapter } from "./providers/gemini-adapter.js";
import { ClaudeAdapter } from "./providers/claude-adapter.js";
import { BrowserSessionManager } from "./session-manager.js";

const config = loadConfig();
const store: RequestStore = config.persistencePath === undefined
  ? new InMemoryStore()
  : new FileBackedStore(config.persistencePath);
const pageUrl = config.browserProvider === "gemini"
  ? config.geminiUiUrl
  : config.browserProvider === "claude" ? config.claudeUiUrl : config.fakeUiUrl;
const adapter = config.browserProvider === "gemini"
  ? new GeminiAdapter()
  : config.browserProvider === "claude" ? new ClaudeAdapter() : new FakeProviderAdapter();
const sessionManager = config.browserCdpUrl === undefined
  ? undefined
  : new BrowserSessionManager([new GeminiAdapter(), new ClaudeAdapter(), new FakeProviderAdapter()], config.browserCdpUrl);
if (sessionManager !== undefined) {
  await sessionManager.connect().catch((error) => appLog(error));
}
const executor = sessionManager !== undefined
  ? new ManagedBrowserExecutor(sessionManager)
  : pageUrl === undefined
  ? undefined
  : new PlaywrightBrowserExecutor(pageUrl, adapter, config.browserHeadless);
const engine = executor === undefined
  ? undefined
  : new RequestEngine(store, executor, config.queueTimeoutMs, config.requestTimeoutMs);
const app = buildApp(config, store, engine, sessionManager ?? store);

function appLog(error: unknown): void {
  console.error("Browser session connection failed:", error);
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}