import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ChatCompletionRequest, BrowserSession, RequestRecord, RequestStatus } from "./api-types.js";

export type StoreSnapshot = {
  requests: RequestRecord[];
  sessions: BrowserSession[];
};

export interface RequestStore {
  createRequest(input: ChatCompletionRequest, requestId?: string): RequestRecord;
  listRequests(): RequestRecord[];
  getRequest(id: string): RequestRecord | undefined;
  cancelRequest(id: string): RequestRecord | undefined;
  listSessions(): BrowserSession[];
  updateRequest(id: string, status: RequestStatus, errorCode?: string): RequestRecord | undefined;
}

export class InMemoryStore implements RequestStore {
  private readonly requests = new Map<string, RequestRecord>();
  private readonly sessions = new Map<string, BrowserSession>();

  public createRequest(input: ChatCompletionRequest, requestId = `req_${randomUUID()}`, now = new Date()): RequestRecord {
    const timestamp = now.toISOString();
    const record: RequestRecord = {
      id: requestId,
      status: "CREATED",
      model: input.model,
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.requests.set(record.id, record);
    return record;
  }

  public listRequests(): RequestRecord[] {
    return [...this.requests.values()];
  }

  public getRequest(id: string): RequestRecord | undefined {
    return this.requests.get(id);
  }

  public cancelRequest(id: string): RequestRecord | undefined {
    const request = this.requests.get(id);
    if (request === undefined) {
      return undefined;
    }

    const updated: RequestRecord = {
      ...request,
      status: "CANCELLED",
      updatedAt: new Date().toISOString()
    };
    this.requests.set(id, updated);
    return updated;
  }

  public listSessions(): BrowserSession[] {
    return [...this.sessions.values()];
  }

  public updateRequest(id: string, status: RequestStatus, errorCode?: string): RequestRecord | undefined {
    const request = this.requests.get(id);
    if (request === undefined) {
      return undefined;
    }

    const updated: RequestRecord = {
      ...request,
      status,
      updatedAt: new Date().toISOString(),
      ...(errorCode === undefined ? {} : { errorCode })
    };
    this.requests.set(id, updated);
    return updated;
  }

  public snapshot(): StoreSnapshot {
    return { requests: this.listRequests(), sessions: this.listSessions() };
  }

  public restore(snapshot: StoreSnapshot): void {
    this.requests.clear();
    this.sessions.clear();
    for (const request of snapshot.requests) {
      this.requests.set(request.id, request);
    }
    for (const session of snapshot.sessions) {
      this.sessions.set(session.id, session);
    }
  }
}

export class FileBackedStore implements RequestStore {
  private readonly memory = new InMemoryStore();

  public constructor(private readonly filePath: string) {
    if (existsSync(filePath)) {
      const snapshot = JSON.parse(readFileSync(filePath, "utf8")) as StoreSnapshot;
      this.memory.restore(snapshot);
    }
  }

  public createRequest(input: ChatCompletionRequest, requestId?: string): RequestRecord {
    const record = this.memory.createRequest(input, requestId);
    this.persist();
    return record;
  }

  public listRequests(): RequestRecord[] { return this.memory.listRequests(); }
  public getRequest(id: string): RequestRecord | undefined { return this.memory.getRequest(id); }
  public listSessions(): BrowserSession[] { return this.memory.listSessions(); }

  public cancelRequest(id: string): RequestRecord | undefined {
    const record = this.memory.cancelRequest(id);
    this.persist();
    return record;
  }

  public updateRequest(id: string, status: RequestStatus, errorCode?: string): RequestRecord | undefined {
    const record = this.memory.updateRequest(id, status, errorCode);
    this.persist();
    return record;
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.memory.snapshot(), null, 2), "utf8");
  }
}