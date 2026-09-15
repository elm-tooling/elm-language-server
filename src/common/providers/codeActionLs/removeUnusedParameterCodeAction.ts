import { CodeAction, TextEdit } from "vscode-languageserver";
import { Node as SyntaxNode } from "web-tree-sitter";
import { ISourceFile } from "../../../compiler/forest.js";
import { TypeChecker } from "../../../compiler/typeChecker.js";
import { comparePosition } from "../../positionUtil.js";
import { TreeUtils } from "../../util/treeUtils.js";
import { CodeActionProvider } from "../codeActionProvider.js";
import { IDiagnostic } from "../diagnostics/diagnosticsProvider.js";
import { ICodeActionParams } from "../paramsExtensions.js";

CodeActionProvider.registerCodeAction({
  errorCodes: ["unused_pattern"],
  fixId: "remove_unused_parameter",
  getCodeActions: (params) =>
    (params.context.diagnostics as IDiagnostic[]).flatMap((diagnostic) => {
      const action = removeUnusedParameter(params, diagnostic);
      return action ? [action] : [];
    }),
  // Removing multiple parameters needs a single coordinated reference analysis.
  getFixAllCodeAction: () => undefined,
});

function removeUnusedParameter(
  params: ICodeActionParams,
  diagnostic: IDiagnostic,
): CodeAction | undefined {
  const { sourceFile, program } = params;
  const node = TreeUtils.getNamedDescendantForPosition(
    sourceFile.tree.rootNode,
    diagnostic.range.start,
  );
  const parameter = node.type === "lower_pattern" ? node : node.parent;
  const left = parameter?.parent;
  const declaration = left?.parent;
  if (
    !sourceFile.writeable ||
    parameter?.type !== "lower_pattern" ||
    left?.type !== "function_declaration_left" ||
    declaration?.type !== "value_declaration"
  ) {
    return;
  }

  const parameters = left
    .childrenForFieldName("pattern")
    .filter((child) => child.isNamed && !isComment(child));
  const index = parameters.findIndex((p) => p.id === parameter.id);
  const name = left.firstNamedChild;
  if (index < 0 || !name) {
    return;
  }

  const topLevel = declaration.parent?.type === "file";
  if (
    topLevel &&
    (name.text === "main" ||
      (sourceFile.project.type === "package" &&
        sourceFile.project.exposedModules.has(sourceFile.moduleName ?? "") &&
        TreeUtils.isExposedFunctionOrPort(sourceFile.tree, name.text)))
  ) {
    // Entry points and public package APIs have callers outside this program.
    return;
  }
  if (
    sourceFile.tree.rootNode
      .descendantsOfType("infix_declaration")
      .some((infix) => infix.lastNamedChild?.text === name.text)
  ) {
    return;
  }

  const checker = program.getTypeChecker();
  if (
    parameters.length === 1 &&
    isRecursive(declaration, sourceFile, checker)
  ) {
    // Elm does not permit recursive values, including indirect recursion.
    return;
  }

  let previous = parameter.previousSibling;
  while (previous && isComment(previous)) {
    previous = previous.previousSibling;
  }
  if (!previous) {
    return;
  }
  const changes: Record<string, TextEdit[]> = {
    [sourceFile.uri]: [removeArgument(parameter, previous)],
  };
  const annotation = TreeUtils.getTypeAnnotation(declaration);
  if (annotation) {
    const type = annotation.childForFieldName("typeExpression");
    const children = type?.children.filter((child) => !isComment(child));
    const arrows = children?.filter((child) => child.type === "arrow");
    if (!children || !arrows || arrows.length < parameters.length) {
      return;
    }
    const start =
      index === 0
        ? children[0]
        : children[
            children.findIndex((child) => child.id === arrows[index - 1].id) + 1
          ];
    const end =
      children[
        children.findIndex((child) => child.id === arrows[index].id) + 1
      ];
    if (!start || !end) {
      return;
    }
    changes[sourceFile.uri].push(
      deleteBetween(start.startPosition, end.startPosition),
    );
  }

  for (const file of program.getSourceFiles()) {
    // Dependencies cannot import the project's functions.
    if (file.isDependency) {
      continue;
    }
    if (file.tree.rootNode.hasError) {
      return;
    }
    for (const reference of file.tree.rootNode.descendantsOfType([
      "value_qid",
      "record_base_identifier",
    ])) {
      const identifier = reference.lastNamedChild;
      if (identifier?.text !== name.text) {
        continue;
      }
      const definition = checker.findDefinition(identifier, file).symbol;
      if (!definition) {
        // An unresolved same-name use might refer to this function.
        return;
      }
      if (
        definition.node.id !== left.id ||
        definition.node.tree.uri !== sourceFile.uri
      ) {
        continue;
      }
      if (!file.writeable || reference.parent?.type !== "value_expr") {
        return;
      }
      let target = reference.parent;
      while (target.parent?.type === "parenthesized_expr") {
        target = target.parent;
      }
      const call = target.parent;
      const args = call?.childrenForFieldName("arg") ?? [];
      if (
        call?.type !== "function_call_expr" ||
        call.childForFieldName("target")?.id !== target.id ||
        !args[index]
      ) {
        // Bare/higher-order uses and partial applications before this argument
        // would change type. Do not guess how their consumers should change.
        return;
      }
      (changes[file.uri] ??= []).push(
        removeArgument(args[index], args[index - 1] ?? target),
      );
    }
  }

  // Calls can be nested inside arguments that are themselves being removed.
  // Keep the enclosing deletion, and reject any other overlapping edits.
  for (const [uri, edits] of Object.entries(changes)) {
    edits.sort(
      (a, b) =>
        comparePosition(a.range.start, b.range.start) ||
        comparePosition(b.range.end, a.range.end),
    );
    const disjoint: TextEdit[] = [];
    for (const edit of edits) {
      const previous = disjoint[disjoint.length - 1];
      if (
        previous &&
        comparePosition(edit.range.start, previous.range.end) < 0
      ) {
        if (comparePosition(edit.range.end, previous.range.end) <= 0) {
          continue;
        }
        return;
      }
      disjoint.push(edit);
    }
    changes[uri] = disjoint;
  }

  return CodeActionProvider.getCodeAction(
    params,
    `Remove unused parameter \`${parameter.text}\``,
    changes,
  );
}

