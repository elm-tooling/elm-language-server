import { SyntaxNode, Tree } from "tree-sitter";
import {
  CodeLens,
  CodeLensParams,
  Command,
  IConnection,
  Position,
  Range,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { TreeUtils } from "../util/treeUtils";

export class CodeLensProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onCodeLens(this.handleCodeLensRequest);
    this.connection.onCodeLensResolve(this.handleCodeLensResolveRequest);
  }

  protected handleCodeLensRequest = async (
    param: CodeLensParams,
  ): Promise<CodeLens[] | null | undefined> => {
    const codeLens: CodeLens[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      tree.rootNode.children.forEach(node => {
        if (node.type === "value_declaration") {
          let exposed = false;
          const declaration = TreeUtils.findFirstNamedChildOfType(
            "function_declaration_left",
            node,
          );
          if (declaration && declaration.firstNamedChild) {
            const functionName = declaration.firstNamedChild.text;
            exposed = TreeUtils.isExposedFunction(tree, functionName);
          }
          if (
            node.previousNamedSibling &&
            node.previousNamedSibling.type === "type_annotation"
          ) {
            codeLens.push(
              CodeLens.create(
                Range.create(
                  Position.create(
                    node.previousNamedSibling.startPosition.row,
                    node.previousNamedSibling.startPosition.column,
                  ),
                  Position.create(
                    node.previousNamedSibling.endPosition.row,
                    node.previousNamedSibling.endPosition.column,
                  ),
                ),
                exposed,
              ),
            );
          } else {
            codeLens.push(
              CodeLens.create(
                Range.create(
                  Position.create(
                    node.startPosition.row,
                    node.startPosition.column,
                  ),
                  Position.create(
                    node.endPosition.row,
                    node.endPosition.column,
                  ),
                ),
                exposed,
              ),
            );
          }
        } else if (
          node.type === "type_declaration" ||
          node.type === "type_alias_declaration"
        ) {
          let exposed = false;
          const typeNode = TreeUtils.findFirstNamedChildOfType(
            "upper_case_identifier",
            node,
          );
          if (typeNode) {
            exposed = TreeUtils.isExposedType(tree, typeNode.text);

            codeLens.push(
              CodeLens.create(
                Range.create(
                  Position.create(
                    node.startPosition.row,
                    node.startPosition.column,
                  ),
                  Position.create(
                    node.endPosition.row,
                    node.endPosition.column,
                  ),
                ),
                exposed,
              ),
            );
          }
        }
      });
    }

    return codeLens;
  };

  protected handleCodeLensResolveRequest = async (
    param: CodeLens,
  ): Promise<CodeLens> => {
    const codelens = param;
    codelens.command = codelens.data
      ? Command.create("exposed", "")
      : Command.create("local", "");

    return codelens;
  };
}
