import { SyntaxNode } from "web-tree-sitter";
import { TreeUtils } from "../util/treeUtils";
import { Utils } from "../util/utils";
import { Diagnostic, Diagnostics, error } from "./diagnostics";
import { ISourceFile } from "./forest";
import { IProgram } from "./program";

type Union = {
  alts: CanCtor[];
  numAlts: number;
};

type LiteralType = "Int" | "Str" | "Chr";

type Literal = {
  type: "Literal";
  literalType: LiteralType;
  value: string;
};

type Anything = {
  type: "Anything";
};

type Ctor = {
  type: "Ctor";
  union: Union;
  name: string;
  args: Pattern[];
};

type Pattern = Anything | Literal | Ctor;

const Anything: Pattern = { type: "Anything" };
const Literal = (literalType: LiteralType, value: string): Pattern => ({
  type: "Literal",
  literalType,
  value,
});
const Ctor = (union: Union, name: string, args: Pattern[]): Pattern => ({
  type: "Ctor",
  union,
  name,
  args,
});

type CanCtor = {
  name: string;
  arity: number;
};

function nodeToCanCtor(node: SyntaxNode): CanCtor {
  return {
    name: node.firstNamedChild!.text,
    arity: node.namedChildren.slice(1).length,
  };
}

const unitName = "#0";
const pairName = "#2";
const tripleName = "#3";
const consName = "::";
const nilName = "[]";

const unit: Union = { alts: [{ name: unitName, arity: 0 }], numAlts: 1 };
const pair: Union = { alts: [{ name: pairName, arity: 2 }], numAlts: 1 };
const triple: Union = { alts: [{ name: tripleName, arity: 3 }], numAlts: 1 };
const list: Union = {
  alts: [
    { name: nilName, arity: 0 },
    { name: consName, arity: 2 },
  ],
  numAlts: 2,
};

const nil: Pattern = Ctor(list, nilName, []);

export class PatternMatches {
  constructor(private program: IProgram, private sourceFile: ISourceFile) {}

  public static check(
    region: SyntaxNode,
    patterns: SyntaxNode[],
    program: IProgram,
  ): Diagnostic[] {
    return new PatternMatches(
      program,
      program.getSourceFile(patterns[0].tree.uri)!,
    ).checkPatterns(region, patterns);
  }

  public static missing(patterns: SyntaxNode[], program: IProgram): string[] {
    return new PatternMatches(
      program,
      program.getSourceFile(patterns[0].tree.uri)!,
    ).getMissing(patterns);
  }

  private getMissing(patterns: SyntaxNode[]): string[] {
    const result = this.toNonRedundantRows(patterns[0], patterns);

    if (!Array.isArray(result)) {
      return [];
    } else {
      return this.isExhaustive(result, 1).map((p) =>
        patternToDoc(p[0], "Unambiguous"),
      );
    }
  }

  private checkPatterns(
    region: SyntaxNode,
    patterns: SyntaxNode[],
  ): Diagnostic[] {
    const result = this.toNonRedundantRows(region, patterns);

    if (!Array.isArray(result)) {
      return [result];
    } else {
      const badPatterns = this.isExhaustive(result, 1);
      if (badPatterns.length === 0) {
        return [];
      } else {
        // TODO: Handle other incomplete patterns
        const badPatternsText = badPatterns.map((p) =>
          patternToDoc(p[0], "Unambiguous"),
        );
        return [
          error(
            region,
            Diagnostics.IncompleteCasePattern(badPatternsText.length),
            ...badPatternsText,
          ),
        ];
      }
    }
  }

