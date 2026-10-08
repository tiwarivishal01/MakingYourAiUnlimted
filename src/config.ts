import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().min(1).default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(240_000),
  QUEUE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  RESPONSE_STABILITY_MS: z.coerce.number().int().positive().default(1_500),
  BROWSER_HEADLESS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  FAKE_UI_URL: z.string().url().optional(),
  GEMINI_UI_URL: z.string().url().optional(),
  CLAUDE_UI_URL: z.string().url().optional(),
  BROWSER_PROVIDER: z.enum(["fake", "gemini", "claude"]).default("fake"),
  BROWSER_CDP_URL: z.string().url().optional()
  ,PERSISTENCE_PATH: z.string().min(1).optional()
  ,API_KEYS: z.string().default("").transform((value) => value.split(",").map((key) => key.trim()).filter(Boolean))
});

export type AppConfig = {
  port: number;
  host: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  requestTimeoutMs: number;
  queueTimeoutMs: number;
  responseStabilityMs: number;
  browserHeadless: boolean;
  fakeUiUrl: string | undefined;
  geminiUiUrl: string | undefined;
  claudeUiUrl: string | undefined;
  browserProvider: "fake" | "gemini" | "claude";
  browserCdpUrl: string | undefined;
  persistencePath: string | undefined;
  apiKeys: string[];
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);

  return {
    port: parsed.PORT,
    host: parsed.HOST,
    logLevel: parsed.LOG_LEVEL,
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
    queueTimeoutMs: parsed.QUEUE_TIMEOUT_MS,
    responseStabilityMs: parsed.RESPONSE_STABILITY_MS,
    browserHeadless: parsed.BROWSER_HEADLESS,
    fakeUiUrl: parsed.FAKE_UI_URL,
    geminiUiUrl: parsed.GEMINI_UI_URL,
    claudeUiUrl: parsed.CLAUDE_UI_URL,
    browserProvider: parsed.BROWSER_PROVIDER,
    browserCdpUrl: parsed.BROWSER_CDP_URL,
    persistencePath: parsed.PERSISTENCE_PATH,
    apiKeys: parsed.API_KEYS
  };
}