import { Tree } from "tree-sitter";
import {
  IConnection,
  Position,
  Range,
  RenameParams,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { References } from "../util/references";
import { TreeUtils } from "../util/treeUtils";

export class RenameProvider {
  constructor(
    private connection: IConnection,
    private forest: IForest,
    private imports: IImports,
  ) {
    this.connection.onRenameRequest(this.handleRenameRequest);
  }

  protected handleRenameRequest = async (
    params: RenameParams,
  ): Promise<WorkspaceEdit | null | undefined> => {
    this.connection.console.info(`Renaming was requested`);
    const tree: Tree | undefined = this.forest.getTree(params.textDocument.uri);

    if (tree) {
      const nodeAtPosition = tree.rootNode.namedDescendantForPosition({
        column: params.position.character,
        row: params.position.line,
      });

      const definitionNode = TreeUtils.findDefinitionNodeByReferencingNode(
        nodeAtPosition,
        params.textDocument.uri,
        tree,
        this.imports,
      );

      if (definitionNode) {
        const refTree = this.forest.getByUri(definitionNode.uri);
        if (refTree && refTree.writable) {
          const references = References.find(
            definitionNode,
            this.forest,
            this.imports,
          );

          if (references) {
            const map: { [uri: string]: TextEdit[] } = {};
            references.forEach(a => {
              if (!map[a.uri]) {
                map[a.uri] = [];
              }

              map[a.uri].push(
                TextEdit.replace(
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
                  params.newName,
                ),
              );
            });

            if (map) {
              return {
                changes: map,
              };
            }
          }
        }
      }
    }

    return undefined;
  };
}
