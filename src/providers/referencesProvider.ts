import {
  IConnection,
  Location,
  Position,
  Range,
  ReferenceParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Tree } from "web-tree-sitter";
import { ElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { References } from "../util/references";
import { TreeUtils } from "../util/treeUtils";

type ReferenceResult = Location[] | null | undefined;

export class ReferencesProvider {
  constructor(private connection: IConnection, elmWorkspaces: ElmWorkspace[]) {
    this.connection.onReferences(
      new ElmWorkspaceMatcher(elmWorkspaces, (param: ReferenceParams) =>
        URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.handleReferencesRequest),
    );
  }

  protected handleReferencesRequest = async (
    params: ReferenceParams,
    elmWorkspace: ElmWorkspace,
  ): Promise<ReferenceResult> => {
    this.connection.console.info(`References were requested`);

    const imports = elmWorkspace.getImports();
    const forest = elmWorkspace.getForest();

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

      const references = References.find(definitionNode, forest, imports);

      if (references) {
        return references.map((a) =>
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
