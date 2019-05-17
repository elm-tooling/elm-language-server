import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  Location,
  LocationLink,
  Position,
  Range,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { NodeType, TreeUtils } from "../util/treeUtils";

export class DefinitionProvider {
  constructor(
    private connection: IConnection,
    private forest: IForest,
    private imports: IImports,
  ) {
    this.connection.onDefinition(this.handleDefinitionRequest);
  }

  protected handleDefinitionRequest = async (
    param: TextDocumentPositionParams,
  ): Promise<Location | Location[] | LocationLink[] | null | undefined> => {
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

        let definitionFromOtherFile;
        if (!definitionNode) {
          definitionFromOtherFile = this.findImportFromFile(
            param.textDocument.uri,
            upperCaseQid.text,
            "Type",
          );

          definitionFromOtherFile = definitionFromOtherFile
            ? definitionFromOtherFile
            : this.findImportFromFile(
                param.textDocument.uri,
                upperCaseQid.text,
                "TypeAlias",
              );

          definitionFromOtherFile = definitionFromOtherFile
            ? definitionFromOtherFile
            : this.findImportFromFile(
                param.textDocument.uri,
                upperCaseQid.text,
                "Module",
              );
          if (definitionFromOtherFile) {
            return this.createLocationFromDefinition(
              definitionFromOtherFile.node,
              definitionFromOtherFile.uri,
            );
          }
        }
        return this.createLocationFromDefinition(
          definitionNode,
          param.textDocument.uri,
        );
      } else if (
        nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "value_qid"
      ) {
        const definitionNode = TreeUtils.findLowercaseQidNode(
          tree,
          nodeAtPosition.parent,
        );

        if (!definitionNode) {
          const definitionFromOtherFile = this.findImportFromFile(
            param.textDocument.uri,
            nodeAtPosition.parent.text,
            "Function",
          );

          if (definitionFromOtherFile) {
            return this.createLocationFromDefinition(
              definitionFromOtherFile.node,
              definitionFromOtherFile.uri,
            );
          }
        }

        return this.createLocationFromDefinition(
          definitionNode,
          param.textDocument.uri,
        );
      } else if (nodeAtPosition.type === "operator_identifier") {
        const definitionNode = TreeUtils.findOperator(
          tree,
          nodeAtPosition.text,
        );

        if (!definitionNode) {
          const definitionFromOtherFile = this.findImportFromFile(
            param.textDocument.uri,
            nodeAtPosition.text,
            "Operator",
          );

          if (definitionFromOtherFile) {
            return this.createLocationFromDefinition(
              definitionFromOtherFile.node,
              definitionFromOtherFile.uri,
            );
          }
        }

        return this.createLocationFromDefinition(
          definitionNode,
          param.textDocument.uri,
        );
      }

      return undefined;
    }
  };

  private createLocationFromDefinition(
    definitionNode: SyntaxNode | undefined,
    uri: string,
  ): Location | undefined {
    if (definitionNode) {
      return Location.create(
        uri,
        Range.create(
          Position.create(
            definitionNode.startPosition.row,
            definitionNode.startPosition.column,
          ),
          Position.create(
            definitionNode.endPosition.row,
            definitionNode.endPosition.column,
          ),
        ),
      );
    }
  }

  private findImportFromFile(uri: string, nodeName: string, type: NodeType) {
    if (this.imports.imports) {
      const allFileImports = this.imports.imports[uri];
      if (allFileImports) {
        const foundNode = allFileImports.find(
          a => a.alias === nodeName && a.type === type,
        );
        if (foundNode) {
          return foundNode;
        }
      }
    }
  }
}
