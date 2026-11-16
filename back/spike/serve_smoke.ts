// Disposable HTTP smoke server for the spike evidence pack.
import { ObjectId } from "lesan";
import { createHarness, seedEntity, seedUser } from "./harness.ts";
import { registerSpikeActions } from "./lesan_actions.ts";

const h = await createHarness("ansoo_spike_http");
const userId = await seedUser(h, { roles: ["RESEARCHER"] });
const brandId = await seedEntity(h, "brand", { name: "Public Brand" });
const productId = await seedEntity(h, "product", {
  name: "Public Soap",
  normalizedName: "public soap",
  brand: {
    _id: brandId,
    name: "Public Brand",
    normalizedName: "public brand",
    recordLifecycle: "ACTIVE",
  },
});
const now = new Date();
await h.db.collection("claims").insertOne({
  _id: new ObjectId(),
  about: { type: "product", id: productId },
  claimType: "PRODUCT_ORIGIN",
  statement: "Made in Iran",
  scope: { marketCountryCode: "IR" },
  review: { status: "CLOSED" },
  assessment: { outcome: "SUPPORTED" },
  publication: { status: "PUBLISHED", visibility: "PUBLIC" },
  researchNotes: [{ body: "private research", authorId: userId, createdAt: now, visibility: "INTERNAL" }],
  recordedAt: now,
  recordLifecycle: "ACTIVE",
  schemaVersion: 1,
  version: 1,
  createdAt: now,
  updatedAt: now,
});
registerSpikeActions(h.core, h.db);
await h.core.runServer({
  port: 18999,
  playground: true,
  typeGeneration: true,
  cors: "*",
});
console.log("SPIKE_SERVER_READY");
