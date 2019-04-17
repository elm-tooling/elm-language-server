import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  LocationLink,
  Range,
  Position,
  CodeLensParams,
  CodeLens,
  Command,
} from "vscode-languageserver";
import { IForest } from "../forest";

export class CodeLensProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onCodeLens(this.handleCodeLensRequest);
    this.connection.onCodeLensResolve(this.handleCodeLensResolveRequest);
  }

  protected handleCodeLensRequest = async (
    param: CodeLensParams,
  ): Promise<CodeLens[] | null | undefined> => {
    const codeLens: CodeLens[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
      if (node.type === "value_declaration") {
        codeLens.push(
          CodeLens.create(
            Range.create(
              Position.create(
                node.startPosition.row,
                node.startPosition.column,
              ),
              Position.create(node.endPosition.row, node.endPosition.column),
            ),
          ),
        );
      }
      for (const childNode of node.children) {
        traverse(childNode);
      }
    };
    if (tree) {
      traverse(tree.rootNode);
    }

    return codeLens;
  };

  protected handleCodeLensResolveRequest = async (
    param: CodeLens,
  ): Promise<CodeLens> => {
    let codelens = param;
    codelens.command = Command.create("exposed", "elm-lsp.toggleExposed");

    return codelens;
  };
}
