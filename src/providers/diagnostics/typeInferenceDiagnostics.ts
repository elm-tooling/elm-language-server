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
import { Diagnostics, error } from "../../util/types/diagnostics";

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

    diagnostics.push(...treeContainer.parseDiagnostics);

    const allTopLevelFunctions =
      TreeUtils.findAllTopLevelFunctionDeclarations(treeContainer.tree) ?? [];

    return new Promise((resolve, reject) => {
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
              reject();
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
        () => {
          if (diagnostics.length === 0) {
            console.log();
          }
          resolve(diagnostics);
        },
        reject,
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
        const nodeUri = (<any>diagnostic.data).uri;

        if (nodeUri === treeContainer.uri) {
          diagnostics.push(diagnostic);
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
        diagnostics.push(
          error(
            declaration.firstNamedChild.firstNamedChild,
            Diagnostics.MissingTypeAnnotation,
            typeString,
          ),
        );
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
        switch (diagnostic.code) {
          case "missing_type_annotation":
            {
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
            }
            break;
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
