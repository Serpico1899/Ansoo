// Test helper: superstruct is(value, struct); keep tests readable with the
// struct first while exercising the real validator.
import { is } from "lesan";

export function accepts(struct: unknown, value: unknown): boolean {
  return is(value, struct as never);
}
