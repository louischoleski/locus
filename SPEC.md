# v0 specification

-=This tab supersedes the proposal wherever they disagree. It closes the fatal findings in the audit by picking answers rather than describing options: a two-axis grade algebra, a grammar, an intermediate representation, a defined postcondition for one intent, and an acceptance test for each. Everything the audit said to cut is cut, so what remains is a specificity checker with an honest manifest — buildable offline, testable against files you can download.

## Scope

v0 reads a target, scans a reference genome, and writes a manifest. That is all.

**In:** one intent (`excise`), literal signatures with `all` / `any`, residence with `only`, author-declared mismatch tolerance, the grade algebra, the registry schema and its validator, the manifest.

**Out:** `silence`, `correct`, `deliver`; guards and technology mapping; effector selection; vehicle solving and ranking; coverage numbers of any kind; species coercion; the extraction pipeline; simulation.

The registry schema ships in v0 even though v0 never solves for a vehicle. It is the artifact most likely to outlive the compiler, and its validator is the cheapest test of whether the central idea holds.

### The refusal rule

One rule governs every pass, and it is the difference between a tool and a generator of plausible output:

> If a value is not derivable from the inputs, emit `unknown`. Never estimate, never default, never interpolate.

This is stated here because it is the rule an implementer — human or model — will be most tempted to break. A missing coverage figure looks like a bug; inventing one looks like a feature. Every place v0 says `unknown`, it means the number does not exist yet, and a build that fills it in is wrong even when the number is reasonable.

The corollary is that v0 refuses far more than it allows. That is the intended behaviour, not a limitation to apologise for in the README.

## The grade algebra

The audit's finding was that one order conflates two independent things: how a fact was obtained, and how far its source sits from the organism you care about. v0 splits them.

**Axis M — method**, totally ordered, strongest first:

| Value | Means |
| --- | --- |
| `computed` | Fully determined by artifacts in this build. A statement about a file, not about the world. |
| `measured` | Observed in an experiment, cited. |
| `inferred` | Output of a model, or a step of reasoning beyond what was observed. |
| `asserted` | The author said so. No backing. |
| `unknown` | No basis. The default for anything unannotated. |

**Axis O — organism distance**, relative to the target's declared organism:

| Value | Means |
| --- | --- |
| `n/a` | Not organism-dependent. Sequence arithmetic, capsid capacity. |
| `same` | The target organism. |
| `related` | A model organism, named. |
| `distant` | A different system entirely, including cell lines. |
| `unknown` | Unstated. |

A grade is the pair `(M, O)`. **Meet is componentwise**: a derived fact takes the minimum on each axis independently. This is a product of two total orders, so it is a genuine lattice, and `(measured, related)` and `(inferred, same)` are simply incomparable — which is correct, and which the single-axis version silently got wrong.

### The two contradictions, resolved

**L-08, the PROVEN/MEASURED conflict.** There is no `proven` grade. Construct size is `(computed, n/a)` — arithmetic over the build's own data. Capsid capacity is `(measured, n/a)` — physics of a protein shell, not organism-dependent. Their meet is `(measured, n/a)`. The manifest says exactly that, and the word "proven" never appears.

**L-09, reference versus host.** These are two different facts and the build must carry both:

```
f1  "GATC... occurs 0 times in GRCh38.p14 at tolerance 0"   (computed, n/a)
f2  "GATC... occurs 0 times in this host's genome"           (inferred, same)
      derived_from: f1
```

The step from a reference to an individual is an inference, so f2 drops to `inferred` on the method axis. Nothing can launder it back up. This is the mechanism that makes the earlier mistake impossible rather than merely discouraged.

### Assertion floors

Floors are data, shipped as a table, not constants in the code. An assertion is allowed only if its supporting fact's grade meets or exceeds the floor on **both** axes.

| Assertion | Floor M | Floor O |
| --- | --- | --- |
| `signature_unique_in_reference` | computed | n/a |
| `signature_unique_in_host` | inferred | same |
| `construct_fits_vehicle` | measured | n/a |
| `eliminates_reservoir` | measured | same |

Two consequences worth noting. `eliminates_reservoir` can never be allowed from mouse data, by construction rather than by reviewer judgement. And `signature_unique_in_host` sits deliberately low, because it is an inference everyone makes and nobody should pretend is a measurement.

