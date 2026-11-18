// Least-privilege MongoDB role for the application's audit access.
//
// MongoDB cannot make a collection insert-only with a validator; role
// privileges are the enforceable boundary. The application role may append and
// read audit_events, and may never update or remove them. Provision the role
// with scripts/audit-db-privileges.ts against an authenticated deployment.

export type AuditPrivilege = {
  resource: { db: string; collection: "audit_events" };
  actions: readonly ("find" | "insert")[];
};

export const AUDIT_APP_PRIVILEGES: readonly AuditPrivilege[] = [
  {
    resource: { db: "", collection: "audit_events" },
    actions: ["find", "insert"],
  },
];

export type AuditRoleSpec = {
  role: "ansooApp";
  privileges: AuditPrivilege[];
  roles: [];
};

export function auditRoleSpec(dbName: string): AuditRoleSpec {
  if (!dbName) throw new Error("dbName is required");
  return {
    role: "ansooApp",
    privileges: AUDIT_APP_PRIVILEGES.map((privilege) => ({
      resource: { ...privilege.resource, db: dbName },
      actions: [...privilege.actions],
    })),
    roles: [],
  };
}
