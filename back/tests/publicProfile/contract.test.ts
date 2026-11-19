// Plan 09 - the public contract cannot carry a score or verdict wording (I12).
import { assertEquals, assertThrows } from "@std/assert";
import {
  assertNoUniversalScore,
  assertNoUniversalVerdictWording,
} from "../../utils/publicProfile/types.ts";

Deno.test("I12: a score, verdict, badge, rating, or boycott field is rejected", () => {
  for (const field of ["score", "verdict", "badge", "rating", "boycott"]) {
    assertThrows(
      () => assertNoUniversalScore({ findings: [{ [field]: "anything" }] }),
      Error,
      "forbidden field",
    );
  }
  assertEquals(
    assertNoUniversalScore({
      noUniversalScore: true,
      findings: [{ scope: "PRODUCT", assessmentOutcome: "SUPPORTED" }],
    }),
    undefined,
  );
});

Deno.test("I12: prose that states a universal verdict is rejected", () => {
  assertThrows(
    () => assertNoUniversalVerdictWording({ publicWording: "This company is unethical." }),
    Error,
  );
  assertThrows(
    () => assertNoUniversalVerdictWording({ publicWording: "You should boycott this brand." }),
    Error,
  );
  assertEquals(
    assertNoUniversalVerdictWording({
      publicWording: "The package declares an origin; evidence is limited.",
    }),
    undefined,
  );
});