## Grammar

EBNF for the whole v0 language. It is small enough to hand-write a recursive descent parser in an afternoon, which is the point.

```
program      = { target } , statement ;

target       = "target" , ident , "{" , { field } , "}" ;

field        = signatures
             | residence
             | organism
             | tolerance ;

signatures   = "signatures" , ( sequence | combinator ) ;
combinator   = ( "all" | "any" ) , "[" , sequence , { "," , sequence } , "]" ;

residence    = "in" , [ "only" ] , tissues , [ grade ] ;
tissues      = tissue | "[" , tissue , { "," , tissue } , "]" ;
tissue       = ident , { "." , ident } ;

organism     = "organism" , ident ;
tolerance    = "tolerance" , integer ;

statement    = "excise" , ident ;

grade        = "@" , method , [ "(" , ident , ")" ] ;
method       = "measured" | "inferred" | "asserted" ;

sequence     = iupac , { iupac } ;
iupac        = "A"|"C"|"G"|"T"|"R"|"Y"|"S"|"W"|"K"|"M"|"B"|"D"|"H"|"V"|"N" ;
ident        = letter , { letter | digit | "_" } ;
integer      = digit , { digit } ;
comment      = "//" , { ? any char except newline ? } ;
```

### Static rules the grammar cannot express

Four checks run after parsing and before the IR is built. Each is a hard error, not a warning.

1. **A combinator is required for two or more sites.** A bare list does not parse, and a single sequence needs no combinator. This is why `signatures` takes either one sequence or a combinator form, never a plain list.
2. **`organism` is mandatory.** Axis O is meaningless without it, so a target that omits it cannot be graded and is rejected rather than defaulted.
3. **`tolerance` is mandatory.** The audit's L-10: an unstated tolerance is an invisible assumption. There is no default, because every default here is a lie about rigour.
4. **Sequences in one `all` must be distinct.** Two identical sites is a typo in every case anyone has described.

Note what `only` does *not* do grammatically: it takes an optional grade like any other claim, and if the grade is absent it is `asserted`, which fails the floor for `eliminates_reservoir`. The strongest keyword in the language is therefore weak by default — deliberately.

## The IR

The IR is a **fact graph**, and that choice does most of the work. Facts carry grades, facts cite the facts they came from, and the grade algebra is a fold over the edges. Passes add nodes and never mutate them.

```json
{
  "locus_ir": "0.1",
  "target": {
    "name": "HSV2Latent",
    "organism": "human",
    "tolerance": 0,
    "signatures": { "combinator": "all", "sites": ["GATCTTGG...", "TTACGCAA..."] },
    "residence": {
      "tissues": ["neuron.sensory.sacral"],
      "exhaustive": false,
      "grade": { "m": "asserted", "o": "same" }
    }
  },
  "intent": { "kind": "excise", "target": "HSV2Latent" },
  "facts": [
    {
      "id": "f1",
      "claim": "site_occurrences",
      "subject": { "site": 0, "corpus": "GRCh38.p14", "tolerance": 0 },
      "value": 0,
      "grade": { "m": "computed", "o": "n/a" },
      "from": [],
      "source": "sha256:9f2c..."
    },
    {
      "id": "f2",
      "claim": "unique_in_host",
      "subject": { "site": 0 },
      "value": true,
      "grade": { "m": "inferred", "o": "same" },
      "from": ["f1"],
      "note": "reference genome stands in for the individual"
    }
  ],
  "assertions": [
    {
      "name": "signature_unique_in_host",
      "supported_by": ["f2"],
      "floor": { "m": "inferred", "o": "same" },
      "status": "allowed"
    },
    {
      "name": "eliminates_reservoir",
      "supported_by": [],
      "floor": { "m": "measured", "o": "same" },
      "status": "refused",
      "reasons": [
        "no supporting fact",
        "residence not exhaustive (`only` absent)",
        "excise outcome distribution unknown"
      ]
    }
  ],
  "lock": { "GRCh38.p14": "sha256:9f2c...", "registry": "sha256:41ab..." }
}
```

Four properties this shape buys, each of which the audit found missing:

