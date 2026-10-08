import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1)
});

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1).default("fake-ai"),
  messages: z.array(chatMessageSchema).min(1),
  stream: z.boolean().default(false),
  provider: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional()
});

export const codeRequestSchema = z.object({
  provider: z.string().min(1).optional(),
  model: z.string().min(1).default("fake-ai"),
  language: z.string().min(1),
  task: z.enum(["fix", "explain", "refactor", "optimize", "generate"]).default("fix"),
  code: z.string().min(1),
  instruction: z.string().min(1)
});

export type CodeRequest = z.infer<typeof codeRequestSchema>;

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

export type RequestStatus =
  | "CREATED"
  | "QUEUED"
  | "ASSIGNED"
  | "CONNECTING"
  | "WAITING_FOR_UI"
  | "PROMPT_INSERTING"
  | "SUBMITTING"
  | "GENERATING"
  | "EXTRACTING"
  | "COMPLETED"
  | "CANCELLED"
  | "TIMEOUT"
  | "NO_SESSION"
  | "SESSION_OFFLINE"
  | "LOGIN_REQUIRED"
  | "PROVIDER_BUSY"
  | "PROVIDER_ERROR"
  | "PROVIDER_RATE_LIMITED"
  | "RESPONSE_PARSE_FAILED"
  | "UNKNOWN_EXECUTION_STATE";

export type ChatCompletionResponse = {
  id: string;
  object: "chat.completion";
  model: string;
  choices: [{
    index: 0;
    message: { role: "assistant"; content: string };
    finish_reason: "stop";
  }];
  normalized?: {
    raw: string;
    text: string;
    artifacts: Array<{ type: "code"; language: string; content: string }>;
  };
};

export type RequestRecord = {
  id: string;
  status: RequestStatus;
  model: string;
  provider?: string;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
};

export type SessionStatus = "READY" | "BUSY" | "OFFLINE" | "LOGIN_REQUIRED" | "ERROR";

export type BrowserSession = {
  id: string;
  tabId: string;
  provider: string;
  status: SessionStatus;
  lastSeen: string;
  busy: boolean;
};

export type ModelDescription = {
  id: string;
  object: "model";
  provider: string;
  transport: "browser";
};