import { AppError } from "./errors.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  RequestRecord,
  RequestStatus
} from "./api-types.js";
import type { RequestStore } from "./store.js";

export type BrowserExecutor = {
  execute(input: ChatCompletionRequest, signal: AbortSignal): Promise<ChatCompletionResponse>;
};

type QueueItem = {
  record: RequestRecord;
  input: ChatCompletionRequest;
  resolve: (response: ChatCompletionResponse) => void;
  reject: (error: unknown) => void;
  queuedAt: number;
};

export class NoSessionExecutor implements BrowserExecutor {
  public async execute(_input: ChatCompletionRequest, _signal: AbortSignal): Promise<ChatCompletionResponse> {
    throw new AppError("NO_SESSION", "No browser session is currently available for this request.", 503);
  }
}

export class RequestEngine {
  private readonly queue: QueueItem[] = [];
  private active = false;
  private activeItem: QueueItem | undefined;
  private activeController: AbortController | undefined;

  public constructor(
    private readonly store: RequestStore,
    private readonly executor: BrowserExecutor = new NoSessionExecutor(),
    private readonly queueTimeoutMs = 30_000,
    private readonly executionTimeoutMs = 240_000
  ) {}

  public submit(input: ChatCompletionRequest, requestId: string): Promise<ChatCompletionResponse> {
    const record = this.store.createRequest(input, requestId);
    this.store.updateRequest(record.id, "QUEUED");

    return new Promise<ChatCompletionResponse>((resolve, reject) => {
      this.queue.push({ record, input, resolve, reject, queuedAt: Date.now() });
      void this.pump();
    });
  }

  public cancel(requestId: string): RequestRecord | undefined {
    const record = this.store.getRequest(requestId);
    if (record === undefined) {
      return undefined;
    }
    if (this.isTerminal(record.status)) {
      return record;
    }

    const queueIndex = this.queue.findIndex((item) => item.record.id === requestId);
    if (queueIndex >= 0) {
      const [item] = this.queue.splice(queueIndex, 1);
      item?.reject(new AppError("REQUEST_CANCELLED", "Request was cancelled.", 409, requestId));
    } else if (this.activeItem?.record.id === requestId && this.activeController !== undefined) {
      this.activeController.abort();
      this.activeItem.reject(new AppError("REQUEST_CANCELLED", "Request was cancelled.", 409, requestId));
    }
    return this.store.updateRequest(requestId, "CANCELLED");
  }

  private async pump(): Promise<void> {
    if (this.active) {
      return;
    }
    const item = this.queue.shift();
    if (item === undefined) {
      return;
    }

    this.active = true;
    const controller = new AbortController();
    this.activeItem = item;
    this.activeController = controller;
    try {
      if (Date.now() - item.queuedAt > this.queueTimeoutMs) {
        throw new AppError("QUEUE_TIMEOUT", "Request remained queued past its timeout.", 504, item.record.id);
      }

      this.advance(item.record.id, "ASSIGNED");
      this.advance(item.record.id, "CONNECTING");
      this.advance(item.record.id, "WAITING_FOR_UI");
      this.advance(item.record.id, "PROMPT_INSERTING");
      this.advance(item.record.id, "SUBMITTING");
      this.advance(item.record.id, "GENERATING");

      const response = await this.withTimeout(
        this.executor.execute(item.input, controller.signal),
        controller,
        this.executionTimeoutMs,
        item.record.id
      );
      this.advance(item.record.id, "EXTRACTING");
      this.advance(item.record.id, "COMPLETED");
      item.resolve(response);
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError(
          "PROVIDER_ERROR",
          error instanceof Error ? error.message : "Browser execution failed.",
          502,
          item.record.id
        );
      const current = this.store.getRequest(item.record.id);
      if (current?.status !== "CANCELLED") {
        const status = this.statusForError(appError);
        this.store.updateRequest(item.record.id, status, appError.code);
        item.reject(appError);
      }
    } finally {
      this.active = false;
      this.activeItem = undefined;
      this.activeController = undefined;
      void this.pump();
    }
  }

  private async withTimeout(
    operation: Promise<ChatCompletionResponse>,
    controller: AbortController,
    timeoutMs: number,
    requestId: string
  ): Promise<ChatCompletionResponse> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new AppError("EXECUTION_TIMEOUT", "Browser execution timed out.", 504, requestId));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  private advance(requestId: string, status: RequestStatus): void {
    this.store.updateRequest(requestId, status);
  }

  private statusForError(error: AppError): RequestStatus {
    switch (error.code) {
      case "NO_SESSION": return "NO_SESSION";
      case "QUEUE_TIMEOUT": return "TIMEOUT";
      case "EXECUTION_TIMEOUT": return "TIMEOUT";
      case "REQUEST_CANCELLED": return "CANCELLED";
      case "LOGIN_REQUIRED": return "LOGIN_REQUIRED";
      case "PROVIDER_RATE_LIMITED": return "PROVIDER_RATE_LIMITED";
      case "PROVIDER_BUSY": return "PROVIDER_BUSY";
      case "PROMPT_INSERT_FAILED": return "PROVIDER_ERROR";
      default: return "PROVIDER_ERROR";
    }
  }

  private isTerminal(status: RequestStatus): boolean {
    return ["COMPLETED", "CANCELLED", "TIMEOUT", "NO_SESSION", "SESSION_OFFLINE", "LOGIN_REQUIRED", "PROVIDER_BUSY", "PROVIDER_ERROR", "PROVIDER_RATE_LIMITED", "RESPONSE_PARSE_FAILED", "UNKNOWN_EXECUTION_STATE"].includes(status);
  }
}