  private isExhaustive(matrix: Pattern[][], n: number): Pattern[][] {
    if (matrix.length === 0) {
      return [replicate(Anything, n)];
    } else {
      if (n === 0) {
        return [];
      } else {
        const ctors = this.collectCtors(matrix);
        const numSeen = ctors.size;

        if (numSeen === 0) {
          return this.isExhaustive(
            matrix
              .map(this.specializeRowByAnything.bind(this))
              .filter(Utils.notUndefined.bind(this)),
            n - 1,
          ).map((result) => [Anything, ...result]);
        } else {
          const alts = findMin(ctors)[1];

          if (numSeen < alts.numAlts) {
            const missing: Pattern[] = alts.alts
              .map((alt) => isMissing(alts, ctors, alt))
              .filter(Utils.notUndefined.bind(this));
            return this.isExhaustive(
              matrix
                .map(this.specializeRowByAnything.bind(this))
                .filter(Utils.notUndefined.bind(this)),
              n - 1,
            ).flatMap((ex) => missing.map((m) => [m, ...ex]));
          } else {
            const isAltExhaustive = (ctor: CanCtor): Pattern[][] => {
              return this.isExhaustive(
                matrix
                  .map((row) =>
                    this.specializeRowByCtor(ctor.name, ctor.arity, row),
                  )
                  .filter(Utils.notUndefined.bind(this)),
                ctor.arity + n - 1,
              ).map((patterns) =>
                recoverCtor(alts, ctor.name, ctor.arity, patterns),
              );
            };

            return alts.alts.flatMap(isAltExhaustive);
          }
        }
      }
    }
  }

  private toNonRedundantRows(
    region: SyntaxNode,
    patterns: SyntaxNode[],
  ): Pattern[][] | Diagnostic {
    return this.toSimplifiedUsefulRows(region, [], patterns);
  }

  private toSimplifiedUsefulRows(
    overalRegion: SyntaxNode,
    checkedRows: Pattern[][],
    uncheckedPatterns: SyntaxNode[],
  ): Pattern[][] | Diagnostic {
    if (uncheckedPatterns.length === 0) {
      return checkedRows;
    } else {
      const nextRow = [this.simplify(uncheckedPatterns[0])];
      if (this.isUseful(checkedRows, nextRow)) {
        return this.toSimplifiedUsefulRows(
          overalRegion,
          [nextRow, ...checkedRows],
          uncheckedPatterns.slice(1),
        );
      } else {
        return error(
          uncheckedPatterns[0],
          Diagnostics.RedundantPattern,
          checkedRows.length + 1,
        );
      }
    }
  }

  private isUseful(matrix: Pattern[][], vector: Pattern[]): boolean {
    if (matrix.length === 0) {
      return true;
    } else {
      if (vector.length === 0) {
        return false;
      } else {
        const patterns = vector.slice(1);
        switch (vector[0].type) {
          case "Ctor": {
            const args = vector[0].args;
            const name = vector[0].name;
            return this.isUseful(
              matrix
                .map((row) => this.specializeRowByCtor(name, args.length, row))
                .filter(Utils.notUndefined.bind(this)),
              [...args, ...patterns],
            );
          }

          case "Anything": {
            const alts = this.isComplete(matrix);

            if (!alts) {
              return this.isUseful(
                matrix
                  .map(this.specializeRowByAnything.bind(this))
                  .filter(Utils.notUndefined.bind(this)),
                patterns,
              );
            } else {
              return alts.some((alt) => {
                return this.isUseful(
                  matrix
                    .map((row) =>
                      this.specializeRowByCtor(alt.name, alt.arity, row),
                    )
                    .filter(Utils.notUndefined.bind(this)),
                  [...replicate(Anything, alt.arity), ...patterns],
                );
              });
            }
          }

          case "Literal": {
            const literal = vector[0];
            return this.isUseful(
              matrix
                .map((row) => this.specializeRowByLiteral(literal, row))
                .filter(Utils.notUndefined.bind(this)),
              patterns,
            );
          }
        }
      }
    }
  }

  private specializeRowByCtor(
    name: string,
    arity: number,
    row: Pattern[],
  ): Pattern[] | undefined {
    const patterns = row.slice(1);
    switch (row[0].type) {
      case "Ctor":
        if (row[0].name === name) {
          return [...row[0].args, ...patterns];
        } else {
          return;
        }

      case "Anything":
        return [...replicate(Anything, arity), ...patterns];

      default:
        throw new Error("Compiler bug");
    }
  }

