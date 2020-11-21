/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  CancellationToken,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { PositionUtil } from "../../positionUtil";
import { TreeUtils } from "../../util/treeUtils";
import { URI } from "vscode-uri";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { mapSyntaxNodeToExpression } from "../../util/types/expressionTree";
import { MultistepOperation } from "../../util/multistepOperation";
import { TypeChecker } from "../../util/types/typeChecker";
import { ITreeContainer } from "../../forest";
import { IElmWorkspace } from "../../elmWorkspace";
import {
  ICancellationToken,
  ThrottledCancellationToken,
} from "../../cancellation";
import { container } from "tsyringe";

export class TypeInferenceDiagnostics {
  TYPE_INFERENCE = "Type Inference";

  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;
  private changeSeq = 0;

  private operation: MultistepOperation;

  constructor() {
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
    this.operation = new MultistepOperation(container.resolve("Connection"));
  }

  public change(): void {
    this.changeSeq++;
  }

  public getDiagnosticsForFile(
    treeContainer: ITreeContainer,
    elmWorkspace: IElmWorkspace,
    cancellationToken: CancellationToken,
  ): Promise<Diagnostic[]> {
    const checker = elmWorkspace.getTypeChecker();

    const diagnostics: Diagnostic[] = [];

    const allTopLevelFunctions =
      TreeUtils.findAllTopLevelFunctionDeclarations(treeContainer.tree) ?? [];

    return new Promise((resolve) => {
      this.operation.startNew(
        cancellationToken,
        (next) => {
          const seq = this.changeSeq;

          let index = 0;
          const goNext = (): void => {
            index++;
            if (allTopLevelFunctions.length > index) {
              next.immediate(checkOne);
            }
          };

          const checkOne = (): void => {
            if (this.changeSeq !== seq) {
              return;
            }

            diagnostics.push(
              ...this.getDiagnosticsForDeclaration(
                checker,
                allTopLevelFunctions[index],
                treeContainer,
                new ThrottledCancellationToken(cancellationToken),
              ),
            );

            goNext();
          };

          if (allTopLevelFunctions.length > 0 && this.changeSeq === seq) {
            next.immediate(checkOne);
          }
        },
        () => resolve(diagnostics),
      );
    });
  }

  public getDiagnosticsForDeclaration(
    checker: TypeChecker,
    declaration: SyntaxNode,
    treeContainer: ITreeContainer,
    cancellationToken: ICancellationToken,
  ): Diagnostic[] {
    const valueDeclaration = mapSyntaxNodeToExpression(declaration);
    if (valueDeclaration?.nodeType !== "ValueDeclaration") {
      return [];
    }

    const diagnostics: Diagnostic[] = [];

    checker
      .getDiagnosticsFromDeclaration(valueDeclaration, cancellationToken)
      .forEach((diagnostic) => {
        const nodeUri = diagnostic.node.tree.uri;

        if (nodeUri === treeContainer.uri) {
          diagnostics.push({
            range: {
              start: this.getNodeRange(diagnostic.node).start,
              end: this.getNodeRange(diagnostic.endNode).end,
            },
            message: diagnostic.message,
            severity: DiagnosticSeverity.Error,
            source: this.TYPE_INFERENCE,
          });
        }
      });

    if (!valueDeclaration.typeAnnotation) {
      const typeString: string = checker.typeToString(
        checker.findType(declaration),
        treeContainer,
      );

      if (
        typeString &&
        typeString !== "unknown" &&
        declaration.firstNamedChild?.firstNamedChild
      ) {
        diagnostics.push({
          range: this.getNodeRange(declaration.firstNamedChild.firstNamedChild),
          message: `Missing type annotation: \`${typeString}\``,
          severity: DiagnosticSeverity.Information,
          source: this.TYPE_INFERENCE,
        });
      }
    }

    return diagnostics;
  }

  public onCodeAction(params: CodeActionParams): CodeAction[] {
    const { uri } = params.textDocument;
    const typeInferenceDiagnostics: Diagnostic[] = this.filterTypeInferenceDiagnostics(
      params.context.diagnostics,
    );

    return this.convertDiagnosticsToCodeActions(typeInferenceDiagnostics, uri);
  }

  private filterTypeInferenceDiagnostics(
    diagnostics: Diagnostic[],
  ): Diagnostic[] {
    return diagnostics.filter(
      (diagnostic) => diagnostic.source === this.TYPE_INFERENCE,
    );
  }

  private convertDiagnosticsToCodeActions(
    diagnostics: Diagnostic[],
    uri: string,
  ): CodeAction[] {
    const result: CodeAction[] = [];

    const elmWorkspace = this.elmWorkspaceMatcher.getElmWorkspaceFor(
      URI.parse(uri),
    );

    const forest = elmWorkspace.getForest();
    const treeContainer = forest.getByUri(uri);
    const checker = elmWorkspace.getTypeChecker();

    if (treeContainer) {
      diagnostics.forEach((diagnostic) => {
        const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
          treeContainer.tree.rootNode,
          diagnostic.range.start,
        );

        if (nodeAtPosition.parent) {
          const typeString: string = checker.typeToString(
            checker.findType(nodeAtPosition.parent),
            treeContainer,
          );

          result.push(
            this.insertQuickFixAtStart(
              uri,
              `${nodeAtPosition.text} : ${typeString}\n`,
              diagnostic,
              "Add inferred annotation",
            ),
          );
        }
      });
    }
    return result;
  }

  private insertQuickFixAtStart(
    uri: string,
    replaceWith: string,
    diagnostic: Diagnostic,
    title: string,
  ): CodeAction {
    const map: {
      [uri: string]: TextEdit[];
    } = {};
    if (!map[uri]) {
      map[uri] = [];
    }
    map[uri].push(TextEdit.insert(diagnostic.range.start, replaceWith));
    return {
      diagnostics: [diagnostic],
      edit: { changes: map },
      kind: CodeActionKind.QuickFix,
      title,
    };
  }

  private getNodeRange(node: SyntaxNode): Range {
    const end = PositionUtil.FROM_TS_POSITION(node.endPosition).toVSPosition();
    return {
      start: PositionUtil.FROM_TS_POSITION(node.startPosition).toVSPosition(),
      end: {
        ...end,
        character: end.character,
      },
    };
  }
}
