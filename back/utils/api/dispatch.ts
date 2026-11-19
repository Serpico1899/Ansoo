// Plan 08 - HTTP dispatcher with pre-act authorization and a stable envelope.
//
// Validation runs on `details` only. Projection arguments are never read here;
// actions receive the server-derived actor and must use the projection builders.
import { create } from "lesan";
import { authenticateRequest, requireCapability } from "../auth/mod.ts";
import { InMemoryRateLimiter, type RateLimitPolicy } from "../auth/rateLimit.ts";
import { ApiError, failureBody, toApiError } from "./errors.ts";
import { getActionDefinition, registerActionDefinition } from "./registry.ts";
import type { ActionContext, ActionDefinition, ApiOptions } from "./types.ts";

const MAX_BODY_BYTES = 1_000_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const TOP_LEVEL_KEYS = new Set(["service", "model", "act", "details"]);

export type Api = {
  handle: (request: Request, remoteIp?: string) => Promise<Response>;
  register: (definition: ActionDefinition) => void;
  serve: (options: {
    port: number;
    cors?: "*" | readonly string[];
  }) => Promise<void>;
};

function requestIdOf(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  if (supplied !== null && REQUEST_ID_PATTERN.test(supplied)) return supplied;
  return crypto.randomUUID();
}

function correlationIdOf(request: Request): string | undefined {
  const supplied = request.headers.get("x-correlation-id");
  if (supplied === null || !REQUEST_ID_PATTERN.test(supplied)) return undefined;
  return supplied;
}

function jsonResponse(
  status: number,
  body: unknown,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
  }
  return value as Record<string, unknown>;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (request.body !== null) {
    for await (const chunk of request.body) {
      total += chunk.byteLength;
      if (total > MAX_BODY_BYTES) {
        throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
      }
      chunks.push(chunk);
    }
  }
  const raw = new TextDecoder().decode(
    chunks.length === 0 ? new Uint8Array() : concatBytes(chunks, total),
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
  }
  const body = bodyObject(parsed);
  for (const key of Object.keys(body)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
    }
  }
  return body;
}

function actionName(body: Record<string, unknown>, key: "model" | "act"): string {
  const value = body[key];
  if (typeof value !== "string" || !NAME_PATTERN.test(value)) {
    throw new ApiError(404, "NOT_FOUND", "not found");
  }
  return value;
}

function rateLimitKey(
  definition: ActionDefinition,
  context: ActionContext,
  policy: RateLimitPolicy,
): string {
  const scope = policy.scope === "USER" ? (context.auth?.id ?? context.ip) : context.ip;
  return `${definition.schema}.${definition.actName}:${scope}`;
}

export function createApi(options: ApiOptions): Api {
  const now = options.now ?? (() => new Date());
  const limiter = new InMemoryRateLimiter(() => now().getTime());

  const handle = async (request: Request, remoteIp = "direct"): Promise<Response> => {
    const requestId = requestIdOf(request);
    const correlationId = correlationIdOf(request);
    try {
      if (request.method !== "POST") {
        throw new ApiError(405, "NOT_FOUND", "not found");
      }

      const body = await readBody(request);
      const service = body.service ?? "main";
      if (service !== "main") {
        throw new ApiError(404, "NOT_FOUND", "not found");
      }
      const model = actionName(body, "model");
      const act = actionName(body, "act");
      const details = bodyObject(body.details);

      const definition = getActionDefinition(`${model}.${act}`);
      if (definition === undefined) {
        throw new ApiError(404, "NOT_FOUND", "not found");
      }

      const auth = await authenticateRequest({
        db: options.db,
        headers: request.headers,
        config: options.config,
      });

      if (definition.access.kind === "AUTHENTICATED" && auth === null) {
        throw new ApiError(401, "UNAUTHENTICATED", "authentication required");
      }
      if (definition.access.kind === "CAPABILITY") {
        requireCapability(auth, definition.access.capability);
      }

      const context: ActionContext = {
        auth,
        requestId,
        ...(correlationId === undefined ? {} : { correlationId }),
        ip: remoteIp,
        now: now(),
        db: options.db,
        config: options.config,
      };

      if (definition.rateLimit !== undefined) {
        limiter.check(
          rateLimitKey(definition, context, definition.rateLimit),
          definition.rateLimit,
        );
      }

      const validated = create(details, definition.validator);
      const result = await definition.fn(
        {
          service: "main",
          model,
          act,
          details: validated as Record<string, unknown>,
        },
        context,
      );

      return jsonResponse(200, { success: true, body: result ?? null, requestId }, requestId);
    } catch (error) {
      const apiError = toApiError(error);
      const response = jsonResponse(
        apiError.status,
        { success: false, body: failureBody(apiError, requestId) },
        requestId,
      );
      const headers = new Headers(response.headers);
      if (apiError.retryAfterSeconds !== undefined) {
        headers.set("retry-after", String(apiError.retryAfterSeconds));
      }
      return new Response(response.body, { status: response.status, headers });
    }
  };

  const serve = ({ port, cors }: {
    port: number;
    cors?: "*" | readonly string[];
  }): Promise<void> => {
    const corsHeaders = (request: Request): Record<string, string> => {
      const origin = request.headers.get("origin");
      if (origin === null || cors === undefined) return {};
      if (cors === "*" || cors.includes(origin)) {
        return {
          "access-control-allow-origin": cors === "*" ? "*" : origin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type, token, x-request-id, x-correlation-id",
          "access-control-max-age": "600",
          vary: "origin",
        };
      }
      return {};
    };

    const server = Deno.serve({ port }, async (request, info) => {
      const corsValues = corsHeaders(request);
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsValues });
      }
      if (request.method === "GET" && new URL(request.url).pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "content-type": "application/json", ...corsValues },
        });
      }
      const response = await handle(request, info.remoteAddr.hostname);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsValues)) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    });
    return server.finished;
  };

  return {
    handle,
    register: (definition) => registerActionDefinition(options.core, definition),
    serve,
  };
}
