// Disposable architecture-spike configuration. Not production code.
export const SPIKE_DB = Deno.env.get("SPIKE_DB") ?? "ansoo_spike";
export const SPIKE_MONGO_URI = Deno.env.get("SPIKE_MONGO_URI") ??
  "mongodb://127.0.0.1:27019/";
export const SPIKE_JWT_SECRET = Deno.env.get("SPIKE_JWT_SECRET") ??
  "spike-only-secret-not-for-production-0123456789";
export const SPIKE_ASSET_ROOT = Deno.env.get("SPIKE_ASSET_ROOT") ??
  "./uploads/spike";