**Passes are total functions from IR to IR.** Each appends facts and assertions. None edits an existing node. A pass can therefore be run, serialised, diffed and tested alone, which is what makes the toolchain claim real rather than rhetorical.

**Grade propagation is a fold.** A fact's effective grade is the componentwise meet of its own grade and the effective grades of everything in `from`. That is six lines of code and it is where the soundness property lives, so it gets the property tests.

**Every number is attributable.** `source` holds a content hash. If a conclusion looks wrong you walk `from` edges to the file that caused it.

**`lock` makes builds reproducible.** Reference genome and registry are pinned by hash. Two builds that produce different manifests from the same source and the same lock are a bug, and the test suite can say so.

## What `excise` means

The audit's hardest finding: the central verb had no postcondition. A nuclease makes a cut. What follows is the cell's repair machinery, and the result is a distribution, not an outcome.

v0 defines the **outcome space** and leaves the probabilities empty. The shape is the contribution; the numbers are later work that now has a defined slot to land in.

For each copy of the target genome in a cell, exactly one outcome holds:

| Outcome | Meaning |
| --- | --- |
| `uncut` | No site was cut. |
| `partial` | Some but not all sites cut, under `all`. |
| `rejoined` | All sites cut, the span religated roughly as it was. |
| `indel` | All sites cut, repaired with small insertions or deletions at the junctions. |
| `deleted` | All sites cut, the span between them removed. |
| `inverted` | All sites cut, the span reinserted backwards. |
| `degraded` | The cut genome was destroyed rather than repaired. |

```
excise T succeeds for a genome copy  iff  outcome in { deleted, degraded }
```

Under `any`, the space collapses: a single cut yields `uncut`, `indel`, or `degraded`, and success is `degraded` alone. This is why the combinator is not cosmetic — it changes which outcomes count.

### What v0 does with this

Nothing numeric, and that is the point. The IR records:

```json
"outcome_distribution": { "status": "unknown", "space": ["uncut", "partial", "rejoined",
                          "indel", "deleted", "inverted", "degraded"] }
```

Because the distribution is `unknown`, every efficacy assertion is refused for want of a supporting fact. That refusal is correct today and will stay correct until somebody measures the distribution for a given effector, site pair and cell type — at which point it becomes a fact with a grade, and the manifest changes without the language changing.

Two things this buys immediately. `rejoined` and `inverted` are named, so a design that would silently count them as success cannot. And a fixture can now assert something precise — that a published result reported deletion in some fraction of genomes — rather than the vague "it worked" the corpus would otherwise have to encode.

## Passes, registry and manifest

### Three passes

No feedback loop exists in v0, because vehicle solving is out of scope. The passes are a straight line, each `IR -> IR`, each append-only.

1. **`resolve`** — parse, run the four static checks, normalise tissue terms against a vocabulary file, and emit the target node plus any author-asserted facts at grade `(asserted, declared organism)`.
2. **`scan`** — for each site, count occurrences in the locked reference at the declared tolerance. Append one `(computed, n/a)` fact per site, then one `(inferred, same)` fact per site for the host inference. Nothing else.
3. **`judge`** — fold grades along `from` edges, compare each assertion against its floor, mark `allowed` or `refused` with reasons. Write the manifest.

When vehicle solving arrives it introduces the cycle the audit flagged, so the rule is set now: that pass will be a bounded search with an explicit objective and an iteration cap, and hitting the cap is reported in the manifest rather than swallowed.

### Registry resolution

The registry ships in v0 with its validator, unused by the compiler and useful on its own.

- Headers are files; identity is `namespace/name`, never a bare name. `vendor_x/AAV9` and `lab_y/AAV9` coexist.
- A bare name that matches two headers is a **hard error** listing both. There is no precedence rule, because a silent winner is how a registry starts lying.
- Every build writes a lockfile holding the content hash of each header used and of the reference genome.
- The validator rejects any field lacking a grade. This is the single test that proves the project's premise, so it is written first.

### Manifest

Three sections, all generated, no prose.

