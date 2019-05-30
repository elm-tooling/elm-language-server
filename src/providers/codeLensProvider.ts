import { Tree } from "tree-sitter";
import {
  CodeLens,
  CodeLensParams,
  Command,
  IConnection,
  Position,
  Range,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { References } from "../util/references";
import { TreeUtils } from "../util/treeUtils";

type CodeLensType = "exposed" | "referenceCounter";

export class CodeLensProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(
    connection: IConnection,
    forest: IForest,
    private imports: IImports,
  ) {
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
          const functionName = TreeUtils.getFunctionNameNodeFromDefinition(
            node,
          );

          if (functionName) {
            const definitionNode = TreeUtils.findDefinitonNodeByReferencingNode(
              functionName,
              param.textDocument.uri,
              tree,
              this.imports,
            );

            const references = References.find(
              definitionNode,
              this.forest,
              this.imports,
            );

            exposed = TreeUtils.isExposedFunction(tree, functionName.text);
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
                  { codeLensType: "exposed", exposed },
                ),

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
                  {
                    codeLensType: "referenceCounter",
                    referenceNodeCount: references.length,
                  },
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
                  { codeLensType: "exposed", exposed },
                ),

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
                  {
                    codeLensType: "referenceCounter",
                    referenceNodeCount: references.length,
                  },
                ),
              );
            }
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
            const definitionNode = TreeUtils.findDefinitonNodeByReferencingNode(
              typeNode,
              param.textDocument.uri,
              tree,
              this.imports,
            );

            const references = References.find(
              definitionNode,
              this.forest,
              this.imports,
            );

            exposed = TreeUtils.isExposedTypeOrTypeAlias(tree, typeNode.text);

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
                { codeLensType: "exposed", exposed },
              ),

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
                {
                  codeLensType: "referenceCounter",
                  referenceNodeCount: references.length,
                },
              ),
            );
          }
        }
      });
      return codeLens;
    }
  };

  protected handleCodeLensResolveRequest = async (
    param: CodeLens,
  ): Promise<CodeLens> => {
    const codelens = param;
    const data: {
      codeLensType: CodeLensType;
      referenceNodeCount: number;
      exposed: boolean;
    } = codelens.data;
    if (data.codeLensType) {
      switch (data.codeLensType) {
        case "exposed":
          codelens.command = data.exposed
            ? Command.create("exposed", "")
            : Command.create("local", "");

          break;
        case "referenceCounter":
          codelens.command = Command.create(
            data.referenceNodeCount === 1
              ? "1 reference"
              : `${data.referenceNodeCount} references`,
            "",
          );

          break;

        default:
          break;
      }
    }

    return codelens;
  };
}
