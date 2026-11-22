/**
 * Lexer for the Locus v0 language.
 *
 * Tokens: keywords, identifiers, integers, sequences (IUPAC),
 * punctuation ({, }, [, ], (, ), ,, @), and comments (//).
 */

export type TokenKind =
  | "keyword"
  | "ident"
  | "integer"
  | "sequence"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "lparen"
  | "rparen"
  | "comma"
  | "at"
  | "dot"
  | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
}

export interface LexError {
  code: string;
  line: number;
  col: number;
  message: string;
}

const KEYWORDS = new Set([
  "target",
  "signatures",
  "all",
  "any",
  "in",
  "only",
  "organism",
  "tolerance",
  "excise",
  "measured",
  "inferred",
  "asserted",
]);

const IUPAC = new Set("ACGTRYSWKMBDHVNacgtryswkmbdhvn".split(""));
const PUNCT: Record<string, TokenKind> = {
  "{": "lbrace",
  "}": "rbrace",
  "[": "lbracket",
  "]": "rbracket",
  "(": "lparen",
  ")": "rparen",
  ",": "comma",
  "@": "at",
  ".": "dot",
};

export function lex(source: string): { tokens: Token[]; errors: LexError[] } {
  const tokens: Token[] = [];
  const errors: LexError[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  function advance(): string {
    const ch = source[i]!;
    i++;
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  }

  function peek(): string | undefined {
    return source[i];
  }

  while (i < source.length) {
    const ch = peek()!;
    const startLine = line;
    const startCol = col;

    // Whitespace
    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // Comment
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && peek() !== "\n") advance();
      continue;
    }

    // Punctuation
    if (ch in PUNCT) {
      tokens.push({ kind: PUNCT[ch]!, value: ch, line: startLine, col: startCol });
      advance();
      continue;
    }

    // Identifier or keyword — starts with a letter or _
    if (/[a-zA-Z_]/.test(ch)) {
      let word = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(peek()!)) {
        word += advance();
      }

      // Check if it's a pure IUPAC sequence (all chars in IUPAC set, length > 1, not a keyword)
      const isAllIupac = word.split("").every((c) => IUPAC.has(c));
      if (isAllIupac && word.length > 1 && !KEYWORDS.has(word.toLowerCase())) {
        tokens.push({ kind: "sequence", value: word.toUpperCase(), line: startLine, col: startCol });
      } else if (KEYWORDS.has(word)) {
        tokens.push({ kind: "keyword", value: word, line: startLine, col: startCol });
      } else {
        tokens.push({ kind: "ident", value: word, line: startLine, col: startCol });
      }
      continue;
    }

    // Integer
    if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < source.length && /[0-9]/.test(peek()!)) {
        num += advance();
      }
      tokens.push({ kind: "integer", value: num, line: startLine, col: startCol });
      continue;
    }

    errors.push({ code: "E100", line: startLine, col: startCol, message: `unexpected character: '${ch}'` });
    advance();
  }

  tokens.push({ kind: "eof", value: "", line, col });
  return { tokens, errors };
}
