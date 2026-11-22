/**
 * locus audit — evidence completeness profile.
 *
 * Not a confidence score. A confidence score would require a denominator
 * nobody can state (the spec's L-22). Instead, this is an inventory:
 *
 * 1. EVIDENCE PROFILE — grade distribution across all facts
 * 2. OPEN QUESTIONS — specific unknowns and what they could change
 * 3. COMPLETENESS — fraction of assertions with all conditions met
 * 4. RISK SURFACE — what would flip if an unknown were resolved unfavorably
 */

import type { IR, Assertion } from "../ir/types.ts";
import { effectiveGrade, type Fact, type Grade, METHOD_ORDER, ORGANISM_ORDER } from "../ir/grade.ts";

export interface AuditResult {
  profile: EvidenceProfile;
  openQuestions: OpenQuestion[];
  completeness: Completeness;
  riskSurface: RiskEntry[];
  report: string;
}

export interface EvidenceProfile {
  totalFacts: number;
  byMethod: Record<string, number>;
  byOrganism: Record<string, number>;
  weakestFact: { id: string; grade: Grade } | null;
  strongestUnsupported: string | null;
}

export interface OpenQuestion {
  id: string;
  question: string;
  impact: string;
  currentStatus: string;
}

export interface Completeness {
  totalAssertions: number;
  allowed: number;
  refused: number;
  ratio: number;
  missingConditions: number;
}

export interface RiskEntry {
  assertion: string;
  currentStatus: string;
  wouldFlipIf: string;
  severity: "high" | "medium" | "low";
}

export function audit(ir: IR): AuditResult {
  const factMap = new Map(ir.facts.map((f) => [f.id, f]));

  // 1. Evidence profile
  const byMethod: Record<string, number> = {};
  const byOrganism: Record<string, number> = {};
  let weakestFact: { id: string; grade: Grade } | null = null;
  let weakestRank = -1;

  for (const m of METHOD_ORDER) byMethod[m] = 0;
  for (const o of ORGANISM_ORDER) byOrganism[o] = 0;

  for (const f of ir.facts) {
    const eff = effectiveGrade(f.id, factMap);
    byMethod[eff.m] = (byMethod[eff.m] ?? 0) + 1;
    byOrganism[eff.o] = (byOrganism[eff.o] ?? 0) + 1;

    const rank = METHOD_ORDER.indexOf(eff.m);
    if (rank > weakestRank) {
      weakestRank = rank;
      weakestFact = { id: f.id, grade: eff };
    }
  }

  // Find strongest assertion that's refused
  const strongestUnsupported = ir.assertions
    .filter((a) => a.status === "refused")
    .sort((a, b) => {
      const ra = METHOD_ORDER.indexOf(a.floor.m as typeof METHOD_ORDER[number]);
      const rb = METHOD_ORDER.indexOf(b.floor.m as typeof METHOD_ORDER[number]);
      return ra - rb;
    })[0]?.name ?? null;

  const profile: EvidenceProfile = {
    totalFacts: ir.facts.length,
    byMethod,
    byOrganism,
    weakestFact,
    strongestUnsupported,
  };

  // 2. Open questions
  const openQuestions: OpenQuestion[] = [];

  // Outcome distribution
  if (ir.outcome_distribution.status === "unknown") {
    openQuestions.push({
      id: "OQ-01",
      question: "What is the outcome distribution for this excision?",
      impact: "Required for eliminates_reservoir. Without it, efficacy cannot be assessed.",
      currentStatus: "No measured data. The seven outcomes (uncut, partial, rejoined, indel, deleted, inverted, degraded) have unknown probabilities.",
    });
  }

  // Host genome proxy
  const hostFacts = ir.facts.filter((f) => f.claim === "unique_in_host");
  const occFacts = ir.facts.filter((f) => f.claim === "site_occurrences");
  if (occFacts.length > 0) {
    openQuestions.push({
      id: "OQ-02",
      question: "Does the reference genome accurately represent the host?",
      impact: "Site occurrence counts are computed against a reference, not the patient's genome. Individual variation (SNPs, structural variants) could create or destroy cut sites.",
      currentStatus: `${occFacts.length} site(s) scanned against reference. Host inference is at grade (inferred, same).`,
    });
  }

  // Off-target
  openQuestions.push({
    id: "OQ-03",
    question: "Are there off-target cut sites?",
    impact: "v0 counts sequence matches, not cuttable sites. PAM adjacency, bulges, and RNA:DNA thermodynamics are unmodelled. The actual off-target profile could be better or worse than the sequence match count suggests.",
    currentStatus: "No off-target analysis performed. Substitution-only scan at declared tolerance.",
  });

  // Residence exhaustiveness
  if (ir.target.residence && !ir.target.residence.exhaustive) {
    openQuestions.push({
      id: "OQ-04",
      question: `Is the target confined to ${ir.target.residence.tissues.join(", ")}?`,
      impact: "If the target exists in tissues not listed, excision in the declared tissues alone cannot eliminate the reservoir.",
      currentStatus: "Residence not marked exhaustive (`only` absent).",
    });
  }

  // Asserted facts
  const assertedFacts = ir.facts.filter((f) => {
    const eff = effectiveGrade(f.id, factMap);
    return eff.m === "asserted";
  });
  if (assertedFacts.length > 0) {
    openQuestions.push({
      id: "OQ-05",
      question: "Are the asserted facts correct?",
      impact: `${assertedFacts.length} fact(s) are author assertions with no backing evidence. Each is a potential point of failure.`,
      currentStatus: assertedFacts.map((f) => `${f.id}: ${f.claim}`).join("; "),
    });
  }

  // Near-match tolerance gap
  // We can't directly access near-matches from the IR, but we can flag the tolerance
  if (ir.target.tolerance === 0) {
    openQuestions.push({
      id: "OQ-06",
      question: "What happens at higher mismatch tolerances?",
      impact: "Tolerance 0 is exact match only. Real nucleases have non-zero mismatch tolerance. Near-matches above the declared tolerance are listed in UNKNOWN but not evaluated.",
      currentStatus: `Declared tolerance: ${ir.target.tolerance}. Check the UNKNOWN section for near-match counts.`,
    });
  }

  // 3. Completeness
  const allowed = ir.assertions.filter((a) => a.status === "allowed").length;
  const refused = ir.assertions.filter((a) => a.status === "refused").length;
  const totalConditions = ir.assertions.reduce((sum, a) => {
    if (a.status === "refused") return sum + a.reasons.length;
    return sum;
  }, 0);

  const completeness: Completeness = {
    totalAssertions: ir.assertions.length,
    allowed,
    refused,
    ratio: ir.assertions.length > 0 ? allowed / ir.assertions.length : 0,
    missingConditions: totalConditions,
  };

  // 4. Risk surface — what would flip if an unknown resolved unfavorably
  const riskSurface: RiskEntry[] = [];

  for (const a of ir.assertions) {
    if (a.status === "allowed") {
      // What could make this flip to refused?
      if (a.name === "signature_unique_in_reference") {
        riskSurface.push({
          assertion: a.name,
          currentStatus: "ALLOWED",
          wouldFlipIf: "A genome update reveals the site is not unique (e.g., new assembly, structural variant).",
          severity: "medium",
        });
      }
      if (a.name === "sequence_unique_in_host") {
        riskSurface.push({
          assertion: a.name,
          currentStatus: "ALLOWED",
          wouldFlipIf: "Patient's genome differs from reference at the target locus (individual variation).",
          severity: "medium",
        });
      }
      if (a.name === "eliminates_reservoir") {
        riskSurface.push({
          assertion: a.name,
          currentStatus: "ALLOWED",
          wouldFlipIf: "Outcome distribution changes with a different effector, cell type, or delivery route. Or residence is found to extend beyond declared tissues.",
          severity: "high",
        });
      }
    } else {
      // For refused: what's needed to flip to allowed?
      for (const reason of a.reasons) {
        let severity: "high" | "medium" | "low" = "medium";
        if (a.name === "eliminates_reservoir") severity = "high";
        if (reason.includes("no supporting fact")) severity = "high";

        riskSurface.push({
          assertion: a.name,
          currentStatus: "REFUSED",
          wouldFlipIf: `Condition met: ${reason}`,
          severity,
        });
      }
    }
  }

  // Build report
  const report = formatReport(profile, openQuestions, completeness, riskSurface, ir);
  return { profile, openQuestions, completeness, riskSurface, report };
}

