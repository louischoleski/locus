/**
 * locus drain — model reservoir depletion over multiple treatment rounds.
 *
 * The core insight: a single excision round cannot guarantee 100% clearance.
 * But repeated rounds drive the residual fraction exponentially toward zero.
 * "Fully drained" is not a binary — it's a probability bound.
 *
 * The question changes from "did we eliminate it?" to
 * "after N rounds, what is the probability that any copy remains?"
 *
 * Inputs:
 *   - clearance_rate: fraction cleared per round (measured)
 *   - detection_limit: smallest detectable residual fraction
 *   - cell_count: number of cells in the reservoir
 *   - copies_per_cell: average viral copies per cell
 *   - rounds: number of treatment rounds
 *
 * Outputs:
 *   - residual fraction after each round
 *   - expected remaining copies
 *   - round at which expected copies < 1
 *   - round at which residual is below detection limit
 *   - probability bound: P(any copy remains) after N rounds
 */

export interface DrainParams {
  clearance_rate: number;       // e.g. 0.98 (98% per round)
  detection_limit: number;      // e.g. 1e-6 (1 in a million)
  cell_count: number;           // e.g. 50000 (neurons in sacral DRG)
  copies_per_cell: number;      // e.g. 10 (HSV copies per latently infected neuron)
  infection_rate: number;       // e.g. 0.30 (fraction of cells infected)
  rounds: number;               // how many rounds to model
  confidence: number;           // e.g. 0.95 (95% confidence)
}

export interface RoundResult {
  round: number;
  residual_fraction: number;
  expected_copies: number;
  expected_infected_cells: number;
  below_detection: boolean;
  below_one_copy: boolean;
}

export interface DrainResult {
  params: DrainParams;
  rounds: RoundResult[];
  total_initial_copies: number;
  total_initial_infected: number;
  round_below_detection: number | null;
  round_below_one_copy: number | null;
  round_for_confidence: number | null;
  probability_any_remains: number;
  report: string;
}

export function modelDrain(params: DrainParams): DrainResult {
  const totalInfected = Math.round(params.cell_count * params.infection_rate);
  const totalCopies = totalInfected * params.copies_per_cell;
  const rounds: RoundResult[] = [];

  let roundBelowDetection: number | null = null;
  let roundBelowOneCopy: number | null = null;
  let roundForConfidence: number | null = null;

  for (let r = 0; r <= params.rounds; r++) {
    const residual = Math.pow(1 - params.clearance_rate, r);
    const expectedCopies = totalCopies * residual;
    const expectedInfected = totalInfected * residual;
    const belowDetection = residual < params.detection_limit;
    const belowOne = expectedCopies < 1;

    rounds.push({
      round: r,
      residual_fraction: residual,
      expected_copies: expectedCopies,
      expected_infected_cells: expectedInfected,
      below_detection: belowDetection,
      below_one_copy: belowOne,
    });

    if (belowDetection && roundBelowDetection === null) {
      roundBelowDetection = r;
    }
    if (belowOne && roundBelowOneCopy === null) {
      roundBelowOneCopy = r;
    }

    // P(any copy remains) ≈ 1 - (1 - residual)^totalCopies
    // For small residual: ≈ totalCopies * residual (Poisson approximation)
    const pAnyRemains = expectedCopies < 20
      ? 1 - Math.pow(1 - residual, totalCopies)
      : 1; // too many expected copies to be confident

    if (pAnyRemains < (1 - params.confidence) && roundForConfidence === null) {
      roundForConfidence = r;
    }
  }

  // Final probability
  const finalResidual = Math.pow(1 - params.clearance_rate, params.rounds);
  const finalExpected = totalCopies * finalResidual;
  const pAnyRemains = finalExpected < 20
    ? 1 - Math.pow(1 - finalResidual, totalCopies)
    : 1;

  const report = formatDrainReport(params, rounds, totalInfected, totalCopies,
    roundBelowDetection, roundBelowOneCopy, roundForConfidence, pAnyRemains);

  return {
    params,
    rounds,
    total_initial_copies: totalCopies,
    total_initial_infected: totalInfected,
    round_below_detection: roundBelowDetection,
    round_below_one_copy: roundBelowOneCopy,
    round_for_confidence: roundForConfidence,
    probability_any_remains: pAnyRemains,
    report,
  };
}

