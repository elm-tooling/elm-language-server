import { container } from "tsyringe";
import {
  IConnection,
  Location,
  LocationLink,
  Position,
  Range,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { TreeUtils } from "../util/treeUtils";

export type DefinitionResult =
  | Location
  | Location[]
  | LocationLink[]
  | null
  | undefined;

export class DefinitionProvider {
  private connection: IConnection;
  constructor() {
    const elmWorkspaces = container.resolve<IElmWorkspace[]>("ElmWorkspaces");
    this.connection = container.resolve<IConnection>("Connection");
    this.connection.onDefinition(
      new ElmWorkspaceMatcher(
        elmWorkspaces,
        (param: TextDocumentPositionParams) =>
          URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.handleDefinitionRequest),
    );
  }

  protected handleDefinitionRequest = (
    param: TextDocumentPositionParams,
    elmWorkspace: IElmWorkspace,
  ): DefinitionResult => {
    this.connection.console.info(`A definition was requested`);
    const forest = elmWorkspace.getForest();
    const tree: Tree | undefined = forest.getTree(param.textDocument.uri);

    if (tree) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        tree.rootNode,
        param.position,
      );

      const definitionNode = TreeUtils.findDefinitionNodeByReferencingNode(
        nodeAtPosition,
        param.textDocument.uri,
        tree,
        elmWorkspace.getImports(),
        forest,
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
    uri: string,
  ): Location | undefined {
    if (definitionNode) {
      return Location.create(
        uri,
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