```
FACTS
  f1  site_occurrences(site 0, GRCh38.p14, tol 0) = 0   (computed, n/a)
  f2  unique_in_host(site 0) = true                     (inferred, same)  <- f1
  f3  residence exhaustive = false                      (asserted, same)

ASSERTIONS
  signature_unique_in_reference   ALLOWED   f1 meets (computed, n/a)
  signature_unique_in_host        ALLOWED   f2 meets (inferred, same)
  eliminates_reservoir            REFUSED   no supporting fact
                                            residence not exhaustive
                                            excise outcome distribution unknown

UNKNOWN
  outcome distribution for excise
  host genome (reference used as proxy)
  near-matches above declared tolerance 0: 2 sites at <=3 mismatches

LOCK
  GRCh38.p14   sha256:9f2c...
  registry     sha256:41ab...
```

The `UNKNOWN` section is not a footnote. It is the part a reviewer reads first, and listing the discarded near-matches there is what stops a declared tolerance from quietly becoming a claim about specificity.

## Tests and the three commits

### What blocks what

The audit found that a failing fixture blocked nothing. Two gates, stated plainly:

- A failing **unit or property** test blocks the build. Ordinary.
- A failing **golden or falsification** fixture blocks a *registry release*, not a user's design. A user compiling against a released registry is not punished for a prior nobody has fixed; the people shipping the registry are.

`locus test` exits non-zero on either, and the publish step refuses on a non-zero exit.

### Holdout

Holdout by publication date alone leaks, because the same lab publishes on both sides of a cutoff and shares priors with itself. v0 splits on three keys at once: **date, lab, and vector family**. A fixture is held out if it matches the holdout set on any one of them. This throws away more data than a date split and is the only version that measures anything.

### Property tests on the grade algebra

These are the soundness claims, written as tests rather than prose:

```
meet is commutative, associative, idempotent
meet is monotone on each axis independently
no fact's effective grade exceeds the meet of its parents
an unannotated field parses to (unknown, unknown)
an assertion with no supporting fact is always refused
adding a fact never changes an existing fact's grade
```

The last one is what makes passes append-only in practice rather than by convention.

### Commit 1 — the schema and a validator that refuses

`registry/schema.json`, two hand-written headers, and a validator. **Write the failing test first:** a header whose `capacity` has no grade annotation must fail to load. If that test goes green on day one, the premise of the whole project is demonstrated in about forty lines.

Ship also the assertion-floor table as data, since it belongs beside the schema and is three rows.

### Commit 2 — the IR and the grade algebra

`ir/schema.json` with the node kinds above, plus a `grade` module: the two axes, componentwise meet, and the fold over `from` edges. The six property tests go here. No parser yet, no files read — this commit is pure and fast, and it is the part everything else leans on.

### Commit 3 — the checker and the manifest

`locusc` parses the EBNF, runs the four static checks, scans a FASTA at the declared tolerance, and writes the four-section manifest. Ship three fixtures, one of which fails, and wire the blocking rule so the failure actually stops a release.

At the end of commit 3 you can compile a real target against a real genome and get a manifest that refuses the interesting claim for stated reasons. That is a complete, honest, useless-in-the-clinic tool — and it is the first version of this idea that is true.

### Then the slow part

The corpus. Twenty headers and thirty fixtures, including ten documented failures, hand-curated. This is clerical work and it is where the real value sits, which is the uncomfortable shape of the project: a weekend of careful software, then months of patient reading.

## Disposition of every finding

Fourteen closed by this spec, five specified below, nine deferred with their design pinned so they cannot return as prose.

