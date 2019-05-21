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
        const refSourceTree = this.forest.getTree(definitionNode.uri);

        if (refSourceTree) {
          switch (definitionNode.nodeType) {
            case "Function":
              const functionNameNode = TreeUtils.getFunctionNameNodeFromDefinition(
                definitionNode.node,
              );
              if (functionNameNode) {
                references.push({
                  node: functionNameNode,
                  uri: definitionNode.uri,
                });

                const functions = TreeUtils.findFunctionCalls(
                  refSourceTree,
                  functionNameNode.text,
                );
                if (functions) {
                  references.push(
                    ...functions.map(a => {
                      return { node: a, uri: definitionNode.uri };
                    }),
                  );
                }

                // if (TreeUtils.isExposedFunction(tree, functionNameNode.text)) {
                //   const moduleNameNode = TreeUtils.getModuleNameNode(tree);
                //   // if (this.imports.imports) {
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
