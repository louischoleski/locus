/**
 * Recursive descent parser for Locus v0.
 *
 * program      = { target } , statement ;
 * target       = "target" , ident , "{" , { field } , "}" ;
 * field        = signatures | residence | organism | tolerance ;
 * signatures   = "signatures" , ( sequence | combinator ) ;
 * combinator   = ( "all" | "any" ) , "[" , sequence , { "," , sequence } , "]" ;
 * residence    = "in" , [ "only" ] , tissues , [ grade ] ;
 * tissues      = tissue | "[" , tissue , { "," , tissue } , "]" ;
 * tissue       = ident , { "." , ident } ;
 * organism     = "organism" , ident ;
 * tolerance    = "tolerance" , integer ;
 * statement    = "excise" , ident ;
 * grade        = "@" , method , [ "(" , ident , ")" ] ;
 * method       = "measured" | "inferred" | "asserted" ;
 */

import type { Token } from "./lexer.ts";
import type { Grade } from "../ir/grade.ts";
import type { Target, Signatures, Residence, Intent } from "../ir/types.ts";

export interface ParsedProgram {
  targets: ParsedTarget[];
  statement: Intent;
}

export interface ParsedTarget {
  name: string;
  organism: string | null;
  tolerance: number | null;
  signatures: Signatures | null;
  residence: Residence | null;
  line: number;
  col: number;
}

export interface ParseError {
  code: string;
  line: number;
  col: number;
  message: string;
}

export function parse(tokens: Token[]): { program: ParsedProgram | null; errors: ParseError[] } {
  const errors: ParseError[] = [];
  let pos = 0;

  function cur(): Token {
    return tokens[pos]!;
  }

  function eat(kind: Token["kind"], value?: string): Token | null {
    const t = cur();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      errors.push({
        code: "E101",
        line: t.line,
        col: t.col,
        message: `expected ${value ? `'${value}'` : kind}, got '${t.value}'`,
      });
      return null;
    }
    pos++;
    return t;
  }

  function expectKw(value: string): Token | null {
    return eat("keyword", value);
  }

  function parseGrade(): Grade | null {
    if (cur().kind !== "at") return null;
    pos++; // consume @
    const method = cur();
    if (method.kind !== "keyword" || !["measured", "inferred", "asserted"].includes(method.value)) {
      errors.push({
        code: "E102",
        line: method.line,
        col: method.col,
        message: `expected method (measured|inferred|asserted), got '${method.value}'`,
      });
      return null;
    }
    pos++;

    let organism: string | null = null;
    if (cur().kind === "lparen") {
      pos++; // (
      const org = eat("ident");
      if (org) organism = org.value;
      eat("rparen");
    }

    return {
      m: method.value as Grade["m"],
      o: organism ? (organism as Grade["o"]) : ("unknown" as Grade["o"]),
    };
  }

  function parseTissue(): string {
    let path = cur().value;
    pos++;
    while (cur().kind === "dot") {
      pos++; // .
      path += "." + cur().value;
      pos++;
    }
    return path;
  }

  function parseTissues(): string[] {
    if (cur().kind === "lbracket") {
      pos++; // [
      const tissues = [parseTissue()];
      while (cur().kind === "comma") {
        pos++;
        tissues.push(parseTissue());
      }
      eat("rbracket");
      return tissues;
    }
    return [parseTissue()];
  }

  function parseSequence(): string | null {
    const t = cur();
    if (t.kind === "sequence") {
      pos++;
      return t.value;
    }
    // Single IUPAC letter identifiers that are also valid sequences
    if (t.kind === "ident" && /^[ACGTRYSWKMBDHVNacgtryswkmbdhvn]+$/.test(t.value) && t.value.length > 1) {
      pos++;
      return t.value.toUpperCase();
    }
    errors.push({ code: "E103", line: t.line, col: t.col, message: `expected IUPAC sequence, got '${t.value}'` });
    pos++;
    return null;
  }

  function parseSignatures(): Signatures | null {
    expectKw("signatures");
    const t = cur();

    if (t.kind === "keyword" && (t.value === "all" || t.value === "any")) {
      const combinator = t.value as "all" | "any";
      pos++;
      eat("lbracket");
      const sites: string[] = [];
      const seq = parseSequence();
      if (seq) sites.push(seq);
      while (cur().kind === "comma") {
        pos++;
        const s = parseSequence();
        if (s) sites.push(s);
      }
      eat("rbracket");
      return { combinator, sites };
    }

    // Single sequence
    const seq = parseSequence();
    if (seq) return { combinator: null, sites: [seq] };
    return null;
  }

  function parseResidence(): Residence | null {
    expectKw("in");
    let exhaustive = false;
    if (cur().kind === "keyword" && cur().value === "only") {
      exhaustive = true;
      pos++;
    }
    const tissues = parseTissues();
    const grade = parseGrade();
    return {
      tissues,
      exhaustive,
      grade: grade ?? { m: "asserted" as Grade["m"], o: "unknown" as Grade["o"] },
    };
  }

  function parseTarget(): ParsedTarget {
    const startTok = cur();
    expectKw("target");
    const nameTok = eat("ident");
    const name = nameTok?.value ?? "unknown";
    eat("lbrace");

    const target: ParsedTarget = {
      name,
      organism: null,
      tolerance: null,
      signatures: null,
      residence: null,
      line: startTok.line,
      col: startTok.col,
    };

    while (cur().kind !== "rbrace" && cur().kind !== "eof") {
      const kw = cur();
      if (kw.kind === "keyword") {
        switch (kw.value) {
          case "signatures":
            target.signatures = parseSignatures();
            break;
          case "in":
            target.residence = parseResidence();
            break;
          case "organism": {
            pos++;
            const org = eat("ident");
            if (org) target.organism = org.value;
            break;
          }
          case "tolerance": {
            pos++;
            const tol = eat("integer");
            if (tol) target.tolerance = parseInt(tol.value, 10);
            break;
          }
          default:
            errors.push({ code: "E104", line: kw.line, col: kw.col, message: `unexpected keyword '${kw.value}'` });
            pos++;
        }
      } else {
        errors.push({ code: "E105", line: kw.line, col: kw.col, message: `expected field keyword, got '${kw.value}'` });
        pos++;
      }
    }
    eat("rbrace");
    return target;
  }

  // program = { target } , statement ;
  const targets: ParsedTarget[] = [];
  while (cur().kind === "keyword" && cur().value === "target") {
    targets.push(parseTarget());
  }

  // statement = "excise" , ident ;
  let statement: Intent | null = null;
  if (cur().kind === "keyword" && cur().value === "excise") {
    pos++;
    const tgt = eat("ident");
    statement = { kind: "excise", target: tgt?.value ?? "unknown" };
  } else if (cur().kind !== "eof") {
    errors.push({ code: "E106", line: cur().line, col: cur().col, message: `expected 'excise' statement, got '${cur().value}'` });
  }

  if (!statement) {
    errors.push({ code: "E106", line: cur().line, col: cur().col, message: "missing statement" });
    return { program: null, errors };
  }

  if (errors.length > 0) return { program: null, errors };
  return { program: { targets, statement }, errors };
}
