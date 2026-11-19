// Plan 08 - one stable error envelope. Never echo values, stacks, paths, or model names.
import { AuthError } from "../auth/capabilities.ts";
import { RateLimitExceeded } from "../auth/rateLimit.ts";
import { GovernanceError, RateLimitError } from "../governance/common.ts";
import { ProjectionError } from "../projections/views.ts";

export const API_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_TRANSITION",
  "USE_RELATIONSHIP_INSTEAD",
  "VALIDATION_ERROR",
  "CAP_EXCEEDED",
  "RATE_LIMITED",
  "INTERNAL",
  "AUTH_LOGIN_DISABLED",
] as const;

export type ApiErrorCode = typeof API_ERROR_CODES[number];

export type ApiFailureBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    fields?: Record<string, string>;
    retryAfterSeconds?: number;
  };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function safeCode(value: string, status: number): ApiErrorCode {
  if ((API_ERROR_CODES as readonly string[]).includes(value)) return value as ApiErrorCode;
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL";
  return "VALIDATION_ERROR";
}

const SAFE_MESSAGE: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: "authentication required",
  FORBIDDEN: "access denied",
  NOT_FOUND: "not found",
  CONFLICT: "conflict",
  INVALID_TRANSITION: "invalid transition",
  USE_RELATIONSHIP_INSTEAD: "use the relationship action instead",
  VALIDATION_ERROR: "validation failed",
  CAP_EXCEEDED: "cap exceeded",
  RATE_LIMITED: "too many requests",
  INTERNAL: "internal error",
  AUTH_LOGIN_DISABLED: "login is not configured",
};

function structPath(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  if ((error as { name?: string }).name !== "StructError") return undefined;
  const path = (error as { path?: unknown }).path;
  if (!Array.isArray(path) || path.length === 0) return "input";
  const parts = path.map((part) => String(part));
  if (parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))) {
    return "input";
  }
  return parts.join(".");
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof RateLimitExceeded) {
    return new ApiError(
      429,
      "RATE_LIMITED",
      SAFE_MESSAGE.RATE_LIMITED,
      undefined,
      error.retryAfterSeconds,
    );
  }
  if (error instanceof RateLimitError) {
    return new ApiError(
      429,
      "RATE_LIMITED",
      SAFE_MESSAGE.RATE_LIMITED,
      undefined,
      error.retryAfterSeconds,
    );
  }
  if (error instanceof AuthError) {
    return new ApiError(error.status, error.code, SAFE_MESSAGE[error.code]);
  }
  if (error instanceof GovernanceError) {
    const code = safeCode(error.code, error.status);
    const status = code === "INTERNAL" ? 500 : error.status;
    const fields: Record<string, string> = {};
    const details = error.details ?? {};
    if (typeof details.path === "string") fields.path = details.path;
    if (typeof details.cap === "number") fields.cap = String(details.cap);
    if (typeof details.actual === "number") fields.actual = String(details.actual);
    return new ApiError(
      status,
      code,
      SAFE_MESSAGE[code],
      Object.keys(fields).length === 0 ? undefined : fields,
    );
  }
  if (error instanceof ProjectionError) {
    return new ApiError(404, "NOT_FOUND", SAFE_MESSAGE.NOT_FOUND);
  }
  const path = structPath(error);
  if (path !== undefined) {
    return new ApiError(422, "VALIDATION_ERROR", SAFE_MESSAGE.VALIDATION_ERROR, { path });
  }
  if (error instanceof SyntaxError) {
    return new ApiError(422, "VALIDATION_ERROR", SAFE_MESSAGE.VALIDATION_ERROR);
  }
  return new ApiError(500, "INTERNAL", SAFE_MESSAGE.INTERNAL);
}

export function failureBody(apiError: ApiError, requestId: string): ApiFailureBody {
  return {
    error: {
      code: apiError.code,
      message: apiError.message,
      requestId,
      ...(apiError.fields === undefined ? {} : { fields: apiError.fields }),
      ...(apiError.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: apiError.retryAfterSeconds }),
    },
  };
}
