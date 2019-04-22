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
        if (annotation) {
          value += this.wrapCodeInMarkdown(annotation);
        }
        if (comment) {
          if (value.length > 0) {
            value += "\n\n---\n\n";
          }
          value += this.stripComment(comment);
        }

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

  private stripComment(comment: string): string {
    let newComment = comment;
    if (newComment.startsWith("{-|")) {
      newComment = newComment.slice(3);
    }
    if (newComment.startsWith("{-")) {
      newComment = newComment.slice(2);
    }
    if (newComment.endsWith("-}")) {
      newComment = newComment.slice(0, -2);
    }

    return newComment.trim();
  }

  private wrapCodeInMarkdown(code: string): string {
    return `\n\`\`\`elm\n${code}\n\`\`\`\n`;
  }
}
