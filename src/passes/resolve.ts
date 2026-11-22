/**
 * Pass 1: resolve
 *
 * Parse, run static checks, and emit the target node plus any
 * author-asserted facts at grade (asserted, declared organism).
 */

import { lex } from "../grammar/lexer.ts";
import { parse, type ParseError } from "../grammar/parser.ts";
import { staticChecks } from "../grammar/checks.ts";
import { VocabResolver, type ResolvedTissue } from "../registry/vocab.ts";
import type { Target, Signatures, Residence, Intent } from "../ir/types.ts";
import type { Fact } from "../ir/grade.ts";
import type { Grade } from "../ir/grade.ts";

export interface ResolveResult {
  target: Target;
  intent: Intent;
  facts: Fact[];
  resolvedTissues: ResolvedTissue[];
  vocabVersions: Record<string, string>;
  errors: ParseError[];
}

export function resolve(source: string, vocabDir?: string): ResolveResult | { errors: ParseError[] } {
  const { tokens, errors: lexErrors } = lex(source);
  if (lexErrors.length > 0) {
    return {
      errors: lexErrors.map((e) => ({
        code: e.code,
        line: e.line,
        col: e.col,
        message: e.message,
      })),
    };
  }

  const { program, errors: parseErrors } = parse(tokens);
  if (parseErrors.length > 0 || !program) {
    return { errors: parseErrors };
  }

  if (program.targets.length === 0) {
    return { errors: [{ code: "E200", line: 1, col: 1, message: "no target defined" }] };
  }

  const checkErrors = staticChecks(program.targets);
  if (checkErrors.length > 0) {
    return { errors: checkErrors };
  }

  // For v0 we handle the first (and only) target
  const pt = program.targets[0]!;

  // Resolve tissue vocabulary
  const vocab = new VocabResolver(vocabDir);
  let resolvedTissues: ResolvedTissue[] = [];

  if (pt.residence && pt.residence.tissues.length > 0) {
    const { resolved, errors: vocabErrors } = vocab.resolveAll(pt.residence.tissues);
    if (vocabErrors.length > 0) {
      return {
        errors: vocabErrors.map((e) => ({
          code: e.code,
          line: pt.line,
          col: pt.col,
          message: `${e.message}; nearest: ${e.nearestMatches.slice(0, 3).join(", ")}`,
        })),
      };
    }
    resolvedTissues = resolved;
  }

  const target: Target = {
    name: pt.name,
    organism: pt.organism!,
    tolerance: pt.tolerance!,
    signatures: pt.signatures ?? { combinator: null, sites: [] },
    residence: pt.residence,
  };

  const facts: Fact[] = [];

  // Residence as an asserted fact
  if (target.residence) {
    facts.push({
      id: `f_res`,
      claim: "residence_exhaustive",
      subject: { tissues: target.residence.tissues, resolved: resolvedTissues.map((r) => r.id) },
      value: target.residence.exhaustive,
      grade: target.residence.grade,
      from: [],
    });
  }

  return {
    target,
    intent: program.statement,
    facts,
    resolvedTissues,
    vocabVersions: vocab.vocabVersions(),
    errors: [],
  };
}
