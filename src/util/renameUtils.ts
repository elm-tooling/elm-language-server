import { IElmWorkspace } from "../elmWorkspace";
import { Position, ResponseError } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { References } from "./references";
import { TreeUtils } from "./treeUtils";
import { URI } from "vscode-uri";

export class RenameUtils {
  static getRenameAffectedNodes(
    elmWorkspace: IElmWorkspace,
    uri: URI,
    position: Position,
  ):
    | {
        originalNode: SyntaxNode;
        references: {
          node: SyntaxNode;
          uri: URI;
        }[];
      }
    | undefined {
    const forest = elmWorkspace.getForest();
    const checker = elmWorkspace.getTypeChecker();
    const treeContainer = forest.getByUri(uri);

    if (treeContainer) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        treeContainer.tree.rootNode,
        position,
      );

      const definitionNode = checker.findDefinition(
        nodeAtPosition,
        treeContainer,
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
