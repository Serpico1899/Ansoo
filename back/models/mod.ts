// Lesan model registry.
//
// One file per canonical collection. Scaffold only.
// Plan 03 registers the eleven v3.1 collections. Exactly two fixed-schema Lesan
// relations are allowed: Product.brand -> Brand and SourceSnapshot.source -> Source.
import { lesan } from "lesan";

export type LesanCore = ReturnType<typeof lesan>;

export function registerModels(_core: LesanCore): void {
  // Plan 03 registers the eleven canonical model factories here.
}