| ID | Finding | Disposition |
| --- | --- | --- |
| L-01 | No grammar | CLOSED — EBNF, with four static checks |
| L-02 | No IR | CLOSED — fact graph, append-only passes |
| L-03 | Intents have no postcondition | CLOSED — seven-outcome space for `excise` |
| L-04 | Coverage invented | DEFERRED — `unknown` until an estimator is named |
| L-05 | Independence assumed | DEFERRED — dependence must be a declared fact |
| L-06 | Lattice conflates two axes | CLOSED — method and organism distance, componentwise meet |
| L-07 | Downgrade rule incoherent | CLOSED — downgrade applies to the method axis only |
| L-08 | PROVEN rests on MEASURED | CLOSED — no `proven` grade exists |
| L-09 | Reference stands in for host | CLOSED — two facts, the second an inference |
| L-10 | Tolerance ungraded | CLOSED — mandatory; discarded near-matches listed under UNKNOWN |
| L-11 | Pipeline is a fixpoint loop | DEFERRED — objective and cap pinned below |
| L-12 | Lowering assumes parts compose | DEFERRED — guards cut from v0 |
| L-13 | Uses an ABI it says is missing | DEFERRED — compatibility becomes a measured fact |
| L-14 | No header resolution or versioning | CLOSED — namespaced ids, hard error on collision, lockfile |
| L-15 | Failing fixture blocks nothing | CLOSED — blocks a registry release |
| L-16 | Holdout by date leaks | CLOSED — split on date, lab and vector family |
| L-17 | Lowering is a table, not an algorithm | DEFERRED — needs a catalogue and a cost function |
| L-18 | Guards are boolean, reality is leaky | DEFERRED — enters as an error term |
| L-19 | `correct` ignores post-mitotic repair | DEFERRED — rule written below |
| L-20 | Assertion floors undefined | CLOSED — floors shipped as a data table |
| L-21 | `only` is ungraded author input | CLOSED — defaults to `asserted`, fails the floor |
| L-22 | Unknown denominator | DEFERRED — denominator policy required before any fraction ships |
| L-23 | Capacity is a hard scalar | SPECIFIED below |
| L-24 | Fixture normalisation unadjudicated | SPECIFIED below |
| L-25 | Extraction not reproducible | SPECIFIED below |
| L-26 | No regression tier | SPECIFIED below |
| L-27 | No explain mode | SPECIFIED below |
| L-28 | "Prove what you can" oversells | CLOSED — the word is gone from the grades and the manifest |

## The five specified here

**L-23 — capacity is a band, not a cliff.** Packaging efficiency falls off gradually, so a scalar with a hard comparison turns a soft threshold into a false precision. A header declares two numbers, and the check has three outcomes.

```
capacity { nominal 4.7kb @measured  soft_limit 5.2kb @measured }
```

`fits` below nominal, `marginal` between nominal and soft limit, `exceeds` above. Marginal is not an error — it is a fact at grade `(measured, n/a)` recorded in the manifest, and it fails the floor for `construct_fits_vehicle` while leaving the design compilable. The author learns the truth: it may package, worse, and nobody has measured how much worse for this construct.

**L-24 — normalisation is recorded, not resolved.** Every fixture keeps the raw reported value verbatim alongside the normalised one, the rule applied, and who applied it. Where two curators disagree, both entries are kept and the fixture is flagged `contested`; it stays in the corpus and is excluded from pass/fail scoring. Deleting the disagreement would be the only worse option than having it.

```
observed {
  raw        "~90% reduction in ganglionic HSV load"
  normalised 0.90   rule "reduction-fraction-v1"   by "mk"   2026-11-22
}
```

**L-25 — extraction carries its own provenance.** An extracted field records model identity and version, prompt hash, extraction date, source identifier and the character span it came from, and the reviewer or `null`. An unreviewed field is **capped at `inferred` on the method axis** and keeps its organism axis untouched. That is the coherent version of the rule the audit broke: review affects how a fact was obtained, never which organism it came from.

**L-26 — regression across registry versions.** `locus diff <lockA> <lockB>` recompiles the whole corpus under both and reports every assertion that changed status. A registry release must publish its diff. Any assertion flipping from `refused` to `allowed` requires a named reviewer on the release — drift toward permissiveness is the failure mode worth a human.

**L-27 — explain mode, nearly free.** `locus why <assertion>` walks `from` edges backwards and prints the derivation with the grade at each step, ending at source hashes.

```
$ locus why eliminates_reservoir
REFUSED  floor (measured, same)
  └─ no supporting fact
  └─ residence exhaustive = false        (asserted, same)   [design.locus:7]
  └─ outcome distribution = unknown      —                  [spec: excise]
```

This costs almost nothing because the IR is already a graph with parent edges. It is the clearest argument for having built the IR first rather than printing a trace.

## Deferred, with the design pinned

Cutting a feature is only honest if the conditions for its return are written down. Each of these ships when its precondition is met, and not before.

