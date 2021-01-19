import { container } from "tsyringe";
import {
  Connection,
  LinkedEditingRangeParams,
  LinkedEditingRangeRequest,
  LinkedEditingRanges,
  Range,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { PositionUtil } from "../positionUtil";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { TreeUtils } from "../util/treeUtils";
import { ILinkedEditingRangeParams } from "./paramsExtensions";

export class LinkedEditingRangesProvider {
  private connection: Connection;

  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.connection.onRequest(
      LinkedEditingRangeRequest.type,
      new ElmWorkspaceMatcher((params: LinkedEditingRangeParams) =>
        URI.parse(params.textDocument.uri),
      ).handle(this.provideLinkedEditingRanges.bind(this)),
    );
  }

  protected provideLinkedEditingRanges = (
    params: ILinkedEditingRangeParams,
  ): LinkedEditingRanges => {
    const ranges: Range[] = [];
    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      params.sourceFile.tree.rootNode,
      params.position,
    );

    const range: Range = {
      start: PositionUtil.FROM_TS_POSITION(
        nodeAtPosition.startPosition,
      ).toVSPosition(),
      end: PositionUtil.FROM_TS_POSITION(
        nodeAtPosition.endPosition,
      ).toVSPosition(),
    };

    if (
      nodeAtPosition.parent?.type === "function_declaration_left" &&
      TreeUtils.getTypeAnnotation(nodeAtPosition.parent.parent ?? undefined)
    ) {
      ranges.push(this.addLinesToRange(range, -1));
      ranges.push(range);
    }

    if (
      nodeAtPosition.parent?.type === "type_annotation" &&
      nodeAtPosition.type === "lower_case_identifier"
    ) {
      ranges.push(range);
      ranges.push(this.addLinesToRange(range, 1));
    }

    return { ranges };
  };

  private addLinesToRange(range: Range, linesToAdd: number): Range {
    return {
      start: {
        line: range.start.line + linesToAdd,
        character: range.start.character,
      },
      end: {
        line: range.end.line + linesToAdd,
        character: range.end.character,
      },
    };
  }
}
