// Session and provider-assertion JWTs. The token header never carries `Bearer`.
import { create, getNumericDate, type Payload, verify } from "djwt";
import type { AppConfig } from "../config.ts";

const encoder = new TextEncoder();
const USER_ID_PATTERN = /^[a-f0-9]{24}$/i;
const MAX_TOKEN_LENGTH = 8_192;

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtError";
  }
}

async function importKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function assertTokenInput(token: string): void {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new JwtError("invalid token");
  }
}

export function isUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
}

export async function createSessionToken(
  userId: string,
  config: AppConfig,
  options: { expiresInSeconds?: number; claims?: Record<string, unknown> } = {},
): Promise<string> {
  if (!isUserId(userId)) throw new JwtError("invalid user id");
  const payload: Payload = {
    ...(options.claims ?? {}),
    sub: userId,
    iat: getNumericDate(0),
    exp: getNumericDate(options.expiresInSeconds ?? config.jwtExpiresInSeconds),
    ...(config.jwtIssuer === undefined ? {} : { iss: config.jwtIssuer }),
    ...(config.jwtAudience === undefined ? {} : { aud: config.jwtAudience }),
  };
  return await create({ alg: "HS256", typ: "JWT" }, payload, await importKey(config.jwtSecret));
}

export async function verifySessionToken(
  token: string,
  config: AppConfig,
): Promise<{ userId: string; payload: Payload }> {
  assertTokenInput(token);
  let payload: Payload;
  try {
    payload = await verify(token, await importKey(config.jwtSecret), {
      audience: config.jwtAudience,
    });
  } catch {
    throw new JwtError("invalid or expired token");
  }
  if (config.jwtIssuer !== undefined && payload.iss !== config.jwtIssuer) {
    throw new JwtError("unexpected token issuer");
  }
  if (config.jwtAudience !== undefined) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(config.jwtAudience)) {
      throw new JwtError("unexpected token audience");
    }
  }
  if (!isUserId(payload.sub)) throw new JwtError("token subject is not a user id");
  return { userId: payload.sub, payload };
}

export async function createAssertionToken(
  claims: { sub: string; provider: string } & Record<string, unknown>,
  config: AppConfig,
  options: { expiresInSeconds?: number } = {},
): Promise<string> {
  const secret = config.authAssertion.secret;
  if (secret === undefined) throw new JwtError("assertion provider is not configured");
  const payload: Payload = {
    ...claims,
    iat: getNumericDate(0),
    exp: getNumericDate(options.expiresInSeconds ?? 300),
    ...(config.authAssertion.issuer === undefined ? {} : { iss: config.authAssertion.issuer }),
    ...(config.authAssertion.audience === undefined ? {} : { aud: config.authAssertion.audience }),
  };
  return await create({ alg: "HS256", typ: "JWT" }, payload, await importKey(secret));
}

export async function verifyAssertionToken(
  token: string,
  config: AppConfig,
): Promise<{ subject: string; provider: string }> {
  const secret = config.authAssertion.secret;
  if (secret === undefined) throw new JwtError("assertion provider is not configured");
  assertTokenInput(token);
  let payload: Payload;
  try {
    payload = await verify(token, await importKey(secret), {
      audience: config.authAssertion.audience,
    });
  } catch {
    throw new JwtError("invalid or expired provider assertion");
  }
  if (
    config.authAssertion.issuer !== undefined &&
    payload.iss !== config.authAssertion.issuer
  ) {
    throw new JwtError("unexpected assertion issuer");
  }
  if (config.authAssertion.audience !== undefined) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(config.authAssertion.audience)) {
      throw new JwtError("unexpected assertion audience");
    }
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new JwtError("assertion subject is missing");
  }
  if (typeof payload.provider !== "string" || payload.provider.length === 0) {
    throw new JwtError("assertion provider is missing");
  }
  return { subject: payload.sub, provider: payload.provider };
}
