import { ObjectId } from "lesan";
import { ApiError } from "../../../utils/api/mod.ts";
import type { ActionBody, ActionContext } from "../../../utils/api/types.ts";
import { normalizeProductIdentifier } from "../../../utils/identity/mod.ts";
import type { PublicProductProfile } from "../../../utils/publicProfile/types.ts";
import { getFreshProfile, resolveProfileLookup } from "../../../utils/publicProfile/readModel.ts";
import {
  assertNoUniversalScore,
  assertNoUniversalVerdictWording,
  PUBLIC_UNKNOWN_CODES,
  type PublicUnknown,
} from "../../../utils/publicProfile/types.ts";
import { assemblePublicProfile as _assemblePublicProfile } from "../../../utils/publicProfile/assemble.ts";

function objectId(value: unknown): ObjectId {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
  }
  return new ObjectId(value);
}

function redirectedUnknown(from: ObjectId, to: ObjectId): PublicUnknown {
  return {
    code: PUBLIC_UNKNOWN_CODES.MERGED_IDENTITY_REDIRECT,
    message: `Product ${from.toString()} was merged; this profile redirects to ${to.toString()}.`,
  };
}

function withRuntimeUnknowns(
  profile: PublicProductProfile,
  unknowns: readonly PublicUnknown[],
): PublicProductProfile {
  const existing = new Set(profile.unknowns.map((item) => `${item.code}:${item.message}`));
  return {
    ...profile,
    unknowns: [
      ...profile.unknowns,
      ...unknowns.filter((item) => !existing.has(`${item.code}:${item.message}`)),
    ],
  };
}

export async function getPublicProfile(
  body: ActionBody & { details: Record<string, unknown> },
  context: ActionContext,
): Promise<unknown> {
  const set = body.details.set as {
    id?: string;
    gtin?: string;
    scheme?: string;
    value?: string;
    jurisdiction?: string;
    issuer?: string;
  };
  let requestedId: ObjectId | undefined;
  let redirect: { from: ObjectId; to: ObjectId } | undefined;

  if (set.id !== undefined) {
    requestedId = objectId(set.id);
    const original = await context.db.collection("products").findOne({ _id: requestedId });
    if (original?.lifecycle === "MERGED" && original.mergedIntoId instanceof ObjectId) {
      redirect = { from: requestedId, to: original.mergedIntoId };
    }
  }

  let resolution;
  try {
    resolution = await resolveProfileLookup({
      db: context.db,
      ...(set.id === undefined ? {} : { id: set.id }),
      ...(set.gtin === undefined ? {} : { gtin: set.gtin }),
      ...(set.scheme === undefined ? {} : { scheme: set.scheme }),
      ...(set.value === undefined ? {} : { value: set.value }),
      ...(set.jurisdiction === undefined ? {} : { jurisdiction: set.jurisdiction }),
      ...(set.issuer === undefined ? {} : { issuer: set.issuer }),
    });
  } catch {
    throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
  }
  if (set.gtin !== undefined) {
    try {
      normalizeProductIdentifier("GTIN", set.gtin);
    } catch {
      throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
    }
  }
  if (set.scheme !== undefined && set.value !== undefined) {
    try {
      normalizeProductIdentifier(set.scheme, set.value);
    } catch {
      throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
    }
  }

  const runtimeUnknowns: PublicUnknown[] = [];
  if (redirect !== undefined && "productId" in resolution) {
    runtimeUnknowns.push(redirectedUnknown(redirect.from, redirect.to));
  }

  if (
    (resolution.state === "FOUND" || resolution.state === "DISPUTED" ||
      resolution.state === "UNVERIFIED") &&
    runtimeUnknowns.length === 0
  ) {
    try {
      const { record } = await getFreshProfile({
        db: context.db,
        productId: resolution.productId,
        now: context.now,
      });
      const profile = {
        ...record.payload,
        resolution,
      } satisfies PublicProductProfile;
      assertNoUniversalScore(profile);
      assertNoUniversalVerdictWording(profile);
      return profile;
    } catch {
      // Fall through to an honest on-demand assembly; a read-model failure must
      // not turn into NOT_FOUND or a fabricated profile.
    }
  }

  const assembled = await _assemblePublicProfile({
    db: context.db,
    resolution,
    now: context.now,
  });
  const profile = withRuntimeUnknowns(assembled.profile, runtimeUnknowns);
  assertNoUniversalScore(profile);
  assertNoUniversalVerdictWording(profile);
  return profile;
}
