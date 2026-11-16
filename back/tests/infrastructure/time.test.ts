// UTC Date behavior. The MongoDB round-trip is opt-in so the default unit
// suite does not require a running database.
//
// Run the integration case with:
//   RUN_MONGO_TESTS=1 deno test --allow-all tests/infrastructure/time.test.ts

import { assert, assertEquals, assertThrows } from "@std/assert";
import { MongoClient } from "lesan";
import { assertUtcDate, isUtcDate, optionalDate, utcIso } from "../../utils/time.ts";

const INSTANT = new Date("2020-01-02T03:04:05.678Z");

Deno.test("UTC Date round-trips through ISO without losing precision", () => {
  const parsed = new Date(INSTANT.toISOString());
  assertEquals(parsed.getTime(), INSTANT.getTime());
  assert(parsed.toISOString().endsWith("Z"));
  assertEquals(utcIso(INSTANT), "2020-01-02T03:04:05.678Z");
});

Deno.test("unknown dates stay null and invalid dates are rejected", () => {
  assertEquals(optionalDate(null), null);
  assertEquals(optionalDate(undefined), null);
  assertEquals(utcIso(null), null);
  assertEquals(utcIso(undefined), null);
  assertEquals(optionalDate(INSTANT), INSTANT);
  assert(isUtcDate(INSTANT));
  assert(!isUtcDate(new Date("not-a-date")));
  assertThrows(() => assertUtcDate("2020-01-01", "validFrom"), TypeError, "valid UTC Date");
});

Deno.test({
  name: "UTC Date and null round-trip through a MongoDB replica set",
  ignore: Deno.env.get("RUN_MONGO_TESTS") !== "1",
  async fn() {
    const url = Deno.env.get("MONGO_URL") ?? "mongodb://127.0.0.1:27019/?replicaSet=rs0";
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(`ansoo_time_test_${crypto.randomUUID().replaceAll("-", "")}`);
    try {
      const collection = db.collection("date_probe");
      await collection.insertOne({
        probe: "date_probe",
        when: INSTANT,
        endedAt: null,
        missing: null,
      });
      const doc = await collection.findOne({ probe: "date_probe" });
      assert(doc !== null);
      assert(doc.when instanceof Date);
      assertEquals((doc.when as Date).toISOString(), INSTANT.toISOString());
      assertEquals(doc.endedAt, null);
      assertEquals(doc.missing, null);
    } finally {
      await db.dropDatabase();
      await client.close();
    }
  },
});
