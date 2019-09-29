import {
  CodeLens,
  CodeLensParams,
  Command,
  IConnection,
  Location,
  Position,
  Range,
} from "vscode-languageserver";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { References } from "../util/references";
import { TreeUtils } from "../util/treeUtils";

type CodeLensType = "exposed" | "referenceCounter";

export class CodeLensProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(
    connection: IConnection,
    forest: IForest,
    private imports: IImports,
  ) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onCodeLens(this.handleCodeLensRequest);
    this.connection.onCodeLensResolve(this.handleCodeLensResolveRequest);
  }

  protected handleCodeLensRequest = async (
    param: CodeLensParams,
  ): Promise<CodeLens[] | null | undefined> => {
    this.connection.console.info(
      `A code lens was requested for ${param.textDocument.uri}`,
    );
    const codeLens: CodeLens[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      codeLens.push(
        ...this.getExposingCodeLenses(tree, param.textDocument.uri),
      );

      codeLens.push(
        ...this.getReferencesCodeLenses(tree, param.textDocument.uri),
      );

      return codeLens;
    }
  };

  protected handleCodeLensResolveRequest = async (
    param: CodeLens,
  ): Promise<CodeLens> => {
    const codelens = param;
    const data: {
      codeLensType: CodeLensType;
      references: Location[];
      uri: string;
      nameNode: string;
      isFunction: boolean;
    } = codelens.data;
    this.connection.console.info(`A code lens resolve was requested`);
    const tree = this.forest.getTree(data.uri);
    if (tree && data.codeLensType) {
      switch (data.codeLensType) {
        case "exposed":
          const exposed = data.isFunction
            ? TreeUtils.isExposedFunction(tree, data.nameNode)
            : TreeUtils.isExposedTypeOrTypeAlias(tree, data.nameNode);
          codelens.command = exposed
            ? Command.create("exposed", "")
            : Command.create("local", "");

          break;
        case "referenceCounter":
          const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
            tree.rootNode,
            param.range.start,
          );
          const definitionNode = TreeUtils.findDefinitionNodeByReferencingNode(
            nodeAtPosition,
            data.uri,
            tree,
            this.imports,
          );

          const references = References.find(
            definitionNode,
            this.forest,
            this.imports,
          );

          let refLocations: Location[] = [];
          if (references) {
            refLocations = references.map(a =>
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

          codelens.command = Command.create(
            references.length === 1
              ? "1 reference"
              : `${references.length} references`,
            "editor.action.showReferences",
            {
              range: param.range,
              references: refLocations,
              uri: data.uri,
            },
          );

          break;

        default:
          break;
      }
    }

    return codelens;
  };

  private createExposingCodeLens(
    node: SyntaxNode,
    nameNode: SyntaxNode,
    uri: string,
    isFunction: boolean,
  ) {
    return CodeLens.create(
      Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      ),
      { codeLensType: "exposed", nameNode: nameNode.text, isFunction, uri },
    );
  }

  private createReferenceCodeLens(placementNode: SyntaxNode, uri: string) {
    return CodeLens.create(
      Range.create(
        Position.create(
          placementNode.startPosition.row,
          placementNode.startPosition.column,
        ),
        Position.create(
          placementNode.endPosition.row,
          placementNode.endPosition.column,
        ),
      ),
      {
        codeLensType: "referenceCounter",
        uri,
      },
    );
  }

  private getExposingCodeLenses(tree: Tree, uri: string): CodeLens[] {
    const codeLens: CodeLens[] = [];
    tree.rootNode.children.forEach(node => {
      if (node.type === "value_declaration") {
        const functionName = TreeUtils.getFunctionNameNodeFromDefinition(node);

        if (functionName) {
          if (
            node.previousNamedSibling &&
            node.previousNamedSibling.type === "type_annotation"
          ) {
            codeLens.push(
              this.createExposingCodeLens(
                node.previousNamedSibling,
                functionName,
                uri,
                true,
              ),
            );
          } else {
            codeLens.push(
              this.createExposingCodeLens(node, functionName, uri, true),
            );
          }
        }
      } else if (
        node.type === "type_declaration" ||
        node.type === "type_alias_declaration"
      ) {
        const typeNode = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          node,
        );

        if (typeNode) {
          codeLens.push(
            this.createExposingCodeLens(node, typeNode, uri, false),
          );
        }
      }
    });
    return codeLens;
  }

  private getReferencesCodeLenses(tree: Tree, uri: string) {
    const codeLens: CodeLens[] = [];
    tree.rootNode.children.forEach(node => {
      if (
        node.type === "type_declaration" ||
        node.type === "type_alias_declaration"
      ) {
        const typeNode = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          node,
        );

        if (typeNode) {
          codeLens.push(this.createReferenceCodeLens(node, uri));
        }
      }
    });

    TreeUtils.descendantsOfType(tree.rootNode, "value_declaration").forEach(
      node => {
        const functionName = TreeUtils.getFunctionNameNodeFromDefinition(node);

        if (functionName) {
          if (
            node.previousNamedSibling &&
            node.previousNamedSibling.type === "type_annotation"
          ) {
            codeLens.push(
              this.createReferenceCodeLens(node.previousNamedSibling, uri),
            );
          } else {
            codeLens.push(this.createReferenceCodeLens(node, uri));
          }
        }
      },
    );

    const moduleNameNode = TreeUtils.getModuleNameNode(tree);
    if (moduleNameNode && moduleNameNode.lastChild) {
      codeLens.push(this.createReferenceCodeLens(moduleNameNode, uri));
    }

    return codeLens;
  }
}
