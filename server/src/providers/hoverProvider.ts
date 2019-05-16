import { Tree, SyntaxNode } from "tree-sitter";
import {
  Hover,
  IConnection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { HintHelper } from "../util/hintHelper";
import { TreeUtils, NodeType } from "../util/treeUtils";

export class HoverProvider {
  constructor(
    private connection: IConnection,
    private forest: IForest,
    private imports: IImports,
  ) {
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
        let definitionNode = TreeUtils.findUppercaseQidNode(tree, upperCaseQid);

        definitionNode = definitionNode
          ? definitionNode
          : this.getDefinitionFromImport(
              param.textDocument.uri,
              upperCaseQid.text,
              "Type",
            );

        definitionNode = definitionNode
          ? definitionNode
          : this.getDefinitionFromImport(
              param.textDocument.uri,
              upperCaseQid.text,
              "TypeAlias",
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
          const moduleNode = this.getDefinitionFromImport(
            param.textDocument.uri,
            upperCaseQid!.text,
            "Module",
          );

          if (moduleNode) {
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
        let definitionNode = TreeUtils.findLowercaseQidNode(
          tree,
          nodeAtPosition.parent,
        );

        definitionNode = definitionNode
          ? definitionNode
          : this.getDefinitionFromImport(
              param.textDocument.uri,
              nodeAtPosition.parent.text,
              "Function",
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
        let definitionNode = TreeUtils.findOperator(tree, nodeAtPosition.text);

        definitionNode = definitionNode
          ? definitionNode
          : this.getDefinitionFromImport(
              param.textDocument.uri,
              nodeAtPosition.text,
              "Operator",
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

  private getDefinitionFromImport(
    uri: string,
    nodeName: string,
    type: NodeType,
  ) {
    if (this.imports.imports) {
      const allFileImports = this.imports.imports[uri];
      if (allFileImports) {
        const foundNode = allFileImports.find(
          a => a.alias === nodeName && a.type === type,
        );
        if (foundNode) {
          return foundNode.node;
        }
      }
    }
  }
}
