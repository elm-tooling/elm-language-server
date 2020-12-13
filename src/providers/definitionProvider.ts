import { container } from "tsyringe";
import {
  Connection,
  Location,
  LocationLink,
  Position,
  Range,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode } from "web-tree-sitter";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { TreeUtils } from "../util/treeUtils";
import { ITextDocumentPositionParams } from "./paramsExtensions";

export type DefinitionResult =
  | Location
  | Location[]
  | LocationLink[]
  | null
  | undefined;

export class DefinitionProvider {
  private connection: Connection;
  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.connection.onDefinition(
      new ElmWorkspaceMatcher((param: TextDocumentPositionParams) =>
        URI.parse(param.textDocument.uri),
      ).handle(this.handleDefinitionRequest.bind(this)),
    );
  }

  protected handleDefinitionRequest = (
    param: ITextDocumentPositionParams,
  ): DefinitionResult => {
    this.connection.console.info(`A definition was requested`);
    const checker = param.program.getTypeChecker();
    const treeContainer = param.sourceFile;

    if (treeContainer) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        treeContainer.tree.rootNode,
        param.position,
      );

      const definitionNode = checker.findDefinition(
        nodeAtPosition,
        treeContainer,
      );

      if (definitionNode) {
        return this.createLocationFromDefinition(
          definitionNode.node,
          definitionNode.uri,
        );
      }
    }
  };

  private createLocationFromDefinition(
    definitionNode: SyntaxNode | undefined,
    uri: URI,
  ): Location | undefined {
    if (definitionNode) {
      return Location.create(
        uri.toString(),
        Range.create(
          Position.create(
            definitionNode.startPosition.row,
            definitionNode.startPosition.column,
          ),
          Position.create(
            definitionNode.endPosition.row,
            definitionNode.endPosition.column,
          ),
        ),
      );
    }
  }
}
