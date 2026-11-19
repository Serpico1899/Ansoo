// Runtime dependencies shared by action registration.
import type { Db } from "lesan";
import type { AppConfig } from "../utils/config.ts";

export type ActionDeps = {
  db: Db;
  config: AppConfig;
  now?: () => Date;
};
