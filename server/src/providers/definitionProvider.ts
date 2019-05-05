import { SyntaxNode, Tree, Point } from "tree-sitter";
import {
  IConnection,
  TextDocumentPositionParams,
  Location,
  LocationLink,
  Range,
  Position,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { TreeUtils } from "../util/treeUtils";

export class DefinitionProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onDefinition(this.handleDefinitionRequest);
  }

  protected handleDefinitionRequest = async (
    param: TextDocumentPositionParams,
  ): Promise<Location | Location[] | LocationLink[] | null | undefined> => {
    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      const nodeAtPosition = tree.rootNode.namedDescendantForPosition({
        column: param.position.character,
        row: param.position.line,
      });

      const definitionNode = TreeUtils.findDefinitionNode(tree, nodeAtPosition);

      if (definitionNode) {
        return Location.create(
          param.textDocument.uri,
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

    return undefined;
  };
}
