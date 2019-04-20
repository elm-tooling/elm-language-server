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
      let node = tree.rootNode.namedDescendantForPosition({
        row: param.position.line,
        column: param.position.character,
      });
      this.connection.console.log(node.toString());

      let declaration = tree.rootNode
        .descendantsOfType("function_declaration_left")
        .find(
          a =>
            a.firstNamedChild !== null &&
            a.firstNamedChild.type === "lower_case_identifier" &&
            a.firstNamedChild.text === node.text,
        );

      if (declaration) {
        return Location.create(
          param.textDocument.uri,
          Range.create(
            Position.create(
              declaration.startPosition.row,
              declaration.startPosition.column,
            ),
            Position.create(
              declaration.endPosition.row,
              declaration.endPosition.column,
            ),
          ),
        );
      }
    }

    return undefined;
  };
}
