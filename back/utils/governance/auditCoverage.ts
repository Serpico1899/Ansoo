// Closed audit-action coverage map. Plan 07 / spec 9.3.
//
// This is intentionally exhaustive: adding an action to AUDIT_ACTIONS without
// naming its owning service and its audit test fails the governance suite.
import type { AuditAction } from "../domain/constants.ts";

export type AuditActionCoverage = {
  plan: 3 | 4 | 5 | 6 | 7 | 8 | 9;
  service: string;
  test: string;
};

export const AUDIT_ACTION_COVERAGE: Record<AuditAction, AuditActionCoverage> = {
  ENTITY_CREATED: {
    plan: 4,
    service: "utils/identity/entities.ts",
    test: "tests/identity/entities.integration.test.ts",
  },
  ENTITY_UPDATED: {
    plan: 4,
    service: "utils/identity/entities.ts",
    test: "tests/identity/entities.integration.test.ts",
  },
  ENTITY_ARCHIVED: {
    plan: 4,
    service: "utils/governance/audit.ts (reserved closed action)",
    test: "tests/governance/audit.test.ts",
  },
  ENTITY_MERGED: {
    plan: 4,
    service: "utils/identity/merge.ts",
    test: "tests/identity/merge.integration.test.ts",
  },
  ENTITY_UNMERGED: {
    plan: 4,
    service: "utils/identity/merge.ts",
    test: "tests/identity/merge.integration.test.ts",
  },
  IDENTIFIER_ADDED: {
    plan: 4,
    service: "utils/identity/verifyIdentifier.ts",
    test: "tests/identity/verifyIdentifier.integration.test.ts",
  },
  IDENTIFIER_STATUS_CHANGED: {
    plan: 4,
    service: "utils/identity/verifyIdentifier.ts",
    test: "tests/identity/verifyIdentifier.integration.test.ts",
  },
  BRAND_MAPPING_REVIEWED: {
    plan: 4,
    service: "utils/identity/brandMapping.ts",
    test: "tests/identity/brandMapping.integration.test.ts",
  },
  BRAND_RELATION_CHANGED: {
    plan: 4,
    service: "utils/identity/brandMapping.ts (Lesan relation update)",
    test: "tests/identity/brandMapping.integration.test.ts",
  },
  RELATIONSHIP_CREATED: {
    plan: 5,
    service: "utils/research/relationship.ts",
    test: "tests/research/relationship.integration.test.ts",
  },
  RELATIONSHIP_CLOSED: {
    plan: 5,
    service: "utils/research/relationship.ts",
    test: "tests/research/relationship.integration.test.ts",
  },
  CLAIM_CREATED: {
    plan: 5,
    service: "utils/research/claim.ts",
    test: "tests/research/claim.integration.test.ts",
  },
  REVIEW_STATUS_CHANGED: {
    plan: 5,
    service: "utils/research/status.ts",
    test: "tests/research/status.integration.test.ts",
  },
  ASSESSMENT_RECORDED: {
    plan: 5,
    service: "utils/research/assessment.ts",
    test: "tests/research/assessment.integration.test.ts",
  },
  PUBLICATION_GATE_EVALUATED: {
    plan: 5,
    service: "utils/research/gate.ts",
    test: "tests/research/gate.integration.test.ts",
  },
  PUBLICATION_CHANGED: {
    plan: 5,
    service: "utils/research/status.ts",
    test: "tests/research/status.integration.test.ts",
  },
  PUBLIC_WORDING_CHANGED: {
    plan: 5,
    service: "utils/research/claim.ts and relationship.ts",
    test: "tests/research/claim.integration.test.ts",
  },
  FINDING_RETRACTED: {
    plan: 5,
    service: "utils/research/status.ts",
    test: "tests/research/retraction.integration.test.ts",
  },
  GATE_WAIVER_GRANTED: {
    plan: 5,
    service: "utils/research/gate.ts",
    test: "tests/research/gate.integration.test.ts",
  },
  EVIDENCE_ADDED: {
    plan: 6,
    service: "utils/provenance/evidence.ts",
    test: "tests/provenance/evidence.integration.test.ts",
  },
  EVIDENCE_REMOVED: {
    plan: 6,
    service: "utils/provenance/evidence.ts",
    test: "tests/provenance/evidence.integration.test.ts",
  },
  EVIDENCE_REVIEWED: {
    plan: 6,
    service: "utils/provenance/evidence.ts",
    test: "tests/provenance/evidence.integration.test.ts",
  },
  SOURCE_CREATED: {
    plan: 6,
    service: "utils/provenance/source.ts",
    test: "tests/provenance/capture.integration.test.ts",
  },
  SNAPSHOT_CREATED: {
    plan: 6,
    service: "utils/provenance/snapshot.ts",
    test: "tests/provenance/capture.integration.test.ts",
  },
  SNAPSHOT_SUPERSEDED: {
    plan: 6,
    service: "utils/provenance/snapshot.ts",
    test: "tests/provenance/capture.integration.test.ts",
  },
  SNAPSHOT_REDACTED: {
    plan: 6,
    service: "utils/provenance/snapshot.ts",
    test: "tests/provenance/capture.integration.test.ts",
  },
  SOLICITATION_SENT: {
    plan: 5,
    service: "utils/research/response.ts",
    test: "tests/research/response.integration.test.ts",
  },
  SOLICITATION_OUTCOME_RECORDED: {
    plan: 5,
    service: "utils/research/response.ts",
    test: "tests/research/response.integration.test.ts",
  },
  ORG_RESPONSE_ADDED: {
    plan: 5,
    service: "utils/research/response.ts",
    test: "tests/research/response.integration.test.ts",
  },
  ORG_RESPONSE_PUBLICATION_CHANGED: {
    plan: 5,
    service: "utils/research/response.ts",
    test: "tests/research/response.integration.test.ts",
  },
  ASSET_UPLOADED: {
    plan: 6,
    service: "utils/provenance/asset.ts",
    test: "tests/provenance/capture.integration.test.ts",
  },
  ASSET_SCAN_COMPLETED: {
    plan: 6,
    service: "utils/provenance/asset.ts",
    test: "tests/provenance/capture.integration.test.ts",
  },
  ASSET_PURGED: {
    plan: 7,
    service: "utils/provenance/asset.ts and utils/governance/retention.ts",
    test: "tests/governance/retention.integration.test.ts",
  },
  CORRECTION_SUBMITTED: {
    plan: 7,
    service: "utils/governance/correction.ts",
    test: "tests/governance/corrections.integration.test.ts",
  },
  CORRECTION_REVIEWED: {
    plan: 7,
    service: "utils/governance/correction.ts",
    test: "tests/governance/corrections.integration.test.ts",
  },
  CORRECTION_APPLIED: {
    plan: 7,
    service: "utils/governance/correction.ts",
    test: "tests/governance/corrections.integration.test.ts",
  },
  USER_ROLES_CHANGED: {
    plan: 7,
    service: "utils/governance/user.ts",
    test: "tests/governance/users.integration.test.ts",
  },
  USER_TRUST_CHANGED: {
    plan: 7,
    service: "utils/governance/user.ts",
    test: "tests/governance/users.integration.test.ts",
  },
  USER_STATUS_CHANGED: {
    plan: 7,
    service: "utils/governance/user.ts",
    test: "tests/governance/users.integration.test.ts",
  },
  USER_PII_PURGED: {
    plan: 7,
    service: "utils/governance/user.ts",
    test: "tests/governance/users.integration.test.ts",
  },
};
