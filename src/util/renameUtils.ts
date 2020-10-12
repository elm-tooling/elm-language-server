import { IElmWorkspace } from "src/elmWorkspace";
import { Forest } from "src/forest";
import { IImports } from "src/imports";
import { Position, ResponseError } from "vscode-languageserver";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { References } from "./references";
import { TreeUtils } from "./treeUtils";

export class RenameUtils {
  static getRenameAffectedNodes(
    elmWorkspace: IElmWorkspace,
    uri: string,
    position: Position,
  ):
    | {
        originalNode: SyntaxNode;
        references: {
          node: SyntaxNode;
          uri: string;
        }[];
      }
    | undefined {
    const imports: IImports = elmWorkspace.getImports();
    const forest: Forest = elmWorkspace.getForest();
    const tree: Tree | undefined = forest.getTree(uri);

    if (tree) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        tree.rootNode,
        position,
      );

      const definitionNode = TreeUtils.findDefinitionNodeByReferencingNode(
        nodeAtPosition,
        uri,
        tree,
        elmWorkspace,
      );

      if (definitionNode) {
        const refTree = forest.getByUri(definitionNode.uri);
        if (refTree && refTree.writeable) {
          return {
            originalNode: nodeAtPosition,
            references: References.find(definitionNode, elmWorkspace),
          };
        }
        if (refTree && !refTree.writeable) {
          throw new ResponseError(
            1,
            "Can not rename, due to source being outside of you project.",
          );
        }
      }
    }
  }
}
