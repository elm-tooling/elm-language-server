import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  TextDocumentPositionParams,
  Location,
  LocationLink,
  Range,
  Position,
} from "vscode-languageserver";
import { IForest } from "../forest";

export class DefinitionProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onDefinition(this.handleDefinitionRequest);
  }

  protected handleDefinitionRequest = async (
    param: TextDocumentPositionParams,
  ): Promise<Location | Location[] | LocationLink[] | null | undefined> => {
    const locationLinks: LocationLink[] = [
      LocationLink.create(
        "",
        Range.create(Position.create(0, 0), Position.create(0, 0)),
        Range.create(Position.create(0, 0), Position.create(0, 0)),
        Range.create(Position.create(0, 0), Position.create(0, 0)),
      ),
    ];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
      //   if (
      //     node.type === "exposed_value" &&
      //     !completions.some(a => a.label === node.text)
      //   ) {
      //     completions.push({
      //       kind: 3,
      //       label: node.text,
      //     });
      //   } else if (
      //     node.type === "exposed_type" &&
      //     !completions.some(a => a.label === node.text)
      //   ) {
      //     completions.push({
      //       kind: 22,
      //       label: node.text,
      //     });
      //   } else if (
      //     node.type === "exposed_operator" &&
      //     !completions.some(a => a.label === node.text)
      //   ) {
      //     completions.push({
      //       kind: 24,
      //       label: node.text,
      //     });
      //   }
      for (const childNode of node.children) {
        traverse(childNode);
      }
    };
    if (tree) {
      traverse(tree.rootNode);
    }

    return locationLinks;
  };
}
