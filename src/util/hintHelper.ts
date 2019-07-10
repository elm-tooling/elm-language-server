import { SyntaxNode } from "tree-sitter";
import { TreeUtils } from "./treeUtils";

export class HintHelper {
  public static createHint(node: SyntaxNode | undefined): string | undefined {
    if (node) {
      if (node.type === "module_declaration") {
        return this.createHintFromModule(node);
      } else if (node.parent && node.parent.type === "let_in_expr") {
        return this.createHintFromDefinitionInLet(node);
      } else {
        return this.createHintFromDefinition(node);
      }
    }
  }

  public static createHintFromFunctionParameter(
    node: SyntaxNode | undefined,
  ): string {
    const annotation = TreeUtils.getTypeOrTypeAliasOfFunctionParameter(node);
    if (annotation) {
      return this.formatHint(annotation.text, "Local parameter");
    }
    return "Local parameter";
  }

  public static createHintForTypeAliasReference(
    annotation: string,
    fieldName: string,
    parentName: string,
  ): string {
    return this.formatHint(
      annotation,
      `Refers to the \`${fieldName}\` field on \`${parentName}\``,
    );
  }

  public static createHintFromDefinitionInLet(
    declaration: SyntaxNode | undefined,
  ) {
    if (declaration) {
      const comment: string = "Defined in local let scope";
      let annotation: string = "";
      if (declaration.previousNamedSibling) {
        if (declaration.previousNamedSibling.type === "type_annotation") {
          annotation = declaration.previousNamedSibling.text;
        }
        return this.formatHint(annotation, comment);
      }
    }
  }

  public static createHintFromDefinitionInCaseBranch() {
    const comment: string = "Defined in local case branch";
    return this.formatHint("", comment);
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
