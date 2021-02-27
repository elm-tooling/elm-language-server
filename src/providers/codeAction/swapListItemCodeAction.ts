import {
  CodeAction,
  CodeActionKind,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { PositionUtil } from "../../positionUtil";
import { TreeUtils } from "../../util/treeUtils";
import {
  CodeActionProvider,
  IRefactorCodeAction,
  IRefactorEdit,
} from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

// Handle adding annotation to let expr declaration
const refactorName = "swap_listitem";
const moveListItemUpActionName = "swap_listitem_up";
const moveListItemDownActionName = "swap_listitem_down";
CodeActionProvider.registerRefactorAction(refactorName, {
  getAvailableActions: (params: ICodeActionParams): IRefactorCodeAction[] => {
    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      params.sourceFile.tree.rootNode,
      params.range.start,
    );

    const canMoveNext = getTargetNodes(nodeAtPosition, "next");
    const canMovePrev = getTargetNodes(nodeAtPosition, "previous");

    const codeActions: IRefactorCodeAction[] = [];

    if (canMovePrev) {
      codeActions.push({
        title: "Move List item Up",
        kind: CodeActionKind.RefactorRewrite,
        data: {
          actionName: moveListItemUpActionName,
          refactorName,
          uri: params.sourceFile.uri,
          range: params.range,
        },
      });
    }

    if (canMoveNext) {
      codeActions.push({
        title: "Move List item Down",
        kind: CodeActionKind.RefactorRewrite,
        data: {
          actionName: moveListItemDownActionName,
          refactorName,
          uri: params.sourceFile.uri,
          range: params.range,
        },
      });
    }

    return codeActions;
  },
  getEditsForAction: (
    params: ICodeActionParams,
    actionName: string,
  ): IRefactorEdit => {
    return { edits: getEdits(params, params.range, actionName) };
  },
});

function getTargetNodes(
  node: SyntaxNode,
  direction: "previous" | "next",
): { nodeToMove: SyntaxNode; nodeToSwapWith: SyntaxNode } | null {
  const list = TreeUtils.findParentOfType("list_expr", node);
  if (list == node) return null;
  if (list) {
    let nodeToMove = node;
    // TODO: Make an item in TreeUtils for finding nearest parent node.
    while (nodeToMove.parent?.id !== list.id && nodeToMove.parent != null) {
      nodeToMove = nodeToMove.parent;
    }

    const nodeToSwapWith = findSiblingSemanticListNode(nodeToMove, direction);
    if (nodeToSwapWith)
      return { nodeToMove: nodeToMove, nodeToSwapWith: nodeToSwapWith };
  }

  return null;
}

function getEdits(
  params: ICodeActionParams,
  range: Range,
  actionName: string,
): TextEdit[] {
  const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  const direction =
    actionName == moveListItemUpActionName ? "previous" : "next";

  const targets = getTargetNodes(nodeAtPosition, direction);
  if (!targets) return [];

  const nodeToMove = targets.nodeToMove;
  const nodeToSwapWith = targets.nodeToSwapWith;
  const nodeToMoveText = nodeToMove.text;
  const nodeToSwapText = nodeToSwapWith.text;

  const startPosition = PositionUtil.FROM_TS_POSITION(
    nodeToMove.startPosition,
  ).toVSPosition();
  const endPosition = PositionUtil.FROM_TS_POSITION(
    nodeToMove.endPosition,
  ).toVSPosition();

  const startPosition2 = PositionUtil.FROM_TS_POSITION(
    nodeToSwapWith.startPosition,
  ).toVSPosition();
  const endPosition2 = PositionUtil.FROM_TS_POSITION(
    nodeToSwapWith.endPosition,
  ).toVSPosition();

  return [
    TextEdit.replace(
      { start: startPosition, end: endPosition },
      nodeToSwapText,
    ),
    TextEdit.replace(
      { start: startPosition2, end: endPosition2 },
      nodeToMoveText,
    ),
  ];
}

// Find the next sibling of a list node that is not a comma or a comment
function findSiblingSemanticListNode(
  node: SyntaxNode,
  direction: "previous" | "next",
): SyntaxNode | null {
  const isNext = direction == "next";

  let prev = iterate(node);
  while (
    (prev?.type == "," ||
      prev?.type == "line_comment" ||
      prev?.type == "[" ||
      prev?.type == "]") &&
    prev != null
  ) {
    if (prev.type == "[" || prev.type == "]") return null;
    prev = iterate(prev);
  }

  return prev;

  function iterate(inputNode: SyntaxNode): SyntaxNode | null {
    return isNext ? inputNode.nextSibling : inputNode.previousSibling;
  }
}
