import { container } from "tsyringe";
import {
  Hover,
  Connection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode } from "web-tree-sitter";
import { DiagnosticsProvider } from ".";
import { IElmWorkspace } from "../elmWorkspace";
import { getEmptyTypes } from "../util/elmUtils";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { HintHelper } from "../util/hintHelper";
import { NodeType, TreeUtils } from "../util/treeUtils";

type HoverResult = Hover | null | undefined;

export class HoverProvider {
  private connection: Connection;
  private diagnostics: DiagnosticsProvider;

  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.diagnostics = container.resolve(DiagnosticsProvider);
    this.connection.onHover((params) =>
      this.diagnostics.interuptDiagnostics(() =>
        new ElmWorkspaceMatcher((params: TextDocumentPositionParams) =>
          URI.parse(params.textDocument.uri),
        ).handlerForWorkspace(this.handleHoverRequest)(params),
      ),
    );
  }

  protected handleHoverRequest = (
    params: TextDocumentPositionParams,
    elmWorkspace: IElmWorkspace,
  ): HoverResult => {
    this.connection.console.info(`A hover was requested`);

    const forest = elmWorkspace.getForest();
    const checker = elmWorkspace.getTypeChecker();
    const treeContainer = forest.getByUri(params.textDocument.uri);

    if (treeContainer) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        treeContainer.tree.rootNode,
        params.position,
      );

      let definitionNode = checker.findDefinition(
        nodeAtPosition,
        treeContainer,
      );

      if (definitionNode) {
        if (
          definitionNode.nodeType === "Function" &&
          definitionNode.node.parent
        ) {
          definitionNode = {
            node: definitionNode.node.parent,
            uri: definitionNode.uri,
            nodeType: definitionNode.nodeType,
          };
        }

        return this.createMarkdownHoverFromDefinition(definitionNode);
      } else {
        const specialMatch = getEmptyTypes().find(
          (a) => a.name === nodeAtPosition.text,
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
        definitionNode.nodeType === "FunctionParameter" ||
        definitionNode.nodeType === "AnonymousFunctionParameter" ||
        definitionNode.nodeType === "CasePattern"
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
