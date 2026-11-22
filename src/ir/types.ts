/**
 * IR types for the Locus fact graph.
 */

import type { Grade, Fact } from "./grade.ts";

export type Combinator = "all" | "any";

export interface Signatures {
  combinator: Combinator | null; // null for single site
  sites: string[];
}

export interface Residence {
  tissues: string[];
  exhaustive: boolean; // true when `only` is present
  grade: Grade;
}

export interface Target {
  name: string;
  organism: string;
  tolerance: number;
  signatures: Signatures;
  residence: Residence | null;
}

export type IntentKind = "excise";

export interface Intent {
  kind: IntentKind;
  target: string;
}

export type AssertionStatus = "allowed" | "refused";

export interface Assertion {
  name: string;
  supported_by: string[];
  floor: Grade;
  status: AssertionStatus;
  reasons: string[];
}

export interface OutcomeDistribution {
  status: "unknown" | "measured";
  space: string[];
}

export interface Lock {
  [key: string]: string; // name -> sha256 hash
}

export interface IR {
  locus_ir: "0.1";
  target: Target;
  intent: Intent;
  facts: Fact[];
  assertions: Assertion[];
  outcome_distribution: OutcomeDistribution;
  lock: Lock;
}

/** The seven-outcome space for `excise`. */
export const EXCISE_OUTCOMES = [
  "uncut",
  "partial",
  "rejoined",
  "indel",
  "deleted",
  "inverted",
  "degraded",
] as const;
