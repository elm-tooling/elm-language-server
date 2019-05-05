import { Tree } from "tree-sitter";
import {
  Hover,
  IConnection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { HintHelper } from "../util/hintHelper";
import { TreeUtils } from "../util/treeUtils";

export class HoverProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onHover(this.handleHoverRequest);
  }

  protected handleHoverRequest = (
    param: TextDocumentPositionParams,
  ): Hover | null | undefined => {
    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      const nodeAtPosition = tree.rootNode.namedDescendantForPosition({
        column: param.position.character,
        row: param.position.line,
      });

      const definitionNode = TreeUtils.findDefinitionNode(tree, nodeAtPosition);

      if (definitionNode) {
        const value = HintHelper.createHintFromDefinition(definitionNode);

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

    return undefined;
  };
}
