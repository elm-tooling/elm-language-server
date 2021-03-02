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

const refactorName = "swap_listitem";
const moveListItemUpActionName = "swap_listitem_up";
const moveListItemDownActionName = "swap_listitem_down";
CodeActionProvider.registerRefactorAction(refactorName, {
  getAvailableActions: (params: ICodeActionParams): IRefactorCodeAction[] => {
    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      params.sourceFile.tree.rootNode,
      params.range.start,
    );

    const isListValid = isInValidList(nodeAtPosition);
    if (!isListValid) return [];

    const canMoveNext = getTargetNodes(nodeAtPosition, "next");
    const canMovePrev = getTargetNodes(nodeAtPosition, "previous");

    const codeActions: IRefactorCodeAction[] = [];

    if (canMovePrev) {
      codeActions.push({
        title: "Move list item up",
        kind: CodeActionKind.RefactorRewrite + ".movelistitem.up",
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
        title: "Move list item down",
        kind: CodeActionKind.RefactorRewrite + ".movelistitem.down",
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

  const start = findListItemBoundNode(nodeToMove, "previous");
  const end = findListItemBoundNode(nodeToMove, "next");
  const start2 = findListItemBoundNode(nodeToSwapWith, "previous");
  const end2 = findListItemBoundNode(nodeToSwapWith, "next");

  if (!(start && end && start2 && end2)) return [];

  // let nodeToMoveText = "";
  // nodes1.forEach((x) => (nodeToMoveText += x.text));

  // let nodeToSwapText = "";
  // nodes2.forEach((x) => (nodeToSwapText += x.text));

  const nodeToMoveText = params.sourceFile.tree.rootNode.text.substring(
    start.endIndex,
    end.startIndex,
  );

  const nodeToSwapText = params.sourceFile.tree.rootNode.text.substring(
    start2.endIndex,
    end2.startIndex,
  );
  const startPosition = PositionUtil.FROM_TS_POSITION(
    start?.endPosition,
  ).toVSPosition();
  const endPosition = PositionUtil.FROM_TS_POSITION(
    end.startPosition,
  ).toVSPosition();

  const startPosition2 = PositionUtil.FROM_TS_POSITION(
    start2.endPosition,
  ).toVSPosition();
  const endPosition2 = PositionUtil.FROM_TS_POSITION(
    end2.startPosition,
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

  let target = iterate(node);
  while (
    target != null &&
    (target.type == "," ||
      target.type == "line_comment" ||
      target.type == "block_comment" ||
      target.type == "[" ||
      target.type == "]")
  ) {
    if (target.type == "[" || target.type == "]") return null;
    target = iterate(target);
  }

  return target;

  function iterate(inputNode: SyntaxNode): SyntaxNode | null {
    return isNext ? inputNode.nextSibling : inputNode.previousSibling;
  }
}

function isInValidList(node: SyntaxNode): boolean {
  const list = TreeUtils.findParentOfType("list_expr", node);
  if (!list) return false;

  const listText = list.text.trim();
  return listText.startsWith("[") && listText.endsWith("]");
}

// Find the next list item bound node ('[' or ',' or ']')
function findListItemBoundNode(
  node: SyntaxNode,
  direction: "previous" | "next",
): SyntaxNode | null {
  const isNext = direction == "next";

  let target = iterate(node);
  while (
    target != null &&
    target.type != "," &&
    target.type != "[" &&
    target.type != "]"
  ) {
    target = iterate(target);
  }

  return target;

  function iterate(inputNode: SyntaxNode): SyntaxNode | null {
    return isNext ? inputNode.nextSibling : inputNode.previousSibling;
  }
}
