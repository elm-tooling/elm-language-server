import { SyntaxNode } from "tree-sitter";
import { TreeUtils } from "./treeUtils";

export class HintHelper {
  public static createHint(node: SyntaxNode | undefined): string | undefined {
    if (node) {
      if (node.type === "module_declaration") {
        return this.createHintFromModule(node);
      } else {
        return this.createHintFromDefinition(node);
      }
    }
  }

  public static createHintFromFunctionParameter(
    node: SyntaxNode | undefined,
  ): string {
    if (
      node &&
      node.parent &&
      node.parent.parent &&
      node.parent.parent.previousNamedSibling &&
      node.parent.parent.previousNamedSibling.type === "type_annotation" &&
      node.parent.parent.previousNamedSibling.lastNamedChild
    ) {
      const functionParametrNodes = TreeUtils.findAllNamedChildsOfType(
        ["pattern", "lower_pattern"],
        node.parent,
      );
      if (functionParametrNodes) {
        const matchIndex = functionParametrNodes.findIndex(a => a === node);

        const typeAnnotationNodes = TreeUtils.findAllNamedChildsOfType(
          ["type_ref", "type_expression"],
          node.parent.parent.previousNamedSibling.lastNamedChild,
        );
        if (typeAnnotationNodes) {
          const annotation = typeAnnotationNodes[matchIndex];

          return this.formatHint(
            annotation ? annotation.text : "",
            "Local parameter",
          );
        }
      }
    }
    return "Local parameter";
  }

  private static createHintFromDefinition(declaration: SyntaxNode | undefined) {
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
        } else if (declaration.previousNamedSibling.type === "block_comment") {
          comment = declaration.previousNamedSibling.text;
        }
      }
      return this.formatHint(annotation, comment);
    }
  }

  private static createHintFromModule(moduleNode: SyntaxNode | undefined) {
    if (moduleNode) {
      let comment: string = "";
      if (
        moduleNode.nextNamedSibling &&
        moduleNode.nextNamedSibling.type === "block_comment"
      ) {
        comment = moduleNode.nextNamedSibling.text;
      }
      return this.formatHint("", comment);
    }
  }

  private static formatHint(annotation: string, comment: string) {
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
    return value;
  }

  private static stripComment(comment: string): string {
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

  private static wrapCodeInMarkdown(code: string): string {
    return `\n\`\`\`elm\n${code}\n\`\`\`\n`;
  }
}
