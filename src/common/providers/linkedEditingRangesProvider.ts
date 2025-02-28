import { container } from "tsyringe";
import {
  Connection,
  LinkedEditingRangeParams,
  LinkedEditingRangeRequest,
  LinkedEditingRanges,
  Position,
  Range,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { TreeUtils } from "../util/treeUtils";
import { Utils } from "../util/utils";
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

    // When modifying the type annotation, link the value declaration below.
    if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeAtPosition.parent?.type === "type_annotation"
    ) {
      const valueDeclaration = TreeUtils.getValueDeclaration(
        nodeAtPosition.parent,
      );
      const valueDeclarationIdentifier =
        valueDeclaration?.firstChild?.firstChild;
      if (
        valueDeclarationIdentifier &&
        valueDeclarationIdentifier.type === "lower_case_identifier" &&
        valueDeclarationIdentifier.text === nodeAtPosition.text
      ) {
        ranges.push(
          Utils.rangeFromNode(nodeAtPosition),
          Utils.rangeFromNode(valueDeclarationIdentifier),
        );
      }
    }

    // When modifying the value declaration, link the type annotation above.
    if (
      nodeAtPosition.parent?.type === "function_declaration_left" &&
      nodeAtPosition.parent.parent
    ) {
      const typeAnnotation = TreeUtils.getTypeAnnotation(
        nodeAtPosition.parent.parent,
      );
      const typeAnnotationIdentifier = typeAnnotation?.firstChild;
      if (
        typeAnnotationIdentifier &&
        typeAnnotationIdentifier.type === "lower_case_identifier" &&
        typeAnnotationIdentifier.text === nodeAtPosition.text
      ) {
        ranges.push(
          Utils.rangeFromNode(typeAnnotationIdentifier),
          Utils.rangeFromNode(nodeAtPosition),
        );
      }
    }

    if (ranges.length === 0) {
      const lines = params.sourceFile.tree.rootNode.text.split(/\r\n|\r|\n/);
      const line = lines[params.position.line].trim();

      const positionRange = Range.create(
        Position.create(params.position.line, 0),
        Position.create(params.position.line, 0),
      );

      if (line.startsWith(":")) {
        const nextLine = lines[params.position.line + 1].trim();
        if (nextLine.endsWith("=")) {
          ranges.push(positionRange);
          ranges.push(this.addLinesToRange(positionRange, 1));
        }
      } else if (line.endsWith("=")) {
        const previousLine = lines[params.position.line - 1].trim();
        if (previousLine.startsWith(":")) {
          ranges.push(this.addLinesToRange(positionRange, -1));
          ranges.push(positionRange);
        }
      }
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
