import Fastify, { type FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import type { AppConfig } from "./config.js";
import { chatCompletionRequestSchema, codeRequestSchema, type ModelDescription } from "./api-types.js";
import { normalizeResponse } from "./response-normalizer.js";
import { InMemoryStore, type RequestStore } from "./store.js";
import { RequestEngine } from "./request-engine.js";
import type { BrowserSession } from "./api-types.js";
import { ApiKeyAuthenticator } from "./auth.js";

export function buildApp(config: AppConfig, store: RequestStore = new InMemoryStore(), engine = new RequestEngine(store, undefined, config.queueTimeoutMs, config.requestTimeoutMs), sessionSource: { listSessions(): BrowserSession[]; refresh?(): Promise<void> } = store): FastifyInstance {
  const app = Fastify({
    logger: { level: config.logLevel },
    genReqId: () => `req_${randomUUID()}`
  });

  app.register(sensible);
  const authenticator = new ApiKeyAuthenticator(config.apiKeys);
  app.addHook("onRequest", async (request) => {
    if (request.url !== "/v1/health") {
      authenticator.authenticate(request.headers.authorization);
    }
  });

  app.get("/v1/health", async (request) => ({
    status: "ok",
    service: "browser-ai-bridge",
    requestId: request.id,
    timestamp: new Date().toISOString()
  }));

  app.get("/v1/models", async () => ({
    object: "list",
    data: [
      {
        id: "fake-ai",
        object: "model",
        provider: "fake",
        transport: "browser"
      } satisfies ModelDescription,
      {
        id: "gemini-ui",
        object: "model",
        provider: "gemini",
        transport: "browser"
      } satisfies ModelDescription,
      {
        id: "claude-ui",
        object: "model",
        provider: "claude",
        transport: "browser"
      } satisfies ModelDescription
    ]
  }));

  app.get("/v1/sessions", async () => {
    if ("refresh" in sessionSource && typeof sessionSource.refresh === "function") {
      await sessionSource.refresh();
    }
    return { sessions: sessionSource.listSessions() };
  });

  app.get("/v1/requests", async () => ({
    requests: store.listRequests()
  }));

  app.get<{ Params: { requestId: string } }>("/v1/requests/:requestId", async (request) => {
    const record = store.getRequest(request.params.requestId);
    if (record === undefined) {
      throw new AppError("NOT_FOUND", "Request was not found.", 404);
    }
    return record;
  });

  app.post<{ Params: { requestId: string } }>("/v1/requests/:requestId/cancel", async (request) => {
    const record = engine.cancel(request.params.requestId);
    if (record === undefined) {
      throw new AppError("NOT_FOUND", "Request was not found.", 404);
    }
    return record;
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    const parsed = chatCompletionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    if (!parsed.data.stream) {
      return engine.submit(parsed.data, request.id);
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    try {
      const result = await engine.submit(parsed.data, request.id);
      reply.raw.write(`data: ${JSON.stringify({
        id: result.id,
        object: "chat.completion.chunk",
        model: result.model,
        choices: [{ index: 0, delta: { role: "assistant", content: result.choices[0].message.content }, finish_reason: "stop" }]
      })}\n\n`);
      reply.raw.write("data: [DONE]\n\n");
    } catch (error) {
      reply.raw.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Streaming request failed." })}\n\n`);
    } finally {
      reply.raw.end();
    }
    return reply;
  });

  app.post("/v1/code", async (request) => {
    const parsed = codeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid code request.", 400);
    }
    const result = await engine.submit({
      model: parsed.data.model,
      ...(parsed.data.provider === undefined ? {} : { provider: parsed.data.provider }),
      stream: false,
      messages: [{
        role: "user",
        content: `${parsed.data.instruction}\n\nLanguage: ${parsed.data.language}\nTask: ${parsed.data.task}\n\n${parsed.data.code}`
      }]
    }, request.id);
    const normalized = result.normalized ?? normalizeResponse(result.choices[0].message.content);
    const code = normalized.artifacts.find((artifact) => artifact.language === parsed.data.language)
      ?? normalized.artifacts[0];
    return {
      success: true,
      language: parsed.data.language,
      code: code?.content ?? normalized.text,
      explanation: normalized.text,
      raw: normalized.raw
    };
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: error.requestId ?? request.id
        }
      });
    }

    request.log.error({ err: error }, "Unhandled request error");
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: request.id
      }
    });
  });

  return app;
}