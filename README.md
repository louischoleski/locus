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
  f_res  residence_exhaustive(tissues neuron.sensory.sacral, resolved CL:0000101) = false   (asserted, same)
  f2  site_occurrences(site 0, corpus GRCh38.p14, tolerance 0) = 1   (computed, n/a)
  f3  site_occurrences(site 1, corpus GRCh38.p14, tolerance 0) = 1   (computed, n/a)

ASSERTIONS
  signature_unique_in_reference   ALLOWED   f2, f3 meets (computed, n/a)
  sequence_unique_in_host   REFUSED
    no supporting fact
  construct_fits_vehicle   REFUSED
    no supporting fact
  eliminates_reservoir   REFUSED
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

## Commands

| Command | Description | Exit code |
|---------|-------------|-----------|
| `locus build <file> --genome <fasta>` | Full build: resolve, scan, judge, manifest | 0 ok, 1 refused, 2 error |
| `locus check <file>` | Parse and static checks only | 0 ok, 2 error |
| `locus why <assertion> <file> --genome <fasta>` | Explain why an assertion was allowed or refused | 0 allowed, 1 refused |
| `locus test <dir> --genome <fasta>` | Run corpus fixtures | 0 pass, 1 fixture fail, 2 unit fail |
| `locus diff <dir> --genome-a <fa> --genome-b <fa>` | Compare assertion statuses across genomes | 0 no change, 1 needs reviewer |
| `locus registry validate <header.json>` | Validate a registry header | 0 valid, 2 invalid |
| `locus init` | Scaffold a new design.locus file | |

Add `--json` to `build` for machine-readable IR and diagnostics. Add `--scan-cache <dir>` to cache scan results across builds. Add `--precomputed <file>` to skip scanning entirely.

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

v0 defines the outcome space and leaves the probabilities `unknown`. Every efficacy assertion is refused until somebody measures the distribution for a given effector, site pair, and cell type.

## The refusal rule

> If a value is not derivable from the inputs, emit `unknown`. Never estimate, never default, never interpolate.

v0 refuses far more than it allows. That is the intended behaviour.

## Project structure

```
src/
  grammar/     Lexer, recursive descent parser, four static checks
  ir/          Two-axis grade algebra, fact graph types
  passes/      resolve (parse + vocab), scan (FASTA + k-mer index), judge (grade fold)
  registry/    Header validator, vocab resolver, organism relations, provenance, normalisation
  cli/         build, check, why, test, diff, init, diagnostics

registry/
  schema.json        Registry header JSON Schema
  floors.json        Assertion floor table
  relations.json     Organism distance pairs
  holdout.json       Default holdout configuration
  headers/           20 vehicle headers (AAV serotypes, LNPs, lentiviral, adenoviral)
  vocab/             Cell Ontology (~150 terms) and Uberon (~150 terms)

fixtures/
  corpus/            30 fixtures (15 targets, 5 variants, 4 unit errors, 6 falsifications)
```

## Tests

```
npm test                # 118 unit + property tests
npm run test:corpus     # 30 corpus fixtures against synthetic genome
```

## License

MIT
