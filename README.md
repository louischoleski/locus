# Locus

A specificity checker for gene therapy designs. Locus reads a target, scans a reference genome, and writes a manifest that says what it can prove, what it cannot, and why.

It does not estimate, default, or interpolate. If a value is not derivable from the inputs, the manifest says `unknown`. A build that refuses an interesting claim for stated reasons is the intended output.

## Install

```
git clone https://github.com/louischoleski/locus.git
cd locus
npm install
npm link
```

Requires Node.js v22+ (uses `--experimental-strip-types`).

## Quick start

```
locus init                                          # scaffold a design.locus file
locus check design.locus                            # parse and validate
locus build design.locus --genome ref.fa            # build manifest
locus why eliminates_reservoir design.locus --genome ref.fa   # explain a refusal
locus audit design.locus --genome ref.fa            # evidence completeness report
```

## Usage

Write a `.locus` file:

```
target HSV2Latent {
  organism human
  tolerance 0
  signatures all [ GATCTTGGACGT, TTACGCAAGCTT ]
  in [ neuron.sensory.sacral ] @asserted(human)
}

excise HSV2Latent
```

Build it against a reference genome:

```
$ locus build design.locus --genome GRCh38.fa --genome-name GRCh38.p14

FACTS
  f_res  residence_exhaustive(...) = false   (asserted, same)
  f2  site_occurrences(site 0, ...) = 1      (computed, n/a)
  f3  site_occurrences(site 1, ...) = 1      (computed, n/a)

ASSERTIONS
  signature_unique_in_reference   ALLOWED
  sequence_unique_in_host         REFUSED   no supporting fact
  construct_fits_vehicle          REFUSED   no supporting fact
  eliminates_reservoir            REFUSED
    fact f_res grade (asserted, same) does not meet floor (measured, same)
    residence not exhaustive (`only` absent)
    excise outcome distribution unknown

UNKNOWN
  outcome distribution for excise
  host genome (reference used as proxy)
  off-target analysis not performed (PAM-adjacency and bulges unmodelled)

LOCK
  GRCh38.p14   sha256:9f2c...
  vocab:CL   cl-2026-09
  vocab:UBERON   uberon-2026-09
```

Ask why a claim was refused:

```
$ locus why eliminates_reservoir design.locus --genome GRCh38.fa

REFUSED  floor (measured, same)
  └─ fact f_res grade (asserted, same) does not meet floor (measured, same)
  └─ residence not exhaustive (`only` absent)
  └─ excise outcome distribution unknown
  └─ f_res: residence_exhaustive = false   (asserted, same)
```

Audit the evidence completeness:

