# Convergence examples

Three real gene therapy cases with known published outcomes, run through Locus to test whether the system's conclusions converge with or diverge from reality.

## Results

All three cases run against the synthetic corpus genome at tolerance 0.

### Case 1: HSV-2 latent reservoir excision (Jerome lab)

**Published reality:** Aubert et al. 2024 (doi:10.1038/s41467-024-45030-1) achieved 90-97% reduction in latent HSV DNA in mouse sacral ganglia using AAV-delivered meganucleases. Complete elimination was **not** achieved. Some animals showed undetectable viral DNA, most did not.

**Locus says:** `eliminates_reservoir` **REFUSED** for three reasons:
1. Residence grade `(asserted, same)` does not meet the floor `(measured, same)` — the claim that HSV resides only in sacral sensory neurons is an assertion, not a measurement
2. Residence not exhaustive (`only` absent) — HSV latency may extend beyond sacral DRG
3. Excise outcome distribution unknown

**Convergence: YES.** The system refuses the claim that matters, and the reasons map to real gaps in the published evidence. The residence concern is particularly apt — HSV latency sites beyond the DRG remain debated.

### Case 2: Casgevy / BCL11A enhancer (Vertex/CRISPR Therapeutics)

**Published reality:** Frangoul et al. 2021 (doi:10.1056/NEJMoa2031054). FDA-approved Dec 2023. CRISPR disruption of the BCL11A erythroid enhancer reactivates fetal hemoglobin. Sustained HbF >40%, transfusion independence in most patients. This is **not** a reservoir elimination — it's enhancer disruption.

**Locus says:** `eliminates_reservoir` **REFUSED** for two reasons:
1. Residence not exhaustive (`only` absent)
2. Excise outcome distribution unknown

Note: the residence fact *does* meet the floor `(measured, same)` because the design declares `@measured(human)` — the therapeutic editing of HSCs is well-characterized. But the other two conditions are not met.

**Convergence: YES.** The system correctly refuses reservoir elimination for a therapy that is not, in fact, eliminating a reservoir. The `only` check is structurally correct — Casgevy does not claim to reach all copies of BCL11A, only those in edited HSCs that engraft.

### Case 3: HBV cccDNA excision (Stone et al.)

**Published reality:** Stone et al. 2021. AAV-delivered CRISPR targeting HBV cccDNA in mouse models. Significant reduction in cccDNA and HBsAg, but complete cccDNA elimination **not** achieved. Additionally, HBV DNA has been detected in PBMCs and other extrahepatic sites, challenging the hepatocyte-only residence assumption.

**Locus says:** `eliminates_reservoir` **REFUSED** for three reasons:
1. Residence grade `(asserted, same)` does not meet floor — the hepatocyte-only claim is ungraded
2. Residence not exhaustive (`only` absent)
3. Excise outcome distribution unknown

**Convergence: YES.** The system catches exactly the gap that matters: the residence assumption (hepatocyte-only) is asserted, not measured, and it's not marked exhaustive. This matches the real uncertainty — extrahepatic HBV reservoirs remain an open question.

## Summary

| Case | Known outcome | Locus conclusion | Converges? |
|------|--------------|------------------|------------|
| HSV-2 (Jerome) | ~90% reduction, not eliminated | REFUSED (3 reasons) | Yes |
| Casgevy (BCL11A) | Works, but not reservoir elimination | REFUSED (2 reasons) | Yes |
| HBV cccDNA (Stone) | Reduced, not eliminated | REFUSED (3 reasons) | Yes |

The system converges with published reality in all three cases. The refusal reasons are not generic — they identify the specific evidence gaps (ungraded residence, non-exhaustive tissue claims, unknown outcome distributions) that the literature also identifies as open problems.

The system does not and cannot say "this therapy works" or "this therapy fails." It says what can be proven from the inputs, and refuses what cannot. For all three therapies, `eliminates_reservoir` cannot be proven, which is correct.
