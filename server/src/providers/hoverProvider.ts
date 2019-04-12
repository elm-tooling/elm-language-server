import { SyntaxNode, Tree } from "tree-sitter";
import {
  Hover,
  HoverRequest,
  IConnection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IForest } from "../forest";

export class HoverProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onRequest(HoverRequest.type, this.handleHoverRequest);
  }

  protected handleHoverRequest = async (
    param: TextDocumentPositionParams,
  ): Promise<Hover> => {
    const hover: Hover = {
      contents: {
        kind: MarkupKind.PlainText,
        value: "test",
      },
      //   range: Range.create(Position.create(0, 0), Position.create(100, 0)),
    };

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

    return hover;
  };
}