function isComment(node: SyntaxNode): boolean {
  return node.type === "line_comment" || node.type === "block_comment";
}

function removeArgument(argument: SyntaxNode, previous: SyntaxNode): TextEdit {
  const gap = argument.tree.rootNode.text.slice(
    previous.endIndex,
    argument.startIndex,
  );
  return deleteBetween(
    gap.trim() ? argument.startPosition : previous.endPosition,
    argument.endPosition,
  );
}

function deleteBetween(
  start: SyntaxNode["startPosition"],
  end: SyntaxNode["endPosition"],
): TextEdit {
  return TextEdit.del({
    start: { line: start.row, character: start.column },
    end: { line: end.row, character: end.column },
  });
}

function isRecursive(
  declaration: SyntaxNode,
  file: ISourceFile,
  checker: TypeChecker,
): boolean {
  const pending = [declaration];
  const visited = new Set<number>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current.id)) {
      continue;
    }
    visited.add(current.id);
    for (const reference of current.descendantsOfType("value_qid")) {
      const identifier = reference.lastNamedChild;
      const symbol =
        identifier && checker.findDefinition(identifier, file).symbol;
      if (symbol?.type !== "Function" || symbol.node.tree.uri !== file.uri) {
        continue;
      }
      const dependency = TreeUtils.findParentOfType(
        "value_declaration",
        symbol.node,
      );
      if (dependency?.id === declaration.id) {
        return true;
      }
      if (dependency) {
        pending.push(dependency);
      }
    }
  }
  return false;
}
