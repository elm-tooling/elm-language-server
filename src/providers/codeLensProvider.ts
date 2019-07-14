import { SyntaxNode, Tree } from "tree-sitter";
import {
  CodeLens,
  CodeLensParams,
  Command,
  IConnection,
  Location,
  Position,
  Range,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
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
      codeLens.push(...this.getExposingCodeLenses(tree));

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
      exposed: boolean;
    } = codelens.data;
    this.connection.console.info(`A code lens resolve was requested`);
    if (data.codeLensType) {
      switch (data.codeLensType) {
        case "exposed":
          codelens.command = data.exposed
            ? Command.create("exposed", "")
            : Command.create("local", "");

          break;
        case "referenceCounter":
          codelens.command = Command.create(
            data.references.length === 1
              ? "1 reference"
              : `${data.references.length} references`,
            "",
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
    tree: Tree,
    isFunction: boolean,
  ) {
    const exposed = isFunction
      ? TreeUtils.isExposedFunction(tree, nameNode.text)
      : TreeUtils.isExposedTypeOrTypeAlias(tree, nameNode.text);
    return CodeLens.create(
      Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      ),
      { codeLensType: "exposed", exposed },
    );
  }

  private createReferenceCodeLens(
    placementNode: SyntaxNode,
    nameNode: SyntaxNode,
    uri: string,
    tree: Tree,
  ) {
    const definitionNode = TreeUtils.findDefinitionNodeByReferencingNode(
      nameNode,
      uri,
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
            Position.create(a.node.endPosition.row, a.node.endPosition.column),
          ),
        ),
      );
    }

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
        references: refLocations,
      },
    );
  }

  private getExposingCodeLenses(tree: Tree): CodeLens[] {
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
                tree,
                true,
              ),
            );
          } else {
            codeLens.push(
              this.createExposingCodeLens(node, functionName, tree, true),
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
            this.createExposingCodeLens(node, typeNode, tree, false),
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
          codeLens.push(
            this.createReferenceCodeLens(node, typeNode, uri, tree),
          );
        }
      }
    });

    tree.rootNode.descendantsOfType("value_declaration").forEach(node => {
      const functionName = TreeUtils.getFunctionNameNodeFromDefinition(node);

      if (functionName) {
        if (
          node.previousNamedSibling &&
          node.previousNamedSibling.type === "type_annotation"
        ) {
          codeLens.push(
            this.createReferenceCodeLens(
              node.previousNamedSibling,
              functionName,
              uri,
              tree,
            ),
          );
        } else {
          codeLens.push(
            this.createReferenceCodeLens(node, functionName, uri, tree),
          );
        }
      }
    });

    const moduleNameNode = TreeUtils.getModuleNameNode(tree);
    if (moduleNameNode && moduleNameNode.lastChild) {
      codeLens.push(
        this.createReferenceCodeLens(
          moduleNameNode,
          moduleNameNode.lastChild,
          uri,
          tree,
        ),
      );
    }

    return codeLens;
  }
}
