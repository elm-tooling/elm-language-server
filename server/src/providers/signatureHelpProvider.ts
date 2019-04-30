import { SyntaxNode, Tree, Point } from "tree-sitter";
import {
  IConnection,
  TextDocumentPositionParams,
  Location,
  LocationLink,
  Range,
  Position,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { HintHelper } from "../util/hintHelper";
import { TreeUtils } from "../util/treeUtils";

export class SignatureHelpProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onSignatureHelp(this.handleSignatureHelpRequest);
  }

  protected handleSignatureHelpRequest = async (
    param: TextDocumentPositionParams,
  ): Promise<SignatureHelp | null | undefined> => {
    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      let node = tree.rootNode.namedDescendantForPosition({
        row: param.position.line,
        column: param.position.character,
      });

      let nameNode = node.descendantsOfType("value_expr");

      if (nameNode.length > 0) {
        const declaration = tree.rootNode
          .descendantsOfType("value_declaration")
          .find(
            a =>
              a.firstNamedChild !== null &&
              a.firstNamedChild.type === "function_declaration_left" &&
              a.firstNamedChild.firstNamedChild !== null &&
              a.firstNamedChild.firstNamedChild.type ===
                "lower_case_identifier" &&
              a.firstNamedChild.firstNamedChild.text === nameNode[0].text,
          );

        if (declaration) {
          let x = HintHelper.createHintFromValueDeclaration(declaration);

          let declarationStart = TreeUtils.findFirstNamedChildOfType(
            "function_declaration_left",
            declaration,
          );
          if (declarationStart) {
            let paramCount = declarationStart.childCount - 1;
            let params: ParameterInformation[] = [];

            for (
              let index = 1;
              index < declarationStart.children.length;
              index++
            ) {
              const element = declarationStart.children[index];

              params.push(ParameterInformation.create(element.text));
            }

            let result = {
              activeParameter: 0,
              activeSignature: 0,
              signatures: [
                SignatureInformation.create(
                  nameNode[0].text,
                  undefined,
                  ...params,
                ),
              ],
            };
            return result;
          }
        }
      }
    }

    return undefined;
  };
}
