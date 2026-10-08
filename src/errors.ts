export type ErrorCode =
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "NO_SESSION"
  | "REQUEST_CANCELLED"
  | "QUEUE_TIMEOUT"
  | "EXECUTION_TIMEOUT"
  | "PROVIDER_ERROR"
  | "PROVIDER_BUSY"
  | "PROMPT_INSERT_FAILED"
  | "LOGIN_REQUIRED"
  | "PROVIDER_RATE_LIMITED"
  | "UNAUTHORIZED";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly requestId: string | undefined;

  public constructor(code: ErrorCode, message: string, statusCode: number, requestId?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}