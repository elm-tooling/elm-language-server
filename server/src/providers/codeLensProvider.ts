import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  LocationLink,
  Range,
  Position,
  CodeLensParams,
  CodeLens,
  Command,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { treeUtils } from "../treeUtils";

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
          let declaration = treeUtils.findFirstNamedChildOfType(
            "function_declaration_left",
            node,
          );
          if (declaration && declaration.firstNamedChild) {
            let functionName = declaration.firstNamedChild.text;

            let module = treeUtils.findFirstNamedChildOfType(
              "module_declaration",
              tree.rootNode,
            );
            if (module) {
              let descendants = module.descendantsOfType("exposed_value");
              exposed = descendants.some(desc => desc.text === functionName);
            }
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
        }
      });
    }

    return codeLens;
  };

  protected handleCodeLensResolveRequest = async (
    param: CodeLens,
  ): Promise<CodeLens> => {
    let codelens = param;
    codelens.command = codelens.data
      ? Command.create("exposed", "")
      : Command.create("local", "elm-lsp.toggleExposed");

    return codelens;
  };
}
