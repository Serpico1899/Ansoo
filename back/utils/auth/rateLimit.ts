// Small in-process rate limiter for login and other sensitive actions.
//
// Production can replace this with a shared store; the dispatcher contract is a
// single `check` that throws a stable 429 error.

export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
  scope: "IP" | "USER";
};

type Entry = { count: number; resetAt: number };

export class RateLimitExceeded extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("too many requests");
    this.name = "RateLimitExceeded";
  }
}

export class InMemoryRateLimiter {
  readonly #entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(key: string, policy: RateLimitPolicy): void {
    const now = this.now();
    const entry = this.#entries.get(key);
    if (entry === undefined || entry.resetAt <= now) {
      this.#entries.set(key, {
        count: 1,
        resetAt: now + policy.windowSeconds * 1000,
      });
      return;
    }
    if (entry.count >= policy.limit) {
      throw new RateLimitExceeded(Math.max(1, Math.ceil((entry.resetAt - now) / 1000)));
    }
    entry.count += 1;
  }

  reset(): void {
    this.#entries.clear();
  }
}
