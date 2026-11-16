// Ansoo backend entry point.
//
// Scaffold only. No HTTP server is implemented yet.
// Plans 03-08 add Lesan initialization, model/action registration, and routing.
// Until then, startup validates configuration and exits loudly instead of
// pretending the service is running.

import { loadConfig } from "./utils/config.ts";

const config = loadConfig();
console.error(
  `Ansoo backend scaffold: configuration is valid (env=${config.env}), ` +
    "but the HTTP server is not implemented yet (plans 03-08).",
);
Deno.exit(1);
