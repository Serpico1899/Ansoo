// UTC date helpers.
//
// v3.1 spec 4.2: all dates are UTC BSON `Date`; unknown dates stay `null`.
// A missing end date is not proof that a fact is current today.

export function isUtcDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function assertUtcDate(value: unknown, field: string): Date {
  if (!isUtcDate(value)) {
    throw new TypeError(`${field} must be a valid UTC Date`);
  }
  return value;
}

export function optionalDate(value: Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return assertUtcDate(value, "date");
}

export function utcIso(value: Date | null | undefined): string | null {
  const date = optionalDate(value);
  return date === null ? null : date.toISOString();
}
