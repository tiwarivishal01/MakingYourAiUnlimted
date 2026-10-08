import { chromium, type Browser, type Page } from "playwright";
import { AppError } from "./errors.js";
import type { BrowserSession, SessionStatus } from "./api-types.js";
import type { ProviderAdapter } from "./providers/provider-adapter.js";

export type SessionLease = {
  session: BrowserSession;
  page: Page;
  adapter: ProviderAdapter;
  release(): void;
};

type ManagedSession = SessionLease & { page: Page };

export class BrowserSessionManager {
  private browser: Browser | undefined;
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly pageIds = new WeakMap<Page, string>();
  private connected = false;

  public constructor(
    private readonly adapters: readonly ProviderAdapter[],
    private readonly cdpUrl?: string
  ) {}

  public async connect(browser?: Browser): Promise<void> {
    if (this.connected) {
      return;
    }
    this.browser = browser ?? (this.cdpUrl === undefined ? undefined : await chromium.connectOverCDP(this.cdpUrl));
    if (this.browser === undefined) {
      throw new AppError("NO_SESSION", "No browser CDP URL is configured.", 503);
    }
    this.connected = true;
    this.browser.on("disconnected", () => {
      this.connected = false;
      for (const managed of this.sessions.values()) {
        managed.session.status = "OFFLINE";
        managed.session.busy = false;
      }
    });
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    if (this.browser === undefined || !this.connected) {
      return;
    }

    const discovered = new Set<string>();
    for (const context of this.browser.contexts()) {
      for (const page of context.pages()) {
        const adapter = this.adapters.find((candidate) => {
          try {
            return candidate.matchesPage(page.url());
          } catch {
            return false;
          }
        });
        if (adapter === undefined) {
          continue;
        }

        const id = this.pageIds.get(page) ?? `sess_${this.sessions.size + 1}`;
        this.pageIds.set(page, id);
        discovered.add(id);
        const existing = this.sessions.get(id);
        const status = existing?.session.busy === true
          ? "BUSY"
          : await this.readStatus(page, adapter);
        const session: BrowserSession = {
          id,
          tabId: page.url(),
          provider: adapter.id,
          status,
          lastSeen: new Date().toISOString(),
          busy: existing?.session.busy ?? false
        };
        const release = () => {
          const current = this.sessions.get(id);
          if (current !== undefined) {
            current.session.busy = false;
            current.session.status = "READY";
          }
        };
        this.sessions.set(id, { session, page, adapter, release });
        page.once("close", () => {
          this.sessions.delete(id);
        });
      }
    }

    for (const [id, managed] of this.sessions) {
      if (!discovered.has(id) && !managed.page.isClosed()) {
        managed.session.status = "OFFLINE";
      }
    }
  }

  public listSessions(): BrowserSession[] {
    return [...this.sessions.values()].map(({ session }) => ({ ...session }));
  }

  public async acquire(provider?: string): Promise<SessionLease> {
    await this.refresh();
    const candidate = [...this.sessions.values()].find((managed) =>
      !managed.page.isClosed() && !managed.session.busy && managed.session.status === "READY" &&
      (provider === undefined || managed.session.provider === provider)
    );
    if (candidate === undefined) {
      throw new AppError("NO_SESSION", "No ready browser session is available.", 503);
    }
    candidate.session.busy = true;
    candidate.session.status = "BUSY";
    return candidate;
  }

  public async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.connected = false;
    this.sessions.clear();
  }

  private async readStatus(page: Page, adapter: ProviderAdapter): Promise<SessionStatus> {
    try {
      return (await adapter.getStatus(page)).status;
    } catch {
      return "ERROR";
    }
  }
}