import { SyntaxNode, Tree } from "tree-sitter";
import {
  Hover,
  IConnection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { getEmptyTypes } from "../util/elmUtils";
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
    this.connection.console.info(`A hover was requested`);
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
        return this.createMarkdownHoverFromDefinition(definitionNode);
      } else {
        const specialMatch = getEmptyTypes().find(
          a => a.name === nodeAtPosition.text,
        );
        if (specialMatch) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: specialMatch.markdown,
            },
          };
        }
      }
    }
  };

  private createMarkdownHoverFromDefinition(
    definitionNode:
      | { node: SyntaxNode; uri: string; nodeType: NodeType }
      | undefined,
  ): Hover | undefined {
    if (definitionNode) {
      const value =
        definitionNode.nodeType === "FunctionParameter"
          ? HintHelper.createHintFromFunctionParameter(definitionNode.node)
          : HintHelper.createHint(definitionNode.node);

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
