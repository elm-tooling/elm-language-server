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

const refactorName = "move_listitem";
const moveListItemUpActionName = "move_listitem_up";
const moveListItemDownActionName = "move_listitem_down";
CodeActionProvider.registerRefactorAction(refactorName, {
  getAvailableActions: (params: ICodeActionParams): IRefactorCodeAction[] => {
    // Allow moving single ListItems only for now
    const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
      params.sourceFile,
      params.range,
    );

    // Get the parent list we want to move within. To support nested lists.
    const isListValid = isNodeInValidCompletedList(nodeAtPosition);
    if (!isListValid) return [];

    const canMoveNext = getNodesToSwapWithinClosestListParent(
      nodeAtPosition,
      "next",
    );
    const canMovePrev = getNodesToSwapWithinClosestListParent(
      nodeAtPosition,
      "previous",
    );

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

  const targets = getNodesToSwapWithinClosestListParent(
    nodeAtPosition,
    direction,
  );
  if (!targets) return [];

  const nodeToMove = targets.nodeToMove;
  const nodeToSwapWith = targets.nodeToSwapWith;

  const startOfListItemToMove = findSiblingNextToCommaOrBracketInDirection(
    nodeToMove,
    "previous",
  );
  const endOfListItemToMove = findSiblingNextToCommaOrBracketInDirection(
    nodeToMove,
    "next",
  );
  const startOfListItemToSwapWith = findSiblingNextToCommaOrBracketInDirection(
    nodeToSwapWith,
    "previous",
  );
  const endOfListItemToSwapWith = findSiblingNextToCommaOrBracketInDirection(
    nodeToSwapWith,
    "next",
  );

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
  // we move everything as-is.

  // Consider if retrieving the text of the rootNode can be a performance issue in very large files. Assuming not.
  const rootNodeText = params.sourceFile.tree.rootNode.text;
  const listItemToMoveText = rootNodeText.substring(
    startOfListItemToMove.startIndex,
    endOfListItemToMove.endIndex,
  );

  const listItemToSwapText = params.sourceFile.tree.rootNode.text.substring(
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
      listItemToSwapText,
    ),
    TextEdit.replace(
      {
        start: startPositionListItemToSwapWith,
        end: endPositionListItemToSwapWith,
      },
      listItemToMoveText,
    ),
  ];
}

function getNodesToSwapWithinClosestListParent(
  node: SyntaxNode,
  direction: "previous" | "next",
): { nodeToMove: SyntaxNode; nodeToSwapWith: SyntaxNode } | null {
  if (!node.parent) return null;

  const closestParentList = TreeUtils.findParentOfType(
    "list_expr",
    node.parent,
  );

  if (!closestParentList) return null;

  const nodeToMove = findParentThatIsChildOfAncestor(node, closestParentList);
  if (!nodeToMove) return null;

  const nodeToSwapWith = findSiblingListNodeInDirection(nodeToMove, direction);
  if (!nodeToSwapWith) return null;

  return { nodeToMove: nodeToMove, nodeToSwapWith: nodeToSwapWith };
}

/**
 * Find the parent node where a given ancestor is its parent. If the given ancestor param is not a real ancestor it returns null.
 * @param nodeToFindParentOf The current node
 * @param ancestor The ancestor node
 */
function findParentThatIsChildOfAncestor(
  nodeToFindParentOf: SyntaxNode,
  ancestor: SyntaxNode,
): SyntaxNode | null {
  const parentNode = findParentWhere(
    (node) => node.parent?.id === ancestor.id,
    nodeToFindParentOf,
  );
  return parentNode;
}

/**
 * Find a parent matching a predicate, or null
 * @param predicate Predicate to match on
 * @param node The node to find parent of
 * @param topLevel No idea?
 */
function findParentWhere(
  predicate: (n: SyntaxNode) => boolean,
  node: SyntaxNode,
  topLevel = false,
): SyntaxNode | null {
  if (predicate(node) && (!topLevel || node.parent?.type === "file")) {
    return node;
  }
  if (node.parent) {
    return findParentWhere(predicate, node.parent, topLevel);
  } else {
    return null;
  }
}

/**
 * Find the next sibling of a node that is not a '[', ']', ',' or a comment
 * @param node The node to start with
 * @param direction The direction to look in
 */
function findSiblingListNodeInDirection(
  node: SyntaxNode,
  direction: "previous" | "next",
): SyntaxNode | null {
  let target = getSibling(node, direction);
  while (
    target != null &&
    (target.type == "," ||
      target.type == "line_comment" ||
      target.type == "block_comment" ||
      target.type == "[" ||
      target.type == "]")
  ) {
    if (target.type == "[" || target.type == "]") return null;
    target = getSibling(target, direction);
  }

  return target;
}

/**
 * Check if a node is within a completed list.
 * A list that starts with a '[' and ends with a ']' is completed.
 * @param node The node to check if is in a list
 */
function isNodeInValidCompletedList(node: SyntaxNode): boolean {
  if (!node.parent) return false;
  const list = TreeUtils.findParentOfType("list_expr", node.parent);
  if (!list) return false;

  // Ensure list is closed in both ends.
  return list.firstChild?.type === "[" && list.lastChild?.type === "]";
}

/**
 * Find the "bounds" of a list content. This is the last item, comment or similar before a ('[' or ',' or ']')
 * @param node The node starting point
 * @param direction Direction to look in
 */
function findSiblingNextToCommaOrBracketInDirection(
  node: SyntaxNode,
  direction: "previous" | "next",
): SyntaxNode | null {
  let siblingNode = getSibling(node, direction);
  while (
    siblingNode != null &&
    siblingNode.type != "," &&
    siblingNode.type != "[" &&
    siblingNode.type != "]"
  ) {
    siblingNode = getSibling(siblingNode, direction);
  }

  const isNext = direction == "next";
  if (isNext) return siblingNode?.previousSibling ?? null;
  else return siblingNode?.nextSibling ?? null;
}

/**
 * Utility method to get a sibling in the given direction.
 * @param node Node to get sibling of
 * @param direction Get the previous or next sibling?
 */
function getSibling(
  node: SyntaxNode,
  direction: "next" | "previous",
): SyntaxNode | null {
  return direction === "next" ? node.nextSibling : node.previousSibling;
}
