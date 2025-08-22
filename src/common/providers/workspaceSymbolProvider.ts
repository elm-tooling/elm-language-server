import { container } from "tsyringe";
import {
  Connection,
  SymbolInformation,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { IProgram } from "../../compiler/program";
import { SymbolInformationTranslator } from "../util/symbolTranslator";

type SymbolMatch = {
  position: number;
  lengthDifference: number;
  casingDifference: number;
};

type MatchingSymbol = {
  match: SymbolMatch;
  info: SymbolInformation;
};

export class WorkspaceSymbolProvider {
  private readonly connection: Connection;
  private readonly programs: IProgram[];

  constructor() {
    this.programs = container.resolve<IProgram[]>("ElmWorkspaces");
    this.connection = container.resolve<Connection>("Connection");
    this.connection.onWorkspaceSymbol(this.workspaceSymbolRequest);
  }

  private workspaceSymbolRequest = (
    param: WorkspaceSymbolParams,
  ): SymbolInformation[] | null | undefined => {
    this.connection.console.info(`Workspace Symbols were requested`);
    const symbolInformationMap: Map<string, MatchingSymbol[]> = new Map<
      string,
      MatchingSymbol[]
    >();

    this.programs.forEach((program) => {
      program.getSourceFiles().forEach((sourceFile) => {
        if (!sourceFile.writeable) {
          return;
        }
        const traverse: (node: SyntaxNode) => void = (
          node: SyntaxNode,
        ): void => {
          const symbolInformation =
            SymbolInformationTranslator.translateNodeToSymbolInformation(
              sourceFile.uri,
              node,
            );

          if (symbolInformation) {
            const symbolMatch = this.matchInSymbol(
              param.query,
              symbolInformation.name,
            );
            if (symbolMatch !== null) {
              const current = symbolInformationMap.get(sourceFile.uri) || [];
              symbolInformationMap.set(sourceFile.uri, [
                ...current,
                { match: symbolMatch, info: symbolInformation },
              ]);
            }
          }

          for (const childNode of node.namedChildren) {
            traverse(childNode);
          }
        };

        // skip URIs already traversed in a previous Elm workspace
        if (sourceFile && !symbolInformationMap.get(sourceFile.uri)) {
          traverse(sourceFile.tree.rootNode);
        }
      });
    });

    return Array.from(symbolInformationMap.values())
      .flat()
      .sort(this.symbolMatchSorter)
      .map((ms) => ms.info);
  };

  // Determines if typed string matches a symbol
  // name. Characters must appear in order.
  // Returns a SymbolMatch on success and null on failure.
  private matchInSymbol(
    typedValue: string,
    symbolName: string,
  ): SymbolMatch | null {
    const typedLower = typedValue.toLocaleLowerCase();
    const symbolLower = symbolName.toLocaleLowerCase();
    const typedLength = typedLower.length;
    const symbolLength = symbolLower.length;
    let typedPos = 0;
    let symbolPos = 0;
    while (typedPos < typedLength && symbolPos < symbolLength) {
      if (typedLower[typedPos] === symbolLower[symbolPos]) {
        typedPos += 1;
      }
      symbolPos += 1;
    }

    if (typedPos !== typedLength) return null;

    const matchPosition = symbolPos - typedLength;
    return {
      position: matchPosition,
      lengthDifference: symbolLength - typedLength,
      casingDifference:
        symbolName.substring(matchPosition, typedLength) === typedValue ? 0 : 1,
    };
  }

  // Sorter for two matching symbols:
  // - matches that occurred earlier in the target are prioritized
  // - target strings closer in length to the query go before
  // - if both of these are the same, a case-sensitive match goes first
  private symbolMatchSorter(a: MatchingSymbol, b: MatchingSymbol): number {
    const posDistance = a.match.position - b.match.position;
    if (posDistance !== 0) return posDistance;

    const lengthDistance = a.match.lengthDifference - b.match.lengthDifference;
    if (lengthDistance !== 0) return lengthDistance;

    return a.match.casingDifference - b.match.casingDifference;
  }
}