  private specializeRowByLiteral(
    literal: Literal,
    row: Pattern[],
  ): Pattern[] | undefined {
    const patterns = row.slice(1);
    switch (row[0].type) {
      case "Literal":
        if (
          row[0].literalType === literal.literalType &&
          row[0].value === literal.value
        ) {
          return patterns;
        } else {
          return;
        }

      case "Anything":
        return patterns;

      default:
        throw new Error("Compiler bug");
    }
  }

  private specializeRowByAnything(row: Pattern[]): Pattern[] | undefined {
    if (row.length === 0) {
      return;
    }

    switch (row[0].type) {
      case "Ctor":
      case "Literal":
        return;

      case "Anything":
        return row.slice(1);
    }
  }

  private isComplete(matrix: Pattern[][]): CanCtor[] | undefined {
    const ctors = this.collectCtors(matrix);
    const numSeen = ctors.size;

    if (numSeen === 0) {
      return;
    } else {
      const union = findMin(ctors)[1];

      if (numSeen === union.numAlts) {
        return union.alts;
      } else {
        return;
      }
    }
  }

  private collectCtors(matrix: Pattern[][]): Map<string, Union> {
    const ctors = new Map<string, Union>();
    matrix.forEach((row) => {
      if (row[0]?.type === "Ctor") {
        ctors.set(row[0].name, row[0].union);
      }
    });
    return ctors;
  }

  private cons(head: SyntaxNode, tail: Pattern): Pattern {
    return Ctor(list, consName, [this.simplify(head), tail]);
  }

  private simplify(pattern: SyntaxNode): Pattern {
    const patternAs = pattern.childForFieldName("patternAs");
    if (patternAs) {
      return this.simplify(patternAs);
    }

    switch (pattern.type) {
      case "anything_pattern":
      case "lower_pattern":
      case "record_pattern":
        return Anything;

      case "unit_expr":
        return Ctor(unit, unitName, []);

      case "tuple_pattern": {
        const patterns = pattern.children
          .filter((n) => n.type === "pattern")
          .map((n) => n.childForFieldName("child")!);

        if (patterns.length === 3) {
          return Ctor(
            triple,
            tripleName,
            patterns.map(this.simplify.bind(this)),
          );
        } else {
          return Ctor(pair, pairName, patterns.map(this.simplify.bind(this)));
        }
      }

      case "union_pattern":
      case "nullary_constructor_argument_pattern": {
        const ctor =
          pattern.childForFieldName("constructor")?.lastNamedChild ??
          pattern.firstNamedChild!;
        const definition = this.program
          .getTypeChecker()
          .findDefinition(ctor, this.sourceFile);

        const unionVariants = definition.symbol
          ? TreeUtils.findParentOfType(
              "type_declaration",
              definition.symbol.node,
            )
              ?.namedChildren.filter((n) => n.type === "union_variant")
              .map(nodeToCanCtor) ?? []
          : [];

        const numAlts = unionVariants.length;

        return Ctor(
          { alts: unionVariants, numAlts },
          ctor.text,
          pattern.namedChildren.slice(1).map(this.simplify.bind(this)),
        );
      }

      case "list_pattern":
        return foldr(
          this.cons.bind(this),
          nil,
          pattern.namedChildren.filter((n) => n.type === "pattern"),
        );

      case "cons_pattern": {
        // TODO: Fix how cons is parsed
        const patterns = pattern.namedChildren.filter(
          (n) =>
            n.type.includes("pattern") ||
            n.type.includes("constant") ||
            n.type === "unit_expr",
        );
        return this.cons(patterns[0], this.simplify(patterns[1]));
      }

      case "pattern":
        return this.simplify(pattern.childForFieldName("child")!);

      case "char_constant_expr":
        return Literal("Chr", pattern.text);

      case "string_constant_expr":
        return Literal("Str", pattern.text);

      case "number_constant_expr":
        return Literal("Int", pattern.text);

      default:
        throw new Error("Unknown pattern type");
    }
  }
}

