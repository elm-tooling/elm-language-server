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
import { References } from "../util/references";
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
    this.connection.console.info(`References were requested`);
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

      const references = References.find(
        definitionNode,
        this.forest,
        this.imports,
      );

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
