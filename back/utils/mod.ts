// Shared backend utilities.
//
// Cross-cutting, tested utilities: fail-fast config, UTC date helpers, and the
// single source of v3.1 domain vocabulary. Domain services and guards land in
// plans 03-09.
export * from "./config.ts";
export * from "./domain/mod.ts";
export * from "./time.ts";
