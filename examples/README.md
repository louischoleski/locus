# Examples

Four cases demonstrating what Locus does: three real gene therapies with known outcomes, and one hypothetical case showing what full elimination requires.

Run any example:

```
locus build examples/hsv2_jerome_2021.locus --genome fixtures/corpus/corpus_genome.fa
locus audit examples/hsv2_jerome_2021.locus --genome fixtures/corpus/corpus_genome.fa
locus why eliminates_reservoir examples/hsv2_jerome_2021.locus --genome fixtures/corpus/corpus_genome.fa
```

## Case 1: HSV-2 latent reservoir excision (Jerome lab)

**Source:** Aubert et al. 2024 (doi:10.1038/s41467-024-45030-1)

**Published reality:** AAV-delivered meganucleases targeting HSV in mouse sacral DRG. 90-97% reduction in latent HSV DNA. Complete elimination **not** achieved.

**Locus says:** `eliminates_reservoir` **REFUSED**
- Residence grade `(asserted, same)` does not meet floor `(measured, same)`
- Residence not exhaustive (`only` absent)
- Excise outcome distribution unknown

**Convergence: YES.** The residence concern is particularly apt — HSV latency sites beyond the DRG remain debated.

```
locus build examples/hsv2_jerome_2021.locus --genome fixtures/corpus/corpus_genome.fa
```

## Case 2: Casgevy / BCL11A enhancer (Vertex/CRISPR Therapeutics)

**Source:** Frangoul et al. 2021 (doi:10.1056/NEJMoa2031054). FDA-approved Dec 2023.

**Published reality:** CRISPR disruption of the BCL11A erythroid enhancer reactivates fetal hemoglobin. Transfusion independence in most patients. This is enhancer disruption, **not** reservoir elimination.

**Locus says:** `eliminates_reservoir` **REFUSED**
- Residence not exhaustive (`only` absent)
- Excise outcome distribution unknown

**Convergence: YES.** The system correctly refuses reservoir elimination for a therapy that isn't trying to eliminate a reservoir.

```
locus build examples/casgevy_bcl11a.locus --genome fixtures/corpus/corpus_genome.fa
```

## Case 3: HBV cccDNA excision (Stone et al.)

**Source:** Stone et al. 2021. AAV-delivered CRISPR targeting HBV cccDNA in mouse models.

**Published reality:** Significant reduction in cccDNA and HBsAg, but complete elimination **not** achieved. HBV DNA detected in PBMCs and extrahepatic sites.

**Locus says:** `eliminates_reservoir` **REFUSED**
- Residence grade `(asserted, same)` does not meet floor
- Residence not exhaustive (`only` absent)
- Excise outcome distribution unknown

**Convergence: YES.** The hepatocyte-only assumption is flagged as ungraded — matching the real debate about extrahepatic HBV reservoirs.

```
locus build examples/hbv_excision.locus --genome fixtures/corpus/corpus_genome.fa
```

## Case 4: Hypothetical full elimination

**What it takes for `eliminates_reservoir` to be ALLOWED:**

1. Guide sequence unique in the reference genome (0 occurrences)
2. Residence declared exhaustive (`only`) with grade `(measured, same)`
3. Outcome distribution measured (provided via `--facts`)
4. Supporting fact for elimination at grade `(measured, same)`

Without external facts (outcome distribution unknown):

```
$ locus build examples/full_elimination.locus --genome fixtures/corpus/corpus_genome.fa

eliminates_reservoir   REFUSED
  excise outcome distribution unknown
```

With measured evidence provided:

```
$ locus build examples/full_elimination.locus \
    --genome fixtures/corpus/corpus_genome.fa \
    --facts examples/full_elimination_facts.json

eliminates_reservoir   ALLOWED   f_res, f_ext_elimination meets (measured, same)
```

The only difference between refusal and allowance is measured evidence. The system won't invent it.

## Auditing a design

`locus audit` shows what you don't know and what it could cost:

```
$ locus audit examples/hsv2_jerome_2021.locus --genome fixtures/corpus/corpus_genome.fa

EVIDENCE PROFILE
  3 fact(s) in the build
  Method axis:  computed 2, asserted 1
  Weakest fact: f_res at (asserted, same)

ASSERTION COMPLETENESS
  1/4 assertions allowed (25%)
  3 refused, 5 missing condition(s) total

OPEN QUESTIONS
  OQ-01  What is the outcome distribution for this excision?
  OQ-02  Does the reference genome accurately represent the host?
  OQ-03  Are there off-target cut sites?
  OQ-04  Is the target confined to neuron.sensory.sacral?
  OQ-05  Are the asserted facts correct?
  OQ-06  What happens at higher mismatch tolerances?

RISK SURFACE
  HIGH: eliminates_reservoir [REFUSED] — 3 missing conditions
  MEDIUM: signature_unique_in_reference [ALLOWED] — could flip on genome update
```

Compare with the full elimination case:

```
$ locus audit examples/full_elimination.locus \
    --genome fixtures/corpus/corpus_genome.fa \
    --facts examples/full_elimination_facts.json

ASSERTION COMPLETENESS
  3/4 assertions allowed (75%)

OPEN QUESTIONS
  OQ-02  Does the reference genome accurately represent the host?
  OQ-03  Are there off-target cut sites?
  OQ-06  What happens at higher mismatch tolerances?

RISK SURFACE
  HIGH: eliminates_reservoir [ALLOWED] — could flip if outcome distribution
        changes with a different effector, cell type, or delivery route
```

Even when allowed, the audit tells you what could still go wrong.

## Summary

| Case | Known outcome | Locus | Converges? |
|------|--------------|-------|------------|
| HSV-2 (Jerome) | ~90% reduction, not eliminated | REFUSED (3 reasons) | Yes |
| Casgevy (BCL11A) | Works, not reservoir elimination | REFUSED (2 reasons) | Yes |
| HBV cccDNA (Stone) | Reduced, not eliminated | REFUSED (3 reasons) | Yes |
| Hypothetical | N/A — fabricated evidence | ALLOWED (with measured facts) | N/A |

The system converges with published reality in all three real cases. The refusal reasons are not generic — they identify the specific evidence gaps that the literature also identifies as open problems.
