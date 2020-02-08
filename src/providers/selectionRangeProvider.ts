import {
  SelectionRange,
  SelectionRangeParams,
  IConnection,
  Range,
  Position,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { ElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { TreeUtils } from "../util/treeUtils";
import { PositionUtil } from "../positionUtil";

export class SelectionRangeProvider {
  constructor(private connection: IConnection, elmWorkspaces: ElmWorkspace[]) {
    connection.onSelectionRanges(
      new ElmWorkspaceMatcher(elmWorkspaces, (param: SelectionRangeParams) =>
        URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.handleSelectionRangeRequest),
    );
  }

  private handleSelectionRangeRequest = async (
    params: SelectionRangeParams,
    elmWorkspace: ElmWorkspace,
  ): Promise<SelectionRange[] | null> => {
    this.connection.console.info(`Selection Ranges were requested`);

    const ret: SelectionRange[] = [];

    const forest = elmWorkspace.getForest();
    const tree: Tree | undefined = forest.getTree(params.textDocument.uri);

    if (tree) {
      params.positions.forEach((position: Position) => {
        const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
          tree.rootNode,
          position,
        );

        const newRange = {
          start: PositionUtil.FROM_TS_POSITION(
            nodeAtPosition.startPosition,
          ).toVSPosition(),
          end: PositionUtil.FROM_TS_POSITION(
            nodeAtPosition.endPosition,
          ).toVSPosition(),
        };

        ret.push({
          range: newRange,
          parent: this.getParentNode(nodeAtPosition, newRange),
        });
      });
    }

    return ret ? ret : null;
  };

  private getParentNode(
    node: SyntaxNode,
    previousRange: Range,
  ): SelectionRange | undefined {
    if (node.parent) {
      const newRange = {
        start: PositionUtil.FROM_TS_POSITION(
          node.parent.startPosition,
        ).toVSPosition(),
        end: PositionUtil.FROM_TS_POSITION(
          node.parent.endPosition,
        ).toVSPosition(),
      };
      if (
        previousRange.start.line === newRange.start.line &&
        previousRange.start.character === newRange.start.character &&
        previousRange.end.line === newRange.end.line &&
        previousRange.end.character === newRange.end.character
      ) {
        // Skip ranges that match
        return this.getParentNode(node.parent, previousRange);
      } else {
        return {
          range: newRange,
          parent: this.getParentNode(node.parent, newRange),
        };
      }
    }
  }
}
