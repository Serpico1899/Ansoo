// Plan 08 - stable error envelope never leaks internals.
import { assert, assertEquals } from "@std/assert";
import { create, object, string } from "lesan";
import { ApiError, failureBody, toApiError } from "../../utils/api/mod.ts";
import { GovernanceError, RateLimitError } from "../../utils/governance/common.ts";

Deno.test("errors: codes, statuses, and messages are stable and sanitized", () => {
  const conflict = toApiError(new GovernanceError("INVALID_TRANSITION", "internal detail", 409));
  assertEquals(conflict.status, 409);
  assertEquals(conflict.code, "INVALID_TRANSITION");
  assertEquals(conflict.message, "invalid transition");

  const cap = toApiError(
    new GovernanceError(
      "CAP_EXCEEDED",
      "identifiers has 6 items",
      422,
      { path: "identifiers", cap: 5, actual: 6 },
    ),
  );
  assertEquals(cap.status, 422);
  assertEquals(cap.code, "CAP_EXCEEDED");
  assertEquals(cap.fields, { path: "identifiers", cap: "5", actual: "6" });

  const rate = toApiError(new RateLimitError("quota", "uploads", 5, 6, 60));
  assertEquals(rate.status, 429);
  assertEquals(rate.code, "RATE_LIMITED");
  assertEquals(rate.retryAfterSeconds, 60);

  const internal = toApiError(new Error("/srv/app/models/claim.ts stack trace"));
  assertEquals(internal.status, 500);
  assertEquals(internal.code, "INTERNAL");
  assertEquals(internal.message, "internal error");

  let validation: unknown = null;
  try {
    create(
      { name: 1, secretValue: "should-not-leak", $where: "operator" },
      object({ name: string() }),
    );
  } catch (error) {
    validation = error;
  }
  assert(validation !== null, "expected a validation error");
  const mappedValidation = toApiError(validation);
  assertEquals(mappedValidation.status, 422);
  assertEquals(mappedValidation.code, "VALIDATION_ERROR");
  assert(!JSON.stringify(failureBody(mappedValidation, "req_2")).includes("should-not-leak"));
  assert(!JSON.stringify(failureBody(mappedValidation, "req_2")).includes("$where"));

  const body = failureBody(new ApiError(404, "NOT_FOUND", "not found"), "req_1");
  assertEquals(body.error.code, "NOT_FOUND");
  assertEquals(body.error.requestId, "req_1");
  assert(!JSON.stringify(body).includes("stack"));
});
