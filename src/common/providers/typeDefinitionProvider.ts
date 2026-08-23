import { container } from "tsyringe";
import {
  Connection,
  Location,
  Position,
  Range,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Node as SyntaxNode } from "web-tree-sitter";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher.js";
import { TreeUtils } from "../util/treeUtils.js";
import { ITextDocumentPositionParams } from "./paramsExtensions.js";

export class TypeDefinitionProvider {
  private connection: Connection;

  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.connection.onTypeDefinition(
      new ElmWorkspaceMatcher((param: TextDocumentPositionParams) =>
        URI.parse(param.textDocument.uri),
      ).handle(this.handleTypeDefinitionRequest.bind(this)),
    );
  }

  protected handleTypeDefinitionRequest = (
    params: ITextDocumentPositionParams,
  ): Location | undefined => {
    this.connection.console.info(`A type definition was requested`);

    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      params.sourceFile.tree.rootNode,
      params.position,
    );
    const type = params.program.getTypeChecker().findType(nodeAtPosition);
    const namedType =
      type.alias ??
      (type.nodeType === "Union"
        ? { module: type.module, name: type.name }
        : undefined);

    if (!namedType) {
      return;
    }

    const typeSourceFile = params.program.getSourceFileOfImportableModule(
      params.sourceFile,
      namedType.module,
    );
    const definition = typeSourceFile?.symbolLinks
      ?.get(typeSourceFile.tree.rootNode)
      ?.get(
        namedType.name,
        (symbol) => symbol.type === "Type" || symbol.type === "TypeAlias",
      );

    return this.createLocation(definition?.node);
  };

  private createLocation(node: SyntaxNode | undefined): Location | undefined {
    if (!node) {
      return;
    }

    return Location.create(
      node.tree.uri,
      Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      ),
    );
  }
}
