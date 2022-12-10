import { container } from "tsyringe";
import {
  Hover,
  Connection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { ISymbol } from "../compiler/binder.js";
import { getEmptyTypes } from "../compiler/utils/elmUtils.js";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher.js";
import { HintHelper } from "../util/hintHelper.js";
import { TreeUtils } from "../util/treeUtils.js";
import { DiagnosticsProvider } from "./index.js";
import { ITextDocumentPositionParams } from "./paramsExtensions.js";

type HoverResult = Hover | null | undefined;

export class HoverProvider {
  private connection: Connection;
  private diagnostics: DiagnosticsProvider;

  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.diagnostics = container.resolve(DiagnosticsProvider);
    this.connection.onHover(
      this.diagnostics.interruptDiagnostics(() =>
        new ElmWorkspaceMatcher((params: TextDocumentPositionParams) =>
          URI.parse(params.textDocument.uri),
        ).handle(this.handleHoverRequest.bind(this)),
      ),
    );
  }

  protected handleHoverRequest = (
    params: ITextDocumentPositionParams,
  ): HoverResult => {
    this.connection.console.info(`A hover was requested`);

    const checker = params.program.getTypeChecker();
    const sourceFile = params.sourceFile;

    if (sourceFile) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        sourceFile.tree.rootNode,
        params.position,
      );

      let definitionNode = checker.findDefinition(
        nodeAtPosition,
        sourceFile,
      ).symbol;

      if (definitionNode) {
        if (
          definitionNode.node.type === "function_declaration_left" &&
          definitionNode.node.parent
        ) {
          definitionNode = {
            ...definitionNode,
            node: definitionNode.node.parent,
          };
        }

        const typeString = checker.typeToString(
          checker.findType(definitionNode.node),
          sourceFile,
        );

        return this.createMarkdownHoverFromDefinition(
          definitionNode,
          typeString,
        );
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
    definitionNode: ISymbol | undefined,
    typeString: string,
  ): Hover | undefined {
    if (definitionNode) {
      const value =
        definitionNode.type === "FunctionParameter" ||
          definitionNode.type === "AnonymousFunctionParameter" ||
          definitionNode.type === "CasePattern"
          ? HintHelper.createHintFromFunctionParameter(
            definitionNode.node,
            typeString,
          )
          : HintHelper.createHint(definitionNode.node, typeString);

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
