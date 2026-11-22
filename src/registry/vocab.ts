/**
 * Tissue vocabulary resolution against Cell Ontology (CL) and Uberon.
 *
 * A residence term carries both forms: the readable path the author wrote
 * and the resolved identifier. An unresolvable term is a hard error listing
 * the nearest matches.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface VocabTerm {
  id: string;
  name: string;
  parents: string[];
  note?: string;
}

export interface VocabFile {
  version: string;
  source: string;
  terms: Record<string, VocabTerm>;
}

export interface ResolvedTissue {
  path: string;        // what the author wrote
  id: string;          // e.g. "CL:0000101"
  vocab: string;       // e.g. "cl-2026-09"
  name: string;        // human-readable ontology name
}

export interface VocabError {
  code: string;
  term: string;
  message: string;
  nearestMatches: string[];
}

/** Levenshtein distance for fuzzy matching. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

export class VocabResolver {
  private vocabs: VocabFile[] = [];
  private allTerms: Map<string, { term: VocabTerm; vocab: string }> = new Map();

  constructor(vocabDir?: string) {
    const dir = vocabDir ?? resolvePath(__dirname, "../../registry/vocab");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const content = JSON.parse(readFileSync(resolvePath(dir, file), "utf-8")) as VocabFile;
      this.vocabs.push(content);
      for (const [key, term] of Object.entries(content.terms)) {
        this.allTerms.set(key, { term, vocab: content.version });
      }
    }
  }

  /** Get all loaded vocab versions for the lockfile. */
  vocabVersions(): Record<string, string> {
    const versions: Record<string, string> = {};
    for (const v of this.vocabs) {
      versions[v.source] = v.version;
    }
    return versions;
  }

  /** Resolve a single tissue path. Returns resolved term or error. */
  resolve(authorPath: string): ResolvedTissue | VocabError {
    // Direct lookup
    const entry = this.allTerms.get(authorPath);
    if (entry) {
      return {
        path: authorPath,
        id: entry.term.id,
        vocab: entry.vocab,
        name: entry.term.name,
      };
    }

    // Try case-insensitive
    const lower = authorPath.toLowerCase();
    for (const [key, entry] of this.allTerms) {
      if (key.toLowerCase() === lower) {
        return {
          path: authorPath,
          id: entry.term.id,
          vocab: entry.vocab,
          name: entry.term.name,
        };
      }
    }

    // No match — find nearest by Levenshtein
    const candidates = [...this.allTerms.keys()];
    const scored = candidates
      .map((c) => ({ key: c, dist: levenshtein(authorPath.toLowerCase(), c.toLowerCase()) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);

    return {
      code: "E301",
      term: authorPath,
      message: `unresolvable tissue term '${authorPath}'`,
      nearestMatches: scored.map((s) => `${s.key} (${this.allTerms.get(s.key)!.term.id})`),
    };
  }

  /** Resolve all tissue paths in a residence. Returns resolved list or errors. */
  resolveAll(paths: string[]): { resolved: ResolvedTissue[]; errors: VocabError[] } {
    const resolved: ResolvedTissue[] = [];
    const errors: VocabError[] = [];

    for (const path of paths) {
      const result = this.resolve(path);
      if ("id" in result) {
        resolved.push(result);
      } else {
        errors.push(result);
      }
    }

    return { resolved, errors };
  }
}