**Coverage (L-04, L-22).** No coverage figure is emitted until three things exist: a named estimator, a stated interval semantics (confidence interval, range across studies, or prior — pick one and say which), and a denominator policy for an unknown target population. Until all three, `coverage: unknown`. A fraction whose denominator nobody can state is not a measurement, and shipping one is the single most damaging thing this project could do.

**Dependence (L-05).** Any coverage model must carry its dependence assumption as an explicit graded fact. Independence across cell subtypes may never be implicit, because the document's own gap analysis argues tropism is correlated. A model that assumes independence is permitted; a model that assumes it silently is not.

**Vehicle solving and its fixpoint (L-11).** When it lands: objective is to maximise estimated coverage subject to capacity, exclusions and payload class. The search is bounded with a fixed iteration cap. Hitting the cap is reported in the manifest, never swallowed. No objective, no solver.

**Guards (L-12, L-17, L-18).** Three preconditions, all absent today. A parts catalogue with measured transfer functions rather than a prose table. Lowering as an algorithm with a stated cost function, not a lookup. And leakiness as an error term — a "tissue-specific" promoter has basal activity elsewhere, so a guard is a probability, not a boolean, and the type must say so from the first version rather than being retrofitted.

**Payload-vehicle compatibility (L-13).** Packaging compatibility becomes a measured fact per `(payload class, vehicle)` pair, with `unknown` as the default. Most of that matrix will read `unknown` for years. Publishing it in that state is more useful than the current situation, where the gaps are invisible.

**`correct` (L-19).** When the intent returns it arrives with a rule: `correct` targeting a post-mitotic tissue is a hard error unless a repair-pathway fact of grade at least `(measured, same)` says otherwise. Homology-directed repair is largely unavailable in cells that do not divide, and a language that lets you write the design anyway is worse than one that lacks the verb.

### The standing rule for all of them

A deferred feature returns by satisfying its precondition, not by someone deciding the gap is tolerable. If that sounds rigid, note that every item on this list became a finding precisely because the first draft decided a gap was tolerable.

## Closing the implementation gaps

Checking the specificity pass against how off-target search actually works turned up a problem that was not in the audit, and it outranks the rest.

### v0 does not perform off-target analysis, and must say so

