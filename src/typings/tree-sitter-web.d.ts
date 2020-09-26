/* eslint-disable @typescript-eslint/naming-convention */
import "web-tree-sitter";

declare module "web-tree-sitter" {
  export interface SyntaxNode {
    id: number;
  }

  interface QueryResult {
    pattern: number;
    captures: { name: string; node: SyntaxNode }[];
  }

  interface PredicateResult {
    operator: string;
    operands: { name: string; type: string }[];
  }

  interface Query {
    captureNames: string[];

    delete(): void;
    matches(
      node: SyntaxNode,
      startPosition?: Point,
      endPosition?: Point,
    ): QueryResult[];
    captures(
      node: SyntaxNode,
      startPosition?: Point,
      endPosition?: Point,
    ): QueryResult[];

    predicatesForPattern(patternIndex: number): PredicateResult[];
  }

  interface Language {
    query(source: string): Query;
  }
}