```
$ locus audit design.locus --genome GRCh38.fa

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

## Providing measured evidence

Locus refuses claims until evidence is provided. Use `--facts` to supply measured data:

```
$ locus build design.locus --genome ref.fa --facts evidence.json
```

The facts file can include external experimental results (e.g., from a reporter assay) and a measured outcome distribution. See [`examples/`](examples/) for complete examples including a [detection vector verification assay](examples/verification_assay.locus).

## Commands

| Command | Description | Exit code |
|---------|-------------|-----------|
| `locus build <file> --genome <fasta>` | Full build: resolve, scan, judge, manifest | 0 ok, 1 refused, 2 error |
| `locus check <file>` | Parse and static checks only | 0 ok, 2 error |
| `locus why <assertion> <file> --genome <fasta>` | Explain why an assertion was allowed or refused | 0 allowed, 1 refused |
| `locus audit <file> --genome <fasta>` | Evidence completeness, open questions, risk surface | 0 all allowed, 1 refusals |
| `locus test <dir> --genome <fasta>` | Run corpus fixtures | 0 pass, 1 fixture fail, 2 unit fail |
| `locus diff <dir> --genome-a <fa> --genome-b <fa>` | Compare assertion statuses across genomes | 0 no change, 1 needs reviewer |
| `locus registry validate <header.json>` | Validate a registry header | 0 valid, 2 invalid |
| `locus init` | Scaffold a new design.locus file | |

**Flags:** `--json` for machine-readable output. `--scan-cache <dir>` to cache scan results. `--precomputed <file>` to skip scanning. `--facts <file>` to supply external evidence. `--no-holdout` to skip holdout filtering in tests.

## The grade algebra

Every fact carries a grade on two independent axes:

**Method** (how it was obtained): `computed` > `measured` > `inferred` > `asserted` > `unknown`

**Organism distance** (relative to the target): `n/a` > `same` > `related` > `distant` > `unknown`

Meet is componentwise minimum. A derived fact's grade cannot exceed the meet of its parents. An assertion is allowed only if its supporting facts meet the floor on both axes.

| Assertion | Floor |
|-----------|-------|
| `signature_unique_in_reference` | `(computed, n/a)` |
| `sequence_unique_in_host` | `(inferred, same)` |
| `construct_fits_vehicle` | `(measured, n/a)` |
| `eliminates_reservoir` | `(measured, same)` |

## What `excise` means

A nuclease makes a cut. What follows is a distribution, not an outcome. For each copy of the target genome, exactly one of seven outcomes holds: `uncut`, `partial`, `rejoined`, `indel`, `deleted`, `inverted`, `degraded`.

The outcome distribution is `unknown` until someone measures it for a given effector, site pair, and cell type. Every efficacy assertion is refused until then.

## The refusal rule

> If a value is not derivable from the inputs, emit `unknown`. Never estimate, never default, never interpolate.

v0 refuses far more than it allows. That is the intended behaviour.

## Examples

Eight worked examples in [`examples/`](examples/), covering convergence testing, verification, and virus-as-drug delivery.

### Convergence with published reality

| Example | Outcome | Converges? |
|---------|---------|------------|
| [HSV-2 excision](examples/hsv2_jerome_2021.locus) (Jerome lab) | REFUSED — 3 reasons | Yes: ~90% reduction, not eliminated |
| [Casgevy / BCL11A](examples/casgevy_bcl11a.locus) (Vertex/CRISPR) | REFUSED — 2 reasons | Yes: enhancer disruption, not reservoir elimination |
| [HBV cccDNA](examples/hbv_excision.locus) (Stone et al.) | REFUSED — 3 reasons | Yes: reduced, not eliminated |

### Virus as drug delivery

The virus is the vehicle. The DNA sequence is the trigger. Only cells containing the target sequence get the therapeutic effect. Each flips from REFUSED to ALLOWED when measured evidence is provided via `--facts`:

```
locus build examples/hpv_cervical_cancer.locus --genome fixtures/corpus/corpus_genome.fa --facts examples/hpv_cervical_cancer_facts.json
```

| Example | Target | Mechanism | Without evidence | With evidence |
|---------|--------|-----------|-----------------|---------------|
| [HPV cervical cancer](examples/hpv_cervical_cancer.locus) | HPV16 E6 oncogene | Cut E6 → restore p53 → cancer cell death | REFUSED | ALLOWED |
| [HIV provirus cure](examples/hiv_provirus_cure.locus) | HIV LTR (dual guide) | Excise integrated provirus from resting T cells | REFUSED | ALLOWED |
| [EBV nasopharyngeal](examples/ebv_nasopharyngeal.locus) | EBNA1 | Disrupt episome maintenance → virus dilutes out | REFUSED | ALLOWED |

### Verification and full elimination

| Example | Purpose |
|---------|---------|
| [Full elimination](examples/full_elimination.locus) | What all four conditions look like when met |
| [Detection vector assay](examples/verification_assay.locus) | dCas9-VPR-GFP reporter to verify excision worked |

The system converges with published reality in all three real cases. The virus-as-drug examples show how measured evidence converts a refusal into an allowance.

## Project structure

```
src/
  grammar/     Lexer, recursive descent parser, four static checks
  ir/          Two-axis grade algebra, fact graph types
  passes/      resolve (parse + vocab), scan (FASTA + k-mer index), judge (grade fold)
  registry/    Header validator, vocab resolver, organism relations, provenance, normalisation
  cli/         build, check, why, audit, test, diff, init, diagnostics

registry/
  schema.json        Registry header JSON Schema
  floors.json        Assertion floor table
  relations.json     Organism distance pairs
  holdout.json       Default holdout configuration
  headers/           20 vehicle headers (AAV serotypes, LNPs, lentiviral, adenoviral)
  vocab/             Cell Ontology (~150 terms) and Uberon (~150 terms)

fixtures/
  corpus/            30 fixtures against 1MB synthetic genome

examples/
  8 worked examples (convergence, virus-as-drug, verification)
```

## Tests

```
npm test                # 118 unit + property tests
npm run test:corpus     # 30 corpus fixtures against synthetic genome
```

## Determinism

Same inputs, same outputs, every time. No randomness, no sampling, no model inference, no floating point accumulation, no ordering dependence. The lockfile pins the genome hash and vocab version — two builds against the same lock produce identical manifests.

## License

MIT
