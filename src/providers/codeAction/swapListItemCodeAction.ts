import { CodeActionKind, Range, TextEdit } from "vscode-languageserver";
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
    // Allow moving single ListItems only for now
    const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
      params.sourceFile,
      params.range,
    );

    // Get the parent list we want to move within. To support nested lists.
    const isListValid = isInValidCompletedList(nodeAtPosition);
    if (!isListValid) return [];

    const canMoveNext = getTargetNodesToSwap(nodeAtPosition, "next");
    const canMovePrev = getTargetNodesToSwap(nodeAtPosition, "previous");

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

function getTargetNodesToSwap(
  node: SyntaxNode,
  direction: "previous" | "next",
): { nodeToMove: SyntaxNode; nodeToSwapWith: SyntaxNode } | null {
  if (!node.parent) return null;

  const closestParentList = TreeUtils.findParentOfType(
    "list_expr",
    node.parent,
  );
  if (closestParentList) {
    let nodeToMove = node;
    // TODO: Make an item in TreeUtils for finding nearest parent node.
    while (
      nodeToMove.parent?.id !== closestParentList.id &&
      nodeToMove.parent != null
    ) {
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

  const targets = getTargetNodesToSwap(nodeAtPosition, direction);
  if (!targets) return [];

  const nodeToMove = targets.nodeToMove;
  const nodeToSwapWith = targets.nodeToSwapWith;

  const startOfListItemToMove = findListItemBoundNode(nodeToMove, "previous");
  const endOfListItemToMove = findListItemBoundNode(nodeToMove, "next");
  const startOfListItemToSwapWith = findListItemBoundNode(
    nodeToSwapWith,
    "previous",
  );
  const endOfListItemToSwapWith = findListItemBoundNode(nodeToSwapWith, "next");

  if (
    !(
      startOfListItemToMove &&
      endOfListItemToMove &&
      startOfListItemToSwapWith &&
      endOfListItemToSwapWith
    )
  )
    return [];

  // To simplify moving multiple AST child nodes within a list item (keeping comments, uncommon formatting etc)
  // we move everything in-between as its currently written.
  const rootNodeText = params.sourceFile.tree.rootNode.text;
  const nodeToMoveText = rootNodeText.substring(
    startOfListItemToMove.startIndex,
    endOfListItemToMove.endIndex,
  );

  const nodeToSwapText = params.sourceFile.tree.rootNode.text.substring(
    startOfListItemToSwapWith.startIndex,
    endOfListItemToSwapWith.endIndex,
  );

  const startPositionListItemToMove = PositionUtil.FROM_TS_POSITION(
    startOfListItemToMove?.startPosition,
  ).toVSPosition();
  const endPositionListItemToMove = PositionUtil.FROM_TS_POSITION(
    endOfListItemToMove.endPosition,
  ).toVSPosition();

  const startPositionListItemToSwapWith = PositionUtil.FROM_TS_POSITION(
    startOfListItemToSwapWith.startPosition,
  ).toVSPosition();
  const endPositionListItemToSwapWith = PositionUtil.FROM_TS_POSITION(
    endOfListItemToSwapWith.endPosition,
  ).toVSPosition();

  return [
    TextEdit.replace(
      { start: startPositionListItemToMove, end: endPositionListItemToMove },
      nodeToSwapText,
    ),
    TextEdit.replace(
      {
        start: startPositionListItemToSwapWith,
        end: endPositionListItemToSwapWith,
      },
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

function isInValidCompletedList(node: SyntaxNode): boolean {
  if (!node.parent) return false;
  const list = TreeUtils.findParentOfType("list_expr", node.parent);
  if (!list) return false;

  // Ensure list is closed in both ends.
  return list.firstChild?.type === "[" && list.lastChild?.type === "]";
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

  if (isNext) return target?.previousSibling ?? null;
  else return target?.nextSibling ?? null;

  function iterate(inputNode: SyntaxNode): SyntaxNode | null {
    return isNext ? inputNode.nextSibling : inputNode.previousSibling;
  }
}
