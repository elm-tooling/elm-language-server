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

    this.connection.onHover(this.handleHoverRequest);
  }

  private wrapCodeInMarkdown(code: string): string {
    return `\`\`\`elm\n${code}\n\`\`\`\n`;
  }

  protected handleHoverRequest = (
    param: TextDocumentPositionParams,
  ): Hover | null | undefined => {
    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      let nodeAtPosition = tree.rootNode.namedDescendantForPosition({
        row: param.position.line,
        column: param.position.character,
      });

      let declaration = tree.rootNode
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

      if (declaration) {
        let comment: string = "";
        let annotation: string = "";
        if (declaration.previousNamedSibling) {
          if (declaration.previousNamedSibling.type === "type_annotation") {
            annotation = declaration.previousNamedSibling.text;
            if (
              declaration.previousNamedSibling.previousNamedSibling &&
              declaration.previousNamedSibling.previousNamedSibling.type ===
                "block_comment"
            ) {
              comment =
                declaration.previousNamedSibling.previousNamedSibling.text;
            }
          } else if (
            declaration.previousNamedSibling.type === "block_comment"
          ) {
            comment = declaration.previousNamedSibling.text;
          }
        }
        let value = "";
        if (comment) {
          value += this.wrapCodeInMarkdown(comment);
        }
        if (annotation) {
          if (value.length > 0) {
            value += "---\n";
          }

          value += this.wrapCodeInMarkdown(annotation);
        }

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: value,
          },
          //   range: Range.create(Position.create(0, 0), Position.create(100, 0)),
        };
      }
    }

    return undefined;
  };
}
