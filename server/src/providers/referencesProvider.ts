import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  Location,
  Position,
  Range,
  ReferenceParams,
} from "vscode-languageserver";
import { IForest } from "../forest";

export class ReferencesProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onReferences(this.handleReferencesRequest);
  }

  protected handleReferencesRequest = async (
    params: ReferenceParams,
  ): Promise<Location[] | null | undefined> => {
    const tree: Tree | undefined = this.forest.getTree(params.textDocument.uri);

    if (tree) {
      const nodeAtPosition = tree.rootNode.namedDescendantForPosition({
        column: params.position.character,
        row: params.position.line,
      });

      // let nameNode: SyntaxNode | null = null;
      // if (nodeAtPosition.type === "function_call_expr") {
      //   nameNode = nodeAtPosition.firstNamedChild;
      // } else if (nodeAtPosition.type === "lower_case_identifier") {
      //   nameNode = nodeAtPosition;
      // }

      if (nodeAtPosition) {
        const references = tree.rootNode
          .descendantsOfType("value_expr")
          .filter(
            a =>
              a.firstNamedChild !== null &&
              a.firstNamedChild.type === "value_qid" &&
              a.firstNamedChild.lastNamedChild !== null &&
              a.firstNamedChild.lastNamedChild.text === nodeAtPosition.text,
          );

        const declaration = tree.rootNode
          .descendantsOfType("function_declaration_left")
          .find(
            a =>
              a.firstNamedChild !== null &&
              a.firstNamedChild.type === "lower_case_identifier" &&
              a.firstNamedChild.text === nodeAtPosition.text,
          );

        if (declaration) {
          references.push(declaration);
        }

        if (references) {
          return references.map(a =>
            Location.create(
              params.textDocument.uri,
              Range.create(
                Position.create(a.startPosition.row, a.startPosition.column),
                Position.create(a.endPosition.row, a.endPosition.column),
              ),
            ),
          );
        }
      }
    }

    return undefined;
  };
}
