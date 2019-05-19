import { SyntaxNode, Tree } from "tree-sitter";
import {
  Hover,
  IConnection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { HintHelper } from "../util/hintHelper";
import { NodeType, TreeUtils } from "../util/treeUtils";

export class HoverProvider {
  constructor(
    private connection: IConnection,
    private forest: IForest,
    private imports: IImports,
  ) {
    this.connection.onHover(this.handleHoverRequest);
  }

  protected handleHoverRequest = (
    params: TextDocumentPositionParams,
  ): Hover | null | undefined => {
    const tree: Tree | undefined = this.forest.getTree(params.textDocument.uri);

    if (tree) {
      const nodeAtPosition = tree.rootNode.namedDescendantForPosition({
        column: params.position.character,
        row: params.position.line,
      });

      const definitionNode = TreeUtils.findDefinitonNodeByReferencingNode(
        nodeAtPosition,
        params.textDocument.uri,
        tree,
        this.imports,
      );

      if (definitionNode) {
        return this.createMarkdownHoverFromDefinition(definitionNode.node);
      }
    }
  };

  private createMarkdownHoverFromDefinition(
    definitionNode: SyntaxNode | undefined,
  ): Hover | undefined {
    if (definitionNode) {
      const value = HintHelper.createHint(definitionNode);

      if (value) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value,
          },
        };
      }
    }
  }
}
