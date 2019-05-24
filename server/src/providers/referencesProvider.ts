import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  Location,
  Position,
  Range,
  ReferenceParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { TreeUtils } from "../util/treeUtils";

export class ReferencesProvider {
  constructor(
    private connection: IConnection,
    private forest: IForest,
    private imports: IImports,
  ) {
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

      const references: Array<{ node: SyntaxNode; uri: string }> = [];

      const definitionNode = TreeUtils.findDefinitonNodeByReferencingNode(
        nodeAtPosition,
        params.textDocument.uri,
        tree,
        this.imports,
      );

      if (definitionNode) {
        const refSourceTree = this.forest.getByUri(definitionNode.uri);

        if (refSourceTree) {
          switch (definitionNode.nodeType) {
            case "Function":
              const functionNameNode = TreeUtils.getFunctionNameNodeFromDefinition(
                definitionNode.node,
              );
              if (functionNameNode) {
                if (refSourceTree.writeable) {
                  references.push({
                    node: functionNameNode,
                    uri: definitionNode.uri,
                  });
                }

                const localFunctions = TreeUtils.findFunctionCalls(
                  refSourceTree.tree,
                  functionNameNode.text,
                );
                if (localFunctions && refSourceTree.writeable) {
                  references.push(
                    ...localFunctions.map(node => {
                      return { node, uri: definitionNode.uri };
                    }),
                  );
                }

                if (
                  TreeUtils.isExposedFunction(
                    refSourceTree.tree,
                    functionNameNode.text,
                  )
                ) {
                  const moduleNameNode = TreeUtils.getModuleNameNode(
                    refSourceTree.tree,
                  );
                  if (moduleNameNode) {
                    for (const uri in this.imports.imports) {
                      if (this.imports.imports.hasOwnProperty(uri)) {
                        const element = this.imports.imports[uri];
                        const needsToBeChecked = element.filter(
                          a =>
                            a.fromModuleName === moduleNameNode.text &&
                            a.type === "Function" &&
                            (a.alias.endsWith("." + functionNameNode.text) ||
                              a.alias === functionNameNode.text),
                        );
                        if (needsToBeChecked.length > 0) {
                          const treeToCheck = this.forest.getByUri(uri);

                          if (treeToCheck) {
                            needsToBeChecked.forEach(a => {
                              const functions = TreeUtils.findFunctionCalls(
                                treeToCheck.tree,
                                a.alias,
                              );
                              if (functions && treeToCheck.writeable) {
                                references.push(
                                  ...functions.map(node => {
                                    return { node, uri };
                                  }),
                                );
                              }
                            });
                          }
                        }
                      }
                    }
                  }
                }
                // if (this.imports.imports) {
              }

              break;

            default:
              break;
          }
        }
      }

      if (references) {
        return references.map(a =>
          Location.create(
            a.uri,
            Range.create(
              Position.create(
                a.node.startPosition.row,
                a.node.startPosition.column,
              ),
              Position.create(
                a.node.endPosition.row,
                a.node.endPosition.column,
              ),
            ),
          ),
        );
      }
    }

    return undefined;
  };
}