function formatDrainReport(
  params: DrainParams,
  rounds: RoundResult[],
  totalInfected: number,
  totalCopies: number,
  roundBelowDetection: number | null,
  roundBelowOneCopy: number | null,
  roundForConfidence: number | null,
  pAnyRemains: number,
): string {
  const lines: string[] = [];

  lines.push("RESERVOIR DRAIN MODEL");
  lines.push("");
  lines.push("  Parameters:");
  lines.push(`    Clearance rate per round:  ${(params.clearance_rate * 100).toFixed(1)}%`);
  lines.push(`    Reservoir size:            ${params.cell_count.toLocaleString()} cells`);
  lines.push(`    Infection rate:            ${(params.infection_rate * 100).toFixed(1)}%`);
  lines.push(`    Copies per infected cell:  ${params.copies_per_cell}`);
  lines.push(`    Initial infected cells:    ${totalInfected.toLocaleString()}`);
  lines.push(`    Initial viral copies:      ${totalCopies.toLocaleString()}`);
  lines.push(`    Detection limit:           ${params.detection_limit}`);
  lines.push(`    Confidence target:         ${(params.confidence * 100).toFixed(0)}%`);
  lines.push("");

  lines.push("  Round-by-round:");
  lines.push("    Round  Residual        Expected copies    Infected cells");
  for (const r of rounds) {
    if (r.round > 10 && !r.below_one_copy) continue; // skip middle rounds for large N
    const res = r.residual_fraction < 0.0001
      ? r.residual_fraction.toExponential(2)
      : (r.residual_fraction * 100).toFixed(4) + "%";
    const copies = r.expected_copies < 0.01
      ? r.expected_copies.toExponential(2)
      : r.expected_copies.toFixed(1);
    const cells = r.expected_infected_cells < 0.01
      ? r.expected_infected_cells.toExponential(2)
      : r.expected_infected_cells.toFixed(1);
    const markers: string[] = [];
    if (r.below_detection && r.round === roundBelowDetection) markers.push("← below detection");
    if (r.below_one_copy && r.round === roundBelowOneCopy) markers.push("← expected copies < 1");
    lines.push(`    ${String(r.round).padStart(5)}  ${res.padStart(14)}  ${copies.padStart(18)}  ${cells.padStart(16)}  ${markers.join("  ")}`);
  }

  lines.push("");
  lines.push("  Milestones:");
  lines.push(`    Below detection limit:     ${roundBelowDetection !== null ? `round ${roundBelowDetection}` : "not reached"}`);
  lines.push(`    Expected copies < 1:       ${roundBelowOneCopy !== null ? `round ${roundBelowOneCopy}` : "not reached"}`);
  lines.push(`    ${(params.confidence * 100).toFixed(0)}% confidence drained:    ${roundForConfidence !== null ? `round ${roundForConfidence}` : "not reached"}`);

  lines.push("");
  lines.push(`  After ${params.rounds} rounds:`);
  lines.push(`    P(any copy remains) = ${pAnyRemains < 0.0001 ? pAnyRemains.toExponential(3) : pAnyRemains.toFixed(6)}`);

  if (roundForConfidence !== null) {
    lines.push("");
    lines.push(`  CONCLUSION: ${roundForConfidence} treatment rounds to reach ${(params.confidence * 100).toFixed(0)}% confidence`);
    lines.push(`  of complete reservoir elimination, given ${(params.clearance_rate * 100).toFixed(1)}% clearance per round.`);
  } else {
    lines.push("");
    lines.push(`  CONCLUSION: ${params.rounds} rounds insufficient for ${(params.confidence * 100).toFixed(0)}% confidence.`);
    lines.push(`  Increase rounds or clearance rate.`);
  }

  lines.push("");
  lines.push("  WARNING: This model assumes independent clearance per round (each round");
  lines.push("  clears the same fraction of remaining copies). If resistant subpopulations");
  lines.push("  exist, or if reinfection occurs between rounds, the actual residual will");
  lines.push("  be higher. The model also assumes perfect re-delivery to all target cells.");
  lines.push("");
  return lines.join("\n");
}
