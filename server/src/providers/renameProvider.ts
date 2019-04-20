import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  TextDocumentPositionParams,
  Location,
  LocationLink,
  Range,
  Position,
  RenameParams,
  WorkspaceEdit,
  TextEdit,
} from "vscode-languageserver";
import { IForest } from "../forest";

export class RenameProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onRenameRequest(this.handleRenameRequest);
  }

  protected handleRenameRequest = async (
    param: RenameParams,
  ): Promise<WorkspaceEdit | null | undefined> => {
    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      let nodeAtPosition = tree.rootNode.namedDescendantForPosition({
        row: param.position.line,
        column: param.position.character,
      });

      if (nodeAtPosition) {
        let references = tree.rootNode
          .descendantsOfType("value_expr")
          .filter(
            a =>
              a.firstNamedChild !== null &&
              a.firstNamedChild.type === "value_qid" &&
              a.firstNamedChild.lastNamedChild !== null &&
              a.firstNamedChild.lastNamedChild.text === nodeAtPosition.text,
          );

        let declaration = tree.rootNode
          .descendantsOfType("function_declaration_left")
          .find(
            a =>
              a.firstNamedChild !== null &&
              a.firstNamedChild.type === "lower_case_identifier" &&
              a.firstNamedChild.text === nodeAtPosition.text,
          );

        if (declaration && declaration.firstNamedChild) {
          references.push(declaration.firstNamedChild);
        }

        let annotation = tree.rootNode
          .descendantsOfType("type_annotation")
          .find(
            a =>
              a.firstNamedChild !== null &&
              a.firstNamedChild.type === "lower_case_identifier" &&
              a.firstNamedChild.text === nodeAtPosition.text,
          );

        if (annotation && annotation.firstNamedChild) {
          references.push(annotation.firstNamedChild);
        }

        if (references) {
          return {
            changes: {
              [param.textDocument.uri]: references.map(a =>
                TextEdit.replace(
                  Range.create(
                    Position.create(
                      a.startPosition.row,
                      a.startPosition.column,
                    ),
                    Position.create(a.endPosition.row, a.endPosition.column),
                  ),
                  param.newName,
                ),
              ),
            },
          };
        }
      }
    }

    return undefined;
  };
}
