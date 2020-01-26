import {
  IConnection,
  Position,
  Range,
  RenameParams,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Tree } from "web-tree-sitter";
import { ElmWorkspace } from "../elmWorkspace";
import { Forest } from "../forest";
import { IImports } from "../imports";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { References } from "../util/references";
import { TreeUtils } from "../util/treeUtils";

export class RenameProvider {
  constructor(private connection: IConnection, elmWorkspaces: ElmWorkspace[]) {
    this.connection.onRenameRequest(
      new ElmWorkspaceMatcher(elmWorkspaces, (params: RenameParams) =>
        URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handleRenameRequest),
    );
  }

  protected handleRenameRequest = async (
    params: RenameParams,
    elmWorkspace: ElmWorkspace,
  ): Promise<WorkspaceEdit | null | undefined> => {
    this.connection.console.info(`Renaming was requested`);

    const imports: IImports = elmWorkspace.getImports();
    const forest: Forest = elmWorkspace.getForest();
    const tree: Tree | undefined = forest.getTree(params.textDocument.uri);

    if (tree) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        tree.rootNode,
        params.position,
      );

      const definitionNode = TreeUtils.findDefinitionNodeByReferencingNode(
        nodeAtPosition,
        params.textDocument.uri,
        tree,
        imports,
      );

      if (definitionNode) {
        const refTree = forest.getByUri(definitionNode.uri);
        if (refTree && refTree.writeable) {
          const references = References.find(definitionNode, forest, imports);

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
