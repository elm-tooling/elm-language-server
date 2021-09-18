import { container } from "tsyringe";
import {
  CodeLens,
  CodeLensParams,
  Command,
  Connection,
  Location,
  Position,
  Range,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IProgram } from "../compiler/program";
import { ISourceFile } from "../compiler/forest";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { References } from "../compiler/references";
import { Settings } from "../util/settings";
import { TreeUtils } from "../util/treeUtils";
import { ICodeLensParams } from "./paramsExtensions";

type CodeLensResult = CodeLens[] | null | undefined;

type ICodeLens = IReferenceCodeLens | IExposedCodeLens;

interface IReferenceCodeLens extends CodeLens {
  data: {
    codeLensType: "referenceCounter";
    uri: string;
  };
}

interface IExposedCodeLens extends CodeLens {
  data: {
    codeLensType: "exposed";
    uri: string;
    nameNode: string;
    isFunctionOrPort: boolean;
  };
}

export class CodeLensProvider {
  private readonly connection: Connection;
  private readonly settings: Settings;

  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.settings = container.resolve(Settings);
    this.connection.onCodeLens(
      new ElmWorkspaceMatcher((param: CodeLensParams) =>
        URI.parse(param.textDocument.uri),
      ).handle(this.handleCodeLensRequest),
    );
    this.connection.onCodeLensResolve((params) =>
      new ElmWorkspaceMatcher((param: ICodeLens) =>
        URI.parse(param.data.uri),
      ).handleResolve(this.handleCodeLensResolveRequest)(params as ICodeLens),
    );
  }

  protected handleCodeLensRequest = (
    param: ICodeLensParams,
  ): CodeLensResult => {
    this.connection.console.info(
      `A code lens was requested for ${param.textDocument.uri}`,
    );
    const codeLens: ICodeLens[] = [];

    const tree: Tree = param.sourceFile.tree;

    codeLens.push(...this.getExposingCodeLenses(tree, param.textDocument.uri));

    codeLens.push(
      ...this.getReferencesCodeLenses(tree, param.textDocument.uri),
    );

    return codeLens;
  };

  protected handleCodeLensResolveRequest = (
    codelens: ICodeLens,
    program: IProgram,
    sourceFile: ISourceFile,
  ): ICodeLens => {
    const data = codelens.data;
    this.connection.console.info(
      `A code lens resolve was requested for ${data.uri}`,
    );
    const checker = program.getTypeChecker();
    if (sourceFile) {
      const tree = sourceFile.tree;

      switch (data.codeLensType) {
        case "exposed": {
          const exposed = data.isFunctionOrPort
            ? TreeUtils.isExposedFunctionOrPort(tree, data.nameNode)
            : TreeUtils.isExposedTypeOrTypeAlias(tree, data.nameNode);
          codelens.command = this.settings.extendedCapabilities
            ?.exposeUnexposeSupport
            ? exposed
              ? Command.create(
                  "exposed",
                  "elm.unexpose-" + program.getRootPath().toString(),
                  {
                    uri: data.uri,
                    name: data.nameNode,
                  },
                )
              : Command.create(
                  "local",
                  "elm.expose-" + program.getRootPath().toString(),
                  {
                    uri: data.uri,
                    name: data.nameNode,
                  },
                )
            : exposed
            ? Command.create("exposed", "")
            : Command.create("local", "");

          break;
        }
        case "referenceCounter": {
          const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
            tree.rootNode,
            codelens.range.start,
          );
          const definitionNode = checker.findDefinition(
            nodeAtPosition,
            sourceFile,
          ).symbol;

          const references = References.find(definitionNode, program);

          let refLocations: Location[] = [];
          if (references) {
            refLocations = references.map((a) =>
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
              range: codelens.range,
              references: refLocations,
              uri: data.uri,
            },
          );

          break;
        }

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
    isFunctionOrPort: boolean,
  ): ICodeLens {
    return {
      range: Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      ),
      data: {
        codeLensType: "exposed",
        nameNode: nameNode.text,
        isFunctionOrPort,
        uri,
      },
    };
  }

  private createReferenceCodeLens(
    placementNode: SyntaxNode,
    uri: string,
  ): ICodeLens {
    return {
      range: Range.create(
        Position.create(
          placementNode.startPosition.row,
          placementNode.startPosition.column,
        ),
        Position.create(
          placementNode.endPosition.row,
          placementNode.endPosition.column,
        ),
      ),
      data: {
        codeLensType: "referenceCounter",
        uri,
      },
    };
  }

  private getExposingCodeLenses(tree: Tree, uri: string): ICodeLens[] {
    const codeLens: ICodeLens[] = [];
    tree.rootNode.children.forEach((node) => {
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
      } else if (node.type === "port_annotation") {
        const typeNode = TreeUtils.findFirstNamedChildOfType(
          "lower_case_identifier",
          node,
        );

        if (typeNode) {
          codeLens.push(this.createExposingCodeLens(node, typeNode, uri, true));
        }
      }
    });
    return codeLens;
  }

  private getReferencesCodeLenses(tree: Tree, uri: string): ICodeLens[] {
    const codeLens: ICodeLens[] = [];
    tree.rootNode.children.forEach((node) => {
      if (
        node.type === "type_declaration" ||
        node.type === "type_alias_declaration"
      ) {
        const typeNode = node.childForFieldName("name");

        if (typeNode) {
          codeLens.push(this.createReferenceCodeLens(typeNode, uri));
        }
      }

      if (node.type === "port_annotation") {
        const portNameNode = TreeUtils.findFirstNamedChildOfType(
          "lower_case_identifier",
          node,
        );
        if (portNameNode) {
          codeLens.push(this.createReferenceCodeLens(portNameNode, uri));
        }
      }
    });

    TreeUtils.descendantsOfType(tree.rootNode, "value_declaration")
      .filter(
        (valueDeclaration) => !valueDeclaration.childForFieldName("pattern"),
      )
      .forEach((node) => {
        codeLens.push(
          this.createReferenceCodeLens(
            node.previousNamedSibling?.type === "type_annotation"
              ? node.previousNamedSibling
              : node,
            uri,
          ),
        );
      });

    const moduleNameNode = TreeUtils.getModuleNameNode(tree);
    if (moduleNameNode && moduleNameNode.lastChild) {
      codeLens.push(this.createReferenceCodeLens(moduleNameNode, uri));
    }

    return codeLens;
  }
}
