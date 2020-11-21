import { container } from "tsyringe";
import {
  Connection,
  Position,
  Range,
  SelectionRange,
  SelectionRangeParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { PositionUtil } from "../positionUtil";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { TreeUtils } from "../util/treeUtils";

export class SelectionRangeProvider {
  private connection: Connection;

  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.connection.onSelectionRanges(
      new ElmWorkspaceMatcher((param: SelectionRangeParams) =>
        URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.handleSelectionRangeRequest),
    );
  }

  private handleSelectionRangeRequest = (
    params: SelectionRangeParams,
    elmWorkspace: IElmWorkspace,
  ): SelectionRange[] | null => {
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