A sequence match is not an off-target site. CRISPR nucleases require a protospacer-adjacent motif beside the target, and alignment tools return many hits with no adjacent PAM, which have to be filtered out as false off-targets ([OffScan](https://pmc.ncbi.nlm.nih.gov/articles/PMC7057453)). Since v0 has no effector selection, it has no recognition model, and therefore cannot decide which matches are cuttable.

Worse, the operation is not even well defined between tools. For the same guide and the same genome, CRISPOR and Cas-OFFinder report different counts — 6 versus 1 hit at two mismatches, 38 versus 18 at three ([comparison](https://pmc.ncbi.nlm.nih.gov/articles/PMC5773898/table/Tab3)). Serious tools also model bulges, insertions or deletions between guide and genome, not only substitutions ([COSMID et al.](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10354746)).

Three consequences, all binding:

1. The claim v0 emits is `sequence_occurrences`, never `off_target_sites`. The manifest states in the UNKNOWN section that no off-target analysis was performed and that PAM-adjacency and bulges are unmodelled.
2. The fact's `subject` records the algorithm and every parameter, because "how many matches" has no answer independent of them.
3. `signature_unique_in_host` is renamed `sequence_unique_in_host`. It is a claim about a string in a genome and nothing more.

This costs nothing to implement and is the difference between a tool that is narrow and one that is wrong.

### Scanning: the four rules

**Both strands, always.** A site matches on the forward strand or the reverse complement. A scanner that checks one strand silently misses half the genome and reports clean uniqueness it has not established. Every hit records which strand it was found on.

**Ambiguity codes expand in the query only.** An IUPAC code in a signature matches any base in its set at no mismatch cost; `N` matches all four. An ambiguity code in the *genome* — assembly gaps are full of `N` — counts as a mismatch unless the query base is identical. Stated explicitly because the opposite convention is equally defensible and the two give different answers.

**Overlapping matches all count.** Report every start position, not a deduplicated count. Positions go in the fact, so a reviewer can look at them.

**Bulges are not searched.** v0 does substitutions only. This appears in UNKNOWN, not in a footnote.

```
f1  sequence_occurrences                               (computed, n/a)
      site      0
      corpus    GRCh38.p14   sha256:9f2c...
      algorithm locus-scan/0.1   substitutions only, both strands
      tolerance 0
      value     0
      hits      []
```

### Organism axis resolution

Axis O is relative to the target's organism, so it needs a function, not a vocabulary. Given a fact annotated `@measured(mouse)` and a target declaring `organism human`:

```
resolve(fact_organism, target_organism):
  fact_organism is absent        -> n/a        // header says organism_independent
  fact_organism == target        -> same
  pair in relations table        -> related
  otherwise                      -> distant
```

The relations table ships as data in the registry, one row per ordered pair, each row itself graded. `(mouse, human) -> related` is an editable claim somebody can argue with, not a constant in the source. A pair absent from the table resolves to `distant`, never to `related` by assumption.

`n/a` is declared by the header, not inferred. Capsid capacity is organism-independent; tropism never is.

### Tissue vocabulary

Free text for cell types is the problem the field already solved badly: most single-cell annotation used uncontrolled naming, which made cross-searching impossible ([Nature Cell Biology](https://www.nature.com/articles/s41556-021-00787-7)). v0 does not invent a vocabulary.

Tissue terms resolve against the **Cell Ontology** for cell types and **Uberon** for anatomical structures; CL covers over 2,700 cell type classes and links to Uberon by part-of relationships, and it is what the Human Cell Atlas, HuBMAP, BICCN, cellxgene and ENCODE annotate with ([OBO Foundry](https://obofoundry.org/ontology/cl.html)).

A residence term carries both forms: the readable path the author wrote and the resolved identifier. An unresolvable term is a hard error listing the nearest matches.

```
in [ neuron.sensory.sacral ]      // author writes this
   -> { path: "neuron.sensory.sacral", id: "CL:0000101", vocab: "cl-2026-09" }
```

The vocabulary version goes in the lockfile. Ontologies are revised, terms get obsoleted, and a build that cannot say which release it resolved against is not reproducible.

### Registry schema

```json
{
  "id": "vendor_x/AAV9",
  "kind": "vehicle",
  "capacity": { "nominal_kb": 4.7, "soft_limit_kb": 5.2, "grade": {"m":"measured","o":null} },
  "accepts": ["transgene", "nuclease"],
  "requires": [],
  "tropism": [
    { "term": "UBERON:0002107", "level": "high",
      "grade": {"m":"measured","o":"human"}, "source": "doi:..." }
  ],
  "redosable": { "value": false, "grade": {"m":"measured","o":null} },
  "provenance": { "extracted_by": null, "reviewed_by": "mk", "date": "2026-11-22" }
}
```

`"o": null` means organism-independent and is the only way to get `n/a`. Every value-bearing field carries a grade; the validator rejects the file otherwise, and that rejection is commit 1's first test.

### Lexical rules

Free-form; newlines are insignificant except to terminate a `//` comment. Keywords are lowercase and reserved. Identifiers are case-sensitive. Sequences are case-insensitive and normalise to upper case. UTF-8 source, no string literals, no escapes, no block comments. Numbers are non-negative integers, except `kb` values which are decimals with at most two places.

### CLI and diagnostics

```
locus build <file>          0 ok, 1 refused assertion, 2 error
locus check <file>          parse and static checks only
locus why <assertion>       derivation walk
locus test [path]           0 pass, 1 fixture failure, 2 error
locus diff <lockA> <lockB>  assertion status changes
locus registry validate     0 valid, 2 invalid
```

Every diagnostic carries a stable code, a file-line-column span, and a one-line message. `--json` emits them as an array, because a tool whose product is refusals needs its refusals to be machine-readable.

```
E201  design.locus:7:3  tolerance is mandatory; no default exists
E305  design.locus:4:14 ambiguous vehicle `AAV9`: vendor_x/AAV9, lab_y/AAV9
R101  eliminates_reservoir refused: 3 reasons (locus why)
```

Codes are grouped: `E1xx` lexical and syntax, `E2xx` static checks, `E3xx` resolution, `E4xx` schema, `R1xx` refusals. A refusal is not an error — it exits 1, not 2, and a build that refuses an assertion still writes its manifest.
