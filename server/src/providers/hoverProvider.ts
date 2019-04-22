import { Tree } from "tree-sitter";
import {
  Hover,
  IConnection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { hintHelper } from "../util/hintHelper";

export class HoverProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onHover(this.handleHoverRequest);
  }

  protected handleHoverRequest = (
    param: TextDocumentPositionParams,
  ): Hover | null | undefined => {
    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      const nodeAtPosition = tree.rootNode.namedDescendantForPosition({
        column: param.position.character,
        row: param.position.line,
      });

      const declaration = tree.rootNode
        .descendantsOfType("value_declaration")
        .find(
          a =>
            a.firstNamedChild !== null &&
            a.firstNamedChild.type === "function_declaration_left" &&
            a.firstNamedChild.firstNamedChild !== null &&
            a.firstNamedChild.firstNamedChild.type ===
              "lower_case_identifier" &&
            a.firstNamedChild.firstNamedChild.text === nodeAtPosition.text,
        );

      const value = hintHelper.createHintFromValueDeclaration(declaration);

      if (value) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value,
          },
        };
      }
    }

    return undefined;
  };
}
