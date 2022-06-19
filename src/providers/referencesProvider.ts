import { container } from "tsyringe";
import {
  Connection,
  Location,
  Position,
  Range,
  ReferenceParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { References } from "../compiler/references.js";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher.js";
import { TreeUtils } from "../util/treeUtils.js";
import { IReferenceParams } from "./paramsExtensions.js";

export type ReferenceResult = Location[] | null | undefined;

export class ReferencesProvider {
  private connection: Connection;
  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.connection.onReferences(
      new ElmWorkspaceMatcher((param: ReferenceParams) =>
        URI.parse(param.textDocument.uri),
      ).handle(this.handleReferencesRequest.bind(this)),
    );
  }

  protected handleReferencesRequest = (
    params: IReferenceParams,
  ): ReferenceResult => {
    this.connection.console.info(`References were requested`);

    const checker = params.program.getTypeChecker();

    const sourceFile = params.sourceFile;

    if (sourceFile) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        sourceFile.tree.rootNode,
        params.position,
      );

      const definitionNode = checker.findDefinition(
        nodeAtPosition,
        sourceFile,
      ).symbol;

      const references = References.find(definitionNode, params.program);

      if (references) {
        return references.map((a) =>
          Location.create(
            a.uri,
            Range.create(
              Position.create(
                a.node.startPosition.row,
                a.node.startPosition.column,
              ),
              Position.create(
                a.node.endPosition.row,
                a.node.endPosition.column,
              ),
            ),
          ),
        );
      }
    }

    return undefined;
  };
}
