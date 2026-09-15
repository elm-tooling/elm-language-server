import { container } from "tsyringe";
import {
  Hover,
  Connection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { DiagnosticsProvider } from "./index.js";
import { ISymbol } from "../../compiler/binder.js";
import { getEmptyTypes } from "../../compiler/utils/elmUtils.js";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher.js";
import { HintHelper } from "../util/hintHelper.js";
import { TreeUtils } from "../util/treeUtils.js";
import { Settings } from "../util/settings.js";
import { findTypeDefinition } from "../util/typeDefinition.js";
import { ITextDocumentPositionParams } from "./paramsExtensions.js";

export type HoverResult = Hover | null | undefined;

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

        const isParameter =
          definitionNode.type === "FunctionParameter" ||
          definitionNode.type === "AnonymousFunctionParameter" ||
          definitionNode.type === "CasePattern";
        const typeDefinition =
          isParameter &&
          container.resolve<Settings>("Settings").isHoverMarkdownSupported()
            ? findTypeDefinition(
                checker.findType(nodeAtPosition),
                sourceFile,
                params.program,
              )
            : undefined;

        return this.createMarkdownHoverFromDefinition(
          definitionNode,
          typeString,
          typeDefinition,
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
    typeDefinition?: ISymbol,
  ): Hover | undefined {
    if (definitionNode) {
      let value =
        definitionNode.type === "FunctionParameter" ||
        definitionNode.type === "AnonymousFunctionParameter" ||
        definitionNode.type === "CasePattern"
          ? HintHelper.createHintFromFunctionParameter(
              definitionNode.node,
              typeString,
            )
          : HintHelper.createHint(definitionNode.node, typeString);

      if (value) {
        if (typeDefinition) {
          const node = typeDefinition.node;
          // Document URI links need no editor-specific command. The one-based
          // line fragment is a client convention, not an LSP guarantee.
          const uri = URI.parse(node.tree.uri)
            .with({ fragment: `L${node.startPosition.row + 1}` })
            .toString();
          value += `\n\n[Go to ${typeDefinition.name}](<${uri}>)`;
        }
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
