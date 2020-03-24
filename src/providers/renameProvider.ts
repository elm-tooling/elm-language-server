import {
  IConnection,
  Position,
  PrepareRenameParams,
  Range,
  RenameParams,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { ElmWorkspace } from "../elmWorkspace";
import { Forest } from "../forest";
import { IImports } from "../imports";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { References } from "../util/references";
import { TreeUtils } from "../util/treeUtils";

export class RenameProvider {
  constructor(private connection: IConnection, elmWorkspaces: ElmWorkspace[]) {
    this.connection.onPrepareRename(
      new ElmWorkspaceMatcher(elmWorkspaces, (params: PrepareRenameParams) =>
        URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handlePrepareRenameRequest),
    );

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

    const affectedNodes = this.getRenameAffectedNodes(
      elmWorkspace,
      params.textDocument.uri,
      params.position,
    );

    const map: { [uri: string]: TextEdit[] } = {};
    affectedNodes?.references.forEach((a) => {
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
            Position.create(a.node.endPosition.row, a.node.endPosition.column),
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
  };

  protected handlePrepareRenameRequest = async (
    params: PrepareRenameParams,
    elmWorkspace: ElmWorkspace,
  ): Promise<Range | null> => {
    this.connection.console.info(`Prepare rename was requested`);

    const affectedNodes = this.getRenameAffectedNodes(
      elmWorkspace,
      params.textDocument.uri,
      params.position,
    );

    if (affectedNodes?.references.length) {
      const node = affectedNodes.originalNode;
      return Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      );
    }

    return null;
  };

  private getRenameAffectedNodes(
    elmWorkspace: ElmWorkspace,
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
        imports,
      );

      if (definitionNode) {
        const refTree = forest.getByUri(definitionNode.uri);
        if (refTree && refTree.writeable) {
          return {
            originalNode: nodeAtPosition,
            references: References.find(definitionNode, forest, imports),
          };
        }
      }
    }
  }
}