function isMissing(
  union: Union,
  ctors: Map<string, Union>,
  ctor: CanCtor,
): Pattern | undefined {
  if (ctors.has(ctor.name)) {
    return;
  } else {
    return Ctor(union, ctor.name, replicate(Anything, ctor.arity));
  }
}

function recoverCtor(
  union: Union,
  name: string,
  arity: number,
  patterns: Pattern[],
): Pattern[] {
  const args = patterns.slice(0, arity);
  const rest = patterns.slice(arity);

  return [Ctor(union, name, args), ...rest];
}

function findMin(ctors: Map<string, Union>): [string, Union] {
  return Array.from(ctors.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )[0];
}

function patternToDoc(
  pattern: Pattern,
  context: "Arg" | "Head" | "Unambiguous",
): string {
  const result = delist(pattern, []);

  if (result.type === "NonList") {
    if (result.pattern.type === "Anything") {
      return "_";
    } else if (result.pattern.type === "Literal") {
      return result.pattern.value;
    } else {
      if (result.pattern.name === "#0") {
        return "()";
      } else if (result.pattern.name === "#2") {
        return `( ${patternToDoc(
          result.pattern.args[0],
          "Unambiguous",
        )}, ${patternToDoc(result.pattern.args[1], "Unambiguous")} )`;
      } else if (result.pattern.name === "#3") {
        return `( ${patternToDoc(
          result.pattern.args[0],
          "Unambiguous",
        )}, ${patternToDoc(
          result.pattern.args[1],
          "Unambiguous",
        )}, ${patternToDoc(result.pattern.args[2], "Unambiguous")} )`;
      } else {
        const ctorDoc = `${result.pattern.name}${
          result.pattern.args.length > 0 ? " " : ""
        }${result.pattern.args
          .map((arg) => patternToDoc(arg, "Arg"))
          .join(" ")}`;

        if (context === "Arg" && result.pattern.args.length > 0) {
          return `(${ctorDoc})`;
        } else {
          return ctorDoc;
        }
      }
    }
  } else if (result.type === "FiniteList") {
    if (result.entries.length === 0) {
      return "[]";
    } else {
      return `[${result.entries
        .map((entry) => patternToDoc(entry, "Unambiguous"))
        .join(", ")}]`;
    }
  } else {
    const consDoc = foldr(
      (hd, tl) => `${patternToDoc(hd, "Head")} :: ${tl}`,
      patternToDoc(result.finalPattern, "Unambiguous"),
      result.conses,
    );

    if (context === "Unambiguous") {
      return consDoc;
    } else {
      return `(${consDoc})`;
    }
  }
}

type Structure =
  | { type: "FiniteList"; entries: Pattern[] }
  | { type: "Conses"; conses: Pattern[]; finalPattern: Pattern }
  | { type: "NonList"; pattern: Pattern };

function delist(pattern: Pattern, revEntries: Pattern[]): Structure {
  if (pattern.type === "Ctor" && pattern.name === "[]") {
    return { type: "FiniteList", entries: revEntries };
  } else if (pattern.type === "Ctor" && pattern.name === "::") {
    return delist(pattern.args[1], [pattern.args[0], ...revEntries]);
  } else {
    if (revEntries.length === 0) {
      return { type: "NonList", pattern };
    } else {
      return {
        type: "Conses",
        conses: revEntries.reverse(),
        finalPattern: pattern,
      };
    }
  }
}

function replicate<T>(value: T, length: number): T[] {
  return Array.from(Array(length)).map(() => value);
}

function foldl<A, B>(func: (b: B, a: A) => B, start: B, array: A[]): B {
  return array.reduce(func, start);
}

function foldr<A, B>(func: (a: A, b: B) => B, start: B, array: A[]): B {
  return array.reduceRight((prev, cur) => func(cur, prev), start);
}
