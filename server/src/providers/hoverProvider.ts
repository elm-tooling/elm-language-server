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

      if (
        nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "upper_case_qid"
      ) {
        const upperCaseQid = nodeAtPosition.parent;
        const definitionNode = TreeUtils.findUppercaseQidNode(
          tree,
          upperCaseQid,
        );

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
        } else {
          const moduleExposing = this.forest.treeIndex.find(
            a => a.moduleName === upperCaseQid!.text,
          );
          if (moduleExposing) {
            const moduleNode = TreeUtils.findModule(moduleExposing.tree);
            const value = HintHelper.createHintFromModule(moduleNode);

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
      } else if (
        nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "value_qid"
      ) {
        const definitionNode = TreeUtils.findLowercaseQidNode(
          tree,
          nodeAtPosition.parent,
        );

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
      } else if (nodeAtPosition.type === "operator_identifier") {
        const definitionNode = TreeUtils.findOperator(
          tree,
          nodeAtPosition.text,
        );
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
    }
  };
}