function formatReport(
  profile: EvidenceProfile,
  questions: OpenQuestion[],
  completeness: Completeness,
  risks: RiskEntry[],
  ir: IR,
): string {
  const lines: string[] = [];

  lines.push("EVIDENCE PROFILE");
  lines.push(`  ${profile.totalFacts} fact(s) in the build`);
  lines.push("");
  lines.push("  Method axis distribution:");
  for (const [m, count] of Object.entries(profile.byMethod)) {
    if (count > 0) {
      const bar = "█".repeat(count) + "░".repeat(Math.max(0, profile.totalFacts - count));
      lines.push(`    ${m.padEnd(10)} ${count}  ${bar}`);
    }
  }
  lines.push("");
  lines.push("  Organism axis distribution:");
  for (const [o, count] of Object.entries(profile.byOrganism)) {
    if (count > 0) {
      lines.push(`    ${o.padEnd(10)} ${count}`);
    }
  }
  if (profile.weakestFact) {
    lines.push("");
    lines.push(`  Weakest fact: ${profile.weakestFact.id} at (${profile.weakestFact.grade.m}, ${profile.weakestFact.grade.o})`);
  }

  lines.push("");
  lines.push("ASSERTION COMPLETENESS");
  lines.push(`  ${completeness.allowed}/${completeness.totalAssertions} assertions allowed (${Math.round(completeness.ratio * 100)}%)`);
  lines.push(`  ${completeness.refused} refused, ${completeness.missingConditions} missing condition(s) total`);

  lines.push("");
  lines.push("OPEN QUESTIONS");
  for (const q of questions) {
    lines.push(`  ${q.id}  ${q.question}`);
    lines.push(`         Impact: ${q.impact}`);
    lines.push(`         Status: ${q.currentStatus}`);
    lines.push("");
  }

  lines.push("RISK SURFACE");
  const highRisks = risks.filter((r) => r.severity === "high");
  const medRisks = risks.filter((r) => r.severity === "medium");
  const lowRisks = risks.filter((r) => r.severity === "low");

  if (highRisks.length > 0) {
    lines.push("  HIGH:");
    for (const r of highRisks) {
      lines.push(`    ${r.assertion} [${r.currentStatus}]`);
      lines.push(`      ${r.wouldFlipIf}`);
    }
  }
  if (medRisks.length > 0) {
    lines.push("  MEDIUM:");
    for (const r of medRisks) {
      lines.push(`    ${r.assertion} [${r.currentStatus}]`);
      lines.push(`      ${r.wouldFlipIf}`);
    }
  }
  if (lowRisks.length > 0) {
    lines.push("  LOW:");
    for (const r of lowRisks) {
      lines.push(`    ${r.assertion} [${r.currentStatus}]`);
      lines.push(`      ${r.wouldFlipIf}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
