// Shared backend utilities.
//
// Cross-cutting, tested utilities: fail-fast config, UTC date helpers, and the
// single source of v3.1 domain vocabulary. Domain services and guards land in
// plans 03-09.
export * from "./config.ts";
export * from "./domain/mod.ts";
export * as identity from "./identity/mod.ts";
export * as governance from "./governance/mod.ts";
export * as auth from "./auth/mod.ts";
export * as projections from "./projections/mod.ts";
export * as api from "./api/mod.ts";
export * as provenance from "./provenance/mod.ts";
export * as publicProfile from "./publicProfile/mod.ts";
export * from "./time.ts";
