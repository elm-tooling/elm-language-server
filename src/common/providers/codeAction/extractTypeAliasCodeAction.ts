import { CodeActionKind, Position, TextEdit } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import {
  CodeActionProvider,
  IRefactorCodeAction,
  IRefactorEdit,
} from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

const refactorName = "extract_type_alias";
CodeActionProvider.registerRefactorAction(refactorName, {
  getAvailableActions: (params: ICodeActionParams): IRefactorCodeAction[] => {
    const result: IRefactorCodeAction[] = [];

    const node = TreeUtils.getNamedDescendantForRange(
      params.sourceFile,
      params.range,
    );

    let canExtract =
      node.type.includes("type") &&
      node.startPosition.column === params.range.start.character &&
      node.startPosition.row === params.range.start.line &&
      node.endPosition.column === params.range.end.character &&
      node.endPosition.row === params.range.end.line;

    let actionName = "extract_type_alias";

    const rootNode = params.sourceFile.tree.rootNode;
    let startNode = node;
    let endNode = node;
    if (!canExtract) {
      startNode = TreeUtils.getDescendantForPosition(
        rootNode,
        params.range.start,
      );

      const previousCharColumn =
        params.range.end.character === 0 ? 0 : params.range.end.character - 1;
      const charBeforeCursor = rootNode.text
        .split("\n")
        [params.range.end.line].substring(
          previousCharColumn,
          params.range.end.character,
        );

      if (charBeforeCursor === ")") {
        const endNode = rootNode.descendantForPosition({
          row: params.range.end.line,
          column: previousCharColumn,
        });

        if (startNode.type === "(" && endNode.type === ")") {
          const node = startNode.nextNamedSibling;
          canExtract =
            !!node &&
            node.id == endNode.previousNamedSibling?.id &&
            node.type.includes("type");
          actionName = "extract_type_alias_parenthesized_expr";
        }
      }
    }

    if (!canExtract) {
      endNode = TreeUtils.getDescendantForPosition(rootNode, params.range.end);

      // Try to see if they are spanning multiple parameters of a function
      const startTypeRef = TreeUtils.findParentOfType("type_ref", startNode);
      const endTypeRef = TreeUtils.findParentOfType("type_ref", endNode);

      if (startTypeRef && endTypeRef) {
        const startTypeExpr = TreeUtils.findParentOfType(
          "type_expression",
          startTypeRef,
        );
        const endTypeExpr = TreeUtils.findParentOfType(
          "type_expression",
          endTypeRef,
        );

        // They must be from the same type expression
        if (
          startTypeExpr &&
          endTypeExpr &&
          startTypeExpr.id === endTypeExpr.id
        ) {
          canExtract =
            startTypeRef.startPosition.column ===
              params.range.start.character &&
            startTypeRef.startPosition.row === params.range.start.line &&
            endTypeRef.endPosition.column === params.range.end.character &&
            endTypeRef.endPosition.row === params.range.end.line;
          actionName = "extract_type_alias_partial_type_expr";
        }
      }
    }

    if (canExtract) {
      result.push({
        title: "Extract type alias",
        kind: CodeActionKind.RefactorExtract,
        data: {
          actionName,
          refactorName,
          uri: params.sourceFile.uri,
          range: params.range,
        },
      });
    }

    return result;
  },
  getEditsForAction: (
    params: ICodeActionParams,
    action: string,
  ): IRefactorEdit => {
    const edits: TextEdit[] = [];

    const nodes: SyntaxNode[] = [];
    if (action === "extract_type_alias_partial_type_expr") {
      const startNode = TreeUtils.getNamedDescendantForPosition(
        params.sourceFile.tree.rootNode,
        params.range.start,
      );

      const endNode = TreeUtils.getNamedDescendantForPosition(
        params.sourceFile.tree.rootNode,
        params.range.end,
      );

      const typeExpression = TreeUtils.findParentOfType(
        "type_expression",
        startNode,
      );

      typeExpression?.namedChildren
        .filter(
          (n) =>
            n.type === "type_ref" &&
            n.startIndex >= startNode.startIndex &&
            n.endIndex <= endNode.endIndex,
        )
        .forEach((n) => nodes.push(n));
    } else if (action === "extract_type_alias_parenthesized_expr") {
      const exprNode = TreeUtils.getDescendantForPosition(
        params.sourceFile.tree.rootNode,
        params.range.start,
      ).nextNamedSibling;

      if (!exprNode) {
        throw new Error(
          "Could not find expression node of parenthisized expression",
        );
      }

      nodes.push(exprNode);
    } else {
      nodes.push(
        TreeUtils.getDescendantForRange(params.sourceFile, params.range),
      );
    }

    const rootNode = params.sourceFile.tree.rootNode;

    const insertPosition: Position = {
      line:
        RefactorEditUtils.findLineNumberBeforeCurrentFunction(nodes[0]) ??
        rootNode.endPosition.row,
      character: 0,
    };

    const args: string[] = [];

    nodes.forEach((node) =>
      node.descendantsOfType(["type_variable"]).forEach((val) => {
        if (!args.includes(val.text)) {
          args.push(val.text);
        }
      }),
    );

    const typeText = nodes.map((n) => n.text).join(" -> ");

    edits.push(
      RefactorEditUtils.createTypeAlias(
        insertPosition.line,
        "NewType",
        typeText,
        args,
      ),
    );

    let textToInsert =
      args.length > 0 ? `NewType ${args.join(" ")}` : `NewType`;

    const needsParenthesis =
      action === "extract_type_alias_parenthesized_expr" && args.length > 0;
    if (needsParenthesis) {
      textToInsert = `(${textToInsert})`;
    }

    edits.push(TextEdit.replace(params.range, textToInsert));

    // Check if we are adding the function before the current range and adjust the rename position
    const linesAdded =
      edits[0].range.start.line < params.range.start.line
        ? edits[0].newText.split("\n").length - 1
        : 0;

    return {
      edits,
      renamePosition: {
        line: params.range.start.line + linesAdded,
        character: needsParenthesis
          ? params.range.start.character + 1
          : params.range.start.character,
      },
    };
  },
});
