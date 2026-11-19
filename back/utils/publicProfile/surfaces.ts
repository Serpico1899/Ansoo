// Public surface purge for retraction. Spec 12, S24.
//
// A retraction is not complete while any public surface can still serve the
// finding. This module models the cache/CDN/search-index boundary so the
// synchronous path can be measured per surface without pretending the real
// infrastructure exists yet.
import type { ObjectId } from "lesan";

export type SurfacePurgeInput = {
  findingId: ObjectId;
  productIds: readonly ObjectId[];
  reason: string;
  now: Date;
};

export type PublicSurface = {
  name: string;
  purge: (input: SurfacePurgeInput) => Promise<void> | void;
};

export type SurfaceTiming = {
  surface: string;
  productIds: string[];
  findingId: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
};

export type SurfaceCacheEntry = {
  productId: string;
  findingIds: string[];
  payload: unknown;
};

const surfaces: PublicSurface[] = [];

export function registerPublicSurface(surface: PublicSurface): () => void {
  surfaces.push(surface);
  return () => {
    const index = surfaces.indexOf(surface);
    if (index >= 0) surfaces.splice(index, 1);
  };
}

export function listPublicSurfaces(): readonly PublicSurface[] {
  return [...surfaces];
}

export async function purgePublicSurfaces(
  input: SurfacePurgeInput,
): Promise<SurfaceTiming[]> {
  const timings: SurfaceTiming[] = [];
  for (const surface of [...surfaces]) {
    const startedAt = new Date();
    await surface.purge(input);
    const completedAt = new Date();
    timings.push({
      surface: surface.name,
      productIds: input.productIds.map((id) => id.toString()),
      findingId: input.findingId.toString(),
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    });
  }
  return timings;
}

export function createInMemoryPublicSurface(name: string): {
  surface: PublicSurface;
  cache: Map<string, SurfaceCacheEntry>;
  searchIndex: Map<string, string[]>;
  seed: (entry: SurfaceCacheEntry) => void;
} {
  const cache = new Map<string, SurfaceCacheEntry>();
  const searchIndex = new Map<string, string[]>();
  const surface: PublicSurface = {
    name,
    purge(input) {
      const findingId = input.findingId.toString();
      for (const [key, entry] of cache) {
        if (entry.findingIds.includes(findingId)) cache.delete(key);
      }
      for (const productId of input.productIds) {
        cache.delete(productId.toString());
      }
      for (const [productId, current] of searchIndex) {
        searchIndex.set(productId, current.filter((id) => id !== findingId));
      }
    },
  };
  return {
    surface,
    cache,
    searchIndex,
    seed(entry) {
      cache.set(entry.productId, entry);
      searchIndex.set(entry.productId, [...entry.findingIds]);
    },
  };
}

export function resetPublicSurfaces(): void {
  surfaces.splice(0, surfaces.length);
}
