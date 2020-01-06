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
import { ElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { TreeUtils } from "../util/treeUtils";

type DefinitionResult =
  | Location
  | Location[]
  | LocationLink[]
  | null
  | undefined;

export class DefinitionProvider {
  constructor(private connection: IConnection, elmWorkspaces: ElmWorkspace[]) {
    this.connection.onDefinition(
      new ElmWorkspaceMatcher(
        elmWorkspaces,
        (param: TextDocumentPositionParams) =>
          URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.handleDefinitionRequest),
    );
  }

  protected handleDefinitionRequest = async (
    param: TextDocumentPositionParams,
    elmWorkspace: ElmWorkspace,
    // tslint:disable-next-line: max-union-size
  ): Promise<DefinitionResult> => {
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
