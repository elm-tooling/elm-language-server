import { CodeActionKind, Position, TextEdit } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { TFunction } from "../../compiler/typeInference";
import {
  CodeActionProvider,
  IRefactorCodeAction,
  IRefactorEdit,
} from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

const refactorName = "extract_function";
CodeActionProvider.registerRefactorAction(refactorName, {
  getAvailableActions: (params: ICodeActionParams): IRefactorCodeAction[] => {
    const result: IRefactorCodeAction[] = [];

    const node = TreeUtils.getNamedDescendantForRange(
      params.sourceFile,
      params.range,
    );

    if (
      node.type.includes("expr") &&
      node.startPosition.column === params.range.start.character &&
      node.startPosition.row === params.range.start.line &&
      node.endPosition.column === params.range.end.character &&
      node.endPosition.row === params.range.end.line
    ) {
      if (TreeUtils.findParentOfType("let_in_expr", node)) {
        result.push({
          title: "Extract function to enclosing let",
          kind: CodeActionKind.RefactorExtract,
          data: {
            actionName: "extract_let",
            refactorName,
            uri: params.sourceFile.uri,
            range: params.range,
          },
        });
      }

      result.push({
        title: "Extract function to top level",
        kind: CodeActionKind.RefactorExtract,
        data: {
          actionName: "extract_top_level",
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
    actionName: string,
  ): IRefactorEdit => {
    const edits: TextEdit[] = [];
    let node = TreeUtils.getNamedDescendantForRange(
      params.sourceFile,
      params.range,
    );

    let hadParenthesis = false;
    if (node.type === "parenthesized_expr") {
      node = node.childForFieldName("expression") ?? node;
      hadParenthesis = true;
    }

    // List, record, and tuple expr should all be treated like parenthesis groups
    if (
      node.type === "list_expr" ||
      node.type === "record_expr" ||
      node.type === "tuple_expr"
    ) {
      hadParenthesis = true;
    }

    const checker = params.program.getTypeChecker();
    const rootNode = params.sourceFile.tree.rootNode;

    let insertPosition: Position = {
      line: rootNode.endPosition.row,
      character: 0,
    };
    let targetScope: SyntaxNode;
    let addTypeAnnotation = true;

    switch (actionName) {
      case "extract_let":
        {
          const letInExpr = TreeUtils.findParentOfType("let_in_expr", node);

          if (letInExpr) {
            const valueDeclarations =
              TreeUtils.findAllNamedChildrenOfType(
                "value_declaration",
                letInExpr,
              ) ?? [];
            insertPosition = {
              line:
                valueDeclarations[valueDeclarations.length - 1].endPosition
                  .row + 1,
              character: letInExpr.startPosition.column + 4,
            };

            targetScope = letInExpr;
            addTypeAnnotation = false;
          }
        }
        break;

      case "extract_top_level":
        {
          insertPosition = {
            line:
              RefactorEditUtils.findLineNumberAfterCurrentFunction(node) ??
              rootNode.endPosition.row,
            character: 0,
          };

          targetScope = rootNode;
        }
        break;
    }

    const args: SyntaxNode[] = [];

    // Get the list of references that won't be visible
    node
      .descendantsOfType(["value_expr", "record_base_identifier"])
      .forEach((val) => {
        if (args.find((arg) => arg.text === val.text)) {
          return;
        }

        // Qualified reference will be visible
        if (val.text.includes(".")) {
          return;
        }

        const ref = checker.findDefinition(
          val.firstNamedChild?.firstNamedChild ?? val.firstNamedChild ?? val,
          params.sourceFile,
        );

        // Reference in other file will be visible
        if (ref?.uri !== params.sourceFile.uri) {
          return;
        }

        // Reference inside self will be visible
        if (
          node.startIndex <= ref.node.startIndex &&
          node.endIndex >= ref.node.endIndex
        ) {
          return;
        }

        let scope: SyntaxNode | null = targetScope;

        // Check the target scope and parent scopes for the reference
        while (scope) {
          if (params.sourceFile.symbolLinks?.get(scope)?.get(val.text)) {
            return;
          }
          scope = scope.parent;
        }

        args.push(val);
      });

    let typeAnnotation: string | undefined;
    if (addTypeAnnotation) {
      let type = checker.findType(node);

      if (args.length > 0) {
        type = TFunction(args.map(checker.findType), type);
      }

      typeAnnotation = checker.typeToString(type, params.sourceFile);
    }

    edits.push(
      RefactorEditUtils.createFunction(
        insertPosition.line,
        "newFunction",
        typeAnnotation,
        args.map((arg) => arg.text),
        node.text,
        node.startPosition.column,
        insertPosition.character,
      ),
    );

    let textToInsert =
      args.length > 0
        ? `newFunction ${args.map((arg) => arg.text).join(" ")}`
        : `newFunction`;

    const needsParenthesis = hadParenthesis && args.length > 0;
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
