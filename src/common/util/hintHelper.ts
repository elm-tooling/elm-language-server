import { SyntaxNode } from "web-tree-sitter";
import { TreeUtils } from "./treeUtils";

export class HintHelper {
  public static createHint(
    node: SyntaxNode | undefined,
    typeString?: string,
  ): string | undefined {
    if (!node) {
      return;
    }

    if (node.type === "module_declaration") {
      return this.createHintFromModule(node);
    } else if (
      node.parent?.type === "let_in_expr" ||
      (node.type === "lower_pattern" &&
        !!TreeUtils.findParentOfType("let_in_expr", node))
    ) {
      return this.createHintFromDefinitionInLet(node, typeString);
    } else if (node.type === "field_type") {
      return this.createHintFromFieldType(node);
    } else if (node.type === "port_annotation") {
      const name = node.childForFieldName("name");
      const typeExpression = node.childForFieldName("typeExpression");
      if (name && typeExpression) {
        let comment = "";
        if (
          node.previousNamedSibling &&
          node.previousNamedSibling.type === "block_comment"
        ) {
          comment = node.previousNamedSibling.text;
        }

        return this.formatHint(
          `${name.text} : ${typeExpression.text}`,
          comment,
        );
      }
    } else {
      return this.createHintFromDefinition(node, typeString);
    }
  }

  public static createHintFromFunctionParameter(
    node: SyntaxNode | undefined,
    typeString?: string,
  ): string {
    const annotation = TreeUtils.getTypeOrTypeAliasOfFunctionParameter(node);
    if (annotation) {
      return this.formatHint(annotation.text, "Local parameter");
    }

    if (node && typeString && typeString !== "unknown") {
      return this.formatHint(`${node.text} : ${typeString}`, "Local parameter");
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
    typeString?: string,
  ): string | undefined {
    if (declaration) {
      const comment = "Defined in local let scope";
      let annotation;
      if (declaration.previousNamedSibling) {
        if (declaration.previousNamedSibling.type === "type_annotation") {
          annotation = declaration.previousNamedSibling.text;
        }
      }

      if (!annotation && typeString) {
        const functionName =
          TreeUtils.getFunctionNameNodeFromDefinition(declaration)?.text ??
          declaration.text;
        annotation = `${functionName} : ${typeString}`;
      }

      return this.formatHint(annotation ?? "", comment);
    }
  }

  public static createHintFromFieldType(node: SyntaxNode): string {
    const typeAlias = TreeUtils.findParentOfType(
      "type_alias_declaration",
      node,
    );

    const commentText =
      node.nextSibling?.type === "line_comment"
        ? this.stripComment(node.nextSibling.text)
        : null;

    const typeAliasHintText = `Field${
      typeAlias
        ? ` on the type alias \`${
            typeAlias?.childForFieldName("name")?.text ?? ""
          }\``
        : ""
    }`;

    const lines = [];
    if (commentText) lines.push(commentText);
    lines.push(typeAliasHintText);

    return this.formatHint(node.text, lines.join("\n\n"));
  }

  public static createHintFromDefinitionInCaseBranch(): string | undefined {
    const comment = "Defined in local case branch";
    return this.formatHint("", comment);
  }

  private static createHintFromDefinition(
    declaration: SyntaxNode | undefined,
    typeString?: string,
  ): string | undefined {
    if (!declaration) {
      return;
    }

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
      if (declaration.parent?.previousNamedSibling?.type !== "block_comment") {
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

    if (
      declaration.parent &&
      declaration.type === "function_declaration_left"
    ) {
      declaration = declaration.parent;
    }

    if (declaration.previousNamedSibling) {
      if (declaration.previousNamedSibling.type === "type_annotation") {
        annotation = declaration.previousNamedSibling.text;
        if (
          declaration.previousNamedSibling.previousNamedSibling &&
          declaration.previousNamedSibling.previousNamedSibling.type ===
            "block_comment"
        ) {
          comment = declaration.previousNamedSibling.previousNamedSibling.text;
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

    const name = declaration.firstNamedChild?.firstNamedChild?.text;

    if (name && typeString) {
      annotation = `${name} : ${typeString}`;
    }

    return this.formatHint(annotation, comment, code);
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
    if (newComment.startsWith("-- ")) {
      newComment = newComment.slice(3);
    }

    return newComment.trim();
  }

  public static wrapCodeInMarkdown(code: string): string {
    return `\n\`\`\`elm\n${code}\n\`\`\`\n`;
  }
}
