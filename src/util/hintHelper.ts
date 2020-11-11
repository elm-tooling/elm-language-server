import { SyntaxNode } from "web-tree-sitter";
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
      parentName
        ? `Refers to the \`${fieldName}\` field on \`${parentName}\``
        : `Refers to the \`${fieldName}\` field`,
    );
  }

  public static createHintFromDefinitionInLet(
    declaration: SyntaxNode | undefined,
  ): string | undefined {
    if (declaration) {
      const comment = "Defined in local let scope";
      let annotation = "";
      if (declaration.previousNamedSibling) {
        if (declaration.previousNamedSibling.type === "type_annotation") {
          annotation = declaration.previousNamedSibling.text;
        }
      }
      return this.formatHint(annotation, comment);
    }
  }

  public static createHintFromDefinitionInCaseBranch(): string | undefined {
    const comment = "Defined in local case branch";
    return this.formatHint("", comment);
  }

  private static createHintFromDefinition(
    declaration: SyntaxNode | undefined,
  ): string | undefined {
    if (declaration) {
      let code: string | undefined;
      let comment = "";
      let annotation = "";
      if (
        declaration.type === "type_declaration" ||
        declaration.type === "type_alias_declaration"
      ) {
        code = declaration.text;
      }
      if (declaration.type === "union_variant") {
        if (
          declaration.parent?.previousNamedSibling?.type !== "block_comment"
        ) {
          code = declaration.text;

          if (declaration.parent) {
            const typeName = TreeUtils.findFirstNamedChildOfType(
              "upper_case_identifier",
              declaration.parent,
            )?.text;
            comment =
              `A variant on the union type \`${typeName ?? "unknown"}\`` || "";
          }
        } else {
          declaration = declaration.parent ? declaration.parent : declaration;
        }
      }
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

        if (
          declaration.type === "value_declaration" &&
          declaration.firstNamedChild?.type === "function_declaration_left"
        ) {
          code = declaration.firstNamedChild.text;
        }
      }
      return this.formatHint(annotation, comment, code);
    }
  }

  private static createHintFromModule(
    moduleNode: SyntaxNode | undefined,
  ): string | undefined {
    if (moduleNode) {
      let comment = "";
      if (
        moduleNode.nextNamedSibling &&
        moduleNode.nextNamedSibling.type === "block_comment"
      ) {
        comment = moduleNode.nextNamedSibling.text;
      }
      return this.formatHint("", comment);
    }
  }

  private static formatHint(
    annotation: string,
    comment: string,
    code?: string,
  ): string {
    let value = "";
    if (annotation) {
      value += this.wrapCodeInMarkdown(annotation);
      if (value.length > 0 && (code || comment)) {
        value += "\n\n---\n\n";
      }
    }
    if (code) {
      value += this.wrapCodeInMarkdown(code);
    }
    if (comment) {
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

  public static wrapCodeInMarkdown(code: string): string {
    return `\n\`\`\`elm\n${code}\n\`\`\`\n`;
  }
}
